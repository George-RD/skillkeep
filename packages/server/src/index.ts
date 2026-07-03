import * as path from "node:path";
import { dataDir, openDb } from "@skillkeep/core";
import type { ClientId } from "@skillkeep/usage";
import type { Server } from "bun";
import { ensureToken } from "./auth";
import { emit } from "./events";
import { bindServer } from "./port";
import { createRouter } from "./routes";
import { runUsageIngest } from "./usage-ingest";

export { type PullResult, type PushResult, pullFromHub, pushToHub } from "./hub-link";
export { DaemonAlreadyRunningError, DEFAULT_PORT } from "./port";
export type { ManifestEntry } from "./registry-sync";

const VERSION = "0.1.0";
const USAGE_RESCAN_INTERVAL_MS = 5 * 60 * 1000;

/** Outcome of `startServer`: the running Bun server, its bearer token, and the port it bound to. */
export interface StartedServer {
  server: Server<undefined>;
  token: string;
  port: number;
}

/**
 * Read the hub bearer token from `SKILLKEEP_TOKEN`. Hub tokens are operator-supplied and never
 * written to disk (unlike agent mode's generated token). Throws if the env var is unset or empty —
 * the CLI catches this, prints the message, and `process.exit(1)`s before binding anything.
 */
export function requireHubToken(env: Record<string, string | undefined> = process.env): string {
  const token = env.SKILLKEEP_TOKEN;
  if (token === undefined || token.trim() === "") {
    throw new Error("SKILLKEEP_TOKEN is required in hub mode");
  }
  return token.trim();
}

/**
 * Start the skillkeep daemon. Opens (or creates) the SQLite state store, resolves the bearer token,
 * and binds the HTTP API — falling back to an ephemeral port (and recording it at
 * `<dataDir>/daemon.port`) when the requested port is held by something other than a healthy
 * skillkeep, or throwing `DaemonAlreadyRunningError` when it IS a healthy skillkeep already.
 *
 * In **agent mode** (default): generates/persists a random token to disk, binds `127.0.0.1`, and
 * kicks off periodic usage ingestion (one immediate pass on boot, then every
 * {@link USAGE_RESCAN_INTERVAL_MS}). `usageRoots` overrides client roots for tests only.
 *
 * In **hub mode**: reads `SKILLKEEP_TOKEN` from the env (operator-supplied, never persisted), binds
 * `0.0.0.0` (so Railway's proxy can reach it), and runs no usage-ingest scheduler — the hub receives
 * usage via `POST /api/v1/ingest` from agents, never scanning a local filesystem.
 */
export async function startServer(opts: {
  mode: "agent" | "hub";
  port?: number;
  dataDir?: string;
  usageRoots?: Partial<Record<ClientId, string>>;
}): Promise<StartedServer> {
  const resolvedDataDir = opts.dataDir ?? dataDir();
  const db = openDb(path.join(resolvedDataDir, "skillkeep.db"));

  const token = opts.mode === "hub" ? requireHubToken() : await ensureToken(resolvedDataDir);

  const router = createRouter({
    db,
    token,
    dataDir: resolvedDataDir,
    version: VERSION,
    mode: opts.mode,
  });
  const { server, port } = await bindServer({
    port: opts.port,
    dataDir: resolvedDataDir,
    fetch: router,
    host: opts.mode === "hub" ? "0.0.0.0" : "127.0.0.1",
  });

  if (opts.mode === "agent") {
    const rescan = () =>
      runUsageIngest(db, { dataDir: resolvedDataDir, roots: opts.usageRoots })
        .then(() => emit("usage:updated", {}))
        .catch(() => {});
    void rescan();
    setInterval(rescan, USAGE_RESCAN_INTERVAL_MS);
  }

  return { server, token, port };
}

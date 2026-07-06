import * as path from "node:path";
import { dataDir, openDb } from "@skillkeep/core";
import type { ClientId } from "@skillkeep/usage";
import type { Server } from "bun";
import { ensureToken } from "./auth";
import { createDrainingHandler } from "./drain";
import { emit } from "./events";
import { type MaintenanceScheduler, startMaintenanceScheduler } from "./maintenance";
import { bindServer } from "./port";
import { createRouter } from "./routes";
import { runUsageIngest } from "./usage-ingest";

export { type PullResult, type PushResult, pullFromHub, pushToHub } from "./hub-link";
export {
  type MaintenanceDeps,
  type MaintenanceHubResult,
  type MaintenanceResult,
  type MaintenanceScheduler,
  type MaintenanceSchedulerDeps,
  maintenanceIntervalMs,
  type NotifyExec,
  runMaintenancePass,
  sendMacNotification,
  startMaintenanceScheduler,
} from "./maintenance";
export { DaemonAlreadyRunningError, DEFAULT_PORT } from "./port";
export type { ManifestEntry } from "./registry-sync";

const VERSION = "0.1.0";
const USAGE_RESCAN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Outcome of `startServer`: the running Bun server, its bearer token, and the port it bound to.
 * `close()` stops accepting new requests, drains in-flight ones, clears the agent-mode rescan
 * interval, and closes the underlying SQLite handle — call it for any deterministic shutdown
 * (tests, or the CLI's SIGINT/SIGTERM handler); skipping it just leaks the handle/timer until the
 * process itself exits, which is harmless for a long-running daemon but leaves the data dir's
 * `.db`/`.db-wal`/`.db-shm` files open, which is fatal to a same-process cleanup on Windows (no
 * unlink-of-open-file semantics there).
 */
export interface StartedServer {
  server: Server<undefined>;
  token: string;
  port: number;
  close: () => Promise<void>;
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
  /** Test-only override for the maintenance scheduler's tick interval; production always derives
   * it from `Config.maintenanceIntervalHours`. */
  maintenanceIntervalMsOverride?: number;
}): Promise<StartedServer> {
  const resolvedDataDir = opts.dataDir ?? dataDir();
  // Resolve the token before opening the db: in hub mode, requireHubToken() throws
  // synchronously when SKILLKEEP_TOKEN is unset, and that must happen before any resource is
  // opened -- otherwise the just-created sqlite handle (and its on-disk file) leaks for the rest
  // of the process, since startServer never returns a StartedServer to close() with.
  const token = opts.mode === "hub" ? requireHubToken() : await ensureToken(resolvedDataDir);
  const db = openDb(path.join(resolvedDataDir, "skillkeep.db"));

  const router = createRouter({
    db,
    token,
    dataDir: resolvedDataDir,
    version: VERSION,
    mode: opts.mode,
  });
  const draining = createDrainingHandler(router);
  const { server, port } = await bindServer({
    port: opts.port,
    dataDir: resolvedDataDir,
    fetch: draining.fetch,
    host: opts.mode === "hub" ? "0.0.0.0" : "127.0.0.1",
  });

  let rescanTimer: Timer | undefined;
  let inFlightRescan: Promise<void> = Promise.resolve();
  let maintenanceScheduler: MaintenanceScheduler | undefined;
  if (opts.mode === "agent") {
    const rescan = () => {
      inFlightRescan = runUsageIngest(db, { dataDir: resolvedDataDir, roots: opts.usageRoots })
        .then(() => emit("usage:updated", {}))
        .catch(() => {});
      return inFlightRescan;
    };
    void rescan();
    rescanTimer = setInterval(rescan, USAGE_RESCAN_INTERVAL_MS);

    maintenanceScheduler = startMaintenanceScheduler(db, opts.maintenanceIntervalMsOverride, {
      passDeps: { dataDir: resolvedDataDir },
      onTick: (result) => emit("maintenance:done", result),
    });
  }

  return {
    server,
    token,
    port,
    close: async () => {
      // Stop accepting new requests first, then let whichever ones are already in flight
      // finish (including a boot-time `rescan()` still walking usage roots, and any maintenance
      // pass mid-tick) before closing the db handle out from under them -- exactly the kind of
      // self-inflicted race that made the Windows EBUSY-on-cleanup bug in
      // server.test.ts/usage-ingest.test.ts intermittent rather than deterministic.
      draining.beginClose();
      clearInterval(rescanTimer);
      maintenanceScheduler?.stop();
      await inFlightRescan;
      await maintenanceScheduler?.waitForIdle();
      await draining.drain();
      server.stop(true);
      db.close();
    },
  };
}

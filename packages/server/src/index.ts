import * as path from "node:path";
import { dataDir, openDb } from "@skillkeep/core";
import type { Server } from "bun";
import { ensureToken } from "./auth";
import { bindServer } from "./port";
import { createRouter } from "./routes";

export { DaemonAlreadyRunningError, DEFAULT_PORT } from "./port";

const VERSION = "0.1.0";

/** Outcome of `startServer`: the running Bun server, its bearer token, and the port it bound to. */
export interface StartedServer {
  server: Server<undefined>;
  token: string;
  port: number;
}

/**
 * Start the skillkeep daemon. Opens (or creates) the SQLite state store, ensures a bearer token
 * exists, and binds the HTTP API — falling back to an ephemeral port (and recording it at
 * `<dataDir>/daemon.port`) when the requested port is held by something other than a healthy
 * skillkeep, or throwing `DaemonAlreadyRunningError` when it IS a healthy skillkeep already.
 *
 * `mode: "hub"` is reserved for the future multi-device hub server (Docker/Railway deploy target)
 * and is not implemented by this milestone.
 */
export async function startServer(opts: {
  mode: "agent" | "hub";
  port?: number;
  dataDir?: string;
}): Promise<StartedServer> {
  if (opts.mode === "hub") {
    throw new Error("hub mode is not implemented yet (agent mode only in this milestone)");
  }

  const resolvedDataDir = opts.dataDir ?? dataDir();
  const db = openDb(path.join(resolvedDataDir, "skillkeep.db"));
  const token = await ensureToken(resolvedDataDir);
  const router = createRouter({ db, token, dataDir: resolvedDataDir, version: VERSION });
  const { server, port } = await bindServer({
    port: opts.port,
    dataDir: resolvedDataDir,
    fetch: router,
  });

  return { server, token, port };
}

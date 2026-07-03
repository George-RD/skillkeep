import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Server } from "bun";

/** Default localhost port the agent-mode daemon binds to when nothing overrides it. */
export const DEFAULT_PORT = 4517;

const DAEMON_PORT_FILE_NAME = "daemon.port";

/**
 * Thrown by `bindServer` when the requested port is already held by another *healthy* skillkeep
 * daemon (confirmed via a `/healthz` probe). The caller (the CLI's `daemon` command) is expected
 * to catch this, report it through `report()`, and exit — never a crash with a raw stack trace.
 */
export class DaemonAlreadyRunningError extends Error {
  readonly port: number;
  constructor(port: number) {
    super(`another skillkeep daemon is already healthy on port ${port}`);
    this.name = "DaemonAlreadyRunningError";
    this.port = port;
  }
}

/** Outcome of a successful bind: the running server and the port it actually ended up on. */
export interface BindResult {
  server: Server<undefined>;
  port: number;
}

/** Resolve the port to try first: explicit override, then `PORT` (Railway), then `SKILLKEEP_PORT`, then default. */
function resolveRequestedPort(explicit: number | undefined): number {
  if (explicit !== undefined) return explicit;
  for (const key of ["PORT", "SKILLKEEP_PORT"]) {
    const envPort = process.env[key];
    if (envPort !== undefined) {
      const parsed = Number(envPort);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return DEFAULT_PORT;
}

/** Ask a candidate port's `/healthz` whether a skillkeep daemon is already alive and well there. */
async function probeHealthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}

/**
 * Bind the daemon's HTTP server. Tries the requested port (explicit override, `PORT` env for
 * Railway, `SKILLKEEP_PORT`, or 4517) first. On `EADDRINUSE`: if that port already answers a
 * healthy `/healthz`, throws `DaemonAlreadyRunningError` (another instance owns it — don't steal
 * it). Otherwise it's a stale/foreign listener, so falls back to an ephemeral port (`port: 0`) and
 * records the actual bound port at `<dataDir>/daemon.port` for the desktop shell to read. The
 * `host` option defaults to `127.0.0.1` (agent mode); hub mode passes `0.0.0.0`.
 */
export async function bindServer(opts: {
  port?: number;
  dataDir: string;
  fetch: (req: Request) => Promise<Response> | Response;
  host?: string;
}): Promise<BindResult> {
  const requestedPort = resolveRequestedPort(opts.port);
  const hostname = opts.host ?? "127.0.0.1";
  let server: Server<undefined>;
  try {
    server = Bun.serve({ hostname, port: requestedPort, fetch: opts.fetch });
  } catch (err) {
    const isAddrInUse =
      typeof err === "object" && err !== null && "code" in err && err.code === "EADDRINUSE";
    if (!isAddrInUse) throw err;
    if (await probeHealthy(requestedPort)) throw new DaemonAlreadyRunningError(requestedPort);
    server = Bun.serve({ hostname, port: 0, fetch: opts.fetch });
  }
  // `server.port` is `number | undefined` only for unix-socket servers; bindServer always binds TCP.
  const boundPort = server.port;
  if (boundPort === undefined) throw new Error("unreachable: TCP bind always has a port");
  // Always (re)write the port file so it never points at a stale prior run's ephemeral port.
  await fs.mkdir(opts.dataDir, { recursive: true });
  await fs.writeFile(path.join(opts.dataDir, DAEMON_PORT_FILE_NAME), String(boundPort), "utf8");
  return { server, port: boundPort };
}

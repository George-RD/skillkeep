import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const TOKEN_FILE_NAME = "daemon.token";
const TOKEN_FILE_MODE = 0o600;

/** Absolute path to the daemon's bearer-token file inside a data directory. */
export function tokenFilePath(dataDir: string): string {
  return path.join(dataDir, TOKEN_FILE_NAME);
}

export interface AclOpts {
  platform?: NodeJS.Platform;
  username?: string;
  spawn?: (cmd: string[]) => { exited: Promise<number>; stderr?: ReadableStream<Uint8Array> };
}

/** Stub pending implementation (commit 2). */
export async function hardenTokenFileAcl(_tokenPath: string, _opts: AclOpts = {}): Promise<void> {}

/**
 * Read the existing bearer token from `<dataDir>/daemon.token`, or generate and persist a new
 * 32-byte random one (0600 permissions) on first run. Re-asserts 0600 even when the file
 * pre-existed with looser permissions.
 */
export async function ensureToken(dataDir: string, _aclOpts: AclOpts = {}): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  const tokenPath = tokenFilePath(dataDir);
  if (existsSync(tokenPath)) {
    const existing = (await fs.readFile(tokenPath, "utf8")).trim();
    await fs.chmod(tokenPath, TOKEN_FILE_MODE);
    if (existing !== "") return existing;
  }
  const token = randomBytes(32).toString("hex");
  await fs.writeFile(tokenPath, token, { mode: TOKEN_FILE_MODE });
  await fs.chmod(tokenPath, TOKEN_FILE_MODE);
  return token;
}

/**
 * Check a request's bearer token against the daemon token. Every route requires the
 * `Authorization: Bearer <token>` header; the `/api/events` route (SSE — EventSource cannot set
 * headers) additionally accepts `?token=<token>` as a query param, matching the UI's exact
 * convention in packages/ui/src/App.tsx. `/healthz` is never routed through this check.
 */
export function requireAuth(req: Request, token: string): boolean {
  const header = req.headers.get("authorization");
  if (header === `Bearer ${token}`) return true;
  const url = new URL(req.url);
  if (url.pathname === "/api/events") {
    const queryToken = url.searchParams.get("token");
    if (queryToken !== null && queryToken === token) return true;
  }
  return false;
}

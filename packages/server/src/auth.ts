import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
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

/**
 * Harden `tokenPath`'s ACL on win32 via `icacls`: strip inherited access for every non-owner
 * principal (`/inheritance:r`) and grant the current user full control (`/grant:r`). No-op on
 * darwin/linux, where `ensureToken`'s 0600 chmod already suffices. Fails closed on a non-zero
 * `icacls` exit -- a silent failure here would defeat the hardening, and `icacls` is always
 * present on Windows.
 *
 * Grants `:F` (full control) rather than the minimal `:RW`: `/inheritance:r` alone already
 * delivers the confidentiality goal (stripping every non-owner principal), and `:RW`'s simple
 * rights set omits DELETE, which risks EPERM in Windows CI's rmrfRetry teardown of test data
 * dirs.
 */
export async function hardenTokenFileAcl(tokenPath: string, opts: AclOpts = {}): Promise<void> {
  const platform = opts.platform ?? process.platform;
  if (platform !== "win32") return;
  const username = opts.username ?? os.userInfo().username;
  const spawn =
    opts.spawn ?? ((cmd: string[]) => Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" }));
  const proc = spawn(["icacls", tokenPath, "/inheritance:r", "/grant:r", `${username}:F`]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderrText = proc.stderr ? await new Response(proc.stderr).text() : "";
    throw new Error(`icacls failed hardening ${tokenPath} (exit ${exitCode}): ${stderrText}`);
  }
}

/**
 * Read the existing bearer token from `<dataDir>/daemon.token`, or generate and persist a new
 * 32-byte random one (0600 permissions) on first run. Re-asserts 0600 (and, on win32, explicit
 * icacls hardening) even when the file pre-existed with looser permissions.
 */
export async function ensureToken(dataDir: string, aclOpts: AclOpts = {}): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  const tokenPath = tokenFilePath(dataDir);
  if (existsSync(tokenPath)) {
    const existing = (await fs.readFile(tokenPath, "utf8")).trim();
    await fs.chmod(tokenPath, TOKEN_FILE_MODE);
    await hardenTokenFileAcl(tokenPath, aclOpts);
    if (existing !== "") return existing;
  }
  const token = randomBytes(32).toString("hex");
  await fs.writeFile(tokenPath, token, { mode: TOKEN_FILE_MODE });
  await fs.chmod(tokenPath, TOKEN_FILE_MODE);
  await hardenTokenFileAcl(tokenPath, aclOpts);
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

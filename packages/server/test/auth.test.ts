import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ensureToken, hardenTokenFileAcl, tokenFilePath } from "../src/auth";
import { rmrfRetry } from "./test-utils";

function recordingSpawn(exitCode: number): {
  spawn: (cmd: string[]) => { exited: Promise<number> };
  calls: string[][];
} {
  const calls: string[][] = [];
  const spawn = (cmd: string[]): { exited: Promise<number> } => {
    calls.push(cmd);
    return { exited: Promise.resolve(exitCode) };
  };
  return { spawn, calls };
}

test("hardenTokenFileAcl is a no-op on non-win32 platforms", async () => {
  const { spawn, calls } = recordingSpawn(0);
  await hardenTokenFileAcl("/data/daemon.token", { platform: "linux", spawn });
  expect(calls).toHaveLength(0);
});

test("hardenTokenFileAcl runs icacls with the expected arguments on win32", async () => {
  const { spawn, calls } = recordingSpawn(0);
  await hardenTokenFileAcl("C:\\data\\daemon.token", {
    platform: "win32",
    username: "alice",
    spawn,
  });
  expect(calls).toEqual([
    ["icacls", "C:\\data\\daemon.token", "/inheritance:r", "/grant:r", "alice:F"],
  ]);
});

test("hardenTokenFileAcl fails closed when icacls exits non-zero", async () => {
  const { spawn } = recordingSpawn(5);
  await expect(
    hardenTokenFileAcl("C:\\data\\daemon.token", { platform: "win32", username: "alice", spawn }),
  ).rejects.toThrow(/icacls.*5/is);
});

test("ensureToken re-asserts icacls hardening on both the fresh-token and pre-existing paths", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-auth-"));
  try {
    const { spawn, calls } = recordingSpawn(0);
    const opts = { platform: "win32" as const, username: "alice", spawn };

    const first = await ensureToken(tmpDir, opts);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      "icacls",
      tokenFilePath(tmpDir),
      "/inheritance:r",
      "/grant:r",
      "alice:F",
    ]);

    const second = await ensureToken(tmpDir, opts);
    expect(second).toBe(first);
    expect(calls).toHaveLength(2);
  } finally {
    await rmrfRetry(tmpDir);
  }
});

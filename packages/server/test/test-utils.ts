import * as fs from "node:fs";

/**
 * `fs.rmSync`'s documented `maxRetries`/`retryDelay` options are a no-op under Bun (verified:
 * passing them still throws EBUSY on the first attempt, in well under a millisecond -- nowhere
 * near what even one 200ms backoff would take). This is the real retry loop, for the handful of
 * test files that open a file-backed `bun:sqlite` handle (server.test.ts, usage-ingest.test.ts)
 * and then immediately `rm` their own tmpDir in `afterAll`.
 *
 * Even after `db.close()` returns, Windows doesn't always release the underlying OS file handle
 * (skillkeep.db + its -wal/-shm siblings) in the same tick -- and in agent mode, `startServer`'s
 * boot-time `void rescan()` (see packages/server/src/index.ts) can still be mid-flight against
 * that same db when a test's `afterAll` runs, so the handle may briefly outlive `close()` for a
 * reason beyond plain OS-timing slop. A real, non-blocking delay between attempts (not a busy
 * loop) gives both cases time to settle before giving up.
 */
export async function rmrfRetry(
  dir: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<void> {
  const attempts = opts.attempts ?? 10;
  const delayMs = opts.delayMs ?? 100;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const retryable = code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY";
      if (!retryable || attempt === attempts) throw err;
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, delayMs);
      await promise;
    }
  }
}

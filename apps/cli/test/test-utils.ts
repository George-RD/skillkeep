import * as fs from "node:fs";

/**
 * `fs.rmSync`'s documented `maxRetries`/`retryDelay` options are a no-op under Bun (verified:
 * passing them still throws EBUSY on the first attempt, in well under a millisecond -- nowhere
 * near what even one 200ms backoff would take). This is the real retry loop, for tests that open
 * a file-backed `bun:sqlite` handle (via `openDb`) and then immediately `rm` their own tmpDir:
 * even after `db.close()` returns, Windows doesn't always release the underlying OS file handle
 * (the db + its -wal/-shm siblings) in the same tick, so a bare `fs.rmSync` can throw
 * EBUSY/EPERM/ENOTEMPTY. `Bun.gc(true)` forces a synchronous full collection before each retry so
 * any pending finalizers actually run, backed by a real, non-blocking delay between attempts so
 * any OS-level lock also gets time to settle.
 */
export async function rmrfRetry(
  dir: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<void> {
  const attempts = opts.attempts ?? 15;
  const delayMs = opts.delayMs ?? 200;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const retryable = code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY";
      if (!retryable || attempt === attempts) throw err;
      Bun.gc(true);
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, delayMs);
      await promise;
    }
  }
}

import * as fs from "node:fs";

/**
 * `fs.rmSync`'s documented `maxRetries`/`retryDelay` options are a no-op under Bun (verified:
 * passing them still throws EBUSY on the first attempt, in well under a millisecond -- nowhere
 * near what even one 200ms backoff would take). This is the real retry loop, for the test files
 * that open a file-backed resource (`bun:sqlite` in server.test.ts/usage-ingest.test.ts, or
 * `Bun.file()` reads through packages/usage's parsers in usage-ingest.test.ts) and then
 * immediately `rm` their own tmpDir in `afterAll`.
 *
 * Two distinct root causes, both need this:
 * - Even after `db.close()` returns, Windows doesn't always release the underlying OS file
 *   handle (skillkeep.db + its -wal/-shm siblings) in the same tick -- and in agent mode,
 *   `startServer`'s boot-time `void rescan()` (see packages/server/src/index.ts) can still be
 *   mid-flight against that same db when a test's `afterAll` runs.
 * - `Bun.file()` (used by packages/usage's per-client log parsers) has no explicit `.close()`;
 *   its underlying native handle is released on GC finalization, not deterministically on the
 *   read completing -- confirmed empirically (CI: usage-ingest.test.ts, which reads fixture
 *   files exclusively via `Bun.file()`, still threw EBUSY after exhausting a 10x100ms budget
 *   with no GC forced in between). `Bun.gc(true)` forces a synchronous full collection before
 *   each retry so those finalizers actually run, backed by a real, non-blocking delay between
 *   attempts so any OS-level lock (Windows AV scan lag, etc.) also gets time to settle.
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

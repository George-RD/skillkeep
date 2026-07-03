import { type Config, type Detection, detectAll } from "@skillkeep/core";

const CACHE_TTL_MS = 30_000;

/**
 * Module-level cache: one skillkeep daemon serves one Config, so there is nothing to key on.
 * `getScan` and `/api/adopt`'s census lookup share this so a scan followed immediately by an
 * adopt sees the same DetectedSkill objects (matching by name+path).
 */
let cache: { data: Detection; expiresAt: number } | null = null;

/** Outcome of `getScan`: the Detection plus whether this call actually ran `detectAll`. */
export interface ScanResult {
  data: Detection;
  computed: boolean;
}

/** Return the cached Detection if still fresh, otherwise recompute via `detectAll` and cache it. */
export async function getScan(config: Config, fresh: boolean): Promise<ScanResult> {
  if (!fresh && cache !== null && Date.now() < cache.expiresAt) {
    return { data: cache.data, computed: false };
  }
  const data = await detectAll(config);
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return { data, computed: true };
}

/** Test-only: force the next `getScan` call to recompute, so fixtures from a prior test don't leak. */
export function resetScanCache(): void {
  cache = null;
}

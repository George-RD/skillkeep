import snapshot from "./prices.snapshot.json" with { type: "json" };

/** Per-token USD price for one model. Missing fields default to 0. */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Raw LiteLLM-style price entry (subset of the fields we consume). */
export type PriceTable = Record<
  string,
  {
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    cache_read_input_token_cost?: number;
    cache_creation_input_token_cost?: number;
  }
>;

/** The bundled offline snapshot, exported so the daemon's `loadPriceTable` can `mergePrices(bundledPrices, live)` without duplicating the JSON import. */
export const bundledPrices = snapshot as PriceTable;
const bundled = bundledPrices;

/**
 * Look up a model's per-token price in `table` (defaults to the bundled offline
 * snapshot). Returns `null` for unknown models — cost is NEVER guessed.
 */
export function lookupPrice(model: string, table: PriceTable = bundled): Price | null {
  const entry = table[model];
  if (!entry) return null;
  return {
    input: entry.input_cost_per_token ?? 0,
    output: entry.output_cost_per_token ?? 0,
    cacheRead: entry.cache_read_input_token_cost ?? 0,
    cacheWrite: entry.cache_creation_input_token_cost ?? 0,
  };
}

/**
 * Pure merge of a bundled snapshot with a live-fetched cached table. Cached
 * (newer) entries override bundled ones. The daemon calls this after fetching
 * LiteLLM's table with a 24h on-disk cache; this package performs no network or
 * disk I/O beyond reading the bundled snapshot.
 */
export function mergePrices(base: PriceTable, cached: PriceTable): PriceTable {
  return { ...base, ...cached };
}

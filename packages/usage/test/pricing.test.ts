import { describe, expect, test } from "bun:test";
import type { PriceTable } from "../src/pricing.ts";
import { lookupPrice, mergePrices } from "../src/pricing.ts";

describe("lookupPrice", () => {
  test("finds a bundled model", () => {
    expect(lookupPrice("gpt-4o-mini")).toEqual({
      input: 0.00000015,
      output: 0.0000006,
      cacheRead: 0.000000075,
      cacheWrite: 0,
    });
  });

  test("returns null for an unknown model rather than guessing", () => {
    expect(lookupPrice("totally-unknown-model-xyz")).toBeNull();
  });

  test("defaults missing cost fields to 0 in a custom table", () => {
    const table: PriceTable = { "partial-model": { input_cost_per_token: 0.000001 } };
    expect(lookupPrice("partial-model", table)).toEqual({
      input: 0.000001,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });
});

describe("mergePrices", () => {
  test("is a pure override merge: cached entries win over the base snapshot", () => {
    const base: PriceTable = {
      "model-a": { input_cost_per_token: 0.000001 },
      "model-b": { input_cost_per_token: 0.000002 },
    };
    const cached: PriceTable = { "model-a": { input_cost_per_token: 0.000009 } };

    const merged = mergePrices(base, cached);

    expect(merged).toEqual({
      "model-a": { input_cost_per_token: 0.000009 },
      "model-b": { input_cost_per_token: 0.000002 },
    });
    // Pure: inputs are untouched.
    expect(base["model-a"]).toEqual({ input_cost_per_token: 0.000001 });
  });

  test("an empty cached table leaves the base snapshot untouched", () => {
    const base: PriceTable = { "model-a": { input_cost_per_token: 0.000001 } };
    expect(mergePrices(base, {})).toEqual(base);
  });
});

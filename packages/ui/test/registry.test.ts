import { describe, expect, it } from "bun:test";
import type { HubPullResult, HubPushResult } from "../src/api/types";
import { formatPullSummary, formatPushSummary } from "../src/screens/Registry";

describe("formatPushSummary", () => {
  it("summarises a clean push with no conflicts", () => {
    const result: HubPushResult = {
      device: "laptop",
      usageRows: 3,
      skillUsageRows: 1,
      skillsPushed: ["a", "b"],
      conflicts: [],
    };
    expect(formatPushSummary(result)).toBe("Pushed 2 skills");
  });

  it("uses the singular form for a single skill", () => {
    const result: HubPushResult = {
      device: "laptop",
      usageRows: 0,
      skillUsageRows: 0,
      skillsPushed: ["a"],
      conflicts: [],
    };
    expect(formatPushSummary(result)).toBe("Pushed 1 skill");
  });

  it("surfaces each conflict name clearly", () => {
    const result: HubPushResult = {
      device: "laptop",
      usageRows: 0,
      skillUsageRows: 0,
      skillsPushed: [],
      conflicts: ["foo", "bar"],
    };
    const msg = formatPushSummary(result);
    expect(msg).toContain("conflict: foo (resolve manually)");
    expect(msg).toContain("conflict: bar (resolve manually)");
  });
});

describe("formatPullSummary", () => {
  it("summarises a pull", () => {
    const result: HubPullResult = { skillsPulled: ["a", "b", "c"] };
    expect(formatPullSummary(result)).toBe("Pulled 3 skills");
  });

  it("summarises an empty pull", () => {
    const result: HubPullResult = { skillsPulled: [] };
    expect(formatPullSummary(result)).toBe("Pulled 0 skills");
  });
});

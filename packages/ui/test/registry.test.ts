import { describe, expect, it } from "bun:test";
import type { HubPullResult, HubPushResult } from "../src/api/types";
import {
  applyDescriptionSuggestion,
  formatPullSummary,
  formatPushSummary,
} from "../src/screens/Registry";

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

describe("applyDescriptionSuggestion", () => {
  it("replaces the description line inside the frontmatter block", () => {
    const content = ["---", "name: foo", "description: old text", "---", "", "Body."].join("\n");
    const result = applyDescriptionSuggestion(content, "new text");
    expect(result).toContain("description: new text");
    expect(result).not.toContain("description: old text");
    expect(result).toContain("name: foo");
    expect(result).toContain("Body.");
  });

  it("quotes a suggestion containing a colon so the YAML stays valid", () => {
    const content = ["---", "name: foo", "description: old text", "---", "Body."].join("\n");
    const result = applyDescriptionSuggestion(content, "Use this: carefully");
    expect(result).toContain(JSON.stringify("Use this: carefully"));
  });

  it("leaves content unchanged when there is no frontmatter block", () => {
    const content = "# Just a heading\n\nNo frontmatter here.";
    expect(applyDescriptionSuggestion(content, "new text")).toBe(content);
  });

  it("leaves content unchanged when the frontmatter has no description line", () => {
    const content = ["---", "name: foo", "---", "Body."].join("\n");
    expect(applyDescriptionSuggestion(content, "new text")).toBe(content);
  });
});

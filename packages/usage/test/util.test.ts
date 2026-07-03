import { describe, expect, test } from "bun:test";
import { decodeCwdSlug, num, parseTs, repoFromSlug } from "../src/util.ts";

describe("decodeCwdSlug", () => {
  test("decodes a claude-style absolute-path slug", () => {
    expect(decodeCwdSlug("-Users-george-repos-cairn")).toBe("/Users/george/repos/cairn");
  });

  test("is lossy for repo names containing literal dashes", () => {
    // "-repos-agent-skills" cannot distinguish "agent-skills" (one repo) from
    // "agent/skills" (two segments) by dash alone — this is the documented
    // lossiness that repoFromSlug's disk-existence fallback exists to handle.
    expect(decodeCwdSlug("-repos-agent-skills")).toBe("/repos/agent/skills");
  });
});

describe("repoFromSlug", () => {
  test("returns the decoded path when it exists on disk", () => {
    const repo = repoFromSlug(
      "-Users-george-repos-cairn",
      (p) => p === "/Users/george/repos/cairn",
    );
    expect(repo).toBe("/Users/george/repos/cairn");
  });

  test("falls back to the raw slug when the decoded path does not exist", () => {
    const repo = repoFromSlug("-repos-agent-skills", () => false);
    expect(repo).toBe("-repos-agent-skills");
  });
});

describe("num", () => {
  test("truncates and floors negatives to 0", () => {
    expect(num(12.9)).toBe(12);
    expect(num(-5)).toBe(0);
  });

  test("non-numbers and NaN/Infinity coerce to 0", () => {
    expect(num("12")).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num(Number.NaN)).toBe(0);
    expect(num(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("parseTs", () => {
  test("parses an ISO string to epoch ms", () => {
    expect(parseTs("2026-05-21T14:08:40.724Z")).toBe(Date.parse("2026-05-21T14:08:40.724Z"));
  });

  test("passes through a finite epoch-ms number", () => {
    expect(parseTs(1783007384267)).toBe(1783007384267);
  });

  test("returns 0 for unparseable or missing values", () => {
    expect(parseTs("not a date")).toBe(0);
    expect(parseTs(undefined)).toBe(0);
    expect(parseTs(Number.NaN)).toBe(0);
  });
});

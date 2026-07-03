import { describe, expect, it } from "bun:test";
import type { DetectedSkill, RegistryScope } from "../src/api/types";
import { findDedupeCounterpart } from "../src/screens/Detect";

function skill(overrides: Partial<DetectedSkill>): DetectedSkill {
  return {
    name: "foo",
    description: "does foo things",
    hash: "abc123",
    client: "claude",
    surface: "user",
    path: "/skills/foo",
    state: "unmanaged",
    ...overrides,
  };
}

describe("findDedupeCounterpart", () => {
  it("finds the other duplicate instance sharing the same name", () => {
    const a = skill({ name: "foo", path: "/a/foo", state: "duplicate", description: "version a" });
    const b = skill({ name: "foo", path: "/b/foo", state: "duplicate", description: "version b" });
    const result = findDedupeCounterpart(a, [a, b], []);
    expect(result).toEqual({ name: "foo", description: "version b", body: "version b" });
  });

  it("returns null for a duplicate with no other instance present", () => {
    const a = skill({ name: "foo", path: "/a/foo", state: "duplicate" });
    expect(findDedupeCounterpart(a, [a], [])).toBeNull();
  });

  it("does not match a duplicate against itself (same path)", () => {
    const a = skill({ name: "foo", path: "/a/foo", state: "duplicate" });
    // Only one entry in `skills`, but it's the exact same skill (same path) — must not self-match.
    expect(findDedupeCounterpart(a, [a], [])).toBeNull();
  });

  it("finds the registry's current version for a drifted skill", () => {
    const drifted = skill({
      name: "foo",
      state: "drifted",
      registryScope: "global",
      description: "local edit",
    });
    const registry: RegistryScope[] = [
      {
        scope: "global",
        skills: [{ name: "foo", description: "registry version", hash: "def456" }],
      },
    ];
    const result = findDedupeCounterpart(drifted, [drifted], registry);
    expect(result).toEqual({
      name: "foo",
      description: "registry version",
      body: "registry version",
    });
  });

  it("returns null for a drifted skill whose registryScope isn't in the registry data", () => {
    const drifted = skill({ name: "foo", state: "drifted", registryScope: "profile/missing" });
    expect(findDedupeCounterpart(drifted, [drifted], [])).toBeNull();
  });

  it("returns null for a drifted skill with no registryScope at all", () => {
    const drifted = skill({ name: "foo", state: "drifted", registryScope: undefined });
    const registry: RegistryScope[] = [
      { scope: "global", skills: [{ name: "foo", description: "x", hash: "h" }] },
    ];
    expect(findDedupeCounterpart(drifted, [drifted], registry)).toBeNull();
  });

  it("returns null for a skill that is neither duplicate nor drifted", () => {
    const managed = skill({ name: "foo", state: "managed" });
    expect(findDedupeCounterpart(managed, [managed], [])).toBeNull();
  });

  it("degrades a null description to an empty string for both name and body", () => {
    const a = skill({ name: "foo", path: "/a/foo", state: "duplicate", description: null });
    const b = skill({ name: "foo", path: "/b/foo", state: "duplicate", description: null });
    const result = findDedupeCounterpart(a, [a, b], []);
    expect(result).toEqual({ name: "foo", description: "", body: "" });
  });
});

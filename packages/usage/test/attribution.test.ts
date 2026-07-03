import { describe, expect, test } from "bun:test";
import { attributedSkill } from "../src/attribution.ts";

describe("attributedSkill", () => {
  test("matches a skills/ SKILL.md read", () => {
    expect(attributedSkill("/Users/george/.claude/skills/humanize-writing/SKILL.md")).toBe(
      "humanize-writing",
    );
  });

  test("matches a managed-skills/ SKILL.md read", () => {
    expect(attributedSkill("/Users/george/.omp/agent/managed-skills/rtk/SKILL.md")).toBe("rtk");
  });

  test("matches via a skill:// URI form", () => {
    expect(attributedSkill("skill://agent-skills/skills/1password/SKILL.md")).toBe("1password");
  });

  test("returns null for a non-SKILL.md read", () => {
    expect(attributedSkill("/Users/george/repos/skillkeep/README.md")).toBeNull();
  });

  test("returns null for a skills dir read that isn't SKILL.md itself", () => {
    expect(attributedSkill("/Users/george/.claude/skills/rtk/reference.md")).toBeNull();
  });

  test("returns null for an empty path", () => {
    expect(attributedSkill("")).toBeNull();
  });
});

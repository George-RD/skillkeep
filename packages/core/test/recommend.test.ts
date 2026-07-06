import { describe, expect, test } from "bun:test";
import {
  buildRecommendations,
  RECOMMEND_WINDOW_DAYS,
  type RecommendInput,
  TOKEN_COST_THRESHOLD,
} from "../src/recommend";
import type { RegistryEntry } from "../src/registry";
import type { SkillMeta } from "../src/types";

function skill(name: string): SkillMeta {
  return {
    name,
    dir: `/registry/${name}`,
    skillMdPath: `/registry/${name}/SKILL.md`,
    description: `${name} description`,
    invalid: false,
  };
}

function entry(scope: string, name: string): RegistryEntry {
  return { scope, skill: skill(name) };
}

const baseInput: RecommendInput = {
  registry: [],
  usedSkillNames: new Set(),
  inboxCount: 0,
  globalTokens: 0,
};

describe("buildRecommendations", () => {
  test("empty input yields no recommendations", () => {
    expect(buildRecommendations(baseInput)).toEqual([]);
  });

  describe("inbox-triage", () => {
    test("no recommendation when the inbox is empty", () => {
      const recs = buildRecommendations({ ...baseInput, inboxCount: 0 });
      expect(recs.some((r) => r.kind === "inbox-triage")).toBe(false);
    });

    test("one recommendation when the inbox has items", () => {
      const recs = buildRecommendations({ ...baseInput, inboxCount: 3 });
      const rec = recs.find((r) => r.kind === "inbox-triage");
      expect(rec).toMatchObject({ id: "inbox", action: "triage" });
      expect(rec?.title).toContain("3");
    });
  });

  describe("unused-skill", () => {
    test("flags a global skill with no recorded usage", () => {
      const recs = buildRecommendations({
        ...baseInput,
        registry: [entry("global", "idle-skill")],
        usedSkillNames: new Set(),
      });
      expect(recs).toEqual([
        expect.objectContaining({
          id: "unused:idle-skill",
          kind: "unused-skill",
          action: "archive",
          scope: "global",
          skills: ["idle-skill"],
        }),
      ]);
      expect(recs[0].title).toContain(`${RECOMMEND_WINDOW_DAYS} days`);
    });

    test("never flags a used global skill", () => {
      const recs = buildRecommendations({
        ...baseInput,
        registry: [entry("global", "active-skill")],
        usedSkillNames: new Set(["active-skill"]),
      });
      expect(recs.some((r) => r.kind === "unused-skill")).toBe(false);
    });

    test("never flags a non-global skill, used or not", () => {
      const recs = buildRecommendations({
        ...baseInput,
        registry: [entry("project/foo", "idle-project-skill")],
        usedSkillNames: new Set(),
      });
      expect(recs.some((r) => r.kind === "unused-skill")).toBe(false);
    });

    test("sorts multiple unused-skill recommendations by name", () => {
      const recs = buildRecommendations({
        ...baseInput,
        registry: [entry("global", "zebra"), entry("global", "apple")],
        usedSkillNames: new Set(),
      });
      const names = recs.filter((r) => r.kind === "unused-skill").map((r) => r.skills[0]);
      expect(names).toEqual(["apple", "zebra"]);
    });
  });

  describe("duplicate-pair", () => {
    test("flags a near-identical name pair via prefix containment", () => {
      const recs = buildRecommendations({
        ...baseInput,
        registry: [entry("global", "deploy"), entry("global", "deploy-legacy")],
        usedSkillNames: new Set(["deploy", "deploy-legacy"]),
      });
      expect(recs).toEqual([
        expect.objectContaining({
          id: "dup:deploy+deploy-legacy",
          kind: "duplicate-pair",
          action: "dedupe",
          skills: ["deploy", "deploy-legacy"],
        }),
      ]);
    });

    test("flags a pair via hyphen-token Jaccard similarity above threshold, independent of prefix", () => {
      // Same three tokens, different order: neither name is a prefix of the other, so this
      // isolates the Jaccard path from the prefix-containment path above.
      const recs = buildRecommendations({
        ...baseInput,
        registry: [entry("global", "aws-deploy-prod"), entry("global", "deploy-prod-aws")],
      });
      expect(recs.some((r) => r.kind === "duplicate-pair")).toBe(true);
    });

    test("never flags unrelated names", () => {
      const recs = buildRecommendations({
        ...baseInput,
        registry: [entry("global", "foo"), entry("global", "bar")],
      });
      expect(recs.some((r) => r.kind === "duplicate-pair")).toBe(false);
    });

    test("never flags a pair involving an archived entry", () => {
      const recs = buildRecommendations({
        ...baseInput,
        registry: [entry("archive", "deploy"), entry("global", "deploy-legacy")],
      });
      expect(recs.some((r) => r.kind === "duplicate-pair")).toBe(false);
    });

    test("never flags two registry entries for the same skill name (e.g. global + project copy)", () => {
      const recs = buildRecommendations({
        ...baseInput,
        registry: [entry("global", "shared"), entry("project/foo", "shared")],
      });
      expect(recs.some((r) => r.kind === "duplicate-pair")).toBe(false);
    });

    test("caps duplicate-pair recommendations at 10", () => {
      const registry: RegistryEntry[] = [entry("global", "skill")];
      for (let i = 0; i < 11; i++) {
        registry.push(entry("global", `skill-${String.fromCharCode(97 + i)}`));
      }
      const recs = buildRecommendations({ ...baseInput, registry });
      const dupRecs = recs.filter((r) => r.kind === "duplicate-pair");
      expect(dupRecs).toHaveLength(10);
    });

    test("never duplicates the same pair id when a skill name appears in multiple scopes", () => {
      const recs = buildRecommendations({
        ...baseInput,
        registry: [
          entry("global", "deploy"),
          entry("project/foo", "deploy"),
          entry("global", "deploy-legacy"),
        ],
      });
      const dupIds = recs.filter((r) => r.kind === "duplicate-pair").map((r) => r.id);
      expect(dupIds).toEqual(["dup:deploy+deploy-legacy"]);
    });
  });

  describe("token-cost", () => {
    test("no recommendation at or below the threshold", () => {
      const recs = buildRecommendations({ ...baseInput, globalTokens: TOKEN_COST_THRESHOLD });
      expect(recs.some((r) => r.kind === "token-cost")).toBe(false);
    });

    test("one recommendation above the threshold", () => {
      const recs = buildRecommendations({
        ...baseInput,
        globalTokens: TOKEN_COST_THRESHOLD + 1,
      });
      const rec = recs.find((r) => r.kind === "token-cost");
      expect(rec).toMatchObject({ id: "token-cost", action: "review" });
      expect(rec?.detail).toContain(String(TOKEN_COST_THRESHOLD + 1));
    });
  });

  test("emits recommendations in rule order: inbox, unused, duplicate, token-cost", () => {
    const recs = buildRecommendations({
      registry: [entry("global", "idle"), entry("global", "idle-legacy")],
      usedSkillNames: new Set(),
      inboxCount: 1,
      globalTokens: TOKEN_COST_THRESHOLD + 1,
    });
    expect(recs.map((r) => r.kind)).toEqual([
      "inbox-triage",
      "unused-skill",
      "unused-skill",
      "duplicate-pair",
      "token-cost",
    ]);
  });
});

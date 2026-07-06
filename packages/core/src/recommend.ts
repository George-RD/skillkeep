/**
 * Skill-hygiene recommendation engine: turns a registry snapshot, usage-window membership, inbox
 * count, and a token estimate into a short list of actionable recommendations for the dashboard.
 * Pure — no fs/db access here, so every rule is unit-testable without a fixture registry.
 */
import type { RegistryEntry } from "./registry";

/** Days a global skill can go unused before it's flagged for archival. */
export const RECOMMEND_WINDOW_DAYS = 60;

/** Always-on global-scope token estimate above which a token-cost recommendation fires (roughly
 * 10% of a 200k context). */
export const TOKEN_COST_THRESHOLD = 20_000;

/** Duplicate-pair recommendations stop after this many matches, so a large registry with many
 * similarly-named skills doesn't flood the dashboard. */
const MAX_DUPLICATE_PAIRS = 10;

/** Name pairs at or above this Jaccard-over-hyphen-tokens similarity (or one name prefixing the
 * other) are flagged as possible duplicates. */
const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

export interface Recommendation {
  /** Stable across runs for the same input: "unused:<name>" | "dup:<a>+<b>" | "inbox" | "token-cost". */
  id: string;
  kind: "unused-skill" | "duplicate-pair" | "inbox-triage" | "token-cost";
  /** Short line, e.g. `"foo" unused for 60+ days`. */
  title: string;
  /** Why + suggested action, one sentence. */
  detail: string;
  /** Affected skill names (duplicate-pair: exactly [a, b]). */
  skills: string[];
  scope?: string;
  action: "archive" | "dedupe" | "triage" | "review";
}

export interface RecommendInput {
  /** scanRegistry() output. */
  registry: RegistryEntry[];
  /** Skill names with any skill_usage rows in the last RECOMMEND_WINDOW_DAYS days. */
  usedSkillNames: Set<string>;
  inboxCount: number;
  /** Always-on (global-scope) token estimate. */
  globalTokens: number;
}

/**
 * Jaccard similarity over hyphen-split token sets, with one name prefixing the other counting as
 * at least {@link DUPLICATE_SIMILARITY_THRESHOLD} regardless of the raw token overlap (e.g.
 * "foo" and "foo-legacy" share no useful token split but are still an obvious duplicate pair).
 */
function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const tokensA = new Set(a.split("-").filter(Boolean));
  const tokensB = new Set(b.split("-").filter(Boolean));
  const intersectionSize = [...tokensA].filter((t) => tokensB.has(t)).length;
  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const jaccard = unionSize === 0 ? 0 : intersectionSize / unionSize;
  const isPrefixPair = a.startsWith(b) || b.startsWith(a);
  return isPrefixPair ? Math.max(jaccard, DUPLICATE_SIMILARITY_THRESHOLD) : jaccard;
}

export function buildRecommendations(input: RecommendInput): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (input.inboxCount > 0) {
    recommendations.push({
      id: "inbox",
      kind: "inbox-triage",
      title: `${input.inboxCount} skill(s) awaiting triage`,
      detail: "New skills are sitting in the inbox unclassified — run triage to route them.",
      skills: [],
      action: "triage",
    });
  }

  // Global scope only: a global skill carries always-on token cost every session, whether or not
  // it's used; an idle project/profile-scope skill costs nothing when its project isn't active.
  const unusedGlobal = input.registry
    .filter((entry) => entry.scope === "global" && !input.usedSkillNames.has(entry.skill.name))
    .map((entry) => entry.skill.name)
    .sort();
  for (const name of unusedGlobal) {
    recommendations.push({
      id: `unused:${name}`,
      kind: "unused-skill",
      title: `"${name}" unused for ${RECOMMEND_WINDOW_DAYS}+ days`,
      detail: `No recorded usage in the last ${RECOMMEND_WINDOW_DAYS} days; it still costs tokens every session. Consider archiving it.`,
      skills: [name],
      scope: "global",
      action: "archive",
    });
  }

  // A skill name can appear in more than one scope (global + a project override); dedupe by pair
  // id so the same two names never get flagged twice just because one of them is deployed twice.
  const nonArchived = input.registry.filter((entry) => entry.scope !== "archive");
  const seenPairIds = new Set<string>();
  let duplicatePairCount = 0;
  outer: for (let i = 0; i < nonArchived.length; i++) {
    for (let j = i + 1; j < nonArchived.length; j++) {
      const a = nonArchived[i].skill.name;
      const b = nonArchived[j].skill.name;
      if (a === b) continue;
      const similarity = nameSimilarity(a, b);
      if (similarity < DUPLICATE_SIMILARITY_THRESHOLD) continue;
      const [first, second] = a < b ? [a, b] : [b, a];
      const pairId = `dup:${first}+${second}`;
      if (seenPairIds.has(pairId)) continue;
      seenPairIds.add(pairId);
      recommendations.push({
        id: pairId,
        kind: "duplicate-pair",
        title: `"${first}" and "${second}" look similar`,
        detail: `Name similarity ${Math.round(similarity * 100)}% — consider merging or archiving one.`,
        skills: [first, second],
        action: "dedupe",
      });
      duplicatePairCount++;
      if (duplicatePairCount >= MAX_DUPLICATE_PAIRS) break outer;
    }
  }

  if (input.globalTokens > TOKEN_COST_THRESHOLD) {
    recommendations.push({
      id: "token-cost",
      kind: "token-cost",
      title: `Always-on token cost is high (${input.globalTokens} tokens)`,
      detail: `Global-scope skills cost ~${input.globalTokens} tokens every session (threshold ${TOKEN_COST_THRESHOLD}). Review which skills truly need to be global.`,
      skills: [],
      action: "review",
    });
  }

  return recommendations;
}

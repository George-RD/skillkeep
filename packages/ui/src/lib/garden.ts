/**
 * Client-side garden model.
 *
 * DESIGN-FLAG: API RegistrySkill has no tier field. Tiers are derived client-side:
 * - scope === "archive" → pruned
 * - localStorage overrides for rooted/climbing
 * - default rooted for active scopes
 *
 * DESIGN-FLAG: No per-skill token cost endpoint. Token estimate =
 * description-length heuristic (chars/4) + usage summary when present.
 *
 * DESIGN-FLAG: Exposure verdicts (active/stale/dormant) derived from
 * usage rows + unused-skill recommendations — not a first-class server field.
 */

import type {
  DetectedSkill,
  Recommendation,
  RegistryScope,
  RegistrySkill,
  StatusReport,
  UsageRow,
} from "../api/types";

export type Tier = "rooted" | "climbing" | "pruned";
export type Exposure = "active" | "stale" | "dormant";
export type Perspective = "garden" | "cost" | "exposure";
export type Mode = "garden" | "triage" | "deploy" | "rot" | "settings" | "detail" | "devices";

const TIER_STORAGE_KEY = "skillkeep.tiers.v1";

export interface GardenSkill {
  name: string;
  description: string | null;
  hash: string;
  scope: string;
  tier: Tier;
  /** Estimated resident tokens when rooted (description heuristic). */
  tokenEstimate: number;
  usageTokens: number;
  costMicroUsd: number | null;
  costPerUse: number | null;
  exposure: Exposure;
  rotFlags: Array<"duplicate" | "stale" | "drift" | "inbox">;
}

function loadTierMap(): Record<string, Tier> {
  try {
    const raw = localStorage.getItem(TIER_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, Tier>;
  } catch {
    /* ignore */
  }
  return {};
}

export function saveTier(name: string, tier: Tier): void {
  const map = loadTierMap();
  map[name] = tier;
  try {
    localStorage.setItem(TIER_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function readTier(name: string, scope: string): Tier {
  if (scope === "archive") return "pruned";
  const map = loadTierMap();
  const stored = map[name];
  if (stored === "rooted" || stored === "climbing" || stored === "pruned") return stored;
  return "rooted";
}

/** Rough token estimate from description length (chars/4). */
export function estimateTokens(description: string | null | undefined): number {
  if (!description) return 120; /* DESIGN-FLAG: floor for missing description */
  return Math.max(40, Math.round(description.length / 4));
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function formatCost(microUsd: number | null): string {
  if (microUsd == null) return "—";
  const usd = microUsd / 1_000_000;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function usageWindow(): { from: string; to: string } {
  return { from: isoDaysAgo(30), to: isoDaysAgo(0) };
}

export function buildGardenSkills(
  scopes: RegistryScope[] | undefined,
  usageBySkill: Map<string, UsageRow>,
  recommendations: Recommendation[] | undefined,
  status: StatusReport | undefined,
): GardenSkill[] {
  const unused = new Set<string>();
  const duplicates = new Set<string>();
  for (const rec of recommendations ?? []) {
    if (rec.kind === "unused-skill") for (const s of rec.skills) unused.add(s);
    if (rec.kind === "duplicate-pair") for (const s of rec.skills) duplicates.add(s);
  }
  const driftSet = new Set(status?.drift ?? []);
  const dupStatus = new Set(status?.duplicates ?? []);

  const out: GardenSkill[] = [];
  for (const scope of scopes ?? []) {
    for (const skill of scope.skills) {
      out.push(enrichSkill(skill, scope.scope, usageBySkill, unused, duplicates, driftSet, dupStatus));
    }
  }
  return out;
}

function enrichSkill(
  skill: RegistrySkill,
  scope: string,
  usageBySkill: Map<string, UsageRow>,
  unused: Set<string>,
  duplicates: Set<string>,
  driftSet: Set<string>,
  dupStatus: Set<string>,
): GardenSkill {
  const tier = readTier(skill.name, scope);
  const tokenEstimate = estimateTokens(skill.description);
  const usage = usageBySkill.get(skill.name);
  const usageTokens =
    (usage?.input ?? 0) + (usage?.output ?? 0) + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0);
  const costMicroUsd = usage?.costMicroUsd ?? null;
  const costPerUse =
    usageTokens > 0 && costMicroUsd != null ? costMicroUsd / Math.max(1, usageTokens / 1000) : null;

  let exposure: Exposure = "active";
  if (unused.has(skill.name) || usageTokens === 0) {
    exposure = unused.has(skill.name) ? "dormant" : "stale";
  } else if (usageTokens < 500) {
    exposure = "stale";
  }

  const rotFlags: GardenSkill["rotFlags"] = [];
  if (duplicates.has(skill.name) || dupStatus.has(skill.name)) rotFlags.push("duplicate");
  if (exposure === "dormant" || exposure === "stale") rotFlags.push("stale");
  if (driftSet.has(skill.name) || [...driftSet].some((d) => d.includes(skill.name))) {
    rotFlags.push("drift");
  }

  return {
    name: skill.name,
    description: skill.description,
    hash: skill.hash,
    scope,
    tier,
    tokenEstimate,
    usageTokens,
    costMicroUsd,
    costPerUse,
    exposure,
    rotFlags,
  };
}

/** Resident token budget = sum of rooted skill estimates. */
export function residentBudget(skills: GardenSkill[]): number {
  return skills.filter((s) => s.tier === "rooted").reduce((sum, s) => sum + s.tokenEstimate, 0);
}

export function budgetDelta(from: Tier, to: Tier, tokens: number): number {
  const rooted = (t: Tier) => (t === "rooted" ? tokens : 0);
  return rooted(to) - rooted(from);
}

export function formatBudgetDelta(delta: number): string {
  if (delta === 0) return "no resident change";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatTokens(Math.abs(delta))} resident tokens`;
}

/** Unmanaged/duplicate skills from /api/scan (detect surface). Does not include inboxDirs. */
export function seedlingSkills(scan: DetectedSkill[] | undefined): DetectedSkill[] {
  return (scan ?? []).filter((s) => s.state === "unmanaged" || s.state === "duplicate");
}

/** Parse "N skill(s) awaiting triage" style titles/details from recommendations (legacy fallback). */
export function inboxCountFromRecommendations(
  recommendations: Recommendation[] | undefined,
  findings: { kind: string; detail: string }[] | undefined,
): number {
  const inboxRec = (recommendations ?? []).find((r) => r.kind === "inbox-triage");
  if (inboxRec) {
    const m = /(\d+)\s*skill/.exec(inboxRec.title) ?? /(\d+)/.exec(inboxRec.title);
    if (m) return Number(m[1]);
  }
  for (const f of findings ?? []) {
    if (f.kind === "inbox-nonempty" || /awaiting triage/i.test(f.detail)) {
      const m = /(\d+)/.exec(f.detail);
      if (m) return Number(m[1]);
    }
  }
  return 0;
}

/**
 * Shared "awaiting" truth for shell, rot, and triage.
 * Prefer live GET /api/inbox length; fall back to max(scan, rec) only when inbox is unknown.
 */
export function sharedAwaitingCount(
  inboxCount: number | null,
  scanSeedlings: number,
  recInboxCount: number,
): number {
  if (inboxCount != null) return inboxCount;
  return Math.max(scanSeedlings, recInboxCount);
}

export function sortGarden(
  skills: GardenSkill[],
  perspective: Perspective,
  sort: "name" | "cost" | "exposure" | "tier",
): GardenSkill[] {
  const copy = [...skills];
  const exposureRank: Record<Exposure, number> = { dormant: 0, stale: 1, active: 2 };
  const tierRank: Record<Tier, number> = { rooted: 0, climbing: 1, pruned: 2 };

  copy.sort((a, b) => {
    if (perspective === "cost" || sort === "cost") {
      const ca = a.costMicroUsd ?? a.tokenEstimate;
      const cb = b.costMicroUsd ?? b.tokenEstimate;
      if (cb !== ca) return cb - ca;
    }
    if (perspective === "exposure" || sort === "exposure") {
      const ea = exposureRank[a.exposure];
      const eb = exposureRank[b.exposure];
      if (ea !== eb) return ea - eb;
    }
    if (sort === "tier") {
      const ta = tierRank[a.tier];
      const tb = tierRank[b.tier];
      if (ta !== tb) return ta - tb;
    }
    return a.name.localeCompare(b.name);
  });
  return copy;
}

export function filterGarden(
  skills: GardenSkill[],
  opts: { scope: string | "all"; tier: Tier | "all"; query: string },
): GardenSkill[] {
  const q = opts.query.trim().toLowerCase();
  return skills.filter((s) => {
    if (opts.scope !== "all" && s.scope !== opts.scope) return false;
    if (opts.tier !== "all" && s.tier !== opts.tier) return false;
    if (q === "") return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description?.toLowerCase().includes(q) ?? false) ||
      s.scope.toLowerCase().includes(q) ||
      s.hash.toLowerCase().includes(q)
    );
  });
}

export function usageMap(rows: UsageRow[] | undefined): Map<string, UsageRow> {
  const m = new Map<string, UsageRow>();
  for (const r of rows ?? []) m.set(r.key, r);
  return m;
}

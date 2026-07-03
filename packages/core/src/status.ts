import * as path from "node:path";
import { matchScope } from "./match";
import { tildeExpand } from "./paths";
import { type RegistryEntry, scanRegistry } from "./registry";
import { hashSkillDir, scanSkillDirs } from "./skill";
import { estimateTokens } from "./tokens";
import type { Rules, SkillMeta } from "./types";

/** Census of registry + inbox: counts, token estimates, duplicates, misplacements, invalids. */
export interface StatusReport {
  inboxCount: number;
  inboxTokenEstimate: number;
  registryCounts: Record<string, number>;
  registryTokenEstimate: number;
  duplicates: { name: string; scopes: string[] }[];
  misplacements: { name: string; currentScope: string; expectedScope: string }[];
  invalid: { name: string; scope: string }[];
}

/** Scan all configured inbox directories and return their combined skills (never throws for a missing dir). */
async function scanInboxes(inboxDirs: string[]): Promise<SkillMeta[]> {
  const skills: SkillMeta[] = [];
  for (const dir of inboxDirs) {
    skills.push(...(await scanSkillDirs(tildeExpand(dir))));
  }
  return skills;
}

/** Census of the registry plus inbox: counts, token estimates, duplicates, misplacements, invalids. */
export async function buildStatus(
  registryRoot: string,
  rules: Rules,
  inboxDirs: string[],
): Promise<StatusReport> {
  const inbox = await scanInboxes(inboxDirs);
  const registry = await scanRegistry(registryRoot);

  const registryCounts: Record<string, number> = {};
  for (const entry of registry)
    registryCounts[entry.scope] = (registryCounts[entry.scope] ?? 0) + 1;

  const byName = new Map<string, RegistryEntry[]>();
  for (const entry of registry) {
    const list = byName.get(entry.skill.name) ?? [];
    list.push(entry);
    byName.set(entry.skill.name, list);
  }
  const duplicates: StatusReport["duplicates"] = [];
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    duplicates.push({ name, scopes: list.map((e) => e.scope) });
  }

  const misplacements: StatusReport["misplacements"] = [];
  for (const entry of registry) {
    if (entry.scope === "archive") continue; // archived is a deliberate override, never "misplaced"
    const expected = matchScope(entry.skill.name, rules);
    if (
      expected &&
      expected !== entry.scope &&
      (entry.scope === "global" || expected.startsWith("project/"))
    ) {
      misplacements.push({
        name: entry.skill.name,
        currentScope: entry.scope,
        expectedScope: expected,
      });
    }
  }
  for (const skill of inbox) {
    const expected = matchScope(skill.name, rules);
    if (expected)
      misplacements.push({ name: skill.name, currentScope: "inbox", expectedScope: expected });
  }

  const invalid = [
    ...inbox.filter((s) => s.invalid).map((s) => ({ name: s.name, scope: "inbox" })),
    ...registry.filter((e) => e.skill.invalid).map((e) => ({ name: e.skill.name, scope: e.scope })),
  ];

  return {
    inboxCount: inbox.length,
    inboxTokenEstimate: estimateTokens(inbox),
    registryCounts,
    registryTokenEstimate: estimateTokens(registry.map((e) => e.skill)),
    duplicates,
    misplacements,
    invalid,
  };
}

/** Token estimate for what a plain non-project session actually loads: global scope only. */
export async function globalOnlyTokenEstimate(registryRoot: string): Promise<number> {
  const globalSkills = await scanSkillDirs(path.join(registryRoot, "skills", "global"));
  return estimateTokens(globalSkills);
}

/** Compare hashes between a registry scope dir and a repo's committed .agents/skills to detect drift. */
export async function committedModeDrift(
  registryScopeDir: string,
  repoSkillsDir: string,
): Promise<{ name: string; registryHash: string; repoHash: string }[]> {
  const registrySkills = await scanSkillDirs(registryScopeDir);
  const drift: { name: string; registryHash: string; repoHash: string }[] = [];
  for (const skill of registrySkills) {
    const repoDir = path.join(repoSkillsDir, skill.name);
    const registryHash = await hashSkillDir(skill.dir);
    let repoHash: string;
    try {
      repoHash = await hashSkillDir(repoDir);
    } catch {
      repoHash = "missing";
    }
    if (registryHash !== repoHash) drift.push({ name: skill.name, registryHash, repoHash });
  }
  return drift;
}

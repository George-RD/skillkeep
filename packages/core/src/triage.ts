import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { gitCommitAll } from "./git";
import { matchScope } from "./match";
import { skillDirInScope, tildeExpand } from "./paths";
import { scanSkillDirs } from "./skill";
import type { Rules, SkillMeta } from "./types";

/** One inbox skill paired with its rule-matched destination scope (null = unmatched, stays queued). */
export interface TriagePlanItem {
  skill: SkillMeta;
  scope: string | null; // null = unmatched, goes to queue
}

/** Scan all inbox dirs, match each valid skill against rules, return a triage plan (never throws for a missing dir). */
export async function planTriage(rules: Rules, inboxDirs: string[]): Promise<TriagePlanItem[]> {
  const inbox: SkillMeta[] = [];
  for (const dir of inboxDirs) {
    inbox.push(...(await scanSkillDirs(tildeExpand(dir))));
  }
  return inbox
    .filter((skill) => !skill.invalid)
    .map((skill) => ({ skill, scope: matchScope(skill.name, rules) }));
}

/**
 * Apply rule-matched moves: copy each item into its registry scope, commit in the registry,
 * then delete the routed items from their source dirs and commit that deletion in inboxGitRoot.
 * Returns the names actually routed (skips + reports name collisions at destination).
 */
export async function applyTriageMoves(
  registryRoot: string,
  items: TriagePlanItem[],
  inboxGitRoot: string,
): Promise<{ routed: string[]; skipped: { name: string; reason: string }[] }> {
  const routed: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const item of items) {
    if (!item.scope) continue;
    const dest = skillDirInScope(registryRoot, item.scope, item.skill.name);
    if (existsSync(dest)) {
      skipped.push({ name: item.skill.name, reason: `already exists at ${item.scope}` });
      continue;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(item.skill.dir, dest, { recursive: true });
    routed.push(item.skill.name);
  }
  if (routed.length > 0) {
    await gitCommitAll(
      registryRoot,
      `triage: route ${routed.length} skill(s) — ${routed.join(", ")}`,
      ["skills"],
    );
    const deletedRelPaths = new Set<string>();
    for (const item of items) {
      if (!routed.includes(item.skill.name)) continue;
      await fs.rm(item.skill.dir, { recursive: true, force: true });
      const rel = path.relative(inboxGitRoot, item.skill.dir);
      if (!rel.startsWith("..") && rel !== "") deletedRelPaths.add(rel);
    }
    if (deletedRelPaths.size > 0) {
      await gitCommitAll(inboxGitRoot, `skill-triage: routed ${routed.length} skills`, [
        ...deletedRelPaths,
      ]);
    }
  }
  return { routed, skipped };
}

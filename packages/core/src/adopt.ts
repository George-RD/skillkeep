import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { DetectedSkill } from "./detect";
import { gitCommitAll } from "./git";
import { planSymlink } from "./link";
import { CLIENT_DIRS, clientUserDir, skillDirInScope } from "./paths";
import { ensureScopeDirName, findInRegistry } from "./registry";
import { hashSkillDir } from "./skill";
import type { Config, Scope } from "./types";

/** Adopt a skill from a source path into a registry scope, optionally removing the source. Returns the destination path. */
export async function adoptSkill(
  registryRoot: string,
  sourcePath: string,
  scope: string,
  rm: boolean,
): Promise<string> {
  ensureScopeDirName(scope);
  const name = path.basename(sourcePath.replace(/\/$/, ""));
  if (!name) throw new Error(`cannot infer skill name from path: ${sourcePath}`);
  const dest = skillDirInScope(registryRoot, scope, name);
  if (existsSync(dest)) throw new Error(`skill "${name}" already exists at ${scope}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(sourcePath, dest, { recursive: true });
  await gitCommitAll(registryRoot, `adopt: ${name} -> ${scope}`, ["skills"]);
  if (rm) await fs.rm(sourcePath, { recursive: true, force: true });
  return dest;
}

/** Move a named skill from its current scope to a new scope within the registry. */
export async function moveSkill(registryRoot: string, name: string, scope: string): Promise<void> {
  ensureScopeDirName(scope);
  const entry = await findInRegistry(registryRoot, name);
  if (!entry) throw new Error(`skill "${name}" not found in registry`);
  if (entry.scope === scope) throw new Error(`skill "${name}" is already at ${scope}`);
  const dest = skillDirInScope(registryRoot, scope, name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(entry.skill.dir, dest);
  await gitCommitAll(registryRoot, `move: ${name} ${entry.scope} -> ${scope}`, ["skills"]);
}

/** Convenience wrapper: move a skill to the archive scope. */
export async function archiveSkill(registryRoot: string, name: string): Promise<void> {
  await moveSkill(registryRoot, name, "archive");
}

/**
 * Create a managed link or copy at the surface where a detected skill was found,
 * so after adoption the skill reappears as a managed artifact (not a loose copy).
 */
async function syncOneSurface(skill: DetectedSkill, scope: Scope, config: Config): Promise<void> {
  const registryDir = skillDirInScope(config.registryRoot, scope, skill.name);
  if (skill.surface === "user") {
    const userDir = clientUserDir(skill.client);
    const linkPath = path.join(userDir, skill.name);
    if (config.linkMode === "copy") {
      await fs.mkdir(userDir, { recursive: true });
      await fs.rm(linkPath, { recursive: true, force: true });
      await fs.cp(registryDir, linkPath, { recursive: true });
    } else {
      await planSymlink(linkPath, registryDir, false);
    }
    return;
  }
  // Repo surface: link into the repo's canonical .agents/skills dir.
  if (!skill.repoPath)
    throw new Error(`repo-surface skill "${skill.name}" has no repoPath (caller bug)`);
  const agentsDir = path.join(skill.repoPath, CLIENT_DIRS.agents.repoRelDir);
  const linkPath = path.join(agentsDir, skill.name);
  if (config.linkMode === "copy") {
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.rm(linkPath, { recursive: true, force: true });
    await fs.cp(registryDir, linkPath, { recursive: true });
  } else {
    await planSymlink(linkPath, registryDir, false);
  }
}

/** Outcome of a single adoption: either success, or a rejection with a human-readable reason. */
export type AdoptResult = { ok: true } | { ok: false; error: string };

/**
 * Adopt a detected skill into a registry scope: copy to registry, delete source, targeted sync.
 * Rejects (does not touch source) if the name already exists at that scope with different content.
 */
export async function adoptDetected(
  skill: DetectedSkill,
  scope: Scope,
  config: Config,
): Promise<AdoptResult> {
  ensureScopeDirName(scope);
  const dest = skillDirInScope(config.registryRoot, scope, skill.name);
  if (existsSync(dest)) {
    const destHash = await hashSkillDir(dest);
    if (destHash !== skill.hash) {
      return {
        ok: false,
        error: `conflict: ${skill.name} already in registry at ${scope} with different content`,
      };
    }
    // Same hash — already adopted; just clean up the source and re-sync the surface.
  } else {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(skill.path, dest, { recursive: true });
  }
  await fs.rm(skill.path, { recursive: true, force: true });
  await syncOneSurface(skill, scope, config);
  return { ok: true };
}

/**
 * Bulk-adopt detected skills, one scope per item. Never aborts on a single conflict —
 * collects per-item results so the caller can report partial success.
 */
export async function adoptDetectedBulk(
  items: { skill: DetectedSkill; scope: Scope }[],
  config: Config,
): Promise<{ name: string; ok: boolean; error?: string }[]> {
  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const { skill, scope } of items) {
    const result = await adoptDetected(skill, scope, config);
    if (result.ok) {
      results.push({ name: skill.name, ok: true });
    } else {
      results.push({ name: skill.name, ok: false, error: result.error });
    }
  }
  return results;
}

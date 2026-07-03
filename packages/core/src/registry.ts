import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { scanSkillDirs } from "./skill";
import type { SkillMeta } from "./types";

/** One skill deployed in the registry, tagged with the scope it lives at. */
export interface RegistryEntry {
  scope: string;
  skill: SkillMeta;
}

/** Enumerate every skill currently deployed in the registry, tagged with its scope. */
export async function scanRegistry(registryRoot: string): Promise<RegistryEntry[]> {
  const entries: RegistryEntry[] = [];
  const skillsRoot = path.join(registryRoot, "skills");
  let topLevel: Dirent[];
  try {
    topLevel = await fs.readdir(skillsRoot, { withFileTypes: true });
  } catch {
    topLevel = [];
  }
  for (const top of topLevel) {
    if (!top.isDirectory()) continue;
    if (top.name === "global" || top.name === "archive") {
      for (const skill of await scanSkillDirs(path.join(skillsRoot, top.name))) {
        entries.push({ scope: top.name, skill });
      }
      continue;
    }
    if (top.name !== "project" && top.name !== "profile") continue;
    const groupDir = path.join(skillsRoot, top.name);
    let groups: Dirent[];
    try {
      groups = await fs.readdir(groupDir, { withFileTypes: true });
    } catch {
      groups = [];
    }
    for (const group of groups) {
      if (!group.isDirectory()) continue;
      const scope = `${top.name}/${group.name}`;
      for (const skill of await scanSkillDirs(path.join(groupDir, group.name))) {
        entries.push({ scope, skill });
      }
    }
  }
  return entries;
}

/** Find where a named skill currently lives in the registry (undefined if absent). */
export async function findInRegistry(
  registryRoot: string,
  name: string,
): Promise<RegistryEntry | undefined> {
  return (await scanRegistry(registryRoot)).find((e) => e.skill.name === name);
}

/** Validate that a scope string conforms to global / archive / project/<name> / profile/<name>. */
export function ensureScopeDirName(scope: string): void {
  if (scope === "global" || scope === "archive") return;
  if (scope.startsWith("project/") || scope.startsWith("profile/")) return;
  throw new Error(
    `invalid scope "${scope}" (expected global, archive, project/<name>, or profile/<name>)`,
  );
}

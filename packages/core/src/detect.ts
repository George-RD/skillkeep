import { type Dirent, existsSync, type Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CLIENT_DIRS, clientUserDir, tildeExpand } from "./paths";
import { scanRegistry } from "./registry";
import { hashSkillDir, scanSkillDirs } from "./skill";
import { estimateTokens } from "./tokens";
import type { ClientId, Config, SkillMeta } from "./types";

const ALL_CLIENTS: ClientId[] = ["omp", "claude", "agents", "codex", "opencode"];

/** Classification of a detected skill relative to the registry. */
export type DetectedState = "managed" | "unmanaged" | "duplicate" | "drifted" | "invalid";

/** One skill install found on disk, classified against the registry. */
export interface DetectedSkill {
  name: string;
  description: string | null;
  hash: string;
  client: ClientId;
  surface: "user" | "repo";
  repoPath?: string;
  path: string;
  state: DetectedState;
  registryScope?: string;
}

/** Chars/4 token estimate split by surface: always-on global vs. per-repo. */
export interface TokenEstimate {
  global: number;
  perRepo: Record<string, number>;
}

/** Full result of a machine-wide skill census: every install, every repo found, every client seen. */
export interface Detection {
  skills: DetectedSkill[];
  repos: string[];
  clientsFound: ClientId[];
  tokenEstimate: TokenEstimate;
}

interface RawDetected {
  meta: SkillMeta;
  client: ClientId;
  surface: "user" | "repo";
  repoPath?: string;
}

interface RegistryIndexEntry {
  scope: string;
  hash: string;
}

/** Resolve the immediate absolute target of a symlink, or null if not a symlink or unreadable. */
async function symlinkTarget(linkPath: string): Promise<string | null> {
  let stat: Stats | null;
  try {
    stat = await fs.lstat(linkPath);
  } catch {
    return null;
  }
  if (!stat?.isSymbolicLink()) return null;
  const rel = await fs.readlink(linkPath);
  return path.resolve(path.dirname(linkPath), rel);
}

/** Build a name → {scope, hash} index from the registry for O(1) classification lookups. */
async function buildRegistryIndex(registryRoot: string): Promise<Map<string, RegistryIndexEntry>> {
  const index = new Map<string, RegistryIndexEntry>();
  for (const entry of await scanRegistry(registryRoot)) {
    const hash = await hashSkillDir(entry.skill.dir);
    index.set(entry.skill.name, { scope: entry.scope, hash });
  }
  return index;
}

/** Scan all client user-level dirs that exist on disk; collect skills with their surface tag. */
async function scanUserSurface(clientsFound: ClientId[]): Promise<RawDetected[]> {
  const found: RawDetected[] = [];
  for (const client of ALL_CLIENTS) {
    const userDir = clientUserDir(client);
    if (!existsSync(userDir)) continue;
    clientsFound.push(client);
    for (const meta of await scanSkillDirs(userDir)) {
      found.push({ meta, client, surface: "user" });
    }
  }
  return found;
}

/** Scan each repoRoot one level deep for git repos; collect repo-surface skills from every client dir. */
async function scanRepoSurface(
  repoRoots: string[],
  repos: string[],
  clientsFound: ClientId[],
): Promise<RawDetected[]> {
  const found: RawDetected[] = [];
  for (const repoRoot of repoRoots) {
    const expanded = tildeExpand(repoRoot);
    if (!existsSync(expanded)) continue;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(expanded, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const repoPath = path.join(expanded, entry.name);
      if (!existsSync(path.join(repoPath, ".git"))) continue;
      repos.push(repoPath);
      for (const client of ALL_CLIENTS) {
        const dir = path.join(repoPath, CLIENT_DIRS[client].repoRelDir);
        if (!existsSync(dir)) continue;
        if (!clientsFound.includes(client)) clientsFound.push(client);
        for (const meta of await scanSkillDirs(dir)) {
          found.push({ meta, client, surface: "repo", repoPath });
        }
      }
    }
  }
  return found;
}

/**
 * Detect every skill installed on the machine across all client surfaces and repos.
 * Classifies each as managed / unmanaged / duplicate / drifted / invalid against the registry.
 * Never throws for a missing client dir or repo — a wrong entry silently yields zero skills.
 */
export async function detectAll(config: Config): Promise<Detection> {
  const registryIndex = await buildRegistryIndex(config.registryRoot);
  const clientsFound: ClientId[] = [];
  const repos: string[] = [];

  const rawSkills = [
    ...(await scanUserSurface(clientsFound)),
    ...(await scanRepoSurface(config.repoRoots, repos, clientsFound)),
  ];

  // Pass 1: compute hash and assign managed / drifted / invalid / unmanaged (duplicate deferred).
  const detected: DetectedSkill[] = [];
  for (const raw of rawSkills) {
    const skillPath = raw.meta.dir;
    const hash = await hashSkillDir(skillPath);
    const reg = registryIndex.get(raw.meta.name);
    const link = await symlinkTarget(skillPath);
    const resolvesIntoRegistry =
      link !== null &&
      (link === config.registryRoot || link.startsWith(`${config.registryRoot}${path.sep}`));

    let state: DetectedState;
    let registryScope: string | undefined;

    if (resolvesIntoRegistry || (reg !== undefined && reg.hash === hash)) {
      state = "managed";
      registryScope = reg?.scope;
    } else if (reg !== undefined && reg.hash !== hash) {
      state = "drifted";
      registryScope = reg.scope;
    } else if (raw.meta.invalid) {
      state = "invalid";
    } else {
      state = "unmanaged";
    }

    detected.push({
      name: raw.meta.name,
      description: raw.meta.description,
      hash,
      client: raw.client,
      surface: raw.surface,
      repoPath: raw.repoPath,
      path: skillPath,
      state,
      registryScope,
    });
  }

  // Pass 2: duplicate detection — same name at 2+ non-registry paths overrides invalid/unmanaged.
  const nameToCount = new Map<string, number>();
  for (const skill of detected) {
    if (skill.state === "managed" || skill.state === "drifted") continue;
    nameToCount.set(skill.name, (nameToCount.get(skill.name) ?? 0) + 1);
  }
  for (const skill of detected) {
    if (skill.state === "managed" || skill.state === "drifted") continue;
    if ((nameToCount.get(skill.name) ?? 0) >= 2) skill.state = "duplicate";
  }

  // Token estimate: global for user-surface skills, perRepo keyed by repoPath for repo-surface skills.
  const perRepo: Record<string, number> = {};
  for (const repo of repos) {
    perRepo[repo] = estimateTokens(
      detected.filter((s) => s.surface === "repo" && s.repoPath === repo),
    );
  }

  return {
    skills: detected,
    repos,
    clientsFound,
    tokenEstimate: {
      global: estimateTokens(detected.filter((s) => s.surface === "user")),
      perRepo,
    },
  };
}

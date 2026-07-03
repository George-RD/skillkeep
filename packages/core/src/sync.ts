import { type Dirent, existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import YAML from "yaml";
import { readYamlDocument, writeYamlDocument } from "./config";
import { gitAddExclude, gitIsIgnored, gitWorktrees } from "./git";
import { planSymlink, pruneDanglingRegistrySymlinks } from "./link";
import { CLIENT_DIRS, clientUserDir, scopeDir, tildeCollapse, tildeExpand } from "./paths";
import { hashSkillDir, scanSkillDirs } from "./skill";
import type { ClientId, Config, LinkMode, ProjectConfig } from "./types";

/** Sync run parameters: whether to actually mutate the filesystem and whether to prune stale entries. */
export interface SyncOptions {
  dryRun: boolean;
  prune: boolean;
}

/** Accumulated outcome of a sync run: what was created, fixed, pruned, still needs review, or failed. */
export interface SyncReport {
  created: string[];
  fixed: string[];
  pruned: string[];
  configReminders: string[];
  errors: string[];
}

/**
 * Resolve the effective link mode from the configured value and platform.
 * darwin/linux → symlink always; win32 → probe-gated (Developer Mode required).
 */
export async function resolveLinkMode(
  configured: LinkMode,
  platform: NodeJS.Platform,
  probe: () => Promise<boolean>,
): Promise<LinkMode> {
  if (configured === "copy") return "copy";
  if (platform === "darwin" || platform === "linux") return "symlink";
  return (await probe()) ? "symlink" : "copy";
}

async function mkdirIfReal(dir: string, dryRun: boolean): Promise<void> {
  if (!dryRun) await fs.mkdir(dir, { recursive: true });
}

/** Copy srcDir to destDir iff their hashes differ; push to report.created on a real copy. Shared by committed-mode and copy-farms. */
async function copyHashVerify(
  srcDir: string,
  destDir: string,
  opts: SyncOptions,
  report: SyncReport,
): Promise<void> {
  const srcHash = await hashSkillDir(srcDir);
  let destHash: string | null;
  try {
    destHash = await hashSkillDir(destDir);
  } catch {
    destHash = null;
  }
  if (srcHash === destHash) return;
  report.created.push(destDir);
  if (opts.dryRun) return;
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.mkdir(destDir, { recursive: true });
  await fs.cp(srcDir, destDir, { recursive: true });
}

async function syncGlobalFarms(
  config: Config,
  opts: SyncOptions,
  report: SyncReport,
): Promise<void> {
  const globalSkills = await scanSkillDirs(scopeDir(config.registryRoot, "global"));
  for (const client of config.globalClients) {
    const userDir = clientUserDir(client);
    await mkdirIfReal(userDir, opts.dryRun);
    for (const skill of globalSkills) {
      try {
        const action = await planSymlink(path.join(userDir, skill.name), skill.dir, opts.dryRun);
        if (action.kind === "create") report.created.push(action.linkPath);
        if (action.kind === "fix") report.fixed.push(action.linkPath);
      } catch (err) {
        report.errors.push(String(err));
      }
    }
    report.pruned.push(
      ...(await pruneDanglingRegistrySymlinks(userDir, config.registryRoot, opts.dryRun)),
    );
  }
}

/** Copy-mode global farms: deploy global skills as content copies (not symlinks) into each client's user dir. */
async function copyGlobalFarms(
  config: Config,
  opts: SyncOptions,
  report: SyncReport,
): Promise<void> {
  const globalSkills = await scanSkillDirs(scopeDir(config.registryRoot, "global"));
  const wanted = new Set(globalSkills.map((s) => s.name));
  for (const client of config.globalClients) {
    const userDir = clientUserDir(client);
    await mkdirIfReal(userDir, opts.dryRun);
    for (const skill of globalSkills) {
      await copyHashVerify(skill.dir, path.join(userDir, skill.name), opts, report);
    }
    if (opts.prune) {
      let existing: Dirent[];
      try {
        existing = await fs.readdir(userDir, { withFileTypes: true });
      } catch {
        existing = [];
      }
      for (const entry of existing) {
        if (!entry.isDirectory() || wanted.has(entry.name)) continue;
        report.pruned.push(path.join(userDir, entry.name));
        if (!opts.dryRun)
          await fs.rm(path.join(userDir, entry.name), { recursive: true, force: true });
      }
    }
  }
}

/** Deploy scopeDirs' skills into <repoDir>/.agents/skills. Returns the managed skill names (this run's canonical set). */
async function linkScopeIntoAgentsDir(
  registryRoot: string,
  scopeDirs: string[],
  agentsDir: string,
  opts: SyncOptions,
  report: SyncReport,
): Promise<Map<string, string>> {
  await mkdirIfReal(agentsDir, opts.dryRun);
  const managed = new Map<string, string>();
  for (const scDir of scopeDirs) {
    for (const skill of await scanSkillDirs(scDir)) {
      managed.set(skill.name, skill.dir);
      try {
        const action = await planSymlink(path.join(agentsDir, skill.name), skill.dir, opts.dryRun);
        if (action.kind === "create") report.created.push(action.linkPath);
        if (action.kind === "fix") report.fixed.push(action.linkPath);
      } catch (err) {
        report.errors.push(String(err));
      }
    }
  }
  report.pruned.push(
    ...(await pruneDanglingRegistrySymlinks(agentsDir, registryRoot, opts.dryRun)),
  );
  return managed;
}

/** Mirror only the explicitly managed names into each sibling client dir — never the pre-existing directory listing. */
async function linkSiblingClients(
  registryRoot: string,
  agentsDir: string,
  repoDir: string,
  managedNames: Iterable<string>,
  repoClients: ClientId[],
  opts: SyncOptions,
  report: SyncReport,
): Promise<void> {
  for (const client of repoClients) {
    if (client === "agents") continue;
    const siblingDir = path.join(repoDir, CLIENT_DIRS[client].repoRelDir);
    await mkdirIfReal(siblingDir, opts.dryRun);
    for (const name of managedNames) {
      const target = path.join(agentsDir, name);
      try {
        const action = await planSymlink(path.join(siblingDir, name), target, opts.dryRun);
        if (action.kind === "create") report.created.push(action.linkPath);
        if (action.kind === "fix") report.fixed.push(action.linkPath);
      } catch (err) {
        report.errors.push(String(err));
      }
    }
    report.pruned.push(
      ...(await pruneDanglingRegistrySymlinks(siblingDir, [registryRoot, agentsDir], opts.dryRun)),
    );
  }
}

async function excludeIfNeeded(repoDir: string, relDir: string, opts: SyncOptions): Promise<void> {
  if (opts.dryRun) return;
  const ignored = await gitIsIgnored(repoDir, relDir);
  if (!ignored) await gitAddExclude(repoDir, relDir);
}

async function refreshCustomDirectories(
  repoDir: string,
  scopeDirs: string[],
  localConfig: boolean,
  opts: SyncOptions,
  report: SyncReport,
): Promise<void> {
  const configPath = path.join(repoDir, ".omp", "config.yml");
  const doc = (await readYamlDocument(configPath)) ?? new YAML.Document({});
  doc.setIn(
    ["skills", "customDirectories"],
    scopeDirs.map((dir) => tildeCollapse(dir)),
  );
  if (!opts.dryRun) await writeYamlDocument(configPath, doc);
  if (!localConfig) {
    report.configReminders.push(
      `${repoDir}: review + commit .omp/config.yml (skills.customDirectories)`,
    );
  }
}

async function syncCommittedMode(
  registryRoot: string,
  scopeDirs: string[],
  agentsDir: string,
  repoDir: string,
  repoClients: ClientId[],
  opts: SyncOptions,
  report: SyncReport,
): Promise<void> {
  await mkdirIfReal(agentsDir, opts.dryRun);
  const wanted = new Set<string>();
  for (const scDir of scopeDirs) {
    for (const skill of await scanSkillDirs(scDir)) {
      wanted.add(skill.name);
      await copyHashVerify(skill.dir, path.join(agentsDir, skill.name), opts, report);
    }
  }
  if (opts.prune) {
    let existing: Dirent[];
    try {
      existing = await fs.readdir(agentsDir, { withFileTypes: true });
    } catch {
      existing = [];
    }
    for (const entry of existing) {
      if (!entry.isDirectory() || wanted.has(entry.name)) continue;
      report.pruned.push(path.join(agentsDir, entry.name));
      if (!opts.dryRun)
        await fs.rm(path.join(agentsDir, entry.name), { recursive: true, force: true });
    }
  }
  await linkSiblingClients(registryRoot, agentsDir, repoDir, wanted, repoClients, opts, report);
  report.configReminders.push(`${repoDir}: review + commit .agents/skills (committed mode)`);
}

/** Stub pending implementation (commit 2). */
export function filterPersistentWorktrees(
  worktrees: string[],
  _repoRoot: string,
  _repoRoots: string[],
  _platform: NodeJS.Platform = process.platform,
): string[] {
  return worktrees;
}

/** Worktrees to materialise farms into: only those under a configured repoRoot — never scratch/ephemeral worktrees. */
async function persistentWorktrees(repoRoot: string, repoRoots: string[]): Promise<string[]> {
  // `git worktree list --porcelain` emits forward-slash paths even on Windows (git normalises
  // its own porcelain output for cross-platform consistency), while `tildeExpand` + `path.sep`
  // builds a backslash-separated prefix there — a literal `startsWith` never matched a single
  // worktree on win32, silently producing an empty result (see packages/core/test/sync.test.ts's
  // Windows CI failures: `report.created` came back `[]` for every repo-scoped sync). Route both
  // sides through `path.normalize`, which converts `/` to the platform separator on win32 and is
  // a no-op on POSIX, before comparing.
  const expanded = repoRoots.map((r) => path.normalize(`${tildeExpand(r)}${path.sep}`));
  const normalizedRoot = path.normalize(repoRoot);
  return (await gitWorktrees(repoRoot))
    .map((wt) => path.normalize(wt))
    .filter((wt) => expanded.some((prefix) => wt.startsWith(prefix)) || wt === normalizedRoot);
}

async function syncProject(
  config: Config,
  projectName: string,
  projectConfig: ProjectConfig,
  opts: SyncOptions,
  report: SyncReport,
): Promise<void> {
  const scopeDirs = [scopeDir(config.registryRoot, `project/${projectName}`)];
  for (const configuredRepo of projectConfig.repos) {
    const repoRoot = tildeExpand(configuredRepo);
    if (!existsSync(repoRoot)) {
      report.errors.push(
        `${projectName}: repo path absent on this machine, skipping — ${repoRoot}`,
      );
      continue;
    }
    for (const repoDir of await persistentWorktrees(repoRoot, config.repoRoots)) {
      const agentsDir = path.join(repoDir, CLIENT_DIRS.agents.repoRelDir);
      const useCopy = config.linkMode === "copy" || projectConfig.mode === "committed";
      if (useCopy) {
        await syncCommittedMode(
          config.registryRoot,
          scopeDirs,
          agentsDir,
          repoDir,
          config.repoClients,
          opts,
          report,
        );
        continue;
      }
      const managedNames = await linkScopeIntoAgentsDir(
        config.registryRoot,
        scopeDirs,
        agentsDir,
        opts,
        report,
      );
      await linkSiblingClients(
        config.registryRoot,
        agentsDir,
        repoDir,
        managedNames.keys(),
        config.repoClients,
        opts,
        report,
      );
      const excludeTargets = [
        ".agents/skills",
        ...config.repoClients.filter((c) => c !== "agents").map((c) => CLIENT_DIRS[c].repoRelDir),
      ];
      if (projectConfig.local_config) excludeTargets.push(".omp/config.yml");
      for (const rel of excludeTargets) await excludeIfNeeded(repoDir, rel, opts);
      await refreshCustomDirectories(
        repoDir,
        scopeDirs,
        Boolean(projectConfig.local_config),
        opts,
        report,
      );
    }
  }
}

/** Full sync: global farms + every configured project. Routes symlink vs copy per config.linkMode. */
export async function runSync(config: Config, opts: SyncOptions): Promise<SyncReport> {
  const report: SyncReport = {
    created: [],
    fixed: [],
    pruned: [],
    configReminders: [],
    errors: [],
  };
  if (config.linkMode === "copy") {
    await copyGlobalFarms(config, opts, report);
  } else {
    await syncGlobalFarms(config, opts, report);
  }
  for (const [projectName, projectConfig] of Object.entries(config.projects)) {
    await syncProject(config, projectName, projectConfig, opts, report);
  }
  return report;
}

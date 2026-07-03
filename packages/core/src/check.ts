import { type Dirent, existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import YAML from "yaml";
import { readYamlDocument } from "./config";
import { CLIENT_DIRS, scopeDir, tildeExpand } from "./paths";
import { scanSkillDirs } from "./skill";
import { committedModeDrift } from "./status";
import type { Config } from "./types";

/** One drift/dangling-link/dead-config/inbox issue surfaced by runCheck. */
export interface CheckFinding {
  kind: string;
  detail: string;
}

/** Find symlinks in dir that resolve into trustedRoots but whose full chain is broken (dangling). */
async function checkDanglingSymlinks(
  dir: string,
  trustedRoots: string[],
  findings: CheckFinding[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    const linkPath = path.join(dir, entry.name);
    const rel = await fs.readlink(linkPath);
    const abs = path.resolve(path.dirname(linkPath), rel);
    if (!trustedRoots.some((root) => abs.startsWith(`${root}${path.sep}`))) continue;
    if (!existsSync(linkPath)) {
      findings.push({ kind: "dangling-symlink", detail: `${linkPath} -> ${abs} (missing)` });
    }
  }
}

/** Verify that customDirectories entries in a repo's .omp/config.yml still point at real dirs. */
async function checkCustomDirectories(repoDir: string, findings: CheckFinding[]): Promise<void> {
  const configPath = path.join(repoDir, ".omp", "config.yml");
  const doc = await readYamlDocument(configPath);
  if (!doc) return;
  const dirsNode = doc.getIn(["skills", "customDirectories"]);
  if (!YAML.isSeq(dirsNode)) return;
  const dirs = dirsNode
    .toJSON()
    .filter((entry: unknown): entry is string => typeof entry === "string");
  for (const dir of dirs) {
    if (!existsSync(tildeExpand(dir))) {
      findings.push({ kind: "dead-custom-directory", detail: `${repoDir}: ${dir}` });
    }
  }
}

/** Full drift/dangling/custom-dir/inbox check across all configured clients, projects, and inboxes. */
export async function runCheck(config: Config): Promise<CheckFinding[]> {
  const findings: CheckFinding[] = [];

  for (const client of config.globalClients) {
    await checkDanglingSymlinks(
      tildeExpand(CLIENT_DIRS[client].userDir),
      [config.registryRoot],
      findings,
    );
  }

  for (const [projectName, projectConfig] of Object.entries(config.projects)) {
    for (const configuredRepo of projectConfig.repos) {
      const repoDir = tildeExpand(configuredRepo);
      if (!existsSync(repoDir)) continue;
      const agentsDir = path.join(repoDir, CLIENT_DIRS.agents.repoRelDir);
      for (const client of config.repoClients) {
        const roots =
          client === "agents" ? [config.registryRoot] : [config.registryRoot, agentsDir];
        await checkDanglingSymlinks(
          path.join(repoDir, CLIENT_DIRS[client].repoRelDir),
          roots,
          findings,
        );
      }
      await checkCustomDirectories(repoDir, findings);
      if (projectConfig.mode === "committed") {
        const registryScope = scopeDir(config.registryRoot, `project/${projectName}`);
        const repoSkillsDir = path.join(repoDir, CLIENT_DIRS.agents.repoRelDir);
        for (const drift of await committedModeDrift(registryScope, repoSkillsDir)) {
          findings.push({
            kind: "committed-drift",
            detail: `${projectName}/${drift.name}: registry=${drift.registryHash.slice(0, 8)} repo=${drift.repoHash === "missing" ? "missing" : drift.repoHash.slice(0, 8)}`,
          });
        }
      }
    }
  }

  let inboxCount = 0;
  for (const dir of config.inboxDirs) {
    inboxCount += (await scanSkillDirs(tildeExpand(dir))).length;
  }
  if (inboxCount > 0)
    findings.push({ kind: "inbox-nonempty", detail: `${inboxCount} skill(s) awaiting triage` });

  return findings;
}

import { afterEach, beforeEach, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import YAML from "yaml";
import { scopeDir, tildeCollapse } from "../src/paths";
import { hashSkillDir } from "../src/skill";
import type { SyncReport } from "../src/sync";
import { copyHashVerify, filterPersistentWorktrees, resolveLinkMode, runSync } from "../src/sync";
import type { Config } from "../src/types";

// --- resolveLinkMode tests ---

test("resolveLinkMode returns symlink on darwin without calling probe", async () => {
  const probe = async (): Promise<boolean> => {
    throw new Error("probe should not be called on darwin");
  };
  expect(await resolveLinkMode("symlink", "darwin", probe)).toBe("symlink");
});

test("resolveLinkMode returns symlink on linux without calling probe", async () => {
  const probe = async (): Promise<boolean> => {
    throw new Error("probe should not be called on linux");
  };
  expect(await resolveLinkMode("symlink", "linux", probe)).toBe("symlink");
});

test("resolveLinkMode probes on win32 and returns symlink when probe succeeds", async () => {
  expect(await resolveLinkMode("symlink", "win32", async () => true)).toBe("symlink");
});

test("resolveLinkMode probes on win32 and returns copy when probe fails", async () => {
  expect(await resolveLinkMode("symlink", "win32", async () => false)).toBe("copy");
});

test("resolveLinkMode respects explicit copy regardless of platform", async () => {
  const probe = async (): Promise<boolean> => {
    throw new Error("probe should not be called for copy");
  };
  expect(await resolveLinkMode("copy", "darwin", probe)).toBe("copy");
});

// --- filterPersistentWorktrees tests ---

test("filterPersistentWorktrees matches a worktree under a repoRoot despite win32 casing", () => {
  expect(
    filterPersistentWorktrees(["/repos/proj/wt-a"], "/repos/proj", ["/Repos"], "win32"),
  ).toEqual([path.normalize("/repos/proj/wt-a")]);
});

test("filterPersistentWorktrees matches the repo root itself despite win32 casing", () => {
  expect(
    filterPersistentWorktrees(["/REPOS/proj"], "/repos/proj", ["/elsewhere"], "win32"),
  ).toEqual([path.normalize("/REPOS/proj")]);
});

test("filterPersistentWorktrees rejects the same casing mismatch on linux", () => {
  expect(
    filterPersistentWorktrees(["/repos/proj/wt-a"], "/repos/proj", ["/Repos"], "linux"),
  ).toEqual([]);
  expect(
    filterPersistentWorktrees(["/REPOS/proj"], "/repos/proj", ["/elsewhere"], "linux"),
  ).toEqual([]);
});

test("filterPersistentWorktrees never lowercases the returned worktree strings", () => {
  const result = filterPersistentWorktrees(["/REPOS/proj"], "/repos/proj", ["/elsewhere"], "win32");
  // Case is preserved as git reported it; only the path separator is platform-normalized.
  expect(result[0]).toBe(path.normalize("/REPOS/proj"));
});

// --- Ported sync tests (adapted from agent-skills test/sync.test.ts) ---

let tmpDir: string;
let registryRoot: string;
let repoDir: string;
let config: Config;

beforeEach(() => {
  // Place the fixture under ~/repos so persistentWorktrees (filtered by repoRoots=["~/repos"]) keeps it.
  // A fresh CI runner has no ~/repos at all (only a dev machine that already uses this convention
  // does), so create it first -- mkdtempSync only creates the leaf temp dir, never its parent.
  const reposRoot = path.join(os.homedir(), "repos");
  fs.mkdirSync(reposRoot, { recursive: true });
  tmpDir = fs.mkdtempSync(path.join(reposRoot, "skillkeep-sync-test-"));
  registryRoot = path.join(tmpDir, "registry");
  repoDir = path.join(tmpDir, "repo");

  // Registry: one project-scoped skill.
  const projectSkillDir = path.join(
    registryRoot,
    "skills",
    "project",
    "demo-project",
    "demo-project-skill",
  );
  fs.mkdirSync(projectSkillDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectSkillDir, "SKILL.md"),
    "---\nname: demo-project-skill\ndescription: a project-scoped demo\n---\nbody",
  );

  // Repo: a real git repo so git shell-outs no-op correctly.
  fs.mkdirSync(repoDir, { recursive: true });
  execSync("git init", { cwd: repoDir, stdio: "ignore" });

  config = {
    registryRoot,
    repoRoots: ["~/repos"],
    globalClients: [],
    repoClients: ["claude"],
    linkMode: "symlink",
    inboxDirs: [],
    projects: {
      "demo-project": {
        repos: [repoDir],
      },
    },
    hub: null,
    ai: null,
  };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

type TreeEntry = { rel: string; kind: "dir" | "file" | "link"; detail: string | number };

function walk(dir: string, base = dir): TreeEntry[] {
  const out: TreeEntry[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full);
    if (e.isSymbolicLink()) {
      out.push({ rel, kind: "link", detail: fs.readlinkSync(full) });
    } else if (e.isDirectory()) {
      out.push({ rel, kind: "dir", detail: 0 });
      out.push(...walk(full, base));
    } else {
      out.push({ rel, kind: "file", detail: fs.lstatSync(full).size });
    }
  }
  return out;
}

test("dry-run mutates nothing", async () => {
  const before = walk(tmpDir);
  await runSync(config, { dryRun: true, prune: false });
  const after = walk(tmpDir);
  expect(after).toEqual(before);
});

test("dry-run reports the same plan a real run would execute", async () => {
  const report = await runSync(config, { dryRun: true, prune: false });
  const agentsLink = path.join(repoDir, ".agents", "skills", "demo-project-skill");
  expect(report.created).toContain(agentsLink);
  expect(report.configReminders.some((r) => r.startsWith(repoDir))).toBe(true);
});

test("a real run materialises the expected symlink and .omp/config.yml", async () => {
  const report = await runSync(config, { dryRun: false, prune: false });
  const agentsLink = path.join(repoDir, ".agents", "skills", "demo-project-skill");
  const skillDir = path.join(
    registryRoot,
    "skills",
    "project",
    "demo-project",
    "demo-project-skill",
  );

  expect(report.created).toContain(agentsLink);
  expect(fs.lstatSync(agentsLink).isSymbolicLink()).toBe(true);
  expect(fs.realpathSync(agentsLink)).toBe(fs.realpathSync(skillDir));

  const configPath = path.join(repoDir, ".omp", "config.yml");
  expect(fs.existsSync(configPath)).toBe(true);
  const cfg = YAML.parse(fs.readFileSync(configPath, "utf8")) as {
    skills: { customDirectories: string[] };
  };
  expect(cfg.skills.customDirectories).toEqual([
    tildeCollapse(scopeDir(registryRoot, "project/demo-project")),
  ]);
});

test("a linked git worktree under the same repoRoot gets the farm materialised too (persistentWorktrees' prefix-match branch, not just the wt === repoRoot fast path)", async () => {
  // `git worktree add` needs at least one real commit to branch from -- an inline identity keeps
  // this hermetic (no dependency on this machine's/runner's global git config existing).
  execSync("git -c user.email=test@example.com -c user.name=test commit --allow-empty -m init", {
    cwd: repoDir,
    stdio: "ignore",
  });
  // Sibling of repoDir, still under the same ~/repos/skillkeep-sync-test-* tmpDir -- i.e. still
  // under config.repoRoots=["~/repos"], so persistentWorktrees must include it via the
  // `expanded.some(prefix => wt.startsWith(prefix))` branch (it is NOT === repoDir, the only
  // branch every other test in this file exercises).
  const worktreeDir = path.join(tmpDir, "repo-worktree");
  execSync(`git worktree add -b wt-branch "${worktreeDir}"`, { cwd: repoDir, stdio: "ignore" });

  const report = await runSync(config, { dryRun: false, prune: false });
  const mainLink = path.join(repoDir, ".agents", "skills", "demo-project-skill");
  const worktreeLink = path.join(worktreeDir, ".agents", "skills", "demo-project-skill");

  expect(report.created).toContain(mainLink);
  expect(report.created).toContain(worktreeLink);
  expect(fs.lstatSync(worktreeLink).isSymbolicLink()).toBe(true);
  expect(fs.realpathSync(worktreeLink)).toBe(fs.realpathSync(mainLink));
});

test("sync is idempotent", async () => {
  await runSync(config, { dryRun: false, prune: false });
  const second = await runSync(config, { dryRun: false, prune: false });
  expect(second.created).toEqual([]);
  expect(second.fixed).toEqual([]);
});

test("copy-mode sync produces identical hash at destination", async () => {
  config.linkMode = "copy";
  const report = await runSync(config, { dryRun: false, prune: false });
  const destDir = path.join(repoDir, ".agents", "skills", "demo-project-skill");
  expect(report.created).toContain(destDir);
  // Destination is a real directory (not a symlink) with identical content.
  const lstat = fs.lstatSync(destDir);
  expect(lstat.isDirectory()).toBe(true);
  expect(lstat.isSymbolicLink()).toBe(false);
  const srcContent = fs.readFileSync(
    path.join(registryRoot, "skills", "project", "demo-project", "demo-project-skill", "SKILL.md"),
    "utf8",
  );
  const destContent = fs.readFileSync(path.join(destDir, "SKILL.md"), "utf8");
  expect(destContent).toBe(srcContent);
});

test("copyHashVerify leaves the old destination intact and no temp dir when the copy fails mid-way", async () => {
  const src = path.join(tmpDir, "cp-src");
  const dest = path.join(tmpDir, "cp-dest", "my-skill");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(
    path.join(src, "SKILL.md"),
    `---
description: new
---
new body
`,
  );
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(
    path.join(dest, "SKILL.md"),
    `---
description: old
---
old body
`,
  );
  const oldHash = await hashSkillDir(dest);
  const report: SyncReport = {
    created: [],
    fixed: [],
    pruned: [],
    errors: [],
    configReminders: [],
  };
  const failingCopy = async (_s: string, d: string): Promise<void> => {
    await fsp.mkdir(d, { recursive: true });
    await fsp.writeFile(path.join(d, "SKILL.md"), "half-written");
    throw new Error("disk full");
  };
  await expect(
    copyHashVerify(src, dest, { dryRun: false, prune: false }, report, failingCopy),
  ).rejects.toThrow("disk full");
  expect(await hashSkillDir(dest)).toBe(oldHash);
  const siblings = fs.readdirSync(path.dirname(dest));
  expect(siblings).toEqual(["my-skill"]);
});

test("copyHashVerify restores the old destination and cleans up when rename fails", async () => {
  const src = path.join(tmpDir, "cp-src");
  const dest = path.join(tmpDir, "cp-dest", "my-skill-rename-fail");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(
    path.join(src, "SKILL.md"),
    `---
description: new
---
new body
`,
  );
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(
    path.join(dest, "SKILL.md"),
    `---
description: old
---
old body
`,
  );
  const oldHash = await hashSkillDir(dest);
  const report: SyncReport = {
    created: [],
    fixed: [],
    pruned: [],
    errors: [],
    configReminders: [],
  };
  // In this copy function, we simulate a successful copy, but delete the copied directory
  // right before returning, causing the subsequent rename(tmpDir, destDir) to fail.
  const failingRenameCopy = async (_s: string, d: string): Promise<void> => {
    await fsp.mkdir(d, { recursive: true });
    await fsp.writeFile(path.join(d, "SKILL.md"), "new body");
    await fsp.rm(d, { recursive: true, force: true });
  };
  await expect(
    copyHashVerify(src, dest, { dryRun: false, prune: false }, report, failingRenameCopy),
  ).rejects.toThrow();
  expect(await hashSkillDir(dest)).toBe(oldHash);
  const siblings = fs.readdirSync(path.dirname(dest));
  expect(siblings).toEqual(["my-skill-rename-fail"]);
});

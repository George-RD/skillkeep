import { afterEach, beforeEach, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import YAML from "yaml";
import { scopeDir, tildeCollapse } from "../src/paths";
import { resolveLinkMode, runSync } from "../src/sync";
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

// --- Ported sync tests (adapted from agent-skills test/sync.test.ts) ---

let tmpDir: string;
let registryRoot: string;
let repoDir: string;
let config: Config;

beforeEach(() => {
  // Place the fixture under ~/repos so persistentWorktrees (filtered by repoRoots=["~/repos"]) keeps it.
  tmpDir = fs.mkdtempSync(path.join(os.homedir(), "repos", "skillkeep-sync-test-"));
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

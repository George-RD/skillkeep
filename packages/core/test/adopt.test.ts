import { afterEach, beforeEach, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { adoptDetected, adoptDetectedBulk } from "../src/adopt";
import type { DetectedSkill } from "../src/detect";
import { hashSkillDir } from "../src/skill";
import type { Config } from "../src/types";

let tmpDir: string;
let registryRoot: string;
let repoDir: string;
let config: Config;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-adopt-test-"));
  registryRoot = path.join(tmpDir, "registry");
  repoDir = path.join(tmpDir, "repo");
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });
  execSync("git init", { cwd: repoDir, stdio: "ignore" });

  config = {
    registryRoot,
    repoRoots: [tmpDir],
    globalClients: [],
    repoClients: [],
    linkMode: "symlink",
    inboxDirs: [],
    projects: {},
    hub: null,
  };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeSkillDir(dir: string, name: string, description: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\nbody`,
  );
}

test("adoptDetected copies to registry, deletes source, and re-links the surface", async () => {
  const sourceDir = path.join(repoDir, ".agents", "skills", "sk-adopt-me");
  makeSkillDir(sourceDir, "sk-adopt-me", "adopt me please");

  const skill: DetectedSkill = {
    name: "sk-adopt-me",
    description: "adopt me please",
    hash: await hashSkillDir(sourceDir),
    client: "agents",
    surface: "repo",
    repoPath: repoDir,
    path: sourceDir,
    state: "unmanaged",
  };

  const result = await adoptDetected(skill, "global", config);
  expect(result.ok).toBe(true);

  const registryDest = path.join(registryRoot, "skills", "global", "sk-adopt-me");
  expect(fs.existsSync(path.join(registryDest, "SKILL.md"))).toBe(true);

  // The source path now holds a managed symlink back into the registry.
  const lstat = fs.lstatSync(sourceDir);
  expect(lstat.isSymbolicLink()).toBe(true);
  expect(fs.realpathSync(sourceDir)).toBe(fs.realpathSync(registryDest));
});

test("adoptDetected rejects a hash conflict and leaves the source untouched", async () => {
  const regDir = path.join(registryRoot, "skills", "global", "sk-conflict");
  makeSkillDir(regDir, "sk-conflict", "registry version");

  const sourceDir = path.join(repoDir, ".agents", "skills", "sk-conflict");
  makeSkillDir(sourceDir, "sk-conflict", "source version DIFFERENT");

  const skill: DetectedSkill = {
    name: "sk-conflict",
    description: "source version DIFFERENT",
    hash: await hashSkillDir(sourceDir),
    client: "agents",
    surface: "repo",
    repoPath: repoDir,
    path: sourceDir,
    state: "drifted",
  };

  const result = await adoptDetected(skill, "global", config);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain("conflict");
    expect(result.error).toContain("sk-conflict");
  }

  // Source is untouched — still a real directory, not deleted or replaced.
  expect(fs.existsSync(sourceDir)).toBe(true);
  expect(fs.lstatSync(sourceDir).isSymbolicLink()).toBe(false);
  const sourceContent = fs.readFileSync(path.join(sourceDir, "SKILL.md"), "utf8");
  expect(sourceContent).toContain("source version DIFFERENT");

  // Registry entry is untouched too.
  const registryContent = fs.readFileSync(path.join(regDir, "SKILL.md"), "utf8");
  expect(registryContent).toContain("registry version");
});

test("adoptDetectedBulk never aborts the batch on a single conflict", async () => {
  // One adoptable skill.
  const okSourceDir = path.join(repoDir, ".agents", "skills", "sk-ok");
  makeSkillDir(okSourceDir, "sk-ok", "fine to adopt");
  const okSkill: DetectedSkill = {
    name: "sk-ok",
    description: "fine to adopt",
    hash: await hashSkillDir(okSourceDir),
    client: "agents",
    surface: "repo",
    repoPath: repoDir,
    path: okSourceDir,
    state: "unmanaged",
  };

  // One conflicting skill.
  const regDir = path.join(registryRoot, "skills", "global", "sk-clash");
  makeSkillDir(regDir, "sk-clash", "registry version");
  const clashSourceDir = path.join(repoDir, ".agents", "skills", "sk-clash");
  makeSkillDir(clashSourceDir, "sk-clash", "source version DIFFERENT");
  const clashSkill: DetectedSkill = {
    name: "sk-clash",
    description: "source version DIFFERENT",
    hash: await hashSkillDir(clashSourceDir),
    client: "agents",
    surface: "repo",
    repoPath: repoDir,
    path: clashSourceDir,
    state: "drifted",
  };

  const results = await adoptDetectedBulk(
    [
      { skill: okSkill, scope: "global" },
      { skill: clashSkill, scope: "global" },
    ],
    config,
  );

  expect(results).toHaveLength(2);
  const okResult = results.find((r) => r.name === "sk-ok");
  const clashResult = results.find((r) => r.name === "sk-clash");
  expect(okResult?.ok).toBe(true);
  expect(clashResult?.ok).toBe(false);
  expect(clashResult?.error).toContain("conflict");

  // The ok skill really was adopted despite the other item's conflict.
  expect(fs.existsSync(path.join(registryRoot, "skills", "global", "sk-ok", "SKILL.md"))).toBe(
    true,
  );
  // The clashing source is still untouched.
  expect(fs.lstatSync(clashSourceDir).isSymbolicLink()).toBe(false);
});

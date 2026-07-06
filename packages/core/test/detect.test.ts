import { afterEach, beforeEach, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { detectAll } from "../src/detect";
import type { Config } from "../src/types";

// NOTE: os.homedir() in Bun does not respect process.env.HOME changes at runtime (it is
// resolved once at process start), so the user surface cannot be redirected into a fixture
// without touching the real home directory. All state-classification coverage below therefore
// uses the repo surface (config.repoRoots is fully controllable) with distinctively prefixed
// skill names, so nothing here can collide with real skills that may exist on the test machine.

let tmpDir: string;
let registryRoot: string;
let reposRoot: string;
let config: Config;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-detect-test-"));
  registryRoot = path.join(tmpDir, "registry");
  reposRoot = path.join(tmpDir, "reposRoot");
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.mkdirSync(reposRoot, { recursive: true });

  // Registry: two global skills — sk-managed (stays in sync) and sk-drifted (will diverge).
  const managedRegDir = path.join(registryRoot, "skills", "global", "sk-managed");
  fs.mkdirSync(managedRegDir, { recursive: true });
  fs.writeFileSync(
    path.join(managedRegDir, "SKILL.md"),
    "---\nname: sk-managed\ndescription: managed skill\n---\nbody",
  );

  const driftedRegDir = path.join(registryRoot, "skills", "global", "sk-drifted");
  fs.mkdirSync(driftedRegDir, { recursive: true });
  fs.writeFileSync(
    path.join(driftedRegDir, "SKILL.md"),
    "---\nname: sk-drifted\ndescription: registry version\n---\nbody",
  );

  const repoA = path.join(reposRoot, "repo-a");
  const repoB = path.join(reposRoot, "repo-b");
  for (const repo of [repoA, repoB]) {
    fs.mkdirSync(repo, { recursive: true });
    execSync("git init", { cwd: repo, stdio: "ignore" });
  }

  // repo-a: managed (symlink into registry), drifted, duplicate (1st copy), fresh (unmanaged), broken (invalid)
  const repoAAgents = path.join(repoA, ".agents", "skills");
  fs.mkdirSync(repoAAgents, { recursive: true });
  fs.symlinkSync(managedRegDir, path.join(repoAAgents, "sk-managed"), "dir");

  fs.mkdirSync(path.join(repoAAgents, "sk-drifted"), { recursive: true });
  fs.writeFileSync(
    path.join(repoAAgents, "sk-drifted", "SKILL.md"),
    "---\nname: sk-drifted\ndescription: DIFFERENT repo content\n---\nbody",
  );

  fs.mkdirSync(path.join(repoAAgents, "sk-dup"), { recursive: true });
  fs.writeFileSync(
    path.join(repoAAgents, "sk-dup", "SKILL.md"),
    "---\nname: sk-dup\ndescription: duplicate\n---\nbody",
  );

  fs.mkdirSync(path.join(repoAAgents, "sk-fresh"), { recursive: true });
  fs.writeFileSync(
    path.join(repoAAgents, "sk-fresh", "SKILL.md"),
    "---\nname: sk-fresh\ndescription: fresh unmanaged skill\n---\nbody",
  );

  fs.mkdirSync(path.join(repoAAgents, "sk-broken"), { recursive: true });
  fs.writeFileSync(
    path.join(repoAAgents, "sk-broken", "SKILL.md"),
    "no frontmatter here, just junk text",
  );

  // repo-b: duplicate (2nd copy) with identical content to repo-a's sk-dup
  const repoBAgents = path.join(repoB, ".agents", "skills");
  fs.mkdirSync(repoBAgents, { recursive: true });
  fs.mkdirSync(path.join(repoBAgents, "sk-dup"), { recursive: true });
  fs.writeFileSync(
    path.join(repoBAgents, "sk-dup", "SKILL.md"),
    "---\nname: sk-dup\ndescription: duplicate\n---\nbody",
  );

  config = {
    registryRoot,
    repoRoots: [reposRoot],
    globalClients: [],
    repoClients: [],
    linkMode: "symlink",
    inboxDirs: [],
    projects: {},
    hub: null,
    ai: null,
    maintenanceIntervalHours: 24,
    autoMaintenance: false,
  };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("detectAll classifies a symlinked skill as managed", async () => {
  const detection = await detectAll(config);
  const skill = detection.skills.find((s) => s.name === "sk-managed");
  expect(skill).toBeDefined();
  expect(skill?.state).toBe("managed");
  expect(skill?.surface).toBe("repo");
  expect(skill?.registryScope).toBe("global");
});

test("detectAll classifies a same-name different-hash skill as drifted", async () => {
  const detection = await detectAll(config);
  const skill = detection.skills.find((s) => s.name === "sk-drifted");
  expect(skill).toBeDefined();
  expect(skill?.state).toBe("drifted");
  expect(skill?.registryScope).toBe("global");
});

test("detectAll classifies a same-name skill at 2+ non-registry paths as duplicate", async () => {
  const detection = await detectAll(config);
  const dups = detection.skills.filter((s) => s.name === "sk-dup");
  expect(dups).toHaveLength(2);
  expect(dups.every((s) => s.state === "duplicate")).toBe(true);
});

test("detectAll classifies a skill with broken SKILL.md as invalid", async () => {
  const detection = await detectAll(config);
  const skill = detection.skills.find((s) => s.name === "sk-broken");
  expect(skill).toBeDefined();
  expect(skill?.state).toBe("invalid");
});

test("detectAll classifies an unrecognised skill as unmanaged", async () => {
  const detection = await detectAll(config);
  const skill = detection.skills.find((s) => s.name === "sk-fresh");
  expect(skill).toBeDefined();
  expect(skill?.state).toBe("unmanaged");
});

test("detectAll discovers both fixture repos and computes non-zero perRepo token estimates", async () => {
  const detection = await detectAll(config);
  const repoA = path.join(reposRoot, "repo-a");
  const repoB = path.join(reposRoot, "repo-b");
  expect(detection.repos).toContain(repoA);
  expect(detection.repos).toContain(repoB);
  expect(detection.tokenEstimate.perRepo[repoA]).toBeGreaterThan(0);
  expect(detection.tokenEstimate.perRepo[repoB]).toBeGreaterThan(0);
});

test("detectAll reports agents as a client found via the repo surface", async () => {
  const detection = await detectAll(config);
  expect(detection.clientsFound).toContain("agents");
});

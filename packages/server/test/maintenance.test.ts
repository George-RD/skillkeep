import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Config, getJsonSetting, openDb } from "@skillkeep/core";
import { type MaintenanceResult, runMaintenancePass } from "../src/maintenance";

function makeSkillDir(dir: string, name: string, description: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\nbody`,
  );
}

describe("runMaintenancePass against a redirected data dir", () => {
  let tmpDir: string;
  let dd: string;
  let db: Database;
  let config: Config;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-maint-test-"));
    dd = path.join(tmpDir, "data");
    db = openDb(path.join(dd, "skillkeep.db"));

    const registryRoot = path.join(tmpDir, "registry");
    fs.mkdirSync(path.join(registryRoot, "skills", "global"), { recursive: true });
    execSync("git init", { cwd: registryRoot, stdio: "ignore" });

    config = {
      registryRoot,
      repoRoots: [],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
      projects: {},
      hub: null,
      ai: null,
    };
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("logs ok, reports syncOk, and persists lastMaintenance when sync and check are clean", async () => {
    const execCalls: string[][] = [];
    const result = await runMaintenancePass(db, config, {
      dataDir: dd,
      platform: "linux",
      exec: async (cmd) => {
        execCalls.push(cmd);
        return { exitCode: 0 };
      },
    });
    expect(result.syncOk).toBe(true);
    expect(result.findings).toHaveLength(0);
    const logPath = path.join(dd, "logs", "cron.log");
    expect(fs.existsSync(logPath)).toBe(true);
    const log = fs.readFileSync(logPath, "utf8");
    expect(log).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z sync ok check 0 finding\(s\)$/m,
    );
    expect(execCalls).toHaveLength(0);

    const persisted = getJsonSetting<MaintenanceResult>(db, "lastMaintenance");
    expect(persisted?.syncOk).toBe(true);
  });

  test("logs failure, reports !syncOk, and sends a macOS notification on darwin", async () => {
    const configWithMissingRepo: Config = {
      ...config,
      projects: { missing: { repos: ["/does/not/exist"] } },
    };
    const execCalls: string[][] = [];
    const result = await runMaintenancePass(db, configWithMissingRepo, {
      dataDir: dd,
      platform: "darwin",
      exec: async (cmd) => {
        execCalls.push(cmd);
        return { exitCode: 0 };
      },
    });
    expect(result.syncOk).toBe(false);
    const logPath = path.join(dd, "logs", "cron.log");
    expect(fs.existsSync(logPath)).toBe(true);
    const log = fs.readFileSync(logPath, "utf8");
    expect(log).toContain("sync failed");
    expect(log).toContain("check 0 finding(s)");
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0][0]).toBe("osascript");
  });
});

describe("runMaintenancePass --auto against temp git repos with remotes", () => {
  let tmpDir: string;
  let dd: string;
  let db: Database;
  let config: Config;
  let registryBare: string;
  let inboxBare: string;
  let inbox: string;

  const gitInit = (dir: string): void => {
    execSync("git init -q", { cwd: dir });
    execSync("git config user.email test@example.com", { cwd: dir });
    execSync("git config user.name Test", { cwd: dir });
    execSync("git config commit.gpgsign false", { cwd: dir });
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-maintauto-test-"));
    dd = path.join(tmpDir, "data");
    db = openDb(path.join(dd, "skillkeep.db"));

    const registryRoot = path.join(tmpDir, "registry");
    fs.mkdirSync(path.join(registryRoot, "skills", "global"), { recursive: true });
    fs.writeFileSync(path.join(registryRoot, "rules.yml"), 'global:\n  - "auto-*"\n');
    gitInit(registryRoot);
    execSync("git add -A && git commit -q -m init", { cwd: registryRoot });
    registryBare = path.join(tmpDir, "registry.git");
    execSync(`git init -q --bare ${registryBare}`);
    execSync(`git remote add origin ${registryBare}`, { cwd: registryRoot });
    execSync("git push -q -u origin HEAD", { cwd: registryRoot });

    inbox = path.join(tmpDir, "inbox");
    makeSkillDir(path.join(inbox, "auto-me"), "auto-me", "routes to global");
    gitInit(inbox);
    execSync("git add -A && git commit -q -m init", { cwd: inbox });
    inboxBare = path.join(tmpDir, "inbox.git");
    execSync(`git init -q --bare ${inboxBare}`);
    execSync(`git remote add origin ${inboxBare}`, { cwd: inbox });
    execSync("git push -q -u origin HEAD", { cwd: inbox });

    config = {
      registryRoot,
      repoRoots: [],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [inbox],
      projects: {},
      hub: null,
      ai: null,
    };
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("routes a rule-matched inbox skill into the registry and pushes both repos", async () => {
    const result = await runMaintenancePass(db, config, {
      dataDir: dd,
      platform: "linux",
      auto: true,
    });

    expect(result.syncOk).toBe(true);
    expect(result.routed).toEqual(["auto-me"]);
    expect(result.pushed).toBe(true);
    expect(fs.existsSync(path.join(config.registryRoot, "skills", "global", "auto-me"))).toBe(true);
    expect(fs.existsSync(path.join(inbox, "auto-me"))).toBe(false);

    const log = fs.readFileSync(path.join(dd, "logs", "cron.log"), "utf8");
    expect(log).toContain("triage 1 routed");
    expect(log).toContain("push ok");

    const registryRemoteLog = execSync("git log --oneline", { cwd: registryBare }).toString();
    expect(registryRemoteLog).toContain("triage: route");
    const inboxRemoteLog = execSync("git log --oneline", { cwd: inboxBare }).toString();
    expect(inboxRemoteLog).toContain("skill-triage: routed");
  });

  test("bare pass (no auto) flags the inbox but never triages or pushes", async () => {
    const result = await runMaintenancePass(db, config, { dataDir: dd, platform: "linux" });

    // The non-empty inbox is a legitimate check finding, but a bare pass must not act on it.
    expect(result.findings.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(inbox, "auto-me"))).toBe(true);
    expect(fs.existsSync(path.join(config.registryRoot, "skills", "global", "auto-me"))).toBe(
      false,
    );
    const log = fs.readFileSync(path.join(dd, "logs", "cron.log"), "utf8");
    expect(log).toContain("check 1 finding(s)");
    expect(log).not.toContain("triage");
    expect(log).not.toContain("push");
    const registryRemoteLog = execSync("git log --oneline", { cwd: registryBare }).toString();
    expect(registryRemoteLog).not.toContain("triage: route");
  });

  test("a rejected registry push skips the inbox push (no orphaned deletion)", async () => {
    // Two-sided divergence so pull --ff-only can't advance and the push is rejected non-ff: the
    // local registry gains an unpushed commit...
    fs.writeFileSync(path.join(config.registryRoot, "LOCAL.md"), "local");
    execSync("git add -A && git commit -q -m local", { cwd: config.registryRoot });
    // ...while the remote advances independently via a second clone.
    const clone = path.join(tmpDir, "regclone");
    execSync(`git clone -q ${registryBare} ${clone}`);
    execSync("git config user.email test@example.com", { cwd: clone });
    execSync("git config user.name Test", { cwd: clone });
    fs.writeFileSync(path.join(clone, "OTHER.md"), "diverge");
    execSync("git add -A && git commit -q -m diverge && git push -q", { cwd: clone });

    const result = await runMaintenancePass(db, config, {
      dataDir: dd,
      platform: "linux",
      auto: true,
    });

    expect(result.syncOk).toBe(false);
    const log = fs.readFileSync(path.join(dd, "logs", "cron.log"), "utf8");
    expect(log).toContain("registry push failed");
    expect(log).toContain("push failed");
    // The inbox remote must NOT publish the deletion when the registry never received the add.
    const inboxRemoteLog = execSync("git log --oneline", { cwd: inboxBare }).toString();
    expect(inboxRemoteLog).not.toContain("skill-triage: routed");
  });
});

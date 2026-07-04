import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Config } from "@skillkeep/core";
import {
  main,
  runAdoptCommand,
  runCheckCommand,
  runCronCommand,
  runDoctorCommand,
  runReportCommand,
  runScanCommand,
  runStatusCommand,
  runSyncCommand,
  runTriageCommand,
  waitForShutdownSignal,
  windowsSymlinkHint,
} from "../src/main";

function makeSkillDir(dir: string, name: string, description: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\nbody`,
  );
}

// process.exitCode is process-global; every test that exercises a failure path must restore it
// so a real subcommand failure doesn't leak into bun test's own exit status.
afterEach(() => {
  process.exitCode = 0;
});

describe("main() dispatch — pure argv parsing (never touches the real machine's data dir)", () => {
  function collect(): { write: (line: string) => void; lines: string[] } {
    const lines: string[] = [];
    return { write: (line) => lines.push(line), lines };
  }

  test("no args prints the command list", async () => {
    const { write, lines } = collect();
    await main([], write);
    expect(lines.some((l) => l.includes("usage: skillkeep"))).toBe(true);
    expect(lines.some((l) => l.includes("daemon"))).toBe(true);
  });

  test("--help prints the command list", async () => {
    const { write, lines } = collect();
    await main(["--help"], write);
    expect(lines.some((l) => l.includes("usage: skillkeep"))).toBe(true);
  });

  test("an unknown command reports the error and sets a non-zero exit code", async () => {
    const { write, lines } = collect();
    await main(["not-a-real-command"], write);
    expect(lines[0]).toBe("unknown command: not-a-real-command");
    expect(process.exitCode).toBe(1);
  });
});

describe("subcommand logic against a fixture registry + repo (never touches ~/.claude etc.)", () => {
  let tmpDir: string;
  let config: Config;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-cli-test-"));
    const registryRoot = path.join(tmpDir, "registry");
    const reposRoot = path.join(tmpDir, "reposRoot");
    const repoDir = path.join(reposRoot, "cli-test-repo");
    fs.mkdirSync(registryRoot, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });
    execSync("git init", { cwd: repoDir, stdio: "ignore" });

    makeSkillDir(
      path.join(registryRoot, "skills", "global", "cli-managed"),
      "cli-managed",
      "managed fixture",
    );

    const agentsDir = path.join(repoDir, ".agents", "skills");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.symlinkSync(
      path.join(registryRoot, "skills", "global", "cli-managed"),
      path.join(agentsDir, "cli-managed"),
      "dir",
    );
    makeSkillDir(path.join(agentsDir, "cli-fresh"), "cli-fresh", "fresh unmanaged fixture");

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
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("scan reports counts per state without crashing", async () => {
    const lines: string[] = [];
    await runScanCommand(config, (l) => lines.push(l));
    expect(lines[0]).toMatch(/^scanned \d+ skill install\(s\)/);
    expect(lines.some((l) => l.includes("managed:"))).toBe(true);
    expect(lines.some((l) => l.includes("unmanaged:"))).toBe(true);
  });

  test("status reports registry counts without crashing", async () => {
    const lines: string[] = [];
    await runStatusCommand(config, (l) => lines.push(l));
    expect(lines[0]).toMatch(/^registry: \d+ skill\(s\)/);
    expect(lines.some((l) => l.includes("global: 1"))).toBe(true);
  });

  test("adopt without both args prints usage and exits non-zero", async () => {
    const lines: string[] = [];
    await runAdoptCommand(config, ["only-a-name"], (l) => lines.push(l));
    expect(lines).toEqual(["usage: skillkeep adopt <name> <scope>"]);
    expect(process.exitCode).toBe(1);
  });

  test("adopt of an unknown skill reports the error and exits non-zero", async () => {
    const lines: string[] = [];
    await runAdoptCommand(config, ["does-not-exist", "global"], (l) => lines.push(l));
    expect(lines[0]).toContain('no detected skill named "does-not-exist"');
    expect(process.exitCode).toBe(1);
  });

  test("adopt of a real detected skill succeeds", async () => {
    const lines: string[] = [];
    await runAdoptCommand(config, ["cli-fresh", "global"], (l) => lines.push(l));
    expect(lines).toEqual(["adopted cli-fresh into global"]);
    expect(process.exitCode).toBe(0);
  });

  test("sync dry-run against an empty client/project config is up to date", async () => {
    const lines: string[] = [];
    await runSyncCommand(config, ["--dry-run"], (l) => lines.push(l));
    expect(lines[0]).toBe("sync (dry run):");
    expect(lines).toContain("  up to date");
  });

  test("check reports no issues for a clean fixture", async () => {
    const lines: string[] = [];
    await runCheckCommand(config, (l) => lines.push(l));
    expect(lines).toEqual(["no issues found"]);
  });

  test("triage with no inbox dirs reports nothing to triage", async () => {
    const lines: string[] = [];
    await runTriageCommand(config, [], (l) => lines.push(l));
    expect(lines).toEqual(["nothing to triage"]);
  });

  test("doctor reports the registry and link-mode state without crashing", async () => {
    const lines: string[] = [];
    await runDoctorCommand(config, (l) => lines.push(l));
    expect(lines.some((l) => l.startsWith("registry:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("link mode:"))).toBe(true);
  });
});

describe("waitForShutdownSignal", () => {
  test("resolves and calls close() once on SIGINT", async () => {
    const proc = new EventEmitter();
    let closeCalls = 0;
    const close = async (): Promise<void> => {
      closeCalls++;
    };
    const promise = waitForShutdownSignal(close, proc);
    proc.emit("SIGINT");
    await promise;
    expect(closeCalls).toBe(1);
  });

  test("a second signal after the first is a no-op", async () => {
    const proc = new EventEmitter();
    let closeCalls = 0;
    const close = async (): Promise<void> => {
      closeCalls++;
    };
    const promise = waitForShutdownSignal(close, proc);
    proc.emit("SIGINT");
    proc.emit("SIGTERM");
    await promise;
    expect(closeCalls).toBe(1);
  });
});

describe("windowsSymlinkHint", () => {
  test("returns the Developer Mode hint on win32 when symlinks are unsupported", () => {
    expect(windowsSymlinkHint(false, "win32")).toContain("Developer Mode");
  });
  test("returns null on win32 when symlinks work", () => {
    expect(windowsSymlinkHint(true, "win32")).toBeNull();
  });
  test("returns null on non-Windows platforms even when the probe fails", () => {
    expect(windowsSymlinkHint(false, "darwin")).toBeNull();
  });
});

describe("report command against a redirected data dir", () => {
  let tmpDir: string;
  let dd: string;
  let config: Config;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-report-test-"));
    dd = path.join(tmpDir, "data");

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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("healthy config prints a summary and exits 0 without writing a report", async () => {
    const lines: string[] = [];
    const now = new Date("2026-07-04T12:00:00Z");
    await runReportCommand(config, (l) => lines.push(l), { dataDir: dd, now });
    expect(lines.some((l) => l.startsWith("registry: ok"))).toBe(true);
    expect(lines.some((l) => l.startsWith("link mode:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("clients found:"))).toBe(true);
    if (process.platform === "darwin") {
      expect(lines.some((l) => l.startsWith("launch agent:"))).toBe(true);
    }
    expect(process.exitCode).toBe(0);
    const reportPath = path.join(
      dd,
      "reports",
      `report-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`,
    );
    expect(fs.existsSync(reportPath)).toBe(false);
  });

  test("unhealthy config writes a report and prints a GitHub issue URL", async () => {
    const inboxDir = path.join(tmpDir, "inbox");
    fs.mkdirSync(path.join(inboxDir, "some-skill"), { recursive: true });
    fs.writeFileSync(path.join(inboxDir, "some-skill", "SKILL.md"), "---\nname: some-skill\n---\n");
    const configWithInbox: Config = { ...config, inboxDirs: [inboxDir] };
    const lines: string[] = [];
    const now = new Date("2026-07-04T12:00:00Z");
    await runReportCommand(configWithInbox, (l) => lines.push(l), { dataDir: dd, now });
    expect(process.exitCode).toBe(1);
    expect(lines.some((l) => l.includes("inbox-nonempty"))).toBe(true);
    const reportPath = path.join(
      dd,
      "reports",
      `report-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`,
    );
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(lines.some((l) => l.startsWith("report written to "))).toBe(true);
    const markdown = fs.readFileSync(reportPath, "utf8");
    expect(markdown).toContain("# skillkeep diagnostic report");
    expect(markdown).toContain("inbox-nonempty");
    expect(
      lines.some((l) => l.startsWith("https://github.com/George-RD/skillkeep/issues/new")),
    ).toBe(true);
  });
});

describe("cron command against a redirected data dir", () => {
  let tmpDir: string;
  let dd: string;
  let config: Config;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-cron-test-"));
    dd = path.join(tmpDir, "data");

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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("logs ok and exits 0 when sync and check are clean", async () => {
    const execCalls: string[][] = [];
    await runCronCommand(config, () => {}, {
      dataDir: dd,
      platform: "linux",
      exec: async (cmd) => {
        execCalls.push(cmd);
        return { exitCode: 0 };
      },
    });
    expect(process.exitCode).toBe(0);
    const logPath = path.join(dd, "logs", "cron.log");
    expect(fs.existsSync(logPath)).toBe(true);
    const log = fs.readFileSync(logPath, "utf8");
    expect(log).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z sync ok check 0 finding\(s\)$/m,
    );
    expect(execCalls).toHaveLength(0);
  });

  test("logs failure, exits 1, and sends a macOS notification on darwin", async () => {
    const configWithMissingRepo: Config = {
      ...config,
      projects: { missing: { repos: ["/does/not/exist"] } },
    };
    const execCalls: string[][] = [];
    await runCronCommand(configWithMissingRepo, () => {}, {
      dataDir: dd,
      platform: "darwin",
      exec: async (cmd) => {
        execCalls.push(cmd);
        return { exitCode: 0 };
      },
    });
    expect(process.exitCode).toBe(1);
    const logPath = path.join(dd, "logs", "cron.log");
    expect(fs.existsSync(logPath)).toBe(true);
    const log = fs.readFileSync(logPath, "utf8");
    expect(log).toContain("sync failed");
    expect(log).toContain("check 0 finding(s)");
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0][0]).toBe("osascript");
  });
});

describe("cron --auto against temp git repos with remotes", () => {
  let tmpDir: string;
  let dd: string;
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-cronauto-test-"));
    dd = path.join(tmpDir, "data");

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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("routes a rule-matched inbox skill into the registry and pushes both repos", async () => {
    await runCronCommand(config, () => {}, { dataDir: dd, platform: "linux", auto: true });

    expect(process.exitCode).toBe(0);
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

  test("bare cron (no --auto) flags the inbox but never triages or pushes", async () => {
    await runCronCommand(config, () => {}, { dataDir: dd, platform: "linux" });

    // The non-empty inbox is a legitimate check finding (exit 1), but bare cron must not act on it.
    expect(process.exitCode).toBe(1);
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

    await runCronCommand(config, () => {}, { dataDir: dd, platform: "linux", auto: true });

    // Registry push rejected -> recorded failure -> exit 1.
    expect(process.exitCode).toBe(1);
    const log = fs.readFileSync(path.join(dd, "logs", "cron.log"), "utf8");
    expect(log).toContain("registry push failed");
    expect(log).toContain("push failed");
    // The inbox remote must NOT publish the deletion when the registry never received the add.
    const inboxRemoteLog = execSync("git log --oneline", { cwd: inboxBare }).toString();
    expect(inboxRemoteLog).not.toContain("skill-triage: routed");
  });
});

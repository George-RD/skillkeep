import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Config } from "@skillkeep/core";
import {
  main,
  runAdoptCommand,
  runCheckCommand,
  runDoctorCommand,
  runScanCommand,
  runStatusCommand,
  runSyncCommand,
  runTriageCommand,
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

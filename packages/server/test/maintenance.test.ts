import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Config, getConfig, getJsonSetting, openDb, setConfig } from "@skillkeep/core";
import { startServer } from "../src/index";
import {
  type MaintenanceResult,
  runMaintenancePass,
  startMaintenanceScheduler,
} from "../src/maintenance";

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

describe("runMaintenancePass hub sync step", () => {
  let tmpDir: string;
  let dd: string;
  let db: Database;
  let config: Config;
  const originalFetch = globalThis.fetch;

  function installFetchStub(
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  ): void {
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      return Promise.resolve(handler(url, init));
    }) as typeof fetch;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-maint-hub-test-"));
    dd = path.join(tmpDir, "data");
    db = openDb(path.join(dd, "skillkeep.db"));

    const registryRoot = path.join(tmpDir, "registry");
    makeSkillDir(
      path.join(registryRoot, "skills", "global", "hub-me"),
      "hub-me",
      "pushed to the hub",
    );
    execSync("git init", { cwd: registryRoot, stdio: "ignore" });

    config = {
      registryRoot,
      repoRoots: [],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
      projects: {},
      hub: { url: "https://hub.example.com", token: "hub-test-token", device: "test-device" },
      ai: null,
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("pulls (nothing new) then pushes the local registry, recording pushed skills", async () => {
    const calls: string[] = [];
    installFetchStub((url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url.replace(/^https:\/\/hub\.example\.com/, "")}`);
      if (url.includes("/api/v1/registry/manifest")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/api/v1/ingest")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes("/api/v1/registry/skill")) {
        return new Response(null, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await runMaintenancePass(db, config, { dataDir: dd, platform: "linux" });

    expect(result.hub?.error).toBeUndefined();
    expect(result.hub?.pulled).toEqual([]);
    expect(result.hub?.pushed).toEqual(["hub-me"]);
    expect(result.hub?.conflicts).toEqual([]);
    // Pull's manifest fetch happens before push's ingest/manifest/PUT sequence.
    const firstManifestIdx = calls.findIndex((c) => c.includes("registry/manifest"));
    const ingestIdx = calls.findIndex((c) => c.includes("/api/v1/ingest"));
    expect(firstManifestIdx).toBeLessThan(ingestIdx);
  });

  test("a 409 on push is recorded as a conflict, not thrown, and the pass still reports syncOk", async () => {
    installFetchStub((url, init) => {
      if (url.includes("/api/v1/registry/manifest")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/api/v1/ingest")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (init?.method === "PUT" && url.includes("/api/v1/registry/skill")) {
        return new Response(null, { status: 409 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await runMaintenancePass(db, config, { dataDir: dd, platform: "linux" });

    expect(result.syncOk).toBe(true);
    expect(result.hub?.conflicts).toEqual(["hub-me"]);
    expect(result.hub?.pushed).toEqual([]);
  });

  test("a hub that's unreachable is caught into hub.error, never thrown, and never fails the pass", async () => {
    installFetchStub(() => {
      throw new Error("connection refused");
    });

    const result = await runMaintenancePass(db, config, { dataDir: dd, platform: "linux" });

    expect(result.syncOk).toBe(true);
    expect(result.hub?.error).toContain("connection refused");
    expect(result.hub?.pushed).toEqual([]);
    expect(result.hub?.pulled).toEqual([]);
  });

  test("no hub configured: result.hub stays undefined", async () => {
    const result = await runMaintenancePass(
      db,
      { ...config, hub: null },
      { dataDir: dd, platform: "linux" },
    );
    expect(result.hub).toBeUndefined();
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

describe("startMaintenanceScheduler", () => {
  let tmpDir: string;
  let db: Database;

  const fakeResult: MaintenanceResult = {
    at: "2026-01-01T00:00:00.000Z",
    syncOk: true,
    findings: [],
    routed: [],
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-scheduler-test-"));
    db = openDb(path.join(tmpDir, "skillkeep.db"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("tick() runs one pass against the freshly-read config and reports it via onTick", async () => {
    const calls: unknown[][] = [];
    let reported: MaintenanceResult | undefined;
    const scheduler = startMaintenanceScheduler(db, 3_600_000, {
      runPass: async (calledDb, calledConfig, deps) => {
        calls.push([calledDb, calledConfig, deps]);
        return fakeResult;
      },
      onTick: (result) => {
        reported = result;
      },
    });
    try {
      await scheduler.tick();
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe(db);
      expect(reported).toEqual(fakeResult);
    } finally {
      scheduler.stop();
    }
  });

  test("a tick still in flight is skipped rather than run concurrently", async () => {
    let calls = 0;
    const gate = Promise.withResolvers<void>();
    const scheduler = startMaintenanceScheduler(db, 3_600_000, {
      runPass: async () => {
        calls++;
        await gate.promise;
        return fakeResult;
      },
    });
    try {
      const first = scheduler.tick();
      const second = scheduler.tick(); // fires while `first` is still awaiting the gate
      gate.resolve();
      await Promise.all([first, second]);
      expect(calls).toBe(1);
    } finally {
      scheduler.stop();
    }
  });

  // Exercises the real setInterval/clearInterval this scheduler wraps -- an integration test
  // against the platform clock is unavoidable here since the behavior under test IS "does the
  // interval keep firing". Kept to a tiny (10ms) period so it stays fast and non-flaky: waiting
  // for the first real tick, then confirming several more interval periods produce no further
  // calls once stopped.
  test("stop() clears the interval so no further ticks run", async () => {
    let calls = 0;
    const firstTick = Promise.withResolvers<void>();
    const scheduler = startMaintenanceScheduler(db, 10, {
      runPass: async () => {
        calls++;
        firstTick.resolve();
        return fakeResult;
      },
    });
    await firstTick.promise;
    scheduler.stop();
    const callsAtStop = calls;
    await Bun.sleep(50); // several would-be interval periods
    expect(calls).toBe(callsAtStop);
  });
});

// Integration coverage for startServer's own wiring (as opposed to startMaintenanceScheduler's
// unit behavior above): proves the scheduler is actually created and ticking in agent mode, and
// never created in hub mode. Uses startServer's maintenanceIntervalMsOverride test seam (mirrors
// the existing usageRoots override) since production's real interval is hours-scale. Polls a
// second read-only db connection for "lastMaintenance" rather than sleeping a guessed duration --
// still a real clock (the thing under test), but bounded and self-terminating on first success.
describe("startServer's maintenance scheduler wiring", () => {
  async function pollLastMaintenance(
    dbPath: string,
    timeoutMs: number,
  ): Promise<MaintenanceResult | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const pollDb = openDb(dbPath);
      const result = getJsonSetting<MaintenanceResult>(pollDb, "lastMaintenance");
      pollDb.close();
      if (result || Date.now() >= deadline) return result;
      await Bun.sleep(15);
    }
  }

  test("agent mode runs a maintenance pass on the overridden interval", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-scheduler-wiring-agent-"));
    const registryRoot = path.join(dir, "registry");
    fs.mkdirSync(path.join(registryRoot, "skills", "global"), { recursive: true });
    execSync("git init", { cwd: registryRoot, stdio: "ignore" });
    // Seed a config with no repoRoots/clients/inboxDirs before boot -- defaultConfig()'s
    // repoRoots is ["~/repos"] and inboxDirs may pick up this machine's real managed-skills dir;
    // this test must never let runSync/runCheck walk this machine's real filesystem.
    const seedDb = openDb(path.join(dir, "skillkeep.db"));
    setConfig(seedDb, {
      ...getConfig(seedDb),
      registryRoot,
      repoRoots: [],
      globalClients: [],
      repoClients: [],
      inboxDirs: [],
    });
    seedDb.close();
    const started = await startServer({
      mode: "agent",
      port: 0,
      dataDir: dir,
      maintenanceIntervalMsOverride: 15,
      // This machine's real usage transcripts must never be walked by the boot-time rescan
      // startServer also kicks off in agent mode -- mirrors server.test.ts's beforeAll.
      usageRoots: {
        claude: path.join(dir, "no-claude"),
        codex: path.join(dir, "no-codex"),
        opencode: path.join(dir, "no-opencode"),
        gemini: path.join(dir, "no-gemini"),
        omp: path.join(dir, "no-omp"),
      },
    });
    try {
      const result = await pollLastMaintenance(path.join(dir, "skillkeep.db"), 2000);
      expect(result?.syncOk).toBe(true);
    } finally {
      await started.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("hub mode never creates a maintenance scheduler", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-scheduler-wiring-hub-"));
    const savedToken = process.env.SKILLKEEP_TOKEN;
    process.env.SKILLKEEP_TOKEN = "scheduler-wiring-hub-token";
    const started = await startServer({
      mode: "hub",
      port: 0,
      dataDir: dir,
      maintenanceIntervalMsOverride: 15,
      usageRoots: {
        claude: path.join(dir, "no-claude"),
        codex: path.join(dir, "no-codex"),
        opencode: path.join(dir, "no-opencode"),
        gemini: path.join(dir, "no-gemini"),
        omp: path.join(dir, "no-omp"),
      },
    });
    try {
      const result = await pollLastMaintenance(path.join(dir, "skillkeep.db"), 150);
      expect(result).toBeNull();
    } finally {
      await started.close();
      if (savedToken !== undefined) process.env.SKILLKEEP_TOKEN = savedToken;
      else delete process.env.SKILLKEEP_TOKEN;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

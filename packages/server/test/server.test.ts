import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Config } from "@skillkeep/core";
import { openDb, setConfig } from "@skillkeep/core";
import { startServer } from "../src/index";
import { resetScanCache } from "../src/scan-cache";
import { rmrfRetry } from "./test-utils";

let tmpDir: string;
let dataDir: string;
let registryRoot: string;
let reposRoot: string;
let repoDir: string;
let token: string;
let baseUrl: string;
let close: () => Promise<void>;

function makeSkillDir(dir: string, name: string, description: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\nbody`,
  );
}

async function get(pathAndQuery: string, opts: { auth?: boolean } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}${pathAndQuery}`, { headers });
}

async function send(
  method: string,
  pathAndQuery: string,
  body: unknown,
  opts: { auth?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}${pathAndQuery}`, { method, headers, body: JSON.stringify(body) });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-server-test-"));
  dataDir = path.join(tmpDir, "data");
  registryRoot = path.join(tmpDir, "registry");
  reposRoot = path.join(tmpDir, "reposRoot");
  repoDir = path.join(reposRoot, "srv-test-repo");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });
  execSync("git init", { cwd: repoDir, stdio: "ignore" });

  // Registry fixtures: one skill per mutation test so tests don't stomp each other.
  makeSkillDir(
    path.join(registryRoot, "skills", "global", "srv-managed"),
    "srv-managed",
    "managed fixture skill",
  );
  makeSkillDir(
    path.join(registryRoot, "skills", "global", "srv-move-me"),
    "srv-move-me",
    "move fixture skill",
  );
  makeSkillDir(
    path.join(registryRoot, "skills", "global", "srv-archive-me"),
    "srv-archive-me",
    "archive fixture skill",
  );
  makeSkillDir(
    path.join(registryRoot, "skills", "global", "srv-edit-me"),
    "srv-edit-me",
    "edit fixture skill",
  );

  // Repo surface: srv-managed symlinked back into the registry, srv-fresh sitting unmanaged.
  const agentsDir = path.join(repoDir, ".agents", "skills");
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.symlinkSync(
    path.join(registryRoot, "skills", "global", "srv-managed"),
    path.join(agentsDir, "srv-managed"),
    "dir",
  );
  makeSkillDir(path.join(agentsDir, "srv-fresh"), "srv-fresh", "fresh unmanaged fixture skill");

  const config: Config = {
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
  const seedDb = openDb(path.join(dataDir, "skillkeep.db"));
  setConfig(seedDb, config);
  seedDb.close();

  // Point every usage source at a nonexistent dir under tmpDir so the boot-time/scheduled usage
  // ingest (startServer's automatic rescan) never walks this machine's real ~/.claude, ~/.codex,
  // ~/.omp, etc. — this test suite is about the registry/sync/settings routes, not usage ingest
  // (that has its own dedicated, hermetic usage-ingest.test.ts).
  const started = await startServer({
    mode: "agent",
    port: 0,
    dataDir,
    usageRoots: {
      claude: path.join(tmpDir, "no-claude"),
      codex: path.join(tmpDir, "no-codex"),
      opencode: path.join(tmpDir, "no-opencode"),
      gemini: path.join(tmpDir, "no-gemini"),
      omp: path.join(tmpDir, "no-omp"),
    },
  });
  token = started.token;
  close = started.close;
  baseUrl = `http://127.0.0.1:${started.port}`;
});

afterAll(async () => {
  await close();
  await rmrfRetry(tmpDir);
});

describe("auth", () => {
  test("GET /healthz needs no token", async () => {
    const res = await get("/healthz", { auth: false });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; version: string; mode: string };
    expect(body).toEqual({ ok: true, version: "0.1.0", mode: "agent" });
  });

  test("protected route without a token is 401", async () => {
    const res = await get("/api/scan", { auth: false });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
  });

  test("protected route with the wrong token is 401", async () => {
    const res = await fetch(`${baseUrl}/api/scan`, { headers: { Authorization: "Bearer nope" } });
    expect(res.status).toBe(401);
  });

  test("protected route with the real token is 200", async () => {
    const res = await get("/api/scan");
    expect(res.status).toBe(200);
  });

  test("hands out a 0600 token file", () => {
    const stat = fs.statSync(path.join(dataDir, "daemon.token"));
    // NTFS has no POSIX permission-bit model -- fs.chmod on win32 only ever toggles the
    // read-only attribute, so stat.mode never reflects 0600 there regardless of what
    // ensureToken() requests. Confidentiality on win32 instead comes from explicit
    // `icacls /inheritance:r` hardening in ensureToken (see hardenTokenFileAcl in
    // ../src/auth.ts), not solely from inherited AppData ACLs.
    if (process.platform !== "win32") expect(stat.mode & 0o777).toBe(0o600);
    const fileToken = fs.readFileSync(path.join(dataDir, "daemon.token"), "utf8").trim();
    expect(fileToken).toBe(token);
  });
});

describe("GET /api/events", () => {
  test("accepts the header form", async () => {
    const res = await get("/api/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();
  });

  test("accepts ?token= (EventSource can't set headers)", async () => {
    const res = await fetch(`${baseUrl}/api/events?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    await res.body?.cancel();
  });

  test("rejects a missing/wrong token", async () => {
    const res = await fetch(`${baseUrl}/api/events?token=nope`);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/scan", () => {
  test("classifies the fixture repo surface", async () => {
    const res = await get("/api/scan?fresh=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      skills: { name: string; state: string; path: string }[];
    };
    const managed = body.skills.find((s) => s.name === "srv-managed");
    expect(managed?.state).toBe("managed");
    const fresh = body.skills.find((s) => s.name === "srv-fresh");
    expect(fresh?.state).toBe("unmanaged");
  });
});

describe("GET /api/registry", () => {
  test("groups entries by scope with a content hash", async () => {
    const res = await get("/api/registry");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scope: string;
      skills: { name: string; hash: string }[];
    }[];
    const global = body.find((s) => s.scope === "global");
    const managed = global?.skills.find((s) => s.name === "srv-managed");
    expect(managed).toBeDefined();
    expect(managed?.hash.length).toBeGreaterThan(0);
  });
});

describe("GET/PUT /api/skill", () => {
  test("404s for a name that doesn't exist", async () => {
    const res = await get("/api/skill?name=srv-does-not-exist");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  test("round-trips content through GET then PUT", async () => {
    const getRes = await get("/api/skill?name=srv-edit-me");
    expect(getRes.status).toBe(200);
    const before = (await getRes.json()) as { name: string; content: string };
    expect(before.name).toBe("srv-edit-me");
    expect(before.content).toContain("edit fixture skill");

    const putRes = await send("PUT", "/api/skill", {
      name: "srv-edit-me",
      content: "---\nname: srv-edit-me\ndescription: updated description\n---\nbody",
    });
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({ ok: true });

    const after = await get("/api/skill?name=srv-edit-me");
    const afterBody = (await after.json()) as { content: string };
    expect(afterBody.content).toContain("updated description");
  });

  test("422s and does not write when the content has no valid frontmatter", async () => {
    const putRes = await send("PUT", "/api/skill", {
      name: "srv-edit-me",
      content: "not a skill file at all",
    });
    expect(putRes.status).toBe(422);
    const body = (await putRes.json()) as { error: string };
    expect(typeof body.error).toBe("string");

    // Untouched: still holds the previous (valid) content, not the rejected one.
    const after = await get("/api/skill?name=srv-edit-me");
    const afterBody = (await after.json()) as { content: string };
    expect(afterBody.content).not.toBe("not a skill file at all");
  });
});

describe("POST /api/registry/move and /archive", () => {
  test("move to an invalid scope returns 200 with ok:false (matches the UI's OpResult contract)", async () => {
    const res = await send("POST", "/api/registry/move", {
      name: "srv-move-me",
      toScope: "not-a-scope",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  test("moves a skill to a valid scope", async () => {
    const res = await send("POST", "/api/registry/move", {
      name: "srv-move-me",
      toScope: "project/srv-test",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const registry = await get("/api/registry");
    const body = (await registry.json()) as { scope: string; skills: { name: string }[] }[];
    const projectScope = body.find((s) => s.scope === "project/srv-test");
    expect(projectScope?.skills.some((s) => s.name === "srv-move-me")).toBe(true);
  });

  test("archives a skill", async () => {
    const res = await send("POST", "/api/registry/archive", { name: "srv-archive-me" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const registry = await get("/api/registry");
    const body = (await registry.json()) as { scope: string; skills: { name: string }[] }[];
    const archiveScope = body.find((s) => s.scope === "archive");
    expect(archiveScope?.skills.some((s) => s.name === "srv-archive-me")).toBe(true);
  });

  test("archiving an unknown name returns ok:false", async () => {
    const res = await send("POST", "/api/registry/archive", { name: "srv-does-not-exist" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
  });
});

describe("POST /api/adopt", () => {
  test("adopts a found skill and reports 'not found in last scan' for the rest of the batch", async () => {
    resetScanCache();
    const res = await send("POST", "/api/adopt", {
      items: [
        {
          name: "srv-fresh",
          path: path.join(repoDir, ".agents", "skills", "srv-fresh"),
          scope: "global",
        },
        { name: "srv-bogus", path: "/nowhere", scope: "global" },
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; ok: boolean; error?: string }[];
    expect(body).toHaveLength(2);
    expect(body.find((r) => r.name === "srv-fresh")?.ok).toBe(true);
    const bogus = body.find((r) => r.name === "srv-bogus");
    expect(bogus?.ok).toBe(false);
    expect(bogus?.error).toBe("not found in last scan");

    const registry = await get("/api/registry");
    const registryBody = (await registry.json()) as { scope: string; skills: { name: string }[] }[];
    const global = registryBody.find((s) => s.scope === "global");
    expect(global?.skills.some((s) => s.name === "srv-fresh")).toBe(true);
  });
});

describe("POST /api/sync", () => {
  test("dry-run returns a SyncReport shape", async () => {
    const res = await send("POST", "/api/sync", { dryRun: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    for (const key of ["created", "fixed", "pruned", "configReminders", "errors"]) {
      expect(Array.isArray(body[key])).toBe(true);
    }
  });
});

describe("GET /api/status", () => {
  test("reports counts and a token estimate", async () => {
    const res = await get("/api/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      counts: Record<string, number>;
      duplicates: string[];
      misplacements: string[];
      drift: string[];
      globalOnlyTokenEstimate: number;
    };
    expect(typeof body.counts).toBe("object");
    expect(Array.isArray(body.duplicates)).toBe(true);
    expect(Array.isArray(body.misplacements)).toBe(true);
    expect(Array.isArray(body.drift)).toBe(true);
    expect(typeof body.globalOnlyTokenEstimate).toBe("number");
  });
});

describe("GET /api/usage/summary", () => {
  test("400s without the required group/from/to query params", async () => {
    const res = await get("/api/usage/summary");
    expect(res.status).toBe(400);
  });

  test("200s with a rows array against the real db", async () => {
    const res = await get("/api/usage/summary?group=model&from=2026-01-01&to=2026-01-31");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[] };
    expect(Array.isArray(body.rows)).toBe(true);
  });
});

describe("POST /api/usage/rescan", () => {
  test("runs ingestion and reports ok", async () => {
    // Redirect every source's home/data-dir env var at an empty tmp dir so the real
    // ingestion pipeline runs (proving the route wires auth -> runUsageIngest ->
    // {ok:true}) without scanning this machine's actual transcript history, which
    // would be slow and non-hermetic. Full ingestion correctness is covered by
    // usage-ingest.test.ts.
    const ENV_KEYS = ["HOME", "CODEX_HOME", "XDG_DATA_HOME", "GEMINI_CLI_HOME"] as const;
    const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) process.env[k] = tmpDir;
    try {
      const res = await send("POST", "/api/usage/rescan", {});
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});

describe("GET/PUT /api/settings", () => {
  test("GET reflects the persisted config plus a linkModeProbe", async () => {
    const res = await get("/api/settings");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      registryRoot: string;
      linkModeProbe?: { platform: string; result: string; reason: string };
    };
    expect(body.registryRoot).toBe(registryRoot);
    expect(body.linkModeProbe?.platform).toBe(process.platform);
    expect(["symlink", "copy"]).toContain(body.linkModeProbe?.result);
  });

  test("PUT rejects an empty registryRoot with 422", async () => {
    const res = await send("PUT", "/api/settings", {
      registryRoot: "",
      repoRoots: [reposRoot],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
    });
    expect(res.status).toBe(422);
  });

  test("PUT rejects a relative repoRoots entry with 422", async () => {
    const res = await send("PUT", "/api/settings", {
      registryRoot,
      repoRoots: ["relative/path"],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
    });
    expect(res.status).toBe(422);
  });

  test("PUT persists a valid settings update", async () => {
    const res = await send("PUT", "/api/settings", {
      registryRoot,
      repoRoots: [reposRoot],
      globalClients: ["claude"],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const after = await get("/api/settings");
    const body = (await after.json()) as { globalClients: string[] };
    expect(body.globalClients).toEqual(["claude"]);
  });

  test("GET includes projects in the response", async () => {
    const res = await get("/api/settings");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: unknown };
    expect(typeof body.projects).toBe("object");
    expect(body.projects).not.toBeNull();
  });

  test("PUT with valid projects persists and round-trips via GET", async () => {
    const projects = {
      "yarnling-ios": { repos: [repoDir], mode: "committed" as const, local_config: true },
    };
    const res = await send("PUT", "/api/settings", {
      registryRoot,
      repoRoots: [reposRoot],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
      projects,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const after = await get("/api/settings");
    const body = (await after.json()) as { projects: typeof projects };
    expect(body.projects).toEqual(projects);
  });

  test("PUT omitting projects preserves existing ones", async () => {
    const before = await get("/api/settings");
    const beforeBody = (await before.json()) as { projects: Record<string, unknown> };

    const res = await send("PUT", "/api/settings", {
      registryRoot,
      repoRoots: [reposRoot],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const after = await get("/api/settings");
    const afterBody = (await after.json()) as { projects: Record<string, unknown> };
    expect(afterBody.projects).toEqual(beforeBody.projects);
  });

  test("PUT rejects invalid projects with 422 and leaves config unchanged", async () => {
    const before = await get("/api/settings");
    const beforeBody = (await before.json()) as { projects: Record<string, unknown> };

    const badCases = [
      {
        projects: { foo: { repos: "not-an-array" } },
        error: "must be an array of strings",
      },
      {
        projects: { foo: { repos: [repoDir], mode: "copy" } },
        error: "mode must be 'link' or 'committed'",
      },
      {
        projects: { foo: { repos: ["relative/path"] } },
        error: "must be absolute",
      },
      {
        projects: { "bad/name": { repos: [repoDir] } },
        error: "path separators",
      },
      {
        projects: { "bad\\name": { repos: [repoDir] } },
        error: "path separators",
      },
      {
        projects: { "..": { repos: [repoDir] } },
        error: "not allowed",
      },
      {
        projects: { ".": { repos: [repoDir] } },
        error: "not allowed",
      },
      // A real own-enumerable "__proto__" key, exactly as an HTTP client sends it: an
      // object literal would hit the prototype setter and never reach the wire.
      {
        projects: JSON.parse(`{"__proto__":{"repos":[${JSON.stringify(repoDir)}]}}`),
        error: "not allowed",
      },
      {
        projects: { constructor: { repos: [repoDir] } },
        error: "not allowed",
      },
    ];

    for (const bad of badCases) {
      const res = await send("PUT", "/api/settings", {
        registryRoot,
        repoRoots: [reposRoot],
        globalClients: [],
        repoClients: [],
        linkMode: "symlink",
        inboxDirs: [],
        projects: bad.projects,
      });
      expect(res.status).toBe(422);
      const err = (await res.json()) as { error: string };
      expect(err.error).toContain(bad.error);
    }

    const after = await get("/api/settings");
    const afterBody = (await after.json()) as { projects: Record<string, unknown> };
    expect(afterBody.projects).toEqual(beforeBody.projects);
  });

  test("GET reflects maintenanceIntervalHours/autoMaintenance defaults", async () => {
    const res = await get("/api/settings");
    const body = (await res.json()) as {
      maintenanceIntervalHours: number;
      autoMaintenance: boolean;
    };
    expect(body.maintenanceIntervalHours).toBe(24);
    expect(body.autoMaintenance).toBe(false);
  });

  test("PUT rejects an out-of-range or non-integer maintenanceIntervalHours with 422", async () => {
    for (const bad of [0, 169, 1.5, "24", null]) {
      const res = await send("PUT", "/api/settings", {
        registryRoot,
        repoRoots: [reposRoot],
        globalClients: [],
        repoClients: [],
        linkMode: "symlink",
        inboxDirs: [],
        maintenanceIntervalHours: bad,
      });
      expect(res.status).toBe(422);
    }
  });

  test("PUT rejects a non-boolean autoMaintenance with 422", async () => {
    const res = await send("PUT", "/api/settings", {
      registryRoot,
      repoRoots: [reposRoot],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
      autoMaintenance: "yes",
    });
    expect(res.status).toBe(422);
  });

  test("PUT persists valid maintenanceIntervalHours/autoMaintenance and round-trips via GET", async () => {
    const res = await send("PUT", "/api/settings", {
      registryRoot,
      repoRoots: [reposRoot],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
      maintenanceIntervalHours: 6,
      autoMaintenance: true,
    });
    expect(res.status).toBe(200);

    const after = await get("/api/settings");
    const body = (await after.json()) as {
      maintenanceIntervalHours: number;
      autoMaintenance: boolean;
    };
    expect(body.maintenanceIntervalHours).toBe(6);
    expect(body.autoMaintenance).toBe(true);
  });

  test("PUT omitting maintenanceIntervalHours/autoMaintenance preserves the existing values", async () => {
    const before = await get("/api/settings");
    const beforeBody = (await before.json()) as {
      maintenanceIntervalHours: number;
      autoMaintenance: boolean;
    };

    const res = await send("PUT", "/api/settings", {
      registryRoot,
      repoRoots: [reposRoot],
      globalClients: [],
      repoClients: [],
      linkMode: "symlink",
      inboxDirs: [],
    });
    expect(res.status).toBe(200);

    const after = await get("/api/settings");
    const afterBody = (await after.json()) as {
      maintenanceIntervalHours: number;
      autoMaintenance: boolean;
    };
    expect(afterBody.maintenanceIntervalHours).toBe(beforeBody.maintenanceIntervalHours);
    expect(afterBody.autoMaintenance).toBe(beforeBody.autoMaintenance);
  });
});

describe("GET/POST /api/ai/*", () => {
  // Config.ai is seeded null (see beforeAll) and no SKILLKEEP_AI_KEY is set for this process, so
  // every request below exercises the "AI not configured" gate end-to-end (real startServer +
  // fetch, not a unit test of resolveAiKey) — proving the routes are actually wired into the
  // dispatch chain, not just that the gate function itself behaves. The generation functions'
  // own behaviour (a configured, successful call) is unit-tested against a fake model in
  // ai.test.ts, which needs no network and no persisted key.
  test("GET /api/ai/status returns { configured: false } when no ai config is set", async () => {
    const res = await get("/api/ai/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false });
  });

  test("POST /api/ai/triage is 503 when AI is not configured", async () => {
    const res = await send("POST", "/api/ai/triage", { names: ["some-skill"] });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI not configured" });
  });

  test("POST /api/ai/describe is 503 when AI is not configured", async () => {
    const res = await send("POST", "/api/ai/describe", {
      name: "some-skill",
      description: "old",
      body: "# some-skill",
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI not configured" });
  });

  test("POST /api/ai/dedupe is 503 when AI is not configured", async () => {
    const res = await send("POST", "/api/ai/dedupe", {
      a: { name: "a", description: "d-a", body: "b-a" },
      b: { name: "b", description: "d-b", body: "b-b" },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI not configured" });
  });

  test("routes reject a missing/wrong bearer token like every other /api/* route", async () => {
    const res = await get("/api/ai/status", { auth: false });
    expect(res.status).toBe(401);
  });
});

describe("static UI", () => {
  test("GET / with no token is 401", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(401);
  });

  test("GET /?token=<token> injects window.__SKILLKEEP__ with the real token", async () => {
    const res = await fetch(`${baseUrl}/?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`"token":"${token}"`);
  });

  test("an unknown asset path is 404", async () => {
    const res = await get("/assets/does-not-exist.js", { auth: false });
    expect(res.status).toBe(404);
  });
});

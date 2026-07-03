import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHubToken, startServer } from "../src/index";

describe("requireHubToken", () => {
  test("throws when SKILLKEEP_TOKEN is unset", () => {
    expect(() => requireHubToken({})).toThrow("SKILLKEEP_TOKEN is required in hub mode");
  });

  test("throws when SKILLKEEP_TOKEN is empty or whitespace-only", () => {
    expect(() => requireHubToken({ SKILLKEEP_TOKEN: "" })).toThrow();
    expect(() => requireHubToken({ SKILLKEEP_TOKEN: "   " })).toThrow();
  });

  test("returns the trimmed token when set", () => {
    expect(requireHubToken({ SKILLKEEP_TOKEN: "  secret-token  " })).toBe("secret-token");
  });
});

test("startServer refuses hub mode without SKILLKEEP_TOKEN in the environment", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-hub-notoken-"));
  const saved = process.env.SKILLKEEP_TOKEN;
  delete process.env.SKILLKEEP_TOKEN;
  try {
    await expect(startServer({ mode: "hub", port: 0, dataDir: dir })).rejects.toThrow(
      "SKILLKEEP_TOKEN is required in hub mode",
    );
  } finally {
    if (saved !== undefined) process.env.SKILLKEEP_TOKEN = saved;
    // No db is opened on this path now (requireHubToken() is resolved before openDb() in
    // startServer), so a plain rm suffices -- nothing sqlite-related to retry around.
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("hub mode server", () => {
  let close: () => Promise<void>;
  let baseUrl: string;
  const token = "hub-test-token-abc123";
  const savedEnvToken = process.env.SKILLKEEP_TOKEN;

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

  async function putTar(pathAndQuery: string, tarBytes: ArrayBuffer): Promise<Response> {
    return fetch(`${baseUrl}${pathAndQuery}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: tarBytes,
    });
  }

  beforeAll(async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-hub-test-"));
    // No config is persisted here — `getConfig`/`defaultConfig` derive a fresh registryRoot from
    // this db's own directory (see packages/core/src/db.ts's `inferDataDirFromDb`), so the
    // registry this test's PUT/GET routes touch lives entirely inside `dataDir`, never this
    // machine's real ~/Library/Application Support/skillkeep registry.
    //
    // startServer's hub branch resolves the bearer token via requireHubToken(process.env) with no
    // injection seam, so the token must actually be in the environment for this process — restored
    // in afterAll so it never leaks into a sibling test file's process.env.
    process.env.SKILLKEEP_TOKEN = token;
    const started = await startServer({ mode: "hub", port: 0, dataDir });
    close = started.close;
    baseUrl = `http://127.0.0.1:${started.port}`;
    expect(started.token).toBe(token);
  });

  afterAll(async () => {
    await close();
    if (savedEnvToken !== undefined) process.env.SKILLKEEP_TOKEN = savedEnvToken;
    else {
      delete process.env.SKILLKEEP_TOKEN;
    }
  });

  test("GET /healthz reports mode: hub, no auth required", async () => {
    const res = await get("/healthz", { auth: false });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; mode: string };
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("hub");
  });

  test("API routes reject a missing/wrong bearer token", async () => {
    const res = await get("/api/v1/registry/manifest", { auth: false });
    expect(res.status).toBe(401);
  });

  test("scan/adopt/sync are deliberately unavailable in hub mode", async () => {
    expect((await get("/api/scan")).status).toBe(501);
    expect((await send("POST", "/api/adopt", { items: [] })).status).toBe(501);
    expect((await send("POST", "/api/sync", {})).status).toBe(501);
  });

  test("POST /api/v1/ingest -> GET /api/v1/devices round trip", async () => {
    const res = await send("POST", "/api/v1/ingest", {
      device: "laptop",
      usage: [
        {
          day: "2026-02-01",
          client: "claude",
          model: "model-x",
          repo: null,
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          costMicroUsd: 50,
        },
      ],
      skillUsage: [{ day: "2026-02-01", skill: "rtk", client: "claude", repo: null, count: 2 }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const devices = (await (await get("/api/v1/devices")).json()) as {
      name: string;
      lastSeen: number;
    }[];
    expect(devices.map((d) => d.name)).toEqual(["laptop"]);

    const summary = (await (
      await get("/api/usage/summary?group=model&from=2026-02-01&to=2026-02-01")
    ).json()) as { rows: { key: string; input: number }[] };
    expect(summary.rows).toEqual([
      { key: "model-x", input: 10, output: 5, cacheRead: 0, cacheWrite: 0, costMicroUsd: 50 },
    ]);
  });

  test("ingest from a second device accumulates a separate row instead of clobbering the first", async () => {
    await send("POST", "/api/v1/ingest", {
      device: "desktop",
      usage: [
        {
          day: "2026-02-02",
          client: "gemini",
          model: "model-y",
          repo: null,
          input: 100,
          output: 10,
          cacheRead: 0,
          cacheWrite: 0,
          costMicroUsd: null,
        },
      ],
    });
    await send("POST", "/api/v1/ingest", {
      device: "laptop",
      usage: [
        {
          day: "2026-02-02",
          client: "gemini",
          model: "model-y",
          repo: null,
          input: 200,
          output: 20,
          cacheRead: 0,
          cacheWrite: 0,
          costMicroUsd: null,
        },
      ],
    });
    const summary = (await (
      await get("/api/usage/summary?group=model&from=2026-02-02&to=2026-02-02")
    ).json()) as { rows: { key: string; input: number; output: number }[] };
    // Both devices' pushes must SUM (300/30), not leave only the last pusher's numbers (200/20).
    expect(summary.rows).toEqual([
      { key: "model-y", input: 300, output: 30, cacheRead: 0, cacheWrite: 0, costMicroUsd: null },
    ]);
  });

  test("ingest rejects a body without a device", async () => {
    const res = await send("POST", "/api/v1/ingest", { usage: [] });
    expect(res.status).toBe(400);
  });

  test("registry PUT/GET round trip with rev bump, then a stale parentRev conflicts with 409", async () => {
    const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-hub-skill-src-"));
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: hub-fixture\ndescription: a hub push/pull fixture\n---\nbody v1",
    );
    const tarBytes = await Bun.$`tar -cf - -C ${skillDir} .`.arrayBuffer();

    const manifestBefore = (await (await get("/api/v1/registry/manifest")).json()) as {
      scope: string;
      name: string;
      rev: number;
    }[];
    expect(manifestBefore.find((m) => m.name === "hub-fixture")).toBeUndefined();

    const putRes = await putTar(
      "/api/v1/registry/skill?scope=global&name=hub-fixture&parentRev=0",
      tarBytes,
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({ ok: true, rev: 1 });

    const getRes = await get("/api/v1/registry/skill?scope=global&name=hub-fixture");
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("content-type")).toBe("application/x-tar");

    const manifestAfter = (await (await get("/api/v1/registry/manifest")).json()) as {
      scope: string;
      name: string;
      rev: number;
    }[];
    const entry = manifestAfter.find((m) => m.name === "hub-fixture");
    expect(entry?.scope).toBe("global");
    expect(entry?.rev).toBe(1);

    // Stale parentRev (0, but the hub is now at rev 1) -> 409, no write.
    const staleRes = await putTar(
      "/api/v1/registry/skill?scope=global&name=hub-fixture&parentRev=0",
      tarBytes,
    );
    expect(staleRes.status).toBe(409);
    const staleBody = (await staleRes.json()) as { error: string; currentRev: number };
    expect(staleBody.currentRev).toBe(1);

    // Correct parentRev succeeds and bumps again.
    const okRes = await putTar(
      "/api/v1/registry/skill?scope=global&name=hub-fixture&parentRev=1",
      tarBytes,
    );
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ ok: true, rev: 2 });
  });

  test("registry PUT/GET reject a path-traversal name or scope with 400, never touching disk outside the registry root", async () => {
    const tarBytes = await Bun.$`echo hi`.arrayBuffer();
    const traversalCases = [
      "scope=global&name=..%2F..%2F..%2Fevil",
      "scope=global&name=..",
      "scope=project%2F..%2F..%2Fetc&name=fixture",
    ];
    for (const q of traversalCases) {
      const getRes = await get(`/api/v1/registry/skill?${q}`);
      expect(getRes.status).toBe(400);
      const putRes = await putTar(`/api/v1/registry/skill?${q}&parentRev=0`, tarBytes);
      expect(putRes.status).toBe(400);
    }
  });
});

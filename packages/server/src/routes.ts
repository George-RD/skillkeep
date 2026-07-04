import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  adoptDetectedBulk,
  archiveSkill,
  buildStatus,
  CLIENT_DIRS,
  type ClientId,
  type Config,
  type DetectedSkill,
  type Detection,
  findInRegistry,
  getConfig,
  globalOnlyTokenEstimate,
  hashSkillDir,
  loadRules,
  moveSkill,
  type ProjectConfig,
  queryUsageSummary,
  readSkillMeta,
  resolveLinkMode,
  runSync,
  scanRegistry,
  setConfig,
  symlinkProbe,
  tildeExpand,
  upsertSkillUsage,
  upsertUsageFact,
} from "@skillkeep/core";
import {
  adviseDedupe,
  type DedupeCandidate,
  resolveAiKey,
  resolveModel,
  suggestTriage,
  tuneDescription,
} from "./ai";
import { requireAuth } from "./auth";
import { emit, sseResponse } from "./events";
import { pullFromHub, pushToHub } from "./hub-link";
import {
  archiveSkillDir,
  buildManifest,
  createSkillTar,
  extractSkillTar,
  getSkillRev,
  resolveSkillDir,
  setSkillRev,
} from "./registry-sync";
import { getScan, resetScanCache } from "./scan-cache";
import { runUsageIngest } from "./usage-ingest";

/** Everything a route handler needs: the state store, the bearer token, and the daemon's data dir. */
export interface RouterContext {
  db: Database;
  token: string;
  dataDir: string;
  version: string;
  mode: "agent" | "hub";
}
const UI_DIST_DIR = path.join(import.meta.dir, "../../ui/dist");
const ALL_CLIENT_IDS = Object.keys(CLIENT_DIRS) as ClientId[];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// --- /healthz ----------------------------------------------------------------

function handleHealthz(ctx: RouterContext): Response {
  return jsonResponse({ ok: true, version: ctx.version, mode: ctx.mode });
}

// --- /api/scan -----------------------------------------------------------------

async function handleScan(ctx: RouterContext, url: URL): Promise<Response> {
  const config = getConfig(ctx.db);
  const fresh = url.searchParams.get("fresh") === "1";
  const { data, computed } = await getScan(config, fresh);
  if (computed) emit("scan:progress");
  return jsonResponse(data);
}

// --- /api/adopt ------------------------------------------------------------

interface AdoptItemInput {
  name: string;
  path: string;
  scope: string;
}

interface AdoptResultOutput {
  name: string;
  ok: boolean;
  error?: string;
}

async function handleAdopt(ctx: RouterContext, req: Request): Promise<Response> {
  const body = await readJsonBody<{ items?: AdoptItemInput[] }>(req);
  if (!body || !Array.isArray(body.items)) {
    return jsonResponse({ error: "expected { items: AdoptItem[] }" }, 400);
  }
  const config = getConfig(ctx.db);
  const { data: detection } = await getScan(config, false);

  const results: (AdoptResultOutput | null)[] = body.items.map(() => null);
  const bulkInputs: { skill: DetectedSkill; scope: string }[] = [];
  const bulkPositions: number[] = [];
  body.items.forEach((item, index) => {
    const skill = detection.skills.find((s) => s.name === item.name && s.path === item.path);
    if (!skill) {
      results[index] = { name: item.name, ok: false, error: "not found in last scan" };
      return;
    }
    bulkInputs.push({ skill, scope: item.scope });
    bulkPositions.push(index);
  });

  const bulkResults = await adoptDetectedBulk(bulkInputs, config);
  bulkResults.forEach((result, i) => {
    const position = bulkPositions[i];
    if (position !== undefined) results[position] = result;
  });

  resetScanCache();
  return jsonResponse(results);
}

// --- /api/registry -----------------------------------------------------------

async function handleRegistryList(ctx: RouterContext): Promise<Response> {
  const config = getConfig(ctx.db);
  const entries = await scanRegistry(config.registryRoot);
  const withHash = await Promise.all(
    entries.map(async (entry) => ({
      scope: entry.scope,
      name: entry.skill.name,
      description: entry.skill.description,
      hash: await hashSkillDir(entry.skill.dir),
    })),
  );
  const byScope = new Map<string, { name: string; description: string | null; hash: string }[]>();
  for (const item of withHash) {
    const list = byScope.get(item.scope) ?? [];
    list.push({ name: item.name, description: item.description, hash: item.hash });
    byScope.set(item.scope, list);
  }
  const scopes = [...byScope.entries()].map(([scope, skills]) => ({ scope, skills }));
  return jsonResponse(scopes);
}

async function handleRegistryMove(ctx: RouterContext, req: Request): Promise<Response> {
  const body = await readJsonBody<{ name?: unknown; toScope?: unknown }>(req);
  if (!body || typeof body.name !== "string" || typeof body.toScope !== "string") {
    return jsonResponse({ error: "expected { name: string, toScope: string }" }, 400);
  }
  const config = getConfig(ctx.db);
  try {
    await moveSkill(config.registryRoot, body.name, body.toScope);
    resetScanCache();
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleRegistryArchive(ctx: RouterContext, req: Request): Promise<Response> {
  const body = await readJsonBody<{ name?: unknown }>(req);
  if (!body || typeof body.name !== "string") {
    return jsonResponse({ error: "expected { name: string }" }, 400);
  }
  const config = getConfig(ctx.db);
  try {
    await archiveSkill(config.registryRoot, body.name);
    resetScanCache();
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

// --- /api/skill --------------------------------------------------------------

async function handleSkillGet(ctx: RouterContext, url: URL): Promise<Response> {
  const name = url.searchParams.get("name");
  if (!name) return jsonResponse({ error: "missing name query param" }, 400);
  const config = getConfig(ctx.db);
  const entry = await findInRegistry(config.registryRoot, name);
  if (!entry) return jsonResponse({ error: "not found" }, 404);
  const content = await Bun.file(entry.skill.skillMdPath).text();
  return jsonResponse({ name, content });
}

/** Validate SKILL.md content in a disposable temp dir (via the same parser the registry uses) before ever touching the real file. */
async function validateSkillContent(
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tempDir = path.join(os.tmpdir(), `skillkeep-validate-${randomUUID()}`);
  await fs.mkdir(tempDir, { recursive: true });
  try {
    await fs.writeFile(path.join(tempDir, "SKILL.md"), content, "utf8");
    const meta = await readSkillMeta(tempDir);
    if (meta.invalid) {
      return {
        ok: false,
        error: "invalid SKILL.md: missing or unparsable frontmatter description",
      };
    }
    return { ok: true };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function handleSkillPut(ctx: RouterContext, req: Request): Promise<Response> {
  const body = await readJsonBody<{ name?: unknown; content?: unknown }>(req);
  if (!body || typeof body.name !== "string" || typeof body.content !== "string") {
    return jsonResponse({ error: "expected { name: string, content: string }" }, 400);
  }
  const config = getConfig(ctx.db);
  const entry = await findInRegistry(config.registryRoot, body.name);
  if (!entry) return jsonResponse({ error: "not found" }, 404);

  const validation = await validateSkillContent(body.content);
  if (!validation.ok) return jsonResponse({ error: validation.error }, 422);

  await fs.writeFile(entry.skill.skillMdPath, body.content, "utf8");
  resetScanCache();
  return jsonResponse({ ok: true });
}

// --- /api/sync -----------------------------------------------------------------

async function handleSync(ctx: RouterContext, req: Request): Promise<Response> {
  const body = await readJsonBody<{ dryRun?: unknown }>(req);
  if (!body || typeof body.dryRun !== "boolean") {
    return jsonResponse({ error: "expected { dryRun: boolean }" }, 400);
  }
  const config = getConfig(ctx.db);
  const report = await runSync(config, { dryRun: body.dryRun, prune: false });
  if (!body.dryRun) {
    resetScanCache();
    emit("sync:done");
  }
  return jsonResponse(report);
}

// --- /api/status ---------------------------------------------------------------

async function handleStatus(ctx: RouterContext): Promise<Response> {
  const config = getConfig(ctx.db);
  const rules = await loadRules(config.registryRoot);
  const [status, tokenEstimate, { data: scan }] = await Promise.all([
    buildStatus(config.registryRoot, rules, config.inboxDirs),
    globalOnlyTokenEstimate(config.registryRoot),
    getScan(config, false),
  ]);
  const drift = [...new Set(scan.skills.filter((s) => s.state === "drifted").map((s) => s.name))];
  return jsonResponse({
    counts: status.registryCounts,
    duplicates: status.duplicates.map((d) => d.name),
    misplacements: status.misplacements.map((m) => m.name),
    drift,
    globalOnlyTokenEstimate: tokenEstimate,
  });
}

// --- /api/usage ------------------------------------------------------------

const USAGE_GROUPS: Record<string, true> = { model: true, repo: true, client: true, skill: true };

function handleUsageSummary(ctx: RouterContext, url: URL): Response {
  const group = url.searchParams.get("group");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!group || !USAGE_GROUPS[group] || !from || !to) {
    return jsonResponse(
      { error: "expected ?group=model|repo|client|skill&from=YYYY-MM-DD&to=YYYY-MM-DD" },
      400,
    );
  }
  const rows = queryUsageSummary(ctx.db, group as "model" | "repo" | "client" | "skill", from, to);
  return jsonResponse({ rows });
}

async function handleUsageRescan(ctx: RouterContext): Promise<Response> {
  await runUsageIngest(ctx.db, { dataDir: ctx.dataDir });
  emit("usage:updated", {});
  return jsonResponse({ ok: true });
}

// --- /api/settings ---------------------------------------------------------------

async function buildLinkModeProbe(
  config: Config,
  dataDir: string,
): Promise<{ platform: string; result: "symlink" | "copy"; reason: string }> {
  const probeResult = await symlinkProbe(dataDir);
  const result = await resolveLinkMode(config.linkMode, process.platform, () =>
    Promise.resolve(probeResult),
  );
  let reason: string;
  if (config.linkMode === "copy") {
    reason = "settings force copy mode regardless of platform support";
  } else if (process.platform === "win32") {
    reason = probeResult
      ? "Windows symlink probe succeeded (Developer Mode or admin privileges)"
      : "Windows symlink probe failed; falling back to copy mode";
  } else {
    reason = `${process.platform} supports symlinks natively`;
  }
  return { platform: process.platform, result, reason };
}

async function handleSettingsGet(ctx: RouterContext): Promise<Response> {
  const config = getConfig(ctx.db);
  const linkModeProbe = await buildLinkModeProbe(config, ctx.dataDir);
  return jsonResponse({
    registryRoot: config.registryRoot,
    repoRoots: config.repoRoots,
    globalClients: config.globalClients,
    repoClients: config.repoClients,
    linkMode: config.linkMode,
    inboxDirs: config.inboxDirs,
    projects: config.projects,
    hub: config.hub ? { url: config.hub.url, device: config.hub.device } : null,
    ai: config.ai,
    linkModeProbe,
  });
}

function filterClientIds(values: unknown): ClientId[] {
  if (!Array.isArray(values)) return [];
  const allowed: string[] = ALL_CLIENT_IDS;
  return values.filter((v): v is ClientId => typeof v === "string" && allowed.includes(v));
}

/** Project names we refuse to store: `.`/`..` would escape the `project/<name>` registry path, and
 * `__proto__`/`constructor`/`prototype` are prototype-polluting object keys (`__proto__` assigned as a
 * key even hits the setter and silently drops the entry). Reject them all with a clear 422. */
const RESERVED_PROJECT_NAMES = new Set([".", "..", "__proto__", "constructor", "prototype"]);

/** Parse the settings PUT body's `projects` field: a `Record<string, ProjectConfig>` that replaces
 * the current value, or `undefined` to preserve it. When present, the field is validated
 * strictly and replaces the old map entirely; project names must be non-empty strings without
 * path separators, and every repo must be absolute (or ~/-relative). */
function parseProjects(
  value: unknown,
):
  | { ok: true; projects: Record<string, ProjectConfig> | undefined }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, projects: undefined };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "projects must be an object" };
  }
  const projects: Record<string, ProjectConfig> = {};
  for (const [name, project] of Object.entries(value as Record<string, unknown>)) {
    if (name.trim() === "" || name.includes("/") || name.includes("\\")) {
      return {
        ok: false,
        error: `project name must be non-empty and contain no path separators: ${name}`,
      };
    }
    if (RESERVED_PROJECT_NAMES.has(name)) {
      return { ok: false, error: `project name is not allowed: ${name}` };
    }
    if (project === null || typeof project !== "object" || Array.isArray(project)) {
      return { ok: false, error: `project ${name} must be an object` };
    }
    const p = project as Record<string, unknown>;
    if (!Array.isArray(p.repos) || !p.repos.every((r) => typeof r === "string")) {
      return { ok: false, error: `project ${name}.repos must be an array of strings` };
    }
    if (p.repos.length === 0) {
      return { ok: false, error: `project ${name}.repos must contain at least one repo` };
    }
    if (p.repos.some((r) => (r as string).trim() === "")) {
      return { ok: false, error: `project ${name}.repos entries must be non-empty strings` };
    }
    if (!p.repos.every((r) => path.isAbsolute(tildeExpand(r as string)))) {
      return {
        ok: false,
        error: `project ${name}.repos entries must be absolute (or ~/-relative)`,
      };
    }
    if (p.mode !== undefined && p.mode !== "link" && p.mode !== "committed") {
      return { ok: false, error: `project ${name}.mode must be 'link' or 'committed'` };
    }
    if (p.local_config !== undefined && typeof p.local_config !== "boolean") {
      return { ok: false, error: `project ${name}.local_config must be a boolean` };
    }
    projects[name] = {
      repos: p.repos as string[],
      mode: p.mode as "link" | "committed" | undefined,
      local_config: p.local_config as boolean | undefined,
    };
  }
  return { ok: true, projects };
}

/** Parse the settings PUT body's `ai` field: `{ provider, model } | null`. No key field exists on
 * this shape by design (see Config.ai's doc comment) — there is nothing to preserve across saves
 * the way hub's token is, so unlike `hub` this is a pure parse, not a merge with the current value. */
function parseAiLink(value: unknown): { ok: true; ai: Config["ai"] } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, ai: null };
  if (typeof value !== "object") return { ok: false };
  const v = value as Record<string, unknown>;
  if (
    (v.provider !== "anthropic" && v.provider !== "openai" && v.provider !== "openrouter") ||
    typeof v.model !== "string" ||
    v.model.trim() === ""
  ) {
    return { ok: false };
  }
  return { ok: true, ai: { provider: v.provider, model: v.model } };
}

async function handleSettingsPut(ctx: RouterContext, req: Request): Promise<Response> {
  const body = await readJsonBody<Record<string, unknown>>(req);
  if (!body) return jsonResponse({ error: "invalid JSON body" }, 400);

  const { registryRoot, repoRoots, linkMode, inboxDirs } = body;
  if (typeof registryRoot !== "string" || registryRoot.trim() === "") {
    return jsonResponse({ error: "registryRoot is required" }, 422);
  }
  if (!Array.isArray(repoRoots) || !repoRoots.every((r) => typeof r === "string")) {
    return jsonResponse({ error: "repoRoots must be an array of strings" }, 422);
  }
  if (!repoRoots.every((r) => path.isAbsolute(tildeExpand(r)))) {
    return jsonResponse({ error: "every repoRoots entry must be absolute (or ~/-relative)" }, 422);
  }
  if (linkMode !== "symlink" && linkMode !== "copy") {
    return jsonResponse({ error: "linkMode must be 'symlink' or 'copy'" }, 422);
  }
  if (!Array.isArray(inboxDirs) || !inboxDirs.every((d) => typeof d === "string")) {
    return jsonResponse({ error: "inboxDirs must be an array of strings" }, 422);
  }
  const current = getConfig(ctx.db);

  // Hub link: accepts { url, token, device } or null. An empty/absent token preserves the existing
  // one (the UI's password field is never populated on load, so re-saving must not blank it).
  let hub: Config["hub"] = null;
  if (body.hub !== null && body.hub !== undefined) {
    const h = body.hub as Record<string, unknown>;
    if (
      typeof h.url !== "string" ||
      typeof h.device !== "string" ||
      (h.token !== undefined && typeof h.token !== "string")
    ) {
      return jsonResponse(
        { error: "hub must be { url: string, device: string, token?: string } or null" },
        422,
      );
    }
    const token =
      typeof h.token === "string" && h.token !== "" ? h.token : (current.hub?.token ?? "");
    hub = { url: h.url, token, device: h.device };
  }

  const parsedAi = parseAiLink(body.ai);
  if (!parsedAi.ok) {
    return jsonResponse(
      {
        error: "ai must be { provider: 'anthropic'|'openai'|'openrouter', model: string } or null",
      },
      422,
    );
  }

  const parsedProjects = parseProjects(body.projects);
  if (!parsedProjects.ok) {
    return jsonResponse({ error: parsedProjects.error }, 422);
  }

  const merged: Config = {
    ...current,
    registryRoot,
    repoRoots,
    globalClients: filterClientIds(body.globalClients),
    repoClients: filterClientIds(body.repoClients),
    linkMode,
    inboxDirs,
    projects: parsedProjects.projects ?? current.projects,
    hub,
    ai: parsedAi.ai,
  };
  setConfig(ctx.db, merged);
  resetScanCache();
  return jsonResponse({ ok: true });
}

// --- /api/ai/* ---------------------------------------------------------------

/** Body shape accepted by every mutation endpoint below: one skill's name/description/SKILL.md
 * body, enough context for the model to reason about it without any storage access of its own. */
interface AiSkillContextInput {
  name: unknown;
  description: unknown;
  body: unknown;
}

function parseAiSkillContext(value: unknown): DedupeCandidate | null {
  if (!value || typeof value !== "object") return null;
  const v = value as AiSkillContextInput;
  if (
    typeof v.name !== "string" ||
    typeof v.description !== "string" ||
    typeof v.body !== "string"
  ) {
    return null;
  }
  return { name: v.name, description: v.description, body: v.body };
}

/** Every scope a triage suggestion is allowed to land in: whatever scopes are actually deployed in
 * the registry right now, plus "global" and "archive" (always valid destinations, even empty). */
async function listAiScopes(config: Config): Promise<string[]> {
  const entries = await scanRegistry(config.registryRoot);
  const scopes = new Set<string>(["global", "archive"]);
  for (const entry of entries) scopes.add(entry.scope);
  return [...scopes];
}

/** GET /api/ai/status never itself gates on configuration — reporting "not configured" IS its
 * job, so it always returns 200 with the same resolveAiKey gate reduced to a boolean. The 503
 * gate below is for the three endpoints that actually attempt a provider call. */
async function handleAiStatus(ctx: RouterContext, req: Request): Promise<Response> {
  const config = getConfig(ctx.db);
  const key = resolveAiKey(req, config);
  return jsonResponse({ configured: key !== null });
}

async function handleAiTriage(ctx: RouterContext, req: Request): Promise<Response> {
  const config = getConfig(ctx.db);
  const key = resolveAiKey(req, config);
  if (config.ai === null || key === null) return jsonResponse({ error: "AI not configured" }, 503);

  const body = await readJsonBody<{ names?: unknown }>(req);
  if (
    !body ||
    !Array.isArray(body.names) ||
    body.names.length === 0 ||
    !body.names.every((n) => typeof n === "string")
  ) {
    return jsonResponse({ error: "expected { names: string[] } (non-empty)" }, 400);
  }

  const scopes = await listAiScopes(config);
  const model = resolveModel(config.ai, key);
  const suggestions = await suggestTriage(model, body.names, scopes);
  return jsonResponse(suggestions);
}

async function handleAiDescribe(ctx: RouterContext, req: Request): Promise<Response> {
  const config = getConfig(ctx.db);
  const key = resolveAiKey(req, config);
  if (config.ai === null || key === null) return jsonResponse({ error: "AI not configured" }, 503);

  const body = await readJsonBody<Partial<AiSkillContextInput>>(req);
  if (
    !body ||
    typeof body.name !== "string" ||
    typeof body.description !== "string" ||
    typeof body.body !== "string"
  ) {
    return jsonResponse(
      { error: "expected { name: string, description: string, body: string }" },
      400,
    );
  }

  const model = resolveModel(config.ai, key);
  const suggestion = await tuneDescription(model, body.name, body.description, body.body);
  return jsonResponse({ name: body.name, suggestion });
}

async function handleAiDedupe(ctx: RouterContext, req: Request): Promise<Response> {
  const config = getConfig(ctx.db);
  const key = resolveAiKey(req, config);
  if (config.ai === null || key === null) return jsonResponse({ error: "AI not configured" }, 503);

  const body = await readJsonBody<{ a?: unknown; b?: unknown }>(req);
  const a = body ? parseAiSkillContext(body.a) : null;
  const b = body ? parseAiSkillContext(body.b) : null;
  if (!a || !b) {
    return jsonResponse({ error: "expected { a: SkillContext, b: SkillContext }" }, 400);
  }

  const model = resolveModel(config.ai, key);
  const advice = await adviseDedupe(model, a, b);
  return jsonResponse(advice);
}

// --- static UI (packages/ui/dist) ---------------------------------------------

/**
 * Serve one static asset from the built SPA (JS/CSS bundles). No auth: build artefacts carry no
 * secrets and a `<script src>`/`<link>` load can't attach an Authorization header anyway.
 */
async function serveAsset(pathname: string): Promise<Response> {
  const resolved = path.normalize(path.join(UI_DIST_DIR, pathname));
  if (resolved !== UI_DIST_DIR && !resolved.startsWith(`${UI_DIST_DIR}${path.sep}`)) {
    return jsonResponse({ error: "not found" }, 404);
  }
  const file = Bun.file(resolved);
  if (!(await file.exists())) return jsonResponse({ error: "not found" }, 404);
  return new Response(file);
}

/**
 * Serve index.html with the real token injected as `window.__SKILLKEEP__` — the exact global the
 * Tauri shell also injects — so the page's own subsequent /api/* fetches authenticate normally.
 * Callers MUST have already confirmed the caller holds the real token (header or `?token=`);
 * this function never re-checks, so a caller that skips that check would leak the token to
 * anyone able to load `/` (e.g. via DNS rebinding), defeating the whole bearer scheme.
 */
async function serveIndexHtml(req: Request, ctx: RouterContext): Promise<Response> {
  const file = Bun.file(path.join(UI_DIST_DIR, "index.html"));
  if (!(await file.exists())) return jsonResponse({ error: "not found" }, 404);
  const host = req.headers.get("host") ?? "127.0.0.1";
  const html = await file.text();
  const injected = html.replace(
    "</head>",
    `<script>window.__SKILLKEEP__ = ${JSON.stringify({ port: Number(host.split(":")[1] ?? 0), token: ctx.token })};</script></head>`,
  );
  return new Response(injected, { headers: { "Content-Type": "text/html" } });
}
// --- /api/v1/* (hub mode only) --------------------------------------------------

/** Minimal server-side ingest body types — a subset of the usage_facts/skill_usage row shapes. */
interface IngestUsageRow {
  day: string;
  client: string;
  model: string;
  repo: string | null;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costMicroUsd: number | null;
}

interface IngestSkillUsageRow {
  day: string;
  skill: string;
  client: string;
  repo: string | null;
  model: string;
  count: number;
}

interface IngestBody {
  device: string;
  snapshot?: Detection;
  usage?: IngestUsageRow[];
  skillUsage?: IngestSkillUsageRow[];
}

async function handleIngest(ctx: RouterContext, req: Request): Promise<Response> {
  const body = await readJsonBody<IngestBody>(req);
  if (!body || typeof body.device !== "string" || body.device.trim() === "") {
    return jsonResponse(
      { error: "expected { device: string, snapshot?, usage?, skillUsage? }" },
      400,
    );
  }
  const now = Date.now();
  ctx.db
    .prepare("INSERT OR REPLACE INTO devices (name, last_seen) VALUES (?, ?)")
    .run(body.device, now);

  if (Array.isArray(body.usage)) {
    for (const row of body.usage) {
      upsertUsageFact(
        ctx.db,
        row.day,
        row.client,
        row.model,
        row.repo ?? null,
        {
          input: row.input,
          output: row.output,
          cacheRead: row.cacheRead,
          cacheWrite: row.cacheWrite,
          costMicroUsd: row.costMicroUsd ?? null,
        },
        body.device,
      );
    }
  }
  if (Array.isArray(body.skillUsage)) {
    for (const row of body.skillUsage) {
      upsertSkillUsage(
        ctx.db,
        row.day,
        row.skill,
        row.client,
        row.repo ?? null,
        row.model,
        row.count,
        body.device,
      );
    }
  }
  emit("usage:updated", {});
  return jsonResponse({ ok: true });
}

async function handleManifest(ctx: RouterContext): Promise<Response> {
  const config = getConfig(ctx.db);
  const manifest = await buildManifest(ctx.db, config.registryRoot);
  return jsonResponse(manifest);
}

async function handleSkillTarGet(ctx: RouterContext, url: URL): Promise<Response> {
  const scope = url.searchParams.get("scope");
  const name = url.searchParams.get("name");
  if (!scope || !name) return jsonResponse({ error: "missing scope or name query param" }, 400);
  const config = getConfig(ctx.db);
  let dir: string;
  try {
    dir = resolveSkillDir(config.registryRoot, scope, name);
  } catch {
    return jsonResponse({ error: "invalid scope" }, 400);
  }
  if (!existsSync(dir)) return jsonResponse({ error: "not found" }, 404);
  const tar = await createSkillTar(dir);
  return new Response(tar, { headers: { "Content-Type": "application/x-tar" } });
}

async function handleSkillTarPut(ctx: RouterContext, req: Request, url: URL): Promise<Response> {
  const scope = url.searchParams.get("scope");
  const name = url.searchParams.get("name");
  const parentRevStr = url.searchParams.get("parentRev");
  if (!scope || !name || parentRevStr === null) {
    return jsonResponse({ error: "missing scope, name, or parentRev query param" }, 400);
  }
  const parentRev = Number(parentRevStr);
  if (!Number.isFinite(parentRev) || parentRev < 0) {
    return jsonResponse({ error: "parentRev must be a non-negative integer" }, 400);
  }
  const config = getConfig(ctx.db);
  let dir: string;
  try {
    dir = resolveSkillDir(config.registryRoot, scope, name);
  } catch {
    return jsonResponse({ error: "invalid scope" }, 400);
  }

  const currentRev = getSkillRev(ctx.db, scope, name);
  if (currentRev !== parentRev) {
    return jsonResponse({ error: "conflict", currentRev }, 409);
  }

  if (parentRev > 0 && existsSync(dir)) {
    await archiveSkillDir(ctx.dataDir, name, parentRev, dir);
  }
  const tarBytes = await req.arrayBuffer();
  await extractSkillTar(dir, tarBytes);
  const newRev = parentRev + 1;
  setSkillRev(ctx.db, scope, name, newRev);
  return jsonResponse({ ok: true, rev: newRev });
}

function handleDevices(ctx: RouterContext): Response {
  const rows = ctx.db
    .prepare("SELECT name, last_seen AS lastSeen FROM devices ORDER BY last_seen DESC")
    .all() as { name: string; lastSeen: number }[];
  return jsonResponse(rows);
}

// --- /api/hub/* (agent mode only) -----------------------------------------------

async function handleHubPush(ctx: RouterContext): Promise<Response> {
  const config = getConfig(ctx.db);
  if (!config.hub) return jsonResponse({ error: "hub is not configured" }, 400);
  const result = await pushToHub(ctx.db, config);
  return jsonResponse(result);
}

async function handleHubPull(ctx: RouterContext): Promise<Response> {
  const config = getConfig(ctx.db);
  if (!config.hub) return jsonResponse({ error: "hub is not configured" }, 400);
  const result = await pullFromHub(config);
  return jsonResponse(result);
}

// --- router --------------------------------------------------------------------

/**
 * Build the daemon's request handler: one route table, auth-gated except /healthz (no auth) and
 * two deliberate query-param allowances that exist only because a browser can't set headers on a
 * plain navigation or an EventSource: `/api/events` (SSE, per the UI's exact convention) and `/`
 * (so `skillkeep ui` can open `http://127.0.0.1:<port>/?token=<token>` in a bare browser tab).
 * Every other route accepts the Authorization header only.
 */
export function createRouter(ctx: RouterContext): (req: Request) => Promise<Response> {
  return async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const { method } = req;

    if (pathname === "/healthz" && method === "GET") return handleHealthz(ctx);

    if (pathname === "/api/events" && method === "GET") {
      if (!requireAuth(req, ctx.token)) return jsonResponse({ error: "unauthorized" }, 401);
      return sseResponse();
    }

    if (pathname.startsWith("/api/")) {
      if (!requireAuth(req, ctx.token)) return jsonResponse({ error: "unauthorized" }, 401);
      try {
        // Hub mode: agent-only write/detect routes are unavailable.
        if (ctx.mode === "hub") {
          if (
            (pathname === "/api/scan" && method === "GET") ||
            (pathname === "/api/adopt" && method === "POST") ||
            (pathname === "/api/sync" && method === "POST")
          ) {
            return jsonResponse({ error: "not available in hub mode" }, 501);
          }
          if (pathname === "/api/v1/ingest" && method === "POST") {
            return await handleIngest(ctx, req);
          }
          if (pathname === "/api/v1/registry/manifest" && method === "GET") {
            return await handleManifest(ctx);
          }
          if (pathname === "/api/v1/registry/skill" && method === "GET") {
            return await handleSkillTarGet(ctx, url);
          }
          if (pathname === "/api/v1/registry/skill" && method === "PUT") {
            return await handleSkillTarPut(ctx, req, url);
          }
          if (pathname === "/api/v1/devices" && method === "GET") return handleDevices(ctx);
        }

        // Agent mode: hub-link routes (delegate to the shared push/pull logic).
        if (ctx.mode === "agent") {
          if (pathname === "/api/hub/push" && method === "POST") {
            return await handleHubPush(ctx);
          }
          if (pathname === "/api/hub/pull" && method === "POST") {
            return await handleHubPull(ctx);
          }
        }

        if (pathname === "/api/scan" && method === "GET") return await handleScan(ctx, url);
        if (pathname === "/api/adopt" && method === "POST") return await handleAdopt(ctx, req);
        if (pathname === "/api/registry" && method === "GET") return await handleRegistryList(ctx);
        if (pathname === "/api/registry/move" && method === "POST") {
          return await handleRegistryMove(ctx, req);
        }
        if (pathname === "/api/registry/archive" && method === "POST") {
          return await handleRegistryArchive(ctx, req);
        }
        if (pathname === "/api/skill" && method === "GET") return await handleSkillGet(ctx, url);
        if (pathname === "/api/skill" && method === "PUT") return await handleSkillPut(ctx, req);
        if (pathname === "/api/sync" && method === "POST") return await handleSync(ctx, req);
        if (pathname === "/api/status" && method === "GET") return await handleStatus(ctx);
        if (pathname === "/api/usage/summary" && method === "GET") {
          return handleUsageSummary(ctx, url);
        }
        if (pathname === "/api/usage/rescan" && method === "POST") {
          return await handleUsageRescan(ctx);
        }
        if (pathname === "/api/settings" && method === "GET") return await handleSettingsGet(ctx);
        if (pathname === "/api/settings" && method === "PUT")
          return await handleSettingsPut(ctx, req);
        if (pathname === "/api/ai/status" && method === "GET") {
          return await handleAiStatus(ctx, req);
        }
        if (pathname === "/api/ai/triage" && method === "POST") {
          return await handleAiTriage(ctx, req);
        }
        if (pathname === "/api/ai/describe" && method === "POST") {
          return await handleAiDescribe(ctx, req);
        }
        if (pathname === "/api/ai/dedupe" && method === "POST") {
          return await handleAiDedupe(ctx, req);
        }
      } catch (err) {
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
      return jsonResponse({ error: "not found" }, 404);
    }

    if (method !== "GET") return jsonResponse({ error: "not found" }, 404);

    if (pathname === "/" || pathname === "/index.html") {
      if (!existsSync(UI_DIST_DIR)) {
        return new Response("UI not built. Run `bun run --cwd packages/ui build`.\n", {
          headers: { "Content-Type": "text/plain" },
        });
      }
      const queryToken = url.searchParams.get("token");
      if (!requireAuth(req, ctx.token) && queryToken !== ctx.token) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }
      return serveIndexHtml(req, ctx);
    }

    if (!existsSync(UI_DIST_DIR)) return jsonResponse({ error: "not found" }, 404);
    return serveAsset(pathname);
  };
}

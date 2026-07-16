/**
 * Types mirror the skillkeep daemon HTTP contract. The UI is the client; the
 * server (packages/server) is implemented separately and may not exist on disk
 * yet — these shapes are the authoritative contract this package builds against.
 */

export interface DetectedSkill {
  name: string;
  description: string | null;
  hash: string;
  client: string;
  surface: "user" | "repo";
  repoPath?: string;
  path: string;
  state: "managed" | "unmanaged" | "duplicate" | "drifted" | "invalid";
  registryScope?: string;
}

export interface Detection {
  skills: DetectedSkill[];
  repos: string[];
  clientsFound: string[];
  tokenEstimate: { global: number; perRepo: Record<string, number> };
}

export interface AdoptItem {
  name: string;
  path: string;
  scope: string;
}

export interface AdoptResult {
  name: string;
  ok: boolean;
  error?: string;
}

/** One skill sitting in a configured inbox dir, from GET /api/inbox. */
export interface InboxSkill {
  name: string;
  path: string;
  dir: string;
  description: string;
}

export interface RegistrySkill {
  name: string;
  description: string | null;
  hash: string;
}

export interface RegistryScope {
  scope: string;
  skills: RegistrySkill[];
}

export interface SkillContent {
  name: string;
  content: string;
}

export interface SyncReport {
  created: string[];
  fixed: string[];
  pruned: string[];
  configReminders: string[];
  errors: string[];
}

export interface StatusReport {
  counts: Record<string, number>;
  duplicates: string[];
  misplacements: string[];
  drift: string[];
  globalOnlyTokenEstimate: number;
}

/** One drift/dangling-link/dead-config/inbox issue, mirrors CheckFinding server-side. */
export interface CheckFinding {
  kind: string;
  detail: string;
}

/** Outcome of an agent->hub sync performed as the last step of a maintenance pass. */
export interface MaintenanceHubResult {
  pushed: string[];
  pulled: string[];
  conflicts: string[];
  error?: string;
}

/** The most recent runMaintenancePass() result, persisted under the "lastMaintenance" setting. */
export interface MaintenanceResult {
  at: string;
  syncOk: boolean;
  syncError?: string;
  findings: CheckFinding[];
  routed: string[];
  pushed?: boolean;
  hub?: MaintenanceHubResult;
}

/** One skill-hygiene suggestion surfaced on the Health screen. */
export interface Recommendation {
  id: string;
  kind: "unused-skill" | "duplicate-pair" | "inbox-triage" | "token-cost";
  title: string;
  detail: string;
  skills: string[];
  scope?: string;
  action: "archive" | "dedupe" | "triage" | "review";
}

export interface RecommendationsResponse {
  recommendations: Recommendation[];
  findings: CheckFinding[];
  window: { from: string; to: string; days: number };
  lastMaintenance: MaintenanceResult | null;
}

export type UsageGroup = "model" | "repo" | "client" | "skill";

export interface UsageRow {
  key: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costMicroUsd: number | null;
}

export interface UsageSummary {
  rows: UsageRow[];
}

export interface LinkModeProbe {
  platform: string;
  result: "symlink" | "copy";
  reason: string;
}

/** Hub link as returned by GET /api/settings — never carries the token. */
export interface HubSettings {
  url: string;
  device: string;
}

/** Hub link as PUT to /api/settings — the token is write-only (empty string keeps the existing one). */
export interface HubInput {
  url: string;
  token: string;
  device: string;
}

/**
 * BYOK AI link: provider + model only. There is no key field here on purpose
 * -- the API key is never persisted to SQLite, config, or logs; it is
 * resolved per-request from the OS keychain (desktop, via the Tauri
 * `get_ai_key` bridge) or the `SKILLKEEP_AI_KEY` env var (CLI/hub). Same
 * shape for GET and PUT, unlike `hub`, since there is no secret to split
 * write-only.
 */
export interface AiLink {
  provider: "anthropic" | "openai" | "openrouter";
  model: string;
}

export interface Settings {
  registryRoot: string;
  repoRoots: string[];
  globalClients: string[];
  repoClients: string[];
  linkMode: "symlink" | "copy";
  inboxDirs: string[];
  hub: HubSettings | null;
  ai: AiLink | null;
  /** Hours between daemon maintenance passes (agent mode). */
  maintenanceIntervalHours: number;
  /** Maintenance passes also pull, auto-triage, and push (mirrors `cron --auto`). */
  autoMaintenance: boolean;
  linkModeProbe?: LinkModeProbe;
}

/** Shape PUT to /api/settings — same as Settings without the read-only probe, and hub carries a token. */
export type SettingsInput = Omit<Settings, "linkModeProbe" | "hub"> & {
  hub: HubInput | null;
};

export interface OpResult {
  ok: boolean;
  error?: string;
}

export interface Health {
  ok: boolean;
  version: string;
  mode?: "agent" | "hub";
}

/** One device known to a hub, from GET /api/v1/devices. */
export interface Device {
  name: string;
  lastSeen: number;
}

/** Result of an agent→hub push (POST /api/hub/push). */
export interface HubPushResult {
  device: string;
  usageRows: number;
  skillUsageRows: number;
  skillsPushed: string[];
  conflicts: string[];
}

/** Result of a hub→agent pull (POST /api/hub/pull). */
export interface HubPullResult {
  skillsPulled: string[];
}

/** One caller-visible skill body, shared by the describe/dedupe request shapes. */
export interface AiSkillContext {
  name: string;
  description: string;
  body: string;
}

/** GET /api/ai/status result. Gated the same way as the mutation endpoints, so a 200 with `configured: false` and a 503 both mean "not usable" -- the client normalises both into this shape (see `getAiStatus`). */
export interface AiStatus {
  configured: boolean;
}

/** POST /api/ai/triage result item. `scope` is validated server-side against the real, current scope list -- never trust it blindly. */
export interface TriageSuggestion {
  name: string;
  scope: string;
  rationale: string;
}

/** POST /api/ai/describe result: a proposed description only. The caller applies it via the existing PUT /api/skill. */
export interface DescribeSuggestion {
  name: string;
  suggestion: string;
}

/** POST /api/ai/dedupe result: a proposed resolution only. The caller applies it via the existing adopt/archive endpoints. */
export interface DedupeAdvice {
  recommendation: "keep-a" | "keep-b" | "merge";
  rationale: string;
}

export interface SkillkeepGlobal {
  port: number;
  token: string;
}

/**
 * Injected by the Tauri shell (apps/desktop) before the UI boots via an
 * initialization script: `window.__SKILLKEEP__ = { port, token }`. Falls back to
 * { port: 4517, token: "" } when absent (standalone `bun run dev` / `skillkeep ui`).
 * Declared ambient so every access is compiler-verified — no runtime casts.
 */
declare global {
  var __SKILLKEEP__: SkillkeepGlobal | undefined;
}

/**
 * Minimal shape of `window.__TAURI__` this app relies on: just enough to
 * invoke the `get_ai_key`/`set_ai_key` commands (see `apps/desktop`'s
 * `main.rs`). Exposed by `withGlobalTauri: true` in the desktop shell's
 * `tauri.conf.json` -- deliberately NOT the full `@tauri-apps/api` surface,
 * so this package can add zero Tauri dependencies and stay a plain,
 * import-safe browser build for standalone `skillkeep ui`.
 */
export interface TauriGlobal {
  core: {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

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

export interface Settings {
  registryRoot: string;
  repoRoots: string[];
  globalClients: string[];
  repoClients: string[];
  linkMode: "symlink" | "copy";
  inboxDirs: string[];
  linkModeProbe?: LinkModeProbe;
}

/** Shape PUT to /api/settings — same as Settings without the read-only probe. */
export type SettingsInput = Omit<Settings, "linkModeProbe">;

export interface OpResult {
  ok: boolean;
  error?: string;
}

export interface Health {
  ok: boolean;
  version: string;
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

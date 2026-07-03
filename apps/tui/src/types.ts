/**
 * Mirrors the skillkeep daemon HTTP contract defined by packages/ui/src/api/types.ts.
 * Deliberately duplicated rather than imported: apps/tui is a standalone client with no
 * runtime dependency on packages/ui. Keep this file's shapes in lockstep with that one —
 * only the subset of routes the TUI actually calls is included here.
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

export interface Health {
  ok: boolean;
  version: string;
}

/** Identifiers for every AI-coding client skillkeep manages skill dirs for. */
export type ClientId = "omp" | "claude" | "agents" | "codex" | "opencode";

/** How a repo receives its skills: symlink farm or committed copy. */
export type RepoMode = "link" | "committed";

/** Whether skill surfaces are symlinks into the registry or independent copies. */
export type LinkMode = "symlink" | "copy";

/** Per-project deployment configuration (kept verbatim from the ported engine). */
export interface ProjectConfig {
  repos: string[];
  mode?: RepoMode;
  local_config?: boolean;
}

/**
 * Persisted skillkeep configuration. Replaces the old yaml-file `Targets` shape —
 * stored as JSON in the SQLite settings table (see db.ts), never read from disk
 * by core modules except via db.ts getConfig/setConfig.
 */
export interface Config {
  /** Absolute path to the registry root (skills/<scope>/<name>/SKILL.md layout). */
  registryRoot: string;
  /** Persistent repo search roots (default ["~/repos"]); worktrees under these are synced. */
  repoRoots: string[];
  /** Clients whose user-level dirs receive global-scope skill farms. */
  globalClients: ClientId[];
  /** Clients whose repo-relative dirs are mirrored inside each project repo. */
  repoClients: ClientId[];
  /** Symlink farms or committed copies — resolved per-platform at startup. */
  linkMode: LinkMode;
  /** Inbox directories scanned for adoption/triage (generalised from the old OMP-only constant). */
  inboxDirs: string[];
  /** Named projects, each mapping to one or more repos with a deployment mode. */
  projects: Record<string, ProjectConfig>;
  /** Multi-device hub link (null when the agent runs standalone, no hub sync). */
  hub: HubLink | null;
}

/** Agent→hub link: where to push/pull registry skills and usage from this device. */
export interface HubLink {
  /** Base URL of the hub daemon, e.g. https://skillkeep.example.com (no trailing slash). */
  url: string;
  /** Bearer token shared with the hub (operator-supplied via SKILLKEEP_TOKEN on the hub). */
  token: string;
  /** Human-readable name for this device, recorded in the hub's devices table on push. */
  device: string;
}

/** rules.yml: scope name -> list of glob patterns. "archive" and "global" are scopes too. */
export type Rules = Record<string, string[]>;

/** A resolved registry scope, e.g. global, project/yarnling-ios, profile/foo, archive. */
export type Scope = string;

/** Parsed metadata for one on-disk skill directory (name mirrors the dir name by contract). */
export interface SkillMeta {
  /** Directory name on disk (also the skill name in every case we manage). */
  name: string;
  /** Absolute path to the skill directory. */
  dir: string;
  /** Absolute path to SKILL.md. */
  skillMdPath: string;
  description: string | null;
  /** True when SKILL.md is missing/unparseable/has no description. */
  invalid: boolean;
}

/** Where one client looks for skills, at user level and repo-relative level. */
export interface ClientDirSpec {
  /** Absolute user-level directory for this client (global scope). */
  userDir: string;
  /** Repo-relative directory for this client (project scope). */
  repoRelDir: string;
  /** Optional Windows-specific user-dir override (POSIX paths are unverified on Windows). */
  userDirWin?: string;
}

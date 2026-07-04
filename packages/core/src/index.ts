/**
 * @skillkeep/core — deterministic agent-skill registry, sync, and detection engine.
 * Cross-platform (darwin/linux/win32), no console output, async/await throughout.
 */

// Adoption (from source path or detected skill, into registry scope)
export * from "./adopt";
// Drift / dangling / dead-config check
export * from "./check";
// YAML config helpers (rules, OMP customDirectories)
export * from "./config";
// SQLite state store (settings, adoptions, usage facts)
export * from "./db";
// Detection service (machine-wide skill census with state classification)
export * from "./detect";
// Environment doctor (registry validity, link-mode probe, launchd)
export * from "./doctor";
// Git helpers (commit, worktree, ignore, exclude)
export * from "./git";
// Symlink/copy link helpers
export * from "./link";
// Rules.yml glob scope matching
export * from "./match";
// Platform paths, client-dir table, dataDir
export * from "./paths";
// Registry enumeration and scope validation
export * from "./registry";
// Diagnostic-report and issue-URL helpers
export * from "./report";
// SKILL.md parsing, directory scanning, content hashing
export * from "./skill";
// Census / status (counts, duplicates, misplacements, drift)
export * from "./status";
// Sync engine (symlink farms, committed copy mode, linkMode resolution)
export * from "./sync";
// Token estimation (chars/4)
export * from "./tokens";
// Triage (rule-matched routing from inbox to registry)
export * from "./triage";
// Types and config shape
export * from "./types";
// Usage-fact and skill-usage SQLite store (additive upserts, scan cursors, summary queries)
export * from "./usage-store";

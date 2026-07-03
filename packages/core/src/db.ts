import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { dataDir, tildeExpand } from "./paths";
import type { Config, LinkMode } from "./types";

const SCHEMA_VERSION = 1;

/** Table definitions (column specs); each is wrapped in CREATE TABLE IF NOT EXISTS at open time. */
const SCHEMA: string[] = [
  "settings(key TEXT PRIMARY KEY, value TEXT)",
  "adoptions(name TEXT, scope TEXT, source_path TEXT, adopted_at INTEGER)",
  "scan_files(path TEXT PRIMARY KEY, mtime INTEGER, size INTEGER, offset INTEGER)",
  "usage_facts(day TEXT, client TEXT, model TEXT, repo TEXT, input INTEGER, output INTEGER, cache_read INTEGER, cache_write INTEGER, cost_microusd INTEGER, PRIMARY KEY(day, client, model, repo))",
  "skill_usage(day TEXT, skill TEXT, client TEXT, repo TEXT, model TEXT, count INTEGER, PRIMARY KEY(day, skill, client, repo, model))",
];

/**
 * Versioned migrations indexed by source version: MIGRATIONS[i] brings the schema from version i to i+1.
 * v1 is the initial schema — all tables are created by CREATE TABLE IF NOT EXISTS, so no migration body is needed.
 * Add entries here and bump SCHEMA_VERSION when the schema changes.
 */
const MIGRATIONS: ((db: Database) => void)[] = [];

function runMigrations(db: Database, fromVersion: number): void {
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    MIGRATIONS[v]?.(db);
  }
}

/** Construct the platform-appropriate default Config when no persisted config exists yet. */
export function defaultConfig(): Config {
  const dd = dataDir();
  const defaultInbox = "~/.omp/agent/managed-skills";
  const inboxDirs = existsSync(tildeExpand(defaultInbox)) ? [defaultInbox] : [];
  const linkMode: LinkMode = process.platform === "win32" ? "copy" : "symlink";
  return {
    registryRoot: path.join(dd, "registry"),
    repoRoots: ["~/repos"],
    globalClients: [],
    repoClients: [],
    linkMode,
    inboxDirs,
    projects: {},
  };
}

/** Open (or create) the skillkeep SQLite database, enable WAL, create tables, and run pending migrations. */
export function openDb(dbPath: string): Database {
  const dir = path.dirname(dbPath);
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode=WAL");
  for (const def of SCHEMA) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${def}`);
  }
  const versionRow = db.prepare("PRAGMA user_version").get() as { user_version?: number } | null;
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion < SCHEMA_VERSION) {
    runMigrations(db, currentVersion);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}

/** Read the persisted Config from the settings table, falling back to defaultConfig() if absent. */
export function getConfig(db: Database): Config {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("config") as
    | { value?: string }
    | undefined;
  if (row?.value) {
    return JSON.parse(row.value) as Config;
  }
  return defaultConfig();
}

/** Persist a Config as JSON under the 'config' key in the settings table. */
export function setConfig(db: Database, config: Config): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "config",
    JSON.stringify(config),
  );
}

/** Record an adoption event in the adoptions audit table. */
export function recordAdoption(
  db: Database,
  name: string,
  scope: string,
  sourcePath: string,
): void {
  db.prepare(
    "INSERT INTO adoptions (name, scope, source_path, adopted_at) VALUES (?, ?, ?, ?)",
  ).run(name, scope, sourcePath, Date.now());
}

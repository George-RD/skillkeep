import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { dataDir, tildeExpand } from "./paths";
import type { Config, LinkMode } from "./types";

const SCHEMA_VERSION = 2;

/** Table definitions (column specs); each is wrapped in CREATE TABLE IF NOT EXISTS at open time. */
const SCHEMA: string[] = [
  "settings(key TEXT PRIMARY KEY, value TEXT)",
  "adoptions(name TEXT, scope TEXT, source_path TEXT, adopted_at INTEGER)",
  "scan_files(path TEXT PRIMARY KEY, mtime INTEGER, size INTEGER, offset INTEGER)",
  // `device` is NULL for every agent-mode row (one machine, no multi-device concept) and the
  // pushing device's name for a hub-ingested row — it is part of the key so two devices' counts
  // for the same (day, client/skill, model, repo) bucket never collapse into one overwritten row
  // (see upsertUsageFact/upsertSkillUsage in packages/core/src/usage-store.ts for the full
  // rationale and the NULL-safe manual upsert this key shape requires).
  "usage_facts(day TEXT, client TEXT, model TEXT, repo TEXT, input INTEGER, output INTEGER, cache_read INTEGER, cache_write INTEGER, cost_microusd INTEGER, device TEXT, PRIMARY KEY(day, client, model, repo, device))",
  "skill_usage(day TEXT, skill TEXT, client TEXT, repo TEXT, model TEXT, count INTEGER, device TEXT, PRIMARY KEY(day, skill, client, repo, model, device))",
  "devices(name TEXT PRIMARY KEY, last_seen INTEGER)",
  "skill_revs(scope TEXT, name TEXT, rev INTEGER, PRIMARY KEY(scope, name))",
];

/**
 * Versioned migrations indexed by source version: MIGRATIONS[i] brings the schema from version i to i+1.
 * v1 is the initial schema — all tables are created by CREATE TABLE IF NOT EXISTS, so no migration body is needed.
 * Add entries here and bump SCHEMA_VERSION when the schema changes.
 */
const MIGRATIONS: ((db: Database) => void)[] = [
  // v0 → v1: no-op. The initial schema is created entirely by CREATE TABLE IF NOT EXISTS above.
  () => {},
  // v1 → v2: add `device` to usage_facts/skill_usage's PRIMARY KEY (see the SCHEMA comment above).
  // SQLite cannot ALTER a table's PRIMARY KEY in place, so this rebuilds both tables: create the
  // new shape, copy every existing row across with device = NULL (pre-migration rows predate the
  // multi-device hub, so NULL — meaning "this machine's own local total" — is the correct tag),
  // drop the old table, rename. Idempotent: skipped per-table when `device` is already part of
  // that table's PK (checked via PRAGMA table_info's `pk` column), so re-running against an
  // already-migrated db (or one only ever created fresh, which gets the final shape straight from
  // SCHEMA above) is a no-op. New tables (devices, skill_revs) need no migration — CREATE TABLE IF
  // NOT EXISTS above handles them for both fresh and pre-existing databases alike.
  (db) => {
    rebuildWithDeviceInPk(
      db,
      "usage_facts",
      "day TEXT, client TEXT, model TEXT, repo TEXT, input INTEGER, output INTEGER, cache_read INTEGER, cache_write INTEGER, cost_microusd INTEGER, device TEXT, PRIMARY KEY(day, client, model, repo, device)",
      "day, client, model, repo, input, output, cache_read, cache_write, cost_microusd",
    );
    rebuildWithDeviceInPk(
      db,
      "skill_usage",
      "day TEXT, skill TEXT, client TEXT, repo TEXT, model TEXT, count INTEGER, device TEXT, PRIMARY KEY(day, skill, client, repo, model, device)",
      "day, skill, client, repo, model, count",
    );
  },
];

/** True when `column` is part of `table`'s declared PRIMARY KEY (PRAGMA table_info's `pk` field is a nonzero key-position, 0 otherwise). */
function columnInPrimaryKey(db: Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number }[];
  return cols.some((c) => c.name === column && c.pk > 0);
}

/** Rebuild `table` to `newColumnsAndPk` (a full column-spec string, as passed to CREATE TABLE), copying `copyColumns` from the old shape with `device` defaulted to NULL. No-op if `device` is already part of the table's PK. */
function rebuildWithDeviceInPk(
  db: Database,
  table: string,
  newColumnsAndPk: string,
  copyColumns: string,
): void {
  if (columnInPrimaryKey(db, table, "device")) return;
  const tmp = `${table}__migrating`;
  db.exec(`CREATE TABLE ${tmp}(${newColumnsAndPk})`);
  db.exec(`INSERT INTO ${tmp} (${copyColumns}, device) SELECT ${copyColumns}, NULL FROM ${table}`);
  db.exec(`DROP TABLE ${table}`);
  db.exec(`ALTER TABLE ${tmp} RENAME TO ${table}`);
}

/**
 * Run pending migrations, one transaction per step: the step's DDL/DML and its
 * `user_version` bump to v+1 commit together, so a crash mid-step rolls the whole
 * step back and the next open re-runs it from a consistent state. `toVersion` and
 * `migrations` are injectable so tests can prove the rollback contract.
 */
export function runMigrations(
  db: Database,
  fromVersion: number,
  toVersion: number = SCHEMA_VERSION,
  migrations: readonly ((db: Database) => void)[] = MIGRATIONS,
): void {
  for (let v = fromVersion; v < toVersion; v++) {
    db.transaction(() => {
      migrations[v]?.(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}

/** Construct the platform-appropriate default Config when no persisted config exists yet. `dd` is
 * the data directory a fresh registry should live under — defaults to the global platform default,
 * but {@link getConfig} always passes the ACTUAL data dir the open database lives in (see
 * {@link inferDataDirFromDb}), so a daemon started with a custom `--data`/`dataDir` override gets
 * its default registry inside THAT directory, not the machine's real global default. This matters
 * most for hub mode: a hub's SQLite state and its registry must live under the same operator-chosen
 * data volume (e.g. Docker's `/data`) so both survive a container restart together — before this,
 * a fresh hub's registry silently defaulted to the container's ephemeral global path and would be
 * lost on restart even though its usage/rev history (in the mounted db) survived. */
export function defaultConfig(dd: string = dataDir()): Config {
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
    hub: null,
    ai: null,
  };
}

/** The data directory `db` actually lives in (its file's containing directory), or the global platform default for an in-memory (`:memory:`) database, which has no meaningful directory of its own. */
function inferDataDirFromDb(db: Database): string {
  const filename = db.filename;
  if (!filename || filename === ":memory:") return dataDir();
  return path.dirname(filename);
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
  return defaultConfig(inferDataDirFromDb(db));
}

/** Persist a Config as JSON under the 'config' key in the settings table. */
export function setConfig(db: Database, config: Config): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "config",
    JSON.stringify(config),
  );
}

/** Read a JSON-valued settings-table entry by key (e.g. "lastMaintenance"), or null if absent/unparseable. */
export function getJsonSetting<T>(db: Database, key: string): T | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value?: string }
    | undefined;
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

/** Persist any JSON-serializable value under an arbitrary settings-table key. */
export function setJsonSetting(db: Database, key: string, value: unknown): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    JSON.stringify(value),
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

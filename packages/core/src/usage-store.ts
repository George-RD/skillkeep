import type { Database } from "bun:sqlite";

/** A file scan cursor: the file's state (mtime/size) as of the last read, and the next byte offset to resume from. */
export interface ScanCursor {
  mtime: number;
  size: number;
  offset: number;
}

/** Additive delta applied to one usage_facts bucket by {@link upsertUsageFact}. */
export interface UsageFactDelta {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costMicroUsd: number | null;
}

/** One aggregated row returned by {@link queryUsageSummary}. */
export interface UsageSummaryRow {
  key: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costMicroUsd: number | null;
}

/**
 * Read the persisted scan cursor for `key` (normally a file path, but the ingest
 * orchestrator also uses synthetic keys like `${file}#skillread` for a second,
 * independent cursor over the same file). Returns `null` if `key` has never
 * been scanned.
 */
export function getScanCursor(db: Database, key: string): ScanCursor | null {
  const row = db.prepare("SELECT mtime, size, offset FROM scan_files WHERE path = ?").get(key) as
    | ScanCursor
    | undefined;
  return row ?? null;
}

/** Upsert (create or overwrite) the scan cursor for `key`. `path` is a real PRIMARY KEY (never NULL), so a plain `INSERT OR REPLACE` is sufficient. */
export function setScanCursor(
  db: Database,
  key: string,
  mtime: number,
  size: number,
  offset: number,
): void {
  db.prepare(
    "INSERT OR REPLACE INTO scan_files (path, mtime, size, offset) VALUES (?, ?, ?, ?)",
  ).run(key, mtime, size, offset);
}

/**
 * Additively upsert one (day, client, model, repo) `usage_facts` bucket: token
 * counts and cost accumulate across calls rather than being overwritten.
 *
 * `usage_facts`'s `PRIMARY KEY(day, client, model, repo)` is a composite
 * index, and SQLite treats a NULL in ANY primary-key column as distinct from
 * every other row (including another NULL) for uniqueness purposes — so a
 * naive `INSERT ... ON CONFLICT(day, client, model, repo) DO UPDATE ...` NEVER
 * fires when `repo IS NULL` (e.g. gemini events, which carry no repo); every
 * call would insert a fresh duplicate row instead of accumulating. This
 * function instead does a null-safe manual read-then-write, matching the
 * bucket with `repo IS ?` (SQLite's `IS` operator is NULL-safe equality), so
 * the additive semantics hold identically whether `repo` is a real value or
 * NULL.
 *
 * Cost rule (deliberate, never relaxed): if EITHER the bucket's existing cost
 * or the incoming delta's cost is NULL (unknown), the bucket's cost becomes
 * NULL and stays NULL forever — a bucket only ever reports a total cost when
 * EVERY contributing event had a known cost. An unknown-cost event might have
 * cost anything, so summing just the known deltas and presenting that as the
 * bucket's cost would silently understate it; a later known-cost delta never
 * "resurrects" an already-poisoned bucket either, by the same logic in
 * reverse.
 */
export function upsertUsageFact(
  db: Database,
  day: string,
  client: string,
  model: string,
  repo: string | null,
  delta: UsageFactDelta,
): void {
  const existing = db
    .prepare(
      "SELECT input, output, cache_read, cache_write, cost_microusd FROM usage_facts WHERE day = ? AND client = ? AND model = ? AND repo IS ?",
    )
    .get(day, client, model, repo) as
    | {
        input: number;
        output: number;
        cache_read: number;
        cache_write: number;
        cost_microusd: number | null;
      }
    | undefined;

  if (!existing) {
    db.prepare(
      "INSERT INTO usage_facts (day, client, model, repo, input, output, cache_read, cache_write, cost_microusd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      day,
      client,
      model,
      repo,
      delta.input,
      delta.output,
      delta.cacheRead,
      delta.cacheWrite,
      delta.costMicroUsd,
    );
    return;
  }

  const cost =
    existing.cost_microusd === null || delta.costMicroUsd === null
      ? null
      : existing.cost_microusd + delta.costMicroUsd;
  db.prepare(
    "UPDATE usage_facts SET input = input + ?, output = output + ?, cache_read = cache_read + ?, cache_write = cache_write + ?, cost_microusd = ? WHERE day = ? AND client = ? AND model = ? AND repo IS ?",
  ).run(
    delta.input,
    delta.output,
    delta.cacheRead,
    delta.cacheWrite,
    cost,
    day,
    client,
    model,
    repo,
  );
}

/**
 * Additively upsert one (day, skill, client, repo, model) `skill_usage` count.
 * Same NULL-PK caveat as {@link upsertUsageFact} applies (`repo` is nullable
 * here too), so this also matches via a null-safe manual read-then-write
 * rather than `ON CONFLICT`.
 */
export function upsertSkillUsage(
  db: Database,
  day: string,
  skill: string,
  client: string,
  repo: string | null,
  model: string,
  count = 1,
): void {
  const existing = db
    .prepare(
      "SELECT count FROM skill_usage WHERE day = ? AND skill = ? AND client = ? AND repo IS ? AND model = ?",
    )
    .get(day, skill, client, repo, model) as { count: number } | undefined;

  if (!existing) {
    db.prepare(
      "INSERT INTO skill_usage (day, skill, client, repo, model, count) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(day, skill, client, repo, model, count);
    return;
  }

  db.prepare(
    "UPDATE skill_usage SET count = count + ? WHERE day = ? AND skill = ? AND client = ? AND repo IS ? AND model = ?",
  ).run(count, day, skill, client, repo, model);
}

/** Column each non-"skill" {@link queryUsageSummary} group maps to 1:1 in `usage_facts`. */
const GROUP_COLUMNS = { model: "model", repo: "repo", client: "client" } as const;

interface RawSummaryRow {
  key: string | null;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costMicroUsd: number | null;
}

/**
 * Aggregate usage between `from` and `to` (inclusive, `day` string comparison
 * — both are `YYYY-MM-DD`), grouped by `group`.
 *
 * `group === "skill"` reads `skill_usage` instead of `usage_facts` and
 * deliberately reports the read-count in the `input` field (`output` /
 * `cacheRead` / `cacheWrite` are always 0, `costMicroUsd` always `null`) —
 * `UsageRow` is a fixed cross-package contract with no dedicated count field,
 * and the UI's usage chart already reads bars from `input`/`output` only.
 *
 * For the other three groups, a NULL `repo`/`model` bucket (e.g. gemini events
 * have no repo) groups under the SQL NULL bucket and is coalesced to the
 * literal string `"unknown"` here so `UsageRow.key` is never `null`.
 */
export function queryUsageSummary(
  db: Database,
  group: "model" | "repo" | "client" | "skill",
  from: string,
  to: string,
): UsageSummaryRow[] {
  if (group === "skill") {
    const rows = db
      .prepare(
        "SELECT skill as key, SUM(count) as input, 0 as output, 0 as cacheRead, 0 as cacheWrite, NULL as costMicroUsd FROM skill_usage WHERE day BETWEEN ? AND ? GROUP BY skill ORDER BY key",
      )
      .all(from, to) as RawSummaryRow[];
    return rows.map((row) => ({ ...row, key: row.key ?? "unknown" }));
  }

  const column = GROUP_COLUMNS[group];
  const rows = db
    .prepare(
      `SELECT ${column} as key, SUM(input) as input, SUM(output) as output, SUM(cache_read) as cacheRead, SUM(cache_write) as cacheWrite, (CASE WHEN SUM(CASE WHEN cost_microusd IS NULL THEN 1 ELSE 0 END) > 0 THEN NULL ELSE SUM(cost_microusd) END) as costMicroUsd FROM usage_facts WHERE day BETWEEN ? AND ? GROUP BY ${column} ORDER BY key`,
    )
    .all(from, to) as RawSummaryRow[];
  return rows.map((row) => ({ ...row, key: row.key ?? "unknown" }));
}

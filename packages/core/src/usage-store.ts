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
 * Additively upsert one (day, client, model, repo, device) `usage_facts` bucket: token counts and
 * cost accumulate across calls rather than being overwritten.
 *
 * `device` is part of the logical key alongside `day, client, model, repo` (see {@link
 * upsertSkillUsage} for the same shape): agent-mode calls always pass `device: null` (one bucket
 * per machine's own local accumulation), while hub-ingest calls pass the pushing device's name, so
 * two different devices pushing usage for the same (day, client, model, repo) never collapse into
 * a single row and silently overwrite each other's numbers — every device gets its own row, and
 * {@link queryUsageSummary}'s aggregates sum across all of them.
 *
 * `usage_facts`'s composite key spans several nullable columns (`repo` for agent mode, `device` for
 * everyone), and SQLite treats a NULL in ANY key column as distinct from every other row (including
 * another NULL) for uniqueness purposes — so a naive `INSERT ... ON CONFLICT(...) DO UPDATE ...`
 * NEVER fires when `repo IS NULL` or `device IS NULL`. This function instead does a null-safe manual
 * read-then-write, matching every key column with `IS ?` (SQLite's `IS` operator is NULL-safe
 * equality), so the semantics hold identically whether `repo`/`device` are real values or NULL.
 *
 * Cost rule (deliberate, never relaxed): if EITHER the bucket's existing cost or the incoming
 * delta's cost is NULL (unknown), the bucket's cost becomes NULL and stays NULL forever — a bucket
 * only ever reports a total cost when EVERY contributing event had a known cost. An unknown-cost
 * event might have cost anything, so summing just the known deltas and presenting that as the
 * bucket's cost would silently understate it; a later known-cost delta never "resurrects" an
 * already-poisoned bucket either, by the same logic in reverse.
 */
export function upsertUsageFact(
  db: Database,
  day: string,
  client: string,
  model: string,
  repo: string | null,
  delta: UsageFactDelta,
  device: string | null = null,
): void {
  const existing = db
    .prepare(
      "SELECT input, output, cache_read, cache_write, cost_microusd FROM usage_facts WHERE day = ? AND client = ? AND model = ? AND repo IS ? AND device IS ?",
    )
    .get(day, client, model, repo, device) as
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
      "INSERT INTO usage_facts (day, client, model, repo, input, output, cache_read, cache_write, cost_microusd, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      device,
    );
    return;
  }

  if (device !== null) {
    // Hub ingest: the agent re-pushes its full current state, so SET absolute values (idempotent on
    // re-push) for THIS device's row specifically — never accumulate, which would double-count on
    // re-push, and never touch another device's row for the same bucket (matched via device IS ?).
    db.prepare(
      "UPDATE usage_facts SET input = ?, output = ?, cache_read = ?, cache_write = ?, cost_microusd = ? WHERE day = ? AND client = ? AND model = ? AND repo IS ? AND device IS ?",
    ).run(
      delta.input,
      delta.output,
      delta.cacheRead,
      delta.cacheWrite,
      delta.costMicroUsd,
      day,
      client,
      model,
      repo,
      device,
    );
    return;
  }

  // Agent mode: additive accumulation (existing behaviour), scoped to this machine's own
  // device IS NULL row so it never accumulates into a hub-tagged device's row.
  const cost =
    existing.cost_microusd === null || delta.costMicroUsd === null
      ? null
      : existing.cost_microusd + delta.costMicroUsd;
  db.prepare(
    "UPDATE usage_facts SET input = input + ?, output = output + ?, cache_read = cache_read + ?, cache_write = cache_write + ?, cost_microusd = ? WHERE day = ? AND client = ? AND model = ? AND repo IS ? AND device IS ?",
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
    device,
  );
}

/**
 * Additively upsert one (day, skill, client, repo, model, device) `skill_usage` count. Same
 * multi-device key shape as {@link upsertUsageFact}: `device` is matched alongside the other
 * columns so two devices' counts for the same (day, skill, client, repo, model) bucket never
 * collapse into one overwritten row. Same NULL-PK caveat also applies (`repo`/`device` are
 * nullable), so this matches via a null-safe manual read-then-write rather than `ON CONFLICT`.
 * When `device` is non-null (hub ingest) the count is SET to the pushed absolute value instead of
 * accumulated, making re-push idempotent.
 */
export function upsertSkillUsage(
  db: Database,
  day: string,
  skill: string,
  client: string,
  repo: string | null,
  model: string,
  count = 1,
  device: string | null = null,
): void {
  const existing = db
    .prepare(
      "SELECT count FROM skill_usage WHERE day = ? AND skill = ? AND client = ? AND repo IS ? AND model = ? AND device IS ?",
    )
    .get(day, skill, client, repo, model, device) as { count: number } | undefined;

  if (!existing) {
    db.prepare(
      "INSERT INTO skill_usage (day, skill, client, repo, model, count, device) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(day, skill, client, repo, model, count, device);
    return;
  }

  if (device !== null) {
    // Hub ingest: SET the absolute count (idempotent re-push) for THIS device's row.
    db.prepare(
      "UPDATE skill_usage SET count = ? WHERE day = ? AND skill = ? AND client = ? AND repo IS ? AND model = ? AND device IS ?",
    ).run(count, day, skill, client, repo, model, device);
    return;
  }

  // Agent mode: additive accumulation (existing behaviour), scoped to this machine's own
  // device IS NULL row.
  db.prepare(
    "UPDATE skill_usage SET count = count + ? WHERE day = ? AND skill = ? AND client = ? AND repo IS ? AND model = ? AND device IS ?",
  ).run(count, day, skill, client, repo, model, device);
}
/** One full `usage_facts` row, as pushed by an agent to the hub or returned for listing. */
export interface UsageFactRow {
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

/** One full `skill_usage` row, as pushed by an agent to the hub or returned for listing. */
export interface SkillUsageRow {
  day: string;
  skill: string;
  client: string;
  repo: string | null;
  model: string;
  count: number;
}

/** Return every `usage_facts` row (for agent→hub push: the full local usage snapshot). */
export function listUsageFacts(db: Database): UsageFactRow[] {
  return db
    .prepare(
      "SELECT day, client, model, repo, input, output, cache_read AS cacheRead, cache_write AS cacheWrite, cost_microusd AS costMicroUsd FROM usage_facts",
    )
    .all() as UsageFactRow[];
}

/** Return every `skill_usage` row (for agent→hub push: the full local skill-read snapshot). */
export function listSkillUsage(db: Database): SkillUsageRow[] {
  return db
    .prepare("SELECT day, skill, client, repo, model, count FROM skill_usage")
    .all() as SkillUsageRow[];
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

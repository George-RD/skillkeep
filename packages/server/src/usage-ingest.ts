import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  dataDir,
  getScanCursor,
  setScanCursor,
  upsertSkillUsage,
  upsertUsageFact,
} from "@skillkeep/core";
import type {
  ClientId,
  PriceTable,
  SkillReadEvent,
  UsageEvent,
  UsageSource,
} from "@skillkeep/usage";
import {
  bundledPrices,
  claude,
  claudeSkillReads,
  codex,
  gemini,
  lookupPrice,
  mergePrices,
  omp,
  ompSkillReads,
  opencode,
} from "@skillkeep/usage";

const SOURCES: UsageSource[] = [claude, codex, opencode, gemini, omp];

/**
 * File extension(s) each source's transcripts use, applied recursively under
 * each root the source's own `.roots()` returns. This intentionally does NOT
 * replay each source module's "glob suffix" doc comment verbatim (several of
 * those comments describe a path relative to a directory ABOVE what
 * `.roots()` actually returns, e.g. codex's `<root>/sessions/**\/*.jsonl`
 * against a `.roots()` that already ends in `/sessions`) — extension-filtered
 * recursion under the real root finds the same files either way, without
 * depending on an exact directory-depth template.
 *
 * opencode also has a SQLite `opencode.db` store on newer versions
 * (`opencode.ts`'s own doc comment); ingesting that is DEFERRED — v1 only
 * walks the per-message JSON files, same as `opencode.parse` already only
 * covers that shape.
 */
const FILE_EXTENSIONS: Record<ClientId, string[]> = {
  claude: [".jsonl"],
  codex: [".jsonl"],
  omp: [".jsonl"],
  opencode: [".json"],
  gemini: [".json", ".jsonl"],
};

/** Recursively list every file under `root` whose name ends in one of `extensions`. Missing `root` yields no files (never throws). */
async function walkFiles(root: string, extensions: string[]): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
    files.push(path.join(entry.parentPath, entry.name));
  }
  return files;
}

/** Compute a UsageEvent's cost from `prices` when the event itself didn't report one; `null` when the model is unpriced (never guessed). */
function computeCostMicroUsd(event: UsageEvent, prices: PriceTable): number | null {
  const price = lookupPrice(event.model, prices);
  if (!price) return null;
  const usd =
    event.input * price.input +
    event.output * price.output +
    event.cacheRead * price.cacheRead +
    event.cacheWrite * price.cacheWrite;
  return Math.round(usd * 1_000_000);
}

/**
 * Ingest one file's token-usage delta via `source.parse`, persisting a cursor
 * after EVERY yield (even a `null` event) so a crash mid-file resumes exactly
 * where it left off. Returns the number of real events ingested.
 */
async function ingestUsageFile(
  db: Database,
  source: UsageSource,
  file: string,
  prices: PriceTable,
): Promise<number> {
  const cursor = getScanCursor(db, file);
  const stat = await fs.stat(file);
  const mtime = Math.trunc(stat.mtimeMs);
  const size = stat.size;
  if (cursor && cursor.mtime === mtime && cursor.size === size) return 0;

  const fromOffset = cursor ? (size < cursor.size ? 0 : cursor.offset) : 0;
  let ingested = 0;
  for await (const { event, nextOffset } of source.parse(file, fromOffset)) {
    if (event) {
      const day = new Date(event.ts).toISOString().slice(0, 10);
      const costMicroUsd = event.costMicroUsd ?? computeCostMicroUsd(event, prices);
      upsertUsageFact(db, day, event.client, event.model, event.repo, {
        input: event.input,
        output: event.output,
        cacheRead: event.cacheRead,
        cacheWrite: event.cacheWrite,
        costMicroUsd,
      });
      ingested += 1;
    }
    setScanCursor(db, file, mtime, size, nextOffset);
  }
  return ingested;
}

/**
 * Ingest one file's skill-read counts via `reader` (claude/omp only), under
 * its OWN cursor key (`${file}#skillread`) so this pass never collides with
 * {@link ingestUsageFile}'s token-usage cursor over the same file.
 */
async function ingestSkillReadFile(
  db: Database,
  file: string,
  reader: (
    file: string,
    fromOffset: number,
  ) => AsyncGenerator<{ event: SkillReadEvent | null; nextOffset: number }>,
): Promise<number> {
  const cursorKey = `${file}#skillread`;
  const cursor = getScanCursor(db, cursorKey);
  const stat = await fs.stat(file);
  const mtime = Math.trunc(stat.mtimeMs);
  const size = stat.size;
  if (cursor && cursor.mtime === mtime && cursor.size === size) return 0;

  const fromOffset = cursor ? (size < cursor.size ? 0 : cursor.offset) : 0;
  let ingested = 0;
  for await (const { event, nextOffset } of reader(file, fromOffset)) {
    if (event) {
      const day = new Date(event.ts).toISOString().slice(0, 10);
      upsertSkillUsage(db, day, event.skill, event.client, event.repo, event.model ?? "unknown", 1);
      ingested += 1;
    }
    setScanCursor(db, cursorKey, mtime, size, nextOffset);
  }
  return ingested;
}

const LITELLM_PRICES_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Read `<dataDir>/prices.json` if it exists and is younger than {@link PRICE_CACHE_TTL_MS}; `null` if absent, stale, or unparsable. */
async function readFreshPriceCache(cachePath: string): Promise<PriceTable | null> {
  try {
    const stat = await fs.stat(cachePath);
    if (Date.now() - stat.mtimeMs >= PRICE_CACHE_TTL_MS) return null;
    return JSON.parse(await fs.readFile(cachePath, "utf8")) as PriceTable;
  } catch {
    return null;
  }
}

/**
 * Resolve the price table to cost unpriced events with: a 24h on-disk cache
 * of LiteLLM's model-price table at `<dataDir>/prices.json`, refreshed via a
 * live fetch when stale or absent, always merged over the bundled offline
 * snapshot so pricing keeps working with no network at all (a fetch failure —
 * e.g. no network in CI/tests — never throws; it just falls back to the
 * bundled snapshot alone).
 */
export async function loadPriceTable(dataDirPath: string): Promise<PriceTable> {
  const cachePath = path.join(dataDirPath, "prices.json");
  const fresh = await readFreshPriceCache(cachePath);
  if (fresh) return mergePrices(bundledPrices, fresh);

  try {
    const res = await fetch(LITELLM_PRICES_URL);
    if (res.ok) {
      const fetched = (await res.json()) as PriceTable;
      await fs.mkdir(dataDirPath, { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(fetched));
      return mergePrices(bundledPrices, fetched);
    }
  } catch {
    // No network (e.g. CI/tests) or a malformed response — fall back below.
  }
  return mergePrices(bundledPrices, {});
}

/** Options accepted by {@link runUsageIngest}, both purely for test isolation. */
export interface RunUsageIngestOptions {
  /** Override one client's scan root instead of its real `.roots()[0]` — lets tests point at a fixture tree instead of this machine's real ~/.claude or ~/.omp. */
  roots?: Partial<Record<ClientId, string>>;
  /** Override the data directory `loadPriceTable` caches `prices.json` under — lets tests avoid touching the real `~/Library/Application Support/skillkeep`. */
  dataDir?: string;
}

/**
 * Walk every {@link UsageSource}'s transcript files, ingest new token-usage
 * facts (pricing unpriced events from a cached/live LiteLLM table), and — for
 * claude/omp — also ingest skill-read counts from the same files under an
 * independent cursor. Idempotent: a file whose mtime/size are unchanged since
 * its last scan is skipped entirely, and re-parsing already-seen bytes never
 * happens because every yield persists its cursor immediately.
 */
export async function runUsageIngest(
  db: Database,
  options: RunUsageIngestOptions = {},
): Promise<{ filesScanned: number; eventsIngested: number }> {
  const resolvedDataDir = options.dataDir ?? dataDir();
  const prices = await loadPriceTable(resolvedDataDir);

  let filesScanned = 0;
  let eventsIngested = 0;

  for (const source of SOURCES) {
    const override = options.roots?.[source.id];
    const roots = override ? [override] : source.roots();
    const extensions = FILE_EXTENSIONS[source.id];

    for (const root of roots) {
      const files = await walkFiles(root, extensions);
      for (const file of files) {
        filesScanned += 1;
        eventsIngested += await ingestUsageFile(db, source, file, prices);
        if (source.id === "claude") {
          eventsIngested += await ingestSkillReadFile(db, file, claudeSkillReads);
        } else if (source.id === "omp") {
          eventsIngested += await ingestSkillReadFile(db, file, ompSkillReads);
        }
      }
    }
  }

  return { filesScanned, eventsIngested };
}

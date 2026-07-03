import type { ClientId } from "./client.ts";
import { jsonlRecords } from "./jsonl.ts";
import type { ParseYield, UsageEvent, UsageSource } from "./types.ts";
import { expandPath, num, parseTs } from "./util.ts";

// glob suffix applied by the daemon's walker: <root>/sessions/**/*.jsonl

interface CumulativeTotals {
  input: number;
  output: number;
  cached: number;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Codex rollouts report CUMULATIVE per-session token totals on every
 * `token_count` event. To recover per-turn deltas we keep the last-seen
 * cumulative totals (and last-seen model / cwd) per session id on the source
 * instance; the daemon keeps one instance alive across scans so this state
 * normally persists. If a fresh instance ever resumes from a persisted
 * offset > 0 with no baseline yet (e.g. a daemon restart), `parse` first
 * silently replays the untouched prefix [0, fromOffset) to rebuild the exact
 * baseline before continuing — otherwise the next `token_count` would report
 * its full session-to-date total as if it were a fresh delta, massively
 * double-counting. A rollout file is exactly one session, so replaying from 0
 * always reconstructs the correct state for it.
 */
export interface CodexSource extends UsageSource {
  seenTotals: Map<string, CumulativeTotals>;
  seenModel: Map<string, string>;
  seenCwd: Map<string, string | null>;
}

function sessionIdFromFile(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? "";
  const match = base.match(UUID_RE);
  return match ? (match[0] ?? base) : base.replace(/\.jsonl$/, "");
}

interface TokenCount {
  sessionId: string;
  totals: CumulativeTotals;
}

/**
 * Read one entry's model/cwd (captured as a side effect into the given maps,
 * since they may appear on any payload type) and, if the entry is a
 * `token_count`, its cumulative totals. Returns `null` for every other entry.
 */
function readTokenCount(
  entry: Record<string, unknown>,
  fileSessionId: string,
  seenModel: Map<string, string>,
  seenCwd: Map<string, string | null>,
): TokenCount | null {
  const payload = entry.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object") return null;

  const sessionId = typeof payload.session_id === "string" ? payload.session_id : fileSessionId;
  if (typeof payload.model === "string") seenModel.set(sessionId, payload.model);
  if (typeof payload.cwd === "string") seenCwd.set(sessionId, payload.cwd);

  if (payload.type !== "token_count") return null;
  const info = payload.info as Record<string, unknown> | undefined;
  const totals = info?.total_token_usage as Record<string, unknown> | undefined;
  if (!totals) return null;

  return {
    sessionId,
    totals: {
      input: num(totals.input_tokens),
      output: num(totals.output_tokens),
      cached: num(totals.cached_input_tokens),
    },
  };
}

export const codex: CodexSource = {
  id: "codex" as ClientId,
  seenTotals: new Map<string, CumulativeTotals>(),
  seenModel: new Map<string, string>(),
  seenCwd: new Map<string, string | null>(),

  roots() {
    return [`${expandPath(process.env.CODEX_HOME ?? "~/.codex")}/sessions`];
  },

  async *parse(this: CodexSource, file: string, fromOffset: number): AsyncGenerator<ParseYield> {
    const fileSessionId = sessionIdFromFile(file);

    if (fromOffset > 0 && !this.seenTotals.has(fileSessionId)) {
      // Crash-safe mid-file resume with no in-memory baseline yet (see the
      // CodexSource doc comment): silently replay [0, fromOffset) to rebuild
      // model/cwd/totals, emitting nothing, before parsing normally below.
      for await (const { record, nextOffset } of jsonlRecords(file, 0)) {
        if (record && typeof record === "object") {
          const replayed = readTokenCount(
            record as Record<string, unknown>,
            fileSessionId,
            this.seenModel,
            this.seenCwd,
          );
          if (replayed) this.seenTotals.set(replayed.sessionId, replayed.totals);
        }
        if (nextOffset >= fromOffset) break;
      }
    }

    for await (const { record, nextOffset } of jsonlRecords(file, fromOffset)) {
      if (!record || typeof record !== "object") {
        yield { event: null, nextOffset };
        continue;
      }
      const entry = record as Record<string, unknown>;
      const current = readTokenCount(entry, fileSessionId, this.seenModel, this.seenCwd);
      if (!current) {
        yield { event: null, nextOffset };
        continue;
      }

      const previous = this.seenTotals.get(current.sessionId);
      this.seenTotals.set(current.sessionId, current.totals);

      const deltaInput = current.totals.input - (previous?.input ?? 0);
      const deltaOutput = current.totals.output - (previous?.output ?? 0);
      const deltaCached = current.totals.cached - (previous?.cached ?? 0);

      // Emit only when there is genuinely new usage since the last report.
      if (deltaInput <= 0 && deltaOutput <= 0 && deltaCached <= 0) {
        yield { event: null, nextOffset };
        continue;
      }

      const event: UsageEvent = {
        ts: parseTs(entry.timestamp),
        client: "codex",
        model: this.seenModel.get(current.sessionId) ?? "unknown",
        repo: this.seenCwd.get(current.sessionId) ?? null,
        input: Math.max(0, deltaInput),
        output: Math.max(0, deltaOutput),
        cacheRead: Math.max(0, deltaCached),
        cacheWrite: 0,
        costMicroUsd: null,
        sessionId: current.sessionId,
        messageId: null,
      };
      yield { event, nextOffset };
    }
  },
};

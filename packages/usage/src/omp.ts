import type { ClientId } from "./client.ts";
import { jsonlRecords } from "./jsonl.ts";
import type { ParseYield, UsageEvent, UsageSource } from "./types.ts";
import { expandPath, num, parseTs, repoFromSlug } from "./util.ts";

// glob suffix applied by the daemon's walker: <root>/<cwd-slug>/<session-id>/**/*.jsonl
//
// OMP transcripts are NOT covered by tokscale; the schema below was read directly
// from real ~/.omp/agent/sessions/.../<Name>.jsonl files on this machine. The
// main transcript JSONL is the source of usage — assistant `type:"message"`
// entries carry `message.usage`. See FORMATS.md.

interface OmpPathParts {
  repo: string;
  sessionId: string;
}

/** Derive the cwd-slug (repo) and session-id from an OMP transcript path. */
function ompPathParts(file: string): OmpPathParts {
  const segments = file.split(/[\\/]/);
  const i = segments.lastIndexOf("sessions");
  if (i >= 0 && i + 2 < segments.length) {
    return {
      repo: repoFromSlug(segments[i + 1] ?? ""),
      sessionId: segments[i + 2] ?? "",
    };
  }
  return { repo: "", sessionId: "" };
}

export const omp: UsageSource = {
  id: "omp" as ClientId,
  roots() {
    return [expandPath("~/.omp/agent/sessions")];
  },

  async *parse(file: string, fromOffset: number): AsyncGenerator<ParseYield> {
    const { repo, sessionId } = ompPathParts(file);
    for await (const { record, nextOffset } of jsonlRecords(file, fromOffset)) {
      if (!record || typeof record !== "object") {
        yield { event: null, nextOffset };
        continue;
      }
      const entry = record as Record<string, unknown>;
      if (entry.type !== "message") {
        yield { event: null, nextOffset };
        continue;
      }
      const message = entry.message as Record<string, unknown> | undefined;
      const usage = message?.usage as Record<string, unknown> | undefined;
      if (message?.role !== "assistant" || !usage) {
        yield { event: null, nextOffset };
        continue;
      }
      const cost = usage.cost as Record<string, unknown> | undefined;
      const event: UsageEvent = {
        ts: parseTs(entry.timestamp),
        client: "omp",
        model: typeof message.model === "string" ? message.model : "unknown",
        repo,
        input: num(usage.input),
        output: num(usage.output),
        cacheRead: num(usage.cacheRead),
        cacheWrite: num(usage.cacheWrite),
        // OMP computes cost in USD; cost.total is authoritative -> micro-USD.
        costMicroUsd:
          cost && typeof cost.total === "number" ? Math.round(cost.total * 1_000_000) : null,
        sessionId,
        messageId: typeof entry.id === "string" ? entry.id : null,
      };
      yield { event, nextOffset };
    }
  },
};

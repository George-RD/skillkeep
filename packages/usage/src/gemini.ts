import type { ClientId } from "./client.ts";
import { jsonlRecords } from "./jsonl.ts";
import type { ParseYield, UsageEvent, UsageSource } from "./types.ts";
import { expandPath, num, parseTs } from "./util.ts";

// glob suffix applied by the daemon's walker: <root>/tmp/**/*.{json,jsonl}
//
// Best-effort extraction. Real Gemini-CLI session logs observed on this machine
// (~/.gemini/tmp/<project>/chats/session-*.jsonl) are patch-based ($set/$unset
// message lists) and carry NO token-usage fields, so they yield no events. This
// parser additionally supports a per-record JSONL token shape
// (model + usageMetadata + timestamp + sessionId) used by some Gemini loggers;
// the test fixture for that shape is SYNTHETIC. See FORMATS.md.

function eventFromRecord(record: unknown): UsageEvent | null {
  if (!record || typeof record !== "object") return null;
  const data = record as Record<string, unknown>;
  const usage = (data.usageMetadata ?? data.usage ?? data.tokenUsage) as
    | Record<string, unknown>
    | undefined;
  if (!usage) return null;

  return {
    ts: parseTs(data.timestamp),
    client: "gemini",
    model: typeof data.model === "string" ? data.model : "unknown",
    // Gemini session logs observed here carry no repo/cwd information.
    repo: null,
    input: num(usage.promptTokenCount ?? usage.prompt_tokens ?? usage.input_tokens),
    output: num(usage.candidatesTokenCount ?? usage.output_tokens),
    cacheRead: num(usage.cachedContentTokenCount ?? usage.cache_read_input_tokens),
    cacheWrite: 0,
    costMicroUsd: null,
    sessionId: typeof data.sessionId === "string" ? data.sessionId : "",
    messageId: typeof data.id === "string" ? data.id : null,
  };
}

export const gemini: UsageSource = {
  id: "gemini" as ClientId,
  roots() {
    return [`${expandPath(process.env.GEMINI_CLI_HOME ?? "~/.gemini")}/tmp`];
  },

  async *parse(file: string, fromOffset: number): AsyncGenerator<ParseYield> {
    if (file.endsWith(".jsonl")) {
      for await (const { record, nextOffset } of jsonlRecords(file, fromOffset)) {
        yield { event: eventFromRecord(record), nextOffset };
      }
      return;
    }
    // Single-object *.json file: whole-file granularity.
    const bunFile = Bun.file(file);
    const size = bunFile.size;
    if (fromOffset >= size) return;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await bunFile.text());
    } catch {
      parsed = null;
    }
    yield { event: eventFromRecord(parsed), nextOffset: size };
  },
};

import type { ClientId } from "./client.ts";
import { jsonlRecords } from "./jsonl.ts";
import type { ParseYield, UsageEvent, UsageSource } from "./types.ts";
import { expandPath, num, parseTs, repoFromSlug } from "./util.ts";

// glob suffix applied by the daemon's walker: <root>/<encoded-cwd>/**/*.jsonl

/**
 * Extract the encoded-cwd directory segment from a Claude projects file path,
 * e.g. `~/.claude/projects/-Users-george-repos-cairn/conv.jsonl` -> the segment
 * immediately under `projects/`. Works with either path separator.
 */
function projectSlugFromFile(file: string): string {
  const segments = file.split(/[\\/]/);
  const i = segments.indexOf("projects");
  if (i > 0 && segments[i - 1] === ".claude" && i + 1 < segments.length) {
    return segments[i + 1] ?? "";
  }
  return segments[segments.length - 1] ?? "";
}

export const claude: UsageSource = {
  id: "claude" as ClientId,
  roots() {
    return [expandPath("~/.claude/projects")];
  },
  async *parse(file: string, fromOffset: number): AsyncGenerator<ParseYield> {
    const repo = repoFromSlug(projectSlugFromFile(file));
    for await (const { record, nextOffset } of jsonlRecords(file, fromOffset)) {
      if (!record || typeof record !== "object") {
        yield { event: null, nextOffset };
        continue;
      }
      const entry = record as Record<string, unknown>;
      const message = entry.message as Record<string, unknown> | undefined;
      const usage = message?.usage as Record<string, unknown> | undefined;
      if (entry.type !== "assistant" || !message || !usage) {
        yield { event: null, nextOffset };
        continue;
      }
      const event: UsageEvent = {
        ts: parseTs(entry.timestamp),
        client: "claude",
        model: typeof message.model === "string" ? message.model : "unknown",
        repo,
        input: num(usage.input_tokens),
        output: num(usage.output_tokens),
        cacheRead: num(usage.cache_read_input_tokens),
        cacheWrite: num(usage.cache_creation_input_tokens),
        costMicroUsd: null,
        sessionId: typeof entry.sessionId === "string" ? entry.sessionId : "",
        messageId: typeof message.id === "string" ? message.id : null,
      };
      yield { event, nextOffset };
    }
  },
};

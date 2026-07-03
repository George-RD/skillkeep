import type { ClientId } from "./client.ts";
import type { ParseYield, UsageEvent, UsageSource } from "./types.ts";
import { expandPath, num } from "./util.ts";

// glob suffix applied by the daemon's walker: <root>/storage/message/**/*.json
//
// One JSON object per file (NOT per line). The SQLite opencode.db is the
// preferred store when present (handled by the daemon integration); this parser
// covers the file-based per-message JSON shape. See FORMATS.md.

export const opencode: UsageSource = {
  id: "opencode" as ClientId,
  roots() {
    return [
      `${expandPath(process.env.XDG_DATA_HOME ?? "~/.local/share")}/opencode/storage/message`,
    ];
  },

  async *parse(file: string, fromOffset: number): AsyncGenerator<ParseYield> {
    const bunFile = Bun.file(file);
    const size = bunFile.size;
    if (fromOffset >= size) return;

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await bunFile.text());
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object") {
      // Whole-file granularity: the only meaningful cursor is EOF.
      yield { event: null, nextOffset: size };
      return;
    }

    const data = parsed as Record<string, unknown>;
    const tokens = data.tokens as Record<string, unknown> | undefined;
    const cache = tokens?.cache as Record<string, unknown> | undefined;
    const pathField = data.path as Record<string, unknown> | undefined;
    const time = data.time as Record<string, unknown> | undefined;

    const event: UsageEvent = {
      ts:
        typeof time?.created === "number"
          ? time.created
          : typeof time?.updated === "number"
            ? time.updated
            : Math.trunc(bunFile.lastModified),
      client: "opencode",
      model: typeof data.modelID === "string" ? data.modelID : "unknown",
      repo: typeof pathField?.root === "string" ? pathField.root : null,
      input: num(tokens?.input),
      output: num(tokens?.output),
      cacheRead: num(cache?.read),
      cacheWrite: num(cache?.write),
      // opencode computes cost itself; it is authoritative, stored as micro-USD.
      costMicroUsd: typeof data.cost === "number" ? Math.round(data.cost * 1_000_000) : null,
      sessionId: typeof data.sessionID === "string" ? data.sessionID : "",
      messageId: typeof data.id === "string" ? data.id : null,
    };
    yield { event, nextOffset: size };
  },
};

import { describe, expect, test } from "bun:test";
import { claude } from "../src/claude.ts";
import { collect, tmpDir, writeFixture } from "./helpers.ts";

// Redacted, structurally-real lines: shape copied from a live
// ~/.claude/projects/<slug>/<session>.jsonl assistant entry with usage
// (see FORMATS.md). Line 2 is a real non-assistant ("user") entry -> null.
// No trailing newline, to exercise the "final valid-JSON line without a
// terminating newline is still emitted" path in jsonlRecords.
const FIXTURE = [
  '{"type":"assistant","uuid":"a1","parentUuid":"p0","requestId":"req_abc","sessionId":"sess-claude-1","timestamp":"2026-05-21T14:08:40.724Z","cwd":"/Users/george/repos/zzz-skillkeep-fixture","userType":"external","message":{"id":"msg_01AAA","type":"message","role":"assistant","model":"claude-opus-4-6","content":[{"type":"text","text":"redacted"}],"usage":{"input_tokens":3,"output_tokens":480,"cache_creation_input_tokens":31429,"cache_read_input_tokens":0}}}',
  '{"type":"user","uuid":"u1","sessionId":"sess-claude-1","timestamp":"2026-05-21T14:07:00.000Z","message":{"role":"user","content":"redacted"}}',
  '{"type":"assistant","uuid":"a2","parentUuid":"a1","requestId":"req_def","sessionId":"sess-claude-1","timestamp":"2026-05-21T14:10:00.000Z","message":{"id":"msg_01BBB","type":"message","role":"assistant","model":"claude-opus-4-6","content":[{"type":"text","text":"redacted"}],"usage":{"input_tokens":10,"output_tokens":20,"cache_creation_input_tokens":100,"cache_read_input_tokens":200}}}',
].join("\n");

describe("claude parser", () => {
  test("extracts exact usage from assistant entries and skips non-assistant lines", async () => {
    const dir = tmpDir();
    // Slug decodes to a path that will never exist on any machine, so the
    // disk-existence fallback deterministically reports the raw slug.
    const slug = "-Users-george-repos-zzz-skillkeep-fixture";
    const file = writeFixture(dir, `.claude/projects/${slug}/conv.jsonl`, FIXTURE);

    const results = await collect(claude.parse(file, 0));
    const events = results.map((r) => r.event).filter((e) => e !== null);

    expect(results).toHaveLength(3);
    expect(results[1]?.event).toBeNull();
    expect(events).toHaveLength(2);

    expect(events[0]).toEqual({
      ts: Date.parse("2026-05-21T14:08:40.724Z"),
      client: "claude",
      model: "claude-opus-4-6",
      repo: slug,
      input: 3,
      output: 480,
      cacheRead: 0,
      cacheWrite: 31429,
      costMicroUsd: null,
      sessionId: "sess-claude-1",
      messageId: "msg_01AAA",
    });
    expect(events[1]).toEqual({
      ts: Date.parse("2026-05-21T14:10:00.000Z"),
      client: "claude",
      model: "claude-opus-4-6",
      repo: slug,
      input: 10,
      output: 20,
      cacheRead: 200,
      cacheWrite: 100,
      costMicroUsd: null,
      sessionId: "sess-claude-1",
      messageId: "msg_01BBB",
    });
  });

  test("nextOffset is strictly increasing and lands exactly at EOF", async () => {
    const dir = tmpDir();
    const file = writeFixture(dir, ".claude/projects/-fixture/conv.jsonl", FIXTURE);
    const results = await collect(claude.parse(file, 0));
    const offsets = results.map((r) => r.nextOffset);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1] ?? -1);
    }
    expect(offsets.at(-1)).toBe(Buffer.byteLength(FIXTURE, "utf8"));
  });

  test("resuming from a persisted offset only re-reads new records", async () => {
    const dir = tmpDir();
    const file = writeFixture(dir, ".claude/projects/-fixture/conv.jsonl", FIXTURE);
    const first = await collect(claude.parse(file, 0));
    const cursor = first[0]?.nextOffset ?? 0;

    const resumed = await collect(claude.parse(file, cursor));
    expect(resumed).toHaveLength(first.length - 1);
    expect(resumed[resumed.length - 1]?.event).toEqual(first[first.length - 1]?.event ?? null);
  });
});

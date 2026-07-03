import { describe, expect, test } from "bun:test";
import { gemini } from "../src/gemini.ts";
import { collect, tmpDir, writeFixture } from "./helpers.ts";

// SYNTHETIC fixture: no real Gemini-CLI log on this machine carries token
// usage (real files are patch-based $set/$unset message diffs with no model
// or usage fields at all — see FORMATS.md). This exercises the best-effort
// usageMetadata shape the parser also supports. Line 2 has no usage -> null.
const FIXTURE = [
  '{"model":"gemini-1.5-pro","sessionId":"sess-gemini-1","timestamp":"2026-06-18T10:05:23.471Z","usageMetadata":{"promptTokenCount":500,"candidatesTokenCount":120,"cachedContentTokenCount":200}}',
  '{"sessionId":"6ad55d82-ba9e-4cdb-b5e8-1a7422591a67","kind":"main","startTime":"2026-06-18T10:05:23.471Z"}',
].join("\n");

describe("gemini parser", () => {
  test("extracts usageMetadata tokens; real patch-based lines with no usage yield null", async () => {
    const dir = tmpDir();
    const file = writeFixture(
      dir,
      "gemini/tmp/fixture-project/chats/session-fixture.jsonl",
      FIXTURE,
    );

    const results = await collect(gemini.parse(file, 0));
    expect(results).toHaveLength(2);
    expect(results[0]?.event).toEqual({
      ts: Date.parse("2026-06-18T10:05:23.471Z"),
      client: "gemini",
      model: "gemini-1.5-pro",
      repo: null,
      input: 500,
      output: 120,
      cacheRead: 200,
      cacheWrite: 0,
      costMicroUsd: null,
      sessionId: "sess-gemini-1",
      messageId: null,
    });
    expect(results[1]?.event).toBeNull();
  });

  test("a whole *.json file with no usage yields a single null event", async () => {
    const dir = tmpDir();
    const file = writeFixture(
      dir,
      "gemini/tmp/fixture-project/other.json",
      JSON.stringify({ sessionId: "s1", note: "no usage here" }),
    );
    const results = await collect(gemini.parse(file, 0));
    expect(results).toHaveLength(1);
    expect(results[0]?.event).toBeNull();
  });
});

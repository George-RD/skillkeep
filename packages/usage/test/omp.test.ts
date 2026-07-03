import { describe, expect, test } from "bun:test";
import { omp } from "../src/omp.ts";
import { collect, tmpDir, writeFixture } from "./helpers.ts";

// Redacted, structurally-real lines copied from a live
// ~/.omp/agent/sessions/<cwd-slug>/<session-id>/<Name>.jsonl (see FORMATS.md).
// Note omp uses camelCase input/output/cacheRead/cacheWrite, NOT the *_tokens
// convention. Line 2 is a real non-usage entry type ("title") -> null.
const FIXTURE = [
  '{"type":"title","id":"t1","timestamp":"2026-07-02T15:42:50.669Z","title":"redacted"}',
  '{"type":"message","id":"c3818dec","parentId":"4e77ce03","timestamp":"2026-07-02T15:49:49.973Z","message":{"role":"assistant","content":"redacted","api":"anthropic-messages","provider":"kimi-code","model":"kimi-for-coding","usage":{"input":9377,"output":192,"cacheRead":4352,"cacheWrite":0,"totalTokens":13921,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}}}}',
  '{"type":"message","id":"d4929edd","parentId":"c3818dec","timestamp":"2026-07-02T15:50:10.000Z","message":{"role":"user","content":"redacted"}}',
  '{"type":"message","id":"e5a3af01","parentId":"d4929edd","timestamp":"2026-07-02T15:51:00.000Z","message":{"role":"assistant","content":"redacted","api":"anthropic-messages","provider":"zai","model":"glm-5.2","usage":{"input":100,"output":50,"cacheRead":10,"cacheWrite":5,"totalTokens":165,"cost":{"input":0.0001,"output":0.0002,"cacheRead":0,"cacheWrite":0,"total":0.0025}}}}',
].join("\n");

describe("omp parser", () => {
  test("extracts exact usage from assistant messages, repo/session from path", async () => {
    const dir = tmpDir();
    // Slug decodes to a nonexistent path, so repo deterministically falls back
    // to the raw slug regardless of the machine running the test.
    const slug = "-repos-zzz-fixture";
    const sessionId = "2026-07-02T15-42-50-fixture-session";
    const file = writeFixture(
      dir,
      `omp/agent/sessions/${slug}/${sessionId}/Fixture.jsonl`,
      FIXTURE,
    );

    const results = await collect(omp.parse(file, 0));
    const events = results.map((r) => r.event).filter((e) => e !== null);

    expect(results).toHaveLength(4);
    expect(results[0]?.event).toBeNull(); // title entry
    expect(results[2]?.event).toBeNull(); // user message
    expect(events).toHaveLength(2);

    expect(events[0]).toEqual({
      ts: Date.parse("2026-07-02T15:49:49.973Z"),
      client: "omp",
      model: "kimi-for-coding",
      repo: slug,
      input: 9377,
      output: 192,
      cacheRead: 4352,
      cacheWrite: 0,
      costMicroUsd: 0,
      sessionId,
      messageId: "c3818dec",
    });
    expect(events[1]).toEqual({
      ts: Date.parse("2026-07-02T15:51:00.000Z"),
      client: "omp",
      model: "glm-5.2",
      repo: slug,
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
      costMicroUsd: 2500,
      sessionId,
      messageId: "e5a3af01",
    });
  });
});

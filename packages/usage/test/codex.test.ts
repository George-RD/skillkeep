import { describe, expect, test } from "bun:test";
import { codex } from "../src/codex.ts";
import { collect, tmpDir, writeFixture } from "./helpers.ts";

const SID = "0199a9f9-b4e8-7f32-90c2-c8ad027d19eb";

// Redacted, structurally-real lines copied from a live
// ~/.codex/sessions/**/rollout-*.jsonl (see FORMATS.md). Model and cwd live on
// SEPARATE entries from token_count (a real deviation from the tokscale-derived
// brief); token_count.info.total_token_usage is CUMULATIVE per session.
const LINES = [
  '{"timestamp":"2025-10-03T12:08:58.368Z","type":"session_meta","payload":{"id":"0199a9f9-b4e8-7f32-90c2-c8ad027d19eb","cwd":"/tmp/codex-fixture-repo","originator":"codex_cli_rs"}}',
  '{"timestamp":"2025-10-03T12:09:00.000Z","type":"event_msg","payload":{"type":"message","model":"gpt-5-codex"}}',
  '{"timestamp":"2025-10-03T12:09:13.053Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"cached_input_tokens":0,"output_tokens":10,"reasoning_output_tokens":0,"total_tokens":110}}}}',
  '{"timestamp":"2025-10-03T12:09:20.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":300,"cached_input_tokens":50,"output_tokens":25,"reasoning_output_tokens":0,"total_tokens":375}}}}',
  '{"timestamp":"2025-10-03T12:09:25.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":300,"cached_input_tokens":50,"output_tokens":25,"reasoning_output_tokens":0,"total_tokens":375}}}}',
];
const FIXTURE = `${LINES.join("\n")}\n`;

describe("codex parser", () => {
  test("emits only the positive delta between successive cumulative totals", async () => {
    const dir = tmpDir();
    const file = writeFixture(
      dir,
      `sessions/2025/10/03/rollout-2025-10-03T16-08-58-${SID}.jsonl`,
      FIXTURE,
    );

    // Fresh instance per test: codex tracks cumulative totals on the source
    // instance itself, so each test needs its own to stay isolated.
    const source: typeof codex = {
      ...codex,
      seenTotals: new Map(),
      seenModel: new Map(),
      seenCwd: new Map(),
    };

    const results = await collect(source.parse(file, 0));
    const events = results.map((r) => r.event).filter((e) => e !== null);

    // session_meta, message -> null; token_count#1, #2 -> events; token_count#3 (no growth) -> null.
    expect(results).toHaveLength(5);
    expect(results[0]?.event).toBeNull();
    expect(results[1]?.event).toBeNull();
    expect(results[4]?.event).toBeNull();
    expect(events).toHaveLength(2);

    expect(events[0]).toEqual({
      ts: Date.parse("2025-10-03T12:09:13.053Z"),
      client: "codex",
      model: "gpt-5-codex",
      repo: "/tmp/codex-fixture-repo",
      input: 100,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      costMicroUsd: null,
      sessionId: SID,
      messageId: null,
    });
    expect(events[1]).toEqual({
      ts: Date.parse("2025-10-03T12:09:20.000Z"),
      client: "codex",
      model: "gpt-5-codex",
      repo: "/tmp/codex-fixture-repo",
      input: 200,
      output: 15,
      cacheRead: 50,
      cacheWrite: 0,
      costMicroUsd: null,
      sessionId: SID,
      messageId: null,
    });
  });

  test("resuming from the persisted end-of-file offset yields no further events", async () => {
    const dir = tmpDir();
    const file = writeFixture(
      dir,
      `sessions/2025/10/03/rollout-2025-10-03T16-08-58-${SID}.jsonl`,
      FIXTURE,
    );
    const source: typeof codex = {
      ...codex,
      seenTotals: new Map(),
      seenModel: new Map(),
      seenCwd: new Map(),
    };

    // The crash-safe contract resumes from the last PERSISTED byte offset
    // (never from 0 while state has advanced) — that offset is exactly what
    // prevents double counting, not a re-comparison of cumulative values.
    const first = await collect(source.parse(file, 0));
    const endOffset = first.at(-1)?.nextOffset ?? 0;

    const resumed = await collect(source.parse(file, endOffset));
    expect(resumed).toHaveLength(0);
  });

  test("a FRESH instance resuming from a mid-file offset replays the prefix instead of double-counting", async () => {
    const dir = tmpDir();
    const file = writeFixture(
      dir,
      `sessions/2025/10/03/rollout-2025-10-03T16-08-58-${SID}.jsonl`,
      FIXTURE,
    );

    // Instance A represents "daemon before restart": read only up through the
    // first emitted delta, then stop — as if it persisted that cursor and the
    // process then crashed/restarted before reading any further.
    const instanceA: typeof codex = { ...codex, seenTotals: new Map(), seenModel: new Map(), seenCwd: new Map() };
    let cursorAfterFirstEvent = 0;
    for await (const y of instanceA.parse(file, 0)) {
      cursorAfterFirstEvent = y.nextOffset;
      if (y.event) break;
    }

    // Instance B represents "daemon after restart": brand new maps, resumes
    // purely from the persisted byte offset with NO cumulative baseline.
    const instanceB: typeof codex = { ...codex, seenTotals: new Map(), seenModel: new Map(), seenCwd: new Map() };
    const resumedEvents = (await collect(instanceB.parse(file, cursorAfterFirstEvent)))
      .map((r) => r.event)
      .filter((e) => e !== null);

    // Without prefix-replay, the next token_count (cumulative {300,25,50})
    // would be reported against a phantom zero baseline as {300,25,50} instead
    // of the correct {200,15,50} delta — double-counting the first 100/10/0.
    expect(resumedEvents).toEqual([
      {
        ts: Date.parse("2025-10-03T12:09:20.000Z"),
        client: "codex",
        model: "gpt-5-codex",
        repo: "/tmp/codex-fixture-repo",
        input: 200,
        output: 15,
        cacheRead: 50,
        cacheWrite: 0,
        costMicroUsd: null,
        sessionId: SID,
        messageId: null,
      },
    ]);
  });
});

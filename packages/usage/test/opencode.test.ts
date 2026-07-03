import { describe, expect, test } from "bun:test";
import { opencode } from "../src/opencode.ts";
import { collect, tmpDir, writeFixture } from "./helpers.ts";

// Structure cross-verified against a real row's `data` JSON in
// ~/.local/share/opencode/opencode.db (table `message`), see FORMATS.md. The
// real row had all-zero token/cost fields; values here are non-zero
// placeholders chosen for test determinism, and `sessionID` is added at the
// top level per the documented file-based format (a DB column in the SQLite
// form this machine actually uses).
const FIXTURE_OBJECT = {
  sessionID: "ses_fixture123",
  parentID: "msg_fixtureparent",
  id: "msg_fixture1",
  role: "assistant",
  path: { cwd: "/tmp/oc-fixture-repo", root: "/tmp/oc-fixture-repo" },
  cost: 0.0021,
  tokens: { input: 1200, output: 300, reasoning: 50, cache: { read: 800, write: 100 } },
  modelID: "MiniMax-M2.7-highspeed",
  providerID: "minimax-coding-plan",
  time: { created: 1783007384267, completed: 1783007390000 },
};

describe("opencode parser", () => {
  test("extracts exact usage/cost from a single per-file message object", async () => {
    const dir = tmpDir();
    const file = writeFixture(
      dir,
      "opencode/storage/message/msg_fixture1.json",
      JSON.stringify(FIXTURE_OBJECT),
    );

    const results = await collect(opencode.parse(file, 0));
    expect(results).toHaveLength(1);
    expect(results[0]?.event).toEqual({
      ts: 1783007384267,
      client: "opencode",
      model: "MiniMax-M2.7-highspeed",
      repo: "/tmp/oc-fixture-repo",
      input: 1200,
      output: 300,
      cacheRead: 800,
      cacheWrite: 100,
      costMicroUsd: 2100,
      sessionId: "ses_fixture123",
      messageId: "msg_fixture1",
    });
    expect(results[0]?.nextOffset).toBe(Buffer.byteLength(JSON.stringify(FIXTURE_OBJECT), "utf8"));
  });

  test("re-parsing from EOF yields nothing (whole-file granularity, already consumed)", async () => {
    const dir = tmpDir();
    const content = JSON.stringify(FIXTURE_OBJECT);
    const file = writeFixture(dir, "opencode/storage/message/msg_fixture1.json", content);
    const size = Buffer.byteLength(content, "utf8");

    const results = await collect(opencode.parse(file, size));
    expect(results).toHaveLength(0);
  });
});

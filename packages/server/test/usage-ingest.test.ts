import type { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { openDb, queryUsageSummary } from "@skillkeep/core";
import { runUsageIngest } from "../src/usage-ingest";
import { rmrfRetry } from "./test-utils";

// Redacted, structurally-real lines (same shapes documented in
// packages/usage/FORMATS.md): line 1 is an assistant turn that both reports
// usage AND invokes the `Skill` tool directly; line 2 is a plain usage-only
// turn on the same model; line 3 is a non-assistant ("user") line both the
// token-usage and skill-read passes must skip. `fixture-model-a` is
// deliberately absent from the bundled price snapshot, so its cost stays
// `null` throughout (claude never reports cost itself).
const CLAUDE_FIXTURE = [
  '{"type":"assistant","uuid":"a1","sessionId":"sess-claude-fixture","timestamp":"2026-01-01T10:00:00.000Z","message":{"id":"m1","role":"assistant","model":"fixture-model-a","content":[{"type":"tool_use","id":"t1","name":"Skill","input":{"skill":"fixture-skill"}}],"usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}',
  '{"type":"assistant","uuid":"a2","sessionId":"sess-claude-fixture","timestamp":"2026-01-01T11:00:00.000Z","message":{"id":"m2","role":"assistant","model":"fixture-model-a","content":[{"type":"text","text":"redacted"}],"usage":{"input_tokens":10,"output_tokens":5,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}',
  '{"type":"user","uuid":"u1","sessionId":"sess-claude-fixture","timestamp":"2026-01-01T11:30:00.000Z","message":{"role":"user","content":"redacted"}}',
].join("\n");

// omp reports its own authoritative `usage.cost.total`, so no pricing lookup
// is exercised here (that's covered by the claude fixture above and the
// pricing.test.ts suite already in packages/usage).
const OMP_FIXTURE = [
  '{"type":"message","id":"o1","timestamp":"2026-01-01T12:00:00.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"c1","name":"read","arguments":{"path":"skill://Fixture Omp Skill"}}],"model":"fixture-model-b","usage":{"input":200,"output":80,"cacheRead":10,"cacheWrite":0,"cost":{"total":0.002}}}}',
  '{"type":"message","id":"o2","timestamp":"2026-01-01T13:00:00.000Z","message":{"role":"assistant","content":"redacted","model":"fixture-model-b","usage":{"input":20,"output":8,"cacheRead":0,"cacheWrite":0,"cost":{"total":0.0002}}}}',
  '{"type":"message","id":"o3","timestamp":"2026-01-01T13:30:00.000Z","message":{"role":"user","content":"redacted"}}',
].join("\n");

let tmpDir: string;
let db: Database;
let roots: {
  claude: string;
  codex: string;
  opencode: string;
  gemini: string;
  omp: string;
};

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-usage-ingest-test-"));
  db = openDb(path.join(tmpDir, "skillkeep.db"));

  // Mirror the real ~/.claude/projects/<slug>/x.jsonl and
  // ~/.omp/agent/sessions/<slug>/<session-id>/x.jsonl layouts under a fixture
  // root the walker is pointed at instead of the real client home dirs.
  const claudeRoot = path.join(tmpDir, ".claude", "projects");
  const claudeFile = path.join(claudeRoot, "-repos-fixture-a", "conv.jsonl");
  fs.mkdirSync(path.dirname(claudeFile), { recursive: true });
  fs.writeFileSync(claudeFile, CLAUDE_FIXTURE);

  const ompRoot = path.join(tmpDir, ".omp", "agent", "sessions");
  const ompFile = path.join(ompRoot, "-repos-fixture-b", "sess-omp-1", "Main.jsonl");
  fs.mkdirSync(path.dirname(ompFile), { recursive: true });
  fs.writeFileSync(ompFile, OMP_FIXTURE);

  // codex/opencode/gemini get nonexistent roots: no fixtures for them here, and
  // pointing them at real dirs would violate this suite's hermeticity.
  roots = {
    claude: claudeRoot,
    codex: path.join(tmpDir, "no-codex"),
    opencode: path.join(tmpDir, "no-opencode"),
    gemini: path.join(tmpDir, "no-gemini"),
    omp: ompRoot,
  };
});

afterAll(async () => {
  db.close();
  await rmrfRetry(tmpDir);
});

describe("runUsageIngest", () => {
  test("walks the fixture tree and ingests both token-usage and skill-read events", async () => {
    const result = await runUsageIngest(db, { roots, dataDir: tmpDir });
    expect(result.filesScanned).toBe(2); // one claude file, one omp file
    expect(result.eventsIngested).toBe(6); // 2+1 claude (usage+skill), 2+1 omp (usage+skill)
  });

  test("aggregates by model: claude's unpriced fixture model stays cost-null, omp's authoritative cost sums", () => {
    const rows = queryUsageSummary(db, "model", "2026-01-01", "2026-01-01");
    expect(rows).toEqual([
      {
        key: "fixture-model-a",
        input: 110,
        output: 55,
        cacheRead: 0,
        cacheWrite: 0,
        costMicroUsd: null,
      },
      {
        key: "fixture-model-b",
        input: 220,
        output: 88,
        cacheRead: 10,
        cacheWrite: 0,
        costMicroUsd: 2200,
      },
    ]);
  });

  test("aggregates by repo, derived from each client's own path convention", () => {
    const rows = queryUsageSummary(db, "repo", "2026-01-01", "2026-01-01");
    expect(rows.map((r) => r.key)).toEqual(["-repos-fixture-a", "-repos-fixture-b"]);
  });

  test("aggregates by client", () => {
    const rows = queryUsageSummary(db, "client", "2026-01-01", "2026-01-01");
    expect(rows).toEqual([
      { key: "claude", input: 110, output: 55, cacheRead: 0, cacheWrite: 0, costMicroUsd: null },
      { key: "omp", input: 220, output: 88, cacheRead: 10, cacheWrite: 0, costMicroUsd: 2200 },
    ]);
  });

  test("aggregates by skill, reporting the read count in the input field", () => {
    const rows = queryUsageSummary(db, "skill", "2026-01-01", "2026-01-01");
    expect(rows).toEqual([
      {
        key: "Fixture Omp Skill",
        input: 1,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costMicroUsd: null,
      },
      {
        key: "fixture-skill",
        input: 1,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costMicroUsd: null,
      },
    ]);
  });

  test("a second run with no new data is idempotent: cursors skip already-scanned files, nothing double-counts", async () => {
    const result = await runUsageIngest(db, { roots, dataDir: tmpDir });
    expect(result.filesScanned).toBe(2); // files are still walked...
    expect(result.eventsIngested).toBe(0); // ...but every one is already caught up, so nothing new

    const rows = queryUsageSummary(db, "model", "2026-01-01", "2026-01-01");
    expect(rows).toEqual([
      {
        key: "fixture-model-a",
        input: 110,
        output: 55,
        cacheRead: 0,
        cacheWrite: 0,
        costMicroUsd: null,
      },
      {
        key: "fixture-model-b",
        input: 220,
        output: 88,
        cacheRead: 10,
        cacheWrite: 0,
        costMicroUsd: 2200,
      },
    ]);
  });
});

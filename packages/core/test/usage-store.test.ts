import { expect, test } from "bun:test";
import { openDb } from "../src/db";
import {
  getScanCursor,
  queryUsageSummary,
  setScanCursor,
  upsertSkillUsage,
  upsertUsageFact,
} from "../src/usage-store";

test("getScanCursor returns null when the key has never been scanned", () => {
  const db = openDb(":memory:");
  expect(getScanCursor(db, "/some/file.jsonl")).toBeNull();
});

test("setScanCursor/getScanCursor round-trip, and re-setting overwrites (not accumulates)", () => {
  const db = openDb(":memory:");
  setScanCursor(db, "/some/file.jsonl", 1000, 500, 200);
  expect(getScanCursor(db, "/some/file.jsonl")).toEqual({ mtime: 1000, size: 500, offset: 200 });

  setScanCursor(db, "/some/file.jsonl", 2000, 900, 900);
  expect(getScanCursor(db, "/some/file.jsonl")).toEqual({ mtime: 2000, size: 900, offset: 900 });
});

test("upsertUsageFact accumulates token counts and cost across repeated calls", () => {
  const db = openDb(":memory:");
  const delta = { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, costMicroUsd: 100 };
  upsertUsageFact(db, "2026-01-01", "claude", "model-a", "repo-a", delta);
  upsertUsageFact(db, "2026-01-01", "claude", "model-a", "repo-a", delta);

  const rows = queryUsageSummary(db, "model", "2026-01-01", "2026-01-01");
  expect(rows).toEqual([
    { key: "model-a", input: 20, output: 10, cacheRead: 4, cacheWrite: 2, costMicroUsd: 200 },
  ]);
});

test("upsertUsageFact accumulates correctly even when repo is NULL (SQLite's composite-PK NULL trap)", () => {
  const db = openDb(":memory:");
  const delta = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, costMicroUsd: 50 };
  upsertUsageFact(db, "2026-01-01", "gemini", "gemini-pro", null, delta);
  upsertUsageFact(db, "2026-01-01", "gemini", "gemini-pro", null, delta);

  // Guards against a regression back to a naive `ON CONFLICT(day,client,model,repo)`:
  // that never matches a NULL `repo`, so it would silently insert a second row
  // instead of accumulating onto the first.
  const count = db.prepare("SELECT COUNT(*) as n FROM usage_facts").get() as { n: number };
  expect(count.n).toBe(1);

  const rows = queryUsageSummary(db, "client", "2026-01-01", "2026-01-01");
  expect(rows).toEqual([
    { key: "gemini", input: 20, output: 10, cacheRead: 0, cacheWrite: 0, costMicroUsd: 100 },
  ]);
});

test("a single unknown-cost event poisons the bucket's cost to NULL forever, even after a later known-cost delta", () => {
  const db = openDb(":memory:");
  upsertUsageFact(db, "2026-01-01", "claude", "model-a", "repo-a", {
    input: 10,
    output: 5,
    cacheRead: 0,
    cacheWrite: 0,
    costMicroUsd: 100,
  });
  upsertUsageFact(db, "2026-01-01", "claude", "model-a", "repo-a", {
    input: 3,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    costMicroUsd: null,
  });
  // A subsequent known-cost delta must NOT resurrect the poisoned bucket.
  upsertUsageFact(db, "2026-01-01", "claude", "model-a", "repo-a", {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    costMicroUsd: 999,
  });

  const rows = queryUsageSummary(db, "model", "2026-01-01", "2026-01-01");
  expect(rows).toEqual([
    { key: "model-a", input: 14, output: 7, cacheRead: 0, cacheWrite: 0, costMicroUsd: null },
  ]);
});

test("upsertSkillUsage accumulates read counts across repeated calls", () => {
  const db = openDb(":memory:");
  upsertSkillUsage(db, "2026-01-01", "rtk", "claude", "repo-a", "model-a", 1);
  upsertSkillUsage(db, "2026-01-01", "rtk", "claude", "repo-a", "model-a", 1);
  upsertSkillUsage(db, "2026-01-01", "rtk", "claude", "repo-a", "model-a", 3);

  const rows = queryUsageSummary(db, "skill", "2026-01-01", "2026-01-01");
  expect(rows).toEqual([
    { key: "rtk", input: 5, output: 0, cacheRead: 0, cacheWrite: 0, costMicroUsd: null },
  ]);
});

test("queryUsageSummary groups correctly by model, repo, client, and skill", () => {
  const db = openDb(":memory:");
  upsertUsageFact(db, "2026-01-01", "claude", "model-a", "repo-x", {
    input: 10,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    costMicroUsd: 10,
  });
  upsertUsageFact(db, "2026-01-01", "omp", "model-b", "repo-y", {
    input: 20,
    output: 2,
    cacheRead: 0,
    cacheWrite: 0,
    costMicroUsd: 20,
  });
  upsertSkillUsage(db, "2026-01-01", "skill-a", "claude", "repo-x", "model-a", 2);

  const byModel = queryUsageSummary(db, "model", "2026-01-01", "2026-01-01");
  expect(byModel.map((r) => r.key).sort()).toEqual(["model-a", "model-b"]);

  const byRepo = queryUsageSummary(db, "repo", "2026-01-01", "2026-01-01");
  expect(byRepo.map((r) => r.key).sort()).toEqual(["repo-x", "repo-y"]);

  const byClient = queryUsageSummary(db, "client", "2026-01-01", "2026-01-01");
  expect(byClient.map((r) => r.key).sort()).toEqual(["claude", "omp"]);

  const bySkill = queryUsageSummary(db, "skill", "2026-01-01", "2026-01-01");
  expect(bySkill).toEqual([
    { key: "skill-a", input: 2, output: 0, cacheRead: 0, cacheWrite: 0, costMicroUsd: null },
  ]);
});

test("a NULL repo/model bucket is coalesced to the literal string 'unknown'", () => {
  const db = openDb(":memory:");
  upsertUsageFact(db, "2026-01-01", "gemini", "gemini-pro", null, {
    input: 5,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    costMicroUsd: null,
  });

  const byRepo = queryUsageSummary(db, "repo", "2026-01-01", "2026-01-01");
  expect(byRepo).toEqual([
    { key: "unknown", input: 5, output: 1, cacheRead: 0, cacheWrite: 0, costMicroUsd: null },
  ]);
});

test("queryUsageSummary excludes days outside the from/to boundary", () => {
  const db = openDb(":memory:");
  upsertUsageFact(db, "2025-12-31", "claude", "model-a", "repo-a", {
    input: 100,
    output: 100,
    cacheRead: 0,
    cacheWrite: 0,
    costMicroUsd: null,
  });
  upsertUsageFact(db, "2026-01-01", "claude", "model-a", "repo-a", {
    input: 1,
    output: 2,
    cacheRead: 0,
    cacheWrite: 0,
    costMicroUsd: null,
  });
  upsertUsageFact(db, "2026-01-02", "claude", "model-a", "repo-a", {
    input: 1000,
    output: 1000,
    cacheRead: 0,
    cacheWrite: 0,
    costMicroUsd: null,
  });

  const rows = queryUsageSummary(db, "model", "2026-01-01", "2026-01-01");
  expect(rows).toEqual([
    { key: "model-a", input: 1, output: 2, cacheRead: 0, cacheWrite: 0, costMicroUsd: null },
  ]);
});

test("two devices pushing the same (day, client, model, repo=NULL) usage_facts bucket accumulate as SEPARATE rows, not overwrite each other", () => {
  // repo NULL matches gemini/opencode's real events (they never report a repo), and is exactly the
  // shape most likely to collide across devices at a hub: every device's gemini usage shares the
  // same (day, client, model, NULL) key unless `device` is also part of the match/PK.
  const db = openDb(":memory:");
  upsertUsageFact(
    db,
    "2026-01-01",
    "gemini",
    "model-a",
    null,
    { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, costMicroUsd: 5 },
    "laptop",
  );
  upsertUsageFact(
    db,
    "2026-01-01",
    "gemini",
    "model-a",
    null,
    { input: 200, output: 20, cacheRead: 0, cacheWrite: 0, costMicroUsd: 7 },
    "desktop",
  );

  // Grouped by model, the hub summary must SUM both devices, not show only the last pusher.
  const rows = queryUsageSummary(db, "model", "2026-01-01", "2026-01-01");
  expect(rows).toEqual([
    { key: "model-a", input: 300, output: 30, cacheRead: 0, cacheWrite: 0, costMicroUsd: 12 },
  ]);

  // Re-pushing "laptop"'s absolute state (idempotent SET semantics) must only touch its own row —
  // "desktop"'s numbers stay untouched.
  upsertUsageFact(
    db,
    "2026-01-01",
    "gemini",
    "model-a",
    null,
    { input: 150, output: 15, cacheRead: 0, cacheWrite: 0, costMicroUsd: 6 },
    "laptop",
  );
  const after = queryUsageSummary(db, "model", "2026-01-01", "2026-01-01");
  expect(after).toEqual([
    { key: "model-a", input: 350, output: 35, cacheRead: 0, cacheWrite: 0, costMicroUsd: 13 },
  ]);
});

test("two devices pushing the same skill_usage bucket accumulate as separate rows, and agent-mode (device NULL) accumulation is untouched by either", () => {
  const db = openDb(":memory:");
  upsertSkillUsage(db, "2026-01-01", "rtk", "omp", null, "model-a", 3, "laptop");
  upsertSkillUsage(db, "2026-01-01", "rtk", "omp", null, "model-a", 5, "desktop");
  // This machine's own agent-mode accumulation (device NULL) is a THIRD, independent row.
  upsertSkillUsage(db, "2026-01-01", "rtk", "omp", null, "model-a", 2);
  upsertSkillUsage(db, "2026-01-01", "rtk", "omp", null, "model-a", 1);

  const rows = queryUsageSummary(db, "skill", "2026-01-01", "2026-01-01");
  // 3 (laptop) + 5 (desktop) + 2 + 1 (this machine's own accumulated total) = 11.
  expect(rows).toEqual([
    { key: "rtk", input: 11, output: 0, cacheRead: 0, cacheWrite: 0, costMicroUsd: null },
  ]);
  const count = db
    .prepare("SELECT SUM(count) as total FROM skill_usage WHERE skill = 'rtk'")
    .get() as { total: number };
  expect(count.total).toBe(11);
  const rowCount = db
    .prepare("SELECT COUNT(*) as n FROM skill_usage WHERE skill = 'rtk'")
    .get() as {
    n: number;
  };
  expect(rowCount.n).toBe(3); // laptop, desktop, and this machine's own NULL-device row
});

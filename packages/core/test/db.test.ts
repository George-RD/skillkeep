import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { defaultConfig, getConfig, openDb, recordAdoption, setConfig } from "../src/db";
import type { Config } from "../src/types";

test("openDb creates tables and sets user_version to 2", () => {
  const db = openDb(":memory:");
  const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
  expect(version.user_version).toBe(2);
  // All seven tables exist
  for (const table of [
    "settings",
    "adoptions",
    "scan_files",
    "usage_facts",
    "skill_usage",
    "devices",
    "skill_revs",
  ]) {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    expect(row).not.toBeNull();
  }
});

test("getConfig returns documented default when no config stored", () => {
  const db = openDb(":memory:");
  const config = getConfig(db);
  expect(config.repoRoots).toEqual(["~/repos"]);
  expect(config.projects).toEqual({});
  expect(config.linkMode).toBe(process.platform === "win32" ? "copy" : "symlink");
});

test("config round-trips through setConfig/getConfig", () => {
  const db = openDb(":memory:");
  const config: Config = {
    ...defaultConfig(),
    registryRoot: "/custom/registry",
    globalClients: ["claude", "codex"],
    repoClients: ["agents"],
    linkMode: "copy",
    inboxDirs: ["~/inbox"],
    projects: { myproject: { repos: ["~/repos/myproject"] } },
  };
  setConfig(db, config);
  const loaded = getConfig(db);
  expect(loaded).toEqual(config);
});

test("recordAdoption inserts an auditable row", () => {
  const db: Database = openDb(":memory:");
  recordAdoption(db, "my-skill", "global", "/source/path");
  const rows = db.prepare("SELECT name, scope, source_path FROM adoptions").all() as {
    name: string;
    scope: string;
    source_path: string;
  }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]?.name).toBe("my-skill");
  expect(rows[0]?.scope).toBe("global");
  expect(rows[0]?.source_path).toBe("/source/path");
});

test("openDb migrates a pre-existing v1 database: device joins the PK, existing rows preserved with device NULL", () => {
  // A fresh :memory: db always gets the final v2 shape straight from CREATE TABLE IF NOT EXISTS —
  // this test instead builds a REAL v1 file (the exact shape this project shipped before hub mode
  // existed: no `device` column, PK = (day, client, model, repo)) and re-opens it via `openDb`, so
  // the actual `MIGRATIONS[1]` rebuild path runs, not just the fresh-db path.
  const dbPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "skillkeep-db-migrate-")),
    "v1.db",
  );
  const seed = new Database(dbPath, { create: true });
  seed.exec(
    "CREATE TABLE usage_facts(day TEXT, client TEXT, model TEXT, repo TEXT, input INTEGER, output INTEGER, cache_read INTEGER, cache_write INTEGER, cost_microusd INTEGER, PRIMARY KEY(day, client, model, repo))",
  );
  seed.exec(
    "CREATE TABLE skill_usage(day TEXT, skill TEXT, client TEXT, repo TEXT, model TEXT, count INTEGER, PRIMARY KEY(day, skill, client, repo, model))",
  );
  seed
    .prepare(
      "INSERT INTO usage_facts (day, client, model, repo, input, output, cache_read, cache_write, cost_microusd) VALUES ('2026-01-01','claude','model-a','repo-a',10,5,0,0,100)",
    )
    .run();
  seed
    .prepare(
      "INSERT INTO skill_usage (day, skill, client, repo, model, count) VALUES ('2026-01-01','rtk','omp','repo-a','model-a',3)",
    )
    .run();
  seed.exec("PRAGMA user_version = 1");
  seed.close();

  const db = openDb(dbPath);

  const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
  expect(version.user_version).toBe(2);

  const ufCols = db.prepare("PRAGMA table_info(usage_facts)").all() as {
    name: string;
    pk: number;
  }[];
  const deviceCol = ufCols.find((c) => c.name === "device");
  expect(deviceCol?.pk).toBeGreaterThan(0);

  const ufRow = db.prepare("SELECT input, output, device FROM usage_facts").get() as {
    input: number;
    output: number;
    device: string | null;
  };
  expect(ufRow).toEqual({ input: 10, output: 5, device: null });

  const suRow = db.prepare("SELECT count, device FROM skill_usage").get() as {
    count: number;
    device: string | null;
  };
  expect(suRow).toEqual({ count: 3, device: null });
});

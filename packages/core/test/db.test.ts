import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { defaultConfig, getConfig, openDb, recordAdoption, setConfig } from "../src/db";
import type { Config } from "../src/types";

test("openDb creates tables and sets user_version to 1", () => {
  const db = openDb(":memory:");
  const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
  expect(version.user_version).toBe(1);
  // All five tables exist
  for (const table of ["settings", "adoptions", "scan_files", "usage_facts", "skill_usage"]) {
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

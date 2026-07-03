import type { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ensureScopeDirName, hashSkillDir, scanRegistry, skillDirInScope } from "@skillkeep/core";

/** One entry in the hub's registry manifest: identity + content hash + monotonic rev. */
export interface ManifestEntry {
  scope: string;
  name: string;
  hash: string;
  rev: number;
}

/**
 * Build the full registry manifest: every on-disk skill from {@link scanRegistry}, each hashed via
 * {@link hashSkillDir} and joined with its current `skill_revs` rev (0 if the skill has never been
 * pushed to the hub).
 */
export async function buildManifest(db: Database, registryRoot: string): Promise<ManifestEntry[]> {
  const entries = await scanRegistry(registryRoot);
  return Promise.all(
    entries.map(async (entry) => ({
      scope: entry.scope,
      name: entry.skill.name,
      hash: await hashSkillDir(entry.skill.dir),
      rev: getSkillRev(db, entry.scope, entry.skill.name),
    })),
  );
}

/** Read the current rev for a (scope, name) skill; 0 if it has never been pushed. */
export function getSkillRev(db: Database, scope: string, name: string): number {
  const row = db
    .prepare("SELECT rev FROM skill_revs WHERE scope = ? AND name = ?")
    .get(scope, name) as { rev?: number } | undefined;
  return row?.rev ?? 0;
}

/** Set (create or overwrite) the rev for a (scope, name) skill. */
export function setSkillRev(db: Database, scope: string, name: string, rev: number): void {
  db.prepare("INSERT OR REPLACE INTO skill_revs (scope, name, rev) VALUES (?, ?, ?)").run(
    scope,
    name,
    rev,
  );
}

/**
 * Tar a skill directory's contents into an ArrayBuffer via the system `tar` binary
 * (`tar -cf - -C dir .`). The output is every file under `dir`, suitable for streaming as
 * `application/x-tar` over HTTP (ArrayBuffer, not Uint8Array, so it's directly usable as a
 * fetch/Response `BodyInit` without a wrapping cast).
 */
export async function createSkillTar(dir: string): Promise<ArrayBuffer> {
  const proc = Bun.spawn(["tar", "-cf", "-", "-C", dir, "."], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const buf = await new Response(proc.stdout).arrayBuffer();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`tar create failed (exit ${exitCode})`);
  }
  return buf;
}

/**
 * Extract a tar archive into `destDir`. Clears any existing contents first (the caller is
 * responsible for archiving the prior version). Pipes the raw bytes into `tar -xf - -C destDir`.
 */
export async function extractSkillTar(destDir: string, bytes: ArrayBuffer): Promise<void> {
  // Clear any existing contents (archive was already saved by the caller), then recreate.
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.mkdir(destDir, { recursive: true });
  const proc = Bun.spawn(["tar", "-xf", "-", "-C", destDir], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(bytes);
  await proc.stdin.end();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`tar extract failed (exit ${exitCode})`);
  }
}

/**
 * Archive the current on-disk skill dir as a tar under `<dataDir>/registry-history/<name>/<rev>.tar`.
 * Called before extracting a new version so the hub retains every prior revision on disk.
 */
export async function archiveSkillDir(
  dataDir: string,
  name: string,
  rev: number,
  currentDir: string,
): Promise<void> {
  const historyDir = path.join(dataDir, "registry-history", name);
  await fs.mkdir(historyDir, { recursive: true });
  const archivePath = path.join(historyDir, `${rev}.tar`);
  const tarBytes = await createSkillTar(currentDir);
  await fs.writeFile(archivePath, new Uint8Array(tarBytes));
}

/**
 * Resolve the on-disk directory for a (scope, name) skill, validating the scope string first.
 * Returns the path whether or not the directory currently exists.
 */
export function resolveSkillDir(registryRoot: string, scope: string, name: string): string {
  ensureScopeDirName(scope);
  return skillDirInScope(registryRoot, scope, name);
}

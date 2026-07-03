import { createHash } from "node:crypto";
import { type Dirent, existsSync, type Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import YAML from "yaml";
import type { SkillMeta } from "./types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseSkillMd(content: string): { name: string | null; description: string | null } {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return { name: null, description: null };
  let doc: unknown;
  try {
    doc = YAML.parse(match[1] ?? "");
  } catch {
    return { name: null, description: null };
  }
  if (!doc || typeof doc !== "object") return { name: null, description: null };
  const record = doc as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : null;
  const description = typeof record.description === "string" ? record.description.trim() : null;
  return { name: name || null, description: description || null };
}

/** Read one skill dir's SKILL.md; name always mirrors the dir name (registry's contract). */
export async function readSkillMeta(dir: string): Promise<SkillMeta> {
  const name = path.basename(dir);
  const skillMdPath = path.join(dir, "SKILL.md");
  try {
    const content = await fs.readFile(skillMdPath, "utf8");
    const { description } = parseSkillMd(content);
    return { name, dir, skillMdPath, description, invalid: !description };
  } catch {
    return { name, dir, skillMdPath, description: null, invalid: true };
  }
}

/** One level deep scan: <dir>/<name>/SKILL.md. Never throws for a missing/unreadable dir — returns []. */
export async function scanSkillDirs(dir: string): Promise<SkillMeta[]> {
  if (!existsSync(dir)) return [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries.filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
  const metas: SkillMeta[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const skillDir = path.join(dir, name);
    let stat: Stats | null;
    try {
      stat = await fs.stat(skillDir);
    } catch {
      stat = null;
    }
    if (!stat?.isDirectory()) continue;
    if (!existsSync(path.join(skillDir, "SKILL.md"))) continue;
    metas.push(await readSkillMeta(skillDir));
  }
  return metas;
}

/** Deterministic content hash of a skill directory (sorted relative paths + file bytes). */
export async function hashSkillDir(dir: string): Promise<string> {
  const files: string[] = [];
  async function walk(sub: string) {
    const entries = await fs.readdir(path.join(dir, sub), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.join(sub, entry.name);
      if (entry.isDirectory()) await walk(rel);
      else if (entry.isFile()) files.push(rel);
    }
  }
  await walk("");
  const hash = createHash("sha256");
  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    hash.update(await fs.readFile(path.join(dir, rel)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

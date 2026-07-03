import type { Dirent, Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Outcome of planSymlink: what it did (or would do in dry-run) and the resolved relative target. */
export interface LinkAction {
  kind: "create" | "fix" | "noop";
  linkPath: string;
  target: string;
}

/** Create/fix a relative symlink at linkPath -> targetDir. Returns the action taken (no mutation in dry-run). */
export async function planSymlink(
  linkPath: string,
  targetDir: string,
  dryRun: boolean,
): Promise<LinkAction> {
  const relTarget = path.relative(path.dirname(linkPath), targetDir);
  let existing: Stats | null;
  try {
    existing = await fs.lstat(linkPath);
  } catch {
    existing = null;
  }
  if (!existing) {
    if (!dryRun) {
      await fs.mkdir(path.dirname(linkPath), { recursive: true });
      await fs.symlink(relTarget, linkPath, "dir");
    }
    return { kind: "create", linkPath, target: relTarget };
  }
  if (existing.isSymbolicLink()) {
    const currentTarget = await fs.readlink(linkPath);
    if (currentTarget === relTarget) return { kind: "noop", linkPath, target: relTarget };
    if (!dryRun) {
      await fs.unlink(linkPath);
      await fs.symlink(relTarget, linkPath, "dir");
    }
    return { kind: "fix", linkPath, target: relTarget };
  }
  // A real directory/file occupies this name: never overwrite (real-copy duplicate territory).
  throw new Error(
    `refusing to replace non-symlink at ${linkPath} (real dir/file, not managed by skillkeep)`,
  );
}

/** Resolve a symlink's absolute target directory, or null if not a symlink. */
async function symlinkAbsoluteTarget(linkPath: string): Promise<string | null> {
  let stat: Stats | null;
  try {
    stat = await fs.lstat(linkPath);
  } catch {
    return null;
  }
  if (!stat?.isSymbolicLink()) return null;
  const rel = await fs.readlink(linkPath);
  return path.resolve(path.dirname(linkPath), rel);
}

/**
 * Remove symlinks directly under dir whose immediate target resolves inside one of trustedRoots
 * (the registry itself, and/or a repo's canonical .agents/skills dir for sibling client farms)
 * but whose full symlink chain is broken. Never touches real directories/files or symlinks
 * pointing somewhere skillkeep doesn't own.
 */
export async function pruneDanglingRegistrySymlinks(
  dir: string,
  trustedRoots: string | string[],
  dryRun: boolean,
): Promise<string[]> {
  const roots = Array.isArray(trustedRoots) ? trustedRoots : [trustedRoots];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const pruned: string[] = [];
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    const linkPath = path.join(dir, entry.name);
    const absTarget = await symlinkAbsoluteTarget(linkPath);
    if (!absTarget || !roots.some((root) => absTarget.startsWith(`${root}${path.sep}`))) continue;
    // Full-chain resolution: catches both a missing first hop and a sibling's dangling second hop.
    try {
      await fs.access(linkPath);
      continue;
    } catch {
      // dangling — fall through to prune
    }
    if (!dryRun) await fs.unlink(linkPath);
    pruned.push(linkPath);
  }
  return pruned;
}

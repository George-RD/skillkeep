import * as path from "node:path";
import { $ } from "bun";

/** Commits only the given pathspecs (never a bare `-A`) so a shared repo's unrelated WIP is never swept in. */
export async function gitCommitAll(
  repoDir: string,
  message: string,
  pathspecs: string[],
): Promise<boolean> {
  await $`git add -- ${pathspecs}`.cwd(repoDir).quiet().nothrow();
  const status = await $`git status --porcelain -- ${pathspecs}`.cwd(repoDir).quiet().nothrow();
  if (status.text().trim().length === 0) return false;
  const commit = await $`git commit -q -m ${message} -- ${pathspecs}`
    .cwd(repoDir)
    .quiet()
    .nothrow();
  if (commit.exitCode !== 0) throw new Error(`git commit failed in ${repoDir}: ${commit.text()}`);
  return true;
}

/** Fast-forward pull; returns ok=false with the git message on any failure. */
export async function gitPullFf(repoDir: string): Promise<{ ok: boolean; message: string }> {
  const result = await $`git pull --ff-only`.cwd(repoDir).quiet().nothrow();
  return { ok: result.exitCode === 0, message: result.text() };
}

/** Whether the repo has local commits not yet pushed to its upstream. */
export async function gitHasUnpushedCommits(repoDir: string): Promise<boolean> {
  const result = await $`git log @{u}..HEAD --oneline`.cwd(repoDir).quiet().nothrow();
  if (result.exitCode !== 0) return false;
  return result.text().trim().length > 0;
}

/** Push to upstream; returns ok=false with the git message on any failure. */
export async function gitPush(repoDir: string): Promise<{ ok: boolean; message: string }> {
  const result = await $`git push`.cwd(repoDir).quiet().nothrow();
  return { ok: result.exitCode === 0, message: result.text() };
}

/** Whether a path is git-ignored in the repo. Treats non-git dirs as "ignored" (exit 128). */
export async function gitIsIgnored(repoDir: string, relPath: string): Promise<boolean> {
  const result = await $`git check-ignore -q ${relPath}`.cwd(repoDir).quiet().nothrow();
  // exitCode 128 means "not a git repo" (or other fatal git error) — never treat that as "not ignored".
  if (result.exitCode === 128) return true;
  return result.exitCode === 0;
}

/** No-op outside a real git repo (e.g. a plain directory without its own .git). */
export async function gitAddExclude(repoDir: string, relPath: string): Promise<void> {
  const gitPath = await $`git rev-parse --git-path info/exclude`.cwd(repoDir).quiet().nothrow();
  const relGitPath = gitPath.text().trim();
  if (gitPath.exitCode !== 0 || relGitPath.length === 0) return;
  const excludeFile = path.isAbsolute(relGitPath) ? relGitPath : path.join(repoDir, relGitPath);
  const file = Bun.file(excludeFile);
  const existing = (await file.exists()) ? await file.text() : "";
  if (existing.split("\n").some((line) => line.trim() === relPath)) return;
  const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await Bun.write(excludeFile, `${existing}${sep}${relPath}\n`);
}

/** All git worktrees of a repo (or [repoDir] itself if not a git repo / worktree command fails). */
export async function gitWorktrees(repoDir: string): Promise<string[]> {
  const result = await $`git worktree list --porcelain`.cwd(repoDir).quiet().nothrow();
  if (result.exitCode !== 0) return [repoDir];
  const worktrees: string[] = [];
  for (const line of result.text().split("\n")) {
    if (line.startsWith("worktree ")) worktrees.push(line.slice("worktree ".length).trim());
  }
  return worktrees.length > 0 ? worktrees : [repoDir];
}

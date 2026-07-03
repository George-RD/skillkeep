import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Expand a leading `~` and `$VAR` / `${VAR}` references in a path string.
 * Absolute paths and plain strings pass through unchanged.
 */
export function expandPath(p: string): string {
  let s = p;
  if (s.startsWith("~")) {
    s = path.join(process.env.HOME ?? process.env.USERPROFILE ?? path.sep, s.slice(1));
  }
  s = s.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name: string) => process.env[name] ?? "");
  s = s.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, name: string) => process.env[name] ?? "");
  return s;
}

/**
 * Naive decode of a cwd-slug directory name: every `-` becomes `/`, so the
 * leading dash becomes the root `/`. This is lossy for repo names that contain
 * literal dashes (e.g. `-repos-my-cool` -> `/repos/my/cool`); callers reconcile
 * that with a disk-existence check in {@link repoFromSlug}.
 */
export function decodeCwdSlug(slug: string): string {
  return slug.replace(/-/g, "/");
}

/**
 * Best-effort repo resolution from a cwd-slug: try the naive decode; if that
 * path does not exist on disk, fall back to the raw slug rather than guessing.
 *
 * `exists` is injectable so the decode/resolve logic is unit-testable without
 * touching the filesystem.
 */
export function repoFromSlug(slug: string, exists: (p: string) => boolean = existsSync): string {
  const decoded = decodeCwdSlug(slug);
  return exists(decoded) ? decoded : slug;
}

/** Coerce a token-count-ish value into a non-negative integer; bad values -> 0. */
export function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/** Coerce an ISO timestamp string or epoch-ms number into epoch ms; bad -> 0. */
export function parseTs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

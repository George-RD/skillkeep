import { attributedSkill } from "./attribution.ts";
import { jsonlRecords } from "./jsonl.ts";
import { parseTs, repoFromSlug } from "./util.ts";

/**
 * One skill-invocation event extracted from a client transcript: an agent read
 * a `SKILL.md` (or, for omp, a `skill://<name>` URI) at `ts`. Kept separate
 * from {@link UsageEvent} (token/cost accounting) — a skill read carries no
 * token counts of its own; `skill_usage` is a distinct count table.
 */
export interface SkillReadEvent {
  ts: number;
  client: "claude" | "omp";
  skill: string;
  repo: string | null;
  model: string | null;
  sessionId: string;
}

// glob suffix: same file set claude.ts already walks —
// <root>/<encoded-cwd>/**/*.jsonl. See FORMATS.md ("Skill-read attribution").

/**
 * Extract the encoded-cwd directory segment from a Claude projects file path.
 * Duplicated from claude.ts's private `projectSlugFromFile` (kept separate per
 * this module's own concern — skill-usage attribution vs token accounting —
 * rather than sharing a private helper across unrelated parsers).
 */
function claudeProjectSlug(file: string): string {
  const segments = file.split(/[\\/]/);
  const i = segments.indexOf("projects");
  if (i > 0 && segments[i - 1] === ".claude" && i + 1 < segments.length) {
    return segments[i + 1] ?? "";
  }
  return segments[segments.length - 1] ?? "";
}

/**
 * Resolve the skill name a Claude `tool_use` content block read, if any.
 *
 * Two real shapes were observed on this machine (see FORMATS.md):
 *  - `{ name: "Read", input: { file_path: ".../skills/<name>/SKILL.md" } }`
 *    — attributed via the path-matching {@link attributedSkill}.
 *  - `{ name: "Skill", input: { skill: "<name>" } }` — a dedicated Skill tool
 *    invocation that names the skill directly; no path matching needed.
 */
function skillFromClaudeBlock(block: Record<string, unknown>): string | null {
  if (block.type !== "tool_use") return null;
  const input = block.input as Record<string, unknown> | undefined;
  if (block.name === "Skill" && typeof input?.skill === "string") return input.skill;
  if (block.name === "Read" && typeof input?.file_path === "string") {
    return attributedSkill(input.file_path);
  }
  return null;
}

/**
 * Stream skill-read events out of one Claude projects transcript file,
 * resuming from `fromOffset` (same byte-offset cursor semantics as
 * `claude.parse`, but tracked under its own cursor key by the ingest
 * orchestrator so this pass never collides with the token-usage pass over the
 * same file).
 */
export async function* claudeSkillReads(
  file: string,
  fromOffset: number,
): AsyncGenerator<{ event: SkillReadEvent | null; nextOffset: number }> {
  const repo = repoFromSlug(claudeProjectSlug(file));
  for await (const { record, nextOffset } of jsonlRecords(file, fromOffset)) {
    if (!record || typeof record !== "object") {
      yield { event: null, nextOffset };
      continue;
    }
    const entry = record as Record<string, unknown>;
    const message = entry.message as Record<string, unknown> | undefined;
    const blocks = message?.content;
    if (entry.type !== "assistant" || !Array.isArray(blocks)) {
      yield { event: null, nextOffset };
      continue;
    }
    let skill: string | null = null;
    for (const block of blocks) {
      if (block && typeof block === "object") {
        skill = skillFromClaudeBlock(block as Record<string, unknown>);
        if (skill) break;
      }
    }
    if (!skill) {
      yield { event: null, nextOffset };
      continue;
    }
    yield {
      event: {
        ts: parseTs(entry.timestamp),
        client: "claude",
        skill,
        repo,
        model: typeof message?.model === "string" ? message.model : null,
        sessionId: typeof entry.sessionId === "string" ? entry.sessionId : "",
      },
      nextOffset,
    };
  }
}

/** Derive the cwd-slug (repo) and session-id from an OMP transcript path — same layout omp.ts's `ompPathParts` uses. */
function ompRepoAndSession(file: string): { repo: string; sessionId: string } {
  const segments = file.split(/[\\/]/);
  const i = segments.lastIndexOf("sessions");
  if (i >= 0 && i + 2 < segments.length) {
    return { repo: repoFromSlug(segments[i + 1] ?? ""), sessionId: segments[i + 2] ?? "" };
  }
  return { repo: "", sessionId: "" };
}

/**
 * Resolve the skill name an OMP `read` tool call read, if any.
 *
 * Two real shapes were observed on this machine (see FORMATS.md):
 *  - `path: "skill://<Display Name>"` — the internal skill URI convention
 *    (documented in OMP's own tool inventory); the name is the segment after
 *    `skill://` verbatim, taken directly rather than through
 *    {@link attributedSkill} (which expects a path ending in
 *    `skills/<name>/SKILL.md`, not a bare display name). A trailing
 *    `/SKILL.md` (the `skill://<name>/SKILL.md` sub-path form used to read the
 *    raw file rather than the rendered instructions — see this project's own
 *    `skill://<name>/<path>` URI convention) is stripped so both forms count
 *    as the same skill instead of fragmenting into two usage rows.
 *  - a literal filesystem path ending in `.../managed-skills/<name>/SKILL.md`
 *    (or `.../skills/<name>/SKILL.md`) — attributed via {@link attributedSkill}.
 * `attributedSkill` is tried first since it also matches a `skill://` URI that
 * happens to carry a full `skills/<name>/SKILL.md` suffix (a third shape its
 * own test suite documents); the bare-name fallback only fires when that
 * doesn't match.
 */
function skillFromOmpReadPath(path: string): string | null {
  const viaPath = attributedSkill(path);
  if (viaPath) return viaPath;
  if (path.startsWith("skill://")) {
    const name = path
      .slice("skill://".length)
      .trim()
      .replace(/\/SKILL\.md$/i, "");
    return name.length > 0 ? name : null;
  }
  return null;
}

/**
 * Stream skill-read events out of one OMP session transcript file, resuming
 * from `fromOffset` (own cursor key, independent of the token-usage pass over
 * the same file — see the orchestrator in @skillkeep/server).
 */
export async function* ompSkillReads(
  file: string,
  fromOffset: number,
): AsyncGenerator<{ event: SkillReadEvent | null; nextOffset: number }> {
  const { repo, sessionId } = ompRepoAndSession(file);
  for await (const { record, nextOffset } of jsonlRecords(file, fromOffset)) {
    if (!record || typeof record !== "object") {
      yield { event: null, nextOffset };
      continue;
    }
    const entry = record as Record<string, unknown>;
    const message = entry.message as Record<string, unknown> | undefined;
    const blocks = message?.content;
    if (entry.type !== "message" || message?.role !== "assistant" || !Array.isArray(blocks)) {
      yield { event: null, nextOffset };
      continue;
    }
    let skill: string | null = null;
    for (const block of blocks) {
      if (
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "toolCall" &&
        (block as Record<string, unknown>).name === "read"
      ) {
        const args = (block as Record<string, unknown>).arguments as
          | Record<string, unknown>
          | undefined;
        if (typeof args?.path === "string") {
          skill = skillFromOmpReadPath(args.path);
          if (skill) break;
        }
      }
    }
    if (!skill) {
      yield { event: null, nextOffset };
      continue;
    }
    yield {
      event: {
        ts: parseTs(entry.timestamp),
        client: "omp",
        skill,
        repo,
        model: typeof message?.model === "string" ? message.model : null,
        sessionId,
      },
      nextOffset,
    };
  }
}

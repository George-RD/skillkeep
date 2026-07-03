/**
 * Skill-usage attribution: a deterministic, format-agnostic matcher over file
 * paths read by an agent. Any read of a path ending in
 * `skills/<name>/SKILL.md` or `managed-skills/<name>/SKILL.md` counts as one
 * use of skill `<name>`. Returns `null` for paths that are not a SKILL.md read,
 * so callers can no-op cheaply.
 *
 * Attribution coverage is limited to clients whose transcripts record file
 * reads (claude, omp). Clients whose logs do not record reads simply never
 * produce a matching path — they display "n/a", never an estimate.
 */
const SKILL_MD_RE = /(?:skills|managed-skills)\/([^/]+)\/SKILL\.md$/;

export function attributedSkill(readPath: string): string | null {
  const match = readPath.match(SKILL_MD_RE);
  return match?.[1] ? match[1] : null;
}

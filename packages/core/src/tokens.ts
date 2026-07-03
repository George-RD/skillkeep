/**
 * Token estimation: chars/4 rounded to the nearest integer.
 * Deterministic — same inputs always yield the same estimate.
 * Extracted from status.ts so detect.ts and the daemon can reuse the same maths.
 */
export function estimateTokens(skills: { name: string; description: string | null }[]): number {
  let chars = 0;
  for (const skill of skills) chars += skill.name.length + (skill.description?.length ?? 0) + 4;
  return Math.round(chars / 4);
}

import type { Rules } from "./types";

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** First-match-wins scope lookup for a skill name against rules.yml. Returns null if unmatched (queue). */
export function matchScope(name: string, rules: Rules): string | null {
  for (const [scope, patterns] of Object.entries(rules)) {
    for (const pattern of patterns) {
      if (globToRegExp(pattern).test(name)) return scope;
    }
  }
  return null;
}

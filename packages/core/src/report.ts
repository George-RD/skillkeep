import type { CheckFinding } from "./check";
import type { DoctorReport } from "./doctor";

/** Inputs for {@link buildDiagnosticMarkdown}. */
export interface DiagnosticInput {
  version: string;
  platform: string;
  doctor: DoctorReport;
  findings: CheckFinding[];
}

export const REPORT_ISSUE_REPO = "George-RD/skillkeep";
export const REPORT_ISSUE_BODY_CAP = 6000;

/** Build a markdown diagnostic report containing the app version, platform, doctor state, and every check finding. */
export function buildDiagnosticMarkdown(input: DiagnosticInput): string {
  const lines: string[] = [
    "# skillkeep diagnostic report",
    "",
    `- **version:** ${input.version}`,
    `- **platform:** ${input.platform}`,
    "",
    "## doctor",
    `- registry present: ${input.doctor.registryPresent ? "yes" : "no"}`,
    `- registry valid: ${input.doctor.registryValid ? "yes" : "no"}`,
    `- launch agent installed: ${input.doctor.plistInstalled ? "yes" : "no"}`,
    `- launch agent loaded: ${input.doctor.plistLoaded ? "yes" : "no"}`,
    `- link mode: ${input.doctor.linkMode}`,
    `- symlinks supported: ${input.doctor.symlinkSupported ? "yes" : "no"}`,
    `- clients found: ${input.doctor.clientsFound.join(", ") || "none"}`,
    "",
    `## check findings (${input.findings.length})`,
  ];
  if (input.findings.length === 0) {
    lines.push("none");
  } else {
    for (const finding of input.findings) {
      lines.push(`- \`${finding.kind}\`: ${finding.detail}`);
    }
  }
  return lines.join("\n");
}

/** Whether `report`/`doctor` should treat the environment as unhealthy: missing/invalid registry, any
 * check finding, symlink mode without symlink support, or (darwin) a launch agent installed but not
 * loaded — meaning the scheduled self-check silently stopped. Pure, so it is unit-testable per platform. */
export function reportHasProblems(
  doctor: DoctorReport,
  findings: CheckFinding[],
  linkMode: DoctorReport["linkMode"],
  platform: NodeJS.Platform,
): boolean {
  return (
    !doctor.registryPresent ||
    !doctor.registryValid ||
    findings.length > 0 ||
    (linkMode === "symlink" && !doctor.symlinkSupported) ||
    (platform === "darwin" && doctor.plistInstalled && !doctor.plistLoaded)
  );
}

/** URL-encoded length of `body=<value>` as URLSearchParams serialises it, minus the `body=` prefix —
 * the same form-encoding buildIssueUrl uses. encodeURIComponent under-counts `!'()~` and spaces. */
function encodedBodyLength(value: string): number {
  return new URLSearchParams({ body: value }).toString().length - "body=".length;
}

function truncateBodyToEncodedLength(body: string, cap: number, note: string): string {
  if (encodedBodyLength(body) <= cap) return body;
  // Iterate over code points so a cut never splits a surrogate pair (encodeURIComponent throws on a
  // lone surrogate; URLSearchParams would silently swap in U+FFFD).
  const chars = Array.from(body);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = chars.slice(0, mid).join("") + note;
    if (encodedBodyLength(candidate) <= cap) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  if (low === 0) {
    // Even the note alone may exceed a tiny cap; trim the note's code points to fit.
    const noteChars = Array.from(note);
    let n = noteChars.length;
    while (n > 0 && encodedBodyLength(noteChars.slice(0, n).join("")) > cap) n--;
    return noteChars.slice(0, n).join("");
  }
  return chars.slice(0, low).join("") + note;
}

/** Inputs for {@link buildIssueUrl}. */
export interface IssueUrlParts {
  title: string;
  body: string;
}

/**
 * Build a prefilled GitHub new-issue URL. The body is truncated so that its URL-encoded form does
 * not exceed `cap`, and a truncation note is appended when truncation occurs.
 */
export function buildIssueUrl(
  parts: IssueUrlParts,
  repo: string = REPORT_ISSUE_REPO,
  cap: number = REPORT_ISSUE_BODY_CAP,
): string {
  const note = "\n\n[truncated by skillkeep; see attached report for full details]";
  const body = truncateBodyToEncodedLength(parts.body, cap, note);
  const params = new URLSearchParams({ title: parts.title, body });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

/** Inputs for {@link buildCronLogLine}. `routed`/`pushed` are set only for `--auto` runs; when
 * `routed` is undefined the line keeps the original sync+check shape. */
export interface CronLogLineInput {
  timestamp: string;
  syncOk: boolean;
  syncError?: string;
  findings: number;
  routed?: number;
  pushed?: boolean;
}

/** Build the exact one-line cron.log entry for a sync (+ optional auto-triage/push) and check run. */
export function buildCronLogLine(input: CronLogLineInput): string {
  const sync = input.syncOk
    ? "ok"
    : `failed(${(input.syncError ?? "unknown").replace(/[\r\n]+/g, " ")})`;
  const triage = input.routed !== undefined ? ` triage ${input.routed} routed` : "";
  const push =
    input.routed !== undefined && input.routed > 0 ? ` push ${input.pushed ? "ok" : "failed"}` : "";
  return `${input.timestamp} sync ${sync}${triage} check ${input.findings} finding(s)${push}`;
}

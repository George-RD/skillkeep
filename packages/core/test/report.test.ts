import { describe, expect, test } from "bun:test";
import type { CheckFinding } from "../src/check";
import type { DoctorReport } from "../src/doctor";
import {
  buildCronLogLine,
  buildDiagnosticMarkdown,
  buildIssueUrl,
  reportHasProblems,
} from "../src/report";

const doctor: DoctorReport = {
  registryPresent: true,
  registryValid: true,
  plistInstalled: true,
  plistLoaded: true,
  linkMode: "symlink",
  symlinkSupported: true,
  clientsFound: ["omp", "claude"],
};

describe("buildDiagnosticMarkdown", () => {
  test("contains version, platform, doctor fields, and findings", () => {
    const findings: CheckFinding[] = [
      { kind: "inbox-nonempty", detail: "3 skill(s) awaiting triage" },
    ];
    const markdown = buildDiagnosticMarkdown({
      version: "0.1.0",
      platform: "darwin",
      doctor,
      findings,
    });
    expect(markdown).toContain("**version:** 0.1.0");
    expect(markdown).toContain("**platform:** darwin");
    expect(markdown).toContain("registry present: yes");
    expect(markdown).toContain("registry valid: yes");
    expect(markdown).toContain("launch agent installed: yes");
    expect(markdown).toContain("launch agent loaded: yes");
    expect(markdown).toContain("link mode: symlink");
    expect(markdown).toContain("symlinks supported: yes");
    expect(markdown).toContain("clients found: omp, claude");
    expect(markdown).toContain("## check findings (1)");
    expect(markdown).toContain("inbox-nonempty");
    expect(markdown).toContain("3 skill(s) awaiting triage");
  });

  test("shows none when there are no findings", () => {
    const markdown = buildDiagnosticMarkdown({
      version: "1.0.0",
      platform: "linux",
      doctor,
      findings: [],
    });
    expect(markdown).toContain("## check findings (0)");
    expect(markdown).toContain("none");
  });
});

describe("buildIssueUrl", () => {
  test("returns a URL-encoded GitHub new-issue URL", () => {
    const url = buildIssueUrl({ title: "hello world", body: "line one\nline two" });
    expect(url.startsWith("https://github.com/George-RD/skillkeep/issues/new?")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("title")).toBe("hello world");
    expect(params.get("body")).toBe("line one\nline two");
  });

  test("caps the encoded body at 6000 chars and appends a truncation note", () => {
    const longBody = "x".repeat(20_000);
    const url = buildIssueUrl({ title: "t", body: longBody });
    const params = new URL(url).searchParams;
    const body = params.get("body") ?? "";
    expect(new URLSearchParams({ body }).toString().length - "body=".length).toBeLessThanOrEqual(
      6000,
    );
    expect(body).toContain("[truncated by skillkeep; see attached report for full details]");
  });

  test("does not crash and stays within the cap for astral characters", () => {
    const url = buildIssueUrl({ title: "t", body: "😀".repeat(5000) });
    const body = new URL(url).searchParams.get("body") ?? "";
    const encoded = new URLSearchParams({ body }).toString().length - "body=".length;
    expect(encoded).toBeLessThanOrEqual(6000);
    expect(body).toContain("[truncated by skillkeep");
  });

  test("measures the cap with form-encoding so bracket/apostrophe bodies stay within it", () => {
    const url = buildIssueUrl({ title: "t", body: "(!')".repeat(5000) });
    const body = new URL(url).searchParams.get("body") ?? "";
    const encoded = new URLSearchParams({ body }).toString().length - "body=".length;
    expect(encoded).toBeLessThanOrEqual(6000);
  });
});

describe("buildCronLogLine", () => {
  test("formats an ok run with no findings", () => {
    const line = buildCronLogLine({
      timestamp: "2026-07-04T10:00:00.000Z",
      syncOk: true,
      findings: 0,
    });
    expect(line).toBe("2026-07-04T10:00:00.000Z sync ok check 0 finding(s)");
  });

  test("formats a failed run with an error message", () => {
    const line = buildCronLogLine({
      timestamp: "2026-07-04T10:00:00.000Z",
      syncOk: false,
      syncError: "repo missing",
      findings: 2,
    });
    expect(line).toBe("2026-07-04T10:00:00.000Z sync failed(repo missing) check 2 finding(s)");
  });

  test("collapses newlines in the error so the log stays one line", () => {
    const line = buildCronLogLine({
      timestamp: "2026-07-04T10:00:00.000Z",
      syncOk: false,
      syncError: "boom\nstack line 1\nstack line 2",
      findings: 0,
    });
    expect(line.split("\n")).toHaveLength(1);
    expect(line).toContain("failed(boom stack line 1 stack line 2)");
  });

  test("adds triage + push segments for an --auto run", () => {
    const line = buildCronLogLine({
      timestamp: "2026-07-04T10:00:00.000Z",
      syncOk: true,
      findings: 1,
      routed: 2,
      pushed: true,
    });
    expect(line).toBe(
      "2026-07-04T10:00:00.000Z sync ok triage 2 routed check 1 finding(s) push ok",
    );
  });

  test("an --auto run that routed nothing shows triage 0 and no push segment", () => {
    const line = buildCronLogLine({
      timestamp: "2026-07-04T10:00:00.000Z",
      syncOk: true,
      findings: 0,
      routed: 0,
    });
    expect(line).toBe("2026-07-04T10:00:00.000Z sync ok triage 0 routed check 0 finding(s)");
  });

  test("a failed --auto push is recorded as push failed", () => {
    const line = buildCronLogLine({
      timestamp: "2026-07-04T10:00:00.000Z",
      syncOk: false,
      syncError: "registry push failed: rejected",
      findings: 0,
      routed: 1,
      pushed: false,
    });
    expect(line).toContain("triage 1 routed");
    expect(line).toContain("push failed");
  });
});

describe("reportHasProblems", () => {
  test("healthy doctor with no findings is not a problem", () => {
    expect(reportHasProblems(doctor, [], "symlink", "darwin")).toBe(false);
  });

  test("a check finding is a problem", () => {
    const findings: CheckFinding[] = [{ kind: "inbox-nonempty", detail: "1 skill" }];
    expect(reportHasProblems(doctor, findings, "symlink", "linux")).toBe(true);
  });

  test("symlink mode without symlink support is a problem", () => {
    expect(reportHasProblems({ ...doctor, symlinkSupported: false }, [], "symlink", "linux")).toBe(
      true,
    );
  });

  test("a darwin launch agent installed but not loaded is a problem", () => {
    expect(reportHasProblems({ ...doctor, plistLoaded: false }, [], "symlink", "darwin")).toBe(
      true,
    );
  });

  test("the unloaded-agent check is darwin-only", () => {
    expect(reportHasProblems({ ...doctor, plistLoaded: false }, [], "symlink", "linux")).toBe(
      false,
    );
  });
});

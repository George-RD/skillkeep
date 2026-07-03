import { describe, expect, test } from "bun:test";
import type { SkillReadEvent } from "../src/skill-reads.ts";
import { claudeSkillReads, ompSkillReads } from "../src/skill-reads.ts";
import { tmpDir, writeFixture } from "./helpers.ts";

/** Drain a skill-reads generator into an array (helpers.ts's `collect` is typed for the token-usage ParseYield shape). */
async function collectSkillReads(
  gen: AsyncIterable<{ event: SkillReadEvent | null; nextOffset: number }>,
): Promise<{ event: SkillReadEvent | null; nextOffset: number }[]> {
  const out: { event: SkillReadEvent | null; nextOffset: number }[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

// Redacted, structurally-real lines copied from a live
// ~/.claude/projects/<slug>/<session>.jsonl (see FORMATS.md, "Skill-read
// attribution — claude"). Line 1 is a `Skill` tool_use naming the skill
// directly; line 2 is a `Read` of a literal skills/<name>/SKILL.md path;
// line 3 is a `Read` of an ordinary file (no attribution); line 4 is a
// non-assistant ("user") entry.
const CLAUDE_FIXTURE = [
  '{"type":"assistant","uuid":"a1","parentUuid":"p0","requestId":"req_abc","sessionId":"sess-claude-1","timestamp":"2026-05-21T14:08:40.724Z","cwd":"/Users/george/repos/zzz-skillkeep-fixture","userType":"external","message":{"id":"msg_01AAA","type":"message","role":"assistant","model":"claude-opus-4-6","content":[{"type":"tool_use","id":"toolu_01G9fDS","name":"Skill","input":{"skill":"find-skills","args":"nixos flake"}}]}}',
  '{"type":"assistant","uuid":"a2","parentUuid":"a1","requestId":"req_def","sessionId":"sess-claude-1","timestamp":"2026-05-21T14:10:00.000Z","message":{"id":"msg_01BBB","type":"message","role":"assistant","model":"claude-opus-4-6","content":[{"type":"tool_use","id":"toolu_014J3xy","name":"Read","input":{"file_path":"/Users/george/repos/oracle-server/.claude/skills/hermes-monitor/SKILL.md","offset":55,"limit":25}}]}}',
  '{"type":"assistant","uuid":"a3","parentUuid":"a2","requestId":"req_ghi","sessionId":"sess-claude-1","timestamp":"2026-05-21T14:11:00.000Z","message":{"id":"msg_01CCC","type":"message","role":"assistant","model":"claude-opus-4-6","content":[{"type":"tool_use","id":"toolu_02","name":"Read","input":{"file_path":"/Users/george/repos/zzz-skillkeep-fixture/README.md"}}]}}',
  '{"type":"user","uuid":"u1","sessionId":"sess-claude-1","timestamp":"2026-05-21T14:12:00.000Z","message":{"role":"user","content":"redacted"}}',
].join("\n");

// Redacted, structurally-real lines copied from a live
// ~/.omp/agent/sessions/<cwd-slug>/<session-id>/<Name>.jsonl (see
// FORMATS.md, "Skill-read attribution — omp"). Line 1 is a `read` toolCall
// with a bare `skill://<Display Name>` URI (the internal skill-reference
// convention); line 2 is a `read` toolCall of the same URI convention's
// `skill://<name>/SKILL.md` sub-path form (reads the raw file rather than
// the rendered instructions) — must normalize to the same skill as the bare
// form; line 3 is a `read` toolCall of a literal managed-skills/<name>/SKILL.md
// path; line 4 is a `read` of an ordinary file (no attribution); line 5 is a
// non-assistant ("user") message.
const OMP_FIXTURE = [
  '{"type":"message","id":"a63ba2a4","parentId":"9711d37f","timestamp":"2026-06-17T18:40:24.935Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"call_1","name":"read","arguments":{"_i":"Reading dispatch skill","path":"skill://Force Dispatch Patterns"}}],"api":"openai-responses","provider":"openai","model":"gpt-5.4"}}',
  '{"type":"message","id":"b1c2d3e4","parentId":"a63ba2a4","timestamp":"2026-06-17T18:40:30.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"call_1b","name":"read","arguments":{"_i":"Reading skill file","path":"skill://loopcontext/SKILL.md"}}],"api":"openai-responses","provider":"openai","model":"gpt-5.4"}}',
  '{"type":"message","id":"349e9cbe","parentId":"b1c2d3e4","timestamp":"2026-06-17T18:41:00.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"call_2","name":"read","arguments":{"_i":"Reading skill","path":"/Users/george/.omp/agent/managed-skills/rtk/SKILL.md"}}],"api":"anthropic-messages","provider":"kimi-code","model":"kimi-for-coding"}}',
  '{"type":"message","id":"c3818dec","parentId":"349e9cbe","timestamp":"2026-06-17T18:42:00.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"call_3","name":"read","arguments":{"_i":"Reading file","path":"/Users/george/repos/zzz-fixture/README.md"}}],"api":"anthropic-messages","provider":"kimi-code","model":"kimi-for-coding"}}',
  '{"type":"message","id":"d4929edd","parentId":"c3818dec","timestamp":"2026-06-17T18:43:00.000Z","message":{"role":"user","content":"redacted"}}',
].join("\n");

describe("claudeSkillReads", () => {
  test("attributes a Skill tool_use and a Read of a skills/<name>/SKILL.md path; ignores ordinary reads and non-assistant lines", async () => {
    const dir = tmpDir();
    const slug = "-Users-george-repos-zzz-skillkeep-fixture";
    const file = writeFixture(dir, `.claude/projects/${slug}/conv.jsonl`, CLAUDE_FIXTURE);

    const results = await collectSkillReads(claudeSkillReads(file, 0));
    const events = results.map((r) => r.event).filter((e): e is SkillReadEvent => e !== null);

    expect(results).toHaveLength(4);
    expect(results[2]?.event).toBeNull(); // ordinary Read, no attribution
    expect(results[3]?.event).toBeNull(); // non-assistant line
    expect(events).toHaveLength(2);

    expect(events[0]).toEqual({
      ts: Date.parse("2026-05-21T14:08:40.724Z"),
      client: "claude",
      skill: "find-skills",
      repo: slug,
      model: "claude-opus-4-6",
      sessionId: "sess-claude-1",
    });
    expect(events[1]).toEqual({
      ts: Date.parse("2026-05-21T14:10:00.000Z"),
      client: "claude",
      skill: "hermes-monitor",
      repo: slug,
      model: "claude-opus-4-6",
      sessionId: "sess-claude-1",
    });
  });

  test("resuming from a persisted offset only re-reads new records", async () => {
    const dir = tmpDir();
    const file = writeFixture(dir, ".claude/projects/-fixture/conv.jsonl", CLAUDE_FIXTURE);
    const first = await collectSkillReads(claudeSkillReads(file, 0));
    const cursor = first[0]?.nextOffset ?? 0;

    const resumed = await collectSkillReads(claudeSkillReads(file, cursor));
    expect(resumed).toHaveLength(first.length - 1);
  });
});

describe("ompSkillReads", () => {
  test("attributes a skill:// URI read (bare and /SKILL.md-suffixed) and a managed-skills/<name>/SKILL.md path read; ignores ordinary reads and non-assistant messages", async () => {
    const dir = tmpDir();
    const slug = "-repos-zzz-fixture";
    const sessionId = "2026-06-17T18-40-24-fixture-session";
    const file = writeFixture(
      dir,
      `omp/agent/sessions/${slug}/${sessionId}/Fixture.jsonl`,
      OMP_FIXTURE,
    );

    const results = await collectSkillReads(ompSkillReads(file, 0));
    const events = results.map((r) => r.event).filter((e): e is SkillReadEvent => e !== null);

    expect(results).toHaveLength(5);
    expect(results[3]?.event).toBeNull(); // ordinary file read, no attribution
    expect(results[4]?.event).toBeNull(); // user message
    expect(events).toHaveLength(3);

    expect(events[0]).toEqual({
      ts: Date.parse("2026-06-17T18:40:24.935Z"),
      client: "omp",
      skill: "Force Dispatch Patterns",
      repo: slug,
      model: "gpt-5.4",
      sessionId,
    });
    expect(events[1]).toEqual({
      ts: Date.parse("2026-06-17T18:40:30.000Z"),
      client: "omp",
      skill: "loopcontext", // the /SKILL.md sub-path form, normalized to the bare skill name
      repo: slug,
      model: "gpt-5.4",
      sessionId,
    });
    expect(events[2]).toEqual({
      ts: Date.parse("2026-06-17T18:41:00.000Z"),
      client: "omp",
      skill: "rtk",
      repo: slug,
      model: "kimi-for-coding",
      sessionId,
    });
  });

  test("resuming from a persisted offset only re-reads new records", async () => {
    const dir = tmpDir();
    const file = writeFixture(dir, "omp/agent/sessions/-fixture/sess/Fixture.jsonl", OMP_FIXTURE);
    const first = await collectSkillReads(ompSkillReads(file, 0));
    const cursor = first[0]?.nextOffset ?? 0;

    const resumed = await collectSkillReads(ompSkillReads(file, cursor));
    expect(resumed).toHaveLength(first.length - 1);
  });
});

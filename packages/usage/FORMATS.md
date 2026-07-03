# Log formats

Ground-truth notes on the on-disk transcript/log shapes `@skillkeep/usage`
parses, taken from real files on a development machine wherever noted. If a
real local log ever disagrees with a description here, the real sample wins —
update this file and the parser together.

## claude — token usage

File: `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` (one file per
conversation; `<encoded-cwd>` is the cwd with `/` replaced by `-`, decoded by
`repoFromSlug`). Glob: `<root>/<encoded-cwd>/**/*.jsonl`.

One JSON object per line. A usage-bearing line has `type: "assistant"` and
carries an anthropic-shaped `message`:

```json
{
  "type": "assistant",
  "sessionId": "...",
  "timestamp": "2026-05-21T14:08:40.724Z",
  "message": {
    "id": "msg_01AAA",
    "model": "claude-opus-4-6",
    "usage": {
      "input_tokens": 3,
      "output_tokens": 480,
      "cache_creation_input_tokens": 31429,
      "cache_read_input_tokens": 0
    }
  }
}
```

Non-assistant lines (`type: "user"`, hook-result attachments, etc.) carry no
usage and parse to `null`. `costMicroUsd` is always `null` — Claude transcripts
never report cost; the daemon prices it from `lookupPrice(model)`.

## codex — token usage

File: `<CODEX_HOME>/sessions/**/rollout-*.jsonl` (default `~/.codex/sessions`).
Rollouts report **cumulative** per-session totals on every `token_count`
event (not deltas) — see `codex.ts`'s `CodexSource` doc comment for the
replay-from-0 strategy this requires on a cold resume.

## opencode — token usage

File: `<XDG_DATA_HOME>/opencode/storage/message/**/*.json` (default
`~/.local/share/opencode`), one JSON object per file (not JSONL). `cost` is
opencode's own authoritative dollar figure. A SQLite `opencode.db` may exist
alongside the file store on newer opencode versions; ingestion of that store
is **deferred** — v1 only reads the per-message JSON files.

## gemini — token usage

File: `<GEMINI_CLI_HOME>/tmp/**/*.{json,jsonl}` (default `~/.gemini`). Real
session logs observed on this machine
(`~/.gemini/tmp/<project>/chats/session-*.jsonl`) are patch-based ($set/$unset
message lists) and carry **no token-usage fields at all** — they always parse
to `null`. The per-record `usageMetadata`/`usage`/`tokenUsage` shape this
parser also supports is a best-effort fallback for other Gemini loggers; its
test fixture is synthetic (no such real file was found on this machine).

## omp — token usage

File: `~/.omp/agent/sessions/<cwd-slug>/<session-id>/**/*.jsonl` (also, for a
session's top-level/root transcript, directly at
`~/.omp/agent/sessions/<cwd-slug>/<session-id>.jsonl`). One JSON object per
line; a usage-bearing line has `type: "message"` and `message.role ===
"assistant"`:

```json
{
  "type": "message",
  "timestamp": "2026-07-02T15:49:49.973Z",
  "message": {
    "role": "assistant",
    "model": "kimi-for-coding",
    "usage": {
      "input": 9377, "output": 192, "cacheRead": 4352, "cacheWrite": 0,
      "cost": { "total": 0.0025 }
    }
  }
}
```

Note the camelCase `input`/`output`/`cacheRead`/`cacheWrite` field names
(unlike claude/codex's `*_tokens` convention). `usage.cost.total` is OMP's own
computed dollar figure and is authoritative when present.

## Skill-read attribution — claude

Two real shapes were found by grepping `~/.claude/projects/**/*.jsonl` for
`SKILL.md`- and `Skill`-tool records on this machine, both on `type:
"assistant"` lines with a `tool_use` content block:

**A dedicated `Skill` tool**, which names the skill directly — no path
matching needed:

```json
{
  "type": "tool_use",
  "name": "Skill",
  "input": { "skill": "find-skills", "args": "nixos flake nixos-rebuild deploy" }
}
```

**A `Read` of the skill's `SKILL.md` file**, attributed via
`attributedSkill()`'s path match (`.../skills/<name>/SKILL.md` or
`.../managed-skills/<name>/SKILL.md`):

```json
{
  "type": "tool_use",
  "name": "Read",
  "input": {
    "file_path": "/Users/george/repos/oracle-server/.claude/skills/hermes-monitor/SKILL.md",
    "offset": 55,
    "limit": 25
  }
}
```

`skill-reads.ts` checks `Skill` first (exact name, no ambiguity), then falls
back to `Read` + `attributedSkill(file_path)`.

## Skill-read attribution — omp

Two real shapes were found by grepping `~/.omp/agent/sessions/**/*.jsonl` for
`SKILL.md`/`skill://` on this machine (including this very milestone's own
session transcript), both `type: "message"` lines with `message.role ===
"assistant"` and a `toolCall` content block named `read`:

**A `skill://<Display Name>` URI** — OMP's internal skill-reference
convention (see the harness's own "Internal URLs" documentation: `skill://
<name>` resolves skill instructions). The name is the agent-facing display
name, NOT a slug, and carries no `/SKILL.md` suffix, so `attributedSkill()`'s
path-suffix regex does not match it:

```json
{
  "type": "toolCall",
  "name": "read",
  "arguments": { "path": "skill://Force Dispatch Patterns" }
}
```

**A literal filesystem path to a managed skill's `SKILL.md`**, attributed via
`attributedSkill()`:

```json
{
  "type": "toolCall",
  "name": "read",
  "arguments": { "path": "/Users/george/.omp/agent/managed-skills/rtk/SKILL.md" }
}
```

`skill-reads.ts` tries `attributedSkill(path)` first (it also matches a
`skill://.../skills/<name>/SKILL.md`-shaped URI, a third form `attribution.ts`'s
own test suite documents), and only falls back to taking the raw
`skill://<name>` suffix verbatim when that doesn't match.

Both attribution paths are necessarily best-effort: a plain-file `Read` of some
*other* project's own `skills/<name>/SKILL.md` (e.g. while exploring a
connector's source, not actually invoking the skill) matches the same regex
and is indistinguishable from a real skill invocation. This is
`attribution.ts`'s documented, deliberate trade-off, not a bug introduced
here.

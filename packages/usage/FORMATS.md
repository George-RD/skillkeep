# @skillkeep/usage — observed log formats

Authoritative source-of-truth for every field this package parses. Each client
section states plainly which facts were **verified against a real local file
on this machine** (2026-07-03, darwin) and which were **synthesised** from the
tokscale reference (github.com/junhoyeo/tokscale, MIT, v4.0.9) because no real
sample existed here.

## claude — VERIFIED against a real file

Sample: `~/.claude/projects/-Users-george-repos-cairn/<session>.jsonl`
(assistant entry with a populated `usage` block).

- Root: `~/.claude/projects`; glob `**/*.jsonl`.
- Repo: the directory immediately under `projects/` is an encoded absolute cwd
  (dashes replacing `/`, e.g. `-Users-george-repos-cairn`). Decode is naive
  (`decodeCwdSlug`) and lossy for repo names containing literal dashes; we
  check the decoded path exists on disk and fall back to the raw slug
  otherwise (`repoFromSlug`). The real entry also carries a `cwd` field that
  agrees with the decode, but the parser derives repo from the path alone
  (the `parse(file, offset)` contract only receives the file path).
- One JSON object per line. Fields consumed from an assistant entry:
  - `type: "assistant"`, top-level `timestamp` (ISO), `sessionId`
  - `message.model`, `message.id` (-> `messageId`)
  - `message.usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}`
  - Dedupe identity per tokscale convention: `requestId + "." + message.id`
    when both present (both were present in the real sample); cursors
    (`nextOffset`) are what actually prevent double-counting, this identity is
    informational only and surfaces as `messageId`.
- `costMicroUsd` is always `null` — Claude Code logs do not report cost; the
  daemon applies `pricing.ts` later.
- Non-assistant entries (user turns, etc.) yield `event: null`.

## codex — VERIFIED against a real file (disagrees with the tokscale-derived assignment brief)

Sample: `~/.codex/sessions/2025/10/03/rollout-2025-10-03T16-08-58-<uuid>.jsonl`.

- Root: `$CODEX_HOME` (fallback `~/.codex`) + `/sessions`; glob `**/*.jsonl`.
- **Observed reality**: `model` and `cwd` do NOT live on the `token_count`
  entry. They live on separate entries:
  - `payload.type === "session_meta"` carries `payload.cwd` (and `payload.id`,
    the session uuid).
  - `payload.type === "message" | "reasoning" | ...` carries `payload.model`
    (observed value: `"gpt-5-codex"`).
  - `payload.type === "token_count"` carries `payload.info.total_token_usage`
    as **cumulative-since-session-start** totals
    (`input_tokens`, `cached_input_tokens`, `output_tokens`,
    `reasoning_output_tokens`, `total_tokens`) — no model/cwd fields at all.
- Consequence: the parser tracks last-seen `model` and `cwd` per session id
  (updated from whichever entry carries them) and last-seen cumulative totals,
  emitting only the **positive delta** on each `token_count` entry. This state
  lives on the `UsageSource` instance (`seenTotals` / `seenModel` / `seenCwd`
  maps) and persists across `parse()` calls, since the daemon keeps one
  instance alive across scans. A `token_count` whose totals didn't grow yields
  `event: null`.
- Session id: `payload.session_id` when an entry carries one, else the uuid
  extracted from the rollout filename (`rollout-<timestamp>-<uuid>.jsonl`),
  which matches `session_meta.payload.id` in the real sample.
- Field mapping: `input` <- `input_tokens` delta, `output` <- `output_tokens`
  delta (this already includes `reasoning_output_tokens`, which Codex does not
  break out separately in `UsageEvent`), `cacheRead` <- `cached_input_tokens`
  delta, `cacheWrite` <- `0` (Codex never reports a separate cache-write
  figure). `costMicroUsd` is always `null` (Codex logs no cost; rate-limit
  percentages are not a cost figure).

## opencode — structure VERIFIED against `~/.local/share/opencode/opencode.db` (`message` table); file-based fixture is SYNTHETIC

This machine's real opencode install stores messages in SQLite
(`opencode.db`, table `message(id, session_id, time_created, time_updated,
data)`) — the file-based `storage/message/**/*.json` tree this package targets
does not exist here (only `storage/session_diff/*.json`, which are all empty
`[]`). A live row's `data` JSON (redacted) was read directly and IS the basis
for this parser and its test fixture:

```json
{
  "parentID": "msg_...",
  "role": "assistant",
  "path": { "cwd": "...", "root": "/Users/george/repos/road-to-mordor" },
  "cost": 0,
  "tokens": { "input": 0, "output": 0, "reasoning": 0, "cache": { "read": 0, "write": 0 } },
  "modelID": "MiniMax-M2.7-highspeed",
  "providerID": "minimax-coding-plan",
  "time": { "created": 1775733743035, "completed": 1775733750804 }
}
```

- Root: `$XDG_DATA_HOME` (fallback `~/.local/share`) + `/opencode/storage/message`;
  glob `**/*.json`. One JSON object per FILE (not per line) — `parse` yields at
  most one event with `nextOffset = file size` (whole-file granularity; the
  format has no internal offsets).
- Per the assignment's documented file-format contract (not present as a file
  on this machine, so this part is **synthesised**, though every field name and
  nesting level matches the real DB row above): the object additionally
  carries `sessionID` at the top level (a DB column in the SQLite form, an
  object field in the file form).
- Field mapping: `model` <- `modelID`, `repo` <- `path.root`, `input`/`output`
  <- `tokens.input`/`tokens.output`, `cacheRead`/`cacheWrite` <-
  `tokens.cache.read`/`tokens.cache.write`, `sessionId` <- `sessionID`.
- `cost` is a computed USD float and is authoritative:
  `costMicroUsd = Math.round(cost * 1_000_000)`.
- `ts` <- `time.created` (fallback `time.updated`, fallback the file's mtime —
  the assignment's documented schema omits a timestamp field entirely; `time`
  was only confirmed present via the real DB row).

## gemini — real file location VERIFIED; token-usage fields are SYNTHETIC (none exist in any real sample on this machine)

Real file found: `~/.gemini/tmp/orcaslicer/chats/session-2026-06-18T10-05-<id>.jsonl`.
Its actual shape, read directly:

```
{"sessionId":"...","projectHash":"...","startTime":"...","lastUpdated":"...","kind":"main"}
{"$set":{"messages":[{"id":"...","timestamp":"...","type":"user","content":[...]}]}}
{"$unset":{...}}
```

This is a **patch-based** transcript log (an initial metadata line, then
`$set`/`$unset` diff operations against an in-memory message list) — it
carries no `model`, no token-usage, and no cost field anywhere in any of the
1,013 files under `~/.gemini/tmp` that were grepped for token/usage keywords
(zero hits). Real Gemini-CLI logs therefore always yield `event: null` from
this parser.

To still cover Gemini per the assignment (some Gemini API loggers do emit
per-record usage), the parser additionally recognises a simple, best-effort
per-line/per-file shape used elsewhere in the ecosystem: a JSON object with
`model`, `sessionId`, `timestamp`, and a `usageMetadata` (or `usage` /
`tokenUsage`) block carrying Google Generative API-style fields
(`promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`). **This
shape, and the test fixture built against it, is SYNTHETIC** — it is not
observed on this machine.

- Root: `$GEMINI_CLI_HOME` (fallback `~/.gemini`) + `/tmp`; glob
  `**/*.json` and `**/*.jsonl` (both extensions handled: `.jsonl` is read
  line-by-line, `.json` as one whole-file object).
- `repo` is always `null` — no sample (real or documented) carries a cwd/repo
  field.
- `costMicroUsd` is always `null`.

## omp — VERIFIED against real files (NOT covered by tokscale)

Sample: `~/.omp/agent/sessions/-repos-agent-skills/<session>/<Name>.jsonl`,
an assistant `type:"message"` entry with a populated `usage` block, read
directly from this machine's real session history.

- Root: `~/.omp/agent/sessions`; glob `**/*.jsonl` (matches both the main
  transcript `<Name>.jsonl` and any nested transcripts, e.g. `__advisor.jsonl`
  or sub-agent jsonl under nested dirs — non-usage entries there simply yield
  `null`). Note `.read.log` / `.shake.log` files in the same session directory
  are NOT JSONL (they are raw tool-output text) and are excluded by the glob.
- Path structure: `<root>/<cwd-slug>/<session-id>/...`. `repo` is
  `repoFromSlug(<cwd-slug>)` (same naive-decode + disk-existence-fallback rule
  as claude, e.g. `-repos-agent-skills` decodes to `/repos/agent/skills`,
  which does not exist, so the raw slug `-repos-agent-skills` is reported).
  `sessionId` is the `<session-id>` directory name verbatim.
- One JSON object per line. An entry with `type: "message"` and
  `message.role === "assistant"` carries usage (real shape observed):

  ```json
  {
    "type": "message",
    "id": "c3818dec",
    "timestamp": "2026-07-02T15:49:49.973Z",
    "message": {
      "role": "assistant",
      "api": "anthropic-messages",
      "provider": "kimi-code",
      "model": "kimi-for-coding",
      "usage": {
        "input": 9377,
        "output": 192,
        "cacheRead": 4352,
        "cacheWrite": 0,
        "totalTokens": 13921,
        "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0 }
      }
    }
  }
  ```

  Field names are `input`/`output`/`cacheRead`/`cacheWrite` (camelCase, NOT the
  `*_tokens` convention used by claude/codex). `usage.cost` is a nested object
  of already-computed USD floats; `cost.total` is authoritative ->
  `costMicroUsd = Math.round(cost.total * 1_000_000)`.
  Non-`message` entries (`session`, `title`, `model_change`,
  `thinking_level_change`, `session_init`, `custom`, `custom_message`,
  `compaction`) and non-assistant `message` entries (user turns) yield
  `event: null`.
- `messageId` <- the entry's top-level `id`.

## Skill-usage attribution (`attribution.ts`)

Deterministic, format-agnostic: a read of any path matching
`/(?:skills|managed-skills)\/([^/]+)\/SKILL\.md$/` attributes one use of skill
`$1`. Per the plan, v1 attribution is wired into the daemon only for clients
whose transcripts record file reads (claude, omp); other clients show "n/a"
rather than an estimate. This package exposes the pure matcher only — the
per-client "which reads happened" extraction is the daemon's job.

## Pricing (`pricing.ts` / `prices.snapshot.json`)

`prices.snapshot.json` is a hand-written, realistic offline snapshot (NOT
fetched from LiteLLM over the network — this package performs no network I/O)
covering `claude-3-5-sonnet-20241022`, `claude-opus-4`, `gpt-4o`,
`gpt-4o-mini`, `gemini-1.5-pro`. `lookupPrice` reads it (or an injected table)
and returns `null` for unknown models — cost is never guessed. `mergePrices`
is a pure `{ ...base, ...cached }` merge; fetching the live LiteLLM table and
maintaining the 24h on-disk cache is the daemon's job (M1/M4 integration), not
this package's.

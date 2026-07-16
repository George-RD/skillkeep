# Design Description — Iteration 2 Full Page

## Rejected concepts (carried from iteration 1)

- **Night Survey Desk** — dark charcoal ops console with copper ticks and pure monospace hierarchy; precision wins, garden becomes labels only, risks cold-dashboard sameness.
- **Specimen Folio** — Japanese-editorial extreme whitespace with museum specimen cards and hairline rules; calm and distinctive, but too sparse and slow for dense triage and budget decisions.

## Refinement mandate (iteration 2)

**Direction: REFINE — keep Trellis Ledger.** Design quality and originality scored 8/8; the visual language, typography, lenses, detail navigation, and unified workbench stand. This iteration does **not** pivot. It redesigns what failed in craft and functionality while carrying forward every surface that worked.

**Failures this description must make impossible to rebuild incorrectly:**

1. **Seedlings signal ↔ triage queue desync** — shell showed "seedlings 0" while Rot said "65 awaiting triage," and the triage surface opened empty ("1 of 0" / "Triage Inbox Clear"). The waiting count, the rot inbox card, and the triage queue MUST be one shared truth; empty-clear and failed-to-load MUST look different.
2. **Deploy as inert status chip** — "deploy ready" looked pressable and did nothing; no dry-run surface existed. Deploy needs an unmistakable **action entry** and a complete review instrument (Z7).
3. **Irreversible decisions** — tier change, rot resolve, and triage committed with no undo. Every state-changing action needs a designed reversibility choreography.
4. **Long skill names crushed mid-word** — ledger rows truncated identifiers into illegible stubs (`add-functiona…`). Row geometry must protect the full name as the primary readable object.

---

## Creative Direction

**Winning concept: Trellis Ledger** (unchanged root)

Aesthetic root: Swiss-editorial botanical instrument — the calm of a field notebook crossed with the decisiveness of a surveyor's ledger. Warm, considered surfaces (sandstone field, forest ink, terracotta action) hold a dense, keyboard-friendly workbench where every skill is an addressable row carrying tier, cost, and exposure like columns in a living ledger.

How it resolves the tension *"editorial garden that reads like a precision instrument"*: the garden lives in material and type — warm paper-like ground, a high-contrast display serif for human-scale headings and skill names, solid double-rule plates that feel tactile rather than glassy. The instrument lives in structure and density — monospace for paths, tokens, and hashes; always-visible tier marks; inline cost/exposure; shallow decide loops with **visible consequence before commit and generous undo after**. The botanical metaphor is never wallpaper: rooted / climbing / pruned are visual states of the same stem-mark motif, growth motion only for an active sweep, decay motion only for a prune.

Signature motif: the **ledger plate** — a solid surface edged with a double rule (outer hairline, inner heavier rule) that frames every instrument zone; paired with the **tier stem** — a short vertical mark beside each skill that reads solid (rooted), half-height (climbing), or dashed/faded (pruned). One motif family, one meaning everywhere.

**Iteration-2 motif extensions (same family, new jobs):**

- **Undo ribbon** — a temporary ledger strip that docks to the bottom edge of the active plate (or the viewport on mobile): same double-rule language, forest ink for restore, never a floating toast that could be mistaken for a browser notification. One motif: temporary, reversible, instrument-grade.
- **Action signal vs status signal** — shell chips that open a mode use a **filled terracotta or forest stem tick on the leading edge** plus an action verb ("Review deploy", "Triage 65"). Pure status (live/offline) stays a disk + label without the action stem. Color alone never marks interactivity.
- **Name column priority** — the skill name is a protected column that wraps or expands before it truncates; ellipsis is a last resort and only after secondary columns have already compressed.

This MUST feel like tending a living garden that happens to be an operations console — calm to look at, fast and exacting to drive. NOT a purple-tab SaaS dashboard, NOT a plant-care screensaver, NOT an analytics silo with charts divorced from decisions.

References in spirit (not to copy): Linear's dense calm triage; Mail/Things inbox-as-queue with generous undo; a craft bookshop ledger; the trellis rebrand DNA (warm serif + sandstone/forest/terracotta + tactile plates) refined into a single workbench rather than route tabs.

---

## Layout

### Overall geometry (desktop 1440)

A single persistent workbench fills the viewport. No peer top-level tab strip of Health / Detect / Registry / Sync / Usage / Settings.

**Shell (top band, ~56–64px tall):**

- Left: wordmark "skillkeep" in the display serif, quiet weight; adjacent a compact daemon-health tick (filled disk + short label: live / degraded / offline) and mode chip (agent | hub). Health and mode are **status only** — disk + label, no action stem, not mistaken for destinations.
- Center-left: **context-budget readout** — a stable framed counter of resident tokens (rooted set), so digit changes never shift surrounding layout. Tabular figures. When a tier control is open with a pending delta, a small secondary figure appears beside the total showing the previewed delta ("−840") without reflowing the shell.
- Right cluster of **action signals** (not peer destinations), each with a leading stem tick when it opens a mode:
  - **Seedlings** — always shows the **true awaiting count** (same number as Rot inbox and triage queue). When count > 0: terracotta stem + "Triage N" (verb + number). When count = 0: quiet outline + "Inbox clear" (not a fake zero while work waits). One click opens Z4 with that same N populated.
  - **Deploy** — never a passive "deploy ready" status chip. Label reads the **job**: "Review deploy" when there is anything to preview, "Deploy · idle" when clean, "Deploy · drift N" when drift exists, "Deploy · error" on failure. Leading forest stem tick when review is available. One click **always** opens the full Deployment review surface (Z7) — even when idle (shows "Nothing to sync" empty state of that instrument, not a no-op).
  - **Rot** — count with amber/brick outline when > 0; opens or focuses the Rot feed (Z8).
- Far right: subdued search glyph and settings gear — subordinate chrome.

**Primary zone (the Garden, ~70–75% of remaining width):**

- Dominates the eye. A continuous master list of skill objects as ledger rows inside one large plate.
- Above the list: a thin control rail — scope filter chips, tier filter (all / rooted / climbing / pruned), sort, and the Cost/Exposure lens toggle. These re-prioritize; they do not navigate away.
- List rows are dense but breathable. **Column priority (left → right, never invert):**
  1. Tier stem (fixed narrow)
  2. **Skill name** (serif) — flexible primary column; may wrap to a second line for long identifiers; never mid-word ellipsis while scope/cost/actions still have room
  3. Scope chip (may compress to icon+initials only under extreme width pressure)
  4. Path / one-line description (monospace or quiet sans) — first to shorten; full text on hover/focus tooltip or in detail
  5. Usage/cost figure (fixed tabular width)
  6. Exposure badge (when lens active)
  7. Tier quick actions `r` / `c` / `p` (fixed)

**Secondary column (right ~25–30%):**

- A contextual side panel that changes with mode. Default: **Rot/Recommendations feed**. When triage is active: triage decision panel (or triage may take a focused overlay — see Job 1). When deploy is open: **full dry-run preview** occupies this column (or a widened review plate). When a skill is selected for detail: skill detail/editor.

**Negative space logic:** the Garden list is the only dense field. The shell and side panel hold more air. Never a 3-up stat-card hero grid. Never equal-weight peer destinations.

**Undo ribbon dock:** a reserved horizontal band that appears **above the bottom edge of the viewport** (or bottom of the active full-sheet on mobile), spanning the workbench width with modest side inset so it reads as part of the instrument, not OS chrome. Only present during the undo window.

### Mobile (390)

- Shell collapses to: wordmark + health tick left; **Triage N** + search right; budget readout as a second thin strip under the shell. Deploy entry lives as a clear "Review deploy" control in that second strip or as the first item when the operator opens a compact "Modes" sheet — never hidden behind a status-looking chip.
- Garden becomes full-width stacked rows. Name wraps fully; path hides until detail; tier stem, cost, and exposure remain visible.
- Contextual modes (triage, deploy preview, rot, settings, detail) open as full-sheet overlays that slide up, with a clear dismiss and the undo ribbon docked to the sheet bottom.
- No horizontal overflow; primary actions stay within thumb reach.

---

## Typography

**Display / human labels:** a high-contrast oldstyle or soft-modern serif (Fraunces-class or equivalent) for: wordmark, page/mode titles ("Garden", "Seedlings", "Deploy review"), skill names in the list, and empty-state headlines. Confident, editorial, slightly warm.

**Interface / body:** a humanist sans for controls, chips, body copy, recommendation prose, settings labels, undo ribbon copy. Comfortable reading size, roughly 1.5 leading, measure kept short in the side panel.

**Instrument / data:** a clear monospace for paths, token counts, cost figures, drift hashes, timestamps, and any identifier that is not the human skill name. Slightly smaller than body so data densifies without shouting.

**Scale relationships:**

- Mode title: ~1.6–1.8× body, serif.
- Skill name in list: ~1.1–1.15× body, serif, medium weight — **protected; wrapping preferred to ellipsis**.
- Path and meta: ~0.85× body, monospace, quieter color — first to truncate.
- Budget readout number: tabular figures, monospace or sans with fixed figure width.
- Empty/error headlines: serif at ~1.4× body — calm for empty success, firmer for error (same size, different ink weight and stem mark).
- Undo ribbon: sans at body size; skill name fragment in serif medium so the restored object is named clearly.

Hierarchy does the work: the eye hits skill names and tier stems first, then cost/exposure, then chrome.

---

## Color

**Field:** warm ivory / sandstone paper (~#F5F0E8 range) as the global ground — never pure white, never cool slate-gray SaaS canvas.

**Ink:** deep forest-near-black for primary text (~#1C2B24 range); secondary text in softened olive-gray.

**Plate surfaces:** slightly warmer or slightly cooler off-white than the field, with the double-rule edge in muted earth (warm gray-brown), not pure black.

**Accent — action / keep / rooted energy:** terracotta / clay red-orange, used sparingly for primary actions (Keep, Commit deploy, primary CTA), for the rooted tier stem fill, and for the seedlings **action** signal when count > 0. Not purple. Not indigo SaaS.

**Accent — growth / health / active:** deep forest green for healthy ticks, active exposure, sync-ok, climbing tier stem, and the deploy **action** stem when review is available.

**Accent — caution / rot / drift:** muted amber for warnings and drift; a restrained brick for destructive/discard and offline health — never screaming neon red panels.

**Exposure verdicts (always paired with shape/label, never color alone):**

- Active: solid forest pill + "active"
- Stale: amber outline pill + "stale"
- Dormant: faded ink outline + "dormant"

**Action vs status (shell):**

- Action signals: stem tick + verb label + optional count; pressable plate feel (subtle press offset).
- Status signals: disk or quiet chip; no stem tick; no verb.

**De-emphasis under Cost lens:** dormant/stale rows desaturate and lighten; high cost-per-use rows keep full ink weight so the eye finds expensive underperformers.

**System states:**

- Genuine empty success: forest stem whisper + calm serif headline.
- Loading: muted ink skeleton lines (no color flash).
- Error / failed load: brick stem mark + plain language + retry.
- Offline: brick health disk + banner under shell.

**No** gradient-blob/aurora backgrounds, glassmorphism, purple→blue gradients, or neon-on-charcoal template looks.

Atmospheric effect: the field should feel like printed paper under soft daylight — calm temperature, no vignette gimmicks, optional barely-perceptible paper grain only if it stays below "filter" threshold.

---

## Spacing & Rhythm

- **Shell:** compact, instrument-tight; status and action chips sit with small gaps so the band reads as one instrument strip. Action signals slightly more horizontal padding than pure status so they read as pressable without shouting.
- **Garden list:** tight internal row breathing room (comfortable click target, not sparse); clear hairline separators between rows OR alternating barely-warmer row fields — not heavy card chrome per row. Rows are ledger lines, not a card soup. When a name wraps to two lines, row height grows by one line only — no multi-paragraph sprawl.
- **Between plate zones:** generous air — at least 2× the internal row gap — so the side panel and Garden read as two instruments on one desk, not one crowded sheet.
- **Side panel sections:** stacked with medium vertical rhythm; recommendation items denser than section headers.
- **Triage focused mode:** more vertical breathing around the current seedling decision card; queue list below stays dense.
- **Deploy review:** section headers (Will root / Will prune / Drift) with medium air; change lines dense monospace rows; footer actions pinned with generous separation from the list so Commit is never ambiguous.
- **Undo ribbon:** compact height (~48–56px), full workbench width with side inset matching plate margins; appears with a short rise; does not cover primary decide buttons.
- **Mobile:** vertical stack with consistent section gaps; no horizontal scroll; primary decide buttons full-width or thumb-zone grouped.

Density variation is intentional: Garden = dense; modes that need judgment (triage decision, deploy preview) = more air around the decision.

---

## Motion

Motion encodes state only — never decorative loops.

- **Active sweep / scan:** a single slow growth pulse along the health tick or a thin progress rule under the shell — once per sweep, then still.
- **Keep / take root:** the new skill row inserts into the Garden with a brief upward settle (short ease-out); tier stem fills solid.
- **Prune / discard / rot resolve:** the row or finding compresses and fades (decay), then is gone; not a bounce, not confetti. Simultaneously the undo ribbon rises.
- **Tier change in situ:** after confirm (or immediate apply with undo — see Job 2), tier stem morphs solid ↔ half ↔ dashed over ~200–300ms; budget readout updates in place without layout shift.
- **Lens toggle:** list re-sorts/re-weights with a short cross-fade of row emphasis — no spinning loaders for instantaneous local reordering.
- **Undo ribbon:** slides up from the bottom dock (~200ms ease-out), holds for the undo window (~8 seconds, or until next unrelated action), then eases down. Pressing Undo restores with a reverse of the prior decay/settle (~250ms).
- **Deploy review open:** side panel (or sheet) cross-fades to the dry-run list; shell deploy signal gains a "previewing" quiet state. On commit: brief solid success flash on the review footer, shell returns to "Deploy · idle" / synced, confirmation line in the ribbon if useful (informational, not fake rollback).
- **Triage open when count > 0:** queue populates with a short stagger of row appearance (≤3 items animated, rest present) so the operator sees *work*, not a blank plate.

No count-up number animations. No looping botanical particles.

---

## Atmosphere

Material: honest solids and double rules — paper and ink, not glass and glow. Surfaces feel pressable (subtle press offset on primary buttons and action signals, not soft skeuomorphic pillows). Depth comes from layered plates and rules, not blur stacks.

Light quality: even, warm, daylight desk. Status color is pigment on paper, not LED neon.

Mood: confident curation. The operator should feel *I can see the whole garden and decide in three moves — and I can take it back if I was wrong* — not *I am browsing a dashboard* and not *I am afraid to click*.

---

## Opinion Statement

This product MUST feel like a **field ledger on a gardener's desk** — warm paper, sharp ink, every leaf tagged with real telemetry, every cut reversible while the ink is still wet — **not** a generic purple-tab SaaS console and **not** a decorative plant app. If a screen could be mistaken for either, it has failed. If a waiting inbox opens empty while a counter elsewhere says sixty-five, or a "ready" chip does nothing, the instrument has failed.

---

## Core task flows (design)

### Job 1 — Triage the inbox (seedlings)

**Single source of truth for "awaiting":** The shell seedlings action signal, the Rot "INBOX TRIAGE" card count, and the triage queue length are the **same number** at all times. If detection says 65 await, all three show 65. Never "seedlings 0" beside "65 skill(s) awaiting triage."

**Entry (two equal doors, one room):**

1. Shell action signal **"Triage N"** (N > 0) — one click/tap.
2. Rot feed card **"INBOX TRIAGE · N skill(s) awaiting triage"** with primary action **"Open triage"** (not a silent Resolve that empties a fake card). Resolve on this card **is** open-triage, not dismiss.

Both open the **same** Seedlings triage mode with the queue already loaded.

**When N = 0 for real:** shell reads "Inbox clear" (quiet). Rot does not show an inbox-triage card. Opening triage (if reachable) shows the genuine-empty state (below).

**Focused mode layout:** Garden dims slightly behind. Main zone becomes the **queue** of awaiting seedlings (populated list). Side panel (desktop) or bottom decision strip / sheet (mobile) shows the **current seedling** decision plate. Progress whisper: **"k of N remaining"** where N is the true total at open and k advances as decisions land — never "1 of 0".

**Decision surface — one seedling at a time:**

- Name (serif, full — no mid-word crush), path (monospace), AI-suggested scope/dedupe hint if present.
- Three primary resolves in a clear row: **Keep** (terracotta primary), **Merge** (forest outline), **Discard** (quiet brick text/outline).
- Keep expands inline (not a deep modal stack): scope picker + starting tier (rooted / climbing / pruned) with a one-line **budget delta preview before confirm** ("+1.2k resident tokens").
- Bulk bar above the queue: "Keep all suggested", "Discard obvious duplicates" — secondary, not default.

**Feedback:** Keep → row animates into Garden with rooted/climbing stem; **undo ribbon**: "Kept *name* · Undo". Discard → row decays out; ribbon: "Discarded *name* · Undo". Merge → target skill highlighted in Garden; ribbon with undo.

**Interaction budget:** open triage (1) → Keep/Merge/Discard (2) → confirm scope/tier only if Keep defaults need change (≤3). Defaults should make the common path two interactions when suggestion is accepted.

**Reversibility:** every triage decision lands the undo ribbon for ~8s (or until next decision, which replaces the ribbon with the latest undo). Session history: Undo restores that skill to the queue and reverses the Garden change.

**Designed states for the triage surface (mandatory):**

| State | What the operator sees |
|-------|-------------------------|
| **Loading** | Decision plate skeleton + queue skeleton lines; progress whisper "Loading seedlings…"; no "Inbox clear" copy. |
| **Populated (N > 0)** | Queue of N rows; current decision plate filled; "k of N remaining". |
| **Genuine empty** | Only when the shared awaiting count is truly 0: serif headline "Triage inbox clear", quiet satisfaction line, single control "Back to Garden". Forest stem whisper. |
| **Failed to load** | Brick stem mark; serif headline "Couldn't load seedlings"; plain sentence that the inbox may still have work; **Retry** primary; secondary "Back to Garden". Shell count remains the last known truth or shows a caution mark — never pretends clear. |
| **Partial / stale** | If queue is older than a fresh detect: quiet banner "Counts may have changed — refresh" with refresh control; not a blank queue. |

**Mobile:** full-sheet; decision actions pinned to bottom thumb zone; undo ribbon above those actions.

---

### Job 2 — Curate tiers (rooted / climbing / pruned)

**Entry:** Every Garden row shows the **tier stem + short label or r/c/p control** always — never metadata-only, never detail-only.

**Decision (in situ, with consequence before commit):**

- Click/tap the stem or the `r` / `c` / `p` control opens (or focuses) an in-situ tier control anchored to the row: rooted / climbing / pruned as a compact segmented control.
- **Before the tier commits**, a **budget delta preview** appears beside the control and as a secondary figure near the shell budget readout: e.g. "−840 tokens resident" when demoting rooted → climbing, "+1.1k" when promoting. The operator sees cost **before** the change lands.
- Confirm path: selecting a different tier applies it (one interaction after open) **with** the preview visible on hover/focus of each option so consequence is clear before acting. If the control is a single click on `c`/`r`/`p`, the preview must appear on hover/focus of that control **before** click, and the click still triggers the undo ribbon after.

**Feedback:** stem morphs immediately on apply; budget readout updates; row may re-sort if sorted by tier; **undo ribbon**: "Tier → climbing on *name* · Undo" (name the skill and the new tier).

**Reversibility:** Undo within ~8s restores prior tier and budget figure.

**Visual language of tiers (consistent everywhere):**

- Rooted: solid terracotta-filled stem, full height; strongest ink on name.
- Climbing: half-height forest stem or outline stem; full name weight.
- Pruned: dashed/faded stem; name and meta de-emphasized (still readable, clearly "out of resident set").

---

### Job 3 — Cost / Exposure lens

**Entry:** Lens control on the Garden rail — segmented "Perspective: Garden | Cost | Exposure". Not a separate Usage destination.

**Behavior:** Enabling Cost or Exposure re-weights the list: sort by cost-per-use or by verdict; each row shows inline usage count / cost figure and exposure badge. Stale/dormant rows visually recede; expensive dormant rows keep a quiet amber flag so they become prune candidates.

**Decision:** operator prunes or demotes in situ from the same rows (Job 2 actions remain available, with the same preview + undo). Optional sort: cost-per-use, last used, tokens resident.

**Feedback:** live re-prioritization; no state change from the lens itself.

**Reversibility:** turning the lens off restores default Garden order/emphasis; pure perspective.

---

### Job 4 — Find and route

**Entry:** Search glyph in shell (and `/` keyboard) opens a **global search overlay** — a focused plate centered or docked under the shell, dimming the Garden.

**Behavior:** Type-ahead filters the whole registry by name, description, path. Results grouped or badged by tier and scope; match counts shown. Result rows show **full skill names** (wrap allowed); path secondary. Selecting a result highlights/scrolls the Garden row and can open skill detail (Z9) in the side panel.

**Feedback:** instant filter; empty query returns to Garden.

**Reversibility:** pure navigation; Escape closes overlay.

---

### Job 5 — Deploy / sync with confidence

**Entry (unambiguous action, never inert status):**

- Shell control is labeled as a **job**: "Review deploy", "Deploy · drift N", "Deploy · idle", or "Deploy · error" — with a leading forest stem tick whenever the control opens the review. It always looks and behaves as a **button that opens Z7**, including when idle (idle opens the empty review state, not a dead click).
- Optional secondary entry: collapsed deploy summary at top of side panel when default Rot is showing — "Deploy review" link with same stem language.

**Review surface (Z7) — full instrument, not a missing panel:**

Desktop: occupies the secondary column (or a widened review plate if the change list is long). Mobile: full sheet.

Structure, top → bottom:

1. **Title** — "Deploy review" in display serif; subtitle line with dry-run clock ("Preview as of …") in monospace quiet ink.
2. **Summary strip** — three small counts in one plate row: Will root · Will prune · Drift (tabular figures; labels always present even when zero).
3. **Sections** (only sections with items expand by default; empty sections show a single quiet "None"):
   - **Will root** — each line: skill name (serif) + target path (monospace) + action verb "root".
   - **Will prune from harness** — name + path + "prune".
   - **Drift** — name + short origin-vs-override note (two-line max); optional expand for more detail. Drift is visible, never silent.
4. **Footer actions** — **Cancel** (quiet) and **Commit sync** (terracotta primary). Commit is available after the preview has rendered (including empty idle state where Commit is disabled and helper text says "Nothing to deploy"). Never silent auto-sync as the only path.
5. **Post-commit** — confirmation plate: what deployed (counts + short list); shell returns to idle/synced; if commit fails, brick error state with Retry and the preview list preserved.

**Feedback:** preview is non-destructive by definition. Opening review never mutates the registry. On commit: clear confirmation of what deployed.

**Reversibility:** dry-run is safe. Do not fake full post-commit rollback if the product cannot; post-commit messaging is honest. If a partial undo exists, use the undo ribbon; otherwise state "Deployed — restore via reverse tier/sync if needed" without lying.

**Shell reflection:** idle / previewing / synced / error — text + stem, not color alone.

---

### Job 6 — Spot rot (duplicates, dead skills, drift)

**Entry:** Rot count in shell + default side-panel **Rot/Recommendations feed**. Findings also flag inline on affected Garden rows (small amber/brick mark).

**Inbox triage card special case:** When seedlings await, the top card is type **INBOX TRIAGE**, copy states the **same N** as the shell, and the primary control is **"Open triage"** (enters Job 1). It must never "resolve" by vanishing while seedlings still wait.

**Other findings:** each is a plate with type chip (Duplicate | Stale | Drift | Unused) + one-line diagnosis + primary resolve (Merge duplicate, Demote stale, Re-merge drift, Archive). Resolve is one interaction when defaults are sound; destructive actions show a **one-line consequence before or as the control commits** (e.g. "Archives and removes from resident set").

**Feedback:** resolved finding clears with decay motion; Garden row updates; **undo ribbon** immediately: "Archived *name* · Undo" / "Demoted *name* · Undo".

**Reversibility:** Undo within ~8s restores the finding card and reverses the Garden change. No silent irreversible resolve.

---

## Zones Z1–Z12 (complete design)

### Z1 — Main shell & status indicators

Top instrument band on the sandstone field. Wordmark (serif) + version whisper. Health: filled disk (forest = live, amber = degraded, brick = offline) with short text — **status only**. Mode chip: agent | hub — **status only**. Context-budget readout in a small double-rule plate with tabular figures; secondary delta figure when a tier preview is active.

Right **action signals** (stem tick + verb when they open a mode):

- **Triage N** / **Inbox clear** — shared true count with Rot and Z4.
- **Review deploy** / **Deploy · idle** / **Deploy · drift N** / **Deploy · error** — always opens Z7.
- **Rot N** — focuses Z8.

Search and settings as quiet icons. No peer route tabs. Mobile: two-row collapse as described in Layout; deploy remains an explicit action label.

### Z2 — Garden master list

Primary zone. One large ledger plate containing the living registry. Control rail: filters (scope, tier), sort, Cost/Exposure lens. Rows follow **column priority** in Layout so long names wrap or keep priority over path truncation. Empty Garden: serif headline "No skills rooted yet" + short guidance to run detect/triage — never a blank white void. Loading: skeleton ledger lines with still shimmer (no count-up). This zone owns the eye at 1440.

### Z3 — Skill object view (row)

The atomic unit. Always shows: **full readable name** (serif; wrap to two lines before ellipsis; ellipsis only after path/meta have compressed), path or description (secondary, truncates first), scope, tier (stem + changeable control), inline usage or cost when known, exposure verdict under lens, quick actions (open detail, change tier). Under Cost lens, cost-per-use is first-class. Selected row: inner rule highlight, not a loud fill. Hover/focus reveals budget delta on tier controls without layout jump. Hover/focus on truncated secondary text shows full string; name should rarely need that if wrapping is honored.

### Z4 — Seedlings triage flow

Focused mode entered from shell **Triage N** or Rot **Open triage**. Queue list + current decision plate. Keep / Merge / Discard as specified in Job 1. Bulk actions secondary. Progress: "k of N remaining" with true N. Undo ribbon after every decision. **Mandatory states:** loading, populated, genuine empty, failed to load (see Job 1 table) — genuine empty must never appear when N > 0 anywhere in the shell or Rot. On mobile: full-sheet with decision actions pinned to bottom thumb zone; undo ribbon above them.

### Z5 — Cost/Exposure perspective controls

On the Garden rail: perspective control (Garden default | Cost | Exposure). May include secondary sort (cost-per-use, last active). Active lens indicated by a filled stem mark on the control, not a purple pill tab. Changing perspective only re-ranks/re-emphasizes Z2 rows.

### Z6 — Global search overlay

Invoked from shell or keyboard. Dimmed Garden behind; search plate with large input (sans), results as compact ledger rows with tier stems, **full names**, and match highlight on name/path. Match counts by tier. Selecting jumps to Z2/Z9. Escape/close control clear. No separate "search page".

### Z7 — Deployment preview and review area

**Full redesign attention — this zone must exist as a real instrument.**

Side panel (desktop) or sheet (mobile) opened from the shell deploy **action** signal (always). Title "Deploy review" in serif. Summary strip: Will root / Will prune / Drift counts. Sections with enumerated change lines (name + path + verb); Drift rows show origin-vs-override note. Footer: dry-run timestamp + **Commit sync** (terracotta) and Cancel. Idle empty state: calm "Nothing to deploy — registry matches harness" with Commit disabled — still a designed surface, not a missing panel. Error state: brick stem, plain message, Retry. Shell deploy indicator reflects idle / previewing / synced / error with text + stem. Never an inert "deploy ready" chip that swallows clicks.

### Z8 — Rot/recommendations feed

Default occupant of the side panel when no other mode is active. Header "Rot" or "Recommendations" with count. Items: type chip (Duplicate | Stale | Drift | Inbox | Unused) + one-line diagnosis + resolve / open action.

- **Inbox triage card:** count matches shell; action **Open triage** → Z4.
- **Other cards:** resolve with consequence clarity; decay out; **undo ribbon** restores.

Also mirrored as inline marks on Z3 rows. Resolved items never vanish without undo.

### Z9 — Skill detail and content editor

Opens in side panel (or sheet on mobile) when a skill is selected from Z2/Z6. Sections: name (editable, full string), description (editable multiline field), path (monospace, copyable), scope, tier control (same stem language + budget preview + undo as Job 2), deploy targets list, "how search surfaces this" note (router preview if available — quiet, not a gimmick). Save is explicit; cancel discards edits. Not a modal stack over the whole app on desktop — the Garden remains visible and contextual.

### Z10 — Settings and configuration view

Subordinate, on-demand from shell gear. Full plate or sheet — not a peer tab of equal rank to the Garden. Grouped sections with serif section titles and sans labels: Registry root, Repo roots, Global/Repo clients (checkbox rows), Link mode, Inbox directories, Maintenance interval, Hub sync, AI assist / BYOK key status. Primary destructive actions (remove root) use brick text, confirmed, with undo if reversible. Looks like configuration of an instrument, not a second product.

### Z11 — System states

All states use the same type and plate language — intentional surfaces, not browser defaults. **Strengthen and distinguish:**

| State | Surface language |
|-------|------------------|
| **Empty Garden** | Editorial empty — serif headline "No skills rooted yet", one sentence, single CTA toward detect/triage. Forest stem whisper. |
| **Empty triage (genuine)** | Only when shared awaiting count is 0: "Triage inbox clear", quiet satisfaction, back to Garden. |
| **Empty deploy** | "Nothing to deploy" inside Z7 structure (summary zeros, Commit disabled) — still the full review chrome. |
| **Empty rot** | "No recommendations" with calm line; not a blank panel. |
| **Loading (list / triage / deploy preview)** | Skeleton ledger lines or skeleton section rows; optional single sweep on health tick; **never** the success-empty copy. |
| **Error (failed connection)** | Plate with **brick stem mark**, plain-language message, **Retry** primary; preserve surrounding chrome. Distinct from empty. |
| **Offline / daemon down** | Shell health brick + banner under shell "Daemon unreachable" with retry; Garden may show last-known data dimmed if saved from before, clearly labeled **stale**. Action signals that need the daemon show caution, not fake zeros that look "all clear". |
| **Undo available** | Undo ribbon present (temporary) — not a system error, a recovery instrument. |

Empty success and failed load must never share the same headline or layout skeleton.

### Z12 — Mobile (390px)

Same IA, condensed:

- No horizontal overflow; no peer tab bar that clips.
- Shell + budget strip; Garden full-width rows with tier stem, **full wrapping name**, compact cost/exposure (path may hide until detail).
- Triage, deploy, rot, detail, settings = full-width sheets with sticky primary actions.
- Deploy entry remains a labeled action ("Review deploy"), not a mute chip.
- Tier change and triage decisions remain possible in ≤3 interactions, with budget preview and undo ribbon.
- Touch targets comfortably large; filters may collapse into a single "Filter" sheet.
- Distinctiveness preserved: sandstone field, serif names, tier stems, terracotta actions — not a crushed desktop chrome.

---

## Reversibility choreography (global)

Applies to triage decisions, tier changes, archive/adopt, and rot resolves (A1, A8, Jobs 1–2, 6).

1. **Before (where consequence is material):** show budget delta or one-line outcome on hover/focus or in the expanded Keep panel — operator is not surprised after the fact.
2. **On commit:** the visible state changes immediately (row moves, stem morphs, card decays).
3. **Immediately:** **undo ribbon** docks at the bottom of the workbench (or active sheet): plain sentence naming the action and the skill + **Undo** control (forest text button) + quiet dismiss. Same double-rule plate language as the rest of the instrument.
4. **Duration:** ~8 seconds, or until the next state-changing action (which replaces the ribbon with the newest undo). Dismiss or timeout ends the window without drama.
5. **On Undo:** reverse the change; ribbon confirms "Restored" briefly (~2s) then leaves; focus returns sensibly (e.g. restored seedling becomes current in triage).
6. **Not covered by fake undo:** successful full deploy commit — honest confirmation only unless product supports reverse sync.

---

## Long identifiers in the ledger (global)

- Skill **name** is the primary human object: serif, protected column, **wraps up to two lines** before any ellipsis.
- Ellipsis mid-word on the name is a last resort after scope, path, and secondary meta have already compressed.
- Paths and long descriptions truncate first with end-ellipsis; full value on hover/focus and always in Z9.
- Search results and triage decision plates show the full name without crushing.
- At 390px, name still wraps; path hides; tier and cost remain.

---

## Hierarchy & anti-slop checklist (for Builder)

- One dominant primary zone: the Garden (Z2). Secondary chrome never competes.
- No six peer top-level tabs. No slate-purple SaaS reskin.
- No gradient blobs, glassmorphism, emoji-as-icons, 3-up stat cards, count-up animations, purple→blue gradients.
- No decorative ivy/vines; botanical meaning only via tier stems and state-encoding motion.
- Usage/cost lives on skill rows (and lens), not only a separate chart page.
- Tier always visible and changeable on the main list, with **pre-action budget preview** and **post-action undo**.
- Seedlings count, Rot inbox card, and triage queue share one truth; empty ≠ failed load.
- Deploy is an action that opens a real review instrument, not a dead status chip.
- Every session state-changing action offers the undo ribbon choreography.
- Color never the only cue: tier stem shape, exposure label text, deploy state text, action stem ticks always accompany hue.
- Long skill names remain readable in the ledger geometry.

---

## What changed vs iteration 1 (for evaluators)

| Issue | Iteration 1 | Iteration 2 design |
|-------|-------------|---------------------|
| Seedlings empty while 65 wait | Shell "seedlings 0", triage "1 of 0" / Inbox clear | Shared true count; Triage N action; Open triage from Rot; populated queue; distinct loading / empty / failed states |
| Deploy inert | "deploy ready" chip, no panel | Verb-labeled action signal; full Z7 review with summary, sections, Commit/Cancel, idle/error states |
| No undo | Instant irreversible tier/rot/triage | Undo ribbon ~8s; named action; restores prior state; pre-action budget/consequence where material |
| Truncated names | Mid-word ellipsis on primary names | Name column priority + wrap; path truncates first |
| Z7 weak | Missing | Fully specified deploy instrument |
| Z11 weak | Empty only partially implied | Full matrix: empty variants, loading, error, offline, stale information, undo-as-recovery |

---

## Builder note

Implement exactly this description: the Trellis Ledger workbench (refined), all six job flows, and zones Z1–Z12. Preserve the sandstone / forest / terracotta instrument language and ledger-plate + tier-stem motifs that scored highly. **Do not** invent peer route tabs or an analytics-only usage silo. **Do not** add decorative botanical illustration. **Do not** ship an empty triage when work is waiting, an inert deploy chip, or state changes without the undo ribbon. Prefer warm paper and sharp ink over cool slate and purple.

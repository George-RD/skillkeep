# Design Description — Iteration 1 Full Page

## Rejected concepts

- **Night Survey Desk** — dark charcoal ops console with copper ticks and pure monospace hierarchy; precision wins, garden becomes labels only, risks cold-dashboard sameness.
- **Specimen Folio** — Japanese-editorial extreme whitespace with museum specimen cards and hairline rules; calm and distinctive, but too sparse and slow for dense triage and budget decisions.

---

## Creative Direction

**Winning concept: Trellis Ledger**

Aesthetic root: Swiss-editorial botanical instrument — the calm of a field notebook crossed with the decisiveness of a surveyor's ledger. Warm, considered surfaces (sandstone field, forest ink, terracotta action) hold a dense, keyboard-friendly workbench where every skill is an addressable row carrying tier, cost, and exposure like columns in a living ledger.

How it resolves the tension *"editorial garden that reads like a precision instrument"*: the garden lives in material and type — warm paper-like ground, a high-contrast display serif for human-scale headings and skill names, solid double-rule plates that feel tactile rather than glassy. The instrument lives in structure and density — monospace for paths, tokens, and hashes; always-visible tier marks; inline cost/exposure; shallow decide loops with undo. The botanical metaphor is never wallpaper: rooted / climbing / pruned are visual states of the same stem-mark motif, growth motion only for an active sweep, decay motion only for a prune.

Signature motif: the **ledger plate** — a solid surface edged with a double rule (outer hairline, inner heavier rule) that frames every instrument zone; paired with the **tier stem** — a short vertical mark beside each skill that reads solid (rooted), half-height (climbing), or dashed/faded (pruned). One motif family, one meaning everywhere.

This MUST feel like tending a living garden that happens to be an operations console — calm to look at, fast and exacting to drive. NOT a purple-tab SaaS dashboard, NOT a plant-care screensaver, NOT an analytics silo with charts divorced from decisions.

References in spirit (not to copy): Linear's dense calm triage; Mail/Things inbox-as-queue with generous undo; a craft bookshop ledger; the trellis rebrand DNA (warm serif + sandstone/forest/terracotta + tactile plates) refined into a single workbench rather than route tabs.

---

## Layout

### Overall geometry (desktop 1440)

A single persistent workbench fills the viewport. No peer top-level tab strip of Health / Detect / Registry / Sync / Usage / Settings.

**Shell (top band, ~56–64px tall):**
- Left: wordmark "skillkeep" in the display serif, quiet weight; adjacent a compact daemon-health tick (filled disk + short label: live / degraded / offline) and mode chip (agent | hub).
- Center-left: **context-budget readout** — a stable framed counter of resident tokens (rooted set), so digit changes never shift surrounding layout.
- Right cluster of status signals, not destinations: seedling count (inbox awaiting triage), deploy/sync state (idle / drift / ready), rot finding count. Each is a tappable signal that opens a contextual mode over the Garden, not a separate peer screen.
- Far right: a subdued gear/settings entry and search glyph — subordinate chrome.

**Primary zone (the Garden, ~70–75% of remaining width):**
- Dominates the eye. A continuous master list of skill objects as ledger rows inside one large plate.
- Above the list: a thin control rail — scope filter chips, tier filter (all / rooted / climbing / pruned), sort, and the Cost/Exposure lens toggle. These re-prioritize; they do not navigate away.
- List rows are dense but breathable: skill name (serif), path (monospace, quieter), scope chip, **tier stem + label**, inline usage/cost figure, exposure verdict badge, quick actions on hover/focus.

**Secondary column (right ~25–30%):**
- A contextual side panel that changes with mode. Default: a compact **Rot/Recommendations feed** plus a collapsed deploy status summary. When triage is active, this column becomes the triage decision panel (or triage takes over as a focused overlay — see Job 1). When deploy is open, this becomes the dry-run preview. When a skill is selected for detail, this becomes the skill detail/editor.

**Negative space logic:** the Garden list is the only dense field. The shell and side panel hold more air. Never a 3-up stat-card hero grid. Never equal-weight peer destinations.

### Mobile (390)

- Shell collapses to: wordmark + health tick left; seedling count + search right; budget readout as a second thin strip under the shell.
- Garden becomes full-width stacked rows (still with tier stem, cost, and exposure — no burying).
- Contextual modes (triage, deploy preview, rot, settings, detail) open as full-sheet overlays that slide up, with a clear dismiss and undo affordance. No horizontal overflow; primary actions stay within thumb reach.

---

## Typography

**Display / human labels:** a high-contrast oldstyle or soft-modern serif (Fraunces-class or equivalent) for: wordmark, page/mode titles ("Garden", "Seedlings", "Deploy review"), skill names in the list, and empty-state headlines. Confident, editorial, slightly warm.

**Interface / body:** a humanist sans for controls, chips, body copy, recommendation prose, settings labels. Comfortable reading size, roughly 1.5 leading, measure kept short in the side panel.

**Instrument / data:** a clear monospace for paths, token counts, cost figures, drift hashes, timestamps, and any identifier. Slightly smaller than body so data densifies without shouting.

**Scale relationships:**
- Mode title: ~1.6–1.8× body, serif.
- Skill name in list: ~1.1–1.15× body, serif, medium weight.
- Path and meta: ~0.85× body, monospace, quieter color.
- Budget readout number: tabular figures, monospace or sans with fixed figure width, so updates don't jitter the shell.
- Empty/error headlines: serif at ~1.4× body — calm, not alarmist billboard.

Hierarchy does the work: the eye hits skill names and tier stems first, then cost/exposure, then chrome.

---

## Color

**Field:** warm ivory / sandstone paper (~#F5F0E8 range) as the global ground — never pure white, never cool slate-gray SaaS canvas.

**Ink:** deep forest-near-black for primary text (~#1C2B24 range); secondary text in softened olive-gray.

**Plate surfaces:** slightly warmer or slightly cooler off-white than the field, with the double-rule edge in muted earth (warm gray-brown), not pure black.

**Accent — action / keep / rooted energy:** terracotta / clay red-orange, used sparingly for primary actions (Keep, Commit deploy, primary CTA) and for the rooted tier stem fill. Not purple. Not indigo SaaS.

**Accent — growth / health / active:** deep forest green for healthy ticks, active exposure, sync-ok, and the climbing tier stem (outline or half-fill in forest).

**Accent — caution / rot / drift:** muted amber for warnings and drift; a restrained brick for destructive/discard — never screaming neon red panels.

**Exposure verdicts (always paired with shape/label, never color alone):**
- Active: solid forest pill + "active"
- Stale: amber outline pill + "stale"
- Dormant: faded ink outline + "dormant"

**De-emphasis under Cost lens:** dormant/stale rows desaturate and lighten; high cost-per-use rows keep full ink weight so the eye finds expensive underperformers.

**No** gradient-blob/aurora backgrounds, glassmorphism, purple→blue gradients, or neon-on-charcoal template looks.

Atmospheric effect: the field should feel like printed paper under soft daylight — calm temperature, no vignette gimmicks, optional barely-perceptible paper grain only if it stays below "filter" threshold.

---

## Spacing & Rhythm

- **Shell:** compact, instrument-tight; status chips sit with small gaps so the band reads as one instrument strip.
- **Garden list:** tight internal row breathing room (comfortable click target, not sparse); clear hairline separators between rows OR alternating barely-warmer row fields — not heavy card chrome per row. Rows are ledger lines, not a card soup.
- **Between plate zones:** generous air — at least 2× the internal row gap — so the side panel and Garden read as two instruments on one desk, not one crowded sheet.
- **Side panel sections:** stacked with medium vertical rhythm; recommendation items denser than section headers.
- **Triage focused mode:** more vertical breathing around the current seedling decision card; bulk list below stays dense.
- **Mobile:** vertical stack with consistent section gaps; no horizontal scroll; primary decide buttons full-width or thumb-zone grouped.

Density variation is intentional: Garden = dense; modes that need judgment (triage decision, deploy preview) = more air around the decision.

---

## Motion

Motion encodes state only — never decorative loops.

- **Active sweep / scan:** a single slow growth pulse along the health tick or a thin progress rule under the shell — once per sweep, then still.
- **Keep / take root:** the new skill row inserts into the Garden with a brief upward settle (short ease-out); tier stem fills solid.
- **Prune / discard:** the row or finding compresses and fades (decay), then is gone; not a bounce, not confetti.
- **Tier change in situ:** tier stem morphs solid ↔ half ↔ dashed over ~200–300ms; budget readout updates in place without layout shift.
- **Lens toggle:** list re-sorts/re-weights with a short cross-fade of row emphasis — no spinning loaders for instantaneous local reordering.
- **Undo toast:** slides in from bottom (or bottom of the active plate), holds, dismisses; undo is always one interaction.
- **Deploy preview open:** side panel content cross-fades to the dry-run list; commit confirmation is a brief solid flash of the success state, then quiet.

No count-up number animations. No looping botanical particles.

---

## Atmosphere

Material: honest solids and double rules — paper and ink, not glass and glow. Surfaces feel pressable (subtle press offset on primary buttons, not soft skeuomorphic pillows). Depth comes from layered plates and rules, not blur stacks.

Light quality: even, warm, daylight desk. Status color is pigment on paper, not LED neon.

Mood: confident curation. The operator should feel *I can see the whole garden and decide in three moves* — not *I am browsing a dashboard*.

---

## Opinion Statement

This product MUST feel like a **field ledger on a gardener's desk** — warm paper, sharp ink, every leaf tagged with real telemetry — **not** a generic purple-tab SaaS console and **not** a decorative plant app. If a screen could be mistaken for either, it has failed.

---

## Core task flows (design)

### Job 1 — Triage the inbox (seedlings)

**Entry:** Seedling count in the shell is always visible when > 0 (terracotta numeral in a small plate). One click/tap opens **Seedlings triage** as a focused mode: Garden dims slightly behind; the main zone becomes a queue of awaiting skills; the side panel (or a dedicated decision strip) shows the current seedling.

**Decision surface:** One seedling at a time in a decision plate:
- Name (serif), path (monospace), AI-suggested scope/dedupe hint if present.
- Three primary resolves in a clear row: **Keep** (terracotta primary), **Merge** (forest outline), **Discard** (quiet brick text/outline).
- Keep expands inline (not a deep modal stack): scope picker + starting tier (rooted / climbing / pruned) with a one-line budget delta preview ("+1.2k resident tokens").
- Bulk bar above the queue: "Keep all suggested", "Discard obvious duplicates" — secondary, not default.

**Feedback:** Keep → row animates into Garden with rooted/climbing stem; confirmation toast "Kept · Undo". Discard → row decays out; same undo window. Merge → target skill highlighted in Garden, confirmation with undo.

**Interaction budget:** open triage (1) → Keep/Merge/Discard (2) → confirm scope/tier if Keep defaults need change (≤3). Defaults should make the common path two interactions when suggestion is accepted.

**Reversibility:** every decision exposes Undo in a short-lived toast and a session undo stack.

### Job 2 — Curate tiers (rooted / climbing / pruned)

**Entry:** Every Garden row shows the **tier stem + short label** always — never metadata-only, never detail-only.

**Decision:** Click/tap the stem or label opens an in-situ tier control (compact popover or segmented control anchored to the row): rooted / climbing / pruned. Hover/focus previews **context-budget delta** beside the control ("−840 tokens resident" when demoting rooted → climbing).

**Feedback:** stem morphs immediately; budget readout in the shell updates; row may re-sort if sorted by tier.

**Reversibility:** undo toast after each change.

**Visual language of tiers (consistent everywhere):**
- Rooted: solid terracotta-filled stem, full height; strongest ink on name.
- Climbing: half-height forest stem or outline stem; full name weight.
- Pruned: dashed/faded stem; name and meta de-emphasized (still readable, clearly "out of resident set").

### Job 3 — Cost / Exposure lens

**Entry:** Lens control on the Garden rail — a single toggle or segmented "Perspective: Garden | Cost | Exposure". Not a separate Usage destination.

**Behavior:** Enabling Cost or Exposure re-weights the list: sort by cost-per-use or by verdict; each row shows inline usage count / cost figure and exposure badge. Stale/dormant rows visually recede; expensive dormant rows keep a quiet amber flag so they become prune candidates.

**Decision:** operator prunes or demotes in situ from the same rows (Job 2 actions remain available). Optional sort: cost-per-use, last used, tokens resident.

**Feedback:** live re-prioritization; no state mutation from the lens itself.

**Reversibility:** turning the lens off restores default Garden order/emphasis; pure perspective.

### Job 4 — Find and route

**Entry:** Search glyph in shell (and `/` keyboard) opens a **global search overlay** — a focused plate centered or docked under the shell, dimming the Garden.

**Behavior:** Type-ahead filters the whole registry by name, description, path. Results grouped or badged by tier and scope; match counts shown. Selecting a result highlights/scrolls the Garden row and can open skill detail (Z9) in the side panel.

**Feedback:** instant filter; empty query returns to Garden.

**Reversibility:** pure navigation; Escape closes overlay.

### Job 5 — Deploy / sync with confidence

**Entry:** Deploy/sync state signal in the shell (e.g. "Drift 2" or "Ready to sync"). Opens **Deployment review** in the side panel (desktop) or full sheet (mobile).

**Decision:** Always a **dry-run preview first** — enumerated list of will-root, will-prune-from-harness, drift detected (project override vs global origin). Drift rows show both sides briefly (origin vs override summary). Primary action **Commit sync** stays disabled or secondary until preview is shown; then becomes terracotta primary.

**Feedback:** preview is non-destructive. On commit: confirmation of what deployed; shell state returns to "synced".

**Reversibility:** dry-run is safe by definition; post-commit messaging is clear (full rollback may be out of scope — do not fake it).

### Job 6 — Spot rot (duplicates, dead skills, drift)

**Entry:** Rot count in shell + default side-panel **Rot/Recommendations feed**. Findings also flag inline on affected Garden rows (small amber/brick mark).

**Decision:** each finding is a plate with one-line diagnosis + primary resolve (Merge duplicate, Demote stale, Re-merge drift, Archive). Resolve is one interaction when defaults are sound; destructive actions show a one-line consequence.

**Feedback:** resolved finding clears with confirmation; Garden row updates; undo available.

**Reversibility:** undo within session for each resolve.

---

## Zones Z1–Z12 (complete design)

### Z1 — Main shell & status indicators

Top instrument band on the sandstone field. Wordmark (serif) + version whisper. Health: filled disk (forest = live, amber = degraded, brick = offline) with short text. Mode chip: agent | hub. Context-budget readout in a small double-rule plate with tabular figures. Right: seedling count (terracotta when > 0), rot count, deploy state. Search and settings as quiet icons. No peer route tabs. Mobile: two-row collapse as described in Layout.

### Z2 — Garden master list

Primary zone. One large ledger plate containing the living registry. Control rail: filters (scope, tier), sort, Cost/Exposure lens. Rows: tier stem | name (serif) | scope chip | path (monospace, truncated with full on hover) | usage/cost | exposure badge | overflow actions. Empty Garden: serif headline "No skills rooted yet" + short guidance to run detect/triage — never a blank white void. Loading: skeleton ledger lines with still shimmer (no count-up). This zone owns the eye at 1440.

### Z3 — Skill object view (row)

The atomic unit. Always shows: name, path, scope, tier (stem + label, changeable), inline usage or cost when known, exposure verdict, quick actions (open detail, change tier, archive). Under Cost lens, cost-per-use is first-class. Selected row: inner rule highlight, not a loud fill. Hover/focus reveals actions without layout jump.

### Z4 — Seedlings triage flow

Focused mode entered from seedling signal. Queue list + current decision plate. Keep / Merge / Discard as specified in Job 1. Bulk actions secondary. Progress whisper: "12 of 65 remaining". Undo toasts. On mobile: full-sheet with decision actions pinned to bottom thumb zone.

### Z5 — Cost/Exposure perspective controls

On the Garden rail: perspective control (Garden default | Cost | Exposure). May include secondary sort (cost-per-use, last active). Active lens indicated by a filled stem mark on the control, not a purple pill tab. Changing perspective only re-ranks/re-emphasizes Z2 rows.

### Z6 — Global search overlay

Invoked from shell or keyboard. Dimmed Garden behind; search plate with large input (sans), results as compact ledger rows with tier stems and match highlight on name/path. Match counts by tier. Selecting jumps to Z2/Z9. Escape/close control clear. No separate "search page".

### Z7 — Deployment preview and review area

Side panel (desktop) or sheet (mobile). Title "Deploy review" in serif. Sections: Will root, Will prune, Drift. Each line is path + action verb in monospace/sans pair. Drift rows show divergence note. Footer: dry-run timestamp + **Commit sync** (terracotta) and Cancel. Never silent auto-sync as the only path. Shell deploy indicator reflects state: idle / previewing / synced / error.

### Z8 — Rot/recommendations feed

Default occupant of the side panel when no other mode is active. Header "Rot" or "Recommendations" with count. Items: type chip (Duplicate | Stale | Drift | Inbox) + one-line diagnosis + resolve action. Inbox-nonempty item deep-links to Z4. Unused/stale items offer Demote/Archive. Resolved items leave with decay motion. Also mirrored as inline marks on Z3 rows.

### Z9 — Skill detail and content editor

Opens in side panel (or sheet on mobile) when a skill is selected from Z2/Z6. Sections: name (editable), description (editable multiline field), path (monospace, copyable), scope, tier control (same stem language), deploy targets list, "how search surfaces this" note (router preview if available — quiet, not a gimmick). Save is explicit; cancel discards edits. Not a modal stack over the whole app on desktop — the Garden remains visible and contextual.

### Z10 — Settings and configuration view

Subordinate, on-demand from shell gear. Full plate or sheet — not a peer tab of equal rank to the Garden. Grouped sections with serif section titles and sans labels: Registry root, Repo roots, Global/Repo clients (checkbox rows), Link mode, Inbox directories, Maintenance interval, Hub sync, AI assist / BYOK key status. Primary destructive actions (remove root) use brick text, confirmed. Looks like configuration of an instrument, not a second product.

### Z11 — System states

- **Empty Garden:** editorial empty — serif headline, one sentence, single CTA toward detect/triage.
- **Empty triage:** "Inbox clear" with quiet satisfaction; link back to Garden.
- **Loading:** skeleton ledger rows; shell health may show sweep motion once.
- **Error:** plate with brick stem mark, plain-language message, retry action; never a crash blank.
- **Offline / daemon down:** shell health brick + banner under shell "Daemon unreachable" with retry; Garden may show last-known data dimmed if cached, clearly labeled stale.

All states use the same type and plate language — intentional surfaces, not browser defaults.

### Z12 — Mobile (390px)

Same IA, condensed:
- No horizontal overflow; no peer tab bar that clips.
- Shell + budget strip; Garden full-width rows with tier stem, name, compact cost/exposure (path may hide until detail).
- Triage, deploy, rot, detail, settings = full-width sheets with sticky primary actions.
- Tier change and triage decisions remain possible in ≤3 interactions.
- Touch targets comfortably large; filters may collapse into a single "Filter" sheet.
- Distinctiveness preserved: sandstone field, serif names, tier stems, terracotta actions — not a crushed desktop chrome.

---

## Hierarchy & anti-slop checklist (for Builder)

- One dominant primary zone: the Garden (Z2). Secondary chrome never competes.
- No six peer top-level tabs. No slate-purple SaaS reskin.
- No gradient blobs, glassmorphism, emoji-as-icons, 3-up stat cards, count-up animations, purple→blue gradients.
- No decorative ivy/vines; botanical meaning only via tier stems and state-encoding motion.
- Usage/cost lives on skill rows (and lens), not only a separate chart page. An optional aggregate chart may exist later but must not exile the per-skill signal.
- Tier always visible and changeable on the main list.
- Every state-changing action offers session undo where the product supports it.
- Color never the only cue: tier stem shape, exposure label text, deploy state text always accompany hue.

---

## Builder note

Implement exactly this description: the Trellis Ledger workbench, all six job flows, and zones Z1–Z12. Do not invent peer route tabs or an analytics-only usage silo. Do not add decorative botanical illustration. Prefer the warm sandstone / forest / terracotta instrument language over cool slate and purple.

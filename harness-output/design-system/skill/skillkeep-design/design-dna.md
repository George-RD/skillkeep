# Trellis Ledger — Design DNA

A design-system document for the skillkeep UI overhaul, codified from the shipped
iteration-4 "Trellis Ledger" direction. This describes the system as *visual and
experiential language* — the relationships, roles, and rules a future surface must
honour. It is deliberately free of code, class names, or implementation. When a
value is cited, it is symbolic (for example, "forest ink on warm linen"), never a
mechanical spec.

---

## 1. Name & essence

**Trellis Ledger** — an editorial garden that reads like a precision instrument:
warm paper, sharp ink, every skill an addressable row carrying its tier, cost, and
exposure like columns in a living ledger, every decision shallow, consequence-honest,
and reversible while the ink is still wet.

It is the calm of a field notebook crossed with the decisiveness of a surveyor's
ledger. You should open it to *make a decision in three moves and take it back if you
were wrong* — including one-handed on a phone — never to browse, never to be afraid
to click, and never to pinch and pan to reach the work.

---

## 2. Principles

1. **Calm to look at, fast and exacting to drive.** The surface is quiet; the
   interaction is sharp. Reading slows you down for judgment; controls move at
   thought-speed.
2. **The garden earns its keep only because every leaf carries hard telemetry.**
   The botanical metaphor is never wallpaper — it is licensed by real token counts,
   exposure verdicts, and drift. Strip the data and the metaphor must fall away.
3. **Consequence before commit; undo after.** No state-changing action lands blind.
   Every tier change, triage decision, prune, and resolve shows its cost first and
   stays reversible for a short, honest window afterward.
4. **One garden, many lenses.** Perspectives re-prioritize the same living list; they
   never navigate you away from it. The work never leaves the workbench.
5. **Tier is never buried.** Rooted, climbing, and pruned are first-class, always
   visible, always changeable *in situ* — never metadata reached through a detail
   modal.
6. **Colour never carries meaning alone.** Hue always travels with a shape, a label,
   or a stem mark. Tier, exposure, and state remain legible to a reader who sees no
   colour.
7. **Motion encodes state, never decorates.** Growth is reserved for an active sweep;
   decay is reserved for a prune. Nothing loops for atmosphere.
8. **Protect the human object.** The skill name is the primary readable thing; it
   wraps to two lines before any letter is ever cut. Secondary columns compress and
   hide first.
9. **The phone is a reorganized pocket instrument, not a desktop forced through a
   keyhole.** At 390px the work is re-laid for a thumb — a status band, a budget
   strip, a workbench, and a bottom dock of jobs — never sideways-scrolled.
10. **Honest materials.** Paper and ink, plates and rules, pressable solids. Depth
    comes from layered surfaces and edges, never from blur, glow, or glass.

---

## 3. Aesthetic & creative tension

The whole system exists to hold two poles in deliberate friction.

- **Pole A — The Gardener.** Organic, editorial, tactile. Warm, considered, unhurried.
  A display serif for human-scale headings; solid, bordered surfaces that feel like
  they respond to touch; calm breathing whitespace; growth and decay *only where they
  encode a real state*.
- **Pole B — The Instrument.** Dense, decisive, reversible. A triage cockpit.
  Monospace for paths, tokens, drift hashes, dry-run diffs, and cost-per-use. Fast,
  keyboard-friendly, data-dense where the density earns trust. Every action
  immediate, confirmed, and undoable.

The redesign succeeds when the surface feels like *tending a living garden that
happens to be an operations console*. It fails as either failure alone: Pole A without
B becomes decorative whimsy — a plant-care screensaver; Pole B without A becomes
another cold, flat dashboard. The two rejected candidate directions are precisely
these failures made concrete and set aside:

- **Night Survey Desk** (Pole B alone) — a dark charcoal ops console with copper ticks
  and pure monospace hierarchy. Precision wins, but the garden degrades to labels and
  the surface drifts toward cold-dashboard sameness. Rejected.
- **Specimen Folio** (Pole A alone) — Japanese-editorial extreme whitespace with
  museum specimen cards and hairline rules. Calm and distinctive, but too sparse and
  too slow for dense triage and budget decisions. Rejected.

Trellis Ledger is the field-notebook warmth of Folio tightened to the surveyor's
decisiveness of the Desk — **Swiss-editorial botanical instrument**, the only one of
the three that can hold dense, reversible triage *and* feel like paper.

---

## 4. Colour language

Colour is described by role and relationship; values are symbolic.

- **The field (ground):** warm ivory sandstone — *paper, never pure white, never cool
  slate-gray SaaS canvas*. The whole product sits on this warm linen, lit by even
  soft daylight with no vignette gimmickry.
- **The ink (text):** deep forest-near-black for primary text (*forest ink*), with
  secondary text in softened olive-gray. Status pigment reads as ink on paper, not
  LED neon.
- **Plate surfaces:** off-whites slightly warmer or cooler than the field, each edged
  by a *double rule in muted earth* (warm gray-brown), never a hard pure-black line.
- **Terracotta / clay** is the *action accent* — keep, commit, the primary CTA, the
  rooted-tier stem fill, and the seedlings *action* signal when work is waiting.
  Deliberately not purple, not indigo SaaS.
- **Deep forest green** is the *growth / health / active accent* — healthy ticks, the
  climbing-tier stem, active exposure, sync-ok, and the deploy *action* stem when a
  review is available.
- **Muted amber** is *caution* — warnings, drift, rot findings. **Restrained brick**
  is *destructive / offline* — discard, remove, daemon-unreachable. Neither ever
  becomes a screaming neon panel.

Three colour disciplines are load-bearing:

- **Exposure verdicts always travel in pairs** — active is a solid forest pill with
  its label, stale is an amber outline pill with its label, dormant is a faded ink
  outline with its label. Hue is the second cue, never the first.
- **Action signals differ from status signals by *form*, not just colour.** An action
  signal (something you open) carries a filled stem tick on its leading edge plus a
  verb and a count — "Triage 65", "Review deploy". A pure status signal (live /
  offline) is a disk plus a label, no stem, no verb. The difference is readable with
  the colours off.
- **The Cost lens dims by meaning.** Dormant and stale rows desaturate and lighten;
  high cost-per-use rows keep full ink weight so the eye finds the expensive
  underperformers first.

Forbidden here: gradient-blob and aurora backgrounds, glassmorphism, purple→blue
gradients, neon-on-charcoal template looks, and any colour asked to mean something
alone.

---

## 5. Typography

Three voices, each with one job; hierarchy does the work.

- **Display — the editorial serif** (a high-contrast oldstyle or soft-modern serif in
  the Fraunces family). It speaks for human things: the wordmark, the mode and page
  titles ("Garden", "Seedlings", "Deploy review"), the skill names in the list, and
  the empty-state headlines. Confident, slightly warm, never decorative.
- **Interface — the humanist sans.** It speaks for the operator: controls, chips,
  body copy, recommendation prose, settings labels, and undo-ribbon copy.
  Comfortable reading size, generous leading, measure kept short in side panels and on
  phone body.
- **Instrument — the monospace.** It speaks for data: paths, token counts, cost
  figures, drift hashes, timestamps, and any identifier that is not the human skill
  name. Slightly smaller than body so data densifies without shouting.

Scale relationships carry the hierarchy: the mode title sits well above body in serif;
the skill name sits just above body in serif, medium weight; path and meta sit below
body in monospace, quieter ink; the budget readout uses tabular figures so a changing
digit never shifts the surrounding geometry. The eye lands, in order, on **skill names
and tier stems, then cost and exposure, then chrome** — and the empty-state headline
is the same serif at a calm size for genuine empty success and a firmer ink weight for
error.

---

## 6. Spatial rhythm

Density is an intentional signal, not an accident.

- **The Garden is the only dense field.** Rows are tight ledger lines with comfortable
  internal breathing room and hairline separators (or barely-warmer alternating row
  fields) — never heavy card chrome per row. They are *ledger lines, not a card soup*.
- **Judgment gets air.** Modes that ask for a decision — the triage decision plate, the
  deploy dry-run preview — take more vertical space around the decision than the dense
  list does.
- **Plates breathe between each other.** On the desktop, the Garden plate and its side
  panel sit with generous air — at least twice the internal row gap — so they read as
  two instruments on one desk, not one crowded sheet.
- **The shell is instrument-tight.** Status and action signals sit with small gaps so
  the top band reads as a single instrument strip; action signals take slightly more
  horizontal padding than pure status so they read as pressable without shouting.
- **Negative space is structural.** The Garden list owns the eye; the shell and side
  panel hold more air. There is never a three-up stat-card hero grid and never a row of
  equal-weight peer destinations.
- **The phone restacks rather than compresses.** A tight status row, a full-width
  budget strip, the workbench body, and a fixed thumb dock of four jobs — with
  consistent section gaps and sticky primary actions that never collide with the dock.

---

## 7. Signature motif(s)

One motif family, one meaning everywhere — that is the rule.

- **The ledger plate.** A solid surface edged with a *double rule* — an outer hairline
  and an inner heavier rule in muted earth — that frames every instrument zone. It is
  the frame of the product: the Garden, the deploy review, the triage plate, the
  detail panel all share this edge.
- **The tier stem.** A short vertical mark beside each skill that reads its life at a
  glance: **solid and full-height for rooted, half-height for climbing,
  dashed/faded for pruned.** The botanical metaphor is exactly this mark and nothing
  more.
- **The undo ribbon.** A temporary ledger strip — same double-rule language, forest ink
  for restore — that docks to the bottom edge of the active plate (or above the thumb
  dock / decision buttons on phone). It is never a floating toast that could be
  mistaken for a browser notification; it is an instrument-grade, reversible mark.
- **Action-signal vs status-signal language.** The same stem tick — filled terracotta
  or forest on the leading edge, plus a verb and a count — marks every *thing you
  open*, on desktop shell and phone dock alike. Pure status stays a disk + label.
- **The phone thumb dock.** The phone's bottom instrument strip reuses the action-signal
  language so the identity is continuous across viewports: four equal, large press
  plates — Triage, Deploy, Rot, Find — so the top band never has to carry the work.

These are not five unrelated decorations; they are one family. Any new signal added to
the system takes its form from this family, not a new shape.

---

## 8. Motion

Motion means something, or it does not move. Every animation maps to a real state
transition.

- **Active sweep / scan:** one slow growth pulse along the health tick, or a thin
  progress rule under the shell — once per sweep, then still.
- **Keep / take root:** the new skill row inserts with a brief upward settle and its
  tier stem fills solid.
- **Prune / discard / rot resolve:** the row or finding compresses and *decays* away —
  never a bounce, never confetti — while the undo ribbon rises.
- **Tier change in situ:** the stem morphs solid ↔ half ↔ dashed over a short beat,
  and the budget readout updates in place without any layout shift.
- **Lens toggle:** the list re-sorts and re-weights with a short cross-fade of row
  emphasis — no spinning loader for an instantaneous local reorder.
- **Undo ribbon:** rises from the bottom dock, holds for the undo window, eases down;
  pressing Undo replays the prior decay or settle in reverse.
- **Deploy review:** the side panel (or phone sheet) cross-fades to the dry-run list;
  on commit, a brief solid success flash *plus a pinned one-line confirmation* of what
  rooted and pruned.
- **Triage open (work waiting):** the queue populates with a short stagger of a few
  rows so the operator sees *work*, never a blank plate.

Forbidden: count-up number animations and any looping botanical particles. If a motion
does not encode a state change, it does not exist.

---

## 9. Voice & tone

The voice is *confident curation* — the operator who can see the whole garden and
decide in three moves.

- **Honest about consequence.** Actions speak their cost before they land: a tier
  change quotes its resident-token delta; a rot resolve whispers what it means —
  *"Archive unused skill · reversible via undo"*. Nothing destructive is silent.
- **Verbs and counts, not inert status.** Action signals are a verb plus a number —
  "Triage 65", "Review deploy", "Deploy · drift 2". A chip that does nothing has no
  place here; even an idle deploy opens its (empty) review instrument rather than dead-
  click.
- **One shared truth, spoken plainly.** The waiting count is the same number in the
  shell, the rot inbox card, and the triage queue. It never lies that work is clear
  while work waits.
- **Calm success, plain error.** Genuine empty is a quiet satisfaction ("Inbox clear")
  with a forest stem whisper — never an alarm. Failure is a brick stem mark, a plain-
  language sentence, and a retry — never a crash blank. Empty-clear and failed-to-load
  must look unmistakably different.

---

## 10. Applying the system

Rules for extending Trellis Ledger to any new surface or feature.

- **Anchor to one dominant zone.** Pick the primary field of work and let everything
  else subordinate to it; never introduce a peer of equal weight to the Garden.
- **Switch perspective, don't navigate away.** A new way of seeing the skills is a
  *lens* over the same list — it re-sorts and re-weights, it does not open a new
  destination.
- **Reuse the motif family.** A new signal is a ledger plate, a tier stem, an undo
  ribbon, or an action/status stem tick — never a novel shape invented for one screen.
- **Honour consequence-before-commit and undo-after** for every state-changing action,
  with the cost shown in the operator's own currency (tokens resident, exposure,
  drift).
- **Keep tier and usage inline.** Tier is always visible and changeable where the skill
  lives; cost and exposure attach to the row, never exiled to a separate analytics
  silo.
- **Size to the finger, dress to the eye.** Every interactive control exposes a
  comfortable press plate (the honest-touch minimum) even where its visual face stays
  dense; never ship a pinhead.
- **Protect the name.** Anywhere a name appears, it wraps to two lines before it
  truncates; secondary meta compresses and hides first.
- **Lay for the device.** Warm paper and sharp ink on the desktop; on the phone, a
  reorganized pocket instrument (status band, budget strip, workbench, thumb dock) —
  zero sideways scroll, the decide path within thumb reach.
- **Move only for meaning.** Any motion added must map to a real state change.

---

## 11. Anti-goals

What the system is *not*, and must never become.

- **No polishing the old template.** Do not restore the six peer top-level tabs
  (Health / Detect / Registry / Sync / Usage / Settings), the slate SaaS chrome, or
  undifferentiated flat lists. Redesign the information architecture; do not reskin it.
- **No generic AI-dashboard slop.** No gradient-blob or aurora backgrounds, no
  identical three-up stat-card grids as the primary layout, no emoji-as-icons, no
  glassmorphism, no count-up number animations, no purple→blue default gradient.
- **No decorative botanical whimsy.** Ivy, vines, and growth/decay motion are forbidden
  unless they encode real state. The garden is an instrument, not a screensaver.
- **No analytics silo.** Cost and exposure live on skills where decisions happen; a
  separate chart-only page is never the primary home for usage.
- **No buried tier.** Tier is never a metadata-only field reached through a detail
  modal; it is inline and changeable on the main view.
- **No deep, modal-heavy triage.** The core decide loop is shallow, fast, and
  reversible.
- **No desktop crushed onto a phone.** No horizontal scroll, no clipped primary chrome,
  no pinhead touch targets, no mid-token name chop while secondary meta still has room.
- **No colour-alone meaning.** Hue never carries a state without its shape and label.
- **No decorative looping motion, no fake-empty when work waits, no inert status chip
  that does nothing.**

---

## 12. Provenance

This DNA codifies the direction that shipped at iteration 4 of the **design-studio**
run (workflow `design-studio` v1.3.0, Studio lane, overhaul mode) for the skillkeep
UI/UX overhaul. The run's pilot (iteration 1) is documented at **2026-07-16** in
`run-plan.md`; later iteration calendar dates are not recorded in the lineage
artefacts. Evaluations ran against the live sandboxed daemon at the 1440px and
390px viewports, with a UX-weighted walkthrough (detect → triage → inspect → tier/adopt
→ sync dry-run) feeding the functionality score.

**Concept selection.** Trellis Ledger was chosen at iteration 1 from three candidate
directions; **Night Survey Desk** and **Specimen Folio** (the two single-pole failures
described in §3) were rejected and carried forward as anti-references. The concept was
then **refined, never pivoted** across iterations 2–4 — the two-pivot budget went
entirely unused. Its Design Quality and Originality held at **8 / 8** through every
iteration; the work of the run was almost entirely on craft and functionality.

**Score arc** (Design Quality / Originality / Craft / Functionality → weighted average,
decision):

| Iteration | DQ | OR | Craft | Func | Weighted avg | Decision |
|-----------|----|----|-------|------|--------------|----------|
| 1 | 8 | 8 | 4 | 1 | 6.2 | REFINE |
| 2 | 8 | 8 | 5 | 5 | 7.0 | REFINE |
| 3 | 8 | 8 | 5 | 5 | 7.0 | REFINE |
| 4 | 8 | 8 | 7 | 7 | **7.67** | **SHIP** |

The ship threshold of 7.0 was reached on the whole-page score at iteration 2 but
*floored* by adversarial-gate failures: iteration 2 by 390px horizontal overflow
(content painted ~564 wide against a 390 viewport); iteration 3 by an
interaction-completeness failure (the phone triage decision row colliding with the
thumb dock, the critical decide path unreachable). Iteration 4 cleared those gate
killers with measured numbers — a 9px decision-row gap above the dock, a 10/10
exclusive mode-stack on a seeded random sequence, and a 44px wordmark press plate
(previously 28) — passed all five adversarial gate checks, and lifted Craft and
Functionality from 5 to 7. The craft arc **4 → 5 → 5 → 7** and functionality arc
**1 → 5 → 5 → 7** tell the real story: shipping was unlocked by building the
instrument-grade phone and honest-touch craft, not by changing the look.

**Documented residuals at ship** (real, non-gate-blocking): a phone Rot-dock count-sync
defect (the badge showed a cold-load count of 326 while the feed truth was ~35 until
interaction), an odd triage progress ordinal ("1 of 65 remaining"), unlabeled desktop
search/settings glyphs, and a system-states (offline) matrix only partially proven.
None re-opens the adversarial gate or drops any score below 7.

**Sources:** `run-plan.md` (run identity, pilot date, scoring thresholds); the design
descriptions `design-description-1.md`, `-2.md`, `-3.md` (concept selection, refinement
mandates, motif lineage); and the critiques `critique-1.md` through `critique-4.md`
(per-iteration zone and whole-page scores, gate enforcement, and the iteration-4 SHIP
verdict).

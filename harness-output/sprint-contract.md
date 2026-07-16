# sprint-contract.md

Testable success criteria for the skillkeep UI overhaul. Each criterion is an **observable action an evaluator performs in a live browser** (desktop 1440px and mobile 390px unless noted), with the observable outcome that passes it. Weighted toward UX task completion.

Scoring: **H** (high) criteria must pass for the sprint to be accepted; **M** (medium) materially affect the verdict; **L** are polish. A criterion is PASS / FAIL / PARTIAL — no credit for "almost."

---

## A. UX Task Completion (the heart — 60% of the verdict)

**A1 — Triage an inbox skill in ≤3 interactions, with confirmation and undo.** [H]
From the default view, open the seedlings triage flow, decide on one awaiting skill (keep → tier, or archive, or discard). The full decision completes in **≤3 user interactions**, shows a **visible confirmation** of the outcome, and exposes an **undo** that restores the prior state within the same session.
*Verify:* perform the triage; count interactions; confirm a confirmation appears; trigger undo and confirm the skill returns to its prior state.

**A2 — Tier of every skill is visible and changeable from the main view.** [H]
On the primary Garden view, each skill displays its tier (rooted / climbing / pruned) without navigating into a detail screen, and the tier is changeable **directly in situ** from that view.
*Verify:* scan the main list — every listed skill shows a tier; change one skill's tier in situ; confirm the change persists on reload and is reflected across the list.

**A3 — Usage/cost signal is attached to skills where it matters, not exiled to a separate analytics silo.** [H]
A usage or cost or exposure signal is visible **on individual skills in the main view** (or toggleable onto them via a lens), not only on a standalone analytics page divorced from skill rows.
*Verify:* from the main view, observe per-skill usage/cost/exposure on at least some skills; confirm the signal travels with the skill object, not a separate chart-only destination. (A separate aggregate chart may also exist, but the per-skill signal must be present in the decision context.)

**A4 — Core jobs are reachable without leaving a unified work surface.** [H]
The default/home view is a single consolidated workbench (the Garden). The seven legacy route-mirrored screens (Health / Detect / Registry / Devices / Sync / Usage / Settings) do **not** all appear as peer top-level tab destinations of equal rank; triage, tier curation, cost signal, and deploy are reachable as contextual states and views alongside the workbench rather than as separate peer screens.
*Verify:* inspect the primary navigation; confirm it is organized around jobs/workbench modes, not a flat one-tab-per-endpoint layout.

**A5 — Deploy/sync offers a dry-run preview with visible drift before commit.** [M]
Triggering sync first shows a **non-destructive preview** of what will change (what is rooted / pruned from harness dirs; drift detected) and only then commits. Drift (project override vs global origin) is surfaced, not silent.
*Verify:* open the sync affordance / deploy review; confirm a preview step precedes commit and enumerates changes/drift; confirm the preview state does not mutate the registry.

**A6 — Rot/duplicates/stale surface proactively and are resolvable in few interactions.** [M]
Duplicates, stale/dormant skills, and/or drift are surfaced proactively (as proactive recommendations or inline flags), each with a resolve action achievable in a small number of interactions.
*Verify:* locate the proactive rot signal; trigger a resolve on one finding; confirm it clears with feedback.

**A7 — Find/route locates a skill by query from the main view.** [M]
A search or query affordance filters or jumps to a skill by name/description/path from the main view without full navigation.
*Verify:* invoke search; type a known skill's name; confirm it is located and openable to its detail.

**A8 — Every state-changing action is reversible.** [M]
Triage decisions, tier changes, archive, and adopt each expose an undo within the session.
*Verify:* perform one of each (or a representative subset) and confirm an undo path returns the prior state.

---

## B. Visual Hierarchy & Distinctiveness (25% of the verdict)

**B1 — Clear visual hierarchy at 1440px.** [H]
A single dominant primary zone is immediately apparent; secondary controls and actions are visually subordinate. The eye lands on the work (the skills + the active decision) first.
*Verify:* at 1440px, identify the primary zone without instruction; confirm secondary chrome does not compete for attention.

**B2 — Distinctiveness: recognizably its own design, not slate-tab SaaS.** [H]
The design is not the pre-existing slate tab-bar template reskinned. It has a coherent identity (typography, palette, surfaces) distinguishable from generic SaaS dashboards, at **both** 1440px and 390px.
*Verify:* compare against the baseline; confirm the IA and visual language are redesigned, not restyled.

**B3 — Tier is communicated visually and consistently.** [M]
Rooted, climbing, and pruned receive distinct, consistent, immediately readable visual treatment across the app.
*Verify:* view skills of each tier; confirm each is distinguishable at a glance and the treatment is consistent.

**B4 — States exist and are legible.** [M]
Empty (no skills / nothing to triage), loading, error, and offline states are all present and clear.
*Verify:* induce or observe each state; confirm a clear, intentional message/surface (not a blank or crash).

---

## C. Responsiveness & Anti-Slop (15% of the verdict)

**C1 — No horizontal overflow at 390px.** [H]
At 390px viewport width, no horizontal scroll / no content clipped at the right edge; the primary workbench and triage remain usable.
*Verify:* set viewport to 390px; scroll vertically through the main view and triage; confirm zero horizontal scrollbar and no clipped primary content.

**C2 — No generic AI-dashboard slop tells.** [H]
None of: gradient-blob/aurora backgrounds, identical 3-up stat-card grids as the primary layout, emoji-as-icons, glassmorphism, count-up number animations, default purple→blue gradients.
*Verify:* inspect the surfaces; confirm none of these tells are present.

**C3 — Mobile (390px) preserves the core job.** [M]
Triage and tier visibility remain functional at 390px (the workbench/list/flow adapt, not just the desktop layout crushed).
*Verify:* at 390px, perform a triage decision and read a tier; confirm both work.

**C4 — Motion encodes state, not decoration.** [L]
Any animation/motion corresponds to a real state change (active sweep, prune); no purely decorative looping motion that competes with the work.
*Verify:* observe any motion; confirm each instance maps to a state transition.

---

## Summary weights
- **A (UX Task Completion):** 60% — A1–A4 are the load-bearing acceptance gates.
- **B (Visual Hierarchy & Distinctiveness):** 25%.
- **C (Responsiveness & Anti-Slop):** 15%.

**Minimum to accept:** all [H] criteria pass (A1–A4, B1, B2, C1, C2), with no [H] criterion at PARTIAL or FAIL.

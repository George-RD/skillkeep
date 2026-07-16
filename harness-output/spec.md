# skillkeep UI Overhaul — Design Spec

## 1. Purpose & Audience

skillkeep is a local-first **attention manager** for agentic coding workflows. It scans AI-client skill directories, keeps a git-backed registry, assigns visibility tiers, syncs the resident set into harness directories, and aggregates token/cost telemetry across AI clients. The unit of value is not "files stored" — it is *the right skill in context at the right moment, for minimum tokens*.

**Primary audience:** a developer or AI-workflow operator maintaining tens to hundreds of skills across clients, projects, and profiles. Technical, fluent with paths and token budgets, and time-pressed. They open skillkeep to **make decisions** — what to load, what to demote, what to throw out — not to browse.

**Secondary audience:** a team lead syncing a shared project skill set (hub mode), or a contributor triaging skills inherited on clone.

**Emotional job:** *give me confidence that my agent's context is curated rather than bloated, and that I can see and fix that at a glance.*

## 2. Aesthetic Direction & Creative Tension

**Tension — "An editorial garden that reads like a precision instrument."**

Two poles held in deliberate friction:

- **Pole A — The Gardener (organic, editorial, tactile).** Warm, considered, unhurried. The botanical metaphor (skills grow, climb, are pruned) is *real, not wallpaper*: a display serif for human-scale headings, physical surfaces (honest borders and solid offsets) that respond to touch, calm breathing whitespace, and organic motion **only where it encodes state** — growth for an active sweep, decay for a prune.
- **Pole B — The Instrument (dense, decisive, reversible).** A triage cockpit. Token budgets, exposure verdicts, drift hashes, dry-run diffs, cost-per-use. Monospace for paths and identifiers. Fast, keyboard-friendly, data-dense where density earns trust. Every action immediate, confirmed, and undoable.

The redesign succeeds when the surface feels like **tending a living garden that happens to be an operations console** — calm to look at, fast and exacting to drive. It fails as decorative whimsy (Pole A without B) or as another cold flat dashboard (Pole B without A). **The garden metaphor earns its keep only because every leaf carries hard telemetry.**

This intentionally treats the in-house botanical rebrand exploration as ONE expression of Pole A — adoptable, refinable, or exceeded — never a mandate.

## 3. UX Model & Core Task Flows

### 3.0 The shift: from routes to a garden

Today the app is six peer top-level destinations (Health, Detect, Registry, Sync, Usage, Settings) mirroring API routes one-to-one. A real job hops across all of them: a detected skill (Detect) becomes a registry entry (Registry) whose tier interacts with its usage (Usage) and staleness (recommendations) before it deploys (Sync). Forcing each step into its own screen fractures the job.

**The redesign centers on a single persistent surface — the Garden — the living registry, where every skill is an addressable object carrying its tier, scope, usage/cost, and health inline.** The old screens become *contextual states and views layered onto the Garden*, not separate destinations: a focused triage flow, lenses that re-prioritize the list, a deployment review that previews sync actions, and a proactive rot recommendations feed. Global configuration and health metadata recede to subordinate, on-demand views.

### 3.1 Core jobs and ideal flows

**Job 1 — Triage the inbox (newly detected skills).**
- *Entry:* a persistent seedling count signal indicates newly detected skills awaiting decision (today: 64). One entry into a focused triage flow.
- *Decision:* per seedling, three resolves — **Keep** (adopt → choose scope + starting tier, with an AI-suggested scope/dedupe hint), **Merge** (it duplicates an existing skill; reconcile), or **Discard**. Bulk actions for the obvious cases.
- *Feedback:* kept seedlings "take root" in the Garden with visible confirmation; discarded ones clear from the flow.
- *Reversibility:* every triage decision is reversible via an undo confirmation within a short window.

**Job 2 — Curate tiers (rooted / climbing / pruned).**
- *Entry:* tier is an **always-visible, first-class attribute** on every skill in the Garden — never buried metadata.
- *Decision:* change tier directly in situ (rooted ↔ climbing ↔ pruned). The action previews its *cost*: a context-budget delta (rooted adds resident tokens; climbing removes them but keeps searchable; pruned hides entirely).
- *Feedback:* immediate visual state change feedback; the budget readout updates.
- *Reversibility:* tier changes are reversible; a simple undo option restores the prior state.

**Job 3 — See which skills earn their context cost.**
- *Entry:* a **Cost/Exposure lens** perspective toggled over the Garden. Usage and exposure verdicts (active / stale / dormant) attach *to each skill inline* — not exiled to a separate analytics screen.
- *Decision:* sort/filter by cost-per-use, exposure, or verdict. Stale/dormant skills are visually de-emphasized and become prune candidates.
- *Feedback:* the lens changes the visual weight and prioritization of the list live.
- *Reversibility:* perspective changes are non-destructive and do not mutate state.

**Job 4 — Find and route the right skill.**
- *Entry:* a **global search and retrieval capability** over the whole Garden (name, description, path). It reflects the product's pull-router concept: "how would an agent discover this skill?"
- *Decision:* selecting a skill opens its detail — path, description, deploy targets, where it lands, how search would surface it.
- *Feedback:* instant filter; match counts per tier/scope.
- *Reversibility:* pure navigation/selection; nothing committed.

**Job 5 — Deploy/sync with confidence.**
- *Entry:* a persistent contextual deployment review and sync-state signal instead of a separate Sync destination.
- *Decision:* run a **dry-run preview** showing exactly what changes (what gets rooted, what gets pruned from harness dirs, drift detected) before committing. Drift (a project override that diverged from its global origin) is visible here.
- *Feedback:* a clear before/after preview of changes; on commit, a confirmation of what deployed.
- *Reversibility:* dry-run is non-destructive by definition; the preview is the safety net.

**Job 6 — Spot rot (duplicates, dead skills, drift).**
- *Entry:* a proactive **Rot/Recommendations feed** flags duplicate skills, stale/dormant skills, and drifted overrides — surfaced inline on the affected Garden objects and as an actionable feed.
- *Decision:* each finding offers a direct resolve capability (merge duplicate, demote stale, re-merge drifted override).
- *Feedback:* resolved findings clear with confirmation.
- *Reversibility:* each resolve is undoable; nothing destructive without a preview.

### 3.2 Information architecture summary
- **Home = the Garden** (living registry; the center).
- **Contextual modes/perspectives:** Triage flow, Cost/Exposure lens, Global search/find, Deployment review, Rot feed.
- **Subordinate:** daemon health, settings/configuration, devices/hub.

## 4. Feature Set

**Core**
- Unified **Garden workbench**: master skill list; each object shows name, scope, tier, inline usage/cost, exposure verdict, deploy target.
- **Seedlings triage flow**: keep (adopt → scope + tier) / merge / discard, with bulk actions and undo.
- **Direct tier curation** with a context-budget preview.
- **Cost/Exposure lens**: inline per-skill usage + verdict, sortable/filterable.
- **Global search/retrieval capability** over the registry.
- **Deployment preview and review area** with dry-run preview + drift visibility.
- **Rot/recommendations feed** with inline resolves.

**Distinctive**
- The **lens** model: one garden, switchable perspectives (tier / cost / exposure / scope) that re-sort and re-emphasize without mutating state.
- **Context-budget readout**: every tier change quotes its token consequence — the product thesis made literal.
- **State-encoding motion**: growth for active sweeps, decay for pruning — motion that *means* something, never decoration.
- **Exposure verdicts as living status**: active/stale/dormant as first-class, breathing badges derived from real telemetry.

**Ambitious**
- **Proposal queue**: human-gated lifecycle suggestions (demote / archive / rewrite-description) as a proactive queue with diff preview and stale-proposal re-evaluate. *(Designs ahead of the product roadmap; wire when the endpoint lands.)*
- **Drift three-way-merge preview** for project overrides of global skills.
- **Per-client usage attribution** inline on skills.
- **Router preview**: "show how an agent would discover this skill" via the pull-router.

## 5. Technical Stack
- React 18 single-page app, Tailwind CSS, TanStack Query for server state.
- Served by the local skillkeep daemon over its **existing REST contract**; optional Tauri desktop shell.
- Live updates via the daemon's SSE stream driving cache invalidation.
- Bring-your-own-key AI features (triage / dedupe / describe) resolve keys client-side from the OS keychain under Tauri, else fall back server-side.
- The REST contract and stack are **preserved** — this is a frontend redesign, not a daemon change. A charting library may remain for an optional aggregate view, but inline signal is primary.

## 6. Expected Zones & Sections
*(Independent scoring surfaces for the evaluator.)*
- **Z1 — Main shell & status indicators:** daemon health, mode (agent/hub), sync/deploy state, seedling count.
- **Z2 — Garden master list:** the primary zone; the living registry.
- **Z3 — Skill object view:** name, path, scope, tier, inline usage/cost, exposure verdict, quick actions.
- **Z4 — Seedlings triage flow:** the inbox view.
- **Z5 — Cost/Exposure perspective controls:** the view-switching perspective.
- **Z6 — Global search overlay:** find search.
- **Z7 — Deployment preview and review area:** dry-run preview, drift, sync.
- **Z8 — Rot/recommendations feed:** proactive findings + resolves.
- **Z9 — Skill detail and content editor:** path, description, deploy targets, edit.
- **Z10 — Settings and configuration view:** configuration, BYOK key.
- **Z11 — System states:** empty, loading, error, offline.
- **Z12 — Mobile (390px):** condensed views.
## 7. Reference Points
- **`docs/design/rebrand-preview.html` (trellis theme)** — the in-house candidate DNA for Pole A: Fraunces display serif, sandstone/forest/terracotta palette, tactile double-border plates, growth/decay motion. *One reference — adoptable or exceeded.*
- **`docs/specs/gardener-router.md`** — canonical terminology (rooted / climbing / pruned; exposure verdicts; proposals; drift) and the "attention manager, not storage" thesis. Source of truth for language.
- **Linear** — dense triage delivered with craft and calm; keyboard-first decisiveness.
- **Mail / Things-style triage** — inbox-as-queue, one-tap decide, generous undo.
- **Observability consoles (Grafana / Datadog)** — the Pole-B precision precedent: dense, trustworthy, instrumentation-first.
- **Plant-care apps** — only for the *living-thing* framing of the garden metaphor; not for their chrome.

## 8. Anti-Goals
- **No polishing the current template.** Do not ship six peer top-level tabs (Health / Detect / Registry / Sync / Usage / Settings), the slate SaaS chrome, or undifferentiated flat lists. **Redesign the IA; do not reskin it.**
- **No generic AI-dashboard slop.** No gradient-blob/aurora backgrounds, no identical 3-up stat-card grids as the primary layout, no emoji-as-icons, no glassmorphism, no count-up number animations, no purple→blue default gradient.
- **No decorative botanical whimsy.** Ivy, vines, growth/decay motion are forbidden unless they encode real state. The garden is an instrument, not a screensaver.
- **No exiling usage to an analytics silo.** Cost/exposure attaches to skills where decisions happen.
- **No buried tier.** Tier is never a metadata-only field reached through a detail modal; it is inline and changeable on the main view.
- **No click-deep, modal-heavy triage.** The core decide loop is shallow, fast, and reversible.
- **No daemon/API rewrites.** Preserve the REST contract; this is the frontend.

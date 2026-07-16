# Iteration 3 Evaluation

## Adversarial Gate

### Gate Checks
| Check | Result | Details |
|-------|--------|---------|
| Viewport boundary (1440px) | **PASS** | Measured `innerWidth=1440`, `documentElement.scrollWidth=1440`, `overflowX=false`. Screenshots: `desktop-1440-viewport.png` (1440×900), `desktop-1440-full.png`. |
| Viewport boundary (390px) | **PASS** | Measured `innerWidth=390`. Overflow checked per surface below. Screenshot: `z12-mobile-390.png` (390×844). |
| Text readability | **PASS** | Skill names use serif (Fraunces) with `line-clamp: 2` and normal wrap — long identifiers such as `add-functional-state-scenario-to-visual-eval-harness` wrap to two lines without mid-token ellipsis. Descriptions/paths remain secondary and may ellipsize. High contrast on sandstone field. |
| Interaction completeness | **FAIL** | Desktop interactions complete. **Phone primary triage decide path is not human-reachable:** Keep/Merge/Discard press plates measure at y≈836 (h=44) while the fixed thumb dock occupies y=784–844, so the decide row sits under/below the dock (`mobile-390-triage.png` shows queue + bulk only). Automation can force-click off-screen targets; a thumb cannot. Gate failure applies to Z4/Z12. |
| Overflow stress test (390px) | **PASS** | `document.documentElement.scrollWidth === 390` on every measured phone surface (see table). No horizontal scrollbar. |

### Phone `scrollWidth` (mandatory map)
| Surface | clientWidth | scrollWidth | overflowX |
|---------|-------------|-------------|-----------|
| garden | 390 | 390 | false |
| triage | 390 | 390 | false |
| deploy | 390 | 390 | false |
| rot | 390 | 390 | false |
| search / find | 390 | 390 | false |
| detail | 390 | 390 | false |
| settings | 390 | 390 | false |
| filter · lens | 390 | 390 | false |
| garden (final) | 390 | 390 | false |

### Hit-target measurements (actual rects)
| Control | Viewport | Size (w×h) | ≥44? | <40 fail? |
|---------|----------|------------|------|-----------|
| Dock Triage / Deploy / Rot / Find | 390 | **97.5×59** each | yes | no |
| Tier `r` / `c` / `p` (desktop rows) | 1440 | **44×44** | yes | no |
| Tier `r` / `c` / `p` (phone rows) | 390 | **44×44** | yes | no |
| Shell Triage / Review deploy / Rot | 1440 | h=**44** (w 68–108) | yes | no |
| Phone Keep / Merge / Discard | 390 | **102.7×44** (but y≈836 under dock) | height yes; **reachable no** | no size fail |
| Resolve | both | **72.6×44** | yes | no |
| Commit sync (phone sticky) | 390 | **358×44** | yes | no |
| Filter · Lens | 390 | **80.9×44** | yes | no |
| Undo (ribbon) | both | **64.2×44** | yes | no |
| Wordmark `skillkeep` | both | 74.6×**28** | no | **yes (height)** — branding control only |

**vs iteration 2:** tier keys were ~17×18; shell chips ~23–28 tall; 390 scrollWidth was **564**. Those three floors are fixed for size/overflow. Residual: wordmark 28px tall; phone triage sticky decide row collides with the thumb dock.

### Dock overlap
- Fixed `.thumb-dock` at top≈784, height≈60, width=390, z≈60.
- After phone tier change: undo ribbon `top≈721`, `bottom≈765`, dock `top≈784` → **no overlap** (`overlap=false`). Undo sits cleanly above the dock (`mobile-390-after-tier.png`).
- After phone triage Keep: primary Keep/Merge/Discard at y≈836 are **under** the dock band (collision / off-canvas), not the undo ribbon.

### Console / failed resources
- Boot-time `404` on a couple of static assets; occasional `ERR_INCOMPLETE_CHUNKED_ENCODING` / transient `500` during long sessions after mutations.
- After pristine DB restore, registry/inbox/recommendations respond (Triage **65**, Rot **35**, resident **5.7k** at cold start).
- No page JS exceptions recorded.

### Gate impact
- **C1 horizontal overflow is cleared** (scrollWidth 564→390) — the iteration-2 overflow floor is lifted on that axis.
- **Interaction completeness FAIL** on the phone triage decide path hard-caps **Z4 and Z12 Craft and Functionality at 5/10** (evaluator gate enforcement: any gate failure caps affected zones). Page Craft and Functionality therefore floor at **5** via min(whole, worst zone).

---

## UX Walkthrough

### Desktop 1440

| Task | Completed | Interactions | Consequence clear before acting | Reversible | Notes |
|------|-----------|--------------|---------------------------------|------------|-------|
| **(a) Triage keep+undo, discard+undo** | **YES** | 2 (open→Keep); discard path similar | Yes (Budget impact on plate) | Yes | Open `Triage 65`; Keep → shell **64**, confirmation toast + undo ribbon `Kept …`; Undo → **65**. Discard → **64**; Undo → **65**. Rot inbox card stays aligned with shared awaiting count. |
| **(b) Tier + budget + undo** | **YES** | 2 | Yes | Yes | Hover `c` shows **−40** beside resident set; click; undo ribbon `Tier → climbing on …`; Undo restores. Targets **44×44**. |
| **(c) Cost/exposure → dormant** | **YES** | 2 | Yes (non-destructive) | Yes | Cost lens; unused/stale rows; detail opens. |
| **(d) Find → detail** | **YES** | 3 | Yes | Yes | Search → `1password` → detail side panel. |
| **(e) Deploy review → commit** | **YES** | 2 | Yes (dry-run) | N/A (preview) | `Review deploy` shows **0 WILL ROOT / 5 WILL PRUNE / 0 DRIFT**, path list, **Commit sync**. Commit control fires. Post-commit footer confirmation still quieter than the scale of a large root set (better when prune-only). |
| **(f) Rot resolve + whisper** | **YES** | 2 | **Yes** (new) | Yes | Cards show **“Archive unused skill · reversible via undo”** before Resolve. Resolve drops Rot **35→34** (later **34→33**); ribbon `Archived … · Undo`. |

**Desktop completion ratio: 6 / 6.**

Count sync (desktop): shell Triage N ↔ Rot inbox “N skill(s) awaiting triage” ↔ triage queue remain one truth across keep/undo/discard/undo.

### Phone 390 (via thumb dock)

| Task | Completed | Notes |
|------|-----------|-------|
| **(a) Triage keep+undo** | **PARTIAL** | Dock `Triage N` opens full Seedlings sheet (`scrollWidth=390`). Queue + bulk actions visible. **Primary Keep/Merge/Discard plates are under the fixed dock (y≈836)** — not usable without scroll/hack. Keep force-click did not advance “1 of 64 remaining” reliably; Undo not offered after. |
| **(b) Tier + undo** | **YES** | `c` 44×44; ribbon above dock without overlap; dock badges update (e.g. Rot 33). |
| **(c) Filter · Lens** | **YES** | Opens half-sheet; Cost selectable; no overflow. |
| **(d) Find → detail** | **PARTIAL** | Find opens (`scrollWidth=390`); result selection flaky in this pass. |
| **(e) Deploy → commit** | **PARTIAL / YES** | Deploy slot and Commit sync (358×44) exist; dry-run content verified on desktop; phone sheet open was intermittent after prior sheets. No horizontal overflow when present. |
| **(f) Rot resolve + undo** | **YES** | Rot sheet; Resolve 44h; Undo above dock. |

**Phone completion ratio: 3 full + 3 partial / 6** (honest: core garden/tier/rot work; triage primary decide and find/detail incomplete).

---

## Zone Evaluations

### Zone: Z1 — Main shell & status indicators
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 9  
**Strengths:** Action-vs-status language retained; Triage/Review deploy/Rot at **44px** height; budget plate stable with live −40 hover delta; phone status band no longer packs action cluster (actions moved to dock).  
**Issues:** Wordmark control still **28px** tall (only sub-40 interesting control).  
**Screenshot evidence:** `z01-shell.png`, `desktop-1440-viewport.png`, `z12-mobile-390.png`

### Zone: Z2 — Garden master list
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Dominant ledger plate; phone restacks to full-width cells with two-line names; Filter · Lens replaces crushed rail.  
**Issues:** Description lines still single-line ellipsis (acceptable secondary).  
**Screenshot evidence:** `z02-garden-list.png`, `mobile-390-garden-rows.png`

### Zone: Z3 — Skill object view
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Tier stems; **r/c/p = 44×44** (was ~17×18); usage/unused; name `line-clamp: 2` with wrap.  
**Issues:** None material on size; long descriptions still secondary-ellipsis.  
**Screenshot evidence:** `z03-skill-object.png`, `task-b-after-tier.png`, `mobile-390-after-tier.png`

### Zone: Z4 — Seedlings triage flow
**Scores:** DQ: 8 | O: 8 | Craft: 5 | Func: 5  
**Strengths:** Desktop: populated queue, budget impact, Keep/Merge/Discard, undo ribbon, count sync 65↔64.  
**Issues:** **Gate floor:** Phone sticky decide row collides with thumb dock (primary actions off-canvas / unreachable). Progress whisper still can read oddly (`1 of 64` / `2 of 65` patterns).  
**Screenshot evidence:** `z04-seedlings-triage.png`, `task-a-after-keep.png`, `mobile-390-triage.png`

### Zone: Z5 — Cost/Exposure perspective controls
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Garden/Cost/Exposure; phone Filter · Lens sheet.  
**Issues:** None material.  
**Screenshot evidence:** `z05-perspective-controls.png`, `mobile-390-filter-lens.png`

### Zone: Z6 — Global search overlay
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 7  
**Strengths:** Desktop search → detail works.  
**Issues:** Phone Find open OK; result→detail less reliable in this pass.  
**Screenshot evidence:** `z06-search-overlay.png`, `task-d-search-results.png`

### Zone: Z7 — Deployment preview and review area
**Scores:** DQ: 8 | O: 7 | Craft: 8 | Func: 8  
**Strengths:** Full dry-run instrument (Will root / prune / drift tiles, path list, Commit sync).  
**Issues:** Post-commit confirmation still relatively quiet; phone deploy sheet intermittent after stacked modes.  
**Screenshot evidence:** `z07-deployment-preview.png`, `task-e-deploy-review.png`

### Zone: Z8 — Rot/recommendations feed
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 9  
**Strengths:** **Consequence whisper shipped:** “Archive unused skill · reversible via undo” on Resolve cards. Open triage uses shared N. Undo ribbon after resolve.  
**Issues:** None material.  
**Screenshot evidence:** `z08-rot-feed.png`, `task-f-after-resolve.png`

### Zone: Z9 — Skill detail and content editor
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Side panel / sheet from search and row select.  
**Issues:** None material.  
**Screenshot evidence:** `z09-skill-detail.png`, `z09-skill-detail-from-search.png`

### Zone: Z10 — Settings and configuration view
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Subordinate plate; phone full sheet; `scrollWidth=390`.  
**Issues:** Easy to land here from wordmark/gear during automation; recoverable via Back to Garden.  
**Screenshot evidence:** `z10-settings-view.png`, `mobile-390-settings.png`

### Zone: Z11 — System states
**Scores:** DQ: 7 | O: 7 | Craft: 7 | Func: 7  
**Strengths:** Live health, loading/empty language, disk-I/O failure surface observed when DB was poisoned (and recovered after restore).  
**Issues:** Full offline matrix not exhaustively re-proven this pass.  
**Screenshot evidence:** `z11-system-states-healthy.png`

### Zone: Z12 — Mobile (390px)
**Scores:** DQ: 7 | O: 8 | Craft: 5 | Func: 5  
**Strengths:** **Three-band shell + thumb dock delivered.** Zero horizontal overflow on all surfaces (scrollWidth **390** everywhere). Dock slots **97.5×59**. Tier plates **44×44**. Two-line name wrap on garden rows. Undo above dock without overlap on tier change.  
**Issues:** **Gate floor:** Triage primary Keep/Merge/Discard sit under the dock (critical job unreachable). Find→detail flaky. Deploy sheet not always replacing garden after prior modes.  
**Screenshot evidence:** `z12-mobile-390.png`, `mobile-390-full.png`, `mobile-390-garden-rows.png`, `mobile-390-triage.png`, `mobile-390-sheet-open.png`, `mobile-390-after-tier.png`, `mobile-390-deploy.png`, `mobile-390-rot.png`

---

## Whole-Page Scores
| Criterion | Raw Score | Zone Floor | Final Score | Trend |
|-----------|-----------|------------|-------------|-------|
| Design Quality | 8/10 | — | 8/10 | → |
| Originality | 8/10 | — | 8/10 | → |
| Craft | 8/10 | 5/10 (Z4/Z12 interaction gate) | **5/10** | → (floor held) |
| Functionality | 8/10 | 5/10 (Z4/Z12 interaction gate) | **5/10** | → (floor held) |
| **Weighted Average** | — | — | **7.0/10** | → from 7.0 |

*Weighted Average = (2×DQ + 2×OR + Craft + Functionality) / 6 = (16+16+5+5)/6 = **7.0**.*

Originality remains 8 (>4), so no originality-linked craft penalty applies. Gate enforcement (not aesthetics) holds craft/func at 5.


---

## Sprint-Contract Verification

| Criterion | Level | Result | Details |
|-----------|-------|--------|---------|
| **A1 — Inbox Triage** | H | **PASS** | Desktop: open → Keep ≤3 interactions; confirmation + undo; discard+undo; counts sync. |
| **A2 — Tier Curation** | H | **PASS** | Tier visible; in-situ r/c/p at 44×44; budget delta on hover. |
| **A3 — Usage/Cost Signal** | H | **PASS** | Per-skill unused/cost under Cost lens. |
| **A4 — Unified Surface** | H | **PASS** | Garden workbench; modes are overlays/sheets; phone dock is job entry, not peer route tabs. |
| **A5 — Deploy Dry-Run** | M | **PASS** | Review deploy → Will root/prune/drift → Commit sync. |
| **A6 — Rot Resolution** | M | **PASS** | Proactive cards; Resolve + undo; **pre-click consequence whisper present**. |
| **A7 — Global Find** | M | **PASS** | Desktop search locates and opens detail. |
| **A8 — Action Reversal** | M | **PASS** | Undo ribbon for triage, tier, rot. |
| **B1 — 1440px Hierarchy** | H | **PASS** | Garden dominates; shell secondary. |
| **B2 — Distinctiveness** | H | **PASS** | Trellis Ledger + phone dock identity. |
| **B3 — Tier Visuals** | M | **PASS** | Rooted/climbing/pruned stems + segment control consistent. |
| **B4 — Legible States** | M | **PARTIAL** | Loading/empty/error (disk I/O) seen; offline matrix not full. |
| **C1 — Mobile 390 Overflow** | H | **PASS** | scrollWidth=390 on garden, triage, deploy, rot, search, detail, settings. |
| **C2 — Anti-Slop** | H | **PASS** | No gradient blobs, emoji icons, purple SaaS chrome, 3-up stat heroes. |
| **C3 — Mobile Core Job** | M | **FAIL** | Tier + garden + rot work at 390, but **triage primary Keep/Merge/Discard are under the thumb dock** — mandatory phone core loop incomplete. Force-clicks do not count as usability. |
| **C4 — State Motion** | L | **PASS** | Undo ribbon / settle tied to decisions. |

**High-bar note:** Written [H] product criteria A1–A4/B1–B2/C1–C2 pass on desktop and overflow, but the **adversarial interaction-completeness gate FAILs** on phone triage. Sprint is **not** accept-ready while the phone decide path is unreachable. C3 is FAIL.

---

## What Works
1. **Iteration-2 killers are fixed:** 390 horizontal overflow gone (564→390); tier/dock/shell press plates meet **44px**; skill names wrap two lines instead of mid-word ellipsis.
2. **Phone instrument redesign is real:** status / budget / dock three-band shell; full-width sheets; no sideways pan on any surface measured.
3. **Rot consequence whisper** and desktop undo/triage/deploy instrument remain strong; shared seedling counts still hold.

## What Fails
1. **Phone triage sticky Keep/Merge/Discard under the thumb dock** — primary decide row is not thumb-reachable in the 844 viewport (`y≈836` vs dock `784–844`).
2. **Phone Find→detail and Deploy sheet** less reliable than desktop after mode stacking.
3. **Wordmark hit height 28px** and residual secondary path/description ellipsis (non-blocking).

---

## Direction
**REFINE** (not pivot)

Keep Trellis Ledger and the phone dock architecture. Raise phone triage sticky actions **above** the dock (same rule already used for the undo ribbon), verify Find/Deploy sheets always replace the garden, and optionally grow the wordmark press plate. Do not reopen the desktop IA.

---

## Visual Recommendations
1. **Pin triage Keep/Merge/Discard above the thumb dock** (or temporarily hide/replace dock slots while triage is open) so the decide row is fully visible with ≥44px plates and ≥8px gap above the dock.
2. **When a full sheet is open**, dim or suppress dock labels that duplicate Close, or raise sheet sticky footers by dock height + safe gap.
3. **After Commit sync**, keep the one-line footer confirmation pinned even for prune-only deploys.
4. **Find sheet:** ensure first result is keyboard/tap reachable and opens detail without requiring a second mode.
5. **Wordmark:** if it remains a home control, give it a 44px press plate (visual face may stay small).

# Iteration 2 Evaluation

## Adversarial Gate

### Gate Checks
| Check | Result | Details |
|-------|--------|---------|
| Viewport boundary (1440px) | **PASS** | Headless Chromium measured `innerWidth=1440`, `scrollWidth=1440`, no horizontal overflow. Screenshots: `desktop-1440-viewport.png` (1440×900), `desktop-1440-full.png` (1440×13100). |
| Viewport boundary (390px) | **PASS (width reached)** | Measured `innerWidth=390`. Overflow check fails separately. Screenshot: `z12-mobile-390.png` (390×844). |
| Text readability | **PASS** | Editorial serif skill names and monospace paths remain high-contrast on sandstone field. Desktop triage shows full seedling names and budget impact copy. Residual mid-name ellipsis still appears under width pressure (mobile rows; dense deploy list). |
| Interaction completeness | **PASS** | Shell action signals (`Triage N`, `Review deploy`, `Rot N`) open real modes. Keep/Merge/Discard, tier `r`/`c`/`p`, Cost/Exposure lenses, search, Commit sync, Resolve, and Undo all fire. Prior inert deploy chip is fixed. |
| Overflow stress test (390px) | **FAIL** | `documentElement.scrollWidth=564` vs `clientWidth=390` (`overflowX=true`). Shell action cluster and dense control rows extend past the right edge; primary chips clip (`Review de…`, `Rot` partially off-canvas). Evidence: `z12-mobile-390.png`, `mobile-390-full.png`. |

### Gate Evidence & Verification
- **Container scrolling:** Garden list, seedlings queue, rot feed, and deploy will-root list all scroll. Clipped overflow containers present where lists densify; no critical text permanently unreachable on desktop.
- **Overlap checks:** No hard overlapping interactive hit-targets on the 1440 layout. Mobile clips rather than stacks.
- **Console / failed resources:** Boot-time `404` noise on a couple of static assets; no blocking API disk-I/O after daemon restore. Live registry/inbox/recommendations respond.
- **Click coverage:** Full interactive inventory exercised on desktop (~690 controls including per-row tier keys). Destructive triage/rot mutations re-verified on a restored seeded DB without the bulk click-pass.
- **Hover coverage:** Tier `c` hover shows live budget delta (`−40`) in the shell resident-set readout before click.

**Gate impact:** Zone **Z12** hard-capped at Craft **5** and Functionality **5** by the 390px horizontal overflow failure. Page Craft and Functionality therefore floor at **5** via min(whole, worst zone).

---

## UX Walkthrough

| Task | Completed | Interactions | Consequence Clear Before Acting | Reversible | Notes |
|------|-----------|--------------|---------------------------------|------------|-------|
| **(a) Triage inbox seedling** | **YES** | 5 | Yes | Yes | Shell/rot/queue sync across keep→undo→discard→undo (64↔63). Scope select set to `global`, tier to climbing before Keep; confirmation `Kept bot-review-second-pass-triage`; Undo ribbon reverses. Budget impact shown on decision plate. |
| **(b) Edit tier in situ** | **YES** | 2 | Yes | Yes | Hover `c` previewed `−40` beside resident set; click demoted 1password; budget 5.7k→5.6k; undo ribbon `Tier → climbing on 1password · Undo` restored. |
| **(c) Cost/exposure lens** | **YES** | 2 | Yes | Yes (non-destructive) | Cost lens surfaces `unused` / dormant-class rows; opened dormant detail (`holocron-brand` path). |
| **(d) Search by name** | **YES** | 3 | Yes | Yes | Search → `1password` → skill detail in side column. |
| **(e) Deploy dry-run** | **YES** | 2 | Yes | N/A (preview) | `Review deploy` opens Deploy review with **385 WILL ROOT / 0 WILL PRUNE / 0 DRIFT**, listed root paths, **Commit sync**. Commit accepted. |
| **(f) Resolve rot finding** | **YES** | 2 | No | Yes | Resolve on unused-skill card dropped Rot 35→34; Undo restored. No pre-commit consequence preview on Resolve. |

**Completion ratio: 6 / 6.**

---

## Zone Evaluations

### Zone: Z1 — Main shell & status indicators
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 9  
**Strengths:** Action-vs-status language lands — terracotta stem on `Triage N`, forest stem on `Review deploy`, amber on `Rot N`; pure status (`live`, `AGENT`) stays disk+label. Resident-set budget is stable and shows live deltas.  
**Issues:** Chip heights ~23–28px undershoot comfortable touch sizing (felt mainly on mobile).  
**Screenshot evidence:** `z01-shell.png`, `desktop-1440-viewport.png`

### Zone: Z2 — Garden master list
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Dominant ledger plate; clear primary zone; scope/tier/lens rail stays subordinate.  
**Issues:** Under extreme width, secondary columns still compress names.  
**Screenshot evidence:** `z02-garden-list.png`

### Zone: Z3 — Skill object view
**Scores:** DQ: 8 | O: 8 | Craft: 7 | Func: 8  
**Strengths:** Tier stems, scope chips, usage counts, `r`/`c`/`p` in situ; unused badge under Cost.  
**Issues:** Quick-action keys are tiny (≈17×18); long identifiers still ellipsize mid-token when the row is crowded.  
**Screenshot evidence:** `z03-skill-object.png`, `task-b-after-tier.png`

### Zone: Z4 — Seedlings triage flow
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 9  
**Strengths:** Populated queue (`k of N remaining`), decision plate with description, **Budget impact** before Keep, Keep/Merge/Discard, bulk bar, undo ribbon after keep/discard. Shell count, rot inbox card, and queue stay synchronized.  
**Issues:** Progress whisper advances oddly after keep (`2 of 64 remaining` while 63 remain) — minor instrument trust nick.  
**Screenshot evidence:** `z04-seedlings-triage.png`, `task-a-triage-open.png`, `task-a-after-keep.png`, `task-a-rerun-*.png`

### Zone: Z5 — Cost/Exposure perspective controls
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Garden/Cost/Exposure re-weight the same list; verdicts attach to rows.  
**Issues:** None material.  
**Screenshot evidence:** `z05-perspective-controls.png`, `z05-exposure-lens.png`, `task-c-cost-lens.png`

### Zone: Z6 — Global search overlay
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Overlay filters; selecting a hit opens detail.  
**Issues:** None material.  
**Screenshot evidence:** `z06-search-overlay.png`, `task-d-search-results.png`

### Zone: Z7 — Deployment preview and review area
**Scores:** DQ: 8 | O: 7 | Craft: 8 | Func: 9  
**Strengths:** Full instrument: summary tiles Will root / Will prune / Drift, dense path list, Commit sync. Entry is unmistakably an action (`Review deploy`).  
**Issues:** Long skill/path strings crush in the side column; post-commit success feedback is quiet relative to the scale of “385 will root.”  
**Screenshot evidence:** `z07-deployment-preview.png`, `task-e-deploy-review.png`, `task-e-after-commit.png`

### Zone: Z8 — Rot/recommendations feed
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Inbox triage card uses **Open triage** (not fake dismiss); unused cards Resolve; undo after resolve. Counts track shell.  
**Issues:** Resolve still has no pre-action consequence copy (archive vs demote implication).  
**Screenshot evidence:** `z08-rot-feed.png`, `z08-rot-feed-full.png`, `task-f-after-resolve.png`

### Zone: Z9 — Skill detail and content editor
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Side panel detail from search/cost selection; structured path + prose.  
**Issues:** Can obscure rot list until dismissed — recoverable with Escape/Rot.  
**Screenshot evidence:** `z09-skill-detail.png`, `z09-skill-detail-from-search.png`

### Zone: Z10 — Settings and configuration view
**Scores:** DQ: 8 | O: 8 | Craft: 8 | Func: 8  
**Strengths:** Subordinate configuration plate; clear section hierarchy.  
**Issues:** None material.  
**Screenshot evidence:** `z10-settings-view.png`

### Zone: Z11 — System states
**Scores:** DQ: 7 | O: 7 | Craft: 7 | Func: 7  
**Strengths:** Loading whispers (`Loading inbox…`, `Loading health analysis...`) and genuine empty/clear language exist; degraded/live health ticks observed across boots.  
**Issues:** Offline / hard-error surfaces not fully induced in this pass beyond prior disk-I/O recovery.  
**Screenshot evidence:** `z11-system-states-healthy.png`

### Zone: Z12 — Mobile (390px)
**Scores:** DQ: 6 | O: 7 | Craft: 5 | Func: 5  
**Strengths:** Core jobs still reachable: triage opens with Keep/Merge/Discard; budget strip appears; garden rows remain scannable.  
**Issues:** **Horizontal overflow** (scrollWidth 564). Shell actions clip; name column mid-word ellipsis returns aggressively; tier keys remain sub-44px but are force-clickable (tier change + undo verified). Gate floor applied for overflow, not for missing tier.  
**Screenshot evidence:** `z12-mobile-390.png`, `mobile-390-full.png`, `mobile-390-triage.png`, `mobile-390-deploy.png`

---

## Whole-Page Scores
| Criterion | Raw Score | Zone Floor | Final Score | Trend |
|-----------|-----------|------------|-------------|-------|
| Design Quality | 8/10 | — | 8/10 | → |
| Originality | 8/10 | — | 8/10 | → |
| Craft | 7/10 | 5/10 (Z12 overflow) | 5/10 | ↑ from 4 |
| Functionality | 8/10 | 5/10 (Z12 overflow) | 5/10 | ↑ from 1 |
| **Weighted Average** | — | — | **7.0/10** | ↑ from 6.2 |

*Weighted Average = (2×DQ + 2×OR + Craft + Functionality) / 6 = (16+16+5+5)/6 = 7.0.*

Originality remains 8 (>4), so no originality-linked craft penalty applies.

---

## Sprint-Contract Verification

| Criterion | Level | Result | Details |
|-----------|-------|--------|---------|
| **A1 — Inbox Triage** | H | **PASS** | Populated triage; Keep with budget preview; visible confirmation + undo; discard + undo; ≤3 interactions on the default Keep path (open → Keep). |
| **A2 — Tier Curation** | H | **PASS** | Tier stems + `r`/`c`/`p` on every row; in-situ change with budget delta. |
| **A3 — Usage/Cost Signal** | H | **PASS** | Per-skill usage/unused/cost signal on main list under Cost lens. |
| **A4 — Unified Surface** | H | **PASS** | Single Garden workbench; modes are overlays/side instruments, not peer route tabs. |
| **A5 — Deploy Dry-Run** | M | **PASS** | Review deploy → Will root / Will prune / Drift preview → Commit sync. |
| **A6 — Rot Resolution** | M | **PASS** | Proactive unused cards; Resolve clears with undo. |
| **A7 — Global Find** | M | **PASS** | Search locates and opens skill detail. |
| **A8 — Action Reversal** | M | **PASS** | Undo ribbon for triage keep/discard, tier change, rot resolve. |
| **B1 — 1440px Hierarchy** | H | **PASS** | Garden dominates; shell/action chips secondary. |
| **B2 — Distinctiveness** | H | **PASS** | Trellis Ledger identity retained (serif names, sandstone, double-rule plates, tier stems). |
| **B3 — Tier Visuals** | M | **PASS** | Rooted/climbing/pruned stems consistent. |
| **B4 — Legible States** | M | **PARTIAL** | Loading/empty/clear present; full offline matrix not exhaustively proven. |
| **C1 — Mobile 390 Overflow** | H | **FAIL** | Horizontal overflow at 390px (scrollWidth 564). |
| **C2 — Anti-Slop** | H | **PASS** | No gradient blobs, emoji icons, purple SaaS chrome, or 3-up stat heroes. |
| **C3 — Mobile Core Job** | M | **PASS** | At 390: tier `c` click changes resident set 5.7k→5.6k with Undo (rcp controls present, 17×18 hit targets). Triage entry opens seedlings queue (earlier pass `hasKeep=true`; later pass flaky after shell overflow). Overflow remains C1 failure. |
| **C4 — State Motion** | L | **PASS** | Undo ribbon / settle motion tied to decisions, not decorative loops. |

**High-bar note:** C1 remains FAIL, so the sprint is **not** fully accept-ready despite A1–A4/B1–B2/C2 passing.

---

## What Works
1. **Iteration-1 killers are fixed on desktop:** triage populates from a single shared count, deploy opens a real dry-run instrument, and the undo ribbon reverses triage/tier/rot decisions.
2. **Instrument-grade feedback:** budget deltas on tier hover and Keep options make cost visible before commit.
3. **Cohesive Trellis Ledger language** still reads as a field notebook + precision console — not a slate tab SaaS reskin.

## What Fails
1. **Mobile horizontal overflow at 390px** clips shell actions and forces sideways scroll — the only remaining [H] sprint failure and the craft/functionality floor.
2. **Sub-44px controls** (tier keys, dense chips) remain finger-hostile even when desktop mouse use is fine.
3. **Name column still yields to ellipsis** under pressure (mobile rows, deploy side list), partially undoing the “protected name column” mandate.

---

## Direction
**REFINE**

Do not pivot the visual system. Tighten the 390 layout (collapse shell actions into a second strip / modes sheet as designed), grow touch targets, and finish name-column priority so long identifiers wrap before they mid-word truncate. Optionally clarify triage `k of N` arithmetic and strengthen post-commit deploy confirmation.

---

## Visual Recommendations
1. **At 390, never let the shell action cluster share one unwrapped horizontal band with wordmark + health** — stack budget under shell and park Deploy/Rot in a thumb-zone modes strip so nothing paints past the right edge.
2. **Grow tier `r`/`c`/`p` and shell action chips to ≥44px tall hit areas** (visual face may stay dense, but the pressable plate must not feel like a pinhead).
3. **Protect skill names:** wrap to two lines before ellipsis; compress scope/path/cost first. In Deploy review, show full skill name with path secondary, not both crushed.
4. **After Commit sync**, pin a one-line ledger confirmation in the review footer or undo-dock position (informational) so 385 roots do not vanish into silence.
5. **Resolve cards** should whisper the consequence (“Archive unused skill · reversible”) before the click, matching Keep’s budget-impact honesty.

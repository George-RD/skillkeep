# Design Studio run plan — skillkeep UI/UX overhaul

Workflowz mapping of `design-studio` v1.3.0 (Studio lane, overhaul mode) onto OMP task fan-out, with a herdr dashboard.

## Roles → agents

| design-studio role | Runs as | Context isolation |
|---|---|---|
| Planner | `task` subagent (done once) | none — may read code/docs |
| DesignAgent | `task` subagent per iteration | spec, contract, screenshots, critique ONLY — never source |
| Builder | `task` subagent per iteration | design description + packages/ui source on the feature branch |
| Evaluator | `task` subagent per iteration | serve.json + spec + contract + live browser ONLY — never source |
| Orchestrator (Decide/Loop/Codify) | main agent | applies workflow.yaml decision table to scores.json |

## Adaptations to skillkeep (deltas from stock workflow)

1. **Site = the real SPA.** `harness-output/site/` is replaced by `packages/ui/` on branch `feat/design-studio-ui-overhaul`. Builder commits per iteration (`feat(ui): design-studio iteration N`), rebuilds `packages/ui/dist`; the sandbox daemon serves dist live.
2. **Serve = sandboxed live daemon** on :4519 (see `serve.json`). Data dir, registry root, HOME-derived client dirs, and sync targets are all under `/tmp/skillkeep-studio-*`; every interactive element is safe to exercise. Pristine snapshot at `/tmp/skillkeep-studio-pristine` is restored before each Evaluate so iterations score against identical data.
3. **UX-weighted evaluation** (user steer 2026-07-16): before scoring, the Evaluator runs a complete management task slice — detect/triage an inbox skill → inspect it (provenance/usage) → tier or adopt it → verify via sync dry-run — and scores task completion, decision clarity, step count/reversibility, and error recovery. This walkthrough feeds `functionality`; a failed core job caps functionality at 5 (same mechanism as the adversarial gate).
4. **Thresholds** per workflow defaults: shipThreshold 7.0, maxIterations 8, pivotBudget 2, viewports [1440, 390], zone evaluation + adversarial gate on.
5. **Dashboard**: herdr pane `wA:p2` renders `status.json` + `scores.json` every 2s. Orchestrator updates `status.json` at every phase transition.

## Pilot gate

Before committing to the full loop, run iteration 1 end-to-end (Design → Build → Evaluate → Decide) and check handoffs:
- DesignAgent output contains no code/CSS vocabulary; concepts genuinely divergent.
- Builder executed the description faithfully (spot-check vs description), dist rebuilt, daemon serves it.
- Evaluator screenshots exist, gate ran, scores.json validates against the schema, walkthrough was actually performed.
- Dashboard reflected each phase.
Only then continue iterations 2..N.

## Phase order

setup ✅ → plan (Planner) → [design → implement → evaluate → decide]×N → codify (DNA + tokens.css + skill template) → finalize (report.md, best iteration).

## Pilot findings (iteration 1, 2026-07-16)

Loop ran end-to-end: Plan 9m, Design 2m, Build 7m, Evaluate 15m. Handoffs held (no code leaked to DesignAgent/Evaluator; scores.json schema-valid; dashboard tracked every phase). Iteration 1 scored DQ 8 / OR 8 / CR 4 / FN 1, wavg 6.2 → REFINE. Adjustments for subsequent iterations:
1. **Evaluator viewport bug**: iteration 1 evaluated at 800×647. Prompts now mandate `page.setViewport({width:1440,height:900})` / `{width:390,height:844}` and require `actualViewports == [1440, 390]`.
2. **Builder self-test gap**: page-load smoke check missed a broken triage modal and dead deploy chip. Builder prompts now require an interactive browser self-test of all six core flows before yielding.
3. Functional keyIssues from critique pass to the next Design step as behavioral observations (never code talk), per stock critique flow.

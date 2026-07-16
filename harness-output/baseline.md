# baseline.md

## Overhaul mode
**mode:** overhaul (redesign of an existing UI, not greenfield)

## existing_site
**path:** `/Users/george/repos/skillkeep/packages/ui`
React 18 single-page app (Tailwind + TanStack Query) served by the local skillkeep daemon.

## overhaul_goals
1. **UX-first — reframe the IA around the user's actual jobs, not API routes.** The current app is one screen per endpoint; the real work (triage a 64-skill inbox; curate tiers rooted/climbing/pruned; see which skills earn their context cost; find+route; deploy/sync with confidence; spot rot) hops across all of them. Reframe around jobs-to-be-done and bias toward elegant consolidations (e.g. a single garden/workbench) over tab-per-route.
2. **Preserve the REST API contract and the React+Tailwind+TanStack stack.** This is a redesign of the frontend, not the daemon. Every new flow must map onto the existing endpoints.
3. **Treat the prior rebrand exploration as ONE reference point.** `docs/design/rebrand-preview.html` proposes a botanical "trellis" direction (Fraunces editorial type, warm organic palette, tactile double-border plates, growth/decay motion). It is candidate DNA — adoptable, refinable, or exceeded — not a mandate.

## baseline screenshots
Visual record captured before redesign. Desktop set at **1440px**, mobile set at **390px**.

**Desktop (1440px):**
- `baseline/desktop-health.png`
- `baseline/desktop-detect.png`
- `baseline/desktop-registry.png`
- `baseline/desktop-sync.png`
- `baseline/desktop-usage.png`
- `baseline/desktop-settings.png`

**Mobile (390px):**
- `baseline/mobile-health.png`
- `baseline/mobile-detect.png`
- `baseline/mobile-registry.png`
- `baseline/mobile-usage.png`

## current_state_summary (derived from source)
This summary is grounded in the source of the existing site (`App.tsx`, screen components, `api/client.ts`).

- **Shell:** slate SaaS chrome (light slate background, dark text), top tab bar of nav pills.
- **IA:** seven declared screens (Health, Detect, Registry, Devices, Sync, Usage, Settings), mode-filtered at runtime.
- **Detect:** flat list of detected skills; per-row scope selector, AI triage (suggest scope), AI dedupe advice, adopt action. Today ~64 skills awaiting.
- **Registry:** flat list of skills grouped by scope; per-skill AI describe, move scope, archive, edit skill content, hub push/pull.
- **Usage:** an isolated recharts bar chart grouped by model/repo/client/skill over a date range — a self-contained analytics silo, disconnected from the skill rows where decisions are actually made.
- **Sync:** dry-run + apply in its own tab.
- **Settings:** configuration + BYOK AI-key resolution (OS keychain under Tauri).

**Endpoint surface available to design against:** health, scan, adopt, registry, registry/move, registry/archive, skill (get/put), sync (dry-run), status, recommendations, usage/summary, settings (get/put), devices, hub push/pull, and BYOK AI routes (status, triage, describe, dedupe). Plus the daemon SSE stream driving live cache invalidation.

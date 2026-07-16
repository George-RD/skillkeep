---
name: skillkeep-design
description: >-
  Load this skill when building, extending, or theming any skillkeep surface.
  It carries the project's design DNA, tokens, and per-surface guidance so every
  screen stays consistent with the canonical direction.
---

> **Canonical master:** `assets/tokens.css` inside this skill is the upstream source of truth for all skillkeep visual values. Any copy in a consuming repo is a vendored consumer; edit the skill first, then re-sync the repo copy.

# skillkeep Design System

skillkeep (codified 2026-07-16 as Trellis Ledger) is a "editorial garden that reads like a precision instrument" design system.

Warm paper, sharp ink: every skill is an addressable row in a living ledger carrying its tier, cost, and exposure inline; every decision is shallow, consequence-honest, and reversible while the ink is still wet.

## Non-negotiables

1. **Import tokens.css; never hardcode a value that exists as a token.** Every colour, spacing value, type scale, motion duration, and shadow must resolve to a CSS custom property from `assets/tokens.css`.
2. **One motif, one meaning.** Each recurring shape, glyph, or animation pattern in the system means exactly one thing. Never overload a motif with multiple meanings.
3. **Colour is never the only cue.** Any status, state, or category encoded by colour must also be encoded by a redundant channel: glyph, shape, position, label, or texture.
4. **Respect prefers-reduced-motion.** All motion is optional. At the system level, every animation must have a static equivalent that carries the same information without movement.

## Routing table

| Task | Go to |
|------|-------|
| Name & essence | `design-dna.md` `#Name-and-essence` |
| Principles | `design-dna.md` `#Principles` |
| Aesthetic & creative tension | `design-dna.md` `#Aesthetic-and-creative-tension` |
| Colour / theming / semantic roles | `design-dna.md` `#Colour-language` |
| Tokens / canonical values | `assets/tokens.css` |
| Typography | `design-dna.md` `#Typography` |
| Spatial rhythm | `design-dna.md` `#Spatial-rhythm` |
| Signature motif(s) | `design-dna.md` `#Signature-motifs` |
| Motion | `design-dna.md` `#Motion` |
| Voice & tone | `design-dna.md` `#Voice-and-tone` |
| Applying the system | `design-dna.md` `#Applying-the-system` |
| Anti-goals | `design-dna.md` `#Anti-goals` |
| Iteration history / decisions | `design-dna.md` `#Provenance` |

This `SKILL.md` is an INDEX. The detailed reasoning and per-surface recipes live in `design-dna.md` and `assets/tokens.css`.

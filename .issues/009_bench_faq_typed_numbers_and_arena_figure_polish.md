# Issue 009 — /bench FAQ typed numbers + "locked" claim scope + arena figure polish

**Status:** OPEN — 2026-10-03 (web-family restyle follow-up, riir-ai Issue 1028)

Found during the family restyle (`b9416c7`, `e97247b`; deployed `2e4098bb`).

## Gaps

1. **Numbers law broken on /bench FAQs** — measured figures typed into copy (e.g. the openthai
   row's latencies, an accuracy, "~18× cheaper"). AGENTS.md: render from `data/bench.json` or
   link the instrument.
2. **"BLAKE3-locked" scope** — five places say "BLAKE3-locked"; hash + signature is only
   confirmed for the Instinct and Rethink vessels. Each use must name what is actually
   hashed/signed, or drop the claim.
3. **Arena Tetris charts unreadable on mobile** — page does not overflow at 390 px, but the
   charts scale text below 11 px (design guide §6). Give them an in-figure scroll min-width or a
   vertical variant.
4. **Arena step-through Tetris figures still in the old brown palette** — highlights are tuned to
   it; re-theme to the family ink + accent palette together with the highlight colours.
5. `skills/reflex-integration` cache path `~/.cache/riir-reflex/laya` not re-verified against
   `reflex 0.2.3`.

## Tasks

- [ ] T1 render /bench FAQ figures from `data/bench.json` (or link the cell); extend `scripts/public_copy_gate.cjs` to catch typed figures in FAQ copy
- [ ] T2 audit the five "BLAKE3-locked" uses against the vessel format (riir-reflexer) and scope each sentence
- [ ] T3 arena charts: ≥ 11 px labels at 390 px (in-figure scroll)
- [ ] T4 arena step-through figures + highlight colours → family palette
- [ ] T5 re-verify the skill's cache path against `reflex 0.2.3`

# Issue 009 — /bench FAQ typed numbers + "locked" claim scope + arena figure polish

**Status:** OPEN — T1/T2/T5 DONE 2026-10-03; T3/T4 (arena figure work) remain (web-family restyle follow-up, riir-ai Issue 1028)

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

- [x] T1 render /bench FAQ figures from `data/bench.json` (or link the cell); extend `scripts/public_copy_gate.cjs` to catch typed figures in FAQ copy —
      the openthai FAQ's p50s, accuracy, ratio and per-option cost bind via `[data-ot]` (`fillOpenthaiFaq`); the
      question line carries no figure (it also overflowed 390 px once bound). The gate scans every opened
      `details.faq` minus bound elements; 5 constants allowed with reasons (Jev's quoted 9×, the 99.9% parity gate,
      the 5% re-read tolerance, the log axis's 10× / 500 ms). Canary: HEAD reds on exactly the 5 typed figures.
- [x] T2 audit the "BLAKE3-locked" uses — the premise was wrong: hash + signature is NOT what serves for Instinct
      or Rethink. Measured (riir-reflexer `reflexer-vessel` is hashed + Ed25519-signed; riir-rethink's hosted vessel
      adds encryption): served Instinct winners are raw `*_winner_v1.bin` files pinned by BLAKE3 in `arsenal.toml`
      (`pin_keys = []`, raw-mode validate) and the Rethink vessel path is feature-off with no bin; only the Reflex
      game heads load through a verified signature. Scoped: vessel glossary (both pages), the Instinct lines on
      /bench, the Guard line (marked Planned), `data/sizes.json` (generator + measurement text — "BLAKE3 + ed25519"
      was false of the measured `.bin` files), and at source: riir-instinct `b6425bf` (dev flow step 4),
      riir-rethink `47887ff` (resources: receipts "hashed record" not "signed summary", "built to serve", vessel =
      planned path; dev flow labeled the design).
- [ ] T3 arena charts: ≥ 11 px labels at 390 px (in-figure scroll)
- [ ] T4 arena step-through figures + highlight colours → family palette
- [x] T5 re-verify the skill's cache path against `reflex 0.2.3` — `$HOME/.cache/riir-reflex/laya`, `LAYA_WEIGHTS_DIR` / `LAYA_HOME` override (riir-infer-laya `weights_root()`); fixed at source riir-reflex `a84bad6`, mirrored

# HISTORY.md — reflex-site

One hash-pinned line per removed issue (the fleet noise-reduction convention:
an issue file is removed once its work is verifiably landed; this file is the
durable record). Full narrative of each: `git log --follow -- .issues/<file>`.

- **2026-09-29 — the typed H2 serving posture published (`4b729d4`); DEPLOY
  PENDING on this box (no CF token — every prior deploy was M3-side).**
  `data/bench.json`'s typed_decisions hybrid cell: A1 0.6300 ->
  H2(beta=0.5,nmin=2,tau=2) 0.6475, `serves` + the certification note follow
  (paired LB95 +0.0580 vs A0'), source stamps re-attributed to instinct
  `8bbff09` (the Benches 019/020 landing). Lane-scoped publish:
  `PUBLISH_BENCH_LANES=hybrid sh scripts/republish_bench.sh data/bench.json
  ../riir-instinct/.benchmarks/020_typed_h2_full_pool/hybrid_lane_doc.json`
  (the 020 merged doc, instinct `9449e10`, was the prepared input that never
  got published). All gates green: publish self-test 52/52, chart smoke,
  pairing gate, mirror parity, bench-page smoke (chip poc - 15 armed -
  vs-Reflex warn 8/15 - vs-best gap 3/15). Node gate on this box: latest
  wrangler requires Node >= 22, the box has v20 - `npx wrangler@3.114.4
  deploy` runs but then needs `CLOUDFLARE_API_TOKEN`, which lives on the M3.
  **The shipping command (M3 or any creded box): `cd reflex-site && npx
  wrangler deploy`** - until then reflex.gist.rs serves the pre-publish
  bytes (verified live: typed hybrid still reads A1 0.63).

- **Issue 001 — arena four lanes + honest µs timing + bench-driven TL;DR: DONE 2026-09-24.**
  All 7 tasks landed (lane labels, 2-per-row grid, sub-ms honest timing, laya (Rust)
  naming, 4-lane demo oracle, TL;DR from `data/bench.json`). Verified by
  `scripts/arena_demo_check.mjs` + `arena_head_parity.mjs` + the page smokes; the
  oracle carries all four lane walks (rust / python / raw / modelless). The two
  measured gaps it surfaced (Rust-vs-Python speed, modelless-vs-laya accuracy) are
  tracked where they live (riir-reflex Issue 020 — closed upstream 09-26; the
  accuracy gap stays published as-is on the TL;DR).

- **Issue 002 — pair TL;DR lanes on population identity, not hope: LANDED 2026-09-27.**
  All 4 tasks landed: identity pairing in `assets/arena_tldr.js` (cases_digest >
  lane_sources run-id; mismatch = a third disclosed state), per-cell `cases_digest`
  stamping in `scripts/publish_bench.py`, the fail-loud `scripts/check_lane_pairing.py`
  wired into `republish_bench.sh`, and the pinned self-test arms. Full root-cause
  record: riir-reflex `.issues/040`.

- **Owner pass 2026-09-29 — Instinct moves to /bench, rig radio, paw lane, yellow ✓.**
  Four owner-directed changes + the prod-grade gaps found en route: (1) the
  "Instinct vs Reflex" TL;DR row MOVED from the arena to a new `/bench/#instinct`
  section (after Protocol) — what Instinct is, the two-mirror flow figure
  (`assets/instinct_flow.svg`, source `riir-instinct/.docs/03_decision_flow/instinct_flow.md`,
  rendered by the now two-source `scripts/render_tetris_flows.py`), the moved row
  plus a new "vs best lane" row (the raised bar: best published lane per suite,
  instinct `.issues/008` amendment) and a data-driven PoC/GOAT chip — the arena
  and home stay Reflex-only until the chip flips; (2) the Reflex-vs-laya accuracy
  row shows a YELLOW ✓ (class `warn`) when Reflex is at-or-above on a strict
  majority of the trio suites (9/14 today), red only on a minority result;
  (3) `/bench/` grows a rig radio (All rigs · M3 Max · RTX 4090) derived from the
  fleet merge — `window.BenchRig` in `assets/bench-charts.js` scopes the hero,
  per-suite charts, tables, log axis and provenance strip; the ANE rows stay in
  the M3 scope (device-suffix rule anchored to the primary host), scope survives
  a reload; (4) the paw lanes (published 2026-09-28/29, rendered by NOTHING — the
  invisible-lane class) joined the palette/renderers with an `accOf` reader for
  their acc-only cell shape, and `†` now only marks numeric latency cells. Base
  `.tldr` li verdict colors moved into `style.css` (they lived only in
  `arena.css`, so the home/bench rows were unstyled). Smoke coverage: rig scopes,
  Instinct section order/figure/chip, paw row counts, the warn rule
  (`bench_page_smoke.cjs`, `arena_demo_smoke.mjs`, `home_page_smoke.cjs`), and
  both static-server MIME maps gained `.svg` (Chromium refuses SVG-in-img at
  octet-stream — production wrangler was never affected). Validation:
  chart_render PASS, bench_page PASS, home_page PASS, arena_demo PASS,
  pairing gate 29/0, publish tests 52/52, figures `--check` in sync.

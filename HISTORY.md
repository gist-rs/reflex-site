# HISTORY.md — reflex-site

One hash-pinned line per removed issue (the fleet noise-reduction convention:
an issue file is removed once its work is verifiably landed; this file is the
durable record). Full narrative of each: `git log --follow -- .issues/<file>`.

- **2026-10-01 — the cc metric rendered every lane "— not run" (user live
  report, `47f786d`).** The chance-corrected acc metric's `get` is
  `(lane, suite)` — `chanceOf(s)` reads the suite's curated baseline from
  `data.areas.suites` — but the hero's `barHtml` called `M.get(l)` without
  the suite, so cc scored null on EVERY cell and every lane collapsed to
  the not-run cell, on every suite, while the acc view, the tables, the
  home summary (`laneStats` — already passed the suite) and the area radar
  (precomputed) were full of scores. That asymmetry was the tell: a
  metric-specific blank board is a transform bug, not missing data and not
  browser state — the rig/lane-filter theories of the earlier report
  (fixed in `6abaeb3`, still a real guard) could not reproduce it because
  they were the wrong layer. Fix: every metric call site passes
  `(lane, suite)` (`barHtml`, `cell` — the latter latent, only ever called
  with acc/p50); the empty cell is honest about WHY ("no chance baseline"
  for cc on the six harness families — a lane that ran but cannot score
  there — reserving "not run" for a lane that never measured the suite);
  the cc note explains the axis and the skip. `bench_page_smoke` 9b pins
  it data-derived (9 chance bars / 6 no-baseline / 2 not-run today),
  proven two-sided — on the pre-fix file it fails with the exact user
  symptom. Live-verified post-deploy: 114 real bars on
  `reflex.gist.rs/bench/?m=cc`, zero not-run on a chance suite.

- **2026-10-01 — #areas shows every selected lane + the qualifier-free lane
  names (owner calls: "should show any selected result" + "rename … to reduce
  noise").** Two landings in one publish. (1) The Areas & index radar now
  rolls up EVERY filterable lane, not only the four product lanes — the
  comparison lanes (clm, gliner, agentjev, openthai, paw, the python laya
  checkpoints) were filter chips with no radar row, so selecting one left
  #areas unchanged. `compute_areas()` v2: `AREA_LANES` extended to every
  lane; acc-only cells (paw/paw-local top-level accuracy) read via the same
  `_cell_acc` the page's accOf uses; a lane the primary host never ran (clm
  / gliner / agentjev / paw-local, all 4090-side) rolls up from
  extra_host_lanes under a host-tagged key (`clm@4090-win`) with `host` on
  the lane block — the radar legend renders `clm · RTX 4090` (RIG_LABELS),
  and one filter chip gates every posture of the lane (the `@host` suffix
  strips for the palette key). Single-host by construction: a lane with any
  primary cell never enters the host pass. 11 lanes roll up (9/9: Reflex,
  Instinct, laya rust, openthai, paw; partial: Rethink 1/9, python 8/9,
  clm/gliner/agentjev 8/9, paw-local 4/9). (2) The lane display spellings
  are the qualifier-free product names — `Instinct` (hybrid arm, NOT
  "Rethink (hybrid)"; the 051-Phase-1 hybrid rebrand is superseded by this
  call) and `Rethink` (encoder arm) — LANE_DISPLAY + AREA_LANES carry the
  new spellings with every legacy spelling mapped (dual-spelling law);
  bench.json re-published in place (the lane-scoped update path) landed
  them in every cell; the JS matchers keep the legacy spellings so an
  un-re-published bench.json still renders; what each name MEANS moved to
  the page's Notes bullet + FAQ lanes answer + References (the
  "described in prose, not in the lane name" ask). Notes readable-ized:
  bold lead-ins on every bullet; the G1 and modelless-near-chance bullets
  dropped (the FAQ entries cover both verbatim); the openthai massive
  latency explainer MOVED to a FAQ entry (it was a why-is-this-number, not
  a reading rule). Sizes-page candidate renamed (`Instinct · trained
  specialists`). Issue 004's naming half marked resolved. Gates: publish
  self-test 66/66 (+3 new area cases: python laya pick, comparison rollup,
  serving-host host-tagged rollup), chart smoke (19 polys / 121 dots / 22
  legend rows, polyline guard now data-derived), pairing gate, mirror
  parity, bench-page smoke (9 armed, vs-Reflex ok 9/9, vs-best gap 3/9 —
  the smoke's Instinct re-derivation dual-spelled too).

- **2026-09-30 — the modelless lane re-published at the promoted gate
  posture (Issue 056's close-out); the deploy ships the pending typed-H2
  publish too.** Lane-scoped publish over `data/bench.json` as primary
  with two coordinated fresh docs — reflex Bench 096 (m3, quotable load
  3.92→4.16) + 097 (4090-windows, UNJUDGED-standing) at `d4051c8`, the
  076+077 flow verbatim (canonical pool, nb/oc/ridge select, heads off):
  hard accuracy bit-identical to every incumbent cell on all 15 suites
  BOTH hosts (cross-host bit-identity re-proven), the gate cells move to
  `--gate-fit-calibrated` (calibrated_abstain == the old fitted raw
  target on every dataset suite — ag_news 0.525, emotion 0.4675, sst5
  0.5817, typed 0.717; raw_abstain 1.0 by construction, the documented
  Bench-095 lever artifact), source stamps to `d4051c8` on both host
  rows. Timing carried per the Issue-032 law (both sides quotable →
  incumbent wins; provenance note on every cell). All gates green:
  publish self-test 52/52, chart smoke, drift gate, pairing, mirror
  parity, bench-page smoke. Deployed from the M3 (the CF-creded box) —
  resolving the 2026-09-29 deploy-pending note: this push serves BOTH
  the typed H2 hybrid cell and the promoted gate posture. Known gap
  filed: reflex Issue 057 (the typed m3 p50 0.517 carry predates the
  1200-row corpus; no corpus-axis LANE_CARRY escape exists —
  owner-gated).

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

- **Issue 003 — 26 published latency cells from runs that judged their own box unfit: RESOLVED 2026-09-30 (unfit cells on the board: 0).**
  T1+T2 landed 2026-09-28 (Bench 076+077 m3 modelless re-measure + the
  `carry_beats_incumbent` suppression); T4 (per-cell `source_run` stamps)
  2026-09-27; T3 (the m3-ane ANE re-measure) 2026-09-30 — reflex
  [Bench 098](../../riir-reflex/.benchmarks/098_ane_quotable_rerun.md):
  preflight-passed spans (5.04/4.64), the five published suites exactly,
  accuracy bit-identical at HEAD `2f6b58c`, p50 within 1 ms,
  prompt_injections' 652 ms cold-compile p99 gone. Published via the
  update path + `PUBLISH_BENCH_LANES=laya` (modelless byproduct dropped —
  the paw-lane law); deployed `4cb76db`, live-verified cache-busted
  (unfit 0 / quotable 5). **En-route find (the re-measure's own gate run
  first, per the lane-change law): the ANE lane had been BROKEN at HEAD
  since 2026-09-26** — reflex `6535b75` (the KV-table lane's e8 table
  converter) added `<model>/table_e8` rows to `assets/ane/manifest.json`
  and riir-infer's `AneManifest::load` required the artifact schema on
  every row; fixed substrate-side (riir-infer `7eae0e7`: parse only
  `<model>/L<n>` rows, skip foreign rows per the loader's own
  schema-grows-freely contract) with a regression pin; G5-ANE parity
  green after (231 s). T5's residual stays a documented defer (the
  4090-laya results doc lives on the 4090; those cells read unjudged
  regardless — no box probes on that host).

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

- **Owner pass 2026-09-29 (later still) — the verdict rows became per-suite loading bars.**
  Owner ask: the two prose rows were unreadable. `assets/instinct.js` now
  renders each verdict as a short headline (same majority-law mark, the
  smoke's re-derivation unchanged) + a segmented "remain" bar (won/tied/
  remain/no-arm, flex = count, hatch = no arm yet) + ONE LINE PER SUITE:
  a loading bar — fill = Instinct (its lane color), tick = the compared
  lane (THAT lane's palette color), the dim span between = the gap — plus
  colored numbers and a ±delta chip. The palette stays single-sourced:
  `bench-charts.js` now exposes `window.BenchLanes` (display-label color
  lookup) instead of instinct.js re-deriving the lane→color map. Two
  findings en route, both fixed at root: (1) style.css's
  `.tldr p { display: inline }` (the arena TL;DR prose shape) merged the
  chip/lead/legend into one flow — `.instinct .tldr > p` restored block;
  (2) the host tag `<i class="iv-host">` measured with broken intrinsic
  width (the synthetic-italic face: the engine sized the cell ~47px
  narrow in flex, grid AND table — a `<span>` measures full) — the host
  tag is a span now. Suite lines are `display: table` (content-sized
  nums cell via the width:1px + nowrap trick, the bar cell takes the
  rest); mobile stacks bar/numbers under the name. Verified: Chromium
  rasters desktop + 420px, `bench_page_smoke.cjs` PASS (marks, chip,
  phrases all re-derived from bench.json), no page errors.

- **Owner pass 2026-09-29 (later) — the Instinct flow figure reflowed to two bands.**
  The owner ask: the one-row LR figure was too wide and rendered small. The
  source mermaid (`riir-instinct/.docs/03_decision_flow/instinct_flow.md`)
  now uses the Reflex hero's flywheel shape — top band "the question in —
  Reflex · modelless, always first, free" (question → embed/route/score →
  fused gate → confident answer), bottom band "on abstain — the trained
  add-on, paid only here" (top-k prune → specialist → fuse → calibrated
  answer), the thresholds + arsenal.toml boxes dotted in from outside — and
  re-rendered to both mirrors by the same script (viewBox 2304×574 →
  1751×730, the hero's ~2.4:1 shape). `bench/index.html` img dims + alt
  updated to match. Verified: Chromium raster of the SVG (UTF-8 intact),
  figures `--check` in sync, `bench_page_smoke.cjs` PASS.

- **Areas & index radar + the Rethink rename + a chance-corrected range metric (2026-09-30).**
  The owner ask: leaderboard-style radar cards on `/bench/` for the four
  product lanes (Reflex · modelless, Instinct (hybrid), Rethink (encoder),
  laya (rust)) across all areas, plus the min–avg–max range-per-lane chart
  on the landing page. Three landings, all data-driven (the hand-typed-
  number law): (1) `publish_bench.py` gains `compute_areas()` — it emits
  `data/bench.json` `areas`: per-lane chance-corrected scores
  (cc = (acc − chance)/(1 − chance)) rolled into four curated areas
  (Language & intent, Sentiment, Reasoning & safety, Decisions & code) over
  the nine product-lane suites, with per-suite chance baselines that are
  DATASET facts read off the harness's own option construction (ag_news 4,
  massive 20 presented/question, banking77 77, sst5 5, emotion 6, xnli 3,
  prompt 2, typed 20-head-type mean 0.3175, code (1/8+1/2)/2 — cited in the
  constant's comment); the page renders the rollups, never re-derives them
  (the compute_pairings precedent). Laya uses the charts' own pick rule
  (best non-multilingual checkpoint: typed on typed_decisions, english
  elsewhere); lanes disclose coverage, and a partial lane's index is the
  mean over what it measured, never padded. (2) `bench-charts.js` renders
  the radar — two cards ("All areas · decision index", "All benchmarks ·
  9 spokes"), polygons only for complete lanes, measured-dots-only for
  partials (the Rethink encoder arm is 1/9, gaps are unmeasured, never
  zero), tooltips with raw accuracy + the chance baseline, the lane filter
  governs it, and the legend names coverage + the partial disclosure in
  both cards. Same landing: a **chance-corrected acc** metric on the
  min–avg–max range charts (home + `/bench/` hero) — the same cc scale, so
  the landing page's ranged bars finally compare a 4-way and a 77-way
  suite on one axis (bars clip at the 0% chance line; tooltips carry exact
  values). (3) The encoder lane rebrands per the riir-instinct naming law
  (riir-ai Proposal 051): display spelling `Instinct (encoder)` →
  `Rethink (encoder)` in LANE_DISPLAY with the legacy spelling mapped
  (the dual-spelling law), the palette label + match updated; the lane KEY
  never changes. The results are still 1/9 (record-only, serve ✗) —
  blocker tracked in `.issues/004_rethink_encoder_lane_partial.md` (051
  Phase 1 + the encoder serving deploy). Verified: test_publish_bench
  63/63 (6 new area-rollup cases), chart_render_smoke (cc + radar arms),
  bench_page_smoke (radar renders, partial disclosed on both cards, the
  filter governs it), home_page_smoke, check_lane_pairing, mirrors --check.

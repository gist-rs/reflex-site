# AGENTS.md — reflex-site

The global `~/.agents/` rules apply. [`BOUNDARY.md`](BOUNDARY.md) is the
contract (what this repo owns, what it does not); on conflict it wins.
[`README.md`](README.md) carries the full recipes — this file is the index.

The repo root IS the public assets directory (`wrangler.toml`): anything not
listed in `.assetsignore` is served at `reflex.riir.ai`. Never write build
output, screenshots or notes to the root — use the gitignored `scripts/out/`.

## Instruments

| script | what it is |
|---|---|
| `scripts/publish_bench.py` | harness output → `data/bench.json` (sanitizes machine-local meta; cross-host drift gate) |
| `scripts/test_publish_bench.py` | its self-test — run before every publish |
| `scripts/republish_bench.sh` | the whole publish flow in one wrapper (self-test → publish → mirror check) |
| `scripts/publish_sizes.py` / `scripts/publish_sizes.sh` | measured disk sizes → `data/sizes.json` |
| `scripts/test_publish_sizes.py` | its self-test |
| `scripts/sync_mirror.py` | copy/verify the riir-reflex + riir-instinct + riir-rethink doc/SVG mirrors — 13 pairs, 3 roots (`--check` = verify only; owns `assets/mirror_manifest.json`; carries the Rethink mirror fence: pair-shape + content scan, violations RED) |
| `scripts/render_flows.py` | render the flow figures from their source docs
| `scripts/build_flow_walks.py` | derive the decision-flow figures' step-through payloads from CAPTURED bytes (riir-ai Plan 620 Group R; payloads are recorded artifacts, never typed) |
| `scripts/build_arena_flow_walks.py` | derive the arena lanes' "how each lane picks a spot" figure payloads from recorded walks (pairs with render_flows.py) |
| `scripts/check_lane_surfaces.py` | the lane-surface completeness gate (the 2026-11-02 mammoth lesson): every `LANE_CLASSES` class must appear on EVERY rendering surface — bench-charts.js palette + MODEL_FAMILIES, instinct.js rival lists, the publisher's LANE_KIND/LANE_TIMING/AREA_LANES/merge block. Wired as republish_bench.sh step 0/5; exceptions documented in-file, both directions |
| `scripts/check_lane_pairing.py` | the pairing gate (site Issue 002 T3 / riir-reflex Issue 040): after a publish, every compared lane pair shares a population identity or is explicitly acknowledged |
| `scripts/backfill_latency_verdicts.py` | one-shot backfill (Issue 021 data half): resolve each pre-verdict lane cell's `latency_quotable` from its source run's own box_state; publish_bench.py stamps new cells itself | (tetris + reflex decision flow + instinct + the three lanes' dev-flow figures; per-source palette — family ink + the owning product's accent, the Tetris figures on the Reflex accent (the brown theme is retired); rename map keeps site filenames unique; `--check` = no-network mirror diff; `--only <repo>` re-renders one source) |
| `scripts/arena_legibility_smoke.mjs` | /arena at 390 + 1280: every chart / flow / board label renders ≥ 11 px (computed size × svg scale), no sideways page scroll, and no retired brown-palette literal in the Tetris figures or the step-through |
| `scripts/capture_wire.mjs` | the INSTALLED release `reflex` → `data/wire.json`: every request/response case on the site (answered, abstained, corpus, the ticket-triage worked example, errors, feedback, health), each caption's claim asserted, repeat determinism checked; refuses a STALE build stamp — re-run after every engine release |
| `scripts/render_wire.mjs` | `data/wire.json` → the `<!-- wire:case NAME -->` / `<!-- wire:version -->` blocks on 7 pages (`/#try-it`, `/docs/api/`, every footer); `--check` = stale-page gate; numbers keep their source text |
| `scripts/wasm_head_check.sh` | the `wasm-head` lane: clippy both arms, tests, shipped wasm = source build (`--write` refreshes) |
| `scripts/arena_head_parity.mjs` | the shipped wasm's decisions vs the recorded walks — must PASS before any ship |
| `scripts/resources_page_smoke.cjs` | the `/resources` education page: render smoke (sections incl. the #learn Jev primer first — glossary terms, valid request JSON, the figure, the Clef note digit-free; family chrome; no "seal"; framing sentences verbatim, every figure resolves, matrix shape, the moat law — no riir-rethink link) + the numbers law on visible text and on the primer figure's SVG text (tags stripped first; the same digit patterns as `sync_mirror.py`'s fence) |
| `scripts/public_copy_gate.cjs` | every served page rendered (details open): no internal record ids (`Plan/Proposal/Issue/Bench N`, `N-era`, `pre-N`), no "seal" (also over the served md/svg mirrors), no typed figure in FAQ copy (bind it to `data/bench.json` via `[data-ot]`, or allow it with a reason in `FAQ_FIGURE_ALLOW` — a stale allow row reds too), the family chrome, and no sideways scroll at 390 px |
| `scripts/image_gate.sh` | the image linter (WebP-first): every shipped raster is WebP where possible (cwebp, resized to the layout width it renders at, ~q 80; `--strict` makes non-WebP rasters fail instead of warn; `IMAGE_GATE_ALLOW` = deliberate exceptions, disclosed both directions), a size-bloat warning list (`IMAGE_GATE_WARN_KB` 300 soft / `IMAGE_GATE_MAX_KB` 1024 hard), and a zero-image scan refuses as a blind walk; `--self-test` proves every detector |
| `scripts/*_smoke.*`, `scripts/arena_demo_check.mjs` | page render smokes and the no-engine demo replay check |

## Adding a comparison lane (the checklist the mammoth publish paid for)

A new lane is ONE verdict in MANY files; the lane-surface gate (step 0/5 of
`republish_bench.sh`) enforces the file set, the edition ledger forces the
rest:

1. `publish_bench.py`: LANE_CLASSES + AREA_LANES + LANE_KIND + LANE_TIMING
   + LANE_DISPLAY + the merge block (the pplx/drex carry-law shape)
2. edition ledger row + `EDITION` bump + `data/changes.json` row (the
   scoring basis changes — the guard refuses without it)
3. `scripts/test_publish_bench.py`: the frozen digest literal moves WITH
   the ledger (stale pins red both directions)
4. `assets/bench-charts.js`: LANES palette entry (+ MODEL_FAMILIES row when
   `sizeFrom: "family"` — state the size or drop sizeFrom, never guess)
5. `assets/instinct.js`: the rival-list arrays (the loss rows go silent
   about a lane that misses this — the owner-visible failure)
6. run `scripts/republish_bench.sh` (the gate is step 0/5), review the
   diff, commit, deploy, probe the live page

## Before a deploy

Self-tests + smokes + parity check, commit + push, then `npx wrangler deploy`
(manual; the custom domain is dashboard-attached — `wrangler.toml` has the why).
Verify the live pages afterwards.

Flow-figure gates (riir-ai Plan 620): `python3 scripts/render_flows.py --check`
+ `python3 scripts/sync_mirror.py --check` are on the pre-deploy list; the
family-wide `node ../riir-ai/scripts/web_family_gate.mjs` S4 arm pins un-migrated
flow figures by name (a new flow lands as a `gfflow` block).

## Branch

`main` is the working branch AND the only branch (this repo rides `main`, like
`katgpt-web` — unlike the rest of the workspace there is no `develop`; do not
create one).

## Numbers

Never type a measured number into page copy, the README or this file: render
it from `data/*.json`, or link the instrument that prints it.

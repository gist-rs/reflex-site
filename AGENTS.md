# AGENTS.md — reflex-site

The global `~/.agents/` rules apply. [`BOUNDARY.md`](BOUNDARY.md) is the
contract (what this repo owns, what it does not); on conflict it wins.
[`README.md`](README.md) carries the full recipes — this file is the index.

The repo root IS the public assets directory (`wrangler.toml`): anything not
listed in `.assetsignore` is served at `reflex.gist.rs`. Never write build
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
| `scripts/render_tetris_flows.py` | render the flow figures from their source docs (tetris + reflex decision flow + instinct + the three lanes' dev-flow figures; per-source palette — family ink + the owning product's accent, the Tetris figures on the Reflex accent (the brown theme is retired); rename map keeps site filenames unique; `--check` = no-network mirror diff; `--only <repo>` re-renders one source) |
| `scripts/arena_legibility_smoke.mjs` | /arena at 390 + 1280: every chart / flow / board label renders ≥ 11 px (computed size × svg scale), no sideways page scroll, and no retired brown-palette literal in the Tetris figures or the step-through |
| `scripts/capture_wire.mjs` | the INSTALLED release `reflex` → `data/wire.json`: 13 verbatim request/response cases (answered, abstained, errors, feedback, health), each caption's claim asserted, repeat determinism checked; refuses a STALE build stamp — re-run after every engine release |
| `scripts/render_wire.mjs` | `data/wire.json` → the `<!-- wire:case NAME -->` / `<!-- wire:version -->` blocks on 7 pages (`/#try-it`, `/docs/api/`, every footer); `--check` = stale-page gate; numbers keep their source text |
| `scripts/wasm_head_check.sh` | the `wasm-head` lane: clippy both arms, tests, shipped wasm = source build (`--write` refreshes) |
| `scripts/arena_head_parity.mjs` | the shipped wasm's decisions vs the recorded walks — must PASS before any ship |
| `scripts/resources_page_smoke.cjs` | the `/resources` education page: render smoke (sections incl. the #learn Jev primer first — glossary terms, valid request JSON, the figure, the Clef note digit-free; family chrome; no "seal"; framing sentences verbatim, every figure resolves, matrix shape, the moat law — no riir-rethink link) + the numbers law on visible text and on the primer figure's SVG text (tags stripped first; the same digit patterns as `sync_mirror.py`'s fence) |
| `scripts/public_copy_gate.cjs` | every served page rendered (details open): no internal record ids (`Plan/Proposal/Issue/Bench N`, `N-era`, `pre-N`), no "seal" (also over the served md/svg mirrors), no typed figure in FAQ copy (bind it to `data/bench.json` via `[data-ot]`, or allow it with a reason in `FAQ_FIGURE_ALLOW` — a stale allow row reds too), the family chrome, and no sideways scroll at 390 px |
| `scripts/image_gate.sh` | the image linter (WebP-first): every shipped raster is WebP where possible (cwebp, resized to the layout width it renders at, ~q 80; `--strict` makes non-WebP rasters fail instead of warn; `IMAGE_GATE_ALLOW` = deliberate exceptions, disclosed both directions), a size-bloat warning list (`IMAGE_GATE_WARN_KB` 300 soft / `IMAGE_GATE_MAX_KB` 1024 hard), and a zero-image scan refuses as a blind walk; `--self-test` proves every detector |
| `scripts/*_smoke.*`, `scripts/arena_demo_check.mjs` | page render smokes and the no-engine demo replay check |

## Before a deploy

Run the self-tests, the smokes and the parity check, commit + push, then
`npx wrangler deploy` (manual; the custom domain is dashboard-attached —
`wrangler.toml` has the why). Verify the live pages afterwards.

## Branch

`main` is the working branch AND the only branch (this repo rides `main`, like
`katgpt-web` — unlike the rest of the workspace there is no `develop`; do not
create one).

## Numbers

Never type a measured number into page copy, the README or this file: render
it from `data/*.json`, or link the instrument that prints it.

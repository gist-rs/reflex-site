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
| `scripts/sync_mirror.py` | copy/verify the riir-reflex doc + SVG mirrors (`--check` = verify only) |
| `scripts/render_tetris_flows.py` | render the tetris flow figures from their source doc |
| `scripts/wasm_head_check.sh` | the `wasm-head` lane: clippy both arms, tests, shipped wasm = source build (`--write` refreshes) |
| `scripts/arena_head_parity.mjs` | the shipped wasm's decisions vs the recorded walks — must PASS before any ship |
| `scripts/*_smoke.*`, `scripts/arena_demo_check.mjs` | page render smokes and the no-engine demo replay check |

## Before a deploy

Run the self-tests, the smokes and the parity check, commit + push, then
`npx wrangler deploy` (manual; the custom domain is dashboard-attached —
`wrangler.toml` has the why). Verify the live pages afterwards.

## Numbers

Never type a measured number into page copy, the README or this file: render
it from `data/*.json`, or link the instrument that prints it.

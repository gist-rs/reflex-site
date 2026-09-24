# reflex-site

The public arena site for **Reflex** (the riir-reflex decision engine) —
static content only, deployed to `reflex.gist.rs` on Cloudflare Workers
static assets.

- `/` — install commands, the three-step start, the playground (talks to the
  visitor's OWN engine on `127.0.0.1:7331`; nothing is uploaded).
- `/bench/` — the per-task arena tables, rendered client-side from
  `data/bench.json`.
- `/arena/` — the live games. With an engine connected, both lanes play on
  the visitor's machine. Without one, the modelless Tetris, Flappy and
  three-lanes boards still play LIVE in-tab: `assets/arena_head.wasm` is
  the engine's fitted game heads compiled to WebAssembly (`wasm-head/`
  builds them), parity-proven against the recorded engine play before they
  move a piece; the heavier boards replay recorded games from
  `arena/demo_oracle.json`.
- `data/bench.json` — GENERATED from riir-reflex's harness output by
  `scripts/publish_bench.py` (sanitizes machine-local meta). Never
  hand-typed; a hand-typed number on the site is a defect by definition.

## Rebuild the wasm heads

`wasm-head/` is a zero-dependency Rust crate (its own workspace — it must
never join katgpt-rs's). After any change:

```sh
cd wasm-head
CARGO_TARGET_DIR=/tmp/reflex_site_wasm_head cargo test                # recipes + anchors + digests + blob regen
CARGO_TARGET_DIR=/tmp/reflex_site_wasm_head cargo build --release --target wasm32-unknown-unknown --lib
npm exec --yes -- wasm-opt -Oz --enable-bulk-memory \
    -o /tmp/arena_head_oz.wasm \
    /tmp/reflex_site_wasm_head/wasm32-unknown-unknown/release/arena_head_wasm.wasm
cp /tmp/arena_head_oz.wasm ../assets/arena_head.wasm
cd .. && node scripts/arena_head_parity.mjs                           # tetris 836/836 bit-exact + flappy 96/100 + lanes 84/100 or DO NOT ship
```

The corpus blobs inside the crate are generated from the digest-pinned
oracle fixtures by `cargo run --bin gen_corpus` (the only step that runs
the LOO λ selection); `cargo test` proves the committed blobs still match.

## Regenerate the demo oracle reels

`scripts/gen_demo_oracle.mjs` rebuilds the flappy/lanes reels (and the
tetris archetype rows) from the katgpt-rs fixtures — MERGE semantics: the
`tetris_walk`/`tetris_head_walk` engine-played games are owned by
`scripts/record_demo_walks.mjs` (needs a live engine) and are preserved.

## Regenerate the tables

In `riir-reflex`:

```sh
scripts/fetch_datasets.sh            # once
REFLEX_BENCH_HOST=<host-label> \
    cargo run --release --features laya-riir --bin harness
python3 ../reflex-site/scripts/publish_bench.py \
    <results-primary.json> [results-extra.json ...] ../reflex-site
```

`REFLEX_BENCH_HOST` names the host in results.json meta (the per-host merge
key — use a self-describing label like `m3` or `4090-windows`, not a bare
uname). The publish script MERGES per-host rows (Issue 018): the FIRST
results doc is the primary (its suites shape the tables; run the superset
run first), every further doc contributes `meta.hosts` rows + per-suite
`extra_host_lanes`. It REFUSES on modelless accuracy drift between hosts
(the cross-host determinism claim — stop and file, never publish) and
EXCLUDES population-mismatched suites (code_fixtures is repo-tree-relative
at runtime) with a note. The current per-host inputs live in reflex as
`.benchmarks/001_phase1_tables/results.json` (the m3 primary) and
`.benchmarks/018_4090windows_run/results.json` (the windows lane).

Commit + deploy. The provenance (git sha, date, host, protocols) rides
inside `bench.json` and renders on the page — every host in `meta.hosts`
is named in the provenance line.

## Deploy

```sh
npx wrangler deploy          # static assets; the reflex.gist.rs custom domain
                             # is dashboard-attached (wrangler.toml has the why)
npx wrangler dev             # local preview
```

No secrets, no bindings, no KV — the worker serves files and nothing else.

## Theme

Dark red rust (`#B7410E` / `#7C1D05` family) — the owner's explicit color
call. No yellow anywhere.

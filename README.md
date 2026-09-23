# reflex-site

The public arena site for **Reflex** (the riir-reflex decision engine) —
static content only, deployed to `reflex.gist.rs` on Cloudflare Workers
static assets.

- `/` — install commands, the three-step start, the playground (talks to the
  visitor's OWN engine on `127.0.0.1:7331`; nothing is uploaded).
- `/bench/` — the per-task arena tables, rendered client-side from
  `data/bench.json`.
- `/arena/` — the live games. With an engine connected, both lanes play on
  the visitor's machine. Without one, the modelless Tetris board still plays
  LIVE in-tab: `assets/arena_head.wasm` is the engine's fitted game head
  compiled to WebAssembly (`wasm-head/` builds it), parity-proven against
  the recorded engine play before it moves a piece; the heavier boards
  replay recorded games from `arena/demo_oracle.json`.
- `data/bench.json` — GENERATED from riir-reflex's harness output by
  `scripts/publish_bench.py` (sanitizes machine-local meta). Never
  hand-typed; a hand-typed number on the site is a defect by definition.

## Rebuild the wasm head

`wasm-head/` is a zero-dependency Rust crate (its own workspace — it must
never join katgpt-rs's). After any change:

```sh
cd wasm-head
CARGO_TARGET_DIR=/tmp/reflex_site_wasm_head cargo test                # recipe + anchors + blob regen
CARGO_TARGET_DIR=/tmp/reflex_site_wasm_head cargo build --release --target wasm32-unknown-unknown --lib
npm exec --yes -- wasm-opt -Oz --enable-bulk-memory \
    -o /tmp/arena_head_oz.wasm \
    /tmp/reflex_site_wasm_head/wasm32-unknown-unknown/release/arena_head_wasm.wasm
cp /tmp/arena_head_oz.wasm ../assets/arena_head.wasm
cd .. && node scripts/arena_head_parity.mjs                           # 836/836 bit-exact or DO NOT ship
```

The corpus blob inside the crate is generated from the BLAKE3-pinned oracle
fixture by `cargo run --bin gen_corpus` (the only step that runs the LOO λ
selection); `cargo test` proves the committed blob still matches.

## Regenerate the tables

In `riir-reflex`:

```sh
scripts/fetch_datasets.sh            # once
cargo run --release --features laya-riir --bin harness
python3 ../reflex-site/scripts/publish_bench.py \
    .benchmarks/001_phase1_tables/results.json ../reflex-site
```

Commit + deploy. The provenance (git sha, date, host, protocols) rides
inside `bench.json` and renders on the page.

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

# wasm-head — the arena's browser-live Tetris head

The engine's fitted game head (riir-reflex `src/game_heads.rs`, Plan 607 /
Bench 881's decoded arm) compiled to **WebAssembly**, so the arena's
latent-first lane plays in-tab with **zero engine**.

This is NOT a second model. It is the engine's own published recipe —

1. decode the spot sentence through the `laya-tetris-v2` grammar (5 class
   ordinals),
2. standardize by the corpus stats,
3. score = linear head `w·x` (ridge, λ selected by state-level LOO over the
   pinned grid),

— re-run at boot over the SAME BLAKE3-pinned oracle fixture
(`fixtures/tetris_oracle_laya_en_v2.jsonl`, BLAKE3 `f32c8577…f40bb`, the
engine's own serving copy). Every operation is a correctly-rounded IEEE-754
f64 primitive with a pinned accumulation order (`fmadd` on arm64, libm
`fma`/`sqrt` on wasm32), so the wasm fit is **bit-identical** to the native
engine's.

## Nothing is trusted without proof

| gate | where | what it pins |
|---|---|---|
| fixture bytes | `tests/recipe.rs` | the copy matches the engine's BLAKE3 pin |
| corpus blob | `tests/recipe.rs` | regenerates byte-identically from the fixture via the FULL recipe (LOO λ included) |
| grammar port | `tests/recipe.rs` | every one of the 2660 corpus sentences decodes + re-renders byte-identically |
| the recipe | `tests/recipe.rs` | LOO selects λ=1; Bench 881 anchors 44/120 in-corpus + 44/120 LOO reproduce from the fixture |
| boot | in-wasm | the blob re-validates, the fit RE-RUNS in the tab, the 44/120 in-corpus anchor must reproduce (`head_init` refuses otherwise) |
| behavior | `scripts/arena_head_parity.mjs` + the page's load probe | every recorded (sentence → f32 P(clean)) pair of the demo's head game is **bit-exact** (`Math.fround` equality) — 836/836 — before the board is allowed to play |

Any gate failing = the page keeps the recorded demo. The head never
half-plays.

## Layout

- `src/grammar.rs` — the template/vocabulary port + the counting recursive
  decode (Unknown/Ambiguous both refuse).
- `src/fit.rs` — standardizer (f64 + bit-equal u8 form), Gram accumulation
  with fused multiply-add, Cholesky solve, LOO protocol. Zero-alloc.
- `src/corpus.rs` — the compact blob format (`RFTC`): offsets, argmaxes,
  targets (f64 LE), raw ordinals. `BlobView` reads it allocation-free in
  no_std; the owned form is host-only.
- `src/boot.rs` — THE boot sequence, shared verbatim by the wasm module and
  the native test: the test asserts exactly what the tab runs.
- `src/gen.rs` + `src/bin/gen_corpus.rs` — fixture → blob (the only place
  the LOO λ selection runs; λ travels as generated data, never a
  hand-typed constant).
- `src/lib.rs` — the cdylib: statics + C ABI exports, no wasm-bindgen, no
  allocator. `head_alloc`/`head_reset` are a 16-aligned bump allocator the
  JS drives (single-threaded by construction).

Exports: `head_init` (0 = ok) · `head_ready` · `head_lambda` · `head_anchor`
· `head_alloc`/`head_reset` · `head_score(ptr, len) -> f64` (NaN = off-grammar
refusal — the honest abstain, mirroring the engine's fall-through) ·
`memory`.

## Rebuild

```sh
CARGO_TARGET_DIR=/tmp/reflex_site_wasm_head cargo test          # all gates
CARGO_TARGET_DIR=/tmp/reflex_site_wasm_head cargo build --release \
    --target wasm32-unknown-unknown --lib
npm exec --yes -- wasm-opt -Oz --enable-bulk-memory \
    -o /tmp/arena_head_oz.wasm \
    /tmp/reflex_site_wasm_head/wasm32-unknown-unknown/release/arena_head_wasm.wasm
cp /tmp/arena_head_oz.wasm ../assets/arena_head.wasm
cd .. && node scripts/arena_head_parity.mjs                     # 836/836 or DO NOT ship
```

After a corpus change (new oracle fixture from katgpt-rs): replace
`fixtures/…jsonl`, update the fixture pin in `tests/recipe.rs` +
`src/gen.rs`, update `N_OPTIONS`/`N_STATES` in `src/lib.rs` (and the test's
count asserts), run `cargo run --bin gen_corpus`, commit the new blob, then
the full chain above.

Measured on the M3 Max (2026-09-23): boot ~2 ms, ~1.2 µs per decision
through the JS ABI (probe of 836 recorded decisions, node), 72 KB artifact
(wasm-opt -Oz; ~35 KB of that is the incompressible corpus blob).

## Zero dependencies, by design

The crate (artifact side) has no dependencies at all — the whole pipeline
is a faithful core-only port, so nothing about the fit can drift via a
dependency bump. `blake3` is a dev-dependency (host tests only).

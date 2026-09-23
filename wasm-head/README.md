# wasm-head — the arena's browser-live game heads

The engine's fitted game heads (riir-reflex `src/game_heads.rs` is the
canonical serving port) compiled to **WebAssembly**, so the arena's
latent-first lane plays in-tab with **zero engine**:

- **tetris** — `laya-tetris-v2` spot sentences, Bench 881's decoded arm
  (λ=1, 44/120 in-corpus + LOO);
- **flappy** — `laya-flappy-v3` (state, option) sentence PAIRS, Bench 882's
  decoded arm — the structured-units reconstruction (λ=1, 96/100
  in-corpus + LOO, full head digest pinned). The joined-state protocol
  (riir-reflex issue 011) is trivially natural in-tab: the call takes both
  sentences.

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
| fixture bytes | `tests/recipe.rs` | each copy matches its BLAKE3 pin (tetris: the engine's hex; flappy: this repo's) |
| corpus blobs | `tests/recipe.rs` | regenerate byte-identically from the fixtures via the FULL recipes (LOO λ included) |
| grammar ports | `tests/recipe.rs` | every corpus sentence decodes + re-renders byte-identically |
| the recipes | `tests/recipe.rs` | LOO λ + published anchors reproduce from the fixtures: tetris λ=1 44/120+44/120; flappy λ=1 96/100+96/100 **+ the full Bench 882 head digest** |
| reconstruction | `tests/recipe.rs` | the flappy structured-units law is exact where the render is exact (vs the fixture's own feature arrays) |
| boot | in-wasm | each blob re-validates, its fit RE-RUNS in the tab, and the in-corpus anchor must reproduce (`head_ready` mask bits refuse otherwise) |
| behavior | `scripts/arena_head_parity.mjs` + the page's load probes | tetris: every recorded (sentence → f32 P(clean)) pair of the demo's head game is bit-exact — 836/836; flappy: the head's argmax matches the recorded oracle decision on exactly 96/100 corpus states — before any board plays |

Any gate failing = the page keeps the recorded demo. A head never
half-plays, and a flappy failure degrades flappy ALONE (tetris keeps
playing).

## Layout

- `src/grammar.rs` — the template/vocabulary ports (tetris spot; flappy v3
  option + state) + the counting recursive decode + the flappy
  structured-units reconstruction law.
- `src/fit.rs` — generic-over-width standardizer (f64 + bit-equal i8
  form), Gram accumulation with fused multiply-add, Cholesky solve, LOO
  protocol. Zero-alloc. The Gram/L buffers are `[[f64; D]; D]` (bare
  const-generic array lengths are stable; `D * D` is not).
- `src/corpus.rs` — the compact blob format (`RFTC` v2): counts, λ,
  anchors, feature width, offsets, argmaxes, targets (f64 LE), raw
  ordinals (**i8 bytes** — the flappy structured units go negative; a u8
  cast saturates them to 0, measured 846/1600 cells corrupted before this
  was caught by the digest gate). `BlobView` reads it allocation-free in
  no_std; the owned form is host-only.
- `src/boot.rs` — THE boot sequence, shared verbatim by the wasm module and
  the native test: the test asserts exactly what the tab runs.
- `src/gen.rs` + `src/bin/gen_corpus.rs` — fixtures → blobs (the only
  place the LOO λ selection runs; λ travels as generated data, never a
  hand-typed constant).
- `src/lib.rs` — the cdylib: statics + C ABI exports, no wasm-bindgen, no
  allocator. `head_alloc`/`head_reset` are a 16-aligned bump allocator the
  JS drives (single-threaded by construction).

Exports: `head_init` (0 = both heads ok, 1 = partial) · `head_ready`
(mask: bit0 tetris, bit1 flappy) · `head_lambda`/`head_anchor` (tetris) ·
`head_flappy_lambda`/`head_flappy_anchor` · `head_alloc`/`head_reset` ·
`head_score(ptr, len) -> f64` (tetris P(clean)) · `head_score_state(state,
state_len, opt, opt_len) -> f64` (flappy P(clean)) — NaN = off-grammar
refusal, the honest abstain mirroring the engine's fall-through · `memory`.

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
`fixtures/…jsonl`, update the fixture pins in `tests/recipe.rs`, update
the `N_OPTIONS`/`N_STATES` consts in `src/lib.rs` (and the test's count
asserts), run `cargo run --bin gen_corpus`, commit the new blobs, then the
full chain above.

Measured on the M3 Max (2026-09-24): boot ~2.4 ms (both heads), ~1.2 µs
per tetris decision through the JS ABI (836-pair probe), flappy agreement
96/100 over the corpus reel, 85 KB artifact (wasm-opt -Oz; most of it the
two incompressible corpus blobs).

## Zero dependencies, by design

The crate (artifact side) has no dependencies at all — the whole pipeline
is a faithful core-only port, so nothing about the fit can drift via a
dependency bump. `blake3` is a dev-dependency (host tests only).

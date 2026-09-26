#!/usr/bin/env bash
# The wasm-head lane: lint BOTH arms, run the host tests, and prove the
# shipped `assets/arena_head.wasm` is exactly what the source builds.
#
#   scripts/wasm_head_check.sh           # check (exit 1 on any failure)
#   scripts/wasm_head_check.sh --write   # same, but REFRESH the shipped wasm
#                                        # instead of failing on a mismatch
#
# Why both arms: `wasm-head` is `no_std` + `#[cfg(target_arch = "wasm32")]`
# on the shipped side and std on the host-test side, so a host-only lint
# compiles the shipped arm to nothing (katgpt-rs AGENTS.md, the wasm32 axis).
# Why the byte compare: a source edit whose rebuild was forgotten ships a
# browser head that no test in this repo ever ran. The build is reproducible
# (same toolchain + wasm-opt → identical bytes), so `cmp` is the whole check.
# After `--write`, run `node scripts/arena_head_parity.mjs` — the bytes
# changing is exactly when the behaviour needs re-proving.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$HERE/wasm-head/Cargo.toml"
SHIPPED="$HERE/assets/arena_head.wasm"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/reflex_site_wasm_head}"
RAW="$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/arena_head_wasm.wasm"
OPT="$CARGO_TARGET_DIR/arena_head_oz.wasm"
WRITE=0
[ "${1:-}" = "--write" ] && WRITE=1

echo "▸ clippy (wasm32 arm, the shipped one)"
cargo clippy --manifest-path "$MANIFEST" --target wasm32-unknown-unknown --lib -- -D warnings

echo "▸ clippy (host arm, all targets)"
cargo clippy --manifest-path "$MANIFEST" --all-targets -- -D warnings

echo "▸ host tests (recipes + anchors + digests + blob regen)"
cargo test --manifest-path "$MANIFEST"

echo "▸ release build + wasm-opt"
cargo build --manifest-path "$MANIFEST" --release --target wasm32-unknown-unknown --lib
npm exec --yes -- wasm-opt -Oz --enable-bulk-memory -o "$OPT" "$RAW"

if cmp -s "$OPT" "$SHIPPED"; then
    echo "✓ wasm-head lane PASSED — both arms lint-clean, tests green, shipped wasm = source build"
    exit 0
fi
if [ "$WRITE" -eq 1 ]; then
    cp "$OPT" "$SHIPPED"
    echo "✓ wasm-head lane PASSED — shipped wasm REFRESHED from source; now run: node scripts/arena_head_parity.mjs"
    exit 0
fi
echo "✗ wasm-head lane FAILED — assets/arena_head.wasm is NOT what the source builds." >&2
echo "  Rebuild with: scripts/wasm_head_check.sh --write, then re-prove behaviour with" >&2
echo "  node scripts/arena_head_parity.mjs" >&2
exit 1

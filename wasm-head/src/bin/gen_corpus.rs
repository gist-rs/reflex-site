//! Regenerate the committed corpus blob (`src/tetris_corpus.bin`) from the
//! pinned fixture — the ONLY build step that runs the LOO λ selection, so
//! the recipe's chosen λ travels as generated data, never a hand-typed
//! constant. `tests/recipe.rs` proves the committed blob still matches.
//!
//!   cargo run -p arena-head-wasm --bin gen_corpus

use arena_head_wasm::gen;

fn main() {
    let bytes = gen::build_corpus_bytes();
    let dest = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/tetris_corpus.bin");
    std::fs::write(&dest, &bytes).unwrap_or_else(|e| panic!("write {}: {e}", dest.display()));
    println!(
        "wrote {} ({} bytes) — run `cargo test` to verify the committed copy",
        dest.display(),
        bytes.len()
    );
}

//! Regenerate the committed corpus blobs (`src/tetris_corpus.bin` +
//! `src/flappy_corpus.bin`) from the pinned fixtures — the ONLY build step
//! that runs the LOO λ selection, so each recipe's chosen λ travels as
//! generated data, never a hand-typed constant. `tests/recipe.rs` proves
//! the committed blobs still match.
//!
//!   cargo run -p arena-head-wasm --bin gen_corpus

use arena_head_wasm::gen;

fn main() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let tetris = gen::build_corpus_bytes();
    let tdest = root.join("src/tetris_corpus.bin");
    std::fs::write(&tdest, &tetris).unwrap_or_else(|e| panic!("write {}: {e}", tdest.display()));
    println!(
        "wrote {} ({} bytes)",
        tdest.display(),
        tetris.len()
    );
    let flappy = gen::build_flappy_bytes();
    let fdest = root.join("src/flappy_corpus.bin");
    std::fs::write(&fdest, &flappy).unwrap_or_else(|e| panic!("write {}: {e}", fdest.display()));
    println!(
        "wrote {} ({} bytes)",
        fdest.display(),
        flappy.len()
    );
    let lanes = gen::build_lanes_bytes();
    let ldest = root.join("src/lanes_corpus.bin");
    std::fs::write(&ldest, &lanes).unwrap_or_else(|e| panic!("write {}: {e}", ldest.display()));
    println!(
        "wrote {} ({} bytes)",
        ldest.display(),
        lanes.len()
    );
    println!("run `cargo test` to verify the committed copies");
}

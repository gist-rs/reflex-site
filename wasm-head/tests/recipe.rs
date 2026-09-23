//! The wasm head's build-time gates — the host asserts exactly what the tab
//! runs. In order of what they protect:
//!
//! 1. the fixture bytes (the cross-repo data contract, BLAKE3-pinned — the
//!    same hex the engine's `game_heads.rs` names);
//! 2. the committed blob (regenerates byte-identically from the fixture via
//!    the FULL recipe, LOO λ selection included);
//! 3. the grammar port (every corpus sentence decodes and re-renders
//!    byte-identically — the same drift detector the engine runs);
//! 4. the recipe (the LOO-selected λ is 1 and the Bench 881 anchors — 44/120
//!    in-corpus, 44/120 LOO — reproduce from the fixture INDEPENDENTLY of
//!    the blob);
//! 5. the boot path (the shared `boot::run` — the exact sequence the wasm
//!    module executes — verifies the anchors and is bit-deterministic);
//! 6. the u8 standardizer (bit-equal to the f64 one — the wasm fit's input);
//! 7. the score path (corpus sentences answer in range; garbage refuses).

use arena_head_wasm::boot::{self, BootPlan};
use arena_head_wasm::corpus::owned::parse_owned;
use arena_head_wasm::fit::{self, HeadFitter, Standardizer, D};
use arena_head_wasm::gen;

/// The cross-repo data contract — the hex the engine pins in
/// `riir-reflex/src/game_heads.rs`.
const FIXTURE_PIN: &str = "f32c8577bca50726618d2bb4fb27c904148161d650f16a59c01676a97fa540bb";

#[test]
fn fixture_copy_matches_the_pinned_blake3() {
    let hash = blake3::hash(gen::FIXTURE.as_bytes()).to_hex().to_string();
    assert_eq!(hash, FIXTURE_PIN, "the fixture copy drifted from the pin");
    assert_eq!(gen::FIXTURE_BLAKE3, FIXTURE_PIN);
}

#[test]
fn committed_blob_regenerates_byte_identically() {
    let fresh = gen::build_corpus_bytes();
    let committed = include_bytes!("../src/tetris_corpus.bin");
    assert_eq!(
        fresh.as_slice(),
        committed,
        "the committed blob no longer matches the recipe — regenerate with `cargo run --bin gen_corpus`"
    );
}

#[test]
fn every_corpus_sentence_round_trips_through_the_grammar() {
    let c = gen::parse_fixture();
    assert_eq!(c.sentences.len(), 2660);
    assert_eq!(c.raws.len(), 2660);
    for (i, s) in c.sentences.iter().enumerate() {
        let fills = arena_head_wasm::grammar::decode(s)
            .unwrap_or_else(|| panic!("sentence {i} refused: {s}"));
        let got: Vec<u8> = fills[..5].to_vec();
        let want: Vec<u8> = c.raws[i].iter().map(|x| *x as u8).collect();
        assert_eq!(got, want, "sentence {i} decodes to different fills");
        assert_eq!(&arena_head_wasm::grammar::render(&got), s, "re-render drifted");
    }
}

#[test]
fn the_full_recipe_selects_lambda_1_and_hits_the_anchors() {
    let c = gen::parse_fixture();
    let stdizer = Standardizer::fit(&c.raws);
    let rows: Vec<[f64; D]> = c.raws.iter().map(|r| stdizer.design(r)).collect();
    let mut fitter = HeadFitter::new();
    let (lambda, loo_picks) = fit::loo_select(&mut fitter, &rows, &c.targets, &c.offsets);
    assert_eq!(lambda, 1.0, "LOO-selected λ drifted from the published fit");
    let loo_agree = loo_picks
        .iter()
        .zip(c.argmaxes.iter())
        .filter(|(p, a)| **p == **a as usize)
        .count();
    assert_eq!(loo_agree, 44, "LOO agreement drifted from Bench 881");
    let head = fitter.fit_into(&rows, &c.targets, lambda);
    let in_agree = (0..c.argmaxes.len())
        .filter(|&s| {
            fit::pick_range(
                &head,
                &rows,
                (c.offsets[s] as usize, c.offsets[s + 1] as usize),
            ) == c.argmaxes[s] as usize
        })
        .count();
    assert_eq!(in_agree, 44, "in-corpus agreement drifted from Bench 881");
}

#[test]
fn the_committed_blob_boots_to_the_published_anchors_and_is_deterministic() {
    let c = parse_owned(include_bytes!("../src/tetris_corpus.bin")).expect("blob parses");
    assert_eq!(c.lambda, 1.0);
    assert_eq!(c.in_anchor, 44);
    assert_eq!(c.loo_anchor, 44);
    let plan = BootPlan {
        n_options: c.n_options,
        n_states: c.n_states,
        lambda: c.lambda,
        in_anchor: c.in_anchor,
        offsets: &c.offsets,
        argmaxes: &c.argmaxes,
        targets: &c.targets,
        raws: &c.raws,
    };
    let mut rows1 = vec![[0.0; D]; c.n_options];
    let out1 = boot::run(&plan, &mut rows1, &mut HeadFitter::new()).expect("boot ok");
    assert_eq!(out1.in_agree, 44);
    assert_eq!(out1.w.len(), 6);
    // determinism: the same blob boots bit-identically (the wasm tab re-runs
    // this exact sequence, so a wobble here is a wobble in every browser)
    let mut rows2 = vec![[0.0; D]; c.n_options];
    let out2 = boot::run(&plan, &mut rows2, &mut HeadFitter::new()).expect("boot ok 2");
    assert_eq!(out1.w, out2.w, "the boot fit must be bit-deterministic");
    assert_eq!(out1.std, out2.std);
}

#[test]
fn u8_standardizer_equals_the_f64_one_bit_for_bit() {
    let c = gen::parse_fixture();
    let mut flat = Vec::with_capacity(c.raws.len() * 5);
    for r in &c.raws {
        for x in r {
            flat.push(*x as u8);
        }
    }
    let s_f64 = Standardizer::fit(&c.raws);
    let s_u8 = Standardizer::fit_u8(&flat);
    assert_eq!(s_f64, s_u8, "the wasm standardizer drifted from the f64 one");
}

#[test]
fn the_score_path_answers_corpus_sentences_and_refuses_garbage() {
    let c = parse_owned(include_bytes!("../src/tetris_corpus.bin")).expect("blob parses");
    let plan = BootPlan {
        n_options: c.n_options,
        n_states: c.n_states,
        lambda: c.lambda,
        in_anchor: c.in_anchor,
        offsets: &c.offsets,
        argmaxes: &c.argmaxes,
        targets: &c.targets,
        raws: &c.raws,
    };
    let mut rows = vec![[0.0; D]; c.n_options];
    let out = boot::run(&plan, &mut rows, &mut HeadFitter::new()).expect("boot ok");
    // a well-formed spot sentence (the first corpus sentence, verbatim)
    let s0 = gen::parse_fixture().sentences[0].clone();
    let p = boot::score_sentence(&out.std, &out.w, &s0).expect("corpus sentence scores");
    assert!((0.0..=1.0).contains(&p));
    // the engine's wire casts f32 — the served value must survive its own cast
    assert!(((p as f32) as f64 - p).abs() < 1e-6);
    // garbage refuses — the honest abstain, never a guess
    assert!(boot::score_sentence(&out.std, &out.w, "hello world").is_none());
    assert!(boot::score_sentence(&out.std, &out.w, "").is_none());
}

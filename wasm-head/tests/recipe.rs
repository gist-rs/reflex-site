//! The wasm heads' build-time gates — the host asserts exactly what the tab
//! runs. In order of what they protect:
//!
//! 1. the fixture bytes (the cross-repo data contracts, BLAKE3-pinned —
//!    tetris the same hex the engine's `game_heads.rs` names; flappy the
//!    Bench 882 fixture copy);
//! 2. the committed blobs (regenerate byte-identically from the fixtures
//!    via the FULL recipes, LOO λ selection included);
//! 3. the grammar ports (every corpus sentence decodes and re-renders
//!    byte-identically — the same drift detector the engine runs);
//! 4. the recipes (the LOO-selected λ and the published anchors reproduce
//!    from the fixtures INDEPENDENTLY of the blobs: tetris Bench 881 λ=1
//!    42/120 + 42/120 (v3 refit Bench 892); flappy v3 Bench 882 λ=1 96/100 + 96/100 + the
//!    published full head digest);
//! 5. the boot path (the shared `boot::run` — the exact sequence the wasm
//!    module executes — verifies the anchors and is bit-deterministic);
//! 6. the u8 standardizer (bit-equal to the f64 one — the wasm fits'
//!    input);
//! 7. the score paths (corpus sentences answer in range; garbage refuses;
//!    the flappy reconstruction is exact where the render is exact).

use arena_head_wasm::boot::{self, BootPlan};
use arena_head_wasm::corpus::owned::parse_owned;
use arena_head_wasm::fit::{self, HeadFitter, Standardizer};
use arena_head_wasm::gen::{self, FLAPPY_D, FLAPPY_F, LANES_D, LANES_F, TETRIS_D, TETRIS_F};

/// The cross-repo data contract — the hex the engine pins in
/// `riir-reflex/src/game_heads.rs`.
const TETRIS_FIXTURE_PIN: &str =
    "12035ebf43d0293c7ec00e716e72ee6a21686cc41a222938a81d0abd9316e804";
/// The Bench 882 decoded-arm head digest (katgpt-rs
/// `examples/decode_01_losslessness.rs` `FLAPPY_V3_DECODED_HEAD_ANCHOR`).
const FLAPPY_HEAD_PIN: &str =
    "c93d36dc79c0490334c20353ce5d6479eaee3448b686ac057f8a4ad4b98ae3c5";
/// The lanes fixture pin — the committed fixture's own BLAKE3 (the Bench 880
/// record's `6a6d02af…4f600`).
const LANES_FIXTURE_PIN: &str =
    "6a6d02af05b529749ddac3bf962344c2e22565b467f28a5eecd37031d0a4f600";
/// The lanes head digest prefix — Bench 880's published anchor. The decoded
/// arm is EXACTLY lossless (Bench 882: identical digest), so the wasm port's
/// fit must land on the same head.
const LANES_HEAD_PREFIX: &str = "7d3f1d8e";

fn flappy_digest(w: &[f64; FLAPPY_D]) -> String {
    let mut bytes = Vec::with_capacity(FLAPPY_D * 8);
    for x in w {
        bytes.extend_from_slice(&x.to_le_bytes());
    }
    blake3::hash(&bytes).to_hex().to_string()
}

fn lanes_digest(w: &[f64; LANES_D]) -> String {
    let mut bytes = Vec::with_capacity(LANES_D * 8);
    for x in w {
        bytes.extend_from_slice(&x.to_le_bytes());
    }
    blake3::hash(&bytes).to_hex().to_string()
}

#[test]
fn fixture_copies_match_their_pinned_hashes() {
    let t = blake3::hash(gen::FIXTURE.as_bytes()).to_hex().to_string();
    assert_eq!(t, TETRIS_FIXTURE_PIN, "the tetris fixture copy drifted");
    assert_eq!(gen::FIXTURE_BLAKE3, TETRIS_FIXTURE_PIN);
    // the flappy fixture copy: pinned so a silent re-wording can never
    // shift a served probability
    let f = blake3::hash(gen::FLAPPY_FIXTURE.as_bytes()).to_hex().to_string();
    assert_eq!(
        f,
        "88ac82bfd2d50fb9f3448d57242d93f8fd9fd02ce101b5c1f97c249206f51fba",
        "the flappy fixture copy drifted"
    );
    let l = blake3::hash(gen::LANES_FIXTURE.as_bytes()).to_hex().to_string();
    assert_eq!(l, LANES_FIXTURE_PIN, "the lanes fixture copy drifted");
    assert_eq!(gen::LANES_FIXTURE_BLAKE3, LANES_FIXTURE_PIN);
}

#[test]
fn committed_blobs_regenerate_byte_identically() {
    let t = gen::build_corpus_bytes();
    let t_committed = include_bytes!("../src/tetris_corpus.bin");
    assert_eq!(
        t.as_slice(),
        t_committed,
        "the tetris blob no longer matches the recipe — regenerate with `cargo run --bin gen_corpus`"
    );
    let f = gen::build_flappy_bytes();
    let f_committed = include_bytes!("../src/flappy_corpus.bin");
    assert_eq!(
        f.as_slice(),
        f_committed,
        "the flappy blob no longer matches the recipe — regenerate with `cargo run --bin gen_corpus`"
    );
    let l = gen::build_lanes_bytes();
    let l_committed = include_bytes!("../src/lanes_corpus.bin");
    assert_eq!(
        l.as_slice(),
        l_committed,
        "the lanes blob no longer matches the recipe — regenerate with `cargo run --bin gen_corpus`"
    );
}

#[test]
fn every_corpus_sentence_round_trips_through_the_grammars() {
    let c = gen::parse_fixture();
    assert_eq!(c.sentences.len(), 2660);
    for (i, s) in c.sentences.iter().enumerate() {
        let fills = arena_head_wasm::grammar::decode_tetris_spot(s)
            .unwrap_or_else(|| panic!("tetris sentence {i} refused: {s}"));
        let got: Vec<u8> = fills[..5].to_vec();
        let want: Vec<u8> = c.raws[i].iter().map(|x| *x as u8).collect();
        assert_eq!(got, want, "tetris sentence {i} decodes to different fills");
        assert_eq!(
            &arena_head_wasm::grammar::render(arena_head_wasm::grammar::GameGrammar::TetrisSpot, &got),
            s,
            "tetris re-render drifted"
        );
    }
    let f = gen::parse_flappy();
    for i in 0..f.option_sentences.len() {
        let (st, op) = (&f.state_sentences[i], &f.option_sentences[i]);
        let fills = arena_head_wasm::grammar::decode_flappy_option_v3(op)
            .unwrap_or_else(|| panic!("flappy option {i} refused: {op}"));
        assert_eq!(
            &arena_head_wasm::grammar::render(arena_head_wasm::grammar::GameGrammar::FlappyOptionV3, &fills),
            op,
            "flappy option re-render drifted"
        );
        let (rel, v, h) = arena_head_wasm::grammar::decode_flappy_state(st)
            .unwrap_or_else(|| panic!("flappy state {i} refused: {st}"));
        let _ = (rel, v, h); // the exactness test re-derives these below
    }
    let l = gen::parse_lanes();
    assert_eq!(l.lane_sentences.len(), 100);
    for (s, sentences) in l.lane_sentences.iter().enumerate() {
        for (lane, s_text) in sentences.iter().enumerate() {
            let d = arena_head_wasm::grammar::decode_lanes_option(s_text)
                .unwrap_or_else(|| panic!("lanes state {s} lane {lane} refused: {s_text}"));
            assert_eq!(d.lane as usize, lane, "lanes state {s}: lane order drifted");
            assert_eq!(
                arena_head_wasm::grammar::render_lanes(d),
                s_text.as_str(),
                "lanes re-render drifted"
            );
        }
    }
}

#[test]
fn the_tetris_recipe_selects_lambda_1_and_hits_the_anchors() {
    let c = gen::parse_fixture();
    let stdizer = Standardizer::<TETRIS_F>::fit(&c.raws);
    let rows: Vec<[f64; TETRIS_D]> = c.raws.iter().map(|r| stdizer.design(r)).collect();
    let mut fitter = HeadFitter::<TETRIS_D>::new();
    let (lambda, loo_picks) = fit::loo_select(&mut fitter, &rows, &c.targets, &c.offsets);
    assert_eq!(lambda, 1.0, "LOO-selected λ drifted from the published fit");
    let loo_agree = loo_picks
        .iter()
        .zip(c.argmaxes.iter())
        .filter(|(p, a)| **p == **a as usize)
        .count();
    assert_eq!(loo_agree, 42, "LOO agreement drifted from the v3 refit (Bench 892)");
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
    assert_eq!(in_agree, 42, "in-corpus agreement drifted from the v3 refit (Bench 892)");
}

#[test]
fn the_flappy_recipe_reproduces_the_bench_882_decoded_arm() {
    let c = gen::parse_flappy();
    let stdizer = Standardizer::<FLAPPY_F>::fit(&c.raws);
    let rows: Vec<[f64; FLAPPY_D]> = c.raws.iter().map(|r| stdizer.design(r)).collect();
    let mut fitter = HeadFitter::<FLAPPY_D>::new();
    let (lambda, loo_picks) = fit::loo_select(&mut fitter, &rows, &c.targets, &c.offsets);
    assert_eq!(lambda, 1.0, "LOO-selected λ drifted from the Bench 882 fit");
    let loo_agree = loo_picks
        .iter()
        .zip(c.argmaxes.iter())
        .filter(|(p, a)| **p == **a as usize)
        .count();
    assert_eq!(loo_agree, 96, "LOO agreement drifted from Bench 882");
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
    assert_eq!(in_agree, 96, "in-corpus agreement drifted from Bench 882");
    // the strongest anchor: the published full head digest — the weights
    // are bit-identical to the two-box-portable pinned artifact
    assert_eq!(
        flappy_digest(&head),
        FLAPPY_HEAD_PIN,
        "the flappy head weights drifted from the Bench 882 decoded-arm digest"
    );
}

#[test]
fn the_lanes_recipe_reproduces_the_bench_880_lossless_head() {
    let c = gen::parse_lanes();
    // the lossless anchor itself — parse_lanes already asserts every row,
    // re-assert the count so this test stands alone
    assert_eq!(c.raws.len(), 300);
    assert_eq!(c.fixture_features.len(), 300);
    assert_eq!(c.raws.as_slice(), c.fixture_features.as_slice());
    let stdizer = Standardizer::<LANES_F>::fit(&c.raws);
    let rows: Vec<[f64; LANES_D]> = c.raws.iter().map(|r| stdizer.design(r)).collect();
    let mut fitter = HeadFitter::<LANES_D>::new();
    let (lambda, loo_picks) = fit::loo_select(&mut fitter, &rows, &c.targets, &c.offsets);
    assert_eq!(lambda, 0.01, "LOO-selected λ drifted from the Bench 880 fit");
    let loo_agree = loo_picks
        .iter()
        .zip(c.argmaxes.iter())
        .filter(|(p, a)| **p == **a as usize)
        .count();
    assert_eq!(loo_agree, 84, "LOO agreement drifted from Bench 880");
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
    assert_eq!(in_agree, 84, "in-corpus agreement drifted from Bench 880");
    // the digest-prefix anchor — the same head the published record names
    assert!(
        lanes_digest(&head).starts_with(LANES_HEAD_PREFIX),
        "the lanes head weights drifted from the Bench 880 anchor prefix"
    );
}

#[test]
fn the_flappy_reconstruction_is_exact_where_the_render_is_exact() {
    let c = gen::parse_flappy();
    assert_eq!(c.raws.len(), c.fixture_features.len());
    let mut exact_rows = 0usize;
    for (i, rec) in c.raws.iter().enumerate() {
        let truth = &c.fixture_features[i];
        // always-exact columns: post_v, pre_v, gap_half (indices 2, 4, 7)
        for &k in &[2usize, 4, 7] {
            assert_eq!(
                rec[k], truth[k],
                "option {i}: exact column {k} drifted (rec {} vs truth {})",
                rec[k], truth[k]
            );
        }
        // FULL exactness where the render is exact: option bands 1..=5
        // (squeeze/lower/middle/upper — no crash-tail collapse) AND the
        // state rel within the band's ±2 (|true pre_rel| ≤ 2 → rel bands
        // 1..=3). The option's band travels in the fixture's own features:
        // post_rel == ±h or 0 distinguishes exact rows, but the simplest
        // sound scope is the recorded truth itself: |truth pre_rel| ≤ 2
        // and |truth post_rel| ≤ h means the render lost nothing.
        let h = truth[7];
        if truth[3].abs() <= 2.0 && truth[0].abs() <= h {
            for k in 0..FLAPPY_F {
                assert_eq!(
                    rec[k], truth[k],
                    "option {i}: column {k} drifted on an exact row (rec {} vs truth {})",
                    rec[k], truth[k]
                );
            }
            exact_rows += 1;
        }
    }
    assert!(
        exact_rows >= 100,
        "the exact scope collapsed ({exact_rows} rows) — the corpus or the law moved"
    );
}

#[test]
fn the_committed_blobs_boot_to_the_published_anchors_and_are_deterministic() {
    for (name, bytes, lambda_want, in_want, loo_want, n_options, _n_states) in [
        (
            "tetris",
            include_bytes!("../src/tetris_corpus.bin").as_slice(),
            1.0,
            42u32,
            42u32,
            2660usize,
            120usize,
        ),
        (
            "flappy",
            include_bytes!("../src/flappy_corpus.bin").as_slice(),
            1.0,
            96u32,
            96u32,
            200usize,
            100usize,
        ),
        (
            "lanes",
            include_bytes!("../src/lanes_corpus.bin").as_slice(),
            0.01,
            84u32,
            84u32,
            300usize,
            100usize,
        ),
    ] {
        if name == "tetris" {
            let c = parse_owned(bytes).expect("tetris blob parses");
            assert_eq!(c.lambda, lambda_want);
            assert_eq!(c.in_anchor, in_want);
            assert_eq!(c.loo_anchor, loo_want);
            let plan = BootPlan::<TETRIS_F, TETRIS_D> {
                n_options: c.n_options,
                n_states: c.n_states,
                lambda: c.lambda,
                in_anchor: c.in_anchor,
                offsets: &c.offsets,
                argmaxes: &c.argmaxes,
                targets: &c.targets,
                raws: &c.raws,
            };
            let mut rows1 = vec![[0.0; TETRIS_D]; n_options];
            let out1 = boot::run(&plan, &mut rows1, &mut HeadFitter::<TETRIS_D>::new()).expect("boot ok");
            assert_eq!(out1.in_agree, in_want);
            let mut rows2 = vec![[0.0; TETRIS_D]; n_options];
            let out2 = boot::run(&plan, &mut rows2, &mut HeadFitter::<TETRIS_D>::new()).expect("boot ok 2");
            assert_eq!(out1.w, out2.w, "the tetris boot fit must be bit-deterministic");
            assert_eq!(out1.std, out2.std);
        } else if name == "flappy" {
            let c = parse_owned(bytes).expect("flappy blob parses");
            assert_eq!(c.lambda, lambda_want);
            assert_eq!(c.in_anchor, in_want);
            assert_eq!(c.loo_anchor, loo_want);
            let plan = BootPlan::<FLAPPY_F, FLAPPY_D> {
                n_options: c.n_options,
                n_states: c.n_states,
                lambda: c.lambda,
                in_anchor: c.in_anchor,
                offsets: &c.offsets,
                argmaxes: &c.argmaxes,
                targets: &c.targets,
                raws: &c.raws,
            };
            let mut rows1 = vec![[0.0; FLAPPY_D]; n_options];
            let out1 = boot::run(&plan, &mut rows1, &mut HeadFitter::<FLAPPY_D>::new()).expect("boot ok");
            assert_eq!(out1.in_agree, in_want);
            assert_eq!(flappy_digest(&out1.w), FLAPPY_HEAD_PIN, "the boot fit must reproduce the published digest");
            let mut rows2 = vec![[0.0; FLAPPY_D]; n_options];
            let out2 = boot::run(&plan, &mut rows2, &mut HeadFitter::<FLAPPY_D>::new()).expect("boot ok 2");
            assert_eq!(out1.w, out2.w, "the flappy boot fit must be bit-deterministic");
            assert_eq!(out1.std, out2.std);
        } else {
            let c = parse_owned(bytes).expect("lanes blob parses");
            assert_eq!(c.lambda, lambda_want);
            assert_eq!(c.in_anchor, in_want);
            assert_eq!(c.loo_anchor, loo_want);
            let plan = BootPlan::<LANES_F, LANES_D> {
                n_options: c.n_options,
                n_states: c.n_states,
                lambda: c.lambda,
                in_anchor: c.in_anchor,
                offsets: &c.offsets,
                argmaxes: &c.argmaxes,
                targets: &c.targets,
                raws: &c.raws,
            };
            let mut rows1 = vec![[0.0; LANES_D]; n_options];
            let out1 = boot::run(&plan, &mut rows1, &mut HeadFitter::<LANES_D>::new()).expect("boot ok");
            assert_eq!(out1.in_agree, in_want);
            assert!(
                lanes_digest(&out1.w).starts_with(LANES_HEAD_PREFIX),
                "the boot fit must reproduce the published digest prefix"
            );
            let mut rows2 = vec![[0.0; LANES_D]; n_options];
            let out2 = boot::run(&plan, &mut rows2, &mut HeadFitter::<LANES_D>::new()).expect("boot ok 2");
            assert_eq!(out1.w, out2.w, "the lanes boot fit must be bit-deterministic");
            assert_eq!(out1.std, out2.std);
        }
    }
}

#[test]
fn i8_standardizer_equals_the_f64_one_bit_for_bit() {
    let c = gen::parse_fixture();
    let mut flat = Vec::with_capacity(c.raws.len() * TETRIS_F);
    for r in &c.raws {
        for x in r {
            flat.push(*x as i8 as u8);
        }
    }
    let s_f64 = Standardizer::<TETRIS_F>::fit(&c.raws);
    let s_u8 = Standardizer::<TETRIS_F>::fit_i8(&flat);
    assert_eq!(s_f64, s_u8, "the tetris wasm standardizer drifted");

    let f = gen::parse_flappy();
    // the flappy raws are integer-valued structured units (including
    // negatives) — the blob carries them as i8 bytes; verify the i8
    // standardizer equals the f64 fit over the SAME values
    let f_rows: Vec<[f64; FLAPPY_F]> = f
        .raws
        .iter()
        .map(|r| {
            let mut row = [0.0f64; FLAPPY_F];
            for (x, k) in row.iter_mut().zip(r.iter()) {
                *x = *k as i8 as f64;
            }
            row
        })
        .collect();
    let mut fflat = Vec::with_capacity(f.raws.len() * FLAPPY_F);
    for r in &f.raws {
        for x in r {
            fflat.push(*x as i8 as u8);
        }
    }
    let f_f64 = Standardizer::<FLAPPY_F>::fit(&f_rows);
    let f_u8 = Standardizer::<FLAPPY_F>::fit_i8(&fflat);
    assert_eq!(f_f64, f_u8, "the flappy wasm standardizer drifted");

    // lanes — the decoded rows are small non-negative integers (0/1/2); the
    // blob carries them through the same i8 convention
    let l = gen::parse_lanes();
    let mut lflat = Vec::with_capacity(l.raws.len() * LANES_F);
    for r in &l.raws {
        for x in r {
            lflat.push(*x as i8 as u8);
        }
    }
    let l_f64 = Standardizer::<LANES_F>::fit(&l.raws);
    let l_u8 = Standardizer::<LANES_F>::fit_i8(&lflat);
    assert_eq!(l_f64, l_u8, "the lanes wasm standardizer drifted");
}

#[test]
fn the_score_paths_answer_corpus_sentences_and_refuse_garbage() {
    // tetris
    let c = parse_owned(include_bytes!("../src/tetris_corpus.bin")).expect("blob parses");
    let plan = BootPlan::<TETRIS_F, TETRIS_D> {
        n_options: c.n_options,
        n_states: c.n_states,
        lambda: c.lambda,
        in_anchor: c.in_anchor,
        offsets: &c.offsets,
        argmaxes: &c.argmaxes,
        targets: &c.targets,
        raws: &c.raws,
    };
    let mut rows = vec![[0.0; TETRIS_D]; c.n_options];
    let out = boot::run(&plan, &mut rows, &mut HeadFitter::<TETRIS_D>::new()).expect("boot ok");
    let s0 = gen::parse_fixture().sentences[0].clone();
    let p = boot::score_sentence(&out.std, &out.w, &s0).expect("corpus sentence scores");
    assert!((0.0..=1.0).contains(&p));
    assert!(((p as f32) as f64 - p).abs() < 1e-6);
    assert!(boot::score_sentence(&out.std, &out.w, "hello world").is_none());
    assert!(boot::score_sentence(&out.std, &out.w, "").is_none());

    // flappy
    let fc = parse_owned(include_bytes!("../src/flappy_corpus.bin")).expect("flappy blob parses");
    let fplan = BootPlan::<FLAPPY_F, FLAPPY_D> {
        n_options: fc.n_options,
        n_states: fc.n_states,
        lambda: fc.lambda,
        in_anchor: fc.in_anchor,
        offsets: &fc.offsets,
        argmaxes: &fc.argmaxes,
        targets: &fc.targets,
        raws: &fc.raws,
    };
    let mut frows = vec![[0.0; FLAPPY_D]; fc.n_options];
    let fout = boot::run(&fplan, &mut frows, &mut HeadFitter::<FLAPPY_D>::new()).expect("flappy boot ok");
    let fp = gen::parse_flappy();
    let (st, op) = (&fp.state_sentences[0], &fp.option_sentences[0]);
    let q = boot::score_flappy(&fout.std, &fout.w, st, op).expect("flappy corpus pair scores");
    assert!((0.0..=1.0).contains(&q));
    // off-grammar refusals — both sentences must carry their own grammar
    assert!(boot::score_flappy(&fout.std, &fout.w, "hello world", op).is_none());
    assert!(boot::score_flappy(&fout.std, &fout.w, st, "The piece leaves no holes under it in the middle, sits flat on the surface, and the stack stays low.").is_none());

    // lanes — score through the SAME joined-state path the wasm export runs
    let lc = parse_owned(include_bytes!("../src/lanes_corpus.bin")).expect("lanes blob parses");
    let lplan = BootPlan::<LANES_F, LANES_D> {
        n_options: lc.n_options,
        n_states: lc.n_states,
        lambda: lc.lambda,
        in_anchor: lc.in_anchor,
        offsets: &lc.offsets,
        argmaxes: &lc.argmaxes,
        targets: &lc.targets,
        raws: &lc.raws,
    };
    let mut lrows = vec![[0.0; LANES_D]; lc.n_options];
    let lout = boot::run(&lplan, &mut lrows, &mut HeadFitter::<LANES_D>::new()).expect("lanes boot ok");
    let lp = gen::parse_lanes();
    let sents: [&str; 3] = [
        &lp.lane_sentences[0][0],
        &lp.lane_sentences[0][1],
        &lp.lane_sentences[0][2],
    ];
    for lane in 0..3 {
        let q = boot::score_lanes(&lout.std, &lout.w, sents, lane)
            .unwrap_or_else(|| panic!("lanes corpus turn scores (lane {lane})"));
        assert!((0.0..=1.0).contains(&q));
    }
    // cross-grammar refusal: a flappy option sentence is not a lanes sentence
    let flappy_sent = "The bird glides through the middle of the gap, at the center, holding this height.";
    assert!(boot::score_lanes(&lout.std, &lout.w, [flappy_sent, sents[1], sents[2]], 0).is_none());
    // a sentence naming the wrong lane refuses (turn coherence)
    let shuffled = [sents[1], sents[0], sents[2]];
    assert!(boot::score_lanes(&lout.std, &lout.w, shuffled, 0).is_none());
    // lane index ≥ 3 refuses
    assert!(boot::score_lanes(&lout.std, &lout.w, sents, 3).is_none());
    // garbage refuses
    assert!(boot::score_lanes(&lout.std, &lout.w, ["hello", sents[1], sents[2]], 0).is_none());
}

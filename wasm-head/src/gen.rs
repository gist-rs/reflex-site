//! Host-side corpus generation: the pinned fixture JSONL → the compact
//! corpus blob (`corpus::write`), via the FULL published recipe.
//!
//! The JSON scan is a hand parser over the fixture's FIXED shape
//! (`{"state_id":…, "argmax":N, …, "options":[{"rot":…,"col":…,
//! "sentence":"…","p_clean":X}, …]}`) — each `p_clean` is paired with its
//! nearest preceding `sentence`. Numbers parse through `str::parse::<f64>`
//! (correctly rounded), so the targets are the exact serde_json f64 values
//! the engine sees; the blob stores their LE bytes and no runtime parsing
//! remains anywhere.

use crate::corpus;
use crate::fit::{self, HeadFitter, Standardizer};
use crate::grammar;

// the design widths live at the crate root (the wasm module pins its
// statics with them); re-exported here for the host-side consumers
pub use crate::{FLAPPY_D, FLAPPY_F, LANES_D, LANES_F, TETRIS_D, TETRIS_F};

/// The fixture, verbatim from katgpt-rs `tests/fixtures/` via the
/// riir-reflex serving copy (`assets/game_heads/`). The engine pins this
/// bytes BLAKE3 `12035ebf…6e804` (the v3 fixture, katgpt-rs
/// tetris_oracle_v3_README); the native test asserts the copy.
pub const FIXTURE: &str = include_str!("../fixtures/tetris_oracle_laya_en_v3.jsonl");
pub const FIXTURE_BLAKE3: &str =
    "12035ebf43d0293c7ec00e716e72ee6a21686cc41a222938a81d0abd9316e804";

/// The flappy v3 fixture, verbatim from katgpt-rs `tests/fixtures/` (the
/// Bench 882 record — the decoded arm's published anchors: λ=1, 96/100
/// in-corpus + LOO, head digest pinned in `tests/recipe.rs`).
pub const FLAPPY_FIXTURE: &str = include_str!("../fixtures/flappy_oracle_laya_en_v3.jsonl");

/// The lanes fixture, verbatim from katgpt-rs `tests/fixtures/` (Bench 880's
/// published record — λ=0.01, 84/100 in-corpus + LOO, head digest prefix
/// `7d3f1d8e`; Bench 882 measured the decode arm EXACTLY lossless, so the
/// decoded head digest equals the structured one). BLAKE3-pinned in
/// `tests/recipe.rs`.
pub const LANES_FIXTURE: &str = include_str!("../fixtures/lanes_oracle_laya_en_v1.jsonl");
pub const LANES_FIXTURE_BLAKE3: &str =
    "6a6d02af05b529749ddac3bf962344c2e22565b467f28a5eecd37031d0a4f600";

struct RawState {
    argmax: u8,
    /// (fills, p_clean) per option, fixture order.
    options: Vec<([u8; TETRIS_F], f64)>,
    /// The option sentences in the same order (the round-trip corpus).
    sentences: Vec<String>,
}

fn skip_ws(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && (b[i] as char).is_ascii_whitespace() {
        i += 1;
    }
    i
}

/// Parse a JSON string literal starting at `b[i] == '"'` — returns
/// (decoded bytes, index after the closing quote).
fn json_string(b: &[u8], i: usize) -> Option<(Vec<u8>, usize)> {
    if b.get(i) != Some(&b'"') {
        return None;
    }
    let mut out = Vec::new();
    let mut j = i + 1;
    while j < b.len() {
        match b[j] {
            b'"' => return Some((out, j + 1)),
            b'\\' => {
                let e = *b.get(j + 1)?;
                match e {
                    b'"' => out.push(b'"'),
                    b'\\' => out.push(b'\\'),
                    b'/' => out.push(b'/'),
                    b'n' => out.push(b'\n'),
                    b't' => out.push(b'\t'),
                    b'r' => out.push(b'\r'),
                    b'b' => out.push(8),
                    b'f' => out.push(12),
                    b'u' => {
                        // \uXXXX — the fixture's only escape is \u2014 in the
                        // meta line (never in a spot sentence); decode
                        // faithfully for BMP values.
                        let h = b.get(j + 2..j + 6)?;
                        let hex = core::str::from_utf8(h).ok()?;
                        let cp = u32::from_str_radix(hex, 16).ok()?;
                        let ch = char::from_u32(cp)?;
                        let mut buf = [0u8; 4];
                        out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                        j += 6;
                        continue;
                    }
                    _ => return None,
                }
                j += 2;
            }
            c => {
                out.push(c);
                j += 1;
            }
        }
    }
    None
}

fn find_key(b: &[u8], from: usize, key: &str) -> Option<usize> {
    // key INCLUDES its closing quote; the very next byte must be ':'
    b.windows(key.len() + 1)
        .skip(from)
        .position(|w| w.starts_with(key.as_bytes()) && w[key.len()] == b':')
        .map(|p| p + from)
}

/// The LAST occurrence of `key` strictly before `until` (the flappy v3
/// fixture's option objects order `features` BEFORE `sentence`, so each
/// sentence pairs with its nearest preceding features array).
fn find_last_key(b: &[u8], until: usize, key: &str) -> Option<usize> {
    let mut best = None;
    let mut cursor = 0usize;
    while cursor < until {
        match find_key(b, cursor, key) {
            Some(p) if p < until => {
                best = Some(p);
                cursor = p + key.len();
            }
            _ => break,
        }
    }
    best
}

/// Value end for a plain JSON number starting at `i`.
fn number_end(b: &[u8], mut i: usize) -> usize {
    while i < b.len()
        && matches!(b[i], b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E')
    {
        i += 1;
    }
    i
}

fn parse_state_line(line: &str) -> Option<RawState> {
    let b = line.as_bytes();
    // _meta records have no options — skip by key presence.
    find_key(b, 0, "\"options\"")?;
    let ai = find_key(b, 0, "\"argmax\"")?;
    let vs = skip_ws(b, ai + "\"argmax\":".len());
    let ve = number_end(b, vs);
    let argmax: u8 = line[vs..ve].parse().ok()?;

    let mut options = Vec::new();
    let mut sentences = Vec::new();
    let mut cursor = 0usize;
    while let Some(si) = find_key(b, cursor, "\"sentence\"") {
        let (qs, after) = json_string(b, si + "\"sentence\":".len())?;
        let sentence = core::str::from_utf8(&qs).ok()?;
        // the option's own p_clean: the next p_clean key after this sentence
        let pi = find_key(b, after, "\"p_clean\"")?;
        let vs = skip_ws(b, pi + "\"p_clean\":".len());
        let ve = number_end(b, vs);
        if ve == vs {
            return None; // null p_clean — the corpus needs the oracle read
        }
        let p: f64 = line[vs..ve].parse().ok()?;
        let fills = grammar::decode_tetris_spot(sentence)?;
        options.push(([fills[0], fills[1], fills[2], fills[3], fills[4]], p));
        sentences.push(sentence.to_string());
        cursor = after;
    }
    if options.is_empty() {
        return None;
    }
    Some(RawState {
        argmax,
        options,
        sentences,
    })
}

/// Everything the recipe consumes, straight from the fixture.
pub struct ParsedCorpus {
    pub offsets: Vec<u32>,
    pub argmaxes: Vec<u8>,
    pub targets: Vec<f64>,
    pub raws: Vec<[f64; TETRIS_F]>,
    /// The decoded sentences in option order (the grammar round-trip test's
    /// corpus — host-side only; the blob carries the fills, not the text).
    pub sentences: Vec<String>,
}

/// Parse + decode the fixture. Panics on any drift — the fixture is
/// digest-pinned data; a corrupt copy dies loudly, never serves.
pub fn parse_fixture() -> ParsedCorpus {
    let mut offsets = vec![0u32];
    let mut argmaxes = Vec::new();
    let mut targets = Vec::new();
    let mut raws = Vec::new();
    let mut sentences = Vec::new();
    for (ln, line) in FIXTURE.lines().enumerate() {
        match parse_state_line(line) {
            Some(s) => {
                for (sentence, (fills, p)) in s.sentences.into_iter().zip(s.options) {
                    raws.push([
                        fills[0] as f64,
                        fills[1] as f64,
                        fills[2] as f64,
                        fills[3] as f64,
                        fills[4] as f64,
                    ]);
                    targets.push(p);
                    sentences.push(sentence);
                }
                offsets.push(raws.len() as u32);
                argmaxes.push(s.argmax);
            }
            None if line.contains("\"_meta\"") => continue,
            None => panic!("fixture line {}: unparseable state record", ln + 1),
        }
    }
    assert_eq!(argmaxes.len(), 120, "state count drifted");
    assert_eq!(targets.len(), 2660, "corpus option count drifted");
    ParsedCorpus {
        offsets,
        argmaxes,
        targets,
        raws,
        sentences,
    }
}

/// The FULL published recipe over the parsed corpus — exactly what the
/// engine does at boot (standardize → λ by state-level LOO over the pinned
/// grid → final fit → agreement anchors). Returns the blob bytes.
pub fn build_corpus_bytes() -> Vec<u8> {
    let c = parse_fixture();
    let n = c.raws.len();
    let stdizer = Standardizer::<TETRIS_F>::fit(&c.raws);
    let rows: Vec<[f64; TETRIS_D]> = c.raws.iter().map(|r| stdizer.design(r)).collect();

    let mut fitter = HeadFitter::<TETRIS_D>::new();
    let (lambda, loo_picks) = fit::loo_select(&mut fitter, &rows, &c.targets, &c.offsets);
    let loo_agree = loo_picks
        .iter()
        .zip(c.argmaxes.iter())
        .filter(|(p, a)| **p == **a as usize)
        .count() as u32;

    let head = fitter.fit_into(&rows, &c.targets, lambda);
    let mut in_agree = 0u32;
    for (s, &arg) in c.argmaxes.iter().enumerate() {
        let (a, b) = (c.offsets[s] as usize, c.offsets[s + 1] as usize);
        if fit::pick_range(&head, &rows, (a, b)) == arg as usize {
            in_agree += 1;
        }
    }

    // sanity: never emit a blob that disagrees with the published story
    assert_eq!(lambda, 1.0, "LOO-selected λ drifted from the published fit");
    assert_eq!(in_agree, 42, "in-corpus agreement drifted from the v3 refit (Bench 892)");
    assert_eq!(loo_agree, 42, "LOO agreement drifted from the v3 refit (Bench 892)");

    let mut flat = Vec::with_capacity(n * TETRIS_F);
    for r in &c.raws {
        for x in r {
            flat.push(*x as u8);
        }
    }
    corpus::owned::write(
        TETRIS_F as u32,
        lambda,
        in_agree,
        loo_agree,
        &c.offsets,
        &c.argmaxes,
        &c.targets,
        &flat,
    )
}

// ── flappy v3 (Bench 882's decoded arm) ─────────────────────────────

struct FlappyStateRec {
    argmax: u8,
    state_sentence: String,
    /// (reconstructed fills, p_clean, fixture structured features) per
    /// option, fixture order.
    options: Vec<([f64; FLAPPY_F], f64, [f64; FLAPPY_F])>,
    option_sentences: Vec<String>,
}

fn parse_flappy_state_line(line: &str) -> Option<FlappyStateRec> {
    let b = line.as_bytes();
    find_key(b, 0, "\"options\"")?;
    let ai = find_key(b, 0, "\"argmax\"")?;
    let vs = skip_ws(b, ai + "\"argmax\":".len());
    let ve = number_end(b, vs);
    let argmax: u8 = line[vs..ve].parse().ok()?;

    // the state sentence (one per record — the state's own decode)
    let si = find_key(b, 0, "\"state_sentence\"")?;
    let (qs, _) = json_string(b, si + "\"state_sentence\":".len())?;
    let state_sentence = core::str::from_utf8(&qs).ok()?.to_string();
    let (rel, v, h) = grammar::decode_flappy_state(&state_sentence)?;

    let mut options = Vec::new();
    let mut option_sentences = Vec::new();
    let mut cursor = 0usize;
    while let Some(si) = find_key(b, cursor, "\"sentence\"") {
        let (qs, after) = json_string(b, si + "\"sentence\":".len())?;
        let sentence = core::str::from_utf8(&qs).ok()?;
        // this fixture's option objects order features → label → p_clean →
        // sentence, so BOTH the p_clean and the features pair with their
        // nearest PRECEDING key (inside this option, after the previous
        // option's sentence)
        let pi = find_last_key(b, si, "\"p_clean\"")?;
        let vs = skip_ws(b, pi + "\"p_clean\":".len());
        let ve = number_end(b, vs);
        if ve == vs {
            return None;
        }
        let p: f64 = line[vs..ve].parse().ok()?;
        // the option's structured features array (the exactness test's
        // ground truth): the nearest "features":[...] BEFORE this sentence
        let fi = find_last_key(b, si, "\"features\"")?;
        let fs = skip_ws(b, fi + "\"features\":".len());
        if b.get(fs) != Some(&b'[') {
            return None;
        }
        let mut feats = [0.0f64; FLAPPY_F];
        let mut pos = fs + 1;
        for slot in feats.iter_mut() {
            let vs = skip_ws(b, pos);
            let ve = number_end(b, vs);
            *slot = line[vs..ve].parse().ok()?;
            pos = skip_ws(b, ve);
            if b.get(pos) == Some(&b',') {
                pos += 1;
            }
        }
        let post = grammar::decode_flappy_option_v3(sentence)?;
        let rec = grammar::flappy_v3_decoded_features(post, rel, v, h);
        // the structured units include NEGATIVES (post_v, pre_rel,
        // edge_margin) — the blob stores raws as i8; saturating u8 casts
        // would corrupt every negative to 0 (measured, 846/1600 cells)
        for x in rec.iter() {
            assert!(x.trunc() == *x && *x >= -128.0 && *x <= 127.0,
                "flappy raw {x} is not an exact i8");
        }
        options.push((rec, p, feats));
        option_sentences.push(sentence.to_string());
        cursor = after;
    }
    if options.is_empty() {
        return None;
    }
    Some(FlappyStateRec {
        argmax,
        state_sentence,
        options,
        option_sentences,
    })
}

/// Everything the flappy recipe consumes, straight from the v3 fixture.
pub struct ParsedFlappy {
    pub offsets: Vec<u32>,
    pub argmaxes: Vec<u8>,
    pub targets: Vec<f64>,
    pub raws: Vec<[f64; FLAPPY_F]>,
    /// (state, option) sentence pairs in option order — the round-trip +
    /// parity corpora.
    pub state_sentences: Vec<String>,
    pub option_sentences: Vec<String>,
    /// The fixtures' structured features per option (the reconstruction
    /// exactness test's ground truth).
    pub fixture_features: Vec<[f64; FLAPPY_F]>,
}

/// Parse + decode the flappy v3 fixture. Panics on any drift.
pub fn parse_flappy() -> ParsedFlappy {
    let mut offsets = vec![0u32];
    let mut argmaxes = Vec::new();
    let mut targets = Vec::new();
    let mut raws = Vec::new();
    let mut state_sentences = Vec::new();
    let mut option_sentences = Vec::new();
    let mut fixture_features = Vec::new();
    for (ln, line) in FLAPPY_FIXTURE.lines().enumerate() {
        match parse_flappy_state_line(line) {
            Some(s) => {
                for ((rec, p, feats), sentence) in
                    s.options.into_iter().zip(s.option_sentences)
                {
                    raws.push(rec);
                    targets.push(p);
                    state_sentences.push(s.state_sentence.clone());
                    option_sentences.push(sentence);
                    fixture_features.push(feats);
                }
                offsets.push(raws.len() as u32);
                argmaxes.push(s.argmax);
            }
            None if line.contains("\"checkpoint\"") => continue, // the meta line
            None => panic!("flappy fixture line {}: unparseable state record", ln + 1),
        }
    }
    assert_eq!(argmaxes.len(), 100, "flappy state count drifted");
    assert_eq!(targets.len(), 200, "flappy corpus option count drifted");
    ParsedFlappy {
        offsets,
        argmaxes,
        targets,
        raws,
        state_sentences,
        option_sentences,
        fixture_features,
    }
}

/// The FULL published recipe over the flappy v3 corpus — the Bench 882
/// decoded arm (structured-units reconstruction). Returns the blob bytes.
pub fn build_flappy_bytes() -> Vec<u8> {
    let c = parse_flappy();
    let stdizer = Standardizer::<FLAPPY_F>::fit(&c.raws);
    let rows: Vec<[f64; FLAPPY_D]> = c.raws.iter().map(|r| stdizer.design(r)).collect();

    let mut fitter = HeadFitter::<FLAPPY_D>::new();
    let (lambda, loo_picks) = fit::loo_select(&mut fitter, &rows, &c.targets, &c.offsets);
    let loo_agree = loo_picks
        .iter()
        .zip(c.argmaxes.iter())
        .filter(|(p, a)| **p == **a as usize)
        .count() as u32;

    let head = fitter.fit_into(&rows, &c.targets, lambda);
    let mut in_agree = 0u32;
    for (s, &arg) in c.argmaxes.iter().enumerate() {
        let (a, b) = (c.offsets[s] as usize, c.offsets[s + 1] as usize);
        if fit::pick_range(&head, &rows, (a, b)) == arg as usize {
            in_agree += 1;
        }
    }

    // sanity: never emit a blob that disagrees with the published story
    assert_eq!(lambda, 1.0, "LOO-selected λ drifted from the Bench 882 fit");
    assert_eq!(in_agree, 96, "in-corpus agreement drifted from Bench 882");
    assert_eq!(loo_agree, 96, "LOO agreement drifted from Bench 882");

    let mut flat = Vec::with_capacity(c.raws.len() * FLAPPY_F);
    for r in &c.raws {
        for x in r {
            flat.push(*x as i8 as u8);
        }
    }
    corpus::owned::write(
        FLAPPY_F as u32,
        lambda,
        in_agree,
        loo_agree,
        &c.offsets,
        &c.argmaxes,
        &c.targets,
        &flat,
    )
}

// ── lanes v1 (Bench 880's structured arm — decode is EXACTLY lossless) ──

struct LanesStateRec {
    argmax: u8,
    /// (p_clean, fixture structured features) per option, fixture order =
    /// pinned lane order [left, middle, right]. The decoded rows are rebuilt
    /// in `parse_lanes` from the JOINED three-sentence decode (the cross-lane
    /// columns need all three sentences; a per-option decode cannot build
    /// them).
    options: Vec<(f64, [f64; LANES_F])>,
    option_sentences: Vec<String>,
}

fn parse_lanes_state_line(line: &str) -> Option<LanesStateRec> {
    let b = line.as_bytes();
    find_key(b, 0, "\"options\"")?;
    let ai = find_key(b, 0, "\"argmax\"")?;
    let vs = skip_ws(b, ai + "\"argmax\":".len());
    let ve = number_end(b, vs);
    let argmax: u8 = line[vs..ve].parse().ok()?;

    let mut options = Vec::new();
    let mut option_sentences = Vec::new();
    let mut cursor = 0usize;
    while let Some(si) = find_key(b, cursor, "\"sentence\"") {
        let (qs, after) = json_string(b, si + "\"sentence\":".len())?;
        let sentence = core::str::from_utf8(&qs).ok()?;
        // the lanes fixture's option objects order features → label →
        // p_clean → sentence, so BOTH the p_clean and the features pair
        // with their nearest PRECEDING key (inside this option)
        let pi = find_last_key(b, si, "\"p_clean\"")?;
        let vs = skip_ws(b, pi + "\"p_clean\":".len());
        let ve = number_end(b, vs);
        if ve == vs {
            return None;
        }
        let p: f64 = line[vs..ve].parse().ok()?;
        let fi = find_last_key(b, si, "\"features\"")?;
        let fs = skip_ws(b, fi + "\"features\":".len());
        if b.get(fs) != Some(&b'[') {
            return None;
        }
        let mut feats = [0.0f64; LANES_F];
        let mut pos = fs + 1;
        for slot in feats.iter_mut() {
            let vs = skip_ws(b, pos);
            let ve = number_end(b, vs);
            *slot = line[vs..ve].parse().ok()?;
            pos = skip_ws(b, ve);
            if b.get(pos) == Some(&b',') {
                pos += 1;
            }
        }
        let d = grammar::decode_lanes_option(sentence)?;
        // the option's own lane comes from its sentence (the fixture pins
        // option order = lane order; assert the pin rather than assume it)
        assert_eq!(
            d.lane as usize, options.len(),
            "lanes fixture: option order drifted from the pinned lane order"
        );
        options.push((p, feats));
        option_sentences.push(sentence.to_string());
        cursor = after;
    }
    if options.len() != 3 {
        return None;
    }
    Some(LanesStateRec {
        argmax,
        options,
        option_sentences,
    })
}

/// Everything the lanes recipe consumes, straight from the fixture.
pub struct ParsedLanes {
    pub offsets: Vec<u32>,
    pub argmaxes: Vec<u8>,
    pub targets: Vec<f64>,
    pub raws: Vec<[f64; LANES_F]>,
    /// The three option sentences per state, pinned lane order — the
    /// round-trip + parity corpora.
    pub lane_sentences: Vec<[String; 3]>,
    /// The fixtures' structured features per option (the exactness test's
    /// ground truth).
    pub fixture_features: Vec<[f64; LANES_F]>,
}

/// Parse + decode the lanes fixture. Panics on any drift — including any
/// decoded-row ≠ fixture-features mismatch: the lanes decode arm is measured
/// EXACTLY lossless (Bench 882, Δ0), so a single drifted cell means the
/// grammar port is broken, never "close enough".
pub fn parse_lanes() -> ParsedLanes {
    let mut offsets = vec![0u32];
    let mut argmaxes = Vec::new();
    let mut targets = Vec::new();
    let mut raws = Vec::new();
    let mut lane_sentences = Vec::new();
    let mut fixture_features = Vec::new();
    for (ln, line) in LANES_FIXTURE.lines().enumerate() {
        match parse_lanes_state_line(line) {
            Some(s) => {
                // decode ALL THREE sentences as the joined state — the
                // cross-lane columns (6–7) need the other lanes' sentences
                let mut lanes = [grammar::LaneDecoded { kind: 0, dist: None, lane: 0 }; 3];
                for (i, sent) in s.option_sentences.iter().enumerate() {
                    let d = grammar::decode_lanes_option(sent)
                        .unwrap_or_else(|| panic!("lanes fixture line {}: sentence {i} refused", ln + 1));
                    assert_eq!(d.lane as usize, i, "lanes: option/lane order drifted");
                    lanes[i] = d;
                }
                for lane in 0..3 {
                    let row = grammar::lanes_decoded_features(&lanes, lane);
                    // THE LOSSLESS ANCHOR: decoded == structured, every cell
                    let truth = &s.options[lane].1;
                    assert_eq!(
                        &row, truth,
                        "lanes fixture line {} lane {}: decoded row ≠ fixture features — the decode arm drifted",
                        ln + 1,
                        lane
                    );
                    raws.push(row);
                    targets.push(s.options[lane].0);
                    fixture_features.push(*truth);
                }
                lane_sentences.push([
                    s.option_sentences[0].clone(),
                    s.option_sentences[1].clone(),
                    s.option_sentences[2].clone(),
                ]);
                offsets.push(raws.len() as u32);
                argmaxes.push(s.argmax);
            }
            None if line.contains("\"checkpoint\"") => continue, // the meta line
            None => panic!("lanes fixture line {}: unparseable state record", ln + 1),
        }
    }
    assert_eq!(argmaxes.len(), 100, "lanes state count drifted");
    assert_eq!(targets.len(), 300, "lanes corpus option count drifted");
    ParsedLanes {
        offsets,
        argmaxes,
        targets,
        raws,
        lane_sentences,
        fixture_features,
    }
}

/// The FULL published recipe over the lanes corpus — the Bench 880
/// structured arm (identical to the decoded arm: the decode is lossless).
/// Returns the blob bytes.
pub fn build_lanes_bytes() -> Vec<u8> {
    let c = parse_lanes();
    let stdizer = Standardizer::<LANES_F>::fit(&c.raws);
    let rows: Vec<[f64; LANES_D]> = c.raws.iter().map(|r| stdizer.design(r)).collect();

    let mut fitter = HeadFitter::<LANES_D>::new();
    let (lambda, loo_picks) = fit::loo_select(&mut fitter, &rows, &c.targets, &c.offsets);
    let loo_agree = loo_picks
        .iter()
        .zip(c.argmaxes.iter())
        .filter(|(p, a)| **p == **a as usize)
        .count() as u32;

    let head = fitter.fit_into(&rows, &c.targets, lambda);
    let mut in_agree = 0u32;
    for (s, &arg) in c.argmaxes.iter().enumerate() {
        let (a, b) = (c.offsets[s] as usize, c.offsets[s + 1] as usize);
        if fit::pick_range(&head, &rows, (a, b)) == arg as usize {
            in_agree += 1;
        }
    }

    // sanity: never emit a blob that disagrees with the published story
    assert_eq!(lambda, 0.01, "LOO-selected λ drifted from the Bench 880 fit");
    assert_eq!(in_agree, 84, "in-corpus agreement drifted from Bench 880");
    assert_eq!(loo_agree, 84, "LOO agreement drifted from Bench 880");
    // (the head-digest prefix anchor `7d3f1d8e` is asserted in
    // tests/recipe.rs — blake3 is a dev-dependency there, same as flappy)

    let mut flat = Vec::with_capacity(c.raws.len() * LANES_F);
    for r in &c.raws {
        for x in r {
            flat.push(*x as i8 as u8);
        }
    }
    corpus::owned::write(
        LANES_F as u32,
        lambda,
        in_agree,
        loo_agree,
        &c.offsets,
        &c.argmaxes,
        &c.targets,
        &flat,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_shape_is_the_published_one() {
        let c = parse_fixture();
        assert_eq!(c.offsets[0], 0);
        assert_eq!(c.offsets[120], 2660);
    }

    #[test]
    fn flappy_fixture_shape_is_the_published_one() {
        let c = parse_flappy();
        assert_eq!(c.offsets[0], 0);
        assert_eq!(c.offsets[100], 200);
    }

    #[test]
    fn lanes_fixture_shape_is_the_published_one() {
        let c = parse_lanes();
        assert_eq!(c.offsets[0], 0);
        assert_eq!(c.offsets[100], 300);
    }
}

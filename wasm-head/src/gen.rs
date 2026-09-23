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
use crate::fit::{self, HeadFitter, Standardizer, F};
use crate::grammar;

/// The fixture, verbatim from katgpt-rs `tests/fixtures/` via the
/// riir-reflex serving copy (`assets/game_heads/`). The engine pins this
/// bytes BLAKE3 `f32c8577…f40bb`; the native test asserts the copy.
pub const FIXTURE: &str = include_str!("../fixtures/tetris_oracle_laya_en_v2.jsonl");
pub const FIXTURE_BLAKE3: &str =
    "f32c8577bca50726618d2bb4fb27c904148161d650f16a59c01676a97fa540bb";

struct RawState {
    argmax: u8,
    /// (fills, p_clean) per option, fixture order.
    options: Vec<([u8; F], f64)>,
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
    if find_key(b, 0, "\"options\"").is_none() {
        return None;
    }
    let ai = find_key(b, 0, "\"argmax\"")?;
    let vs = skip_ws(b, ai + "\"argmax\":".len());
    let ve = number_end(b, vs);
    let argmax: u8 = line[vs..ve].parse().ok()?;

    let mut options = Vec::new();
    let mut sentences = Vec::new();
    let mut cursor = 0usize;
    loop {
        let si = match find_key(b, cursor, "\"sentence\"") {
            Some(p) => p,
            None => break,
        };
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
        let fills = grammar::decode(sentence)?;
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
    pub raws: Vec<[f64; F]>,
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
    let stdizer = Standardizer::fit(&c.raws);
    let rows: Vec<[f64; fit::D]> = c.raws.iter().map(|r| stdizer.design(r)).collect();

    let mut fitter = HeadFitter::new();
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
    assert_eq!(in_agree, 44, "in-corpus agreement drifted from Bench 881");
    assert_eq!(loo_agree, 44, "LOO agreement drifted from Bench 881");

    let mut flat = Vec::with_capacity(n * F);
    for r in &c.raws {
        for x in r {
            flat.push(*x as u8);
        }
    }
    corpus::owned::write(
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
}

//! The `laya-tetris-v2` spot grammar — a faithful core-only port of
//! katgpt-rs `katgpt_core::template_decode` restricted to the one template
//! the fitted Tetris head answers (riir-reflex `src/game_heads.rs` is the
//! canonical serving port; this is the in-tab wasm twin).
//!
//! Parity discipline: the fixture is BLAKE3-pinned data and every corpus
//! sentence must decode here exactly as the engine decodes it (the native
//! test walks all 2660). Decode is the counting recursive walker — exactly
//! one derivation must exist, or the sentence is refused.

pub const MAX_SLOTS: usize = 8;

/// holes_delta class: exact 0/1/2, then the render's bands.
/// Vocabulary ORDER IS CONTRACT — the fill index is the decoded feature.
static HOLES: [&str; 5] = [
    "leaves no holes",
    "leaves one hole",
    "leaves two holes",
    "leaves a few holes",
    "leaves many holes",
];
/// `SideBand` clause order (LeftEdge..RightEdge).
static SIDE: [&str; 5] = [
    "on the left edge",
    "on the left side",
    "in the middle",
    "on the right side",
    "on the right edge",
];
/// `BumpBand` order (Flat, Small, Tall, Gap).
static SURFACE: [&str; 4] = [
    "sits flat on the surface",
    "makes a small bump on top",
    "makes a tall step on top",
    "fills a deep gap",
];
/// `HeightBand` order (Low, Medium, Tall).
static HEIGHT: [&str; 3] = [
    "the stack stays low",
    "the stack stands medium",
    "the stack grows tall",
];
/// lines_cleared: "" = no clear (the render appends nothing).
static CLEARS: [&str; 5] = [
    "",
    ", and clears a line",
    ", and clears two lines",
    ", and clears three lines",
    ", and clears four lines",
];

/// The template's segment list: literals and slot vocabulary indices,
/// alternating and ending with a literal — the v2 render
/// `The piece {holes} under it {side}, {surface}, and {height}{clears}.`
static SEGS: [Seg; 11] = [
    Seg::Lit("The piece "),
    Seg::Slot(0), // HOLES
    Seg::Lit(" under it "),
    Seg::Slot(1), // SIDE
    Seg::Lit(", "),
    Seg::Slot(2), // SURFACE
    Seg::Lit(", and "),
    Seg::Slot(3), // HEIGHT
    Seg::Lit(""),  // separator only — the two fills are adjacent
    Seg::Slot(4), // CLEARS ("" renders as nothing)
    Seg::Lit("."),
];

enum Seg {
    Lit(&'static str),
    Slot(u8),
}

fn vocab(v: u8) -> &'static [&'static str] {
    match v {
        0 => &HOLES,
        1 => &SIDE,
        2 => &SURFACE,
        3 => &HEIGHT,
        4 => &CLEARS,
        _ => unreachable!("grammar: bad vocab index"),
    }
}

/// Decode a spot sentence → `(holes, side, surface, height, clears)` fills.
/// `None` when zero or more-than-one derivation exists (Unknown/Ambiguous
/// both refuse — the engine falls through, the wasm returns no score).
pub fn decode(sentence: &str) -> Option<[u8; MAX_SLOTS]> {
    let text = sentence.as_bytes();
    let mut count = 0u32;
    let mut first = [0u8; MAX_SLOTS];
    let mut fills = [0u8; MAX_SLOTS];
    walk(text, 0, 0, 0, &mut fills, &mut first, &mut count);
    if count == 1 {
        Some(first)
    } else {
        None
    }
}

fn walk(
    text: &[u8],
    seg_i: usize,
    slot_i: usize,
    pos: usize,
    fills: &mut [u8; MAX_SLOTS],
    first: &mut [u8; MAX_SLOTS],
    count: &mut u32,
) {
    if *count > 1 {
        return; // ambiguous already — stop early (mirrors the engine)
    }
    match &SEGS[seg_i] {
        Seg::Lit(lit) => {
            let b = lit.as_bytes();
            if text.len() < pos + b.len() || &text[pos..pos + b.len()] != b {
                return;
            }
            let next = pos + b.len();
            if seg_i + 1 == SEGS.len() {
                if next != text.len() {
                    return;
                }
                if *count == 0 {
                    *first = *fills;
                }
                *count += 1;
            } else {
                walk(text, seg_i + 1, slot_i, next, fills, first, count);
            }
        }
        Seg::Slot(v) => {
            for (fi, fill) in vocab(*v).iter().enumerate() {
                let fb = fill.as_bytes();
                if text.len() >= pos + fb.len() && &text[pos..pos + fb.len()] == fb {
                    fills[slot_i] = fi as u8;
                    walk(text, seg_i + 1, slot_i + 1, pos + fb.len(), fills, first, count);
                    if *count > 1 {
                        return;
                    }
                }
            }
        }
    }
}

/// Render a template with the given fills (the round-trip half — used by the
/// native test to prove decode∘render is the identity over the corpus).
/// Host-only: `String` does not exist in the no_std wasm build.
#[cfg(not(target_arch = "wasm32"))]
pub fn render(fills: &[u8]) -> String {
    let mut out = String::new();
    let mut slot = 0usize;
    for seg in SEGS.iter() {
        match seg {
            Seg::Lit(l) => out.push_str(l),
            Seg::Slot(v) => {
                let vo = vocab(*v);
                out.push_str(vo[fills[slot] as usize]);
                slot += 1;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_canonical_sentence_decodes() {
        let s = "The piece leaves no holes under it in the middle, sits flat on the surface, and the stack stays low.";
        let f = decode(s).expect("decodes");
        assert_eq!(&f[..5], &[0, 2, 0, 0, 0]);
        assert_eq!(render(&f), s);
    }

    #[test]
    fn a_carrying_sentence_decodes_with_the_clears_fill() {
        let s = "The piece leaves two holes under it on the right edge, makes a tall step on top, and the stack grows tall, and clears two lines.";
        let f = decode(s).expect("decodes");
        assert_eq!(&f[..5], &[2, 4, 2, 2, 2]);
        assert_eq!(render(&f), s);
    }

    #[test]
    fn garbage_refuses() {
        assert!(decode("hello world").is_none());
        assert!(decode("The piece leaves three holes under it in the middle.").is_none());
        assert!(decode("").is_none());
    }
}

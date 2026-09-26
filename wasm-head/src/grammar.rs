//! The pinned game-sentence grammars — a faithful core-only port of
//! katgpt-rs `katgpt_core::template_decode` restricted to the templates the
//! fitted game heads answer (riir-reflex `src/game_heads.rs` is the
//! canonical serving port; this is the in-tab wasm twin):
//!
//! - `laya-tetris-v2` spot (5 slots) — the tetris head (the v2/v3 grammars
//!   share the SPOT template; only the drop rule differs, which is sim-side
//!   — the v3 refit (Bench 892) scores v3 spot sentences through this same
//!   decoder);
//! - `laya-flappy-v3` option (3 slots) + state (3 slots) — the flappy head
//!   (Bench 882's decoded arm; the option sentence carries band + offset +
//!   neutral post-motion, the state sentence supplies rel/v/h).
//!
//! Parity discipline: the fixtures are digest-pinned data and every corpus
//! sentence must decode here exactly as the engine decodes it. Decode is
//! the counting recursive walker — exactly one derivation must exist, or
//! the sentence is refused.

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

// ── flappy `laya-flappy-v3` (Bench 882 / Issue 876) ─────────────────────

/// `PosBand` order (Below..Above) — the band clause's vocabulary.
static FLAPPY_POS: [&str; 7] = [
    "sinks below the gap",
    "squeezes through the bottom of the gap",
    "glides through the lower half of the gap",
    "glides through the middle of the gap",
    "glides through the upper half of the gap",
    "squeezes through the top of the gap",
    "flies above the gap",
];
/// v3 option offset clause — fine post_rel, clamped ±2.
static FLAPPY_OFFSET: [&str; 5] = [
    "under the center",
    "just under the center",
    "at the center",
    "just over the center",
    "over the center",
];
/// v3 option post-motion clause — neutral kinematic wording.
static FLAPPY_PMOT: [&str; 5] = [
    "drifting down two steps",
    "drifting down one step",
    "holding this height",
    "drifting up one step",
    "drifting up two steps",
];
/// State-sentence relative-position band (well above..well below).
static FLAPPY_REL: [&str; 5] = [
    "well above",
    "a little above",
    "level with",
    "a little below",
    "well below",
];
/// `motion_clause(v)` in v = −2..=2 order.
static FLAPPY_MOT: [&str; 5] = [
    "falling fast",
    "falling",
    "flying level",
    "rising",
    "climbing fast",
];
/// `gap_clause(h)`: 2 → narrow, else wide.
static FLAPPY_GAP: [&str; 2] = ["narrow", "wide"];

/// v3 option template: `The bird {band}, {offset}, {post-motion}.`
static FLAPPY_OPT_SEGS: [Seg; 7] = [
    Seg::Lit("The bird "),
    Seg::Slot(0), // FLAPPY_POS
    Seg::Lit(", "),
    Seg::Slot(1), // FLAPPY_OFFSET
    Seg::Lit(", "),
    Seg::Slot(2), // FLAPPY_PMOT
    Seg::Lit("."),
];
/// State template: `The bird is {rel} the gap center, {motion}. The gap is
/// {width}. The pipe is just ahead.` (identical across v1/v2/v3).
static FLAPPY_STATE_SEGS: [Seg; 7] = [
    Seg::Lit("The bird is "),
    Seg::Slot(0), // FLAPPY_REL
    Seg::Lit(" the gap center, "),
    Seg::Slot(1), // FLAPPY_MOT
    Seg::Lit(". The gap is "),
    Seg::Slot(2), // FLAPPY_GAP
    Seg::Lit(". The pipe is just ahead."),
];

// ── lanes `laya-lanes-v1` (Plan 607 T5 / Bench 880; the lossless arm of
// Bench 882) ─────────────────────────────────────────────────────────────

/// `LANE_NAMES` order (0 left · 1 middle · 2 right) — also the option order.
static LANES_LANE: [&str; 3] = ["left", "middle", "right"];
/// `Dist` order (0 close · 1 far).
static LANES_DIST: [&str; 2] = ["close", "far"];
/// ONE noun per obstacle class — the wording pin (`lanes_sim::obstacle_noun`):
/// laya's own measured trap ("barrier" 0.75 vs "train" 0.45 for the same
/// lane) is avoided by a closed grammar that never varies the noun. Fill i →
/// obstacle kind i+1 (barrier/train/rock).
static LANES_NOUN: [&str; 3] = ["a barrier", "a train", "a rock"];

/// Clear template: `The {lane} lane is clear ahead.`
static LANES_CLEAR_SEGS: [Seg; 3] = [
    Seg::Lit("The "),
    Seg::Slot(0), // LANES_LANE
    Seg::Lit(" lane is clear ahead."),
];
/// Blocked template: `The {lane} lane is blocked {dist} ahead by {noun}.`
static LANES_BLOCKED_SEGS: [Seg; 7] = [
    Seg::Lit("The "),
    Seg::Slot(0), // LANES_LANE
    Seg::Lit(" lane is blocked "),
    Seg::Slot(1), // LANES_DIST
    Seg::Lit(" ahead by "),
    Seg::Slot(2), // LANES_NOUN
    Seg::Lit("."),
];

enum Seg {
    Lit(&'static str),
    Slot(u8),
}

/// Which grammar a decode walks (the single-template-per-decode twin of the
/// engine's multi-template Grammar::decode; each head answers ONE grammar).
#[derive(Clone, Copy, PartialEq)]
pub enum GameGrammar {
    TetrisSpot,
    FlappyOptionV3,
    FlappyState,
    LanesClear,
    LanesBlocked,
}

impl GameGrammar {
    fn segs(&self) -> &'static [Seg] {
        match self {
            GameGrammar::TetrisSpot => &SEGS,
            GameGrammar::FlappyOptionV3 => &FLAPPY_OPT_SEGS,
            GameGrammar::FlappyState => &FLAPPY_STATE_SEGS,
            GameGrammar::LanesClear => &LANES_CLEAR_SEGS,
            GameGrammar::LanesBlocked => &LANES_BLOCKED_SEGS,
        }
    }

    fn vocab(&self, v: u8) -> &'static [&'static str] {
        match (self, v) {
            (GameGrammar::TetrisSpot, 0) => &HOLES,
            (GameGrammar::TetrisSpot, 1) => &SIDE,
            (GameGrammar::TetrisSpot, 2) => &SURFACE,
            (GameGrammar::TetrisSpot, 3) => &HEIGHT,
            (GameGrammar::TetrisSpot, 4) => &CLEARS,
            (GameGrammar::FlappyOptionV3, 0) => &FLAPPY_POS,
            (GameGrammar::FlappyOptionV3, 1) => &FLAPPY_OFFSET,
            (GameGrammar::FlappyOptionV3, 2) => &FLAPPY_PMOT,
            (GameGrammar::FlappyState, 0) => &FLAPPY_REL,
            (GameGrammar::FlappyState, 1) => &FLAPPY_MOT,
            (GameGrammar::FlappyState, 2) => &FLAPPY_GAP,
            (GameGrammar::LanesClear, 0) => &LANES_LANE,
            (GameGrammar::LanesBlocked, 0) => &LANES_LANE,
            (GameGrammar::LanesBlocked, 1) => &LANES_DIST,
            (GameGrammar::LanesBlocked, 2) => &LANES_NOUN,
            _ => unreachable!("grammar: bad vocab index"),
        }
    }
}

/// Decode a sentence against a closed grammar. Zero-alloc: exactly one
/// derivation must exist, or the sentence is refused (Unknown/Ambiguous both
/// refuse — the engine falls through, the wasm returns no score).
pub fn decode(g: GameGrammar, sentence: &str) -> Option<[u8; MAX_SLOTS]> {
    let (count, first) = decode_counting(g, sentence);
    if count == 1 {
        Some(first)
    } else {
        None
    }
}

/// `(derivation count, first derivation's fills)` — the counting walker's
/// result, shared by the single-template [`decode`] and the lanes
/// two-template decode (which must count across BOTH templates before
/// refusing).
fn decode_counting(g: GameGrammar, sentence: &str) -> (u32, [u8; MAX_SLOTS]) {
    let text = sentence.as_bytes();
    let mut count = 0u32;
    let mut first = [0u8; MAX_SLOTS];
    let mut fills = [0u8; MAX_SLOTS];
    walk(g, text, 0, 0, 0, &mut fills, &mut first, &mut count);
    (count, first)
}

// recursive walk: cursor state + out-params as plain args, so recursion allocates nothing (no allocator on wasm)
#[allow(clippy::too_many_arguments)]
fn walk(
    g: GameGrammar,
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
    let segs = g.segs();
    match &segs[seg_i] {
        Seg::Lit(lit) => {
            let b = lit.as_bytes();
            if text.len() < pos + b.len() || &text[pos..pos + b.len()] != b {
                return;
            }
            let next = pos + b.len();
            if seg_i + 1 == segs.len() {
                if next != text.len() {
                    return;
                }
                if *count == 0 {
                    *first = *fills;
                }
                *count += 1;
            } else {
                walk(g, text, seg_i + 1, slot_i, next, fills, first, count);
            }
        }
        Seg::Slot(v) => {
            for (fi, fill) in g.vocab(*v).iter().enumerate() {
                let fb = fill.as_bytes();
                if text.len() >= pos + fb.len() && &text[pos..pos + fb.len()] == fb {
                    fills[slot_i] = fi as u8;
                    walk(g, text, seg_i + 1, slot_i + 1, pos + fb.len(), fills, first, count);
                    if *count > 1 {
                        return;
                    }
                }
            }
        }
    }
}

/// Render a grammar's template with the given fills (the round-trip half —
/// used by the native test to prove decode∘render is the identity over the
/// corpora). Host-only: `String` does not exist in the no_std wasm build.
#[cfg(not(target_arch = "wasm32"))]
pub fn render(g: GameGrammar, fills: &[u8]) -> String {
    let mut out = String::new();
    let mut slot = 0usize;
    for seg in g.segs() {
        match seg {
            Seg::Lit(l) => out.push_str(l),
            Seg::Slot(v) => {
                let vo = g.vocab(*v);
                out.push_str(vo[fills[slot] as usize]);
                slot += 1;
            }
        }
    }
    out
}

// ── typed decoders (the engine's decode_* helpers, twin forms) ──────────

/// Decode a tetris spot sentence → `(holes, side, surface, height, clears)`.
pub fn decode_tetris_spot(sentence: &str) -> Option<[u8; MAX_SLOTS]> {
    decode(GameGrammar::TetrisSpot, sentence)
}

/// Decode a flappy v3 option sentence → `(band, offset, post-motion)` —
/// the first three fills.
pub fn decode_flappy_option_v3(sentence: &str) -> Option<[u8; 3]> {
    let m = decode(GameGrammar::FlappyOptionV3, sentence)?;
    Some([m[0], m[1], m[2]])
}

/// Decode a flappy state sentence → `(rel band ordinal, exact v, exact h)`
/// — v is the motion fill shifted to the clamped −2..=2 domain, h the gap
/// clause mapped back to {2, 3} (the engine's `decode_flappy_state`).
pub fn decode_flappy_state(sentence: &str) -> Option<(u8, i32, i32)> {
    let m = decode(GameGrammar::FlappyState, sentence)?;
    let v = m[1] as i32 - 2;
    let h = if m[2] == 0 { 2 } else { 3 };
    Some((m[0], v, h))
}

/// One decoded lanes option — the engine's `LaneDecoded` twin.
/// `kind`: 0 clear · 1 barrier · 2 train · 3 rock; `dist`: Some(0) close /
/// Some(1) far, None when clear; `lane`: 0 left · 1 middle · 2 right.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LaneDecoded {
    pub kind: u8,
    pub dist: Option<u8>,
    pub lane: u8,
}

/// Decode one lanes option sentence against BOTH `laya-lanes-v1` templates
/// (clear / blocked) — the engine's multi-template decode twin: a sentence
/// with zero or more than one derivation across the WHOLE grammar is
/// refused, never guessed.
pub fn decode_lanes_option(sentence: &str) -> Option<LaneDecoded> {
    let (n_clear, m_clear) = decode_counting(GameGrammar::LanesClear, sentence);
    let (n_blocked, m_blocked) = decode_counting(GameGrammar::LanesBlocked, sentence);
    match (n_clear, n_blocked) {
        (1, 0) => Some(LaneDecoded {
            kind: 0,
            dist: None,
            lane: m_clear[0],
        }),
        (0, 1) => Some(LaneDecoded {
            kind: 1 + m_blocked[2],
            dist: Some(m_blocked[1]),
            lane: m_blocked[0],
        }),
        _ => None,
    }
}

/// The lanes decoded feature row for `lane` — EXACTLY the structured row
/// (`lanes_sim::feature_row`; the lossless anchor of the whole decode arm —
/// every column is recoverable from the three sentences). Column order
/// mirrors `lanes_sim::FEATURE_NAMES`: [blocked, close, far, is_barrier,
/// is_train, is_rock, blocked_neighbors, clear_lanes]. Columns 6–7 read the
/// OTHER lanes — the cross-lane dependency that makes a single-sentence
/// serving path impossible and the joined (three-sentence) protocol
/// necessary.
pub fn lanes_decoded_features(lanes: &[LaneDecoded; 3], lane: usize) -> [f64; 8] {
    let l = lanes[lane];
    let blocked = l.kind != 0;
    [
        blocked as u8 as f64,
        (blocked && l.dist == Some(0)) as u8 as f64,
        (blocked && l.dist == Some(1)) as u8 as f64,
        (l.kind == 1) as u8 as f64,
        (l.kind == 2) as u8 as f64,
        (l.kind == 3) as u8 as f64,
        lanes
            .iter()
            .enumerate()
            .filter(|&(i, x)| i != lane && x.kind != 0)
            .count() as f64,
        lanes.iter().filter(|x| x.kind == 0).count() as f64,
    ]
}

/// Render a lanes option sentence from its decoded form (the round-trip
/// half). Host-only: `String` does not exist in the no_std wasm build.
#[cfg(not(target_arch = "wasm32"))]
pub fn render_lanes(d: LaneDecoded) -> String {
    let mut out = String::from("The ");
    out.push_str(LANES_LANE[d.lane as usize]);
    if d.kind == 0 {
        out.push_str(" lane is clear ahead.");
    } else {
        out.push_str(" lane is blocked ");
        out.push_str(LANES_DIST[d.dist.unwrap_or(0) as usize]);
        out.push_str(" ahead by ");
        out.push_str(LANES_NOUN[(d.kind - 1) as usize]);
        out.push('.');
    }
    out
}

/// The flappy v3 decoded feature row — the STRUCTURED-UNITS reconstruction
/// law (Bench 882's decoded arm; column order mirrors
/// `flappy_sim::FEATURE_NAMES`: [post_rel, post_abs_rel, post_v, pre_rel,
/// pre_v, in_gap, edge_margin, gap_half]).
///
/// Reconstruction law (exact on every rendered in-gap/squeeze combination;
/// the crash tails collapse in the render, so they reconstruct at the
/// boundary ±(h+1)):
/// - (band, offset, h) → post_rel — Lower "under" = −2 needs h = 3 (the
///   h = 2 Lower band only renders −1 = "just under"); Upper mirrors it;
/// - post-motion → post_v (bijective on the clamped −2..=2 domain);
/// - state rel band → pre_rel, clamped ±2 (the band's own collapse).
pub fn flappy_v3_decoded_features(post: [u8; 3], rel: u8, v: i32, h: i32) -> [f64; 8] {
    let (band, offset) = (post[0], post[1]);
    let hh = h;
    let post_rel: i32 = match band {
        0 => -(hh + 1),                         // Below: tail → boundary
        1 => -hh,                               // SqueezeBottom: exact
        2 => if offset == 1 { -1 } else { -2 }, // Lower: just-under exact
        3 => 0,                                 // Middle: exact
        4 => if offset == 3 { 1 } else { 2 },   // Upper: just-over exact
        5 => hh,                                // SqueezeTop: exact
        _ => hh + 1,                            // Above: tail → boundary
    };
    let pre_rel: i32 = match rel {
        0 => 2,
        1 => 1,
        2 => 0,
        3 => -1,
        _ => -2,
    };
    let post_v = post[2] as i32 - 2;
    let abs = post_rel.abs();
    [
        post_rel as f64,
        abs as f64,
        post_v as f64,
        pre_rel as f64,
        v as f64,
        (abs <= hh) as u8 as f64,
        (hh - abs) as f64,
        h as f64,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_canonical_tetris_sentence_decodes() {
        let s = "The piece leaves no holes under it in the middle, sits flat on the surface, and the stack stays low.";
        let f = decode_tetris_spot(s).expect("decodes");
        assert_eq!(&f[..5], &[0, 2, 0, 0, 0]);
        assert_eq!(render(GameGrammar::TetrisSpot, &f), s);
    }

    #[test]
    fn a_carrying_tetris_sentence_decodes_with_the_clears_fill() {
        let s = "The piece leaves two holes under it on the right edge, makes a tall step on top, and the stack grows tall, and clears two lines.";
        let f = decode_tetris_spot(s).expect("decodes");
        assert_eq!(&f[..5], &[2, 4, 2, 2, 2]);
        assert_eq!(render(GameGrammar::TetrisSpot, &f), s);
    }

    #[test]
    fn garbage_refuses() {
        assert!(decode_tetris_spot("hello world").is_none());
        assert!(decode_tetris_spot("The piece leaves three holes under it in the middle.").is_none());
        assert!(decode_tetris_spot("").is_none());
    }

    #[test]
    fn a_flappy_v3_option_decodes() {
        let s = "The bird squeezes through the top of the gap, over the center, drifting down one step.";
        let f = decode_flappy_option_v3(s).expect("decodes");
        assert_eq!(f, [5, 4, 1]);
        assert_eq!(render(GameGrammar::FlappyOptionV3, &f), s);
    }

    #[test]
    fn a_flappy_state_decodes_to_exact_v_h() {
        let s = "The bird is well above the gap center, flying level. The gap is wide. The pipe is just ahead.";
        let (rel, v, h) = decode_flappy_state(s).expect("decodes");
        assert_eq!((rel, v, h), (0, 0, 3));
        let s2 = "The bird is a little below the gap center, falling. The gap is narrow. The pipe is just ahead.";
        let (rel2, v2, h2) = decode_flappy_state(s2).expect("decodes");
        assert_eq!((rel2, v2, h2), (3, -1, 2));
    }

    #[test]
    fn a_lanes_clear_sentence_decodes() {
        let s = "The middle lane is clear ahead.";
        let d = decode_lanes_option(s).expect("decodes");
        assert_eq!(d, LaneDecoded { kind: 0, dist: None, lane: 1 });
        assert_eq!(render_lanes(d), s);
    }

    #[test]
    fn a_lanes_blocked_sentence_decodes_to_kind_dist_lane() {
        let s = "The left lane is blocked close ahead by a train.";
        let d = decode_lanes_option(s).expect("decodes");
        assert_eq!(d, LaneDecoded { kind: 2, dist: Some(0), lane: 0 });
        assert_eq!(render_lanes(d), s);
        let far = decode_lanes_option("The right lane is blocked far ahead by a rock.").expect("decodes");
        assert_eq!(far, LaneDecoded { kind: 3, dist: Some(1), lane: 2 });
    }

    #[test]
    fn lanes_garbage_refuses() {
        assert!(decode_lanes_option("hello world").is_none());
        assert!(decode_lanes_option("The middle lane is blocked soon ahead by a train.").is_none());
        assert!(decode_lanes_option("").is_none());
        // a tetris spot sentence is not a lanes sentence (grammar gating)
        assert!(decode_lanes_option("The piece leaves no holes under it in the middle, sits flat on the surface, and the stack stays low.").is_none());
    }

    #[test]
    fn the_lanes_feature_row_matches_the_published_first_state() {
        // lanes_oracle_laya_en_v1.jsonl lanes_000: [Train/Close, Rock/Close,
        // Train/Close] — the fixture's own feature arrays, verbatim.
        let lanes = [
            LaneDecoded { kind: 2, dist: Some(0), lane: 0 },
            LaneDecoded { kind: 3, dist: Some(0), lane: 1 },
            LaneDecoded { kind: 2, dist: Some(0), lane: 2 },
        ];
        assert_eq!(lanes_decoded_features(&lanes, 0), [1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 2.0, 0.0]);
        assert_eq!(lanes_decoded_features(&lanes, 1), [1.0, 1.0, 0.0, 0.0, 0.0, 1.0, 2.0, 0.0]);
        assert_eq!(lanes_decoded_features(&lanes, 2), [1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 2.0, 0.0]);
    }

    #[test]
    fn the_reconstruction_law_matches_the_published_example() {
        // flappy_oracle_laya_en_v3.jsonl state flappy_000, coast option:
        // SqueezeTop + over + down-one on a wide gap reconstructs post_rel
        // EXACTLY (the fixture's structured features say 3.0 there). pre_rel
        // carries the documented ±2 band collapse (true rel was 3), and
        // post_v/pre_v/gap_half are exact.
        let f = flappy_v3_decoded_features([5, 4, 1], 0, 0, 3);
        assert_eq!(f[0], 3.0); // post_rel: SqueezeTop exact
        assert_eq!(f[1], 3.0); // |post_rel|
        assert_eq!(f[2], -1.0); // post_v: bijective
        assert_eq!(f[3], 2.0); // pre_rel: band collapse (true 3 → 2)
        assert_eq!(f[4], 0.0); // pre_v exact
        assert_eq!(f[5], 1.0); // in_gap
        assert_eq!(f[6], 0.0); // edge_margin (from the reconstructed post_rel)
        assert_eq!(f[7], 3.0); // gap_half exact
    }
}

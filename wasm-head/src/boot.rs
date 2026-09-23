//! The boot sequence shared by the wasm module and the native test: fit a
//! head from a parsed corpus blob and verify the in-corpus anchor.
//! One sequence, two hosts — the test asserts exactly what the tab runs.
//! Generic over the feature/design widths (tetris F=5/D=6, flappy F=8/D=9).

use crate::corpus::Corrupt;
use crate::fit::{head_score, pick_range, HeadFitter, Standardizer};

/// What the wasm asserts at boot before trusting a blob.
#[derive(Debug)]
pub enum BootErr {
    Corrupt,
    Shape,
    Anchor { got: u32, want: u32 },
}

impl From<Corrupt> for BootErr {
    fn from(_: Corrupt) -> Self {
        BootErr::Corrupt
    }
}

pub struct BootPlan<'a, const F: usize, const D: usize> {
    pub n_options: usize,
    pub n_states: usize,
    pub lambda: f64,
    pub in_anchor: u32,
    pub offsets: &'a [u32],
    pub argmaxes: &'a [u8],
    pub targets: &'a [f64],
    /// n_options × F decoded class ordinals (blob tail).
    pub raws: &'a [u8],
}

pub struct BootResult<const F: usize, const D: usize> {
    pub w: [f64; D],
    pub in_agree: u32,
    /// The corpus-side standardizer the live decision path reuses.
    pub std: Standardizer<F>,
}

/// Standardize → design rows (into `rows`) → fit at `plan.lambda` → verify
/// the in-corpus agreement anchor. `rows.len()` must equal
/// `plan.n_options`. The accumulation order is the recipe's and is
/// identical on both hosts.
pub fn run<const F: usize, const D: usize>(
    plan: &BootPlan<F, D>,
    rows: &mut [[f64; D]],
    fitter: &mut HeadFitter<D>,
) -> Result<BootResult<F, D>, BootErr> {
    if plan.n_options != rows.len()
        || plan.n_options * F != plan.raws.len()
        || plan.offsets.len() != plan.n_states + 1
        || plan.argmaxes.len() != plan.n_states
        || plan.targets.len() != plan.n_options
        || plan.offsets[0] != 0
        || plan.offsets[plan.n_states] as usize != plan.n_options
        || !plan.lambda.is_finite()
        || plan.lambda <= 0.0
    {
        return Err(BootErr::Shape);
    }
    // 1. the corpus-side standardizer, straight from the blob's i8 raws —
    //    pinned bit-equal to `Standardizer::fit` over the f64 raws.
    let stdizer = Standardizer::<F>::fit_i8(plan.raws);

    // 2. the design rows
    for (i, row) in rows.iter_mut().enumerate() {
        let mut raw = [0.0f64; F];
        for (x, k) in raw.iter_mut().zip(0..F) {
            *x = plan.raws[i * F + k] as i8 as f64;
        }
        *row = stdizer.design(&raw);
    }

    // 3. the final fit at the recipe's λ
    let w = fitter.fit_into(rows, plan.targets, plan.lambda);

    // 4. the runtime G1 gate: the in-corpus agreement anchor
    let mut agree = 0u32;
    for (s, &arg) in plan.argmaxes.iter().enumerate() {
        let a = plan.offsets[s] as usize;
        let b = plan.offsets[s + 1] as usize;
        if pick_range(&w, rows, (a, b)) == arg as usize {
            agree += 1;
        }
    }
    if agree != plan.in_anchor {
        return Err(BootErr::Anchor {
            got: agree,
            want: plan.in_anchor,
        });
    }
    Ok(BootResult {
        w,
        in_agree: agree,
        std: stdizer,
    })
}

/// One tetris decision: decode the spot sentence → design → score, clamped
/// to [0,1]. `None` on any decode refusal (the caller abstains — never
/// guesses).
pub fn score_sentence<const F: usize, const D: usize>(
    stdizer: &Standardizer<F>,
    w: &[f64; D],
    sentence: &str,
) -> Option<f64> {
    let fills = crate::grammar::decode_tetris_spot(sentence)?;
    let mut raw = [0.0f64; F];
    for (x, k) in raw.iter_mut().zip(0..F.min(5)) {
        *x = fills[k] as f64;
    }
    let row = stdizer.design(&raw);
    Some(head_score(w, &row).clamp(0.0, 1.0))
}

/// One flappy decision (grammar `laya-flappy-v3`): decode the state
/// sentence → (rel band, exact v, exact h), decode the option sentence →
/// (band, offset, post-motion), reconstruct the 8 structured units (the
/// Bench 882 decoded-arm law, exact wherever the render is exact; crash
/// tails collapse to the boundary ±(h+1)), design → score clamped to
/// [0,1]. `None` on any decode refusal.
pub fn score_flappy<const D: usize>(
    stdizer: &Standardizer<8>,
    w: &[f64; D],
    state_sentence: &str,
    option_sentence: &str,
) -> Option<f64> {
    let (rel, v, h) = crate::grammar::decode_flappy_state(state_sentence)?;
    let post = crate::grammar::decode_flappy_option_v3(option_sentence)?;
    let raw = crate::grammar::flappy_v3_decoded_features(post, rel, v, h);
    let row = stdizer.design(&raw);
    Some(head_score(w, &row).clamp(0.0, 1.0))
}

/// One lanes decision (grammar `laya-lanes-v1`): decode ALL THREE option
/// sentences — the joined-state protocol; the head row's cross-lane columns
/// (6–7) read the OTHER lanes, so a single-sentence path cannot reproduce
/// the published head — build lane `lane`'s 8-column row (EXACTLY the
/// structured row; the decode arm is lossless), design → score clamped to
/// [0,1]. `None` on any decode refusal or a lane index ≥ 3.
pub fn score_lanes<const D: usize>(
    stdizer: &Standardizer<8>,
    w: &[f64; D],
    sentences: [&str; 3],
    lane: usize,
) -> Option<f64> {
    if lane >= 3 {
        return None;
    }
    let mut lanes = [crate::grammar::LaneDecoded {
        kind: 0,
        dist: None,
        lane: 0,
    }; 3];
    for (i, s) in sentences.iter().enumerate() {
        let d = crate::grammar::decode_lanes_option(s)?;
        if d.lane as usize != i {
            // a sentence naming the wrong lane is not a well-formed turn
            return None;
        }
        lanes[i] = d;
    }
    let raw = crate::grammar::lanes_decoded_features(&lanes, lane);
    let row = stdizer.design(&raw);
    Some(head_score(w, &row).clamp(0.0, 1.0))
}

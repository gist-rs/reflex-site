//! The boot sequence shared by the wasm module and the native test: fit the
//! head from a parsed corpus blob and verify the in-corpus anchor.
//! One sequence, two hosts — the test asserts exactly what the tab runs.

use crate::corpus::Corrupt;
use crate::fit::{head_score, pick_range, HeadFitter, Standardizer, D, F};

/// What the wasm asserts at boot before trusting the blob.
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

pub struct BootPlan<'a> {
    pub n_options: usize,
    pub n_states: usize,
    pub lambda: f64,
    pub in_anchor: u32,
    pub offsets: &'a [u32],
    pub argmaxes: &'a [u8],
    pub targets: &'a [f64],
    /// n_options × 5 decoded class ordinals (blob tail).
    pub raws: &'a [u8],
}

pub struct BootResult {
    pub w: [f64; D],
    pub in_agree: u32,
    /// The corpus-side standardizer the live decision path reuses.
    pub std: Standardizer,
}

/// Standardize → design rows (into `rows`) → fit at `plan.lambda` → verify
/// the in-corpus agreement anchor. `rows.len()` must equal
/// `plan.n_options`. The accumulation order is the recipe's and is
/// identical on both hosts.
pub fn run(
    plan: &BootPlan,
    rows: &mut [[f64; D]],
    fitter: &mut HeadFitter,
) -> Result<BootResult, BootErr> {
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
    // 1. the corpus-side standardizer, straight from the u8 raws — pinned
    //    bit-equal to `Standardizer::fit` over the f64 raws.
    let stdizer = Standardizer::fit_u8(plan.raws);

    // 2. the design rows
    for (i, row) in rows.iter_mut().enumerate() {
        let mut raw = [0.0f64; F];
        for (x, k) in raw.iter_mut().zip(0..F) {
            *x = plan.raws[i * F + k] as f64;
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

/// One live decision: decode → design → score, clamped to [0,1].
/// `None` on any decode refusal (the caller abstains — never guesses).
pub fn score_sentence(stdizer: &Standardizer, w: &[f64; D], sentence: &str) -> Option<f64> {
    let fills = crate::grammar::decode(sentence)?;
    let raw = [
        fills[0] as f64,
        fills[1] as f64,
        fills[2] as f64,
        fills[3] as f64,
        fills[4] as f64,
    ];
    let row = stdizer.design(&raw);
    Some(head_score(w, &row).clamp(0.0, 1.0))
}

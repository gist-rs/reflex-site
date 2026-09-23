//! The published fit recipe — a faithful core-only port of the katgpt-rs
//! Plan 607 / KARC Plan 308 math as consumed by riir-reflex
//! `src/game_heads.rs`:
//!
//! - `Standardizer`: corpus mean + inverse std (std == 0 → 0), sequential
//!   row-order accumulation;
//! - `HeadFitter::fit_into`: Gram = XᵀX with **fused** `mul_add`
//!   accumulation, `+λ` on the diagonal, Cholesky solve
//!   (`cholesky_f64` / `solve_lower_f64` / `solve_upper_f64`);
//! - `FittedHead::score`: sequential `mul_add` fold;
//! - argmax/pick: strict-greater fold — lowest index wins ties.
//!
//! Bit-parity note: every operation here is a correctly-rounded IEEE-754
//! f64 primitive (`fmadd` on arm64, libm `fma` + `f64.sqrt` on wasm32) with
//! a pinned accumulation order, so the wasm fit is bit-identical to the
//! native engine's — the `tests/recipe.rs` anchors and the JS recorded-walk
//! probe both assert it, never assume it.

pub const F: usize = 5; // decoded class ordinals
pub const D: usize = F + 1; // + intercept
/// Pinned λ grid (standardized scale) — the recipe's selection space.
pub const RIDGE_GRID: [f64; 4] = [1e-3, 1e-2, 1e-1, 1.0];

// ── correctly-rounded primitives (the bit-parity substrate) ──────────────
// Every op here is IEEE-754 f64 with a unique correctly-rounded result:
// `fmadd` on arm64, libm `fma` + the `f64.sqrt` opcode on wasm32 — so the
// wasm fit is bit-identical to the native engine's.

/// Fused multiply-add. Host: `f64::mul_add` (arm64 `fmadd`). Wasm: the
/// libm `fma` symbol from compiler_builtins (no wasm fma opcode exists;
/// libm's fma is correctly rounded like the hardware instruction).
#[inline]
fn fma_(a: f64, b: f64, c: f64) -> f64 {
    #[cfg(not(target_arch = "wasm32"))]
    {
        a.mul_add(b, c)
    }
    #[cfg(target_arch = "wasm32")]
    {
        extern "C" {
            fn fma(x: f64, y: f64, z: f64) -> f64;
        }
        unsafe { fma(a, b, c) }
    }
}

/// Correctly-rounded square root. Wasm: the libm `sqrt` symbol from
/// compiler_builtins (the `f64_sqrt` intrinsic is unstable; libm's sqrt is
/// correctly rounded like the hardware instruction).
#[inline]
fn sqrt_(x: f64) -> f64 {
    #[cfg(not(target_arch = "wasm32"))]
    {
        x.sqrt()
    }
    #[cfg(target_arch = "wasm32")]
    {
        extern "C" {
            fn sqrt(x: f64) -> f64;
        }
        unsafe { sqrt(x) }
    }
}

/// Exact powers of two (the pivot-clamp scale factors) — decimal literals
/// that parse to exactly 2^-50 and 2^-52, no `powi` needed in no_std.
const TWO_POW_NEG_50: f64 = 8.881784197001252e-16;
const TWO_POW_NEG_52: f64 = 2.220446049250313e-16;

// ── standardizer ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Standardizer {
    pub mean: [f64; F],
    pub inv_std: [f64; F],
}

impl Standardizer {
    /// Fit over the corpus raws (fixed column order — part of the recipe).
    /// Sequential row-order accumulation, exactly `Standardizer::fit`.
    pub fn fit(raws: &[[f64; F]]) -> Self {
        let n = raws.len().max(1) as f64;
        let mut mean = [0.0; F];
        for r in raws {
            for (m, x) in mean.iter_mut().zip(r.iter()) {
                *m += x;
            }
        }
        for m in mean.iter_mut() {
            *m /= n;
        }
        let mut var = [0.0; F];
        for r in raws {
            for (v, (x, m)) in var.iter_mut().zip(r.iter().zip(mean.iter())) {
                let d = x - m;
                *v += d * d;
            }
        }
        let mut inv_std = [0.0; F];
        for i in 0..F {
            let s = sqrt_(var[i] / n);
            inv_std[i] = if s > 0.0 { 1.0 / s } else { 0.0 };
        }
        Self { mean, inv_std }
    }

    /// The same stats accumulated straight from the corpus blob's u8 raws —
    /// the wasm path avoids materializing an f64 raw table. `u8 → f64` is
    /// exact and the accumulation order is identical, so this MUST equal
    /// [`Self::fit`] bit-for-bit (pinned by `tests/recipe.rs`).
    pub fn fit_u8(raws: &[u8]) -> Self {
        assert!(raws.len() % F == 0, "raws must be option-major × F");
        let n_options = raws.len() / F;
        let n = n_options.max(1) as f64;
        let mut mean = [0.0; F];
        for r in 0..n_options {
            for (m, k) in mean.iter_mut().zip(0..F) {
                *m += raws[r * F + k] as f64;
            }
        }
        for m in mean.iter_mut() {
            *m /= n;
        }
        let mut var = [0.0; F];
        for r in 0..n_options {
            for (v, (k, m)) in var.iter_mut().zip(mean.iter().enumerate()) {
                let d = raws[r * F + k] as f64 - *m;
                *v += d * d;
            }
        }
        let mut inv_std = [0.0; F];
        for i in 0..F {
            let s = sqrt_(var[i] / n);
            inv_std[i] = if s > 0.0 { 1.0 / s } else { 0.0 };
        }
        Self { mean, inv_std }
    }

    /// A live option's design row: standardized features + intercept.
    pub fn design(&self, raw: &[f64; F]) -> [f64; D] {
        let mut row = [0.0; D];
        for i in 0..F {
            row[i] = (raw[i] - self.mean[i]) * self.inv_std[i];
        }
        row[F] = 1.0;
        row
    }
}

// ── the f64 Cholesky ridge solve (exact port) ────────────────────────────

/// f64 dot product (scalar accumulation, 4-lane unrolled — cold path).
#[inline]
fn dot_f64(a: &[f64], b: &[f64], len: usize) -> f64 {
    let mut s = 0.0f64;
    let mut i = 0;
    while i + 4 <= len {
        s = fma_(a[i], b[i], s);
        s = fma_(a[i + 1], b[i + 1], s);
        s = fma_(a[i + 2], b[i + 2], s);
        s = fma_(a[i + 3], b[i + 3], s);
        i += 4;
    }
    while i < len {
        s = fma_(a[i], b[i], s);
        i += 1;
    }
    s
}

/// f64 Cholesky factorisation `A = L·Lᵀ` of an SPD matrix (`k×k`) with the
/// relative-tolerance pivot clamp.
#[inline]
pub fn cholesky_f64(l: &mut [f64], a: &[f64], k: usize) {
    let mut a_max = 1.0f64;
    for &v in a.iter().take(k * k) {
        let av = v.abs();
        if av > a_max {
            a_max = av;
        }
    }
    let tol = a_max * (k as f64) * TWO_POW_NEG_50;
    let floor = a_max * TWO_POW_NEG_52;
    for v in l.iter_mut().take(k * k) {
        *v = 0.0;
    }
    for j in 0..k {
        let j_row = j * k;
        let sum = if j > 0 {
            dot_f64(&l[j_row..j_row + j], &l[j_row..j_row + j], j)
        } else {
            0.0
        };
        let mut diag = a[j_row + j] - sum;
        if diag <= 0.0 {
            assert!(
                diag > -tol,
                "matrix not positive definite in cholesky_f64 (pivot {diag} < -{tol})"
            );
            diag = floor;
        }
        let diag_sqrt = sqrt_(diag);
        l[j_row + j] = diag_sqrt;
        let mut i = j + 1;
        while i < k {
            let i_row = i * k;
            let s = if j > 0 {
                dot_f64(&l[i_row..i_row + j], &l[j_row..j_row + j], j)
            } else {
                0.0
            };
            l[i_row + j] = (a[i_row + j] - s) / diag_sqrt;
            i += 1;
        }
    }
}

/// f64 forward substitution `L·Z = B` (row-major lower-triangular).
fn solve_lower_f64(z: &mut [f64], l: &[f64], b: &[f64], k: usize, n_rhs: usize) {
    for col in 0..n_rhs {
        for i in 0..k {
            let i_row = i * k;
            let mut s = b[i * n_rhs + col];
            let mut j = 0;
            while j < i {
                s -= l[i_row + j] * z[j * n_rhs + col];
                j += 1;
            }
            z[i * n_rhs + col] = s / l[i_row + i];
        }
    }
}

/// f64 back substitution `Lᵀ·X = Z`.
fn solve_upper_f64(x: &mut [f64], l: &[f64], z: &[f64], k: usize, n_rhs: usize) {
    for col in 0..n_rhs {
        for ii in 0..k {
            let i = k - 1 - ii;
            let i_row = i * k;
            let mut s = z[i * n_rhs + col];
            let mut j = i + 1;
            while j < k {
                s -= l[j * k + i] * x[j * n_rhs + col];
                j += 1;
            }
            x[i * n_rhs + col] = s / l[i_row + i];
        }
    }
}

// ── the fitter (scratch owner; zero-alloc) ───────────────────────────────

/// Scratch owner for (repeated) fits — the stack-owning twin of
/// `katgpt_core::state_option_scoring::head::HeadFitter`, allocation-free
/// so the wasm build needs no allocator.
pub struct HeadFitter {
    gram: [f64; D * D],
    l: [f64; D * D],
    cov: [f64; D],
    z: [f64; D],
    w: [f64; D],
}

impl Default for HeadFitter {
    fn default() -> Self {
        Self::new()
    }
}

impl HeadFitter {
    pub const fn new() -> Self {
        Self {
            gram: [0.0; D * D],
            l: [0.0; D * D],
            cov: [0.0; D],
            z: [0.0; D],
            w: [0.0; D],
        }
    }

    /// Closed-form ridge least squares over the row set `ra ++ rb` (the
    /// two-slice form lets the LOO protocol fit "all rows except this
    /// state" without copying). The Gram accumulation order — row-major
    /// over `ra` then `rb`, i outer / j inner — is part of the recipe.
    pub fn fit_into2(
        &mut self,
        ra: &[[f64; D]],
        rb: &[[f64; D]],
        ta: &[f64],
        tb: &[f64],
        ridge: f64,
    ) -> [f64; D] {
        debug_assert_eq!(ra.len(), ta.len());
        debug_assert_eq!(rb.len(), tb.len());
        assert!(
            ridge > 0.0 && ridge.is_finite(),
            "ridge λ must be finite and > 0"
        );
        self.gram = [0.0; D * D];
        self.cov = [0.0; D];
        let halves = [(ra, ta), (rb, tb)];
        for (pair, t) in halves {
            for (x, &y) in pair.iter().zip(t.iter()) {
                for i in 0..D {
                    self.cov[i] = fma_(x[i], y, self.cov[i]);
                    let g_row = i * D;
                    for j in 0..D {
                        self.gram[g_row + j] = fma_(x[i], x[j], self.gram[g_row + j]);
                    }
                }
            }
        }
        for i in 0..D {
            self.gram[i * D + i] += ridge;
        }
        let (l, z, w) = (&mut self.l, &mut self.z, &mut self.w);
        cholesky_f64(l, &self.gram, D);
        solve_lower_f64(z, l, &self.cov, D, 1);
        solve_upper_f64(w, l, z, D, 1);
        *w
    }

    /// Single-slice convenience — the boot fit and every LOO refit over a
    /// contiguous range.
    pub fn fit_into(&mut self, rows: &[[f64; D]], target: &[f64], ridge: f64) -> [f64; D] {
        self.fit_into2(rows, &[], target, &[], ridge)
    }
}

/// `w·x` — sequential f64 fold, no SIMD reordering (exact `FittedHead::score`).
#[inline]
pub fn head_score(w: &[f64; D], x: &[f64; D]) -> f64 {
    let mut s = 0.0f64;
    for (wi, &xi) in w.iter().zip(x.iter()) {
        s = fma_(*wi, xi, s);
    }
    s
}

/// Argmax over `rows[range.0..range.1]` — strict-greater fold, lowest index
/// wins ties (finite scores, so this is exactly the engine's
/// `cmp_for_max_f64` + strict-greater behavior). Returns the index RELATIVE
/// to the range start — the engine's `pick` over a sliced range and the
/// fixture's `argmax` field are both relative, and the anchor comparisons
/// are pinned to that.
pub fn pick_range(w: &[f64; D], rows: &[[f64; D]], range: (usize, usize)) -> usize {
    let (a, b) = range;
    assert!(a < b && b <= rows.len(), "pick needs a non-empty range");
    let mut best = 0usize;
    let mut best_s = f64::NEG_INFINITY;
    for (i, row) in rows[a..b].iter().enumerate() {
        let s = head_score(w, row);
        if s > best_s {
            best = i;
            best_s = s;
        }
    }
    best
}

// ── the LOO protocol (host-side — the build-time recipe step) ────────────

/// State-level LOO λ selection over the pinned grid — exact port of
/// `loo_select` in riir-reflex `game_heads.rs` (MSE on the held-out state's
/// options; sibling options never leak; first-strict-min wins). Returns
/// `(chosen λ, per-state LOO picks)`.
#[cfg(not(target_arch = "wasm32"))]
pub fn loo_select(
    fitter: &mut HeadFitter,
    rows: &[[f64; D]],
    targets: &[f64],
    offsets: &[u32],
) -> (f64, Vec<usize>) {
    let n_states = offsets.len() - 1;
    let mut chosen = RIDGE_GRID[0];
    let mut chosen_mse = f64::INFINITY;
    let mut chosen_picks = vec![0usize; n_states];
    for &lam in &RIDGE_GRID {
        let mut sq = 0.0f64;
        let mut picks = vec![0usize; n_states];
        for s in 0..n_states {
            let (a, b) = (offsets[s] as usize, offsets[s + 1] as usize);
            let w = fitter.fit_into2(
                &rows[..a],
                &rows[b..],
                &targets[..a],
                &targets[b..],
                lam,
            );
            let mut best_pred = f64::NEG_INFINITY;
            let mut bi = 0usize;
            for (j, row) in rows[a..b].iter().enumerate() {
                let p = head_score(&w, row);
                let e = p - targets[a + j];
                sq += e * e;
                if p > best_pred {
                    best_pred = p;
                    bi = j;
                }
            }
            picks[s] = bi;
        }
        let mse = sq / targets.len() as f64;
        if mse < chosen_mse {
            chosen_mse = mse;
            chosen = lam;
            chosen_picks = picks;
        }
    }
    (chosen, chosen_picks)
}

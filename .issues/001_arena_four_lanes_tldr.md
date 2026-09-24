# Issue 001 — arena: four lanes (laya Python | laya Rust / KatGPT modelless | raw), honest µs timing, bench-driven TL;DR
**Status:** DONE (2026-09-24) — all 7 items landed; the two measured gaps (Rust-vs-Python p50, modelless accuracy) are surfaced on the TL;DR, not fixed here

Owner request against https://reflex.gist.rs/arena/ (7 items). The arena showed
three boards (laya · modelless · raw); the raw board was EMPTY with no engine and
there was no laya (Python) board at all, even though the bench tables carry a
`laya (python)` lane on every suite.

## Tasks

- [x] T1 — label `laya lane` → **`laya lane (Rust)`**; `modelless lane` → **`KatGPT modelless lane`**.
- [x] T2 — `.lane-note` gets a fixed 4-line box so the board heads line up side by side
      (the laya note was 2 lines against the modelless note's 4).
- [x] T3 — latency renders sub-millisecond values honestly: `p50 0 ms` was a 0.1 ms
      rounding of a ~12 µs wasm decision. Also the in-tab wasm head's per-spot time is
      batch-amortized (browser `performance.now()` is coarsened to ≥5–100 µs, so a
      per-call median of a 12 µs call reads as 0).
- [x] T4 — say **`laya (Rust)`** everywhere the port is meant (chips, SOURCE readout,
      hints, status text, explainers, footnote) so it is never confused with the
      **`laya (Python)`** torch reference.
- [x] T5 — 2 boards per row: row 1 `laya (Python)` | `laya (Rust)`, row 2
      `KatGPT modelless` | `raw baseline` (was 3-across).
- [x] T6 — record the two missing lanes into `arena/demo_oracle.json`:
      `laya (Python)` (riir-reflex `scripts/laya_python_lane.py`, the ORIGINAL torch
      reference on MPS — tetris seed-607 walk + the flappy/lanes reels) and the
      `raw baseline` (engine `X-Reflex-Lane: raw`), re-recording `laya (Rust)` in the
      SAME session so the Rust-vs-Python per-spot timing is same-box/same-hour.
- [x] T7 — TL;DR above the hero, rendered from `data/bench.json` (never hand-typed):
      the expected order is KatGPT modelless > laya (Rust) > laya (Python) on
      perf + accuracy; anything else is named as an open gap, not hidden.

## Findings (measured from data/bench.json @ engine 77c408e, m3 — the TL;DR's own arithmetic)

14 suites carry all three lanes (harness_cache_reuse has no modelless row);
checkpoint compared = english.

- **Speed — expected order HOLDS for KatGPT**: modelless faster than laya (Rust) on
  14/14, median ~851× (p50 0.008–0.495 ms vs 25–421 ms).
- **laya (Rust) vs laya (Python) — speed order does NOT hold**: Rust faster on 6/14,
  slower on 7 (typed_decisions 421 vs 353 ms, massive_intent_en 63 vs 51,
  code_fixtures 147 vs 125, …), tied on emotion. Rust wins the harness suites. This
  is the owner's "bug" case and is already tracked as **riir-reflex Issue 020**
  (the riir Metal lane must beat the torch MPS oracle on every published cell) —
  this site issue surfaces it, it does not fix it.
- **laya (Rust) vs laya (Python) — accuracy is IDENTICAL on 14/14.** The correct
  outcome for a parity port (G5: top-1 agreement 1.000); "Rust > Python on accuracy"
  cannot hold for a faithful port and equality is not a bug.
- **KatGPT modelless vs laya — accuracy order does NOT hold**: at or above laya on
  3/14 (harness suites), trails on the rest (widest massive_intent_en 7.7% vs
  75.0%). The measured gap between a corpus-cosine modelless engine and a ~650 MB
  model — shown on the TL;DR as-is, not relabelled.

## Recorded session (T6) — M3 Max, AC power, powermode 2, loadavg ~5, 2026-09-24

Engine = riir-reflex `origin/develop` fba613e built `--release --features
laya-riir-metal` (sibling worktree, the WIP checkout untouched); Python = the
bench's own `scripts/laya_python_lane.py` on torch 2.11 MPS. All four lanes in
ONE run of `scripts/record_demo_walks.mjs`, seed 607, sequential per-spot calls:

| lane | tetris game | per-spot p50 | transport |
|---|---|---|---|
| KatGPT modelless | 140 pts · 3 lines · 46 pieces | 0.314 ms | HTTP /decide |
| laya (Rust) | 660 · 11 · 70 | **24.08 ms** | HTTP /decide |
| laya (Python) | 660 · 11 · 70 — the SAME game | **23.18 ms** | stdin/stdout JSONL |
| raw baseline | 40 · 1 · 38 — 693/693 abstained | 0.267 ms | HTTP /decide |

- Parity: python vs rust max |Δp| 1.0e-4 over the 70 shared turns; the python
  flappy/lanes reels sit within 5e-5 of the laya (Rust) fixture.
- Same-session, laya (Rust) is ~4% SLOWER per spot than the torch reference —
  the arena reproduces riir-reflex Issue 020's finding on the game grammar too.
  ⚠ The two transports differ (HTTP+JSON vs a pipe), so this is a lane-level
  reading, not a kernel-level one.
- In-tab wasm head: ~1–3 µs/decision (batch re-timed ≥ 0.5 ms, T3); the old
  per-call median printed `p50 0 ms`.

## Verification

`arena_demo_check` (now also chain-verifies the raw + python walks and the
python-vs-rust parity) · `arena_head_parity` (tetris 836/836 bit-exact on the
re-recorded head walk) · `arena_demo_smoke` (2-per-row grid, equal note heights
per row, all 4 boards advancing, TL;DR 4 rows, modelless p50 ≠ 0) ·
`arena_smoke` + `arena_protocol_check` against a live engine (python board
replays its recorded game while the other three play live) — all PASS.
`gen_demo_oracle.mjs` round-trip preserves every recorded key (it previously
kept only 2 of the now 8).

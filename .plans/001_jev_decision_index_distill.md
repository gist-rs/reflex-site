# Jev Decision Index distill — bench-page improvement plan (plan-only)
**Status:** PLANNED — no implementation (owner call 2026-10-01: plan md only; no new model
candidates larger than laya). REVISED after a reviewer round: the original draft re-planned
substrate that already ships (the chance-corrected `cc` metric landed 2026-09-30 in
`f0185af`, fixed `47f786d`, documented `cf23805`; the reflex Issue-058 board restore landed
`d750175`, so the sequencing blocker is gone). T1 is re-scoped to the genuinely-open deltas
on top of that machinery.

## Why this matters

The Jev Decision Index is a community leaderboard scoring open reproductions of TypeSafe's
Jev on ONE frozen 132,422-request typed-decision suite (40 benchmarks, 5 areas, one headline
number). Its task format is **our decision_wire vocabulary verbatim** — `choice` +
`noul` (yes/no probability) questions, typed answers, refusal-as-wrong. Four of our
comparison lanes are tracked entrants on it: **laya** (convaiinnovations/laya, 421M
ModernBERT-large + RLCD head — discussion #1), **agentjev** (malevrigns/agent-jev),
**gliner** (fastino/GLiNER2.5-Decide), **clm** (Contrastive-LM/CLM-v0.1-8B). Their index and
our bench measure the same class of things; their scoring design is a free audit of our
bench-page honesty gaps. We copy the mechanics that make their number trustworthy — we do
NOT copy their board (no new entrants, see Constraint).

## Owner constraints (binding for every task below)

1. **Plan-only until the owner greenlights implementation.** No code edits, no data edits.
2. **No new model candidates with trained size > laya (421M).** Future comparison lanes must
   be modelless (0 trained params) or ≤ 421M trained params. Existing lanes (clm 8B etc.)
   are grandfathered — no new ones above the bar. This keeps the perf/sec story: our unique
   axis is decision quality per millisecond and per byte, and every lane must stay
   sub-second-class on the M3.

## Substrate audit — what ALREADY ships (do not rebuild; extend)

Verified in the worktree on `main` (checked at `8d33e3f`; `2b699f0`, a typed-timing
refresh, landed after with no T1 impact — re-verify at implementation time), post-review:

- **Chance-corrected metric + areas rollup** (`f0185af`, 2026-09-30): `compute_areas()` in
  `scripts/publish_bench.py` emits `data/bench.json` → `areas` v2 — per-suite
  `cc = (acc − chance)/(1 − chance)` published UNCLIPPED, and it CAN go negative below
  chance — two live cells prove it: `clm@4090-win/banking77` cc −0.003026 (acc 0.01 <
  chance 1/77) and `agentjev@4090-win/prompt_injections` cc −0.034483 (acc 0.4828 <
  chance 0.5) — and both feed their lane `index`. Whether to clip below-chance to 0 is a
  REAL scoring decision (task 1d), not a non-issue. The upper side is bounded (cc ≤ 1).
  Per-area means, per-lane
  `index` (mean of area cc means), per-lane `coverage {suites, of}` + `complete`,
  host-tagged lane keys (`clm@4090-win`), and a `scale` disclosure string. The page
  renders it: `chanceOf()` in `assets/bench-charts.js`, radar cards, `FAIL[cc]` smoke arms.
- **The chance BASIS is the harness's own option construction** — `AREA_CHANCE` in
  `publish_bench.py` (lines ~471-500): "dataset facts read off the harness's own option
  construction (ag_news 4, massive 20 presented/question, banking77 77, sst5 5, emotion 6,
  xnli 3, prompt 2, typed 20-head-type mean 0.3175, code (1/8+1/2)/2)". This is the right
  basis (random guessing against the PRESENTED task) and SUPERSEDES this plan's original
  uniform-`1/n_labels` table — do not add a second, different-baseline table.
- **Pending-not-zero** already holds in `compute_areas`: a lane missing a suite lacks that
  suite's entry; partial lanes take the mean over what they measured ("disclosed, never
  padded with zeros"); `coverage`/`complete` ride every lane block; the honest-empty-cell
  law + cc all-not-run root cause are recorded in `cf23805`.
- **Per-cell timing provenance** exists: `stamp_cell()` carries the run's `box_state` and
  latency verdict ON the cell (Issue-057/003), so timing disclosures can be aggregated from
  cells rather than hand-typed.
- **Sequencing**: the reflex Issue-058 board restore landed `d750175` (full-pool basis +
  dated disclosure) and the corpus-reset ack follow-ups continued through `8d33e3f`.
  `publish_bench.py` is no longer hot — but re-check `git status` for sibling edits before
  landing anything.

## What they do (the mechanics worth stealing — remaining deltas marked ★)

1. **Chance-corrected headline.** `skill = clip((s − r)/(1 − r))` per benchmark —
   `metrics.py::skill` is `min(1.0, max(0.0, (x − b)/(1 − b)))`, clipped on BOTH sides;
   the `max(0, …)` lower clip is exactly the below-chance case (verified during
   distillation; re-clone `apolinario/decision-index` to re-check), frozen per-benchmark
   random baselines, `balanced_skill` headline,
   raw accuracy kept visible, breadth variant computed-but-hidden. → We ship the cc
   equivalent in the areas block. ★ Remaining: surface cc/skill in the per-suite TABLE
   cells (tables still show raw acc only) and a headline chip per lane (the lane `index`
   exists in data; the page does not headline it).
2. **Measured, pinned chance baselines.** `{value, method, monte_carlo_standard_error ≤
   0.001}` per benchmark, sha-pinned. → We ship `AREA_CHANCE` as curated dataset facts with
   the basis disclosed in `scale`. ★ Remaining: pin the AREA_CHANCE table's digest the way
   bench.json pins corpus digests, so a basis edit announces itself.
3. **Refusal-as-wrong + mined causes.** `conservative_f1` counts missing in the denominator;
   `answer_gaps.py` mines refusal messages into per-cause shares. ★ Ours entirely open: we
   publish abstain RATES with no WHY.
4. **Pending, never zero.** → We ship this in `compute_areas`. ★ Remaining: one regression
   arm proving a hypothetical future composite cannot zero-fill (extend the self-test; the
   existing arms cover the areas block).
5. **Area weighting (√n_c, gold★ 1.2).** Noted only — revisit if our suite count grows well
   past 15. Non-goal for now.
6. **Baseline-relative loss rules** (ForecastBench `clip((baseline − Brier)/(baseline −
   best)) · coverage`). Non-goal: we run no forecasting suite.
7. **Per-engine latency-method disclosure table.** ★ Open: a structured per-lane `timing`
   block + a page table ("how each lane's request time was recorded"), aggregated from the
   existing cell stamps — not hand-typed prose.
8. **Entrant classification** (kind/architecture/params with precedence rules). ★ Open: a
   `kind` field per lane (modelless-in-process / trained-head / encoder / http-oracle /
   python-subprocess / compiled-program) + kind chips.
9. **Auditability per benchmark row** (subset rules, revisions, licences, excluded-questions
   table, edition notes, worked example, sha pins, board changes with why). ★ Open: edition
   label + `suite_digest` in bench.json, archived bundles, append-only changelog —
   coordinate with the corpus_digest work that just landed (`d750175`/`8d33e3f`).
10. **Static-data discipline.** We already match it (publish_bench.py → data/bench.json;
    HTML renders, never re-derives — the compute_pairings precedent).

## Tasks

Each task keeps the existing gates green (publish self-test 66/66+, chart smoke, pairing
gate, bench-page Playwright smoke) and adds its own test arms. Worktree check before
landing: `git status --porcelain scripts/publish_bench.py` must be clean of sibling edits.

### T1 — computation-only, reflex-site (publish_bench.py free since d750175)

- [ ] 1. **Extend the shipped cc layer (do NOT build a second one).** (a) Per-suite cc
      beside accuracy in the suite tables (data may already carry per-suite `cc` in the
      areas block — render it; add nothing if present). (b) A headline chip per lane from
      the existing per-lane `index` (e.g. "cc index 0.61 · 6/9 suites"). (c) Optional skill
      radar mode = the existing cc spokes (likely already the case — verify, don't
      duplicate). No new chance table; `AREA_CHANCE` is the only basis.
      (d) **Below-chance posture — decide and pin.** cc is published UNCLIPPED and two
      live cells sit below 0 (`clm@4090-win/banking77` −0.003026,
      `agentjev@4090-win/prompt_injections` −0.034483), feeding their lane `index`.
      Option A: clip cc at 0 (Jev's `max(0, …)`) — changes published numbers, needs a
      dated disclosure + re-publish. Option B (RECOMMENDED): keep negatives — a
      below-chance lane should read below-chance, the values are already live and honest —
      and extend the `scale` disclosure ("values below 0 = below chance; they pull area
      means down by design") + a self-test arm asserting negatives survive the rollup.
      Owner decides at implementation.
- [ ] 2. **Pin the chance basis.** Emit the AREA_CHANCE digest into the areas block (the
      corpus_digest precedent) so a basis edit announces itself; self-test arm: editing a
      chance value changes the published digest.
- [ ] 3. **Zero-fill regression arm.** One self-test arm extending the existing
      pending-not-zero coverage: a future composite helper (if any is added) must skip
      missing suites and carry pending — assert against the current `compute_areas` emitter
      so the law is pinned where it lives.
- [ ] 4. **Per-lane timing-method disclosure.** Structured `timing` per lane in bench.json
      derived from the cell stamps (clock class: in-process / metal / subprocess-http /
      subprocess-python; posture; box) + a methodology table on the page + a comparability
      note. Two clocks never pool silently.
- [ ] 5. **Lane kind classification.** `kind` per lane in bench.json + kind chips on the
      filter bar (their entrant-classification rule: technique vs weights is a different
      claim).

### T2 — medium, some cross-repo (file a riir-reflex issue when started)

- [ ] 6. **Abstention-reason mining.** riir-reflex harness first: record the abstain CAUSE
      per case (score-gate vs corpus-distance-gate vs grammar-invalid). Then publish_bench
      aggregates per suite; page shows answered-rate bar + per-cause shares (the
      answer-gaps mechanic applied to our abstention-first-class story).
- [ ] 7. **Edition label + archived bundles + board-change changelog.** bench.json gains
      `edition`; each publish archives `data/bench-<stamp>.json`; an append-only `changes`
      list `{date, change, why}`. The corpus-reset drops just landed should back-fill the
      first changelog rows.
- [ ] 8. **Per-lane detail view** (`bench/?lane=<id>`): full lane profile from existing
      bench.json (suites, acc, cc, abstain, latency, provenance, gate verdicts). No new
      data required.
- [ ] 9. **Determinism/run-variation disclosure formalized.** det ✓/✗ + repeat count as a
      structured field per cell (already printed in tables; make it data).

### T3 — distinctive (our angle; no new models)

- [ ] 10. **Efficiency frontier.** cc index vs p50 latency scatter (+ per-MB from
      sizes.json), Pareto-frontier marked. No leaderboard in the Jev index publishes
      latency-normalized quality — this is where the modelless story wins, using only
      existing lanes. Cross-posture comparisons carry the timing disclosure from task 4.
- [ ] 11. **og.png social card** for the bench page rendered from bench.json via headless
      Chrome (Playwright already in the smoke lane). Optional polish.

### Read-only follow-ups (no candidates added)

- [x] Distill the index mechanics into this plan.
- [x] Substrate audit — cc/areas/pending/timing-stamp machinery located and cited (this
      revision).
- [ ] Check whether laya finished their frozen suite (`?model=laya` on the Space) and if so
      cite its public Decision Index score in the laya lane docs — external context for our
      laya columns. Citation only; no new lanes, no runs.
- [-] Community contribution path (accept external lane PRs): NOT planned — our lanes
      require our harness; owner-gated if ever.

## Non-goals

- Any new model candidate > laya (421M trained params) — owner constraint above.
- A second chance-baseline table with a different basis (uniform 1/n_labels) — the shipped
  AREA_CHANCE (harness's own option construction) is the only basis; this plan's original
  uniform-table proposal is WITHDRAWN.
- Their complete-run gate as a hard rule (single-operator board; our disclosure + the
  shipped pending-not-zero law covers it).
- News tracker / trending scores — not our site's shape.
- √n area weights and gold★ 1.2 weighting — noted; revisit only if our suite count grows
  well past 15.
- ForecastBench-style loss rules — we run no forecasting suite.

## Verification (when implemented, per task)

- `python3 scripts/test_publish_bench.py` — new arms: chance-digest pin (task 2),
  zero-fill regression (task 3), timing/kind presence (tasks 4-5); existing 66+ stay green.
- `node scripts/chart_render_smoke.cjs` + `scripts/bench_page_smoke.cjs` — extended for the
  new chip/column/chips/detail view.
- Pairing gate + mirror parity unchanged and green.
- Deploy via `npx wrangler deploy`; live-verify the page.

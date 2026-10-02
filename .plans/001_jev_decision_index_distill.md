# Jev Decision Index distill — bench-page improvement plan
**Status:** LANDED 2026-10-02 (T1 + T2.7/8/9 + T3.10; the plan-only gate was LIFTED by the
owner the same day — "no more owner gate, ask claude for decision" — and the open decision
points were decided by the Claude verdict round, recorded in §Decisions below. Deferred:
task 6 (needs the riir-reflex harness abstain-cause stamps first — filed as reflex
`.issues/060`) and task 11 (og.png, optional polish). REVISED after a reviewer round: the
original draft re-planned substrate that already ships (the chance-corrected `cc` metric
landed 2026-09-30 in `f0185af`, fixed `47f786d`, documented `cf23805`; the reflex Issue-058
board restore landed `d750175`, so the sequencing blocker is gone). T1 was re-scoped to the
genuinely-open deltas on top of that machinery.
MERGED TO MAIN + DEPLOYED 2026-10-02: rebased onto dfef114 (the tier-fallback landing —
`apply_fallback_cells` now runs inside `finalize()` between `compute_areas` and
`apply_disclosures`, so `--rederive` preserves fallback cells and they never feed the lane's
areas/timing/frontier); main `26fddb9`, live at reflex.gist.rs (edition 2026-10, areas v3).

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

## Decisions (Claude verdict round, 2026-10-02 — verdict REVISE, folded in full)

- **D1 (task 1d) = Option B** — cc stays UNCLIPPED. The verdict's addition: the page already
  HID negatives visually (`frac()` clamps bars to [0,1]; the radar clamps dots to the
  centre) — so B is complete only with signed-value surfaces: the table's cc column, the
  hero/cell tooltips, a hollow ring on below-chance radar dots, a 0-line tick (`bc-zero`)
  on below-chance bars, and smoke arms asserting marker == signed text. Landed exactly so.
- **D3 = client-side `ccOf`** (one JS formula home over the PUBLISHED chance basis) — plus
  a parity arm: chart_render_smoke asserts ccOf agrees with every published `per_suite` cc
  (95 entries at landing) within 1e-6, pinning the Python/JS copy pair together.
- **D4 = data-side timing**: `areas.timing[key]` carries the curated clock/method
  (LANE_TIMING) + the MEASURED aggregate — p50 geomean over EXACTLY the index's suites,
  quotable-verdict cells only, `n_used/n_unquotable/n_unjudged`, null when none. At this
  data SEVEN lanes are null (hybrid, bekko, paw, and the four 4090-win lanes: clm,
  gliner, agentjev, paw-local)
  — listed "not plotted", never drawn at 0. Pareto marks stay client-side visual
  geometry, scoped to equal-coverage groups keyed on the SUITE SET (not the count), and
  a lane whose geomean covers a SUBSET of its index suites (timing-partial, e.g.
  Rethink's 2-of-7) draws a dashed dot, discloses `timing n/suites` in its aria, and is
  EXCLUDED from the frontier both ways (the round-2 verdict's measured defect: the
  subset geomean drew ringed under a lane-wide axis label).
- **D6 = archive on edition bump only** (git history covers per-publish versions) — and
  the bump is FORCED by the append-only EDITIONS ledger (the round-2 verdict's form,
  which replaced a single-row pin a digest re-pin could have satisfied without a bump):
  edition_guard() passes only when EDITION names the ledger's LAST row AND the computed
  basis digest equals that row's digest; every ledger edition must have a changes.json
  row (test enforced). `archive_on_edition` runs on BOTH write paths — the ordinary
  publish AND --rederive (the reviewer measured the gap: a scoring-basis edit is a
  derived-only change, and --rederive is the path made for exactly that). Back-filled
  changelog rows cite SHAs.
- **D7 replaced** — "re-run the publisher" was the wrong remedy (it needs raw results
  docs; a fresh run can pick up newer cells): `publish_bench.py --rederive
  data/bench.json` rebuilds only the derived blocks and refuses unless every measurement
  cell stays byte-identical. Landed with its own test arm.
- **Scope trims:** per-MB axis dropped (sizes.json keys don't map 1:1 to bench lanes; a
  hand mapping would be a guessed join); task 9's `determinism_ok` half marked done (it
  already ships as a structured cell field), repeat-count half deferred to the harness.
- **Curated-table completeness** test-enforced both ways (`case_lane_tables_complete`):
  LANE_KIND/LANE_TIMING must cover every AREA_LANES class — a missing row reds, a stale
  row reds.

## Owner constraints (binding for every task below)

1. ~~**Plan-only until the owner greenlights implementation.**~~ **LIFTED 2026-10-02**
   (owner: "no more owner gate, ask claude for decision if has") — implementation decided
   by the Claude verdict round above; the T1–T3 scoping stands.
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

### T1 — computation-only, reflex-site (publish_bench.py free since d750175) — LANDED 2026-10-02

- [x] 1. **Extend the shipped cc layer (do NOT build a second one).** (a) Per-suite cc
      beside accuracy in the suite tables (data may already carry per-suite `cc` in the
      areas block — render it; add nothing if present). (b) A headline chip per lane from
      the existing per-lane `index` (e.g. "cc index 0.61 · 6/9 suites"). (c) Optional skill
      radar mode = the existing cc spokes (likely already the case — verify, don't
      duplicate). No new chance table; `AREA_CHANCE` is the only basis.
      (d) **Below-chance posture — decide and pin.** DECIDED: Option B (keep negatives) +
      the verdict's visibility additions (signed cc in tables/tooltips, `bc-zero` ticks,
      hollow radar rings, smoke arms).
- [x] 2. **Pin the chance basis.** `areas.chance_digest` published + the EDITIONS ledger
      enforced by `edition_guard()` (test arm + production refusal).
- [x] 3. **Zero-fill regression arm.** `case_area_zero_fill_regression` (missing suites
      never fabricate entries; area means skip gaps; coverage counts measured only).
- [x] 4. **Per-lane timing-method disclosure.** `areas.timing` (curated LANE_TIMING +
      measured geomean/counts over the index population, quotable-only) + the page's
      Timing methodology table + the comparability note.
- [x] 5. **Lane kind classification.** `kind` per areas lane block (curated LANE_KIND,
      completeness test-enforced both ways) + chip/legend/timing-table rendering.

### T2 — medium, some cross-repo (file a riir-reflex issue when started)

- [-] 6. **Abstention-reason mining.** DEFERRED to riir-reflex — the harness must record
      the abstain CAUSE per case first (score-gate vs corpus-distance-gate vs
      grammar-invalid); publishing a cause share the harness never recorded would be a
      made-up number. Filed as riir-reflex `.issues/060` (the unblock); publish_bench
      aggregation + page shares land when the harness field exists.
- [x] 7. **Edition label + archived bundles + board-change changelog.** `meta.edition` =
      the EDITION constant, forced by the append-only EDITIONS ledger digest pin (guard on
      both write paths); `data/archive/
      bench-<edition>.json` freezes the OUTGOING edition on a bump (edition-bump-only —
      git history covers per-publish versions, the 2026-10-02 verdict call); curated
      append-only `data/changes.json` (back-filled rows cite SHAs) rendered under Board
      changes.
- [x] 8. **Per-lane detail view** (`bench/?lane=<id>`): the read-only lane profile
      (headline index/coverage/kind/timing + per-suite acc/cc/p50/quotable/det/source_run
      table); never touches the saved lane filter.
- [x] 9. **Determinism disclosure.** `determinism_ok` already ships as a structured cell
      field (the tables' det column reads it) — verified + surfaced in the profile view.
      [-] The repeat COUNT needs a harness-side field results.json does not carry — a
      riir-reflex ask, never synthesized here. (DELIVERED harness-side at reflex
      `95c2dac`: `determinism_n` — the count of cases the repeat check actually
      re-ran; lights up on the next harness run. The site render of it rides the
      next plan touching the det column.)

### T3 — distinctive (our angle; no new models)

- [x] 10. **Efficiency frontier.** cc index vs p50-latency-geomean scatter (log x),
      Pareto rings scoped to equal-coverage groups, partial lanes hollow, not-plotted
      lanes disclosed. Per-MB axis DROPPED (sizes.json keys don't map 1:1 to bench lanes —
      a hand mapping would be a guessed join). Cross-posture comparisons carry the timing
      disclosure from task 4.
- [-] 11. **og.png social card** — optional polish, not landed this pass.

### Read-only follow-ups (no candidates added)

- [x] Distill the index mechanics into this plan.
- [x] Substrate audit — cc/areas/pending/timing-stamp machinery located and cited (this
      revision).
- [x] Check whether laya finished their frozen suite (`?model=laya` on the Space) and if so
      cite its public Decision Index score in the laya lane docs — external context for our laya
      columns. Citation only; no new lanes, no runs. (DONE 2026-10-02: Laya IS on the board —
      Decision Index 0.2.1, frozen 120,340-request suite complete at 0.76 coverage, balanced-skill
      6.04 vs Jev 57.91; cited in bench/index.html's References. The older "16.4" from the
      community discussion was a 0.1-era figure.)
- [-] Community contribution path (accept external lane PRs): NOT planned — our lanes
      require our harness; owner-gated if ever.
- [-] The Instinct (hybrid) lane's latency verdicts: 9/9 cells are UNJUDGED (the lane's
      timing predates the per-cell Issue-021 stamp and never re-ran on a stamped
      posture), so it plots on neither the frontier nor the timing table's geomean
      column — a riir-reflex ask (stamp the hybrid lane's timing), never synthesized
      here. Filed alongside reflex `.issues/060`'s scope when the harness lane lands.
      (MEASURED 2026-10-02: backfill_latency_verdicts.py over BOTH benchmark roots
      resolves 0 — zero instinct docs carry box_state, zero hybrid cells with timing
      live there. The deferral is data-validated: no recorded box_state exists for
      the hybrid lane anywhere; it needs a stamped re-measure, reflex `a7475c7`
      delivered the harness abstain-cause half (issue 060) — the latency re-measure
      stays a GPU/measurement ask, not synthesizable here.)

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

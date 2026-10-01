# Jev Decision Index distill — bench-page improvement plan (plan-only)

**Status:** PLANNED — no implementation (owner call 2026-10-01: plan md only; no new model
candidates larger than laya). Sources read live: the HF Space
(`multimodalart/jev-decision-index`, edition 0.2.1) + its open runner repo
(`apolinario/decision-index`, cloned to `.raw/` and removed after distill — re-clone on
implementation if needed). Complementary sources: Space `README.md`, `methodology.html`
render code, `decision_index/scoring/{index,index02,metrics}.py`, `data/chance-baselines.json`,
`data/index-panel.json`, `docs/format.md`.

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

## What they do (the mechanics worth stealing)

1. **Chance-corrected headline.** `skill = clip((s − r)/(1 − r))` per benchmark (`metrics.py::skill`),
   where `r` is a frozen per-benchmark random baseline. Headline `balanced_skill` = mean of
   area skills; raw accuracy kept visible on model pages; a breadth variant
   (geometric mean `Π(0.1+0.9·K)^(w)`) is computed but hidden. Since 0.2 the headline is
   skill — "0 = random guessing, 100 = perfect" — because raw accuracy across benchmarks with
   different chance rates (1/77 vs 1/2) is not comparable.
2. **Measured, pinned chance baselines.** `chance-baselines.json`: per benchmark
   `{value, label, kind, method}` — "Exact expectation" or Monte Carlo with
   `monte_carlo_standard_error` asserted ≤ 0.001 at scoring time (`index.py:106`). Some
   benchmarks compute chance inline as a macro average over subgroups. Baselines are
   sha256-pinned in the methodology bundle — "a re-run that changes any of them announces
   itself".
3. **Refusal-as-wrong at the metric level + mined causes.** Unanswered = 0 and counts in the
   denominator (`conservative_f1` adds `missing` to the denominator). An
   `answer_gaps.py` pass mines each run's refusal messages into one line per cause; the page
   shows an answered-rate bar + per-cause shares ("why the rest went unanswered"). No
   truncation was applied to make a request fit.
4. **Pending, never zero.** An entrant missing a benchmark is shown as *pending*, not scored
   0; `coverage`/`pending` fields ride every aggregation level (benchmark → area → index).
   Unrun interactive environments get an explicit "provisional lower bound" status. The
   complete-run gate (board requires all 40) is their third-party-entrant rule — ours is
   disclosure, but pending-not-zero in composites applies to us directly.
5. **Area weighting (0.2.1).** `w_c ∝ √n_c` for non-fixed areas, Arts fixed at 0.1;
   gold★ benchmarks weighted 1.2 vs 1.0 inside an area (`index02.py::area_weights/bench_weights`).
6. **Baseline-relative loss rules for specialized benchmarks.** ForecastBench enters as
   `clip((baseline − Brier)/(baseline − best)) · coverage` — 0 at baseline or worse.
7. **Per-engine latency-method disclosure.** A table: "how each engine's request time was
   recorded" — in-process GPU vs hosted HTTP median/p95 — with a comparability note. Two
   clocks are never pooled silently.
8. **Entrant classification.** kind (inference technique / full fine-tune / LoRA / head) +
   architecture + served params (+trained MB) with precedence rules — "whether a number came
   from new weights or from a decoding technique wrapped around a stock checkpoint is a
   different claim".
9. **Auditability per benchmark row.** Subset rule, source revisions, licences, adaptation
   class, comparability note, excluded-questions table (per-reason counts + "deliberately
   kept"), edition notes (limits lifted + rows re-answered, lifts NOT applied, run-to-run
   variation, contamination, board changes with why), a worked example of the whole index
   computation, corpus/panel/baseline sha256 pins, and a reproduce section naming every
   script.
10. **Static-data discipline.** `data/index.json` is the only mutable surface; HTML never
    changes for a data update; editions switch by file copy; old bundles archived
    (`index-v0.1.json`). Social card rendered from live data via headless Chrome.

We already match #10 (publish_bench.py → data/bench.json, HTML renders it) — that is why
these upgrades slot in cleanly.

## Tasks

Sequencing: `scripts/publish_bench.py` is HOT — a sibling session is landing the Issue-058
corpus-reset drop semantics there. T1 tasks all touch it; land them AFTER the sibling's
corpus-reset work merges. Each task keeps the existing gates green (publish self-test
66/66+, chart smoke, pairing gate, bench-page Playwright smoke) and adds its own test arms.

### T1 — computation-only, reflex-site, cheap (land first, post-058)

- [ ] 1. **Chance table + skill layer.** Committed pinned table (`data/chance.json` or a
      pinned const block in publish_bench) with per-suite `{chance, method}`:
      dataset suites = uniform `1/n_labels` (banking77 1/77, massive 1/14, ag_news 1/4,
      emotion 1/6, sst5 1/5, xnli 1/2) with the majority-class alternative recorded as the
      method choice; decision families = the harness's already-measured gold-0 rate.
      publish_bench emits per-cell `skill` + per-lane composite `skill_mean` (mean over
      suites the lane ran). Page: skill column beside accuracy; optional "skill" radar mode;
      a headline chip per lane (skill-based). Never replace accuracy — display both (their
      raw-on-model-page rule).
- [ ] 2. **Pending-not-zero law.** Composites (skill_mean, areas radar) skip suites a lane
      did not run and carry a `pending` count; no zero-fill, ever. Publish self-test arm:
      a lane with 1/9 suites gets skill_mean over 1 suite + pending 8, never a 0-suite mean.
- [ ] 3. **Per-lane timing-method disclosure.** Structured `timing` block per lane in
      bench.json (`{clock: in-process|metal|subprocess-http|subprocess-python,
      posture, box}`) + a methodology table on the bench page ("how each lane's request
      time was recorded") + a comparability note. Data is classification, not measurement —
      consistent with the never-type-a-number law.
- [ ] 4. **Lane kind classification.** `kind` per lane (modelless-in-process / trained-head
      / encoder / http-oracle / python-subprocess / compiled-program) in bench.json + kind
      chips on the page filter bar. Mirrors their entrant-classification rule.

### T2 — medium, some cross-repo (file a riir-reflex issue when started)

- [ ] 5. **Abstention-reason mining.** riir-reflex harness first: record the abstain CAUSE
      per case (score-gate vs corpus-distance-gate vs grammar-invalid). Then publish_bench
      aggregates per suite; page shows answered-rate bar + per-cause shares. This is the
      answer-gaps mechanic applied to our abstention-first-class story — currently we
      publish abstain RATES with no why.
- [ ] 6. **Edition label + archived bundles + board-change changelog.** bench.json gains
      `edition` + `suite_digest` (the corpus BLAKE3 we already pin); each publish archives
      `data/bench-<stamp>.json`; an append-only `changes` list `{date, change, why}`.
      COORDINATE with Issue-058 corpus-reset semantics (sibling) — the reset drop should
      write a changelog row. Old links stay comparable; a re-pin announces itself.
- [ ] 7. **Per-lane detail view** (`bench/?lane=<id>`): full lane profile from existing
      bench.json (suites, accuracy, skill, abstain, latency, provenance, gate verdicts).
      No new data required.
- [ ] 8. **Determinism/run-variation disclosure formalized.** det ✓/✗ + repeat count as a
      structured field per cell (already printed in tables; make it data).

### T3 — distinctive (our angle; no new models)

- [ ] 9. **Efficiency frontier.** Skill score vs p50 latency scatter (+ per-MB from
      sizes.json), Pareto-frontier marked. No leaderboard in the Jev index publishes
      latency-normalized quality — this is where our modelless story wins, using only
      existing lanes. Their two-clocks honesty note applies: cross-posture comparisons
      carry the timing disclosure from task 3.
- [ ] 10. **og.png social card** for the bench page rendered from bench.json via headless
      Chrome (Playwright already in the smoke lane). Optional polish.

### Read-only follow-ups (no candidates added)

- [x] Distill the index mechanics into this plan.
- [ ] Check whether laya finished their frozen suite (`?model=laya` on the Space) and if so
      cite its public Decision Index score in the laya lane docs — external context for our
      laya columns. Citation only; no new lanes, no runs.
- [-] Community contribution path (accept external lane PRs): NOT planned — our lanes
      require our harness; owner-gated if ever.

## Non-goals

- Any new model candidate > laya (421M trained params) — owner constraint above.
- Their complete-run gate as a hard rule (single-operator board; our disclosure + pending
  law covers it).
- News tracker / trending scores — not our site's shape.
- √n area weights and gold★ 1.2 weighting — noted; revisit only if our suite count grows
  well past 15.
- ForecastBench-style loss rules — we run no forecasting suite.

## Verification (when implemented, per task)

- `python3 scripts/test_publish_bench.py` — new arms: skill math (incl. clip bounds),
  pending-not-zero, chance-table coverage vs suites present, kind/timing presence.
- `node scripts/chart_render_smoke.cjs` + `scripts/bench_page_smoke.cjs` — extended for the
  new column/chips/detail view.
- Pairing gate + mirror parity unchanged and green.
- Deploy via `npx wrangler deploy`; live-verify the page.

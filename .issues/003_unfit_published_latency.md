# Issue 003 — 26 published latency cells come from runs that judged their own box unfit

**Status:** RESOLVED 2026-09-30 — unfit cells on the published board: **0**. T1 (m3 modelless re-measure, Benches 076+077) + T2 (carry-suppression) landed 2026-09-28; T3 (the m3-ane re-measure) landed 2026-09-30 — [Bench 098](../../riir-reflex/.benchmarks/098_ane_quotable_rerun.md), unblocked by the ane_prefill sibling WIP clearing + an en-route ANE-lane regression fix (riir-infer `7eae0e7`: the `table_e8` manifest rows from reflex `6535b75` had broken the lane's manifest loader at HEAD since 2026-09-26 — found by the G5-ANE parity gate run before the re-measure, the lane-change law working). All five m3-max-ane cells published quotable at source `2f6b58c` with bit-identical accuracy. T4 (per-cell source stamps) landed 2026-09-27. T5's residual stays a documented defer (the 4090-laya results doc lives on the 4090; those cells read unjudged regardless — no box probes on that host).

## What was measured (2026-09-27)

`scripts/backfill_latency_verdicts.py` matched each published cell's timing
`(host, suite, lane, p50, p99, seconds)` against the 43 `results.json` docs
in riir-reflex `.benchmarks/`, and stamped the SOURCE run's own
`box_state.latency_quotable`:

| verdict | cells |
|---|---|
| quotable | 34 |
| **not quotable** | **26** |
| unjudged (host has no box probes: 4090) | 62 |
| unknown (source doc not in the repos) | 22 |

The 26:
- **m3-max-metal · modelless, all 14 suites.** Source: riir-reflex
  `041_t11_m3_republish` (`0b6a7c4`, 2026-09-25), load 3.58 → **11.7** at the
  end. Published before the publish wall existed, and LANE_CARRY
  (Issue 032) has carried that timing forward through every update since.
  This is the timing behind the home TL;DR ("typical decision … N× faster")
  and the arena's "Reflex vs laya, speed" row.
- **m3-max-ane · laya:english, 12 suites.** Source: `001_phase1_tables_ane`
  (`afacc3a`, 2026-09-24), load 7.08 / 5.92.

Disclosure landed: † on each table cell, a caveat beside the home and arena
speed claims (the arena rows render `=` rather than `✓`), and the provenance
lines now name the newest run, not `meta` (which is Bench 001's).

## Tasks

- [x] T1 — re-measure the m3 modelless lane's latency on a box that passes
  `riir-reflex/scripts/bench_preflight.sh`, at the published armed posture
  (accuracy must stay byte-identical, or the cross-host drift gate refuses).
  LANDED 2026-09-28: benches 076 (m3, quotable both spans) + 077 (4090-windows,
  the cross-host half the drift gate demanded — 15/15 bit-identical at HEAD
  `c464a8a` after fixing TWO dataset drifts on the 4090: xnli train pages
  missing, massive train pool a truncated 26-of-40 old fetch). The accuracy
  did NOT stay byte-identical — the engine itself moved at HEAD (072-era
  ladder changes), so the publish carries the HEAD truth on BOTH hosts with
  per-cell source stamps; deltas disclosed in the bench record. All 15 m3
  modelless cells now quotable; unfit count 26 → 11 (all T3's ANE rows).
  ⚠ Blocked 2026-09-27: (a) the published modelless run's `results.json`
  (`6199e5e`, 03:27:37Z) is in no repo, so its exact posture flags aren't
  recorded; (b) a concurrent riir-reflex session is changing the modelless
  engine's defaults (Issue 038 cascade margin → 0.16), so a HEAD re-measure
  would time a different engine. **Both blockers cleared 2026-09-28** —
  (b) landed 09-27 (the margin promotion is the published engine now) and
  T2's `carry_beats_incumbent` is live, so a fresh quotable run replaces
  the carried unfit timing at the next publish. T1 = full modelless
  harness run at HEAD under `scripts/bench_preflight.sh`, alone on the
  box, then republish. Queued 2026-09-28: preflight REFUSED at load 9.5
  (sibling builds); run when load < 6.0.
- [x] T2 — a publish path that lets a QUOTABLE run replace a carried lane's
  timing. LANE_CARRY exists so an update never swaps validated timing for
  invalidated timing. Here the incumbent is the invalidated one, so carrying
  it defeats the law's own purpose. LANDED 2026-09-27: `carry_beats_incumbent`
  in `scripts/publish_bench.py` — the carry is SUPPRESSED exactly when the
  incumbent lane's verdict is False and the update's own verdict is True
  (narrow on purpose: absent/None stays a carry; a False update stays the
  wall's business), with a loud per-slot disclosure. `_latency_slots` follows
  the same predicate, so a suppressed carry's own timing is wall-JUDGED, not
  silently exempt. Verified: 44/44 self-test cases (4 new: quotable-replaces-
  unfit, unquotable-still-carried, unjudged-still-carried, wall-judges);
  dry-run against the REAL `data/bench.json` + a synthetic quotable m3 doc
  rc=0 — all 13 unfit row-level m3 modelless cells flip to fresh quotable
  own-timing, the validated-True incumbent stays carried (Issue-032 law
  intact), 4090 unjudged carries untouched. The real remedy remains T1.
- [x] T3 — re-measure or drop the m3-max-ane laya:english timing (ANE lane).
  **DONE 2026-09-30 (Bench 098)**: re-measured under a passing preflight
  (`PROVENANCE: power=AC Power load=5.24 swap=388.06M canary=117.1us/best5
  powermode=2(high)`; spans 5.04/4.64, quotable both) at HEAD `2f6b58c`, the
  five published suites exactly (`--suites
  ag_news,emotion,sst5,prompt_injections,xnli_en`). Accuracy bit-identical
  on all five; p50 within 1 ms; prompt_injections' 652 ms cold-compile p99
  gone (warm cache). Published via the update path +
  `PUBLISH_BENCH_LANES=laya` (the modelless byproduct dropped loudly — the
  paw-lane law); `carry_beats_incumbent` replaced the unfit incumbent.
  En-route (recorded in the bench doc): the ANE lane was BROKEN at HEAD
  since 2026-09-26 — reflex `6535b75`'s `table_e8` manifest rows vs the
  artifact-schema loader; fixed riir-infer `7eae0e7`; G5-ANE parity green
  after (231 s). The earlier defer's stale premises, for the record: the
  ane_prefill WIP landed (tree clean), so (a) cleared; the drop option
  stayed owner-gated and is now moot — the lane re-measured clean.
- [x] T4 — `lane_sources` is keyed per (host, lane), not per suite. A
  one-suite update re-labels the source on every suite: the Bench 067
  typed-only update claims `5ada17a` for 15 suites' laya:english cells, 14 of
  which came from 062. Pairing is unaffected today (every such cell carries a
  `cases_digest`, which outranks `lane_sources`), but any fallback that reads
  `lane_sources` names the wrong run. LANDED 2026-09-27: run identity moved
  ONTO THE CELL (the verdict's precedent) — `stamp_cell` writes
  `cell.source_run {git_sha, date_utc}` on every updated lane, and
  `lane_identity` precedence is digest > cell stamp > lane_sources (legacy
  tier for pre-stamp cells) > doc fallback. `lane_sources` itself stays on
  the host row, demoted to a per-class summary (it feeds
  `bench_provenance.js latestRun`, whose max-over-date is unaffected by
  over-labeling). Self-test 47/47 (3 new cases: per-suite stamp vs relabeled
  summary + digest precedence; re-merge survival + digest outranks stamp;
  pre-stamp legacy fallback intact).
- [-] T5 — the 22 unknown cells (4090 laya `634093f`, hybrid `0959928`):
  their source docs live on the 4090 / in riir-instinct outputs not in a repo.
  Resolve when those docs are available; 4090 cells would read unjudged anyway.
  **PARTIALLY RESOLVED 2026-09-29 (mapping, not re-judgement):** both SHAs
  located in local history — hybrid `0959928` = riir-instinct Bench 002
  ("the aligned Bench-052-protocol read + the reflex-site hybrid lane
  publish"; the outputs ARE in a repo: `riir-instinct
  .benchmarks/002_hybrid_052_protocol/` + the `hybrid_lane_doc.json` built
  from it — the "not in a repo" premise is void for the hybrid half);
  4090-laya `634093f` = riir-reflex HEAD at run time (a docs commit —
  "AGENTS.md documents the harness --distill teacher pass"; the results
  doc itself still lives on the 4090). The 4090 cells stay UNJUDGED (no
  box probes on that host — unchanged); the hybrid cells' provenance is
  now quotable as instinct Bench 002 / `0959928` without any fetch.

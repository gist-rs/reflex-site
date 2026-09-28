# Issue 003 — 26 published latency cells come from runs that judged their own box unfit

**Status:** OPEN — disclosed on every surface (reflex-site commit landing this file); re-measure + two provenance defects outstanding.

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

- [ ] T1 — re-measure the m3 modelless lane's latency on a box that passes
  `riir-reflex/scripts/bench_preflight.sh`, at the published armed posture
  (accuracy must stay byte-identical, or the cross-host drift gate refuses).
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
- [-] T3 — re-measure or drop the m3-max-ane laya:english timing (ANE lane).
  Deferred 2026-09-28: the ANE lane's substrate (`riir-infer` `ane_prefill`)
  is sibling-session WIP right now (143 dirty files), so a re-measure would
  time an in-flight tree; and the drop option is a product call on a
  closed-negative lane (riir-ai: ANE hybrid default-off/closed-negative) —
  owner-gated. Re-measure after the ane_prefill work lands, under preflight.
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
- [ ] T5 — the 22 unknown cells (4090 laya `634093f`, hybrid `0959928`):
  their source docs live on the 4090 / in riir-instinct outputs not in a repo.
  Resolve when those docs are available; 4090 cells would read unjudged anyway.

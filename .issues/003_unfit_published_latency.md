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
  would time a different engine. Do T1 as part of that lane's next publish,
  under preflight, alone on the box. T2 must land first or the carry
  discards the fresh timing.
- [ ] T2 — a publish path that lets a QUOTABLE run replace a carried lane's
  timing. LANE_CARRY exists so an update never swaps validated timing for
  invalidated timing. Here the incumbent is the invalidated one, so carrying
  it defeats the law's own purpose. Proposed: carry only while the incumbent
  is not `latency_quotable: false`, or when the update is not `true`.
  The wall already refuses an unfit update.
- [ ] T3 — re-measure or drop the m3-max-ane laya:english timing (ANE lane).
- [ ] T4 — `lane_sources` is keyed per (host, lane), not per suite. A
  one-suite update re-labels the source on every suite: the Bench 067
  typed-only update claims `5ada17a` for 15 suites' laya:english cells, 14 of
  which came from 062. Pairing is unaffected today (every such cell carries a
  `cases_digest`, which outranks `lane_sources`), but any fallback that reads
  `lane_sources` names the wrong run. Fix: key per suite, or move run
  identity onto the cell as the verdict now is.
- [ ] T5 — the 22 unknown cells (4090 laya `634093f`, hybrid `0959928`):
  their source docs live on the 4090 / in riir-instinct outputs not in a repo.
  Resolve when those docs are available; 4090 cells would read unjudged anyway.

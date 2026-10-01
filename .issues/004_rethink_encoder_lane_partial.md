# Issue 004 — Rethink lane is partial on the site: 1/9 benchmarks, radar row incomplete

**Status:** OPEN — blocked on encoder serving results (riir-instinct issue 014 D1's trigger: a real GPU serving deploy). The naming half is RESOLVED (2026-10-01, owner call): the lane display spellings are the qualifier-free product names — `Rethink` (encoder arm), `Instinct` (hybrid; stays Instinct, NOT "Rethink (hybrid)" — the 051-Phase-1 hybrid rebrand is superseded by that call).

## What ships today (the graceful partial)

The `/bench/` Areas & index radar (2026-09-30) renders the Rethink
lane as a PARTIAL series, disclosed everywhere it appears:

- the lane renamed per the riir-instinct naming law (riir-ai Proposal 051),
  then made qualifier-free per the owner call 2026-10-01:
  `Instinct (encoder)` → `Rethink (encoder)` → **`Rethink`** — display
  spelling only; the lane key (`encoder`) never changed, and every legacy
  spelling maps on re-publish (`publish_bench.py` LANE_DISPLAY dual-spelling
  law); what the name means is disclosed in the page's Notes/FAQ/References
  instead of carried in the lane name;
- the rollup block (`data/bench.json` `areas`) carries the lane at coverage
  **1/9** (`complete: false`) — the index shown is the mean over what was
  MEASURED (sst5), never padded with zeros;
- the radar draws only measured spokes (gaps are unmeasured, never zero);
- both legend rows mark it `partial — results pending`, and the bench
  page's Instinct section names the rename + the pending results;
- the home min–avg–max range chart renders the single-suite tick (no band).

## Why blocked

1. **Results do not exist.** The encoder class is REFUSED at serve
   (riir-instinct issue 014 C1: 14.7 ms/row vs the ~0.3 ms bar; owner GO
   refused per-request encoder inference at the CPU-only deploy shape).
   Only the sst5 arm was measured (Bench 029, record-only, `serve: ✗`).
   The lane fills when a GPU serving deploy exists (issue 014 D1's
   trigger — the production host is DESIGNATED, soak lane Issue 1002).
2. ~~The full rename is Phase 1 of riir-ai Proposal 051~~ RESOLVED
   2026-10-01 (owner call): the hybrid lane display is **`Instinct`** — the
   qualifier dropped, the hybrid arm NOT rebranded to "Rethink (hybrid)";
   every legacy spelling maps in LANE_DISPLAY, and the vocabulary lives in
   the page's Notes/FAQ/References.

## Definition of done

- [x] The naming question is closed (owner call 2026-10-01): qualifier-free
      product spellings on both lanes (`Instinct` / `Rethink`), legacy
      spellings mapped, vocabulary disclosed in Notes + FAQ + References.
- [ ] An encoder serving deploy exists (riir-instinct issue 014 D1) and a
      harness run covers the encoder lane on all nine area suites →
      re-publish; the `areas` lane flips `complete: true`, coverage 9/9,
      and the radar draws the full polygon.
- [ ] `scripts/bench_page_smoke.cjs` partial-disclosure arms re-pinned to
      the complete posture (they red on purpose until then — they pin the
      CURRENT truth, 1/9).

## References

- riir-ai Proposal 051 — the Rethink product naming (the naming law lives
  in riir-instinct AGENTS.md §Naming law; recorded fallback riir-cogito).
- riir-instinct issue 014 (C1 measured negative at serve, D1 promotion
  trigger) — the results blocker.
- reflex-site .issues/003 lineage — the lane-pairing population law this
  lane's cells already satisfy.

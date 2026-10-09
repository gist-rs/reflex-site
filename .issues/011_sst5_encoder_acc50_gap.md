# Issue 011 — sst5's Rethink record cell carries no acc@50% coverage (the record predates the per-row freeze)

**Status:** OPEN — 2026-10-09 (filed with the 2026-10-09 encoder-metrics stamp: typed_decisions/ag_news/xnli_en were stamped from their frozen per-row data; sst5 cannot be)

## The finding

The 2026-10-09 user report: on the acc@50% coverage metric the Rethink row
read `5/9` while the accuracy metric had data everywhere. Root cause: the
tier-fallback cells (the serving arm's numbers) always carried
`hard.acc_at_50_coverage`, but the encoder arm's own record cells did not —
so the metric inverted Rethink's true coverage (its own measured suites were
exactly the ones missing).

Three of four record cells were stampable from their frozen per-row data
(`encoder_arm.confs`/`.correct` in the arena records) — landed 2026-10-09:
- typed_decisions — rethink bench 061 doc ← instinct 041 predictions
  (cross-record join, digest-pinned `fnv1a64-6e37760ee2a5b6c9`)
- ag_news — instinct 037 (same record)
- xnli_en — instinct 036 (same record)

## The gap that remains

- [ ] sst5 — rethink `.benchmarks/029_sst5_encoder_c1/predictions.json`
  predates the per-row freeze: its `encoder_arm` carries aggregates only
  (accuracy/latency/T2), NO `confs`/`correct`. The stamp tool correctly
  refuses it. The field needs an ENCODER RE-READ through the rethink lane
  (the moat owns the encoder arm) on the m3 at metal — same population
  (digest-pinned), third-posture cell-identical law — then re-stamp +
  lane-scoped republish (`PUBLISH_BENCH_LANES=encoder`). Until then the
  board honestly renders "no acc@50% coverage value" on that one cell
  (8/9 on the shared-scope summary).
- [ ] (off-board, low) thai_wisesight / thai_sib200 ENC-ref cells — same
  pre-freeze era; not part of the 9-suite shared scope, so they move no
  count. Fold into the same re-read if the thai lane ever re-runs.

## Tooling note

`riir-instinct/scripts/stamp_doc_conf_metrics.py` is the stamp (gated:
n-identity + accuracy reproduction + cross-record digest pin + refuse-if-
present; imports ece_of/acc_at_50_of from build_hybrid_doc — one law). The
acc@50 law itself was hoisted to `acc_at_50_of` in build_hybrid_doc.py
(was two inline copies).

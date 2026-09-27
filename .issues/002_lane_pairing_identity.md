# Issue 002 — the TL;DR counts cross-sample lane pairs as parity failures; pair on population identity

**Status:** IN PROGRESS — pairing law landing same day (see riir-reflex `.issues/040` for the full root-cause record).

## Symptom

`assets/arena_tldr.js` has read `Rust vs Python laya, accuracy: identical
on 11/14` since the 09-27 Bench-052 republish (was 15/15). The rust laya
lanes moved to the 052 stratified sample (`b1aee72`) while the py lanes
survived in place on the first-N sample (`9dbdca5`) — the card counted
3 suites answered from DIFFERENT question sets as "not identical".

## Guard

*Lanes are comparable on a suite iff their case populations are identical;
mismatched pairs are a third, disclosed state — never pooled into
"identical" or "not identical".*

- [x] **T1 — pair on identity.** `arena_tldr.js` compares the per-lane
      source identity: `cases_digest` when both cells carry one (T2 stamp),
      else the `lane_sources` run id for `laya:<ck>` vs `laya:py/<ck>`.
      Match → counted; mismatch → its own row state
      ("different sample — not comparable (rust <sha> vs py <sha>)").
- [x] **T2 — publisher stamps cells.** `publish_bench.py` writes each lane
      cell's source run `cases_digest` when the source results.json has it
      (riir-reflex runner now emits it; older runs disclose without it).
- [x] **T3 — fail loud at publish.** `scripts/check_lane_pairing.py`:
      after every publish, list unacknowledged cross-sample pairs; exit 1
      unless `PUBLISH_ALLOW_SAMPLE_MISMATCH` names them. Wired into
      `republish_bench.sh`.
- [x] **T4 — pinned.** `test_publish_bench.py` arms: mismatched identity
      is disclosed and excluded from the count; a stale ack reds.

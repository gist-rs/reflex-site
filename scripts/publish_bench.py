#!/usr/bin/env python3
"""Publish the harness results to the arena site (Plan 606 T3.2; Issue 018 T5
extends it to the per-host fleet merge; Issue 023 T5 extends it to ordered
lane-updates).

Copies riir-reflex's results docs into the site repo's `data/bench.json`
after SANITIZING machine-local fields (the leak-scan discipline applied to
the site: the raw file carries the local datasets path, e.g.
/Users/<user>/... — that never leaves the box).

Issue 018 T5 — the multi-host merge (the healqual fleet-join precedent):
bench data from additional hosts is MERGED, never overwritten. The primary
run (first input) keeps its exact published shape; every extra run
contributes per-suite `extra_host_lanes` plus one `meta.hosts` row. The
modelless lane's cross-host bit-identity claim is MECHANIZED here: any
modelless accuracy drift between hosts in the FINAL merged state is a
REFUSAL (the stop-and-file gate of Issue 018 T7 — never publish).

Issue 023 T5 — ordered lane-updates: the primary may itself be a
previously-published `bench.json` (it carries meta.host + suites with
extra_host_lanes already), and a later doc whose host was already seen
UPDATES only the lanes it declares — a modelless-only post-fix re-run
replaces the host's modelless lane and leaves its laya lanes untouched.
The host's top-level row keeps the ORIGINAL run's facts (a modelless doc's
`laya_feature: false` must not overwrite the full run's `true`) and gains
`lane_sources` per updated lane (git_sha + date_utc of the update run) —
per-lane provenance is disclosed, never blended.

Issue 034 (2026-09-26, MEASURED both paths): the lane WIPE this script can
inflict lives on the FRESH-DOCS path — `publish_bench.py <doc1> <doc2> <site>`
replaces the published table wholesale, so lanes the docs do not carry (the
comparison lanes, the ANE rows, laya checkpoints) vanish silently. The UPDATE
path — the CURRENT data/bench.json passed as the PRIMARY — preserves every
host container in place (host_lane_entry's setdefault returns the existing
dict for a known host); only a NEW host gets a fresh container. The wipe is
walled in main(): a fresh-docs publish whose output would DROP published lane
slots refuses (exit 1) naming the dropped slots; PUBLISH_BENCH_FULL_REPLACE=1
acknowledges a deliberate wholesale replacement with a loud disclosure. The
update path is never walled — it cannot drop lanes by construction.

Usage:
    python3 publish_bench.py <results-primary.json> [results-extra.json ...] <site-repo-root>
    python3 publish_bench.py --rederive <published-bench.json>

--rederive (plan 001, 2026-10-02): rebuild ONLY the derived blocks of an
already-published bench.json (pairings, areas — incl. the areas v3 timing
and lane-kind blocks — and the edition stamp) without the raw harness docs,
refusing to write unless every suite's measurement cells stay byte-identical.
The ordinary path needs results.json inputs, so "re-run the publisher" is
neither cheap nor guaranteed to reproduce the same file when newer runs
exist; this is the sanctioned refresh for derived-block-only changes.

PUBLISH_BENCH_LANES="paw,paw_local" (optional, extras only) restricts an
update to the named lane classes — every other lane the extras declare is
DROPPED with a loud disclosure (reflex .issues/033: a comparison-lane doc's
by-product modelless control must never overwrite the published same-law
modelless cells, nor trip the cross-host drift gate over a different
posture). A class may carry the ":acc-only" suffix (e.g. "paw:acc-only"):
the lane publishes its ACCURACY columns but its five latency fields are
stripped — for a run whose box state made latency NOT QUOTABLE (the
Issue-021 preflight law; the source doc keeps its measured cells and its
disclosure). Unknown names refuse; the primary is never filtered.

PUBLISH_BENCH_ALLOW_UNQUOTABLE="<host>[,<host>]" (2026-09-27, the Issue-021
publish wall): a doc whose own meta.box_state judged its latency NOT
QUOTABLE refuses (exit 1) if it would publish any of its own timing cells —
an :acc-only lane, a carried lane, or a device-variant skip is exempt. The
env acknowledges by host (a stale ack refuses too). UNJUDGED docs (no
readable box_state — the 4090 harness has no probes) publish with a loud
note. Every lane cell carries `latency_quotable` (true / false / null) from
the run its TIMING came from — stamped at merge, copied with the timing by
LANE_CARRY (except when the incumbent's verdict is False and the update's
own is True: the Issue-003 T2 suppression lets the quotable run replace an
unfit incumbent's carried timing), stripped by :acc-only; absent = unknown. meta.box_state is the
table's ORIGINAL run's and describes no later-updated cell.

PUBLISH_BENCH_POPULATION_RESET="<suite>[,<suite>]" (2026-09-27, the reflex
Issue 044 T4 companion of the frozen code_fixtures fixture): an update doc
whose suite row answers a DIFFERENT question set than the served row is
excluded by the population guard — by design, because an accidental
cross-population merge would publish numbers over different questions under
one heading. A DELIBERATE re-pin (a committed fixture change, both lanes
re-run on the new population) names the suite here: the row's population
facts update from the doc, every OTHER host's extra_host_lanes for the suite
are DROPPED (they measured the old questions — keeping them would mix
populations under one heading), the LANE_CARRY latency exemption does not
apply (the incumbent's timing measured the old questions), and the update's
own lanes land normally with lane_sources refreshed. A stale ack refuses: a
named suite the extras do not carry, or one whose population already
matches, exits 1 — an acknowledgement cannot outlive the population change
it was written for.

PUBLISH_BENCH_CORPUS_RESET="<suite>[,<suite>]" (2026-09-30, reflex Issue 057,
the corpus-axis companion of the population reset): a suite whose CORPUS
pool changed without its question set changing (the typed_decisions
800→1200-row lift — the exact specimen) has no population mismatch for the
reset above, so LANE_CARRY would carry the incumbent timing forever. The
carry law gains a corpus-mismatch exemption (both cells carry
`corpus_digest` and they differ — carrying would re-attach stale timing by
construction; the `corpus_digest` stamp rides the modelless CELL, the
cases_digest pattern, and is hashed by the harness over the pool it
ACTUALLY timed, reflex `7e03117`). Missing digests on either side are NOT
an exemption (adoption-stable — the served incumbent predates the stamp),
which is what this one-time ack retires: a named suite is exempt from the
carry regardless of digest state, and the ack REFUSES stale — a named suite
absent from the publish, one whose update cell carries no corpus_digest, or
one whose digest already EQUALS the incumbent's exits 1. The republish
comes from a NEW post-landing run on a fit box.

Docs apply in argv order. The first doc's suites shape the tables (run the
superset run first). A previously-published data/bench.json is a valid
primary for a re-publish (its meta.hosts seed the seen-host set) — and since
Issue 034 it is the SAFE default for every re-publish: the docs land as
lane-scoped updates and nothing not carried by them can disappear.

Display host spellings (2026-09-25): HOST_DISPLAY renames machine labels at
the LOAD boundary — `m3` → `m3-max-metal`, `m3-ane` → `m3-max-ane`,
`4090-windows` → `4090-win` —
the same law as LANE_DISPLAY (raw results keep their REFLEX_BENCH_HOST
names; the rename happens here, the one place every published byte passes
through, so a re-publish can never drift from the page).

Device-variant hosts (2026-09-25): DEVICE_VARIANT_HOSTS names a host that
is the SAME physical machine as another published host, differing only in
laya serving device (`m3-max-ane` = the m3 baseline box with the encoder on
the Apple Neural Engine). Only the device-sensitive lanes (laya) merge from
such a host — the modelless lane is pure-CPU and device-independent, so its
row under the device tag is a tagged duplicate of the base machine's own
row (the "KatGPT · modelless @m3-max-ane" confusion), and the comparison
lanes have no device-variant posture. Skips are disclosed on stderr, and a
previously-published bench.json re-published as primary is CLEANED of the
old-shape rows (a re-publish can only converge on the law, never preserve
a violation).

The bench page renders whatever bench.json carries — regenerating the site
tables is: re-run the harness in riir-reflex, then run this script, commit,
deploy. A hand-typed number on the site is a defect by definition.

The area rollups (the /bench/ radar cards, 2026-09-30): compute_areas()
emits d["areas"] — per-lane chance-corrected scores rolled into four
curated areas (Language & intent, Sentiment, Reasoning & safety, Decisions
& code) plus the per-benchmark grid, so the page renders the rollups and
never re-derives them (the compute_pairings precedent). The chances are
dataset facts read off the harness's own option construction; the rollup
covers EVERY filterable lane (the product lanes Reflex / Instinct / Rethink
/ laya (rust) plus the comparison lanes — a lane the primary host never
ran rolls up host-tagged from its serving host) and discloses per-lane
coverage. A PRODUCT lane's missing suite draws its SERVED answer: the
tier-fallback cell apply_fallback_cells derived rolls up MARKED
(fallback + served_by, the displaced record's own read beside it) and
the page draws it as a triangle — so a partial lane's index averages
its DRAWN spokes (own + fallback) while coverage counts only the lane's
own measured suites, fallback_suites names the rest, and a suite
nothing measurable serves stays a gap (never padded, never zero).
"""

import copy
import hashlib
import json
import math
import os
import sys
from pathlib import Path

# Console-safe streams (the console_encoding discipline): this script's
# refusal messages carry a non-ASCII stop glyph and must die with NO verdict
# replaced by a codec traceback on a cp874-class console. Backslashreplace
# keeps every byte of the message readable.
for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

# meta keys that are machine-local or noise for the public page.
DROP_META_KEYS = ("datasets_dir",)

# Per-host run facts kept in meta.hosts (the fleet-join row shape — the
# full protocol strings stay on the primary meta only; they are shared
# protocol, not per-host fact, except the device/lane posture ones below).
HOST_META_KEYS = (
    "host",
    "date_utc",
    "git_sha",
    "profile",
    "laya_feature",
    "laya_device",
    "laya_python_lane",
    "laya_max_questions",
    "corpus_cap_mode",
)

# meta keys recorded per UPDATED lane on a host row (lane_sources) — the
# update run's provenance for exactly the lanes it contributed. Per-SUITE
# identity rides the cell's own `source_run` stamp instead (Issue-003 T4):
# lane_sources is keyed per (host, lane CLASS), so a one-suite update
# re-labels every suite's entry there — a summary, never a per-suite fact.
LANE_SOURCE_KEYS = ("git_sha", "date_utc")

# Modelless lane-fact postures (Issue 032): refreshed on a host row when an
# update contributes the MODELLESS lane — head_posture names the fitted-head
# posture ("off"/absent = the published baseline), latency_carried discloses
# that the lane's latency cells were CARRIED from an earlier run while the
# accuracy is fresh (the 2026-09-26 accuracy-first landing; the lane dict's
# latency_provenance field names the source run). The laya_python_lane /
# laya_device class: a LANE fact, never a run fact.
LANE_FACT_META_KEYS = ("head_posture", "latency_carried")

# The LANE-CARRY law (Issue 032, owner call 2026-09-26): LANE_CARRY.latency
# names the lane dicts whose TIMING cells are carried from the host's
# incumbent run while the accuracy columns are fresh. Applied after the
# merge lands: an updated lane of a carried class has its five latency
# fields replaced by the primary's (or its own extra_host_lanes') values
# and gains `latency_provenance` naming that source run. Without this law
# a lane-scoped update would silently replace validated latency cells with
# box-invalidated ones (the accuracy bit-identity gate cannot see timing).
# Issue-003 T2 (2026-09-27): the law is DIRECTIONAL — it must never serve
# the opposite trade, keeping an INVALIDATED incumbent's timing over a
# fresh QUOTABLE update's. When the incumbent lane's verdict is False and
# the update's own verdict is True, the carry is suppressed and the
# update's own timing publishes (carry_beats_incumbent, applied in
# apply_lane_carry; the publish-wall exemption in _latency_slots follows
# the same predicate, because a suppressed carry publishes the update's
# own timing and the wall must judge it).
LANE_CARRY = {"latency": ("modelless",)}

# The five timing fields a carried lane inherits from its incumbent (the
# raw LaneResult's latency block; `seconds` is the suite wall time).
LANE_LATENCY_FIELDS = (
    "latency_p50_ms", "latency_p99_ms", "latency_extremes",
    "latency_tail_support", "seconds",
)

# Display-only lane spellings. The canonical results.json keeps the machine
# fields ("laya-riir" / "laya-python" / "modelless" / "clm" / "gliner" /
# "agentjev") — the
# rename happens HERE, the one place every published byte passes through, so
# a re-publish can never drift from the page.
LANE_DISPLAY = {
    "laya-riir": "laya (rust)",
    "laya-python": "laya (python)",
    "modelless": "KatGPT",
    "clm": "clm (reference)",
    "gliner": "gliner (reference)",
    "agentjev": "agentjev (reference)",
    "bekko": "bekko (reference)",
    "hybrid": "Instinct",
    # The qualifier-free spellings are the product names (owner call,
    # 2026-10-01: the (hybrid)/(encoder) qualifiers were noise on the filter
    # bar and the radar legends — what each name MEANS is disclosed in the
    # page's Notes + FAQ + References instead). A previously-published
    # bench.json carries an OLD spelling; re-publishing it as primary must
    # land the current one (the dual-spelling law).
    "instinct (hybrid)": "Instinct",
    "Instinct (hybrid)": "Instinct",
    # riir-instinct issue 014 C1: the encoder-feature arm — a
    # RECORD-ONLY lane (serve: ✗, the encoder class is refused at
    # serve). A SEPARATE lane from the hybrid cell: the hybrid cell keeps
    # publishing the SERVING arm; this publishes the measured-but-refused
    # read with its latency class (the refusal's ground).
    # Display spelling per the riir-instinct naming law (riir-ai Proposal
    # 051): the encoder arm's product name is "Rethink" — qualifier-free
    # like Instinct (owner call 2026-10-01). The lane KEY ("encoder") never
    # changes — only this display spelling does — and every legacy spelling
    # maps too, so re-publishing a bench.json that carries an old name
    # lands the current one (the dual-spelling law). The lane's RESULTS are
    # still 1/9 suites (record-only).
    "encoder": "Rethink",
    "instinct (encoder)": "Rethink",
    "Instinct (encoder)": "Rethink",
    "Rethink (encoder)": "Rethink",
    # reflex .issues/033: the ProgramAsWeights comparison lanes. "paw" is
    # their HOSTED REST posture (compile-a-classifier, server-side),
    # "paw-local" their LOCAL llama.cpp runtime — the posture axis is the
    # lane's payload, so the display names carry it.
    "paw": "paw (hosted)",
    "paw-local": "paw (local)",
    # reflex Plan 003 T2 (Bench 074): the OpenThai-SystemOne comparison
    # lane — their FastAPI service answers the same decision questions
    # (the agentjev/clm family law: their stack serves, our Rust
    # measures), so the display name carries the (reference) qualifier.
    "openthai": "openthai (reference)",
}

# The hand-maintained DISCLOSURE table (2026-10-02, the full-coverage
# serving rewrite): per-suite per-lane notes that ride a product lane's
# FALLBACK CELL — apply_fallback_cells consumes the note into the cell
# (the served answer + why the lane shows a fallback tier there), so the
# reader sees the RESULT first and the reason beside it (owner directive:
# the chart reflects the served product; a fallback is noted, never a
# hole). A note left on a suite+lane with NO fallback derivation possible
# (no modelless cell either) renders via bench-charts.js's noneBar as
# before. Keys are SUITE names and RENDERER lane keys ("instinct" = the
# hybrid lane, "instinct-encoder" = Rethink). Unknown suite names REFUSE
# (a typo must never publish nothing); a note naming a suite+lane that
# HAS a real (non-fallback) cell is dropped with a loud note.
DISCLOSURES = {
    "emotion": {
        "instinct-encoder": (
            "encoder head screened — no head earned: 6 gold-only fits (the "
            "5-seed T7 sweep + 1 fresh seed) all refused on holdout; the "
            "encoder reference reads 0.5950 vs the incumbent 0.8850 "
            "(instinct issue 016 T7/T8) — the served answer is the cell "
            "shown"
        ),
    },
    "code_fixtures": {
        "instinct-encoder": (
            "encoder head dead by law — the encoder reference reads "
            "0.3575, 26.7 pt under the bar, and the class's measured "
            "head-lift ceiling (+14.7 pt) cannot close it (riir-train "
            "issue 600 T5) — the served answer is the cell shown"
        ),
    },
}
# Suite retirement (owner call, 2026-10-02): the six harness_* decision-point
# families are REMOVED from the board everywhere — the modelless engine reads
# AT CHANCE on them at the honest wide-eval populations (~0.22–0.31 against
# ~0.2–0.33 random-pick; the old small-n template-shared rows read 0.56–0.92
# and were the inflation), and the suites are deleted from the reflex harness
# itself (that removal lands upstream — this repo only stops publishing
# them). A suite named here is dropped at the LOAD boundary of every publish
# path (fresh docs, lane-scoped updates, --rederive), so no older results
# doc can ever re-grow a retired row; any meta.divergences line naming one
# goes with it. The /families/ quarantined page and its own data file are
# a separate surface and are deliberately untouched (the quarantine gate
# below forbids this script from ever naming or ingesting either).
RETIRED_SUITES = (
    "harness_visibility",
    "harness_permissions",
    "harness_tool_fit",
    "harness_routing",
    "harness_sensitivity",
    "harness_cache_reuse",
)
RETIRED = frozenset(RETIRED_SUITES)


def drop_retired_suites(d):
    """Drop the retired suites from a loaded doc — loud per row, idempotent.

    Runs on EVERY loaded doc (the primary, every extra, a --rederive input)
    BEFORE any merge/guard arithmetic, so a retired name cannot reach the
    merged doc, the population guards, or the derived blocks. The divergences
    list is scrubbed IN PLACE (merge shallow-copies the meta dict, so a
    reassignment would not be seen through the copy). Returns the dropped
    suite names."""
    dropped = []
    suites = d.get("suites") or []
    kept = [s for s in suites if s.get("name") not in RETIRED]
    if len(kept) != len(suites):
        dropped = [s["name"] for s in suites if s.get("name") in RETIRED]
        d["suites"] = kept
    dropped_divs = 0
    divs = (d.get("meta") or {}).get("divergences")
    if isinstance(divs, list):
        kept_divs = [line for line in divs
                     if not (isinstance(line, str)
                             and any(n in line for n in RETIRED_SUITES))]
        if len(kept_divs) != len(divs):
            dropped_divs = len(divs) - len(kept_divs)
            divs[:] = kept_divs
    if dropped or dropped_divs:
        print(
            "note: retired suites dropped (owner call 2026-10-02, "
            "at-chance verdict): " + (", ".join(dropped) or "(none)")
            + (f"; {dropped_divs} meta.divergences line(s) naming them"
               if dropped_divs else ""),
            file=sys.stderr,
        )
    return dropped

# Both spellings of the python lane: the machine field in a fresh harness
# doc, and the display name in a previously-published bench.json.
PYTHON_LANE_SPELLINGS = ("laya-python", LANE_DISPLAY["laya-python"])

# Display-only host spellings (the same law as LANE_DISPLAY: the canonical
# results keep the REFLEX_BENCH_HOST machine labels — the rename happens
# HERE, the one place every published byte passes through, so a re-publish
# can never drift from the page). Applied at the LOAD boundary: meta.host,
# every meta.hosts row, and every extra_host_lanes key — so merge keys,
# the drift gate and the output all see one spelling, and re-publishing a
# renamed bench.json as primary is a no-op (idempotent by construction).
HOST_DISPLAY = {
    # The Metal baseline box carries its chip + device like every other row
    # (2026-09-25, owner call): with an M5 Ultra due, a bare "m3" would read
    # as THE Mac rather than one Mac, and its lanes were the only untagged
    # rows on the page.
    "m3": "m3-max-metal",
    "m3-ane": "m3-max-ane",
    "4090-windows": "4090-win",
    # reflex .issues/033 (Bench 054/056): the PAW cells were measured on the
    # 4090 box with REFLEX_BENCH_HOST unset, so those docs carry the raw
    # hostname as the machine label. Same physical box the fleet publishes
    # as 4090-win — the alias keeps those lanes in the existing host
    # container instead of minting a phantom fourth host.
    "shikuwa": "4090-win",
}

# Device-variant hosts: the SAME physical machine as another host, serving
# the laya lane from a different device — "m3-max-ane" is the m3 baseline
# box with the encoder compiled as a whole-graph Core ML model for the
# Apple Neural Engine. Only the DEVICE-SENSITIVE lanes (the laya
# checkpoints) are publishable from such a host. The modelless lane is
# pure-CPU and device-independent: publishing it under the ANE tag is a
# duplicate of the baseline box's own row wearing a label that names a
# device the lane never touches (measured 2026-09-25: identical accuracy
# to full float precision, p50 within run noise — the "KatGPT · modelless
# @m3-max-ane" confusion row). Comparison lanes (clm / gliner / agentjev)
# are external services measured on their own serving host; they have no
# device-variant posture either and are skipped the same way, with a loud
# stderr disclosure. Applied in merge() on BOTH paths: a raw extra doc's
# top-level lanes at carry time, and a previously-published bench.json's
# already-merged extra_host_lanes (a re-publish cleans the old rows).
DEVICE_VARIANT_HOSTS = {
    "m3-max-ane": "m3-max-metal",
}
DEVICE_VARIANT_KEEP = ("laya",)


def display_host(h):
    return HOST_DISPLAY.get(h, h)


def rename_hosts(d):
    m = d.get("meta") or {}
    if m.get("host"):
        m["host"] = display_host(m["host"])
    for row in m.get("hosts") or []:
        if row.get("host"):
            row["host"] = display_host(row["host"])
    for s in d.get("suites", []):
        lanes = s.get("extra_host_lanes")
        if lanes:
            s["extra_host_lanes"] = {display_host(k): v
                                     for k, v in lanes.items()}


def rename_lanes(d):
    for s in d.get("suites", []):
        lanes = (
            ([s["modelless"]] if s.get("modelless") else [])
            + list((s.get("laya") or {}).values())
            + ([s["clm"]] if s.get("clm") else [])
            + ([s["gliner"]] if s.get("gliner") else [])
            + ([s["bekko"]] if s.get("bekko") else [])
            + ([s["agentjev"]] if s.get("agentjev") else [])
            + ([s["hybrid"]] if s.get("hybrid") else [])
            + ([s["encoder"]] if s.get("encoder") else [])
            + ([s["paw"]] if s.get("paw") else [])
            + ([s["paw_local"]] if s.get("paw_local") else [])
            + ([s["openthai"]] if s.get("openthai") else [])
        )
        for l in lanes:
            # The model column renders the harness's own field — the modelless
            # lane reports model: "modelless" (a mode, not a checkpoint), the
            # honest cell. Never overwrite it here.
            l["lane"] = LANE_DISPLAY.get(l.get("lane"), l.get("lane"))


# ── The lane-pairing population law (site Issue 002 / reflex Issue 040) ──
# Lanes are comparable on a suite iff they answered the SAME question set.
# A lane cell's population identity is its source run's `cases_digest`
# (riir-reflex runner, Issue 040 T1) when the run carries one, else the
# per-lane `lane_sources` run id. Identity is 3-state: equal / differs /
# UNKNOWN — and unknown is DISCLOSED, never read as equal.

PAIRING_LAYA_CK = "english"   # the TL;DR's comparison checkpoint


def lane_identity(cell, lane_sources, lane_key, doc_fallback=None):
    """The population identity of one published lane cell (3-state).

    Precedence: the cell's source-run `cases_digest` (population, pinned) >
    the cell's own `source_run` stamp (Issue-003 T4 — per-suite truth) >
    the lane's `lane_sources` host-row entry (a per-CLASS summary; a
    one-suite update re-labels every suite there, so it is the FALLBACK
    for cells predating the stamp) > the DOC's own run (a lane with no
    update row came with the primary — its run IS the doc's run)."""
    digest = (cell or {}).get("cases_digest")
    if digest:
        return {"kind": "digest", "id": digest}
    sr = (cell or {}).get("source_run") or {}
    sha = sr.get("git_sha")
    if sha:
        return {"kind": "run", "id": f"{sha} {sr.get('date_utc', '')}".strip()}
    src = (lane_sources or {}).get(lane_key) or {}
    sha = src.get("git_sha")
    if sha:
        return {"kind": "run", "id": f"{sha} {src.get('date_utc', '')}".strip()}
    if doc_fallback:
        return dict(doc_fallback)
    return {"kind": "unknown", "id": None}


def pair_status(a, b, a_cell=None, b_cell=None):
    """The pairing verdict, 4 states:

    same         — identities EQUAL (digest-equal = proven; run-id-equal
                   = same run, one population by construction).
    differs      — same-kind identities, different values, AND the paired
                   results MOVED (accuracy at 1e-9) — under a deterministic
                   lane a results move on a run-id mismatch is a PROVEN
                   population change (the 11/14 bug's three suites).
    same_results — identities differ but the paired results are byte-equal:
                   different runs, no evidence of a population change.
                   Comparable-with-disclosure — the digest tightens this
                   to proof as runs refresh (reflex Issue 040 T1).
    unknown      — kinds incomparable (mixed digest/run) or an identity
                   missing: undecidable, disclosed, never counted either
                   way."""
    if a["kind"] == "unknown" or b["kind"] == "unknown":
        return "unknown"
    if a["kind"] != b["kind"]:
        return "unknown"
    if a["id"] == b["id"]:
        return "same"
    if a["kind"] == "digest":
        # A digest mismatch is a PROVEN population difference — the
        # results cannot soften it (different rows, equal hit counts is
        # exactly the coincidence this gate exists to catch).
        return "differs"
    acc = lambda c: ((c or {}).get("hard") or {}).get("accuracy")
    moved = (acc(a_cell) is None or acc(b_cell) is None
             or abs(acc(a_cell) - acc(b_cell)) >= 1e-9)
    return "differs" if moved else "same_results"


def compute_pairings(d):
    """Stamp per-suite pairing verdicts for the PRIMARY host's lanes.

    Two pairs are computed per suite (both TL;DR claims):
      km_vs_laya  — modelless vs laya.<ck>  (the "Reflex vs laya" rows)
      rust_vs_py  — laya.<ck> vs laya.py/<ck> (the parity-claim row)
    Verdicts ride the published bench.json — the cards RENDER them, never
    re-derive them (the data-driven law)."""
    meta = d.get("meta") or {}
    phost = meta.get("host")
    lane_sources = {}
    for row in meta.get("hosts") or []:
        if row.get("host") == phost:
            lane_sources = row.get("lane_sources") or {}
    doc_run = (meta.get("git_sha"), meta.get("date_utc") or "")
    doc_fallback = ({"kind": "run", "id": f"{doc_run[0]} {doc_run[1]}".strip()}
                    if doc_run[0] else None)
    ck = PAIRING_LAYA_CK
    py_key = f"laya:py/{ck}"
    paired = 0
    for s in d.get("suites", []):
        laya = s.get("laya") or {}
        rust_cell = laya.get(ck)
        py_cell = laya.get(f"py/{ck}")
        km = s.get("modelless")
        block = {}
        if rust_cell is not None and py_cell is not None:
            rid = lane_identity(rust_cell, lane_sources, f"laya:{ck}", doc_fallback)
            pid = lane_identity(py_cell, lane_sources, py_key, doc_fallback)
            block["rust_vs_py"] = {
                "rust": rid, "py": pid,
                "status": pair_status(rid, pid, rust_cell, py_cell),
            }
            paired += 1
        if km is not None and rust_cell is not None:
            kid = lane_identity(km, lane_sources, "modelless", doc_fallback)
            rid = lane_identity(rust_cell, lane_sources, f"laya:{ck}", doc_fallback)
            block["km_vs_laya"] = {
                "modelless": kid, "rust": rid, "status": pair_status(kid, rid),
            }
        if block:
            s["pairing"] = block
    return paired


# ── The area rollups (the /bench/ radar cards) ────────────────────────────
# One curation table: suite → area, plus the suite's CHANCE baseline — the
# mean per-question random-pick probability — so scores from suites with
# different option counts become comparable (0 = random guessing, 1 =
# every question right).
#
# The chances are DATASET facts read off the harness's own option
# construction (riir-reflex src/harness/suites.rs + runner.rs +
# .docs/02_protocols/dataset_manifest.md), never measurements:
#   ag_news 4 labels, all presented (CRIT[4])          → 1/4
#   massive_intent_en 20 presented per question (gold +
#     19 sampled distractors, build_massive_intent_en) → 1/20
#   banking77 all 77 intents presented (build_banking77_mteb) → 1/77
#   sst5 5 levels (LEVELS[5])                          → 1/5
#   emotion 6 names (NAMES[6])                         → 1/6
#   xnli_en 3 NLI labels (NLI_CRIT[3])                 → 1/3
#   prompt_injections noul, 2 options                  → 1/2
#   typed_decisions 20 head types (the dataset manifest's table): eleven
#     4-way choice/score, three 5-way, six 2-way noul → unweighted mean
#     over head types (11·¼ + 3·⅕ + 6·½) / 20 = 0.3175
#   code_fixtures one 8-way module choice + one 2-way noul per case
#     (code_case) → (1/8 + 1/2) / 2 = 0.3125
AREA_CHANCE = {
    "ag_news": 1 / 4,
    "massive_intent_en": 1 / 20,
    "banking77": 1 / 77,
    "sst5": 1 / 5,
    "emotion": 1 / 6,
    "xnli_en": 1 / 3,
    "prompt_injections": 1 / 2,
    "typed_decisions": 6.35 / 20,
    "code_fixtures": (1 / 8 + 1 / 2) / 2,
}

# The area grouping (the radar's spokes). The Thai suites stay out of it:
# no chance baseline is curated for them (AREA_CHANCE), and adding one is
# an owner curation call, not a publish-time guess.
AREA_DEFS = (
    ("language", "Language & intent",
     ("ag_news", "massive_intent_en", "banking77")),
    ("sentiment", "Sentiment", ("sst5", "emotion")),
    ("reasoning", "Reasoning & safety", ("xnli_en", "prompt_injections")),
    ("decisions", "Decisions & code", ("typed_decisions", "code_fixtures")),
)

# The radar's lane rows: a stable key (the areas block's per-lane key), the
# published display spelling, and the page's palette key (bench-charts.js
# LANES key — the JS maps key → color; the palette itself is never
# duplicated here).
#
# EVERY filterable lane rolls up, not only the four product lanes (the
# /bench/#areas "show any selected result" fix): the comparison lanes and
# the python laya checkpoints are filter chips on the page, so a selected
# chip must have a radar row. A lane the primary host never measured (clm /
# gliner / agentjev / paw-local serve from the 4090) rolls up from
# extra_host_lanes under a host-tagged key ("clm@4090-win") — see
# compute_areas.
AREA_LANES = (
    ("modelless", "Reflex", "katgpt"),
    ("hybrid", "Instinct", "instinct"),
    ("encoder", "Rethink", "instinct-encoder"),
    ("laya", "laya (rust)", "rust"),
    ("python", "laya (python)", "python"),
    ("clm", "clm", "clm"),
    ("gliner", "gliner", "gliner"),
    ("bekko", "bekko", "bekko"),
    ("agentjev", "agentjev", "agentjev"),
    ("openthai", "openthai", "openthai"),
    ("paw", "paw (hosted)", "paw"),
    ("paw_local", "paw (local)", "paw"),
)

# ── Lane classification (plan 001 task 5; the Jev Index's entrant
# classification mechanic) ────────────────────────────────────────────
# A CURATED table, the AREA_CHANCE precedent: what each lane IS, not what
# it scored. Technique vs weights is a different claim — a lane's kind
# says which class of entrant produced the numbers, so a reader never
# compares a 0-trained-param in-process engine against an 8B HTTP oracle
# without the difference being ON the page. Keyed by the AREA_LANES class
# key (a host-tagged areas lane strips its "@host" suffix before the
# lookup — one kind per class, the serving host is already on the block).
# Completeness over AREA_LANES is test-enforced BOTH ways
# (case_lane_tables_complete): a missing row reds, a stale row reds.
LANE_KIND = {
    "modelless": "modelless-in-process",
    "hybrid": "trained-head",
    "encoder": "encoder",
    "laya": "encoder",
    "python": "encoder",
    "clm": "http-oracle",
    "gliner": "python-subprocess",
    "bekko": "python-subprocess",
    "agentjev": "http-oracle",
    "openthai": "http-oracle",
    "paw": "compiled-program",
    "paw_local": "compiled-program",
}

# ── Per-lane timing-method disclosure (plan 001 task 4; their per-engine
# latency-method table) ───────────────────────────────────────────────
# The second CURATED table: HOW each lane's request time was recorded —
# the clock class + a one-line method. Two clocks never pool silently:
# an in-process nanosecond read and a subprocess HTTP round-trip are both
# "latency" on the page, and without this table they read as comparable.
# The measured half (p50_geomean_ms + the quotable verdict counts) is
# derived per lane in compute_areas over EXACTLY the suites behind that
# lane's index (the areas per_suite population — never Thai probes or
# extra cells), from cells whose own latency_quotable verdict is True
# (the Issue-021 law: unfit timing is shown, never plotted).
LANE_TIMING = {
    "modelless": {
        "clock": "in-process",
        "method": ("Rust in-process per-decision read (the engine's own "
                   "decision-time measurement; zero network, zero IPC)"),
    },
    "hybrid": {
        "clock": "in-process",
        "method": ("Rust in-process over the same seat (specialist compose "
                   "+ modelless base, one process)"),
    },
    "encoder": {
        "clock": "in-process",
        "method": ("Rust in-process GPU encode+head forward (Metal on the "
                   "m3 hosts; the cell's `device` field names it)"),
    },
    "laya": {
        "clock": "in-process",
        "method": ("Rust in-process forward (device per host row: "
                   "laya_device — metal/cuda/cpu)"),
    },
    "python": {
        "clock": "subprocess-jsonl",
        "method": ("JSONL subprocess round-trip to the reference torch "
                   "runtime — IPC included, by the lane's own protocol"),
    },
    "clm": {
        "clock": "http",
        "method": ("HTTP round-trip to their served reference (vLLM "
                   "pooling on the 4090 window)"),
    },
    "gliner": {
        "clock": "subprocess-python",
        "method": ("Python subprocess round-trip (their gliner2 package "
                   "answers per batch; interpreter load excluded)"),
    },
    "bekko": {
        "clock": "subprocess-jsonl",
        "method": ("JSONL subprocess round-trip to their "
                   "BekkoSentenceTransformer runtime"),
    },
    "agentjev": {
        "clock": "http",
        "method": ("HTTP round-trip to their jev_service (step-600 "
                   "tensors; bf16 wobble disclosed in the bench record)"),
    },
    "openthai": {
        "clock": "http",
        "method": ("HTTP round-trip to their OpenThai-SystemOne teacher "
                   "over a loopback FastAPI subprocess"),
    },
    "paw": {
        "clock": "http",
        "method": ("HTTP round-trip to their hosted REST compile+answer "
                   "service (accuracy cells only today — the published "
                   "posture strips latency)"),
    },
    "paw_local": {
        "clock": "local-runtime",
        "method": ("Local llama.cpp runtime behind a Python subprocess "
                   "(their programasweights paw.function; warm cache)"),
    },
}

# ── Edition (plan 001 task 7; their edition label + auditability) ─────
# The published table's EDITION is a curated label — bumped when the
# SCORING BASIS changes (the chance table, the area membership, the lane
# set, the population protocol), not when measurements refresh. What forces
# the bump is the LEDGER below: EDITIONS is append-only, one row per
# published edition carrying the basis digest it was pinned to, and
# edition_guard() refuses unless (a) EDITION names the LEDGER'S LAST key
# and (b) the computed digest equals that row — so re-pinning the digest
# without a new edition label cannot pass, and a basis edit without a bump
# cannot pass. On a real bump: append the new row (the digest is printed by
# the guard's refusal), point EDITION at it, freeze the outgoing table
# (the publisher archives it automatically, on BOTH the publish and the
# --rederive paths), and add a data/changes.json row.
EDITION = "2026-10"


def _basis_payload():
    """The canonical JSON the edition basis digest hashes: the chance
    table, the area membership, and the lane population — rounded through
    repr-stable floats so the digest is byte-stable across runs."""
    return json.dumps(
        {
            "chance": {k: round(v, 12) for k, v in AREA_CHANCE.items()},
            "areas": [[a, lbl, list(names)] for a, lbl, names in AREA_DEFS],
            "lanes": [k for k, _d, _c in AREA_LANES],
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def edition_basis_digest():
    return hashlib.blake2b(
        _basis_payload().encode("utf-8"), digest_size=16
    ).hexdigest()


EDITIONS = {
    "2026-10": "0133fc49a0baec3b3293f51324b5416b",
}


def chance_digest():
    """The published digest over the AREA_CHANCE basis only (plan 001
    task 2): rides data/bench.json's areas block, so a basis edit announces
    itself in the published file, not only in the test pin."""
    payload = json.dumps(
        {k: round(v, 12) for k, v in AREA_CHANCE.items()},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.blake2b(payload.encode("utf-8"), digest_size=16).hexdigest()


def _cell_acc(cell):
    """A cell's accuracy across cell shapes — full cells carry it under
    `hard`, the acc-only comparison cells (paw / paw-local) at the top
    level — the same reader as the page's accOf(), so a cell never rolls up
    on the radar while blanking in the table beside it."""
    acc = (cell.get("hard") or {}).get("accuracy")
    return acc if acc is not None else cell.get("accuracy")


def _area_lane_cell(s, lane):
    """The lane cell of one suite's lane dict for the radar, or None.

    The laya lanes use the charts' own pick rule: the best-accuracy
    NON-multilingual checkpoint (typed on typed_decisions, english
    elsewhere; "python" reads only the py/ checkpoints) — the same rule
    hero()/summary() render with, so the radar never disagrees with the
    bars beside it. Returns (cell, checkpoint_or_None)."""
    if lane in ("laya", "python"):
        prefix = "py/" if lane == "python" else ""
        best = None
        best_acc = None
        for name, cell in (s.get("laya") or {}).items():
            if (prefix and not name.startswith(prefix)) or \
                    cell.get("model") == "multilingual":
                continue
            acc = _cell_acc(cell)
            if acc is None:
                continue
            if best is None or acc > best_acc:
                best, best_acc = (cell, cell.get("model")), acc
        return best
    # A DERIVED tier-fallback cell ROLLS UP (owner 2026-10-02, reversing
    # the same-day reorder): the radar reflects the SERVED product — the
    # serve path answers every suite through its tier stack, so the
    # fallback cell IS what a user of this lane gets there. The earlier
    # refusal answered a double-count worry; the mark answers it instead:
    # the rollup flags the entry (fallback + served_by) and the lane block
    # names fallback_suites, so the answering tier's number can never
    # masquerade as this lane's own arm — every OTHER lane still draws its
    # own cell, and this lane's row is what THIS product serves. A suite
    # with no cell at all (nothing measurable serves) stays a coverage
    # gap — never zero.
    cell = s.get(lane)
    if isinstance(cell, dict) and _cell_acc(cell) is not None:
        return (cell, None)
    return None


def compute_areas(d):
    """Emit d["areas"] — the per-area + per-suite chance-corrected rollups
    the /bench/ radar cards render (the compute_pairings precedent:
    derived verdicts ride the published bench.json; the page renders them,
    never re-derives them).

    Every filterable lane (AREA_LANES) rolls up from the PRIMARY host's
    top-level cells (a lane-scoped update replaces its cell in place, so
    this is the current served row; extra-host rows stay in the per-suite
    tables). A lane the primary host never measured (the 4090 serving-host
    comparison lanes) rolls up from extra_host_lanes under a host-tagged
    key ("clm@4090-win") with the serving host recorded on the lane block —
    the page renders the host beside the display name and the filter's
    palette key gates every posture of the lane. A lane missing a suite
    simply lacks that suite's entry — EXCEPT a product lane carrying a
    derived tier-fallback cell (apply_fallback_cells runs first in
    finalize): that cell rolls up MARKED (fallback + served_by + the
    displaced record's own read where one was displaced), the lane's
    index averages its DRAWN spokes (own + fallback — the served
    product), coverage/complete count only the lane's OWN measured
    suites, and fallback_suites names the fill (disclosed, never padded
    with zeros; a suite nothing measurable serves stays a gap).
    Re-running replaces the block wholesale, so a publish over an
    already-augmented bench.json is idempotent."""
    d.pop("areas", None)
    suites = {s["name"]: s for s in d.get("suites", [])}
    suite_meta = {}
    members = {}
    for area_id, _label, names in AREA_DEFS:
        for name in names:
            if name in suites and name in AREA_CHANCE:
                suite_meta[name] = {"area": area_id,
                                    "chance": round(AREA_CHANCE[name], 6)}
                members.setdefault(area_id, []).append(name)

    def _rollup(key, read):
        """per_suite/area_vals/cells for one lane, read through
        `read(suite)` — the identity read for primary-host cells, a host-lane
        read for the serving-host pass. `cells` carries the SAME cell the
        entry was scored from (name -> (cell, ck)) — the timing block's
        population is exactly the index's population by construction."""
        per_suite, area_vals, cells = {}, {}, {}
        for area_id, names in members.items():
            vals = []
            for name in names:
                picked = _area_lane_cell(read(suites[name]), key)
                if picked is None:
                    continue
                cell, ck = picked
                acc = _cell_acc(cell)
                chance = AREA_CHANCE[name]
                entry = {"acc": round(acc, 6),
                         "cc": round((acc - chance) / (1.0 - chance), 6)}
                if ck:
                    entry["ck"] = ck
                if cell.get("derived") and cell.get("serves") == "tier-fallback":
                    entry["fallback"] = True
                    if cell.get("served_by"):
                        entry["served_by"] = cell["served_by"]
                    rec = cell.get("displaced_record")
                    rec_acc = _cell_acc(rec) if isinstance(rec, dict) else None
                    if rec_acc is not None:
                        entry["record_acc"] = round(rec_acc, 6)
                per_suite[name] = entry
                cells[name] = (cell, ck)
                vals.append(entry["cc"])
            if vals:
                area_vals[area_id] = round(sum(vals) / len(vals), 6)
        return per_suite, area_vals, cells

    def _lane_timing(key, cells):
        """The plan-001 task-4 timing block for one lane: the curated clock
        class + method (LANE_TIMING) plus the MEASURED aggregate over the
        lane's index population — p50 geometric mean over cells whose own
        latency_quotable verdict is True, with the verdict counts disclosed
        (unjudged = no verdict or no timing published; an acc-only cell
        counts as unjudged, never as quotable). A lane with no quotable
        cell carries p50_geomean_ms: null — the page lists it as "not
        plotted: no quotable latency", never draws it at 0."""
        cls = key.split("@")[0]
        used, unquotable, unjudged = [], 0, 0
        for _name, (cell, _ck) in cells.items():
            p50 = cell.get("latency_p50_ms")
            q = cell.get("latency_quotable")
            if q is True and isinstance(p50, (int, float)) and p50 > 0:
                used.append(p50)
            elif q is False:
                unquotable += 1
            else:
                unjudged += 1
        geo = (round(math.exp(sum(math.log(v) for v in used) / len(used)), 4)
               if used else None)
        n_fb = sum(1 for _n, (c, _k) in cells.items()
                   if c.get("derived") and c.get("serves") == "tier-fallback")
        note = ("population = the suites behind the lane's index; "
                "p50 geometric mean over latency_quotable cells only "
                "(unfit timing is shown in the tables, never plotted)")
        if n_fb:
            note += (f"; {n_fb} fallback spoke(s) carry the answering "
                     "tier's timing, unjudged here — shown in the suite "
                     "tables, never plotted")
        return {
            "clock": LANE_TIMING[cls]["clock"],
            "method": LANE_TIMING[cls]["method"],
            "suites": len(cells),
            "p50_geomean_ms": geo,
            "n_used": len(used),
            "n_unquotable": unquotable,
            "n_unjudged": unjudged,
            "note": note,
        }

    def _lane_block(lane_key, display, color_key, per_suite, area_vals,
                    cells=None, host=None):
        """One areas lane block. `lane_key` is the CLASS key (a host-tagged
        block passes the class, with the host separate) — the LANE_KIND
        lookup key. `cells` (name -> (cell, ck)) is the same population the
        entries were scored from; the timing block is derived from it so
        the timing aggregate and the index can never describe different
        suite sets."""
        # coverage/complete count the lane's OWN measured suites — a
        # fallback spoke fills the polygon, it never converts a partial
        # lane into a complete one. fallback_suites + served_coverage
        # disclose the fill (absent when the lane needed no fallback, so
        # every unaffected lane's block is byte-identical to the old shape).
        fb_names = sorted(n for n, e in per_suite.items() if e.get("fallback"))
        own = len(per_suite) - len(fb_names)
        block = {
            "display": display,
            "color_key": color_key,
            "kind": LANE_KIND[lane_key],
            "per_suite": per_suite,
            "areas": area_vals,
            "index": (round(sum(area_vals.values()) / len(area_vals), 6)
                      if area_vals else None),
            "coverage": {"suites": own,
                         "of": len(suite_meta)},
            "complete": own == len(suite_meta),
        }
        if fb_names:
            block["fallback_suites"] = fb_names
            block["served_coverage"] = {"suites": len(per_suite),
                                        "of": len(suite_meta)}
        if host is not None:
            block["host"] = host
        return block

    lanes_out = {}
    cells_by_key = {}
    for key, display, color_key in AREA_LANES:
        per_suite, area_vals, cells = _rollup(key, lambda s: s)
        if per_suite:
            lanes_out[key] = _lane_block(key, display, color_key, per_suite,
                                         area_vals, cells=cells)
            cells_by_key[key] = cells

    # Serving-host pass: a lane with NO primary cells anywhere (the 4090
    # comparison lanes) rolls up per host under a host-tagged key. A lane
    # with any primary cell never enters this pass — each radar lane stays
    # single-host by construction, so a partial lane is a coverage gap, not
    # a host mix.
    extra_hosts = []
    for s in d.get("suites", []):
        for host in (s.get("extra_host_lanes") or {}):
            if host not in extra_hosts:
                extra_hosts.append(host)
    for key, display, color_key in AREA_LANES:
        if key in lanes_out:
            continue
        for host in extra_hosts:
            per_suite, area_vals, cells = _rollup(
                key,
                lambda s, h=host: (s.get("extra_host_lanes") or {}).get(h) or {})
            if per_suite:
                lanes_out[f"{key}@{host}"] = _lane_block(
                    key, display, color_key, per_suite, area_vals, cells=cells,
                    host=host)
                cells_by_key[f"{key}@{host}"] = cells

    timing_out = {key: _lane_timing(key, cells_by_key[key])
                  for key in lanes_out}

    d["areas"] = {
        "version": 4,
        "edition": EDITION,
        "chance_digest": chance_digest(),
        "scale": ("chance-corrected accuracy: cc = (acc - chance) / "
                  "(1 - chance); 0 = random guessing, 1 = every question "
                  "right; per-suite chance = the mean per-question "
                  "random-pick probability of the harness's own option "
                  "construction (a dataset fact, not a measurement); "
                  "values below 0 are BELOW CHANCE and stay negative on "
                  "purpose — a lane scoring under random guessing must "
                  "read that way, and negatives pull area means and the "
                  "index down by design"),
        "suites": suite_meta,
        "areas": [{"id": a, "label": lbl, "suites": list(members.get(a, []))}
                  for a, lbl, _ in AREA_DEFS if a in members],
        "lanes": lanes_out,
        "timing": timing_out,
        "scope": ("primary-host rows; a lane the primary host never ran "
                  "rolls up from its serving host under a host-tagged "
                  "lane key (clm@4090-win); a product lane's fallback "
                  "spokes roll up from the answering tier (marked "
                  "fallback, drawn as triangles — coverage stays the "
                  "lane's own measured count)"),
    }
    return d["areas"]


def stamp_cell(cell, suite, meta=None):
    """Carry the source run's population identity onto the lane cell, and
    (when the run carries a box_state) the run's latency verdict — on the
    CELL, beside the timing it describes, so a LANE_CARRY replaces both
    together (_carry_into) and no row-level field can pair one run's
    verdict with another run's numbers. The run's own identity rides the
    too (`source_run`, Issue-003 T4): lane_sources is keyed per
    (host, lane CLASS), so a one-suite update re-labels every suite's
    source there — the cell stamp is the per-suite truth lane_identity
    reads first, and lane_sources stays a host-row summary.

    Issue 057: the `corpus_digest` rides the modelless CELL by the same
    per-cell law — it arrives on the results.json lane dict verbatim
    (reflex `7e03117` hashes the pool the harness ACTUALLY timed) and
    survives merge by reference; laya cells never carry one. No synthesis
    here: the carry comparison (carry_applies) reads cells, never rows,
    because extra_host_lanes slots can come from runs on a different
    corpus and a row-level comparison answers wrong for every non-primary
    host."""
    if not isinstance(cell, dict):
        return
    if suite.get("cases_digest"):
        cell["cases_digest"] = suite["cases_digest"]
    if meta and "box_state" in meta:
        cell["latency_quotable"] = doc_latency_quotable(meta)
    if meta:
        sr = {k: meta[k] for k in LANE_SOURCE_KEYS if k in meta}
        if sr:
            cell["source_run"] = sr


def host_row(meta):
    """The per-host meta row: whitelisted run facts only, sanitized."""
    row = {}
    for k in HOST_META_KEYS:
        if k in meta and k not in DROP_META_KEYS:
            row[k] = meta[k]
    if "box_state" in meta:
        row["latency_quotable"] = doc_latency_quotable(meta)
    return row


def load_run(path):
    src = Path(path)
    if not src.is_file():
        print(f"error: {src} not found — run the harness first", file=sys.stderr)
        sys.exit(1)
    d = json.loads(src.read_text(encoding="utf-8"))
    host = (d.get("meta") or {}).get("host")
    if not host:
        print(f"error: {src} carries no meta.host — refusing to merge an "
              "unlabeled run (set REFLEX_BENCH_HOST on the harness run)",
              file=sys.stderr)
        sys.exit(1)
    rename_hosts(d)
    if host == "unknown":
        # The runner's last-resort label (REFLEX_BENCH_HOST unset AND uname
        # unreadable — measured on the 4090's PowerShell probe, reflex
        # Bench 082). Merging it would mint a phantom host row the page
        # cannot attribute; the fix belongs at the run, not the merge.
        print(f"error: {src} carries meta.host 'unknown' — refusing to "
              "merge an unattributable run (set REFLEX_BENCH_HOST=<label> "
              "on the harness run, then relabel the doc per the issue-033 "
              "law and re-run)", file=sys.stderr)
        sys.exit(1)
    return d


def merge(primary, extras):
    """Merge extra docs into the primary document (Issue 018 T5/T7; 023 T5).

    Docs apply in order. A doc whose host is NEW joins the fleet (lanes +
    one meta.hosts row, absent_suites disclosed). A doc whose host was
    already seen (including the primary's own host, or a host carried by a
    previously-merged primary) UPDATES only the lanes it declares; the
    host's other lanes and its original row facts carry over, and each
    updated lane's source run is recorded in the host row's lane_sources
    (a per-class summary — the per-suite truth is the cell's source_run
    stamp, Issue-003 T4).

    REFUSES on modelless accuracy drift in the FINAL merged state — the
    cross-host bit-identity claim is checked on what would be PUBLISHED,
    after every update has landed. A one-host engine move therefore refuses
    (both hosts must move together — the Issue 023 T5 law).
    """
    pmeta = dict(primary.get("meta") or {})
    phost = pmeta.get("host")

    # Seed the seen-host set: a previously-merged primary (a published
    # bench.json) carries its host rows already — reuse them so an update
    # keeps the ORIGINAL run facts + disclosures instead of duplicating
    # rows or recomputing absent_suites from a lane-scoped doc.
    hosts_by_name = {}
    hosts_order = []
    for row in pmeta.get("hosts") or []:
        h = row.get("host")
        if h and h not in hosts_by_name:
            hosts_by_name[h] = dict(row)
            hosts_order.append(h)
    if phost and phost not in hosts_by_name:
        hosts_by_name[phost] = host_row(pmeta)
        hosts_order.insert(0, phost)

    reset_env = os.environ.get("PUBLISH_BENCH_POPULATION_RESET", "")
    population_reset = {x.strip() for x in reset_env.split(",") if x.strip()}
    reset_seen = set()
    reset_fired = {}  # suite -> the extra doc whose guard fired (the re-pin)
    p_suites = {s["name"]: s for s in primary.get("suites", [])}
    # Population identity (site Issue 002 T2): the primary's own lane cells
    # carry their run's cases_digest (new-runner results.json only — older
    # runs disclose via lane_sources run ids instead). setdefault: an
    # already-stamped cell keeps its own (a re-merged bench.json primary).
    for s in p_suites.values():
        dg = s.get("cases_digest")
        if not dg:
            continue
        cells = ([s.get("modelless")] + list((s.get("laya") or {}).values())
                 + [s.get(k) for k in ("clm", "gliner", "bekko",
                                       "agentjev", "paw", "paw_local",
                                       "hybrid", "encoder", "openthai")])
        for cell in cells:
            if isinstance(cell, dict):
                cell.setdefault("cases_digest", dg)
    # A RAW primary's cells take its own run's verdict. A published
    # bench.json primary does NOT: its meta.box_state is the table's
    # original run's, and stamping it would pair that verdict with cells
    # later updates replaced (reflex Bench 067's misreading, mechanized).
    if not pmeta.get("hosts") and "box_state" in pmeta:
        pq = doc_latency_quotable(pmeta)
        for s in p_suites.values():
            cells = ([s.get("modelless")] + list((s.get("laya") or {}).values())
                     + [s.get(k) for k in ("clm", "gliner", "bekko",
                                           "agentjev", "paw", "paw_local",
                                           "hybrid", "encoder", "openthai")])
            for cell in cells:
                if isinstance(cell, dict):
                    cell.setdefault("latency_quotable", pq)
    skipped_variant_lanes = []

    # A previously-published bench.json as primary may already carry
    # device-variant rows merged before this law existed — strip them here
    # so a re-publish cleans the old shape instead of re-publishing it.
    for s in p_suites.values():
        variant_lanes = s.get("extra_host_lanes") or {}
        for vhost, hl in variant_lanes.items():
            if vhost not in DEVICE_VARIANT_HOSTS:
                continue
            for key in [k for k in hl if k not in DEVICE_VARIANT_KEEP]:
                skipped_variant_lanes.append(f"{key}@{vhost}")
                del hl[key]

    def host_lane_entry(suite, host):
        """The writable lane container for `host` on this suite row.

        For a host the primary already knows this is the EXISTING container
        (setdefault returns the dict in place) — an update writes its lane
        slots into it and every lane the update does not declare SURVIVES
        (measured, reflex .issues/034: the update path cannot wipe). Only a
        NEW host gets a freshly created container, whose content is exactly
        the update doc's lanes. The wholesale-wipe risk therefore lives one
        level up, on the fresh-docs path, and is walled in main()."""
        if host == phost:
            return suite  # the primary's lanes live on the row itself
        return suite.setdefault("extra_host_lanes", {}).setdefault(host, {})

    for extra in extras:
        emeta = extra.get("meta") or {}
        ehost = emeta["host"]
        is_join = ehost not in hosts_by_name
        if is_join:
            hosts_by_name[ehost] = host_row(emeta)
            hosts_order.append(ehost)
        excluded = []
        # Suite-join guard input: the suites this doc carries that the
        # primary already knows. A doc may ADD suites (the reflex Bench
        # 074 Thai probe suites rode exactly such a doc) — the join is
        # loud per suite. A BRAND-NEW host whose every suite is new is
        # still an error: it would mint a phantom host AND phantom rows
        # in one step, the silent-vanish shape the superset refusal
        # exists to catch (a known host's row anchors the doc instead).
        known_before = [q.get("name") for q in extra.get("suites", [])
                        if q.get("name") in p_suites]
        updated_lanes = {}
        python_lanes = False
        # Device-variant host (the DEVICE_VARIANT_HOSTS law): only the
        # laya lanes cross the merge — the rest of this doc's lanes are
        # device-independent and would publish as tagged duplicates of the
        # base machine's own rows.
        device_variant = ehost in DEVICE_VARIANT_HOSTS
        for s in extra.get("suites", []):
            name = s["name"]
            p = p_suites.get(name)
            if p is None:
                if not known_before and is_join:
                    print(f"error: host {ehost} has suite {name} which the "
                          f"primary run lacks, and a new host with no known "
                          f"suite cannot join — publish the superset run as "
                          "the primary (first argument)", file=sys.stderr)
                    sys.exit(1)
                # The suite JOIN path: create the row from the doc's own
                # facts and let the ordinary lane merge below land the
                # doc's lanes on it. Loud, and one-directional — a joined
                # row carries only what its docs declare, so nothing
                # already published can shrink (the Issue-034 wall's
                # update-path twin stays walled above).
                p = {"name": name,
                     "n_questions": s.get("n_questions"),
                     "n_cases": s.get("n_cases")}
                p_suites[name] = p
                primary.setdefault("suites", []).append(p)
                print(
                    f"note: join — host {ehost} adds suite {name} "
                    f"(nq {s.get('n_questions')}, n_cases "
                    f"{s.get('n_cases')}; not in the primary run; the "
                    "doc's own lanes land on the new row)",
                    file=sys.stderr,
                )
            # Population guard: a suite row is only mergeable when both
            # hosts answered the SAME question set. code_fixtures harvests
            # fn spans from the repo's own sources at RUNTIME, so its
            # population is commit-relative (28 @77c408e vs 24 post-laya-move)
            # — a cross-population row would publish numbers over different
            # questions under one suite heading. EXCLUDE with a note, never
            # merge.
            if (p.get("n_questions"), p.get("n_cases")) != (
                    s.get("n_questions"), s.get("n_cases")):
                if name not in population_reset:
                    excluded.append(f"{name} (nq {s.get('n_questions')} vs "
                                    f"primary {p.get('n_questions')})")
                    continue
                # The ACKNOWLEDGED population reset (PUBLISH_BENCH_POPULATION_RESET,
                # reflex Issue 044 T4): the fixture pin changed the suite's
                # question set deliberately — update the row facts, drop every
                # OTHER host's lanes (they measured the old questions), and let
                # the update's own lanes land normally below.
                old_nq = p.get("n_questions")
                p["n_questions"] = s.get("n_questions")
                p["n_cases"] = s.get("n_cases")
                if s.get("cases_digest"):
                    p["cases_digest"] = s["cases_digest"]
                dropped_host_lanes = []
                hl = p.get("extra_host_lanes") or {}
                for vhost in list(hl):
                    lanes = sorted(hl[vhost].keys())
                    dropped_host_lanes.append(
                        f"{vhost}({','.join(lanes) if lanes else 'row'})")
                    del hl[vhost]
                for hrow in hosts_by_name.values():
                    ex = hrow.get("excluded_suites")
                    if ex:
                        hrow["excluded_suites"] = [
                            e for e in ex if not e.startswith(f"{name} (")]
                print(
                    f"note: PUBLISH_BENCH_POPULATION_RESET — {name} population "
                    f"re-pinned nq {old_nq} -> {p['n_questions']}; dropped "
                    f"stale-population host lanes: "
                    f"{', '.join(dropped_host_lanes) or 'none'}",
                    file=sys.stderr,
                )
                reset_seen.add(name)
                reset_fired[name] = extra
            entry = host_lane_entry(p, ehost)
            em, el = s.get("modelless"), (s.get("laya") or {})
            if em and not device_variant:
                stamp_cell(em, s, emeta)
                entry["modelless"] = em
                updated_lanes["modelless"] = True
            elif em:
                skipped_variant_lanes.append(f"modelless@{ehost}")
            for lk, lv in el.items():
                stamp_cell(lv, s, emeta)
                entry.setdefault("laya", {})[lk] = lv
                updated_lanes[f"laya:{lk}"] = True
                if lv.get("lane") in PYTHON_LANE_SPELLINGS:
                    python_lanes = True
            # The CLM comparison lane (reflex .issues/027): carried like
            # any other lane an update declares — never merged silently
            # away. No cross-host gate: it is an external reference
            # measured per-host, no bit-identity claim applies.
            ec = s.get("clm")
            if ec and not device_variant:
                stamp_cell(ec, s, emeta)
                entry["clm"] = ec
                updated_lanes["clm"] = True
            elif ec:
                skipped_variant_lanes.append(f"clm@{ehost}")
            # The GLiNER comparison lane (reflex .issues/029): the same
            # carry law as clm — an external reference measured per-host.
            eg = s.get("gliner")
            if eg and not device_variant:
                stamp_cell(eg, s, emeta)
                entry["gliner"] = eg
                updated_lanes["gliner"] = True
            elif eg:
                skipped_variant_lanes.append(f"gliner@{ehost}")
            # The AgentJev comparison lane (reflex .issues/025 amendment
            # 4): the same carry law — an external reference measured
            # per-host.
            ea = s.get("agentjev")
            if ea and not device_variant:
                stamp_cell(ea, s, emeta)
                entry["agentjev"] = ea
                updated_lanes["agentjev"] = True
            elif ea:
                skipped_variant_lanes.append(f"agentjev@{ehost}")
            # The PAW comparison lane, HOSTED postures (reflex .issues/033):
            # the same carry law — an external service measured per-host,
            # no bit-identity claim applies.
            ep = s.get("paw")
            if ep and not device_variant:
                stamp_cell(ep, s, emeta)
                entry["paw"] = ep
                updated_lanes["paw"] = True
            elif ep:
                skipped_variant_lanes.append(f"paw@{ehost}")
            # The PAW LOCAL-runtime lane (their llama.cpp subprocess): the
            # same carry law — but it IS host-sensitive (it runs on the
            # measuring box), so a device-variant host would skip it like
            # the rest; today no such host carries it.
            epl = s.get("paw_local")
            if epl and not device_variant:
                stamp_cell(epl, s, emeta)
                entry["paw_local"] = epl
                updated_lanes["paw_local"] = True
            elif epl:
                skipped_variant_lanes.append(f"paw_local@{ehost}")
            # The instinct HYBRID lane (riir-instinct .issues/003): the
            # trained-specialist composition over the same seat — the
            # registered arm's frozen test read. Pure-CPU like the
            # modelless lane, so a device-variant host skips it the same
            # way (it would publish as a tagged duplicate of the base
            # machine's own row).
            eh = s.get("hybrid")
            if eh and not device_variant:
                stamp_cell(eh, s, emeta)
                entry["hybrid"] = eh
                updated_lanes["hybrid"] = True
            elif eh:
                skipped_variant_lanes.append(f"hybrid@{ehost}")
            # The instinct ENCODER lane (riir-instinct issue 014 C1):
            # the record-only encoder-feature arm — same carry law as the
            # hybrid lane, but NEVER merged into the hybrid cell (the
            # serving posture is untouched: the hybrid cell keeps the
            # serving arm; this cell carries serve: ✗).
            ee = s.get("encoder")
            if ee and not device_variant:
                stamp_cell(ee, s, emeta)
                entry["encoder"] = ee
                updated_lanes["encoder"] = True
            elif ee:
                skipped_variant_lanes.append(f"encoder@{ehost}")
            # The OpenThai comparison lane (reflex Plan 003 / Bench 074):
            # the same carry law — an external service measured per-host,
            # no bit-identity claim applies.
            eo = s.get("openthai")
            if eo and not device_variant:
                stamp_cell(eo, s, emeta)
                entry["openthai"] = eo
                updated_lanes["openthai"] = True
            elif eo:
                skipped_variant_lanes.append(f"openthai@{ehost}")
            # The Bekko comparison lane (reflex Bench 103, owner call
            # 2026-10-01): the same carry law — an external oracle measured
            # per-host as a JSONL subprocess (their BekkoSentenceTransformer
            # runtime; the card assigns NO license yet — measurement-only).
            ebk = s.get("bekko")
            if ebk and not device_variant:
                stamp_cell(ebk, s, emeta)
                entry["bekko"] = ebk
                updated_lanes["bekko"] = True
            elif ebk:
                skipped_variant_lanes.append(f"bekko@{ehost}")
            # The Issue-024 leak block (T4): a slice property of the
            # DATASETS + registry caps, not of the host — the latest
            # run's scan is the published one (a doc without it never
            # erases a previous scan's block).
            if s.get("leak"):
                p["leak"] = s["leak"]
        if is_join:
            row = hosts_by_name[ehost]
            absent = [n for n in p_suites if n not in
                      {s["name"] for s in extra.get("suites", [])}]
            if absent:
                row["absent_suites"] = absent
            if excluded:
                row["excluded_suites"] = excluded
        else:
            row = hosts_by_name[ehost]
            if excluded:
                # An update doc's population mismatch is a per-suite
                # exclusion: APPEND to (never overwrite) the standing
                # disclosure — the join-time facts stay true.
                row["excluded_suites"] = sorted(
                    set(row.get("excluded_suites", [])) | set(excluded))
            if updated_lanes:
                src = row.setdefault("lane_sources", {})
                for lane in updated_lanes:
                    src[lane] = {k: emeta[k] for k in LANE_SOURCE_KEYS
                                 if k in emeta}
                # The modelless lane-fact postures (Issue 032): an update
                # that contributes the MODELLESS lane refreshes the row's
                # head_posture / latency_carried from its meta — these are
                # properties of the LANE, not the host's original run (the
                # laya_python_lane / laya_device class just below).
                if "modelless" in updated_lanes:
                    for k in LANE_FACT_META_KEYS:
                        if k in emeta:
                            row[k] = emeta[k]
                            if ehost == phost:
                                pmeta[k] = emeta[k]
            # riir-reflex Issue 025 T4: the python-lane posture is a LANE
            # fact, not a run fact. An update that contributes python lanes
            # must replace the row's "off", or the published file says "off"
            # beside python numbers.
            if python_lanes and "laya_python_lane" in emeta:
                row["laya_python_lane"] = emeta["laya_python_lane"]
                if ehost == phost:
                    pmeta["laya_python_lane"] = emeta["laya_python_lane"]
            # The device posture is the same LANE-fact class (the 026 CUDA
            # lane): an update contributing laya lanes must refresh
            # `laya_device`, or the published file says "cpu" beside CUDA
            # numbers — the T4 defect shape, one axis over.
            if updated_lanes and any(k.startswith("laya:") for k in updated_lanes) \
                    and "laya_device" in emeta:
                row["laya_device"] = emeta["laya_device"]

    if skipped_variant_lanes:
        print(
            "note: device-variant host lanes skipped (device-independent "
            "lanes of a device row publish as tagged duplicates of the base "
            f"machine): {', '.join(sorted(set(skipped_variant_lanes)))}",
            file=sys.stderr,
        )

    # FINAL-state cross-host drift gate (Issue 018 T7, mechanized on the
    # state that would be published): every host carrying the modelless
    # lane on a suite must agree on its accuracy — pairwise among ALL
    # hosts, not only against the primary (a suite the primary itself
    # lacks modelless on is still checked between the extras).
    #
    # POPULATION EXCLUSION — `code_fixtures`: that suite draws REAL fn
    # spans from riir-reflex's own sources (`code_fn_slices()`), so its
    # case population is COMMIT-DEPENDENT and cross-host bit-identity
    # cannot hold by construction (the Issue 018 close-out's recorded
    # "population-excluded" — the 14 dataset suites carry the claim;
    # the drift the published data already shows on this suite is the
    # population moving, not the engine). Excluded here so the gate
    # stays a wall for the suites it can decide.
    for name, p in p_suites.items():
        if name == "code_fixtures":
            continue
        accs = {}
        pm = p.get("modelless")
        if pm:
            pa = (pm.get("hard") or {}).get("accuracy")
            if pa is not None:
                accs[pmeta.get("host") or "(primary)"] = pa
        for host, entry in (p.get("extra_host_lanes") or {}).items():
            em = entry.get("modelless")
            if not em:
                continue
            ea = (em.get("hard") or {}).get("accuracy")
            if ea is not None:
                accs[host] = ea
        if len(set(accs.values())) > 1:
            detail = ", ".join(f"{h}={a!r}" for h, a in accs.items())
            print(
                f"⛔ modelless accuracy DRIFT on {name}: {detail} — the "
                "cross-host bit-identity claim FAILED (Issue 018 T7); stop "
                "and file, never publish",
                file=sys.stderr,
            )
            sys.exit(1)

    # Population-reset prune: any lane slot the reset row still carries that
    # the reset doc did not re-declare is the OLD population's measurement —
    # the stale-population defect the guard exists for, one slot at a time.
    for name, firing in reset_fired.items():
        p = p_suites.get(name)
        if p is None:
            continue
        s = next(r for r in firing.get("suites", []) if r["name"] == name)
        declared = set()
        for k in LANE_CLASSES:
            if k == "laya":
                declared |= {f"laya:{ck}" for ck in (s.get("laya") or {})}
            elif s.get(k) is not None:
                declared.add(k)
        pruned = []
        for k in LANE_CLASSES:
            if k == "laya":
                row_l = p.get("laya") or {}
                for ck in list(row_l):
                    if f"laya:{ck}" not in declared:
                        del row_l[ck]
                        pruned.append(f"laya:{ck}")
            elif p.get(k) is not None and k not in declared:
                del p[k]
                pruned.append(k)
        if pruned:
            print(
                f"note: PUBLISH_BENCH_POPULATION_RESET — {name}: dropped "
                "stale-population lane slot(s) the update does not "
                f"re-declare: {', '.join(sorted(pruned))}",
                file=sys.stderr,
            )

    stale_reset = population_reset - reset_seen
    if stale_reset:
        print(
            f"\u26d5 refusing: PUBLISH_BENCH_POPULATION_RESET names "
            f"{', '.join(sorted(stale_reset))}, but no extra doc carries that "
            "suite with a population mismatch \u2014 a reset ack cannot outlive "
            "the population change it was written for",
            file=sys.stderr,
        )
        sys.exit(1)

    pmeta["hosts"] = [hosts_by_name[h] for h in hosts_order]
    primary["meta"] = pmeta
    return primary


def corpus_reset_set():
    """The PUBLISH_BENCH_CORPUS_RESET ack set (Issue 057) — the named
    suites are exempt from LANE_CARRY regardless of digest state (their
    incumbents predate the corpus_digest stamp; that is the point)."""
    env = os.environ.get("PUBLISH_BENCH_CORPUS_RESET", "")
    return {x.strip() for x in env.split(",") if x.strip()}


def carry_applies(src_lane, target_cell, update_quotable, suite_name=""):
    """True when the incumbent timing must replace the update's, per the
    LANE_CARRY law. The ONE vocabulary both the carry loop
    (apply_lane_carry) and the publish wall (_latency_slots) read, so an
    exempted carry can never leak an unjudged slot past the wall (Issue 057
    verdict correction 2). Exemptions, checked in order:

    - same source run (re-stamp would fabricate provenance);
    - unfit incumbent + quotable update (Issue-003 T2);
    - corpus mismatch: BOTH cells carry `corpus_digest` and they differ —
      carrying would re-attach stale timing by construction (Issue 057;
      the stamp rides the modelless CELL, the cases_digest pattern,
      hashed by the harness over the pool it actually timed). A named
      `suite_name` in the PUBLISH_BENCH_CORPUS_RESET ack is exempt from
      the carry outright (digest state irrelevant — the ack exists
      exactly for the digest-less incumbent).

    Missing digests on either side are NOT an exemption (adoption-stable;
    the one-time ack retires the stale incumbent)."""
    if suite_name and suite_name in corpus_reset_set():
        return False
    tsr = (target_cell or {}).get("source_run")
    if tsr is not None and tsr == (src_lane or {}).get("source_run"):
        return False
    if carry_beats_incumbent(src_lane, update_quotable):
        return False
    sd = (src_lane or {}).get("corpus_digest")
    td = (target_cell or {}).get("corpus_digest")
    if sd is not None and td is not None and sd != td:
        return False
    return True


# The RENDERER lane keys of the two PRODUCT lanes and their published
# cell fields. A product lane's missing cell is a FALLBACK, never a hole
# (owner 2026-10-02): the serve binary answers every suite through its
# tier stack (instinct 057d31a), so the board shows the tier that
# answers — the number IS what a user of the product gets.
PRODUCT_LANES = {
    "instinct": {"key": "hybrid", "display": "Instinct"},
    "instinct-encoder": {"key": "encoder", "display": "Rethink"},
}


def fallback_cell(source_cell, display, served_by, note):
    """Derive one product lane's fallback cell from the tier that serves.

    The measured FIELDS are the source tier's own (accuracy + latency —
    the tier that answers determines both); the identity fields name the
    FALLBACK: `serves` marks the cell tier-fallback, `served_by` names
    the answering tier, `fallback_note` carries the measured reason the
    lane's own arm is absent. The source cell's `source_run` stamp rides
    along — the numbers' provenance is the tier's measurement, never the
    derivation. `derived: true` lets every consumer tell the cell apart
    from a measured read of this lane."""
    cell = {
        "lane": display,
        "model": source_cell.get("model") or served_by,
        "hard": source_cell.get("hard"),
        "latency_scope": source_cell.get("latency_scope"),
        "latency_rows": source_cell.get("latency_rows"),
        "latency_p50_ms": source_cell.get("latency_p50_ms"),
        "latency_p99_ms": source_cell.get("latency_p99_ms"),
        "latency_tail_support": source_cell.get("latency_tail_support"),
        "serves": "tier-fallback",
        "served_by": served_by,
        "fallback_note": note,
        "derived": True,
    }
    if source_cell.get("source_run"):
        cell["source_run"] = dict(source_cell["source_run"])
    return cell


def _serve_refused_record(cell):
    """A product-lane cell whose own arm is REFUSED at serve — the
    record-only seating (instinct issue 017): `record_only` flagged, or the
    serves field names the ✗ refusal. A derived fallback cell is NOT one
    (it is the answering tier's cell, and displacing it again would not be
    idempotent)."""
    if not isinstance(cell, dict) or cell.get("derived"):
        return False
    if cell.get("record_only"):
        return True
    serves = cell.get("serves")
    return isinstance(serves, str) and serves.startswith("✗")


def apply_fallback_cells(d):
    """Close the product lanes' holes with the SERVED ANSWER, and displace
    the Rethink lane's LOSING refused records with it (owner directive
    2026-10-02: 'the chart should reflect the served product; if anything
    falls back you note it — but it shows the result the user will get';
    best-of-family call same day: Rethink never reads below the seated
    arm — where its encoder measured ahead the violet record cell stays).

    For each suite, per product lane:
      - a lane without a real cell gets a DERIVED served-answer cell:
        - instinct (Instinct): the served tier is the modelless lane (the
          artifact-less A0 rows serve it — instinct 057d31a).
        - instinct-encoder (Rethink): the served tier is the seated arm of
          the full-coverage manifest — the hybrid specialist where one
          seats, else the modelless tier (the serving law: best measured
          arm, A0 included).
      - instinct-encoder ONLY: a real cell that is a serve-REFUSED record
        (issue 017 seating) reading STRICTLY BELOW the seated arm is
        DISPLACED — the served answer takes the row, the refused arm's
        own measured cell rides verbatim under `displaced_record`, and
        the fallback_note names the read and the gap. At-or-above the
        seated arm the violet record cell stays (the encoder arm IS the
        family's best measured arm there). Suites with nothing
        measurable to serve (the thai reference reads: no modelless, no
        hybrid) keep their record cells undisplaced.

    The tier's measured cell supplies every NUMBER; the cell is marked
    `serves: tier-fallback` + `served_by` + `derived` so no consumer can
    misread it as this lane's own measurement. A DISCLOSURES note for the
    suite+lane is CONSUMED into the cell (fallback_note) instead of
    rendering as a noneBar. Where even the modelless lane has no cell,
    nothing is derived — the disclosure (if any) stays for the noneBar.
    Idempotent: a fallback cell (hole or displacement) is skipped when it
    occupies the lane key, and a non-refused real cell always wins."""
    known = {s["name"]: s for s in d.get("suites", [])}
    made = 0
    for name, s in known.items():
        disc = s.get("disclosures") or {}
        hybrid = s.get("hybrid")
        modelless = s.get("modelless")
        for lane_key, spec in PRODUCT_LANES.items():
            cell = s.get(spec["key"])
            if cell is not None and not _serve_refused_record(cell):
                continue  # a real serving cell — the lane's own measurement wins
            if lane_key == "instinct":
                source, served_by = modelless, "Reflex (the modelless tier)"
            else:
                source = hybrid or modelless
                served_by = (
                    f"Instinct ({hybrid.get('model', 'the seated arm')})"
                    if hybrid
                    else "Reflex (the modelless tier)"
                )
            if source is None or (source.get("hard") or {}).get("accuracy") is None:
                continue  # nothing measurable serves — the disclosure stays
            if cell is not None:
                # The displacement branch (encoder lane only — a refused
                # record on the instinct lane has no other seated arm to
                # displace to). Strictly below the served arm → displace;
                # at-or-above → the violet record cell stays.
                enc_acc = _cell_acc(cell)
                src_acc = _cell_acc(source)
                if enc_acc is None or enc_acc >= src_acc:
                    continue
                base = disc.pop(lane_key, None)
                record_note = (
                    f"best-of-family (owner 2026-10-02): the encoder arm's "
                    f"own measured read is {enc_acc:.4f}, {src_acc - enc_acc:.4f} "
                    "under the served arm — refused at serve, so the served "
                    "answer is shown; the refused arm's full record rides the "
                    "cell (displaced_record)"
                )
                note = f"{base} — {record_note}" if base else record_note
                fb = fallback_cell(source, spec["display"], served_by, note)
                fb["displaced_record"] = cell
                s[spec["key"]] = fb
                made += 1
                continue
            note = disc.get(lane_key) or (
                "no seated arm for this lane on this suite — the served "
                "answer is the tier shown (the full-coverage serving law, "
                "instinct 057d31a)"
            )
            s[spec["key"]] = fallback_cell(source, spec["display"], served_by, note)
            disc.pop(lane_key, None)
            made += 1
        if disc:
            s["disclosures"] = disc
        else:
            s.pop("disclosures", None)
    if made:
        print(f"fallback cells: derived {made} served-answer cell(s) "
              "for the product lanes")
    return 0


def apply_disclosures(d):
    """Stamp the hand-maintained DISCLOSURES table into the merged doc:
    per-suite {lane_key: note} for lanes that will not run the suite for a
    MEASURED reason. bench-charts.js's noneBar renders the note instead of
    "not run". A name matching no suite in THIS doc is skipped with a loud
    note — the table is hand-maintained against the LIVE board, and a
    prose typo refusing the whole publish would block the board for a
    spelling (the missing disclosure is visible in the page smoke / review
    instead). A disclosure naming a suite+lane that carries a real cell is
    dropped with a loud note (the cell supersedes it). Idempotent by
    construction (a re-stamp of the same note is a no-op)."""
    known = {s["name"]: s for s in d.get("suites", [])}
    for name, notes in DISCLOSURES.items():
        if name not in known:
            print(
                f"note: disclosure skipped — suite {name!r} is not in this "
                "doc (stale table row or synthetic fixture)"
            )
            continue
        s = known[name]
        carried = {}
        for lane_key, note in notes.items():
            # A real cell on the same lane supersedes the disclosure.
            has_cell = (
                (lane_key == "instinct-encoder" and s.get("encoder"))
                or (lane_key == "instinct" and s.get("hybrid"))
            )
            if has_cell:
                print(f"note: disclosure dropped — {name}/{lane_key} carries a cell")
                continue
            carried[lane_key] = note
        if carried:
            s["disclosures"] = {**s.get("disclosures", {}), **carried}
        else:
            s.pop("disclosures", None)
    return 0


def apply_lane_carry(d, incumbent_snapshot, extras):
    """The LANE-CARRY law (LANE_CARRY, Issue 032, owner call 2026-09-26):
    an updated lane of a carried class keeps its fresh ACCURACY columns but
    has its TIMING cells replaced by the host's incumbent run's values, with
    `latency_provenance` naming that source run. The incumbent values come
    from the PRE-MERGE snapshot of the primary doc (its row-level lanes AND
    its extra_host_lanes cover every host the publish knew before this
    run). Without this law a lane-scoped update would silently replace
    validated latency cells with box-invalidated ones — the accuracy
    bit-identity gate cannot see timing.

    Issue 057: the corpus-mismatch exemption (carry_applies) plus the
    one-time PUBLISH_BENCH_CORPUS_RESET ack, whose staleness is adjudicated
    HERE (after the merge, before anything is written)."""
    reset_env = os.environ.get("PUBLISH_BENCH_POPULATION_RESET", "")
    population_reset = {x.strip() for x in reset_env.split(",") if x.strip()}
    corpus_reset = corpus_reset_set()
    corpus_fired = set()
    phost = display_host((d.get("meta") or {}).get("host") or "(primary)")
    for s in d.get("suites", []):
        if s["name"] in population_reset:
            # A population-reset row's incumbent timing measured the OLD
            # questions — carrying it onto the new cells would re-attach
            # stale timing by construction. The update's own timing stands.
            print(
                f"note: PUBLISH_BENCH_POPULATION_RESET — {s['name']} exempt "
                "from LANE_CARRY latency (the incumbent timing measured the "
                "old population; the update's own timing publishes)",
                file=sys.stderr,
            )
            continue
        if s["name"] in corpus_reset:
            # The Issue-057 ack: exempt regardless of digest state, but the
            # ack must EARN its keep — the update cell must carry a fresh
            # corpus_digest that is not already the incumbent's (an ack
            # cannot outlive the corpus change it was written for).
            # The update cell lives at the UPDATING DOC's host slot: a
            # same-host update replaced the row slot, an extra-host doc's
            # lane landed in extra_host_lanes[<host>] — the merged row's
            # own modelless slot still holds the PRIMARY host's cell
            # (measured 2026-09-30, the first live extra-host ack: it read
            # the primary's digest-less cell and refused a fresh
            # post-landing run as stale). Same slot vocabulary as the
            # carry loop below.
            snap0 = next((r for r in incumbent_snapshot.get("suites", [])
                          if r["name"] == s["name"]), None)
            upd_hosts = sorted({e.get("meta", {}).get("host")
                                for e in extras
                                if any(q.get("name") == s["name"]
                                       for q in e.get("suites", []))
                                and e.get("meta", {}).get("host")})
            ack_ok = False
            for uhost in upd_hosts:
                ud = display_host(uhost)
                if ud == phost:
                    upd0 = s.get("modelless")
                else:
                    upd0 = ((s.get("extra_host_lanes") or {})
                            .get(ud, {}) or {}).get("modelless")
                inc0 = _host_lane_slot(snap0, ud, "modelless") if snap0 else None
                up_dg = (upd0 or {}).get("corpus_digest")
                inc_dg = (inc0 or {}).get("corpus_digest")
                # A carried incumbent's digest stamps its ACCURACY merge, not
                # its timing: _carry_into re-attached an older run's latency
                # cells onto the merged cell, so an equal digest does NOT
                # mean the timing measured this corpus (measured 2026-10-01:
                # the m3 primary carried 0.517 ms — old-pool timing — beside
                # Bench 100's new-pool digest, and the equal-digest arm made
                # the cell permanently unrefreshable). The carry note is the
                # proof the timing measured an older corpus; only a cell
                # whose timing is its OWN can make the ack stale.
                inc_carried = bool(
                    ((inc0 or {}).get("latency_provenance") or {}).get("note")
                )
                if up_dg is None:
                    print(
                        f"⛔ refusing: PUBLISH_BENCH_CORPUS_RESET names "
                        f"{s['name']}, but its update cell at {ud} carries "
                        "no corpus_digest — the republish must come from a "
                        "NEW post-landing harness run (reflex 7e03117 "
                        "stamps it); drop the stale ack",
                        file=sys.stderr,
                    )
                    sys.exit(1)
                if inc_dg is not None and up_dg == inc_dg and not inc_carried:
                    print(
                        f"⛔ refusing: PUBLISH_BENCH_CORPUS_RESET names "
                        f"{s['name']}, but its update corpus_digest at {ud} "
                        "already equals the incumbent's — the ack cannot "
                        "outlive the corpus change it was written for; "
                        "drop the stale ack",
                        file=sys.stderr,
                    )
                    sys.exit(1)
                if inc_dg is not None and up_dg == inc_dg and inc_carried:
                    print(
                        f"note: PUBLISH_BENCH_CORPUS_RESET — {s['name']} at "
                        f"{ud}: the incumbent's equal corpus_digest stamps "
                        "its accuracy merge, not its timing (LANE-CARRY "
                        "note present — the timing measured an older "
                        "corpus by construction); the ack refreshes it",
                        file=sys.stderr,
                    )
                print(
                    f"note: PUBLISH_BENCH_CORPUS_RESET — {s['name']} exempt "
                    f"at {ud} from LANE_CARRY latency (the incumbent timing "
                    "measured the old corpus pool; the update's own timing "
                    "publishes, stamped "
                    f"corpus_digest {str(up_dg)[:12]})",
                    file=sys.stderr,
                )
                ack_ok = True
            if ack_ok:
                corpus_fired.add(s["name"])
            continue
        snap = next((r for r in incumbent_snapshot.get("suites", [])
                     if r["name"] == s["name"]), None)
        if snap is None:
            continue
        for lane_key in LANE_CARRY["latency"]:
            for host, target in _host_lane_slots(s, lane_key, phost):
                src_lane = _host_lane_slot(snap, host, lane_key)
                if src_lane is None:
                    continue
                # A lane this publish did not refresh carries its own run's
                # identity on BOTH sides (same `source_run`): re-stamping it
                # as "carried from the incumbent" would serve a provenance
                # note whose implication (accuracy from a newer run than the
                # timing) is false. Only a lane whose accuracy source moved
                # (a real update) is eligible for the carry.
                if target.get("source_run") == src_lane.get("source_run"):
                    continue
                if not carry_applies(src_lane, target,
                                     target.get("latency_quotable"),
                                     suite_name=s["name"]):
                    if carry_beats_incumbent(src_lane,
                                             target.get("latency_quotable")):
                        print(
                            f"note: LANE_CARRY suppressed — {lane_key}@{host}/"
                            f"{s['name']}: the incumbent timing is judged NOT "
                            "QUOTABLE and this update's own timing is quotable; "
                            "the fresh timing publishes (Issue-003 T2 — a carry "
                            "that kept the unfit incumbent would defeat the "
                            "law's own purpose)",
                            file=sys.stderr,
                        )
                    else:
                        print(
                            f"note: LANE_CARRY suppressed — {lane_key}@{host}/"
                            f"{s['name']}: the update's corpus_digest differs "
                            "from the incumbent's; carrying would re-attach "
                            "stale timing by construction (Issue 057). When "
                            "the exemption fires on an unquotable update, the "
                            "cell keeps its own latency_quotable: false stamp "
                            "and the publish wall refuses it — a stale timing "
                            "that looks quotable must not quietly become a "
                            "fresh one that is unjudged",
                            file=sys.stderr,
                        )
                    continue
                _carry_into(target, src_lane)
    stale_corpus = corpus_reset - corpus_fired
    if stale_corpus:
        print(
            f"⛔ refusing: PUBLISH_BENCH_CORPUS_RESET names "
            f"{', '.join(sorted(stale_corpus))}, but no such suite publishes "
            "in this run — a reset ack cannot outlive the corpus change it "
            "was written for",
            file=sys.stderr,
        )
        sys.exit(1)


def _host_lane_slots(suite, lane_key, phost):
    """(host, lane-dict) pairs for lane_key on this suite row: the primary
    host's own slot first, then every extra host's."""
    out = []
    row_lane = suite.get(lane_key)
    if row_lane is not None:
        out.append((phost, row_lane))
    for host, hl in (suite.get("extra_host_lanes") or {}).items():
        l = hl.get(lane_key)
        if l is not None:
            out.append((host, l))
    return out


def _host_lane_slot(snapshot_suite, host, lane_key):
    """The incumbent lane dict for `host` from the pre-merge snapshot. The
    snapshot's row-level slot belongs to its _phost (the primary host);
    every other host's incumbent lives in its extra_host_lanes."""
    if host == snapshot_suite.get("_phost"):
        return snapshot_suite.get(lane_key)
    hl = (snapshot_suite.get("extra_host_lanes") or {}).get(host)
    return (hl or {}).get(lane_key)


def carry_beats_incumbent(incumbent_lane, update_quotable):
    """Issue-003 T2: the one case LANE_CARRY must refuse. The law exists
    so an update never swaps VALIDATED timing for INVALIDATED timing; when
    the INCUMBENT is the invalidated side (verdict False) and the update's
    own fresh timing is quotable (verdict True), carrying would preserve
    exactly that defect forever — an unfit carry could never be replaced.
    Narrow on purpose: an absent/None verdict on either side stays a carry
    (UNKNOWN is not a claim), and a False update is handled by the publish
    wall, not here. `update_quotable` is the UPDATE RUN's verdict — read
    from the merged cell's own stamp in apply_lane_carry (stamped at merge
    from the run that produced the timing the carry would discard), and
    from the raw doc's meta in _latency_slots, whose cells are not stamped
    until merge."""
    return (isinstance(incumbent_lane, dict)
            and incumbent_lane.get("latency_quotable") is False
            and update_quotable is True)


def _carry_into(lane, incumbent):
    if incumbent is None or lane is incumbent:
        return
    for k in LANE_LATENCY_FIELDS:
        if k in incumbent:
            lane[k] = incumbent[k]
    # The verdict travels WITH the timing: the carried cells are the
    # incumbent's, so is their verdict; an incumbent without one leaves
    # the cell UNKNOWN (absent), never the update run's verdict.
    if "latency_quotable" in incumbent:
        lane["latency_quotable"] = incumbent["latency_quotable"]
    else:
        lane.pop("latency_quotable", None)
    lane["latency_provenance"] = {
        "note": "latency cells carried from the host's incumbent run; accuracy is this lane's own (LANE-CARRY, Issue 032)",
    }


# The lane classes a doc can carry. `laya` is a CLASS of checkpoint slots —
# the inventory expands it per checkpoint key, because a publish that drops
# one checkpoint drops published cells even though the class survives.
LANE_CLASSES = ("modelless", "laya", "clm", "gliner", "bekko", "agentjev",
                "hybrid", "encoder", "paw", "paw_local", "openthai")


def lane_inventory(d):
    """The published lane surface as (suite, host, lane-class) triples —
    the set a wholesale replacement must not silently shrink (Issue 034).
    The primary host's lanes live on the suite rows; every other host's in
    its extra_host_lanes. The laya class expands per checkpoint key, and
    every meta.hosts row is part of the surface (a host row that vanishes
    takes its disclosures — absent_suites, lane_sources — with it)."""
    phost = display_host((d.get("meta") or {}).get("host") or "(primary)")
    inv = set()
    for row in (d.get("meta") or {}).get("hosts") or []:
        if row.get("host"):
            inv.add(("(host-row)", row["host"], "host"))
    for s in d.get("suites", []):
        name = s["name"]
        for k in LANE_CLASSES:
            if k == "laya":
                continue
            if s.get(k):
                inv.add((name, phost, k))
        for ck in (s.get("laya") or {}):
            inv.add((name, phost, f"laya:{ck}"))
        for h, hl in (s.get("extra_host_lanes") or {}).items():
            for k in LANE_CLASSES:
                if k == "laya":
                    continue
                if hl.get(k):
                    inv.add((name, h, k))
            for ck in (hl.get("laya") or {}):
                inv.add((name, h, f"laya:{ck}"))
    return inv


def guard_wholesale_replace(d, out_path, primary_path):
    """The Issue 034 wall: a FRESH-DOCS publish (primary is not the
    destination file) over an EXISTING data/bench.json replaces the table
    wholesale, so any published lane slot the incoming docs do not carry
    would vanish silently. Refuse naming the dropped slots; the env
    PUBLISH_BENCH_FULL_REPLACE=1 acknowledges a deliberate replacement
    with a loud disclosure. The UPDATE path (primary IS the destination)
    never reaches this wall — merge() updates known host containers in
    place and cannot drop lanes by construction. Returns the process exit
    code for main() (0 = proceed)."""
    if not out_path.is_file():
        return 0  # first publish — nothing to drop
    if primary_path.resolve() == out_path.resolve():
        return 0  # the update path: the merge preserves by construction
    existing = json.loads(out_path.read_text(encoding="utf-8"))
    dropped = lane_inventory(existing) - lane_inventory(d)
    if not dropped:
        return 0
    names = sorted("/".join(t) for t in dropped)
    sample = ", ".join(names[:8])
    if os.environ.get("PUBLISH_BENCH_FULL_REPLACE") == "1":
        print(
            f"note: PUBLISH_BENCH_FULL_REPLACE=1 — wholesale replacement "
            f"acknowledged: {len(dropped)} published lane slots are being "
            f"dropped (sample: {sample})",
            file=sys.stderr,
        )
        return 0
    print(
        f"⛔ refusing: this publish would silently DROP {len(dropped)} "
        "published lane slots the incoming docs do not carry — the "
        "fresh-docs path replaces the table wholesale (reflex "
        ".issues/034). Publish with the CURRENT data/bench.json as the "
        "PRIMARY (first argument) so these docs land as lane-scoped "
        "updates, or set PUBLISH_BENCH_FULL_REPLACE=1 to acknowledge a "
        f"wholesale replacement. Dropped (sample): {sample}",
        file=sys.stderr,
    )
    return 1


def filter_extras_to_lanes(extras, allowed):
    """The lane-scoped update filter (reflex .issues/033): restrict which
    lane classes the EXTRAS may contribute, dropping every other declared
    lane LOUDLY. Why it exists: a comparison-lane doc carries the
    harness's modelless lane as a by-product, and a PAW run measured on a
    box with a thinner dataset pull (or at an older sample law) would
    otherwise either (a) fail the cross-host drift gate — correct, but it
    blocks the lane the doc exists to publish — or (b) worse, silently
    REPLACE the published (calibrated, same-law) modelless cells with a
    different-posture control column. The filter keeps the publish to the
    lanes the run was FOR. Never applies to the primary: the primary is
    the preservation source and must keep every lane it already carries.
    Drops are disclosed per (suite, lane); the primary is never touched.
    An "lane:acc-only" entry keeps that class but strips its latency
    fields (LANE_LATENCY_FIELDS) with its own disclosure — the source doc
    keeps its measured cells; the site just does not quote them."""
    classes = {c.split(":")[0] for c in allowed}
    acc_only = {c.split(":")[0] for c in allowed if c.endswith(":acc-only")}
    dropped = []
    stripped = []
    for d in extras:
        ehost = (d.get("meta") or {}).get("host") or "(?)"
        for s in d.get("suites", []):
            for k in list(s.keys()):
                if k == "laya" or k not in LANE_CLASSES:
                    continue
                if k not in classes and s.get(k) is not None:
                    del s[k]
                    dropped.append(f"{k}@{ehost}/{s['name']}")
                    continue
                lane = s.get(k)
                if lane is not None and k in acc_only:
                    for f in LANE_LATENCY_FIELDS:
                        lane.pop(f, None)
                    lane.pop("latency_provenance", None)
                    lane.pop("latency_quotable", None)
                    stripped.append(f"{k}@{ehost}/{s['name']}")
            lk = s.get("laya")
            if lk is not None and "laya" not in classes:
                del s["laya"]
                dropped.append(f"laya@{ehost}/{s['name']}")
            elif lk is not None and "laya" in acc_only:
                # laya is a CLASS of checkpoint cells, so the strip walks
                # them (the loop above skips the class key; before
                # 2026-09-27 "laya:acc-only" was accepted and stripped
                # nothing — the publish wall's test found it).
                for ck, cell in lk.items():
                    for f in LANE_LATENCY_FIELDS:
                        cell.pop(f, None)
                    cell.pop("latency_provenance", None)
                    cell.pop("latency_quotable", None)
                    stripped.append(f"laya:{ck}@{ehost}/{s['name']}")
    if dropped:
        print(
            f"note: PUBLISH_BENCH_LANES — dropped {len(dropped)} out-of-scope "
            f"lane slot(s) from the extras: {', '.join(dropped)}",
            file=sys.stderr,
        )
    if stripped:
        print(
            f"note: PUBLISH_BENCH_LANES :acc-only — latency fields stripped "
            f"from {len(stripped)} lane slot(s) (accuracy publishes; the "
            f"source docs keep their measured cells): "
            f"{', '.join(stripped)}",
            file=sys.stderr,
        )
    return extras


def doc_latency_quotable(meta):
    """The run's own Issue-021 box-state verdict, 3-state — the same rule
    as riir-reflex `BoxStateSpan::latency_quotable`: quotable only if BOTH
    ends are; `None` (UNJUDGED) if either end could not be read (a
    non-macOS host, or a pre-021 doc with no `box_state` at all)."""
    bs = (meta or {}).get("box_state") or {}
    a = (bs.get("start") or {}).get("latency_quotable")
    b = (bs.get("end") or {}).get("latency_quotable")
    if a is None or b is None:
        return None
    return bool(a and b)


def _latency_slots(d, incumbent=None):
    """Lane slots of doc `d` whose OWN timing would reach the page.

    Exempt: a lane with no latency field left (an `:acc-only` strip), a
    LANE_CARRY class the incumbent already holds for this host (its
    timing is replaced by the incumbent's), and a device-variant host's
    device-independent lane (merge() skips it). `incumbent` is None for
    the primary — a raw primary carries nothing forward."""
    host = (d.get("meta") or {}).get("host") or "(?)"
    variant = host in DEVICE_VARIANT_HOSTS
    doc_q = doc_latency_quotable(d.get("meta"))
    snaps = {r["name"]: r for r in (incumbent or {}).get("suites", [])}
    out = []
    for s in d.get("suites", []):
        snap = snaps.get(s["name"])
        for k in LANE_CLASSES:
            cells = (list((s.get("laya") or {}).items()) if k == "laya"
                     else [(None, s.get(k))])
            for ck, cell in cells:
                if not isinstance(cell, dict):
                    continue
                if not any(cell.get(f) is not None for f in LANE_LATENCY_FIELDS):
                    continue
                if variant and k not in DEVICE_VARIANT_KEEP:
                    continue
                if snap is not None and k in LANE_CARRY["latency"]:
                    src = _host_lane_slot(snap, host, k)
                    # Issue 057: the SAME predicate the carry loop reads —
                    # a corpus-mismatch slot (or an acked suite's slot) is
                    # JUDGED by the wall instead of assumed-carried, so an
                    # unquotable update on a changed corpus can never dodge
                    # the wall as "will be carried" and then not be carried.
                    if src is not None and carry_applies(src, cell, doc_q,
                                                         suite_name=s["name"]):
                        continue
                label = k if ck is None else f"laya:{ck}"
                out.append(f"{label}@{host}/{s['name']}")
    return out


def guard_unquotable_latency(primary, extras, incumbent):
    """The Issue-021 publish wall: a doc whose own box_state judged its
    latency NOT QUOTABLE must not publish that latency. The harness stamps
    the verdict into every results.json (advisory at measure time, by
    design); this is the half that refuses at PUBLISH time, where the
    number becomes public. Before it existed the check was a process note
    (reflex Bench 067), and a note is what gets skipped.

    Refused docs name their slots and the box's own refusal reasons.
    Remedies: re-run on a fit box, publish accuracy only
    (PUBLISH_BENCH_LANES=<class>:acc-only), or acknowledge by host with
    PUBLISH_BENCH_ALLOW_UNQUOTABLE=<host>[,<host>] — a stale ack (a named
    host with no unquotable latency in this publish) refuses too, so an
    acknowledgement cannot outlive the run it was written for. UNJUDGED
    docs publish with a loud note: the 4090 harness has no box probes, and
    refusing them would block every publish from that host.

    The primary is judged only when it is a RAW harness doc; a published
    bench.json primary (it carries meta.hosts) is the preservation source,
    and its meta.box_state is its original run's, not this publish's."""
    ack_env = os.environ.get("PUBLISH_BENCH_ALLOW_UNQUOTABLE", "")
    ack = {display_host(x.strip()) for x in ack_env.split(",") if x.strip()}
    docs = [(e, incumbent) for e in extras]
    if not (primary.get("meta") or {}).get("hosts"):
        docs.insert(0, (primary, None))
    refused, acked, unjudged = [], set(), []
    for d, inc in docs:
        m = d.get("meta") or {}
        slots = _latency_slots(d, inc)
        if not slots:
            continue
        tag = f"{m.get('host')}@{m.get('git_sha', '?')}"
        q = doc_latency_quotable(m)
        if q is None:
            unjudged.append(tag)
        elif q:
            continue
        elif m.get("host") in ack:
            acked.add(m.get("host"))
            print(f"note: PUBLISH_BENCH_ALLOW_UNQUOTABLE — {tag} latency is "
                  f"NOT QUOTABLE by its own box_state and publishes by "
                  f"acknowledgement ({len(slots)} slot(s))", file=sys.stderr)
        else:
            bs = m.get("box_state") or {}
            reasons = sorted({r for end in ("start", "end")
                              for r in (bs.get(end) or {}).get("refusals") or []})
            refused.append((tag, slots, reasons))
    if unjudged:
        print("note: latency UNJUDGED (no readable box_state: a non-macOS "
              "host or a pre-021 doc) — publishing, disclosed per lane in "
              f"lane_sources: {', '.join(unjudged)}", file=sys.stderr)
    stale = ack - acked
    if stale:
        print(f"⛔ refusing: PUBLISH_BENCH_ALLOW_UNQUOTABLE names "
              f"{', '.join(sorted(stale))}, but no doc from that host "
              "publishes unquotable latency — drop the stale ack",
              file=sys.stderr)
        return 1
    for tag, slots, reasons in refused:
        print(f"⛔ refusing: {tag} judged its own latency NOT QUOTABLE "
              f"({'; '.join(reasons) or 'no reason recorded'}) and would "
              f"publish it on {len(slots)} slot(s) (sample: "
              f"{', '.join(slots[:6])}). Re-run on a fit box "
              "(riir-reflex scripts/bench_preflight.sh), publish accuracy "
              "only (PUBLISH_BENCH_LANES=<class>:acc-only), or acknowledge "
              "with PUBLISH_BENCH_ALLOW_UNQUOTABLE=<host>",
              file=sys.stderr)
    return 1 if refused else 0


def edition_guard():
    """The EDITIONS ledger pin, enforced where it matters: main() refuses
    to write (either path) unless EDITION names the ledger's LAST row AND
    the computed basis digest equals that row's digest (the self-test
    asserts the same arithmetic — case_chance_digest_and_edition_pin). The
    remedy is printed, never guessed: append a new ledger row, point
    EDITION at it, add a data/changes.json row."""
    last = list(EDITIONS)[-1]
    if EDITION != last:
        print(
            f"⛔ refusing: EDITION is {EDITION!r} but the EDITIONS ledger's "
            f"last row is {last!r} — a new edition must APPEND a ledger row "
            "and point EDITION at it (the ledger is append-only; an old "
            "edition cannot become current again)",
            file=sys.stderr,
        )
        return False
    computed = edition_basis_digest()
    if computed != EDITIONS[EDITION]:
        print(
            "⛔ refusing: the scoring basis changed (chance table / area "
            "membership / lane set) without an edition bump — computed "
            f"basis digest {computed}, but the ledger pins "
            f"{EDITIONS[EDITION]!r} for edition {EDITION!r}. APPEND a new "
            f"ledger row (EDITIONS['<new-edition>'] = '{computed}'), point "
            "EDITION at it, and add a data/changes.json row explaining the "
            "change — re-pinning the existing row's digest is exactly what "
            "the ledger exists to refuse",
            file=sys.stderr,
        )
        return False
    return True


def archive_on_edition(out: Path) -> None:
    """Freeze the OUTGOING edition's final table when the edition changes
    (plan 001 task 7): data/archive/bench-<old-edition>.json, once. Runs on
    BOTH write paths — the ordinary publish AND --rederive (the reviewer's
    measured gap: a scoring-basis edit is a derived-only change, and
    --rederive is the path made for exactly that, so an edition bump
    through it must archive too). A within-edition republish archives
    nothing — git history already keeps every per-publish version, and a
    per-publish archive grows without bound for no extra audit value."""
    if not out.exists():
        return
    try:
        prev = json.loads(out.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    prev_ed = (prev.get("meta") or {}).get("edition")
    if not prev_ed or prev_ed == EDITION:
        return
    arch_dir = out.parent / "archive"
    arch_dir.mkdir(parents=True, exist_ok=True)
    arch = arch_dir / f"bench-{prev_ed}.json"
    if arch.exists():
        return
    with open(arch, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(prev, indent=1) + "\n")
    print(f"archived the outgoing edition -> {arch}")


def finalize(d):
    """The shared publish tail (the ordinary merge path AND --rederive):
    sanitize meta, stamp the edition, land the display spellings, recompute
    the derived blocks (pairings, areas, disclosures). Suite MEASUREMENT
    cells are only display-renamed here — never re-measured; the rederive
    path proves that with a byte-identity guard around this call."""
    meta = d.get("meta", {})
    meta["edition"] = EDITION
    for k in DROP_META_KEYS:
        meta.pop(k, None)
    for row in meta.get("hosts", []):
        for k in DROP_META_KEYS:
            row.pop(k, None)
    rename_lanes(d)
    # The tier-fallback derivation (owner 2026-10-02; displacement added
    # same day, best-of-family) runs BEFORE compute_areas: a fallback cell
    # is the ANSWERING tier's measurement, not this lane's own, and
    # _area_lane_cell skips `derived` cells — so neither a hole-fill nor a
    # displacement feeds the lane's areas/timing/frontier summary
    # (double-counting the source tier); the suite renders as a coverage
    # gap on the radar while the per-suite table shows the served answer.
    # It also runs BEFORE apply_disclosures: the fallback consumes a
    # disclosure note into the cell, and a re-stamp of the table drops
    # notes for lanes that carry cells.
    # Idempotent under --rederive: an existing fallback cell occupies the
    # lane key, so the derivation skips and the byte-guard holds (a
    # displaced record canonicalizes to itself in _measurable).
    if apply_fallback_cells(d) != 0:
        return None
    n_paired = compute_pairings(d)
    compute_areas(d)
    if apply_disclosures(d) != 0:
        return None
    for s in d.get("suites", []):
        for host_lanes in (s.get("extra_host_lanes") or {}).values():
            lanes = (
                ([host_lanes["modelless"]] if host_lanes.get("modelless")
                 else [])
                + list((host_lanes.get("laya") or {}).values())
                + ([host_lanes["clm"]] if host_lanes.get("clm") else [])
                + ([host_lanes["gliner"]] if host_lanes.get("gliner") else [])
                + ([host_lanes["bekko"]] if host_lanes.get("bekko") else [])
                + ([host_lanes["agentjev"]] if host_lanes.get("agentjev")
                   else [])
                + ([host_lanes["hybrid"]] if host_lanes.get("hybrid")
                   else [])
                + ([host_lanes["encoder"]] if host_lanes.get("encoder")
                   else [])
                + ([host_lanes["paw"]] if host_lanes.get("paw") else [])
                + ([host_lanes["paw_local"]] if host_lanes.get("paw_local")
                   else [])
                + ([host_lanes["openthai"]] if host_lanes.get("openthai")
                   else [])
            )
            for l in lanes:
                l["lane"] = LANE_DISPLAY.get(l.get("lane"), l.get("lane"))
    return n_paired


def _measurable(s):
    """A suite row minus its DERIVED annotations (pairing verdicts, the
    disclosure stamps) — the identity the rederive byte-guard protects:
    every measurement cell, verbatim. A tier-fallback encoder cell that
    DISPLACED a refused record canonicalizes to that record: the
    measurement is preserved verbatim under displaced_record, so the
    guard compares it there — never the derived wrapper (which would
    refuse the displacement the owner's best-of-family call asked for)
    and never the record's absence (which would let a silent drop pass)."""
    row = {k: v for k, v in s.items() if k not in ("pairing", "disclosures")}
    enc = row.get("encoder")
    if (isinstance(enc, dict) and enc.get("derived")
            and "displaced_record" in enc):
        row["encoder"] = enc["displaced_record"]
    return row


def rederive(path: Path) -> int:
    """Rebuild ONLY the derived blocks of a published bench.json (plan 001:
    the sanctioned way to refresh areas/timing/edition fields without the
    raw harness docs — main() needs results.json inputs, so "re-run the
    publisher" is neither cheap nor guaranteed to reproduce the same file
    when newer runs exist). Loads the published file, runs the shared
    finalize tail, and REFUSES (nothing written) unless every suite's
    measurement cells are byte-identical to what it loaded — the derived
    blocks must never touch measurements. A raw results doc (no meta.hosts)
    is refused: it goes through the ordinary publish, where the merge laws
    apply."""
    if not path.is_file():
        print(f"error: {path} not found", file=sys.stderr)
        return 1
    d = json.loads(path.read_text(encoding="utf-8"))
    if not (d.get("meta") or {}).get("hosts"):
        print(
            "error: --rederive expects a PUBLISHED bench.json (meta.hosts "
            "present) — a raw results doc goes through the ordinary publish",
            file=sys.stderr,
        )
        return 2
    # The retirement filter runs BEFORE the byte-guard snapshot: dropping a
    # retired suite row is the owner-directed change this pass exists to
    # land; the guard then proves every SURVIVING suite's cells untouched.
    drop_retired_suites(d)
    before = json.dumps([_measurable(s) for s in d.get("suites", [])],
                        sort_keys=True)
    n_paired = finalize(d)
    if n_paired is None:
        return 1
    after = json.dumps([_measurable(s) for s in d.get("suites", [])],
                       sort_keys=True)
    if before != after:
        print(
            "⛔ refusing: --rederive mutated suite measurement cells — the "
            "derived blocks must never touch measurements. If this file "
            "carries a legacy lane spelling, re-publish it through the "
            "ordinary path (the display renames are that path's job)",
            file=sys.stderr,
        )
        return 1
    # The archive law runs here too (the reviewer's measured gap): an
    # edition bump through --rederive must freeze the outgoing table before
    # the in-place overwrite, exactly like the ordinary publish.
    archive_on_edition(path)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(d, indent=1) + "\n")
    n_suites = len(d.get("suites", []))
    lanes = len((d.get("areas") or {}).get("lanes") or {})
    print(f"rederived {path} ({n_suites} suites; {lanes} area lanes; "
          f"edition {EDITION}; pairing verdicts: {n_paired}; cells "
          "byte-identical)")
    return 0


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1] == "--rederive":
        if len(sys.argv) != 3:
            print(__doc__)
            return 2
        if not edition_guard():
            return 1
        return rederive(Path(sys.argv[2]))
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    results_paths, site_root = sys.argv[1:-1], Path(sys.argv[-1])
    if not edition_guard():
        return 1
    primary = load_run(results_paths[0])
    extras = [load_run(p) for p in results_paths[1:]]
    # Suite retirement (owner 2026-10-02): dropped at the load boundary of
    # every path — before the guards, the incumbent snapshot, and the merge —
    # so no older results doc can re-grow a retired row.
    drop_retired_suites(primary)
    for e in extras:
        drop_retired_suites(e)
    lanes_env = os.environ.get("PUBLISH_BENCH_LANES", "").strip()
    if lanes_env:
        allowed = {x.strip() for x in lanes_env.split(",") if x.strip()}
        classes = {x.split(":")[0] for x in allowed}
        unknown = classes - set(LANE_CLASSES)
        bad_suffix = {x for x in allowed
                      if ":" in x and not x.endswith(":acc-only")}
        if unknown or bad_suffix:
            print(
                f"⛔ unknown lane class(es) in PUBLISH_BENCH_LANES: "
                f"{', '.join(sorted(unknown | bad_suffix))} — known classes: "
                f"{', '.join(LANE_CLASSES)} (optional ':acc-only' suffix); a "
                "typo must refuse, never publish nothing",
                file=sys.stderr,
            )
            return 2
        extras = filter_extras_to_lanes(extras, allowed)

    # Population identity (site Issue 002 T2): the primary's own lane
    # cells carry their run's cases_digest (new-runner results.json only —
    # older runs disclose via lane_sources run ids instead).
    incumbent = copy.deepcopy(primary)   # pre-merge snapshot: every host's
    _phost = display_host((primary.get("meta") or {}).get("host") or "(primary)")
    for row in incumbent.get("suites", []):   # own lane dicts, before any
        row["_phost"] = _phost                # update replaced them
    rc = guard_unquotable_latency(primary, extras, incumbent)
    if rc != 0:
        return rc
    d = merge(primary, extras)
    apply_lane_carry(d, incumbent, extras)

    # The Issue 034 wall runs BEFORE anything is written: a fresh-docs
    # publish over an existing table must not silently shrink it.
    out = site_root / "data" / "bench.json"
    rc = guard_wholesale_replace(d, out, Path(results_paths[0]))
    if rc != 0:
        return rc

    n_paired = finalize(d)
    if n_paired is None:
        return 1

    # The sanitized file is the ONLY thing the site serves. The outgoing
    # edition's final table freezes first (the plan-001 archive law).
    archive_on_edition(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    # LF line endings EXPLICITLY: a text-mode default write translates
    # \n to os.linesep, so a publish from the Windows box flips the whole
    # file to CRLF and the next POSIX publish diffs every line (measured
    # 2026-09-25 — the committed file was CRLF from a Windows publish).
    # The bytes are host-independent, one more thing the one-publish pass
    # owns end to end.
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(d, indent=1) + "\n")
    n_suites = len(d.get("suites", []))
    hosts = ", ".join(r.get("host", "?")
                      for r in (d.get("meta") or {}).get("hosts", []))
    print(f"published {out} ({n_suites} suites; hosts: {hosts}; edition "
          f"{EDITION}; dropped meta: {', '.join(DROP_META_KEYS)}; pairing "
          f"verdicts: {n_paired})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

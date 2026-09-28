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
"""

import copy
import json
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
    "hybrid": "Instinct (hybrid)",
    # A previously-published bench.json carries the OLD display
    # spelling; re-publishing it as primary must land the new one (the
    # PYTHON_LANE_SPELLINGS dual-spelling law).
    "instinct (hybrid)": "Instinct (hybrid)",
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
            + ([s["agentjev"]] if s.get("agentjev") else [])
            + ([s["hybrid"]] if s.get("hybrid") else [])
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


def stamp_cell(cell, suite, meta=None):
    """Carry the source run's population identity onto the lane cell, and
    (when the run carries a box_state) the run's latency verdict — on the
    CELL, beside the timing it describes, so a LANE_CARRY replaces both
    together (_carry_into) and no row-level field can pair one run's
    verdict with another run's numbers. The run's own identity rides the
    cell too (`source_run`, Issue-003 T4): lane_sources is keyed per
    (host, lane CLASS), so a one-suite update re-labels every suite's
    source there — the cell stamp is the per-suite truth lane_identity
    reads first, and lane_sources stays a host-row summary."""
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
                 + [s.get(k) for k in ("clm", "gliner", "agentjev",
                                       "paw", "paw_local", "hybrid",
                                       "openthai")])
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
                     + [s.get(k) for k in ("clm", "gliner", "agentjev",
                                           "paw", "paw_local", "hybrid",
                                           "openthai")])
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


def apply_lane_carry(d, incumbent_snapshot, extras):
    """The LANE-CARRY law (LANE_CARRY, Issue 032, owner call 2026-09-26):
    an updated lane of a carried class keeps its fresh ACCURACY columns but
    has its TIMING cells replaced by the host's incumbent run's values, with
    `latency_provenance` naming that source run. The incumbent values come
    from the PRE-MERGE snapshot of the primary doc (its row-level lanes AND
    its extra_host_lanes cover every host the publish knew before this
    run). Without this law a lane-scoped update would silently replace
    validated latency cells with box-invalidated ones — the accuracy
    bit-identity gate cannot see timing."""
    reset_env = os.environ.get("PUBLISH_BENCH_POPULATION_RESET", "")
    population_reset = {x.strip() for x in reset_env.split(",") if x.strip()}
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
        snap = next((r for r in incumbent_snapshot.get("suites", [])
                     if r["name"] == s["name"]), None)
        if snap is None:
            continue
        phost = display_host((d.get("meta") or {}).get("host") or "(primary)")
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
                if carry_beats_incumbent(src_lane, target.get("latency_quotable")):
                    print(
                        f"note: LANE_CARRY suppressed — {lane_key}@{host}/"
                        f"{s['name']}: the incumbent timing is judged NOT "
                        "QUOTABLE and this update's own timing is quotable; "
                        "the fresh timing publishes (Issue-003 T2 — a carry "
                        "that kept the unfit incumbent would defeat the "
                        "law's own purpose)",
                        file=sys.stderr,
                    )
                    continue
                _carry_into(target, src_lane)


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
LANE_CLASSES = ("modelless", "laya", "clm", "gliner", "agentjev", "hybrid",
                "paw", "paw_local", "openthai")


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
                    if src is not None and not carry_beats_incumbent(src, doc_q):
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


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    results_paths, site_root = sys.argv[1:-1], Path(sys.argv[-1])
    primary = load_run(results_paths[0])
    extras = [load_run(p) for p in results_paths[1:]]
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

    meta = d.get("meta", {})
    for k in DROP_META_KEYS:
        meta.pop(k, None)
    for row in meta.get("hosts", []):
        for k in DROP_META_KEYS:
            row.pop(k, None)
    rename_lanes(d)
    n_paired = compute_pairings(d)
    for s in d.get("suites", []):
        for host_lanes in (s.get("extra_host_lanes") or {}).values():
            lanes = (
                ([host_lanes["modelless"]] if host_lanes.get("modelless")
                 else [])
                + list((host_lanes.get("laya") or {}).values())
                + ([host_lanes["clm"]] if host_lanes.get("clm") else [])
                + ([host_lanes["gliner"]] if host_lanes.get("gliner") else [])
                + ([host_lanes["agentjev"]] if host_lanes.get("agentjev")
                   else [])
                + ([host_lanes["hybrid"]] if host_lanes.get("hybrid")
                   else [])
                + ([host_lanes["paw"]] if host_lanes.get("paw")
                   else [])
                + ([host_lanes["paw_local"]] if host_lanes.get("paw_local")
                   else [])
                + ([host_lanes["openthai"]] if host_lanes.get("openthai")
                   else [])
            )
            for l in lanes:
                l["lane"] = LANE_DISPLAY.get(l.get("lane"), l.get("lane"))

    # The sanitized file is the ONLY thing the site serves.
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
    hosts = ", ".join(r.get("host", "?") for r in meta.get("hosts", []))
    print(f"published {out} ({n_suites} suites; hosts: {hosts}; dropped "
          f"meta: {', '.join(DROP_META_KEYS)}; pairing verdicts: {n_paired})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

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

Usage:
    python3 publish_bench.py <results-primary.json> [results-extra.json ...] <site-repo-root>

Docs apply in argv order. The first doc's suites shape the tables (run the
superset run first). A previously-published data/bench.json is a valid
primary for a re-publish (its meta.hosts seed the seen-host set).

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
# update run's provenance for exactly the lanes it contributed.
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
        )
        for l in lanes:
            # The model column renders the harness's own field — the modelless
            # lane reports model: "modelless" (a mode, not a checkpoint), the
            # honest cell. Never overwrite it here.
            l["lane"] = LANE_DISPLAY.get(l.get("lane"), l.get("lane"))


def host_row(meta):
    """The per-host meta row: whitelisted run facts only, sanitized."""
    row = {}
    for k in HOST_META_KEYS:
        if k in meta and k not in DROP_META_KEYS:
            row[k] = meta[k]
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
    updated lane's source run is recorded in the host row's lane_sources.

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

    p_suites = {s["name"]: s for s in primary.get("suites", [])}
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
        """The writable lane container for `host` on this suite row."""
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
                print(f"error: host {ehost} has suite {name} which the "
                      f"primary run lacks — publish the superset run as the "
                      "primary (first argument)", file=sys.stderr)
                sys.exit(1)
            # Population guard: a suite row is only mergeable when both
            # hosts answered the SAME question set. code_fixtures harvests
            # fn spans from the repo's own sources at RUNTIME, so its
            # population is commit-relative (28 @77c408e vs 24 post-laya-move)
            # — a cross-population row would publish numbers over different
            # questions under one suite heading. EXCLUDE with a note, never
            # merge.
            if (p.get("n_questions"), p.get("n_cases")) != (
                    s.get("n_questions"), s.get("n_cases")):
                excluded.append(f"{name} (nq {s.get('n_questions')} vs "
                                f"primary {p.get('n_questions')})")
                continue
            entry = host_lane_entry(p, ehost)
            em, el = s.get("modelless"), (s.get("laya") or {})
            if em and not device_variant:
                entry["modelless"] = em
                updated_lanes["modelless"] = True
            elif em:
                skipped_variant_lanes.append(f"modelless@{ehost}")
            for lk, lv in el.items():
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
                entry["clm"] = ec
                updated_lanes["clm"] = True
            elif ec:
                skipped_variant_lanes.append(f"clm@{ehost}")
            # The GLiNER comparison lane (reflex .issues/029): the same
            # carry law as clm — an external reference measured per-host.
            eg = s.get("gliner")
            if eg and not device_variant:
                entry["gliner"] = eg
                updated_lanes["gliner"] = True
            elif eg:
                skipped_variant_lanes.append(f"gliner@{ehost}")
            # The AgentJev comparison lane (reflex .issues/025 amendment
            # 4): the same carry law — an external reference measured
            # per-host.
            ea = s.get("agentjev")
            if ea and not device_variant:
                entry["agentjev"] = ea
                updated_lanes["agentjev"] = True
            elif ea:
                skipped_variant_lanes.append(f"agentjev@{ehost}")
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
    for s in d.get("suites", []):
        snap = next((r for r in incumbent_snapshot.get("suites", [])
                     if r["name"] == s["name"]), None)
        if snap is None:
            continue
        phost = display_host((d.get("meta") or {}).get("host") or "(primary)")
        for lane_key in LANE_CARRY["latency"]:
            for host, target in _host_lane_slots(s, lane_key, phost):
                src_lane = _host_lane_slot(snap, host, lane_key)
                if src_lane is not None:
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


def _carry_into(lane, incumbent):
    if incumbent is None or lane is incumbent:
        return
    for k in LANE_LATENCY_FIELDS:
        if k in incumbent:
            lane[k] = incumbent[k]
    lane["latency_provenance"] = {
        "note": "latency cells carried from the host's incumbent run; accuracy is this lane's own (LANE-CARRY, Issue 032)",
    }

def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    results_paths, site_root = sys.argv[1:-1], Path(sys.argv[-1])
    primary = load_run(results_paths[0])
    extras = [load_run(p) for p in results_paths[1:]]

    incumbent = copy.deepcopy(primary)   # pre-merge snapshot: every host's
    _phost = display_host((primary.get("meta") or {}).get("host") or "(primary)")
    for row in incumbent.get("suites", []):   # own lane dicts, before any
        row["_phost"] = _phost                # update replaced them
    d = merge(primary, extras)
    apply_lane_carry(d, incumbent, extras)

    meta = d.get("meta", {})
    for k in DROP_META_KEYS:
        meta.pop(k, None)
    for row in meta.get("hosts", []):
        for k in DROP_META_KEYS:
            row.pop(k, None)
    rename_lanes(d)
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
            )
            for l in lanes:
                l["lane"] = LANE_DISPLAY.get(l.get("lane"), l.get("lane"))

    # The sanitized file is the ONLY thing the site serves.
    out = site_root / "data" / "bench.json"
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
          f"meta: {', '.join(DROP_META_KEYS)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

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

The bench page renders whatever bench.json carries — regenerating the site
tables is: re-run the harness in riir-reflex, then run this script, commit,
deploy. A hand-typed number on the site is a defect by definition.
"""

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

# Display-only lane spellings. The canonical results.json keeps the machine
# fields ("laya-riir" / "laya-python" / "modelless") — the rename happens
# HERE, the one place every published byte passes through, so a re-publish
# can never drift from the page.
LANE_DISPLAY = {
    "laya-riir": "laya (rust)",
    "laya-python": "laya (python)",
    "modelless": "KatGPT",
}

# Both spellings of the python lane: the machine field in a fresh harness
# doc, and the display name in a previously-published bench.json.
PYTHON_LANE_SPELLINGS = ("laya-python", LANE_DISPLAY["laya-python"])


def rename_lanes(d):
    for s in d.get("suites", []):
        lanes = ([s["modelless"]] if s.get("modelless") else []) + list(
            (s.get("laya") or {}).values()
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
            if em:
                entry["modelless"] = em
                updated_lanes["modelless"] = True
            for lk, lv in el.items():
                entry.setdefault("laya", {})[lk] = lv
                updated_lanes[f"laya:{lk}"] = True
                if lv.get("lane") in PYTHON_LANE_SPELLINGS:
                    python_lanes = True
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
            # riir-reflex Issue 025 T4: the python-lane posture is a LANE
            # fact, not a run fact. An update that contributes python lanes
            # must replace the row's "off", or the published file says "off"
            # beside python numbers.
            if python_lanes and "laya_python_lane" in emeta:
                row["laya_python_lane"] = emeta["laya_python_lane"]
                if ehost == phost:
                    pmeta["laya_python_lane"] = emeta["laya_python_lane"]

    # FINAL-state cross-host drift gate (Issue 018 T7, mechanized on the
    # state that would be published): every host carrying the modelless
    # lane on a suite must agree on its accuracy — pairwise among ALL
    # hosts, not only against the primary (a suite the primary itself
    # lacks modelless on is still checked between the extras).
    for name, p in p_suites.items():
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


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    results_paths, site_root = sys.argv[1:-1], Path(sys.argv[-1])
    primary = load_run(results_paths[0])
    extras = [load_run(p) for p in results_paths[1:]]

    d = merge(primary, extras)

    meta = d.get("meta", {})
    for k in DROP_META_KEYS:
        meta.pop(k, None)
    for row in meta.get("hosts", []):
        for k in DROP_META_KEYS:
            row.pop(k, None)
    rename_lanes(d)
    for s in d.get("suites", []):
        for host_lanes in (s.get("extra_host_lanes") or {}).values():
            lanes = ([host_lanes["modelless"]] if host_lanes.get("modelless")
                     else []) + list((host_lanes.get("laya") or {}).values())
            for l in lanes:
                l["lane"] = LANE_DISPLAY.get(l.get("lane"), l.get("lane"))

    # The sanitized file is the ONLY thing the site serves.
    out = site_root / "data" / "bench.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(d, indent=1) + "\n", encoding="utf-8")
    n_suites = len(d.get("suites", []))
    hosts = ", ".join(r.get("host", "?") for r in meta.get("hosts", []))
    print(f"published {out} ({n_suites} suites; hosts: {hosts}; dropped "
          f"meta: {', '.join(DROP_META_KEYS)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

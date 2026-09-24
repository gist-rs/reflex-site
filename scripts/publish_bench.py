#!/usr/bin/env python3
"""Publish the harness results to the arena site (Plan 606 T3.2; Issue 018 T5
extends it to the per-host fleet merge).

Copies riir-reflex's `.benchmarks/001_phase1_tables/results.json` into the
site repo's `data/bench.json` after SANITIZING machine-local fields (the
leak-scan discipline applied to the site: the raw file carries the local
datasets path, e.g. /Users/<user>/... — that never leaves the box).

Issue 018 T5 — the multi-host merge (the healqual fleet-join precedent):
bench data from additional hosts (e.g. the 4090-windows lane) is MERGED,
never overwritten. The primary run (first input) keeps its exact published
shape; every extra run contributes per-suite `extra_host_lanes` plus one
`meta.hosts` row. The modelless lane's cross-host bit-identity claim is
MECHANIZED here: any modelless accuracy drift between hosts is a REFUSAL
(the stop-and-file gate of Issue 018 T7 — never a publish).

Usage:
    python3 publish_bench.py <results-primary.json> [results-extra.json ...] <site-repo-root>

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

# Display-only lane spellings. The canonical results.json keeps the machine
# fields ("laya-riir" / "laya-python" / "modelless") — the rename happens
# HERE, the one place every published byte passes through, so a re-publish
# can never drift from the page.
LANE_DISPLAY = {
    "laya-riir": "laya (rust)",
    "laya-python": "laya (python)",
    "modelless": "KatGPT",
}


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
    """Merge extra runs into the primary document (Issue 018 T5/T7).

    Returns the merged document. REFUSES on modelless accuracy drift — the
    modelless lane's cross-host bit-identity is the determinism claim; drift
    is a stop-and-file gate, never a publish.
    """
    pmeta = dict(primary.get("meta") or {})
    hosts = [host_row(pmeta)]
    p_suites = {s["name"]: s for s in primary.get("suites", [])}

    for extra in extras:
        emeta = extra.get("meta") or {}
        ehost = emeta["host"]
        row = host_row(emeta)
        absent = []
        excluded = []
        for s in extra.get("suites", []):
            name = s["name"]
            p = p_suites.get(name)
            if p is None:
                print(f"error: extra host {ehost} has suite {name} which the "
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
            pm, em = p.get("modelless"), s.get("modelless")
            if pm and em:
                pa, ea = (pm.get("hard") or {}).get("accuracy"), (
                    em.get("hard") or {}
                ).get("accuracy")
                if pa is not None and ea is not None and pa != ea:
                    print(
                        f"⛔ modelless accuracy DRIFT on {name}: primary "
                        f"{pa!r} vs {ehost} {ea!r} — the cross-host "
                        "bit-identity claim FAILED (Issue 018 T7); stop and "
                        "file, never publish",
                        file=sys.stderr,
                    )
                    sys.exit(1)
            entry = p.setdefault("extra_host_lanes", {}).setdefault(ehost, {})
            if em:
                entry["modelless"] = em
            if s.get("laya"):
                entry["laya"] = s["laya"]
        absent = [n for n in p_suites if n not in
                  {s["name"] for s in extra.get("suites", [])}]
        if absent:
            row["absent_suites"] = absent
        if excluded:
            row["excluded_suites"] = excluded
        hosts.append(row)

    pmeta["hosts"] = hosts
    primary["meta"] = pmeta
    return primary


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    results_paths, site_root = sys.argv[1:-1], Path(sys.argv[-1])
    primary = load_run(results_paths[0])
    extras = [load_run(p) for p in results_paths[1:]]

    seen = {(primary.get("meta") or {}).get("host")}
    for d in extras:
        h = (d.get("meta") or {}).get("host")
        if h in seen:
            print(f"error: host {h} appears twice — one run per host",
                  file=sys.stderr)
            return 1
        seen.add(h)

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

#!/usr/bin/env python3
"""Backfill each published lane cell's `latency_quotable` from its SOURCE
run's own box_state (2026-09-27, the Issue-021 wall's data half).

publish_bench.py stamps the verdict on every cell it merges from now on;
cells published before that carry none. This resolves them from the
recorded run docs, never by hand:

    python3 scripts/backfill_latency_verdicts.py <docs-root> [<docs-root> ...] <site-root>
    python3 scripts/backfill_latency_verdicts.py ../riir-reflex/.benchmarks . --write

Resolution is by TIMING IDENTITY: a cell's (host, suite, lane, p50, p99,
seconds) is matched against every `results.json` under the docs roots.
Two keys that look sufficient are not:
  - `lane_sources` is keyed per (host, lane), NOT per suite, so a
    one-suite update re-labels that lane's source on every suite (the
    Bench 067 typed-only update claims 5ada17a for 15 suites' laya:english
    cells, 14 of which came from 062).
  - a LANE_CARRY cell shows the INCUMBENT run's timing beside a newer
    run's accuracy, so any run-id key names the wrong run for its timing.
The wall-clock `seconds` float makes the timing key effectively unique.

Verdicts: a unique match (or several matches that agree) sets the cell's
verdict; no match, or matches that DISAGREE, leave the key ABSENT
(unknown) and are listed — never guessed. A cell that already carries a
verdict is left alone. Dry run by default; --write applies.
"""

import json
import sys
from pathlib import Path

import importlib.util

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

_spec = importlib.util.spec_from_file_location(
    "publish_bench", Path(__file__).resolve().parent / "publish_bench.py")
pb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pb)


def _cells(lanes):
    """(lane_key, cell) pairs of one host's lane container."""
    for k in pb.LANE_CLASSES:
        if k == "laya":
            for ck, cell in (lanes.get("laya") or {}).items():
                if isinstance(cell, dict):
                    yield f"laya:{ck}", cell
        elif isinstance(lanes.get(k), dict):
            yield k, lanes[k]


def timing_key(host, suite, lane_key, cell):
    """The cell's timing identity, or None when it carries no timing."""
    t = (cell.get("latency_p50_ms"), cell.get("latency_p99_ms"), cell.get("seconds"))
    if all(v is None for v in t):
        return None
    return (host, suite, lane_key) + t


def index_docs(docs):
    """{timing_key: set(verdicts)} over raw harness docs (paths or dicts)."""
    idx = {}
    for d in docs:
        m = d.get("meta") or {}
        host = pb.display_host(m.get("host"))
        q = pb.doc_latency_quotable(m)
        for s in d.get("suites", []):
            for lk, cell in _cells(s):
                key = timing_key(host, s["name"], lk, cell)
                if key is not None:
                    idx.setdefault(key, set()).add(q)
    return idx


def backfill(bench, idx):
    """Stamp resolvable verdicts in place; returns the tally + lists."""
    phost = (bench.get("meta") or {}).get("host")
    tally = {"set_true": 0, "set_false": 0, "set_null": 0, "had": 0,
             "no_timing": 0}
    unresolved, conflict = [], []
    for s in bench.get("suites", []):
        containers = [(phost, s)] + list((s.get("extra_host_lanes") or {}).items())
        for host, lanes in containers:
            for lk, cell in _cells(lanes):
                key = timing_key(host, s["name"], lk, cell)
                tag = f"{lk}@{host}/{s['name']}"
                if key is None:
                    tally["no_timing"] += 1
                    continue
                if "latency_quotable" in cell:
                    tally["had"] += 1
                    continue
                qs = idx.get(key)
                if not qs:
                    unresolved.append(tag)
                elif len(qs) > 1:
                    conflict.append(tag)
                else:
                    q = next(iter(qs))
                    cell["latency_quotable"] = q
                    tally["set_true" if q is True else "set_false" if q is False
                          else "set_null"] += 1
    return tally, unresolved, conflict


def selftest():
    run = lambda host, q, p50, secs: {
        "meta": {"host": host, "git_sha": "x", "box_state": {
            "start": {"latency_quotable": q}, "end": {"latency_quotable": q}}},
        "suites": [{"name": "s1", "laya": {"english": {
            "latency_p50_ms": p50, "latency_p99_ms": 2.0, "seconds": secs}}}]}
    idx = index_docs([run("m3", True, 1.0, 10.5), run("m3", False, 7.0, 11.5),
                      run("m3", True, 3.0, 12.5), run("m3", False, 3.0, 12.5)])
    bench = {"meta": {"host": "m3-max-metal"}, "suites": [{"name": "s1", "laya": {
        "english": {"latency_p50_ms": 1.0, "latency_p99_ms": 2.0, "seconds": 10.5},
        "typed": {"latency_p50_ms": 9.0, "latency_p99_ms": 2.0, "seconds": 99.0},
        "py/english": {"latency_p50_ms": 7.0, "latency_p99_ms": 2.0,
                       "seconds": 11.5, "latency_quotable": True},
        "multilingual": {"hard": {"accuracy": 0.5}}}}]}
    # host display rename applies to raw docs: "m3" indexes as m3-max-metal
    t, unres, conf = backfill(bench, idx)
    lk = bench["suites"][0]["laya"]
    assert lk["english"]["latency_quotable"] is True, "a unique match sets"
    assert "latency_quotable" not in lk["typed"] and unres == ["laya:typed@m3-max-metal/s1"], \
        "no match stays ABSENT and is listed"
    assert lk["py/english"]["latency_quotable"] is True and t["had"] == 1, \
        "an existing verdict is never overwritten"
    assert t["no_timing"] == 1, "an accuracy-only cell has nothing to judge"
    bench2 = {"meta": {"host": "m3-max-metal"}, "suites": [{"name": "s1", "laya": {
        "english": {"latency_p50_ms": 3.0, "latency_p99_ms": 2.0, "seconds": 12.5}}}]}
    _, _, conf = backfill(bench2, idx)
    assert conf == ["laya:english@m3-max-metal/s1"] and \
        "latency_quotable" not in bench2["suites"][0]["laya"]["english"], \
        "matches that DISAGREE stay absent — never pick one"


def main():
    selftest()
    args = [a for a in sys.argv[1:] if a != "--write"]
    write = "--write" in sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 2
    roots, site = [Path(a) for a in args[:-1]], Path(args[-1])
    paths = sorted({p for r in roots for p in r.rglob("results.json")})
    docs = []
    for p in paths:
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            print(f"⛔ unreadable doc {p}: {e}", file=sys.stderr)
            return 2
        if (d.get("meta") or {}).get("host"):
            docs.append(d)
    if not docs:
        print("⛔ no results.json with a meta.host under the docs roots — "
              "refusing to report a confident zero", file=sys.stderr)
        return 2
    out = site / "data" / "bench.json"
    bench = json.loads(out.read_text(encoding="utf-8"))
    tally, unresolved, conflict = backfill(bench, index_docs(docs))
    print(f"indexed {len(docs)} docs; cells: {tally}")
    if unresolved:
        print(f"unresolved (left absent = unknown) {len(unresolved)}: "
              f"{', '.join(unresolved)}")
    if conflict:
        print(f"conflicting matches (left absent) {len(conflict)}: "
              f"{', '.join(conflict)}")
    if write:
        with open(out, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(bench, indent=1) + "\n")
        print(f"wrote {out}")
    else:
        print("dry run — pass --write to apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())

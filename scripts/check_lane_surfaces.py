#!/usr/bin/env python3
"""The lane-surface completeness gate (the 2026-11-02 lesson): a lane that
joins the publisher's LANE_CLASSES must join EVERY surface that renders or
compares lanes - the page is one verdict in many files, and the hand-typed
lists have no compiler.

Added after the mammoth publish shipped with the publisher registries green
but THREE frontend surfaces blind: the bench palette + size families
(bench-charts.js) and the instinct board's rival lists (instinct.js) had no
mammoth row, so the teacher's cells published while the loss rows stayed
silent about it - the owner had to ask where it was (the exact
can't-see-it failure this gate exists to refuse).

Checks (both directions, membership):
  1. bench-charts.js: every LANE_CLASSES class has a palette entry
     (key: "<class>").
  2. bench-charts.js MODEL_FAMILIES: every class whose palette entry
     carries sizeFrom: "family" has a family row (a size label needs
     its model regex; a size the card can't state says so on the entry -
     the drex precedent: no sizeFrom instead of a guessed size).
  3. instinct.js: every class appears in the rival-list arrays (the
     push(hl[k], host) enumerations) - except the exceptions below.
  4. publish_bench.py: every class has a merge block (s.get("<class>")),
     a LANE_KIND row, a LANE_TIMING row, and an AREA_LANES row.

Documented exceptions (reason per row, both directions - a stale
exception reds):
  - "python": the laya python-subprocess twin merges under the laya class
    (LANE_KIND carries it; no standalone surface rows).
  - "modelless", "hybrid", "encoder", "laya": product/family lanes - the
    instinct board's FAMILY arms, never rivals of themselves; the palette
    carries them, the rival lists deliberately do not.
"""
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
EXCEPTIONS_RIVAL_LISTS = {"modelless", "hybrid", "encoder", "laya", "python"}

def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)

def main():
    pb = (SITE / "scripts" / "publish_bench.py").read_text(encoding="utf-8")
    charts = (SITE / "assets" / "bench-charts.js").read_text(encoding="utf-8")
    instinct = (SITE / "assets" / "instinct.js").read_text(encoding="utf-8")

    m = re.search(r"LANE_CLASSES = \(([^)]*)\)", pb)
    if not m:
        fail("publish_bench.py: LANE_CLASSES not found")
    classes = sorted(re.findall(r'"([a-z_:]+)"', m.group(1)))
    if not classes:
        fail("publish_bench.py: LANE_CLASSES parsed empty")

    problems = []

    # 1. palette entries — class -> the palette key that renders it
    # (the product lanes display under their own keys; paw_local renders
    # under the paw prefix matcher).
    PALETTE_KEY = {"modelless": "katgpt", "hybrid": "instinct",
                   "encoder": "instinct-encoder", "laya": "rust",
                   "python": "python", "paw_local": "paw"}
    for c in classes:
        want = PALETTE_KEY.get(c, c)
        if not re.search(rf'key: "{re.escape(want)}"', charts):
            problems.append(f"bench-charts.js LANES: no palette entry for '{c}' (key '{want}')")

    # 2. size families for sizeFrom: family entries (keyed by palette key)
    for c in classes:
        want = PALETTE_KEY.get(c, c)
        pm = re.search(r'\{ key: "' + re.escape(want) + r'"[^}]*\}', charts)
        if pm and 'sizeFrom: "family"' in pm.group(0):
            fam = re.search(r"MODEL_FAMILIES = \[(.*?)\];", charts, re.S)
            if not fam or not re.search(r'name: "' + re.escape(c), fam.group(1)):
                problems.append(
                    f"bench-charts.js MODEL_FAMILIES: '{c}' is sizeFrom:family "
                    "but has no family row (a size label needs its model regex; "
                    "state the size or drop sizeFrom - never guess)")

    # 2b. bench-charts.js cell walkers (allLanes + extraLanes): a lane
    # missing from these renders "not run" with published cells (the pplx
    # 2026-10-09 precedent, the mammoth 2026-11-02 repeat). The single-cell
    # walkers use s.<c> / hl.<c>; laya enumerates its dict; the product
    # lanes are covered.
    walker_exceptions = {"laya", "python", "modelless", "hybrid", "encoder"}
    for c in classes:
        if c in walker_exceptions:
            continue
        key = PALETTE_KEY.get(c, c)
        if f"s.{key})" not in charts and f"if (s.{key})" not in charts:
            problems.append(
                f"bench-charts.js allLanes: '{c}' not enumerated "
                '(renders "not run" beside published cells)')
        if f"hl.{key})" not in charts and f"if (hl.{key})" not in charts:
            problems.append(
                f"bench-charts.js extraLanes: '{c}' not enumerated "
                '(renders "not run" beside published cells)')

    # 3. instinct.js rival lists: a class is covered when it appears in
    # ANY bracketed string array that also carries "hybrid", "encoder"
    # (the two tail markers every rival list shares).
    rival_arrays = re.findall(r"\[[^\]]*\]", instinct)
    rival_text = " ".join(a for a in rival_arrays
                          if '"hybrid", "encoder"' in a)
    for c in classes:
        if c in EXCEPTIONS_RIVAL_LISTS:
            continue
        if f'"{c}"' not in rival_text:
            problems.append(
                f"instinct.js rival lists: '{c}' absent from the compared-lane "
                "arrays (the loss rows stay silent about it - the mammoth miss)")

    # 4. publisher curated rows
    kind_block = pb.split("LANE_KIND = {")[1].split("}")[0]
    timing_block = pb.split("LANE_TIMING = {")[1].split("\n    },")[0]
    for c in classes:
        if f'"{c}"' not in kind_block:
            problems.append(f"publish_bench.py LANE_KIND: no row for '{c}'")
        if not re.search(rf'"{re.escape(c)}": \{{\s*\n\s*"clock"', pb):
            problems.append(f"publish_bench.py LANE_TIMING: no row for '{c}'")
        if f's.get("{c}")' not in pb:
            problems.append(f"publish_bench.py merge: no s.get('{c}') block")
        # the display passes (primary doc + extras sanitize) enumerate lanes
        # by hand - a lane missing from either publishes under its raw name
        # (the mammoth detour, 2026-11-02: the merge renamed, the display
        # pass did not know the lane, the raw name shipped). Exception:
        # "laya" enumerates as a dict (s.get("laya") or {}).values() - the
        # per-checkpoint shape; "python" merges under laya.
        if c in ("laya", "python"):
            continue
        if f'([s["{c}"]] if s.get("{c}")' not in pb:
            problems.append(
                f"publish_bench.py primary display pass: '{c}' not in the "
                "hand-built lane enumeration (publishes raw)")
        if f'host_lanes["{c}"]' not in pb:
            problems.append(
                f"publish_bench.py extras sanitize pass: '{c}' not in the "
                "hand-built enumeration (publishes raw)")
        if f'("{c}", "' not in pb:
            problems.append(f"publish_bench.py AREA_LANES: no row for '{c}'")

    if problems:
        for p in problems:
            print(f"FAIL: {p}")
        print(f"lane-surface gate: {len(problems)} problem(s) over {len(classes)} lane classes - "
              "a lane is one verdict in many files; every file must know it")
        sys.exit(1)
    print(f"lane-surface gate: PASS - {len(classes)} lane classes, every surface knows every lane")

if __name__ == "__main__":
    main()

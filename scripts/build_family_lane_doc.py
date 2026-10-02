#!/usr/bin/env python3
"""Build the Bench-049 INSTINCT lane doc (the six harness families'
artifact-less A0 serving posture) — the lane doc reflex-site's
publish_bench.py merges as an extra doc, in the same shape the arena's
hybrid_lane_doc.json carries.

The FULL-COVERAGE SERVING posture (owner call 2026-10-02, instinct
commit 057d31a): the serve binary answers every board suite; on the six
harness families the manifest rows carry NO artifact digest — the lane
IS the modelless tier (HybridLane::ReflexOnly, byte-identical to A0).
The served arm's frozen read is Bench 049 (the current-posture
re-baseline — the stale Bench-011 numbers predate reflex posture work;
Bench 049's A0 identity pin passed arena == reflex run() on all six).

Every number is READ from the record — nothing is typed:
  predictions.json  → per-suite accuracy + n + n_cases/n_questions
  registration.json → p99_us + consult per suite
  own_durs_us       → the per-case µs array → p50

Usage: build_family_lane_doc.py <instinct-repo-root>
Writes hybrid_lane_doc.json beside the record (the arena's own lane-doc
filename, so the publish flow needs no new spelling).
"""
from __future__ import annotations

import json
import statistics
import subprocess
import sys
from pathlib import Path

RECORD = "049_family_full_coverage"
SUITES = (
    "harness_visibility",
    "harness_permissions",
    "harness_tool_fit",
    "harness_routing",
    "harness_sensitivity",
    "harness_cache_reuse",
)
# The gate text per suite: the serving-law citation + the specialist-scope
# reason (prose, not numbers — every NUMBER below is read from the record).
GATE = (
    "the artifact-less A0 row serves (instinct commit 057d31a, owner "
    "full-coverage call 2026-10-02): the modelless tier IS the served arm "
    "— no defensible specialist exists on the n={n} template-shared eval "
    "(instinct issue 008 T8's specialist-lane scope); Bench 049 "
    "re-baselines the read at the current posture (arena == reflex run() "
    "byte-exact on all six)."
)


def git_sha(root: Path) -> str:
    out = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=root, capture_output=True, text=True,
    )
    return out.stdout.strip() if out.returncode == 0 else "unknown"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    root = Path(sys.argv[1])
    rec = root / ".benchmarks" / RECORD
    preds = json.loads((rec / "predictions.json").read_text(encoding="utf-8"))
    reg = {r["suite"]: r for r in json.loads(
        (rec / "registration.json").read_text(encoding="utf-8"))}

    suites = []
    for name in SUITES:
        row = next(
            (s for s in preds["frozen_test_predictions"] if s["suite"] == name),
            None,
        )
        if row is None:
            print(f"error: {RECORD} lacks {name}", file=sys.stderr)
            return 1
        arm = next((a for a in row["arms"] if a["name"] == "A0"), None)
        if arm is None:
            print(f"error: {RECORD}/{name} lacks the A0 arm", file=sys.stderr)
            return 1
        n = len(arm["picks"])
        acc = arm["accuracy"]
        # Registration row: consult + p99 (measured); p50 from the per-case
        # µs array (measured).
        rrow = reg.get(name, {})
        rows = rrow.get("rows") or []
        a0reg = next((r for r in rows if r.get("arm") == "A0"), {})
        durs = sorted(arm.get("own_durs_us") or [])
        p50_us = statistics.median(durs) if durs else a0reg.get("p99_us")
        p99_us = a0reg.get("p99_us")
        consult = a0reg.get("consult", 0.0)
        suites.append({
            "name": name,
            "n_questions": row.get("n_questions"),
            "n_cases": row.get("n_cases"),
            "hybrid": {
                "lane": "Instinct",
                "model": "A0 (artifact-less — the modelless tier serves)",
                "hard": {"n": n, "accuracy": acc},
                "consult_rate": consult,
                "latency_scope": "seat+arm",
                "latency_rows": "questions",
                "latency_p50_ms": round(p50_us / 1000.0, 3),
                "latency_p99_ms": round((p99_us or p50_us) / 1000.0, 3),
                "serves": "A0 — the served arm (full-coverage serving, "
                          "instinct 057d31a)",
                "gate": GATE.format(n=n),
                "record": RECORD,
            },
        })

    doc = {
        "meta": {
            "host": "m3",
            "git_sha": git_sha(root),
            "date_utc": subprocess.run(
                ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"],
                capture_output=True, text=True,
            ).stdout.strip(),
            "profile": "release",
            "laya_feature": False,
            "lane_note": "instinct family lane doc (Bench 049, AUTO-BUILT "
                         "from the record by build_family_lane_doc.py): the "
                         "six harness families' artifact-less A0 serving "
                         "posture — the modelless tier IS the served arm "
                         "(full-coverage serving, owner 2026-10-02); every "
                         "number is read from the Bench-049 record.",
        },
        "suites": suites,
    }
    out = rec / "hybrid_lane_doc.json"
    out.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(suites)} hybrid cells)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

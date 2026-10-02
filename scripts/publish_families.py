#!/usr/bin/env python3
"""Build the quarantined families section data — data/families.json.

Plan 009 REVISED-2 (reflex issue 059, the owner's display-only call): the six
harness decision-point families render on their OWN page from their OWN data
file. Every number is READ from the records — nothing is typed:

  reflex  .benchmarks/105_families_wide_eval_tables/results.json
          → the Reflex (modelless) cells: the run() posture on the wide eval
            (acc / abstain / selective acc / p50 / p99).
  instinct .benchmarks/0051_families_wide_eval/RESULTS.md + predictions.json
          → the Rethink (hybrid) cells: the A0 seat-posture frozen read
            (verdict a0_stands on all six — no specialist artifacts).
  encoder → deliberately ABSENT (None): riir-train heads on the family
            corpora are an unmade owner call — the page renders "not run"
            (pending-not-zero law; never a zero-fill).

QUARANTINE (the plan's non-goal, asserted by the self-test): publish_bench.py
never reads this file, and nothing here touches bench.json's areas/cc/index
math.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parents[1]

# The record paths, relative to the workspace root (the site checkout's
# parent). Overridable for tests.
REFLEX_RESULTS = "riir-reflex/.benchmarks/105_families_wide_eval_tables/results.json"
REFLEX_RECORD_DOC = "../riir-reflex/.benchmarks/105_families_wide_eval.md"
INSTINCT_RESULTS = "riir-instinct/.benchmarks/0051_families_wide_eval/predictions.json"
INSTINCT_RECORD_DOC = "../riir-instinct/.benchmarks/0051_families_wide_eval"

# The verbatim caveat (reflex issue 059 — the section must not ship without
# it; the page renders it and the data file carries the same bytes).
CAVEAT = (
    "Honest caveat — self-authored fixtures. These six families are our own "
    "synthetic decision-point fixtures, not standardized external benchmarks. "
    "Gates prevent train/eval token leakage, but the question styles, "
    "distractors and class balance are ours. These numbers measure how our "
    "lanes behave on our own fixture distribution — engineering signal, not "
    "capability claims. Not comparable to the dataset-suite board or to the "
    "Jev Decision Index."
)

# Chance tier per family (1/|labels|) — shown beside each accuracy so the
# near-chance reads are legible as what they are.
CHANCE = {
    "harness_visibility": 0.25,
    "harness_permissions": 1.0 / 3,
    "harness_tool_fit": 0.17,
    "harness_routing": 0.25,
    "harness_sensitivity": 0.20,
    "harness_cache_reuse": 0.50,
}

FAMILY_ORDER = (
    "harness_visibility",
    "harness_permissions",
    "harness_tool_fit",
    "harness_routing",
    "harness_sensitivity",
    "harness_cache_reuse",
)


def git_sha(repo: Path) -> str:
    out = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], cwd=repo, capture_output=True, text=True
    )
    return out.stdout.strip() if out.returncode == 0 else "unknown"


def load_reflex_modelless(results_path) -> dict:
    """results.json (path or parsed dict) → {family: modelless cell}."""
    if isinstance(results_path, dict):
        data = results_path
    else:
        data = json.loads(Path(results_path).read_text(encoding="utf-8"))
    cells = {}
    for suite in data.get("suites", []):
        m = suite.get("modelless")
        if not m:
            continue
        cells[suite["name"]] = {
            "acc": m["hard"]["accuracy"],
            "n": m.get("n_questions") or m.get("n_cases"),
            "abstain_rate": m["raw_abstain"]["abstain_rate"],
            "selective_acc": m["raw_abstain"]["selective_accuracy"],
            "p50_ms": m["latency_p50_ms"],
            "p99_ms": m["latency_p99_ms"],
            "deterministic": bool(m["determinism_ok"]),
        }
    return cells


def load_instinct_hybrid(results_path) -> dict:
    """predictions.json (path or parsed dict) → {family: hybrid cell}. The
    A0 arm's accuracy + the per-question abstain count (predictions carry
    `abstained`)."""
    if isinstance(results_path, dict):
        data = results_path
    else:
        data = json.loads(Path(results_path).read_text(encoding="utf-8"))
    cells = {}
    for suite in data.get("frozen_test_predictions", []):
        name = suite.get("suite") or suite.get("name")
        arms = suite.get("test_arms") or suite.get("arms") or []
        a0 = next((a for a in arms if a.get("name") == "A0"), None)
        if a0 is None:
            continue
        preds = a0.get("predictions") or []
        abstained = sum(1 for p in preds if p.get("abstained"))
        cell = {
            "acc": a0.get("accuracy"),
            "n": a0.get("n"),
            "verdict": suite.get("verdict") or a0.get("verdict") or "a0_stands",
        }
        if preds:
            cell["abstain_rate"] = round(abstained / len(preds), 6)
        cells[name] = cell
    return cells


def build_families(
    modelless: dict, hybrid: dict, shas: dict, cache_note: str
) -> dict:
    """The pure assembly — the self-test drives this directly."""
    families = []
    for name in FAMILY_ORDER:
        chance = CHANCE[name]
        n = (modelless.get(name) or {}).get("n") or (hybrid.get(name) or {}).get("n")
        families.append(
            {
                "name": name,
                "chance": round(chance, 4),
                "modelless": modelless.get(name),
                "hybrid": hybrid.get(name),
                "encoder": None,
            }
        )
        # n rides the top level for the page's column; prefer the reflex
        # population (the eval), falling back to the arena's.
        families[-1]["n"] = (modelless.get(name) or {}).get("n") or n
    return {
        "meta": {
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "caveat": CAVEAT,
            "quarantine": (
                "This file feeds ONLY the /families/ section. It is never "
                "ingested by publish_bench.py and never touches bench.json's "
                "areas/cc/index math."
            ),
            "provenance": {
                "modelless": {
                    "repo": "riir-reflex",
                    "record": REFLEX_RECORD_DOC,
                    "sha": shas.get("reflex", "unknown"),
                    "posture": "harness run() baseline (nb_scale 0), wide eval",
                },
                "hybrid": {
                    "repo": "riir-instinct",
                    "record": INSTINCT_RECORD_DOC,
                    "sha": shas.get("instinct", "unknown"),
                    "posture": "A0 seat posture (head/nb/oc/ridge selects), wide eval",
                },
                "encoder": None,
            },
            "cache_reuse_note": cache_note,
        },
        "families": families,
    }


def main() -> int:
    ws = SITE_ROOT.parent  # /Users/<u>/git — the workspace root
    reflex_results = ws / "riir-reflex" / ".benchmarks" / "105_families_wide_eval_tables" / "results.json"
    instinct_results = ws / "riir-instinct" / ".benchmarks" / "0051_families_wide_eval" / "predictions.json"
    if not reflex_results.exists():
        print(f"missing {reflex_results} — run the reflex frozen read first", file=sys.stderr)
        return 1
    if not instinct_results.exists():
        print(f"missing {instinct_results} — run the instinct arena record first", file=sys.stderr)
        return 1

    modelless = load_reflex_modelless(reflex_results)
    hybrid = load_instinct_hybrid(instinct_results)
    missing = [n for n in FAMILY_ORDER if n not in modelless or n not in hybrid]
    if missing:
        print(f"records lack lanes for: {', '.join(missing)}", file=sys.stderr)
        return 1

    shas = {
        "reflex": git_sha(ws / "riir-reflex"),
        "instinct": git_sha(ws / "riir-instinct"),
    }
    cache_note = (
        "harness_cache_reuse keeps its frozen 12-fixture eval record (the "
        "documented divergence, reflex Plan 009 REVISED-2); the other five "
        "carry the 96-100-case wide populations."
    )
    doc = build_families(modelless, hybrid, shas, cache_note)

    out = SITE_ROOT / "data" / "families.json"
    out.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(doc['families'])} families)")
    for f in doc["families"]:
        m, h = f["modelless"], f["hybrid"]
        print(
            f"  {f['name']:24} n={f['n']:<4} modelless {m['acc']:.4f} · hybrid {h['acc']:.4f}"
            f" · encoder not run"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

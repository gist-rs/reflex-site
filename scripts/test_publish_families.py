#!/usr/bin/env python3
"""Self-test for publish_families.py — plain asserts over synthetic sources,
no network, no repo state. Run:
    python3 scripts/test_publish_families.py
Exit 0 = green; a failing case prints its name before asserting.

Also asserts the QUARANTINE (the plan's non-goal): publish_bench.py never
references families.json, and the shipped page carries the caveat VERBATIM.
"""

import importlib.util
import json
import re
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "publish_families.py"
spec = importlib.util.spec_from_file_location("publish_families", SCRIPT)
pf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pf)

SITE = Path(__file__).resolve().parents[1]


def case(name):
    print(f"  {name}", end=" … ")


# ── synthetic sources ────────────────────────────────────────────────────────
def fake_reflex_results():
    suites = []
    for i, name in enumerate(pf.FAMILY_ORDER):
        n = 12 if name == "harness_cache_reuse" else 96
        suites.append(
            {
                "name": name,
                "modelless": {
                    "hard": {"accuracy": 0.25 + i * 0.01},
                    "raw_abstain": {"abstain_rate": 0.5, "selective_accuracy": 0.3},
                    "latency_p50_ms": 0.01,
                    "latency_p99_ms": 0.02,
                    "determinism_ok": True,
                    "n_questions": n,
                    "n_cases": n,
                },
            }
        )
    return {"suites": suites}


def fake_instinct_predictions():
    suites = []
    for i, name in enumerate(pf.FAMILY_ORDER):
        n = 12 if name == "harness_cache_reuse" else 96
        preds = [{"abstained": j % 2 == 0} for j in range(n)]
        suites.append(
            {
                "suite": name,
                "verdict": "a0_stands",
                "test_arms": [
                    {
                        "name": "A0",
                        "accuracy": 0.30 + i * 0.02,
                        "n": n,
                        "predictions": preds,
                    }
                ],
            }
        )
    return {"frozen_test_predictions": suites}


REFLEX = fake_reflex_results()
INSTINCT = fake_instinct_predictions()

# ── loader contracts ─────────────────────────────────────────────────────────
case("load_reflex_modelless reads acc/abstain/latency for all six")
cells = pf.load_reflex_modelless(REFLEX)
assert set(cells) == set(pf.FAMILY_ORDER), f"missing families: {set(pf.FAMILY_ORDER) - set(cells)}"
assert abs(cells["harness_visibility"]["acc"] - 0.25) < 1e-9
assert cells["harness_cache_reuse"]["n"] == 12
assert cells["harness_visibility"]["p50_ms"] == 0.01
print("ok")

case("load_instinct_hybrid reads A0 acc + abstain count")
hy = pf.load_instinct_hybrid(INSTINCT)
assert set(hy) == set(pf.FAMILY_ORDER)
assert abs(hy["harness_routing"]["acc"] - (0.30 + 3 * 0.02)) < 1e-9
assert abs(hy["harness_visibility"]["abstain_rate"] - 0.5) < 1e-9
assert hy["harness_visibility"]["verdict"] == "a0_stands"
print("ok")

# ── assembly ─────────────────────────────────────────────────────────────────
case("build_families: six families, encoder None, caveat byte-verbatim")
doc = pf.build_families(
    cells, hy, {"reflex": "deadbee", "instinct": "c0ffee1"}, "cache keeps its 12."
)
fams = doc["families"]
assert len(fams) == 6
assert [f["name"] for f in fams] == list(pf.FAMILY_ORDER)
for f in fams:
    assert f["encoder"] is None, "encoder must render not-run (pending-not-zero law)"
    assert f["n"] is not None
    assert f["modelless"] and f["hybrid"], "a present lane must never be a silent absence"
assert doc["meta"]["caveat"] == pf.CAVEAT
assert doc["meta"]["cache_reuse_note"] == "cache keeps its 12."
assert doc["meta"]["provenance"]["encoder"] is None
print("ok")

case("build_families: a missing hybrid cell stays None (honest absence)")
partial_hy = {k: v for k, v in hy.items() if k != "harness_tool_fit"}
doc2 = pf.build_families(cells, partial_hy, {}, "n")
t = next(f for f in doc2["families"] if f["name"] == "harness_tool_fit")
assert t["hybrid"] is None
print("ok")

# ── the SHIPPED artifacts ────────────────────────────────────────────────────
case("shipped data/families.json parses and carries the caveat verbatim")
shipped = json.loads((SITE / "data" / "families.json").read_text(encoding="utf-8"))
assert shipped["meta"]["caveat"] == pf.CAVEAT, "the shipped caveat drifted from the source text"
assert len(shipped["families"]) == 6
for f in shipped["families"]:
    assert f["encoder"] is None
    if f["name"] == "harness_cache_reuse":
        assert f["n"] == 12
    else:
        assert 88 <= f["n"] <= 104, f"{f['name']}: wide population band"
print("ok")

case("shipped families/index.html carries the caveat VERBATIM (mandatory)")
page = (SITE / "families" / "index.html").read_text(encoding="utf-8")
# The caveat is wrapped across HTML lines with the lead sentence bolded —
# compare on normalized whitespace with tags stripped.
norm = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s))
assert norm(pf.CAVEAT) in norm(page), "the page must render the caveat verbatim (issue 059)"
assert 'href="/data/families.json"' in page or "/data/families.json" in page
assert "not run" in page, "the pending-not-zero rendering must exist"
print("ok")

case("QUARANTINE: publish_bench.py never references families.json")
pb = (SITE / "scripts" / "publish_bench.py").read_text(encoding="utf-8")
assert "families.json" not in pb, "publish_bench must never ingest the quarantined data file"
assert "publish_families" not in pb
print("ok")

case("QUARANTINE: bench.json carries no families-section pointer")
bj = (SITE / "data" / "bench.json").read_text(encoding="utf-8")
assert "families.json" not in bj
print("ok")

print("ALL CHECKS PASSED")

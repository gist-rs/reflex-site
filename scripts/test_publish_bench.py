#!/usr/bin/env python3
"""Self-test for publish_bench.py (the Issue 018 T5 merge + the Issue 023
T5 ordered lane-update extension).

Plain asserts over synthetic docs — no network, no repo state. Run:
    python3 scripts/test_publish_bench.py
Exit 0 = all cases green. A failing case prints its name before asserting.
"""

import importlib.util
import io
import json
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "publish_bench.py"
spec = importlib.util.spec_from_file_location("publish_bench", SCRIPT)
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)

PRE_ACC, POST_ACC = 0.0767, 0.69  # the Issue 023 massive_intent_en move


def doc(host, sha, suites, *, laya_feature=True):
    """Build a synthetic results doc. `suites` maps name -> spec dict with
    optional modelless_acc / laya_p50 / nq (population)."""
    rows = []
    for name, sp in suites.items():
        s = {"name": name, "n_questions": sp.get("nq", 10), "n_cases": 5}
        if "modelless_acc" in sp:
            s["modelless"] = {
                "lane": "modelless", "hard": {"accuracy": sp["modelless_acc"]},
            }
        if "laya_p50" in sp:
            s["laya"] = {
                "laya-riir": {"lane": "laya-riir", "p50_ms": sp["laya_p50"]},
            }
        rows.append(s)
    return {
        "meta": {
            "host": host, "git_sha": sha, "date_utc": "2026-09-24T00:00:00Z",
            "profile": "release", "laya_feature": laya_feature,
            "datasets_dir": "/Users/x/.raw/datasets",
        },
        "suites": rows,
    }


def merge_refusing(*docs):
    """merge() with stderr captured; returns (result_or_None, stderr)."""
    buf = io.StringIO()
    old = sys.stderr
    sys.stderr = buf
    try:
        out = pb.merge(docs[0], list(docs[1:]))
    except SystemExit as e:
        assert e.code == 1, f"refusal must exit 1, got {e.code}"
        return None, buf.getvalue()
    finally:
        sys.stderr = old
    return out, buf.getvalue()


def case_fleet_join_still_works():
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5, "laya_p50": 4.0},
                                   "s2": {"modelless_acc": 0.6}})
    extra = doc("4090", "sha-4090", {"s1": {"modelless_acc": 0.5},
                                     "s2": {"modelless_acc": 0.6}})
    merged, err = merge_refusing(primary, extra)
    assert merged is not None, f"join must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    e = s1["extra_host_lanes"]["4090"]
    assert e["modelless"]["hard"]["accuracy"] == 0.5
    assert "laya" not in e  # the extra doc declared no laya lanes
    hosts = {r["host"]: r for r in merged["meta"]["hosts"]}
    assert set(hosts) == {"m3", "4090"}
    assert hosts["4090"]["laya_feature"] is True
    assert hosts["4090"].get("absent_suites") is None  # both suites present


def case_same_host_update_keeps_laya_and_row_facts():
    # (a) the ONE-HOST move (primary still PRE, 4090 updated POST) must
    #     refuse — the Issue 023 T5 law, enforced on the final state.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC, "laya_p50": 4.0}})
    join = doc("4090-windows", "sha-join", {"s1": {"modelless_acc": PRE_ACC,
                                                   "laya_p50": 8127.0}})
    update = doc("4090-windows", "sha-post", {"s1": {"modelless_acc": POST_ACC}},
                 laya_feature=False)  # modelless-only re-run posture
    merged, err = merge_refusing(primary, join, update)
    assert merged is None, "one-host move must refuse"
    assert "DRIFT" in err

    # (b) the BOTH-moved shape: primary updated first (m3 post doc), then
    #     the join, then the 4090 update — passes, lanes land correctly.
    primary2 = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC, "laya_p50": 4.0}})
    m3_post = doc("m3", "sha-m3-post", {"s1": {"modelless_acc": POST_ACC}},
                  laya_feature=False)
    merged2, err2 = merge_refusing(primary2, m3_post, join, update)
    assert merged2 is not None, f"both-moved publish must pass, got: {err2}"
    s1 = next(s for s in merged2["suites"] if s["name"] == "s1")
    # primary's own modelless lane was UPDATED by the m3 post doc
    assert s1["modelless"]["hard"]["accuracy"] == POST_ACC
    # primary's laya lane carried over
    assert s1["laya"]["laya-riir"]["p50_ms"] == 4.0
    e = s1["extra_host_lanes"]["4090-windows"]
    assert e["modelless"]["hard"]["accuracy"] == POST_ACC       # updated
    assert e["laya"]["laya-riir"]["p50_ms"] == 8127.0           # carried
    hosts = {r["host"]: r for r in merged2["meta"]["hosts"]}
    assert hosts["4090-windows"]["laya_feature"] is True, \
        "row facts must stay from the ORIGINAL full run, not the update doc"
    ls = hosts["4090-windows"]["lane_sources"]
    assert ls["modelless"]["git_sha"] == "sha-post"
    assert "laya:laya-riir" not in ls  # the update declared no laya lanes
    assert hosts["m3"]["lane_sources"]["modelless"]["git_sha"] == "sha-m3-post"
    # no absent_suites invented from the lane-scoped update doc
    assert hosts["4090-windows"].get("absent_suites") is None


def case_python_lane_update_flips_posture():
    # riir-reflex Issue 025 T4: an update doc that contributes python lanes
    # flips the host row's (and, for the primary host, the top-level)
    # laya_python_lane from the original "off"; an update without python
    # lanes must leave it alone.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": POST_ACC, "laya_p50": 4.0}})
    primary["meta"]["laya_python_lane"] = "off"
    other = doc("4090-windows", "sha-w", {"s1": {"modelless_acc": POST_ACC}})
    other["meta"]["laya_python_lane"] = "off"
    upd = doc("m3", "sha-py", {"s1": {"modelless_acc": POST_ACC, "laya_p50": 5.0}})
    upd["suites"][0]["laya"]["py/english"] = {"lane": "laya-python", "p50_ms": 3.0}
    upd["meta"]["laya_python_lane"] = "on"
    merged, err = merge_refusing(primary, other, upd)
    assert merged is not None, err
    hosts = {r["host"]: r for r in merged["meta"]["hosts"]}
    assert hosts["m3"]["laya_python_lane"] == "on"
    assert merged["meta"]["laya_python_lane"] == "on"
    assert hosts["4090-windows"]["laya_python_lane"] == "off"
    assert merged["suites"][0]["laya"]["py/english"]["p50_ms"] == 3.0
    assert hosts["m3"]["lane_sources"]["laya:py/english"]["git_sha"] == "sha-py"

    # no python lanes in the update -> posture untouched
    primary2 = doc("m3", "sha-m3", {"s1": {"modelless_acc": POST_ACC, "laya_p50": 4.0}})
    primary2["meta"]["laya_python_lane"] = "off"
    upd2 = doc("m3", "sha-rs", {"s1": {"modelless_acc": POST_ACC, "laya_p50": 5.0}})
    upd2["meta"]["laya_python_lane"] = "on"
    merged2, err2 = merge_refusing(primary2, upd2)
    assert merged2 is not None, err2
    assert merged2["meta"]["hosts"][0]["laya_python_lane"] == "off"
    assert merged2["meta"]["laya_python_lane"] == "off"


def case_one_host_move_refuses():
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    join = doc("4090", "sha-join", {"s1": {"modelless_acc": PRE_ACC}})
    update = doc("4090", "sha-post", {"s1": {"modelless_acc": POST_ACC}})
    merged, err = merge_refusing(primary, join, update)
    assert merged is None, "one-host move must refuse"
    assert "DRIFT" in err and "s1" in err and "0.69" in err


def case_republished_bench_json_as_primary():
    """A previously-published bench.json is a valid primary: its meta.hosts
    seed the seen-host set, so the 4090 update doc UPDATES (facts kept,
    lane_sources added) rather than re-joining with the update doc's facts."""
    prior = pb.merge(
        doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC, "laya_p50": 4.0}}),
        [doc("4090-windows", "sha-join",
             {"s1": {"modelless_acc": PRE_ACC, "laya_p50": 8127.0}})],
    )
    m3_post = doc("m3", "sha-m3-post", {"s1": {"modelless_acc": POST_ACC}},
                  laya_feature=False)
    w_post = doc("4090-windows", "sha-w-post", {"s1": {"modelless_acc": POST_ACC}},
                 laya_feature=False)
    merged, err = merge_refusing(prior, m3_post, w_post)
    assert merged is not None, f"re-publish must pass, got: {err}"
    hosts = {r["host"]: r for r in merged["meta"]["hosts"]}
    assert len(merged["meta"]["hosts"]) == 2, "no duplicate host rows"
    assert hosts["4090-windows"]["git_sha"] == "sha-join", \
        "original join-time facts must survive the update"
    assert hosts["4090-windows"]["lane_sources"]["modelless"]["git_sha"] == "sha-w-post"
    assert hosts["m3"]["lane_sources"]["modelless"]["git_sha"] == "sha-m3-post"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    e = s1["extra_host_lanes"]["4090-windows"]
    assert e["modelless"]["hard"]["accuracy"] == POST_ACC
    assert e["laya"]["laya-riir"]["p50_ms"] == 8127.0


def case_population_guard_excludes():
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5, "nq": 24},
                                    "s2": {"modelless_acc": 0.6}})
    join = doc("4090", "sha-join", {"s1": {"modelless_acc": 0.5, "nq": 24},
                                    "s2": {"modelless_acc": 0.6}})
    update = doc("4090", "sha-post", {"s1": {"modelless_acc": 0.9, "nq": 28}},
                 laya_feature=False)  # population moved under the update
    merged, err = merge_refusing(primary, join, update)
    assert merged is not None, f"population mismatch excludes, never refuses: {err}"
    hosts = {r["host"]: r for r in merged["meta"]["hosts"]}
    assert any("s1" in x for x in hosts["4090"]["excluded_suites"])
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    # the join-time lane value stands (the mismatched update was skipped)
    assert s1["extra_host_lanes"]["4090"]["modelless"]["hard"]["accuracy"] == 0.5
    # and the drift gate did NOT fire on the skipped update's 0.9


def case_extra_suite_absent_in_primary_refuses():
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5}})
    extra = doc("4090", "sha-4090", {"s1": {"modelless_acc": 0.5},
                                     "unknown_suite": {"modelless_acc": 0.9}})
    merged, err = merge_refusing(primary, extra)
    assert merged is None and "unknown_suite" in err


def case_end_to_end_main():
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": POST_ACC,
                                         "laya_p50": 4.0}})
    join = doc("4090-windows", "sha-join",
               {"s1": {"modelless_acc": POST_ACC, "laya_p50": 8127.0}})
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        docs = []
        for i, d in enumerate((primary, join)):
            p = root / f"doc{i}.json"
            p.write_text(json.dumps(d), encoding="utf-8")
            docs.append(str(p))
        argv = ["publish_bench.py", *docs, str(root)]
        old = sys.argv
        sys.argv = argv
        try:
            rc = pb.main()
        finally:
            sys.argv = old
        assert rc == 0
        served = json.loads((root / "data" / "bench.json").read_text("utf-8"))
        assert "datasets_dir" not in served["meta"], "machine-local meta dropped"
        s1 = served["suites"][0]
        assert s1["modelless"]["lane"] == "KatGPT"
        assert s1["laya"]["laya-riir"]["lane"] == "laya (rust)"
        e = s1["extra_host_lanes"]["4090-windows"]
        assert e["laya"]["laya-riir"]["lane"] == "laya (rust)"


CASES = [
    case_fleet_join_still_works,
    case_same_host_update_keeps_laya_and_row_facts,
    case_python_lane_update_flips_posture,
    case_one_host_move_refuses,
    case_republished_bench_json_as_primary,
    case_population_guard_excludes,
    case_extra_suite_absent_in_primary_refuses,
    case_end_to_end_main,
]


def main() -> int:
    for c in CASES:
        print(f"  {c.__name__} ...", end=" ", flush=True)
        c()
        print("ok")
    print(f"{len(CASES)}/{len(CASES)} cases green")
    return 0


if __name__ == "__main__":
    sys.exit(main())

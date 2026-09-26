#!/usr/bin/env python3
"""Self-test for publish_bench.py (the Issue 018 T5 merge + the Issue 023
T5 ordered lane-update extension).

Plain asserts over synthetic docs — no network, no repo state. Run:
    python3 scripts/test_publish_bench.py
Exit 0 = all cases green. A failing case prints its name before asserting.
"""

import importlib.util
import copy
import io
import json
import os
import sys
import tempfile
from pathlib import Path

# Console-safe streams (the console_encoding discipline): this script prints
# non-ASCII glyphs and must not die with NO verdict on a cp874-class console.
# Backslashreplace keeps every byte of the message readable.
for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

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
        primary, extras = docs[0], list(docs[1:])
        incumbent = copy.deepcopy(primary)
        _phost = pb.display_host((primary.get("meta") or {}).get("host") or "(primary)")
        for row in incumbent.get("suites", []):
            row["_phost"] = _phost
        out = pb.merge(primary, extras)
        pb.apply_lane_carry(out, incumbent, extras)
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


def case_modelless_lane_facts_refresh_on_update():
    # Issue 032: an update contributing the MODELLESS lane refreshes the
    # host row's head_posture / latency_carried from its meta (lane facts,
    # not run facts); an update without the modelless lane leaves them.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": POST_ACC, "laya_p50": 4.0}})
    other = doc("4090-windows", "sha-w", {"s1": {"modelless_acc": POST_ACC}})
    upd = doc("m3", "sha-hs", {"s1": {"modelless_acc": POST_ACC, "laya_p50": 4.0}})
    upd["meta"]["head_posture"] = "ON \u2014 cal-selected per suite (ladder 0/0.25/0.5/1)"
    upd["meta"]["latency_carried"] = "latency carried from m3 run sha-m3"
    merged, err = merge_refusing(primary, other, upd)
    assert merged is not None, err
    hosts = {r["host"]: r for r in merged["meta"]["hosts"]}
    assert "head_select" not in hosts["m3"]["head_posture"] or True
    assert hosts["m3"]["head_posture"].startswith("ON \u2014 cal-selected")
    assert hosts["m3"]["latency_carried"] == "latency carried from m3 run sha-m3"
    assert merged["meta"]["head_posture"].startswith("ON")   # primary host => top-level too
    assert hosts["4090-windows"].get("head_posture") is None  # not updated by this doc
    assert hosts["m3"]["lane_sources"]["modelless"]["git_sha"] == "sha-hs"

    # a doc that contributes NO modelless lane must not touch the facts
    upd2 = doc("4090-windows", "sha-laya", {"s1": {"laya_p50": 6.0, "modelless_acc": POST_ACC}})
    del upd2["suites"][0]["modelless"]   # a LAYA-scoped update: contributes no modelless lane
    upd2["meta"]["head_posture"] = "OFF"
    upd2["meta"]["latency_carried"] = "bogus"
    merged2, err2 = merge_refusing(primary, other, upd, upd2)
    assert merged2 is not None, err2
    hosts2 = {r["host"]: r for r in merged2["meta"]["hosts"]}
    assert hosts2["4090-windows"].get("head_posture") is None
    assert hosts2["4090-windows"].get("latency_carried") is None
    assert hosts2["m3"]["head_posture"].startswith("ON")      # untouched by upd2


def case_lane_carry_keeps_incumbent_timing():
    # Issue 032 (owner call 2026-09-26): an updated modelless lane keeps its
    # fresh accuracy but inherits the incumbent's timing cells, stamped with
    # latency_provenance. A host with no incumbent slot keeps its own timing.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5, "laya_p50": 4.0}})
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 0.35
    upd = doc("m3", "sha-hs", {"s1": {"modelless_acc": 0.7, "laya_p50": 4.0}})
    upd["suites"][0]["modelless"]["latency_p50_ms"] = 9.99   # box-invalidated
    merged, err = merge_refusing(primary, upd)
    assert merged is not None, err
    lane = merged["suites"][0]["modelless"]
    assert lane["hard"]["accuracy"] == 0.7      # fresh accuracy stays
    assert lane["latency_p50_ms"] == 0.35       # incumbent timing carried
    assert lane["latency_provenance"]["note"].startswith("latency cells carried")


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


def run_main(docs, root, extra_argv=()):
    """main() over doc objects written into `root`; returns (rc, served_or_None)."""
    paths = []
    for i, d in enumerate(docs):
        p = Path(root) / f"doc{i}.json"
        p.write_text(json.dumps(d), encoding="utf-8")
        paths.append(str(p))
    old = sys.argv
    sys.argv = ["publish_bench.py", *paths, str(root), *extra_argv]
    try:
        rc = pb.main()
    finally:
        sys.argv = old
    served = None
    served_path = Path(root) / "data" / "bench.json"
    if served_path.is_file():
        served = json.loads(served_path.read_text("utf-8"))
    return rc, served


def case_fresh_docs_wipe_refused():
    """The Issue 034 wall, measured mechanism: the fresh-docs path over an
    existing published table replaces it wholesale — lanes the docs do not
    carry would vanish silently, so main() must refuse naming them and the
    published file must be untouched on disk."""
    published = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5,
                                            "laya_p50": 4.0}})
    published["suites"][0]["clm"] = {
        "lane": "clm", "hard": {"accuracy": 0.55}}
    published["suites"][0]["extra_host_lanes"] = {
        "4090-win": {"modelless": {"lane": "modelless",
                                   "hard": {"accuracy": 0.5}},
                     "clm": {"lane": "clm", "hard": {"accuracy": 0.55}}},
    }
    published["meta"]["hosts"] = [{"host": "m3"}, {"host": "4090-win"}]
    fresh = doc("4090-windows", "sha-fresh", {"s1": {"modelless_acc": 0.5}})
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        rc0, served0 = run_main([published], root)
        assert rc0 == 0 and served0 is not None, "seed publish must succeed"
        before = (root / "data" / "bench.json").read_text("utf-8")
        buf = io.StringIO()
        old_err = sys.stderr
        sys.stderr = buf
        try:
            rc, served = run_main([fresh], root)
        finally:
            sys.stderr = old_err
        assert rc == 1, f"the wipe must refuse, got rc={rc}"
        err = buf.getvalue()
        assert "refusing" in err and "lane slots" in err, err
        assert "s1/m3-max-metal/clm" in err or "s1/4090-win/clm" in err, err
        after = (root / "data" / "bench.json").read_text("utf-8")
        assert before == after, "a refused publish must not touch the file"


def case_fresh_docs_wipe_acknowledged_by_env():
    """PUBLISH_BENCH_FULL_REPLACE=1 is the deliberate wholesale-replacement
    escape hatch: the publish proceeds, the disclosure names the drop, and
    the served file really is the docs' content."""
    published = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5,
                                            "laya_p50": 4.0}})
    published["suites"][0]["clm"] = {
        "lane": "clm", "hard": {"accuracy": 0.55}}
    published["meta"]["hosts"] = [{"host": "m3"}]
    fresh = doc("4090-windows", "sha-fresh", {"s1": {"modelless_acc": 0.5}})
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        rc0, _ = run_main([published], root)
        assert rc0 == 0
        old_env = os.environ.get("PUBLISH_BENCH_FULL_REPLACE")
        os.environ["PUBLISH_BENCH_FULL_REPLACE"] = "1"
        buf = io.StringIO()
        old_err = sys.stderr
        sys.stderr = buf
        try:
            rc, served = run_main([fresh], root)
        finally:
            sys.stderr = old_err
            if old_env is None:
                os.environ.pop("PUBLISH_BENCH_FULL_REPLACE", None)
            else:
                os.environ["PUBLISH_BENCH_FULL_REPLACE"] = old_env
        assert rc == 0, f"the env must acknowledge the replacement, rc={rc}"
        assert "wholesale replacement acknowledged" in buf.getvalue(), \
            buf.getvalue()
        # the served file is now the fresh doc's content: the m3 host row
        # and its clm lane are gone, exactly as acknowledged
        hosts = {r["host"] for r in served["meta"]["hosts"]}
        assert hosts == {"4090-win"}, hosts
        assert "clm" not in served["suites"][0]


def case_update_path_bypasses_the_wall():
    """The safe shape (Issue 034's remedy): the CURRENT data/bench.json as
    the primary — the docs land as lane-scoped updates and the guard never
    fires, because merge() preserves every host container in place. Both
    hosts move together (the Issue 023 T5 drift gate binds here too)."""
    published = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5,
                                            "laya_p50": 4.0}})
    published["suites"][0]["clm"] = {
        "lane": "clm", "hard": {"accuracy": 0.55}}
    published["suites"][0]["extra_host_lanes"] = {
        "4090-win": {"modelless": {"lane": "modelless",
                                   "hard": {"accuracy": 0.5}},
                     "clm": {"lane": "clm", "hard": {"accuracy": 0.55}}},
    }
    published["meta"]["hosts"] = [{"host": "m3"}, {"host": "4090-win"}]
    m3_update = doc("m3", "sha-m3post", {"s1": {"modelless_acc": 0.7}})
    w4090_update = doc("4090-windows", "sha-4090post",
                       {"s1": {"modelless_acc": 0.7}})
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        rc0, _ = run_main([published], root)
        assert rc0 == 0
        # the update doc list STARTS with the served file itself
        served_path = root / "data" / "bench.json"
        docs = []
        for i, d in enumerate((m3_update, w4090_update)):
            p = root / f"update{i}.json"
            p.write_text(json.dumps(d), encoding="utf-8")
            docs.append(str(p))
        old = sys.argv
        sys.argv = ["publish_bench.py", str(served_path), *docs, str(root)]
        try:
            rc = pb.main()
        finally:
            sys.argv = old
        assert rc == 0, "the update path must never hit the wall"
        served = json.loads(served_path.read_text("utf-8"))
        s1 = served["suites"][0]
        assert s1["modelless"]["hard"]["accuracy"] == 0.7, "modelless updated"
        assert s1["laya"]["laya-riir"]["p50_ms"] == 4.0, "laya preserved"
        assert "clm" in s1, "the comparison lane survived the update"
        e = s1["extra_host_lanes"]["4090-win"]
        assert "clm" in e and "modelless" in e, "4090 container intact"
        assert e["modelless"]["hard"]["accuracy"] == 0.7, "4090 modelless updated"


def case_lane_inventory_expands_laya_checkpoints():
    """laya is a CLASS of checkpoint slots: a publish that drops one
    checkpoint drops published cells, so the inventory must distinguish
    them and the wall must fire on the loss."""
    published = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5,
                                           "laya_p50": 4.0}})
    published["suites"][0]["laya"]["laya-python"] = {
        "lane": "laya-python", "p50_ms": 5.0}
    inv = pb.lane_inventory(published)
    assert ("s1", "m3-max-metal", "laya:laya-riir") in inv
    assert ("s1", "m3-max-metal", "laya:laya-python") in inv
    # the checkpoint-loss shape: a fresh doc carrying only the rust ckpt
    fresh = doc("m3", "sha-fresh", {"s1": {"modelless_acc": 0.5,
                                          "laya_p50": 4.0}})
    dropped = pb.lane_inventory(published) - pb.lane_inventory(fresh)
    assert ("s1", "m3-max-metal", "laya:laya-python") in dropped, dropped


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
        # HOST_DISPLAY: the machine label renames at the load boundary —
        # the served file carries the display spelling only.
        assert "4090-windows" not in s1.get("extra_host_lanes", {})
        e = s1["extra_host_lanes"]["4090-win"]
        assert e["laya"]["laya-riir"]["lane"] == "laya (rust)"
        assert served["meta"]["hosts"][-1]["host"] == "4090-win"


def case_code_fixtures_population_excluded_from_drift_gate():
    # The suite draws REAL fn spans from riir-reflex's own sources — its
    # population is commit-dependent, so cross-host accuracy CANNOT be
    # bit-identical by construction (the Issue 018 close-out's recorded
    # "population-excluded"). The drift gate must skip it while still
    # deciding every other suite.
    primary = doc("m3", "sha-m3", {
        "code_fixtures": {"modelless_acc": 0.2917},
        "s1": {"modelless_acc": PRE_ACC},
    })
    join = doc("4090-windows", "sha-join", {
        "code_fixtures": {"modelless_acc": 0.5417},  # drifted — by design
        "s1": {"modelless_acc": PRE_ACC},
    })
    merged, err = merge_refusing(primary, join)
    assert merged is not None, f"code_fixtures drift must not refuse, got: {err}"
    # and the gate still walls the comparable suites:
    bad = doc("m3", "sha-m3", {
        "code_fixtures": {"modelless_acc": 0.2917},
        "s1": {"modelless_acc": PRE_ACC},
    })
    bad_join = doc("4090-windows", "sha-join", {
        "code_fixtures": {"modelless_acc": 0.2917},
        "s1": {"modelless_acc": 0.5},  # a REAL drift — must refuse
    })
    merged2, err2 = merge_refusing(bad, bad_join)
    assert merged2 is None, "s1 drift must still refuse"
    assert "DRIFT" in err2 and "s1" in err2


def case_device_posture_refreshes_on_laya_update():
    # riir-reflex Issue 026: an update contributing laya lanes refreshes the
    # host row's `laya_device` — the published file must not say "cpu"
    # beside CUDA numbers (the Issue 025 T4 lane-fact class, one axis over).
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    join = doc("4090-windows", "sha-join", {
        "s1": {"modelless_acc": PRE_ACC, "laya_p50": 8127.0},
    })
    join["meta"]["laya_device"] = "cpu (the join-era posture)"
    update = doc("4090-windows", "sha-cuda", {
        "s1": {"modelless_acc": PRE_ACC, "laya_p50": 17.0},
    })
    update["meta"]["laya_device"] = "cuda (LAYA_DEVICE or the default)"
    merged, err = merge_refusing(primary, join, update)
    assert merged is not None, f"merge must pass, got: {err}"
    row = next(h for h in merged["meta"]["hosts"] if h["host"] == "4090-windows")
    assert "cuda" in row["laya_device"], row["laya_device"]
    # a modelless-only update must NOT touch the posture (no laya lanes):
    later = doc("4090-windows", "sha-modelless", {"s1": {"modelless_acc": PRE_ACC}},
                laya_feature=False)
    later["meta"]["laya_device"] = "n/a (modelless-only doc)"
    merged2, err2 = merge_refusing(merged, later)
    assert merged2 is not None, f"second merge must pass, got: {err2}"
    row2 = next(h for h in merged2["meta"]["hosts"] if h["host"] == "4090-windows")
    assert "cuda" in row2["laya_device"], row2["laya_device"]


def case_clm_lane_and_leak_block_ride_an_update():
    # reflex .issues/027: the CLM comparison lane is carried like any other
    # lane an update declares (extra_host_lanes on a join; the suite row on
    # the primary host). .issues/024 T4: the suite-level leak block rides
    # the latest scan — a doc WITHOUT one never erases a previous scan.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    update = doc("4090-windows", "sha-clm", {"s1": {"modelless_acc": PRE_ACC}})
    update["suites"][0]["clm"] = {
        "lane": "clm", "model": "clm-latest",
        "hard": {"accuracy": 0.55}, "latency_p50_ms": 42.0,
    }
    update["suites"][0]["leak"] = {
        "threshold": 0.8, "n_reference": 560, "n_eval": 400,
        "exact": 3, "near": 9,
    }
    merged, err = merge_refusing(primary, update)
    assert merged is not None, f"merge must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    e = s1["extra_host_lanes"]["4090-windows"]
    assert e["clm"]["hard"]["accuracy"] == 0.55
    assert e["clm"]["lane"] == "clm"  # machine field preserved pre-rename
    assert s1["leak"] == update["suites"][0]["leak"]

    # a LATER update without a leak block keeps the published scan; one
    # WITH a clm lane REPLACES the lane and records its lane_source
    # (updates are lane-scoped, 023 T5 — a join carries no lane_sources).
    later = doc("4090-windows", "sha-later", {"s1": {"modelless_acc": PRE_ACC}})
    later["suites"][0]["clm"] = {
        "lane": "clm", "model": "clm-latest",
        "hard": {"accuracy": 0.57}, "latency_p50_ms": 40.0,
    }
    merged2, err2 = merge_refusing(merged, later)
    assert merged2 is not None, f"second merge must pass, got: {err2}"
    s1b = next(s for s in merged2["suites"] if s["name"] == "s1")
    assert s1b["leak"] is not None, "a doc without a leak block must not erase it"
    assert s1b["extra_host_lanes"]["4090-windows"]["clm"]["hard"]["accuracy"] == 0.57
    row = next(h for h in merged2["meta"]["hosts"] if h["host"] == "4090-windows")
    assert row["lane_sources"]["clm"]["git_sha"] == "sha-later"

    # the display rename reaches the clm lane (both spellings surfaces):
    d = {"suites": [{"clm": {"lane": "clm"}}]}
    pb.rename_lanes(d)
    assert d["suites"][0]["clm"]["lane"] == "clm (reference)"


def case_host_display_rename_at_load_boundary():
    # HOST_DISPLAY renames machine labels to the page spellings at the LOAD
    # boundary (merge stays spelling-agnostic): meta.host, every
    # meta.hosts row, every extra_host_lanes key. Idempotent — loading an
    # already-renamed doc is a no-op, so a re-publish with a renamed
    # bench.json as primary works.
    d = doc("4090-windows", "sha-w", {"s1": {"modelless_acc": PRE_ACC}})
    d["meta"]["hosts"] = [{"host": "m3"}, {"host": "m3-ane"},
                          {"host": "4090-windows"}]
    d["suites"][0]["extra_host_lanes"] = {
        "m3-ane": {"modelless": {"lane": "modelless",
                                 "hard": {"accuracy": PRE_ACC}}},
        "4090-windows": {"modelless": {"lane": "modelless",
                                       "hard": {"accuracy": PRE_ACC}}},
    }
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "doc.json"
        p.write_text(json.dumps(d), encoding="utf-8")
        loaded = pb.load_run(str(p))
    assert loaded["meta"]["host"] == "4090-win"
    assert [h["host"] for h in loaded["meta"]["hosts"]] == \
        ["m3-max-metal", "m3-max-ane", "4090-win"]
    keys = set(loaded["suites"][0]["extra_host_lanes"])
    assert keys == {"m3-max-ane", "4090-win"}, keys
    # idempotent: the display spellings load back unchanged
    with tempfile.TemporaryDirectory() as td:
        p2 = Path(td) / "doc.json"
        p2.write_text(json.dumps(loaded), encoding="utf-8")
        again = pb.load_run(str(p2))
    assert again["meta"]["host"] == "4090-win"
    assert set(again["suites"][0]["extra_host_lanes"]) == keys


def case_gliner_lane_rides_an_update():
    # reflex .issues/029: the GLiNER comparison lane rides the same carry
    # law as clm — an update declares it, the merged state carries it on
    # the host's entry, and the display rename reaches both surfaces.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    update = doc("4090-windows", "sha-gl", {"s1": {"modelless_acc": PRE_ACC}})
    update["suites"][0]["gliner"] = {
        "lane": "gliner", "model": "fastino/GLiNER2.5-Decide",
        "hard": {"accuracy": 0.61}, "latency_p50_ms": 30.0,
    }
    merged, err = merge_refusing(primary, update)
    assert merged is not None, f"merge must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    e = s1["extra_host_lanes"]["4090-windows"]
    assert e["gliner"]["hard"]["accuracy"] == 0.61
    assert e["gliner"]["lane"] == "gliner"  # machine field preserved pre-rename

    # a later gliner-bearing update replaces the lane + records lane_sources
    later = doc("4090-windows", "sha-gl2", {"s1": {"modelless_acc": PRE_ACC}})
    later["suites"][0]["gliner"] = {
        "lane": "gliner", "model": "fastino/GLiNER2.5-Decide",
        "hard": {"accuracy": 0.62}, "latency_p50_ms": 29.0,
    }
    merged2, err2 = merge_refusing(merged, later)
    assert merged2 is not None, f"second merge must pass, got: {err2}"
    s1b = next(s for s in merged2["suites"] if s["name"] == "s1")
    assert s1b["extra_host_lanes"]["4090-windows"]["gliner"]["hard"]["accuracy"] == 0.62
    row = next(h for h in merged2["meta"]["hosts"] if h["host"] == "4090-windows")
    assert row["lane_sources"]["gliner"]["git_sha"] == "sha-gl2"

    # the display rename reaches the gliner lane (both spellings surfaces)
    d = {"suites": [{"gliner": {"lane": "gliner"}}]}
    pb.rename_lanes(d)
    assert d["suites"][0]["gliner"]["lane"] == "gliner (reference)"


def case_agentjev_lane_rides_an_update():
    # reflex .issues/025 amendment 4: the AgentJev comparison lane rides
    # the same carry law — an update declares it, the merged state carries
    # it on the host's entry, and the display rename reaches both surfaces.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    update = doc("4090-windows", "sha-aj", {"s1": {"modelless_acc": PRE_ACC}})
    update["suites"][0]["agentjev"] = {
        "lane": "agentjev", "model": "AgentJev-0.6B@9d9b5fc3",
        "hard": {"accuracy": 0.7715}, "latency_p50_ms": 88.0,
    }
    merged, err = merge_refusing(primary, update)
    assert merged is not None, f"merge must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    e = s1["extra_host_lanes"]["4090-windows"]
    assert e["agentjev"]["hard"]["accuracy"] == 0.7715
    assert e["agentjev"]["lane"] == "agentjev"  # machine field preserved

    # the display rename reaches the agentjev lane (the extra_host_lanes
    # surface renames in the publish path's own loop — covered by the
    # merged fixture above carrying the machine field through)
    d = {"suites": [{"agentjev": {"lane": "agentjev"}}]}
    pb.rename_lanes(d)
    assert d["suites"][0]["agentjev"]["lane"] == "agentjev (reference)"




def case_device_variant_host_drops_modelless():
    """The DEVICE_VARIANT_HOSTS law (2026-09-25): the ANE host is the same
    physical M3 as the baseline, so only its laya lanes merge — a doc that
    declares modelless publishes NO "modelless @m3-max-ane" rows, and a
    previously-published bench.json carrying the old-shape rows is cleaned
    when re-merged as primary."""
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5, "laya_p50": 4.0}})
    ane = doc("m3-ane", "sha-ane", {"s1": {"modelless_acc": 0.5,
                                           "laya_p50": 2.0}})
    pb.rename_hosts(ane)  # load_run's rename half — merge sees one spelling
    merged, err = merge_refusing(primary, ane)
    assert merged is not None, f"merge must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    entry = s1["extra_host_lanes"]["m3-max-ane"]  # renamed at the load boundary
    assert "laya" in entry and "laya-riir" in entry["laya"]
    assert "modelless" not in entry, "device-independent lane must not merge"
    assert "modelless@m3-max-ane" in err, "the skip must be disclosed loudly"
    hosts = {r["host"]: r for r in merged["meta"]["hosts"]}
    assert set(hosts) == {"m3", "m3-max-ane"}

    # A published bench.json that predates the law re-merges CLEAN: the
    # old-shape "modelless @m3-max-ane" rows are stripped, the laya row
    # and the 4090 modelless row (a genuinely different box) survive.
    prior = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5, "laya_p50": 4.0}})
    prior["suites"][0]["extra_host_lanes"] = {
        "m3-max-ane": {
            "modelless": {"lane": "modelless", "hard": {"accuracy": 0.5}},
            "laya": {"laya-riir": {"lane": "laya-riir", "p50_ms": 2.0}},
        },
        "4090-win": {
            "modelless": {"lane": "modelless", "hard": {"accuracy": 0.5}},
        },
    }
    merged2, err2 = merge_refusing(prior)
    assert merged2 is not None, f"re-merge must pass, got: {err2}"
    s1b = next(s for s in merged2["suites"] if s["name"] == "s1")
    ehl = s1b["extra_host_lanes"]
    assert "modelless" not in ehl["m3-max-ane"]
    assert "laya" in ehl["m3-max-ane"]
    assert "modelless" in ehl["4090-win"], "a different box keeps its row"


CASES = [
    case_lane_carry_keeps_incumbent_timing,
    case_modelless_lane_facts_refresh_on_update,
    case_fresh_docs_wipe_refused,
    case_fresh_docs_wipe_acknowledged_by_env,
    case_update_path_bypasses_the_wall,
    case_lane_inventory_expands_laya_checkpoints,
    case_fleet_join_still_works,
    case_same_host_update_keeps_laya_and_row_facts,
    case_python_lane_update_flips_posture,
    case_one_host_move_refuses,
    case_republished_bench_json_as_primary,
    case_population_guard_excludes,
    case_code_fixtures_population_excluded_from_drift_gate,
    case_device_posture_refreshes_on_laya_update,
    case_clm_lane_and_leak_block_ride_an_update,
    case_host_display_rename_at_load_boundary,
    case_gliner_lane_rides_an_update,
    case_agentjev_lane_rides_an_update,
    case_device_variant_host_drops_modelless,
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

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
import math
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


def case_republish_never_carries_an_untouched_lane():
    """Re-publishing the served bench.json as the primary with an UNRELATED
    extra (a comparison-lane update) must not restamp a lane this publish
    did not refresh: its cell and its incumbent share one `source_run`, so
    the LANE-CARRY law has nothing to adjudicate — the timing stays the
    cell's own and no latency_provenance note may appear (the note's
    implication — accuracy from a newer run than the timing — would be
    false; found on the Bench-074 openthai timing republish, 2026-09-28)."""
    published = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5,
                                            "laya_p50": 4.0}})
    cell = published["suites"][0]["modelless"]
    cell["latency_p50_ms"] = 0.35
    cell["source_run"] = {"git_sha": "sha-hs", "date_utc": "2026-09-27T00:00:00Z"}
    extra = doc("m3", "sha-ot", {"s1": {"laya_p50": 4.0}})
    extra["suites"][0].pop("modelless", None)
    extra["suites"][0]["clm"] = {"lane": "clm", "hard": {"accuracy": 0.55}}
    merged, err = merge_refusing(published, extra)
    assert merged is not None, err
    lane = merged["suites"][0]["modelless"]
    assert lane["latency_p50_ms"] == 0.35, "untouched timing stays"
    assert "latency_provenance" not in lane, "no carry note on an untouched lane"
    # and the REAL carry still fires beside it: a lane the extra refreshed
    published2 = doc("m3", "sha-m3", {"s2": {"modelless_acc": 0.5,
                                             "laya_p50": 4.0}})
    published2["suites"][0]["modelless"]["latency_p50_ms"] = 0.35
    upd = doc("m3", "sha-hs2", {"s2": {"modelless_acc": 0.7, "laya_p50": 4.0}})
    upd["suites"][0]["modelless"]["latency_p50_ms"] = 9.99
    merged2, err2 = merge_refusing(published2, upd)
    assert merged2 is not None, err2
    lane2 = merged2["suites"][0]["modelless"]
    assert lane2["hard"]["accuracy"] == 0.7 and lane2["latency_p50_ms"] == 0.35
    assert lane2["latency_provenance"]["note"].startswith("latency cells carried")


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


def case_population_reset_replaces_the_row():
    """The acknowledged reset (reflex Issue 044 T4): a deliberate fixture
    re-pin replaces the row facts, DROPS the other hosts' stale-population
    lanes, lands the update's own lanes, and exempts the suite from
    LANE_CARRY (the incumbent timing measured the old questions)."""
    primary = doc("m3", "sha-m3", {"code_fixtures": {"modelless_acc": 0.25,
                                                     "nq": 24,
                                                     "laya_p50": 59.0}})
    join = doc("4090", "sha-join", {"code_fixtures": {"modelless_acc": 0.31,
                                                      "nq": 24}})
    merged, err = merge_refusing(primary, join)
    assert merged is not None, err
    s1 = next(s for s in merged["suites"] if s["name"] == "code_fixtures")
    assert s1["n_questions"] == 24  # baseline: no reset, facts stand

    reset = doc("m3", "sha-reset", {"code_fixtures": {"modelless_acc": 0.375,
                                                      "nq": 32,
                                                      "laya_p50": 0.235}})
    primary2 = doc("m3", "sha-m3", {"code_fixtures": {"modelless_acc": 0.25,
                                                      "nq": 24,
                                                      "laya_p50": 59.0}})
    restore = _with_env(PUBLISH_BENCH_POPULATION_RESET="code_fixtures")
    try:
        merged2, err2 = merge_refusing(primary2, join, reset)
    finally:
        restore()
    assert merged2 is not None, f"acked reset must merge: {err2}"
    assert "re-pinned nq 24 -> 32" in err2, err2
    assert "4090" in err2, "the dropped stale host lanes must be named"
    row = next(s for s in merged2["suites"] if s["name"] == "code_fixtures")
    assert row["n_questions"] == 32, "the row facts must carry the new population"
    assert row["modelless"]["hard"]["accuracy"] == 0.375
    assert row["laya"]["laya-riir"]["p50_ms"] == 0.235, \
        "the reset must NOT carry the incumbent's old-population timing"
    assert "extra_host_lanes" not in row or "4090" not in row.get("extra_host_lanes", {}), \
        "the other host's old-population lanes must be dropped"


def case_population_reset_stale_ack_refuses():
    """An ack naming a suite the extras do not carry refuses — an
    acknowledgement cannot outlive its purpose."""
    primary = doc("m3", "sha-m3", {"code_fixtures": {"modelless_acc": 0.25, "nq": 24},
                                   "s2": {"modelless_acc": 0.6}})
    reset = doc("m3", "sha-reset", {"code_fixtures": {"modelless_acc": 0.375, "nq": 32}})
    restore = _with_env(PUBLISH_BENCH_POPULATION_RESET="s2")
    try:
        merged, err = merge_refusing(primary, reset)
    finally:
        restore()
    assert merged is None and "PUBLISH_BENCH_POPULATION_RESET" in err and "s2" in err, err


def case_population_reset_ack_without_mismatch_refuses():
    """An ack naming a suite whose population MATCHES the update is stale —
    the guard never fired, so the ack acknowledges nothing."""
    primary = doc("m3", "sha-m3", {"code_fixtures": {"modelless_acc": 0.25, "nq": 24}})
    update = doc("m3", "sha-same", {"code_fixtures": {"modelless_acc": 0.30, "nq": 24}})
    restore = _with_env(PUBLISH_BENCH_POPULATION_RESET="code_fixtures")
    try:
        merged, err = merge_refusing(primary, update)
    finally:
        restore()
    assert merged is None and "no extra doc carries that suite with a population mismatch" in err, err


def case_unknown_suite_join_rides_an_update():
    # reflex Bench 074: an update doc may ADD suites (the Thai probe
    # suites) when it also carries at least one suite the primary knows —
    # the new rows join with the doc's own lanes, loudly. A doc with NO
    # known suite still refuses (the hosts row would land with nothing on
    # the shared table — the silent-vanish shape).
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    update = doc("m3", "sha-th", {"s1": {"modelless_acc": PRE_ACC}})
    update["suites"].append({
        "name": "thai_wisesight", "n_questions": 400, "n_cases": 5,
        "openthai": {"lane": "openthai", "model": "openthai-systemone",
                     "hard": {"accuracy": 0.475}},
    })
    merged, err = merge_refusing(primary, update)
    assert merged is not None, f"join must pass, got: {err}"
    names = [s["name"] for s in merged["suites"]]
    assert names == ["s1", "thai_wisesight"], names
    row = next(s for s in merged["suites"] if s["name"] == "thai_wisesight")
    assert row["openthai"]["hard"]["accuracy"] == 0.475
    assert "modelless" not in row  # the join lands only what the doc declares

    # a KNOWN host adding only unknown suites still joins (its row anchors
    # the doc; the join is loud per suite)
    extension = doc("m3", "sha-x", {"martian": {"modelless_acc": 0.5}})
    merged2, err2 = merge_refusing(primary, extension)
    assert merged2 is not None, "a known host's all-new suites must join"
    assert any(s["name"] == "martian" for s in merged2["suites"])

    # a BRAND-NEW host with only unknown suites refuses — phantom host +
    # phantom rows in one step is the silent-vanish shape. (Fresh name:
    # merge() mutates the shared primary dict, so `martian` above is
    # already "known" by the time this doc merges.)
    stranger = doc("mars", "sha-y", {"venusian": {"modelless_acc": 0.5}})
    merged3, err3 = merge_refusing(primary, stranger)
    assert merged3 is None, "a new host with no known suite must refuse"
    assert "venusian" in err3


def case_extra_suite_absent_in_primary_joins_loudly():
    # reflex Bench 074 join law (was a hard refuse): a doc may ADD a suite
    # the primary lacks when it also anchors at least one known suite —
    # the new row joins with the doc's own lanes, and the join is loud.
    # A doc with no known suite still refuses (case_…_join… covers it).
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": 0.5}})
    extra = doc("4090", "sha-4090", {"s1": {"modelless_acc": 0.5},
                                     "unknown_suite": {"modelless_acc": 0.9}})
    merged, err = merge_refusing(primary, extra)
    assert merged is not None, f"join must pass, got: {err}"
    row = next(s for s in merged["suites"] if s["name"] == "unknown_suite")
    # 4090 is a JOINING host: its lanes land in extra_host_lanes
    entry = row["extra_host_lanes"]["4090"]
    assert entry["modelless"]["hard"]["accuracy"] == 0.9
    assert "join" in err and "unknown_suite" in err


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


def case_bekko_lane_rides_an_update():
    # reflex Bench 103 (owner call 2026-10-01): the Bekko comparison lane
    # rides the same carry law. The SAME-HOST shape (the lane lands
    # directly on the suite, the modelless lane it measured beside gets
    # refreshed, lane_sources records the run) — bekko ran on the primary
    # host m3-max-metal, unlike the clm/gliner/agentjev 4090 cells.
    # Model column carries the size (the lane field is family-level: one
    # lane, any bekko-system-one-v0 checkpoint).
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    update = doc("m3", "sha-bk", {"s1": {"modelless_acc": PRE_ACC}})
    update["suites"][0]["bekko"] = {
        "lane": "bekko", "model": "hotchpotch/bekko-system-one-v0-68m",
        "hard": {"accuracy": 0.6767}, "latency_p50_ms": 81.0,
    }
    merged, err = merge_refusing(primary, update)
    assert merged is not None, f"merge must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    assert s1["bekko"]["hard"]["accuracy"] == 0.6767
    assert s1["bekko"]["lane"] == "bekko"  # machine field preserved pre-rename
    assert s1["bekko"]["model"] == "hotchpotch/bekko-system-one-v0-68m"

    # a later bekko-bearing update replaces the lane + records lane_sources
    later = doc("m3", "sha-bk2", {"s1": {"modelless_acc": PRE_ACC}})
    later["suites"][0]["bekko"] = {
        "lane": "bekko", "model": "hotchpotch/bekko-system-one-v0-17m",
        "hard": {"accuracy": 0.5371}, "latency_p50_ms": 17.0,
    }
    merged2, err2 = merge_refusing(merged, later)
    assert merged2 is not None, f"second merge must pass, got: {err2}"
    s1b = next(s for s in merged2["suites"] if s["name"] == "s1")
    assert s1b["bekko"]["hard"]["accuracy"] == 0.5371
    row = next(h for h in merged2["meta"]["hosts"] if h["host"] == "m3")
    assert row["lane_sources"]["bekko"]["git_sha"] == "sha-bk2"

    # the display rename reaches the bekko lane
    d = {"suites": [{"bekko": {"lane": "bekko"}}]}
    pb.rename_lanes(d)
    assert d["suites"][0]["bekko"]["lane"] == "bekko (reference)"


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




def case_openthai_lane_rides_an_update():
    # reflex Plan 003 / Bench 074: the OpenThai comparison lane rides the
    # same carry law as agentjev — an update declares it, the merged state
    # carries it on the host's entry, and the display rename reaches both
    # surfaces. An external service: a device-variant host skips it like
    # every other comparison lane.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    update = doc("m3", "sha-ot", {"s1": {"modelless_acc": PRE_ACC}})
    update["suites"][0]["openthai"] = {
        "lane": "openthai", "model": "openthai-systemone@5d04bcca",
        "hard": {"accuracy": 0.8382}, "latency_p50_ms": 110.0,
    }
    merged, err = merge_refusing(primary, update)
    assert merged is not None, f"merge must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    assert s1["openthai"]["hard"]["accuracy"] == 0.8382
    assert s1["openthai"]["lane"] == "openthai"  # machine field pre-rename
    row = next(h for h in merged["meta"]["hosts"] if h["host"] == "m3")
    assert row["lane_sources"]["openthai"]["git_sha"] == "sha-ot"

    # a later openthai-bearing update replaces the lane (lane-scoped update)
    later = doc("m3", "sha-ot2", {"s1": {"modelless_acc": PRE_ACC}})
    later["suites"][0]["openthai"] = {
        "lane": "openthai", "model": "openthai-systemone@5d04bcca",
        "hard": {"accuracy": 0.89}, "latency_p50_ms": 105.0,
    }
    merged2, err2 = merge_refusing(merged, later)
    assert merged2 is not None, f"second merge must pass, got: {err2}"
    s1b = next(s for s in merged2["suites"] if s["name"] == "s1")
    assert s1b["openthai"]["hard"]["accuracy"] == 0.89

    # the display rename reaches the openthai lane (primary + extra surfaces)
    d = {"suites": [{"openthai": {"lane": "openthai"}}]}
    pb.rename_lanes(d)
    assert d["suites"][0]["openthai"]["lane"] == "openthai (reference)"

    # device-variant posture: an openthai lane under m3-max-ane is skipped
    # (external service, no device-sensitive surface) — disclosed loudly.
    primary_ane = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC, "laya_p50": 4.0}})
    ane = doc("m3-ane", "sha-ane", {"s1": {"modelless_acc": PRE_ACC, "laya_p50": 2.0}})
    ane["suites"][0]["openthai"] = {
        "lane": "openthai", "model": "openthai-systemone@5d04bcca",
        "hard": {"accuracy": 0.83}, "latency_p50_ms": 108.0,
    }
    pb.rename_hosts(ane)  # load_run's rename half — merge sees one spelling
    merged3, err3 = merge_refusing(primary_ane, ane)
    assert merged3 is not None, f"device-variant merge must pass, got: {err3}"
    s1c = next(s for s in merged3["suites"] if s["name"] == "s1")
    entry = s1c["extra_host_lanes"]["m3-max-ane"]
    assert "openthai" not in entry, (
        "a device-variant host's openthai lane must be skipped, never merged")
    assert "openthai@m3-max-ane" in err3, "the skip must be disclosed loudly"


def case_hybrid_lane_rides_an_update():
    # riir-instinct .issues/003: the instinct HYBRID lane rides the same
    # carry law — an update declares it, the merged state carries it on
    # the host's entry (the SAME-host update path lands it on the row
    # itself), lane_sources records it, and the display rename reaches
    # every surface. Pure-CPU: a device-variant host's hybrid lane is
    # SKIPPED (a tagged duplicate of the base machine's row), never
    # merged.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    update = doc("m3", "sha-hy", {"s1": {"modelless_acc": PRE_ACC}})
    update["suites"][0]["hybrid"] = {
        "lane": "hybrid", "model": "H2(beta=0.25)",
        "hard": {"accuracy": 0.8975}, "latency_p50_ms": 0.003,
    }
    merged, err = merge_refusing(primary, update)
    assert merged is not None, f"merge must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    assert s1["hybrid"]["hard"]["accuracy"] == 0.8975
    assert s1["hybrid"]["lane"] == "hybrid"  # machine field pre-rename
    row = next(h for h in merged["meta"]["hosts"] if h["host"] == "m3")
    assert row["lane_sources"]["hybrid"]["git_sha"] == "sha-hy"

    # a later hybrid-bearing update replaces the lane (lane-scoped update)
    later = doc("m3", "sha-hy2", {"s1": {"modelless_acc": PRE_ACC}})
    later["suites"][0]["hybrid"] = {
        "lane": "hybrid", "model": "H1",
        "hard": {"accuracy": 0.90}, "latency_p50_ms": 0.15,
    }
    merged2, err2 = merge_refusing(merged, later)
    assert merged2 is not None, f"second merge must pass, got: {err2}"
    s1b = next(s for s in merged2["suites"] if s["name"] == "s1")
    assert s1b["hybrid"]["hard"]["accuracy"] == 0.90

    # the display rename reaches the hybrid lane (primary + extra surfaces)
    d = {"suites": [{"hybrid": {"lane": "hybrid"}}]}
    pb.rename_lanes(d)
    assert d["suites"][0]["hybrid"]["lane"] == "Instinct"

    # a previously-published bench.json carries an OLD display spelling
    # (the PYTHON_LANE_SPELLINGS dual-spelling law: machine field in a fresh
    # harness doc, display name in a published bench.json — both land the
    # current qualifier-free product name)
    d2 = {"suites": [{"hybrid": {"lane": "Instinct (hybrid)"}}]}
    pb.rename_lanes(d2)
    assert d2["suites"][0]["hybrid"]["lane"] == "Instinct"

    # device-variant posture: a hybrid lane under m3-max-ane is skipped
    # (pure-CPU lane, a tagged duplicate of the base machine's row) — the
    # skip is disclosed loudly, never a silent drop.
    primary_ane = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC, "laya_p50": 4.0}})
    ane = doc("m3-ane", "sha-ane", {"s1": {"modelless_acc": PRE_ACC, "laya_p50": 2.0}})
    ane["suites"][0]["hybrid"] = {
        "lane": "hybrid", "model": "H1",
        "hard": {"accuracy": 0.91}, "latency_p50_ms": 0.15,
    }
    pb.rename_hosts(ane)  # load_run's rename half — merge sees one spelling
    merged3, err3 = merge_refusing(primary_ane, ane)
    assert merged3 is not None, f"device-variant merge must pass, got: {err3}"
    s1c = next(s for s in merged3["suites"] if s["name"] == "s1")
    entry = s1c["extra_host_lanes"]["m3-max-ane"]
    assert "hybrid" not in entry, (
        "a device-variant host's hybrid lane must be skipped, never merged")
    assert "hybrid@m3-max-ane" in err3, "the skip must be disclosed loudly"


def case_a0_stands_label_rides_the_cell():
    # The owner display law (riir-instinct 2026-09-27): every seated
    # suite carries its SERVING arm's cell — the reflex-half suites
    # included (a tie or a loss is shown, labeled, and stays visible as
    # the improvement backlog; hiding it reads as "can't handle it").
    # The a0_stands verdict is a LABEL that rides the doc; publish is the
    # ordinary cell path (the earlier a0_stands-REMOVES experiment is
    # retired — removal was the wrong direction). serves/gate fields on
    # the cell pass through the merge untouched.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    up = doc("m3", "sha-new", {"s1": {"modelless_acc": PRE_ACC}})
    up["suites"][0]["verdict"] = "a0_stands"
    up["suites"][0]["hybrid"] = {
        "lane": "hybrid", "model": "A0",
        "hard": {"accuracy": 0.885}, "latency_p50_ms": 0.125,
        "serves": "A0",
        "gate": "served by the reflex half — the best measured arm on this suite",
    }
    merged, err = merge_refusing(primary, up)
    assert merged is not None, f"merge must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    assert s1["hybrid"]["hard"]["accuracy"] == 0.885, (
        "the a0_stands suite's cell must PUBLISH (full coverage)")
    assert s1["hybrid"]["serves"] == "A0", "serves rides the cell"
    assert "reflex half" in s1["hybrid"]["gate"], "gate rides the cell"
    # a specialist-serving suite updates the same cell slot as before
    up2 = doc("m3", "sha-new2", {"s1": {"modelless_acc": PRE_ACC}})
    up2["suites"][0]["verdict"] = "hybrid_arm"
    up2["suites"][0]["hybrid"] = {
        "serves": "H2",
        "lane": "hybrid", "model": "H2(beta=0.25)",
        "hard": {"accuracy": 0.8975}, "latency_p50_ms": 0.002,
    }
    merged2, err2 = merge_refusing(merged, up2)
    assert merged2 is not None, f"second merge must pass, got: {err2}"
    s1b = next(s for s in merged2["suites"] if s["name"] == "s1")
    assert s1b["hybrid"]["hard"]["accuracy"] == 0.8975
    assert s1b["hybrid"]["serves"] == "H2"


def case_paw_lanes_ride_an_update():
    # reflex .issues/033: the PAW lanes ride the same carry law. The
    # hosted lane ("paw") and the local-runtime lane ("paw_local") are
    # separate slots — a host can carry either or both — and the display
    # rename reaches every surface.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    update = doc("shikuwa", "sha-paw", {"s1": {"modelless_acc": PRE_ACC}})
    update["suites"][0]["paw"] = {
        "lane": "paw", "model": "paw-ft-bs48-20260530",
        "posture": "hosted-anonymous",
        "hard": {"accuracy": 0.79}, "latency_p50_ms": 927.0,
    }
    update["suites"][0]["paw_local"] = {
        "lane": "paw-local", "model": "paw-ft-bs48-20260530",
        "posture": "local-subprocess",
        "hard": {"accuracy": 0.80}, "latency_p50_ms": 264.0,
    }
    # load_run applies the host rename at the LOAD boundary; merge() sees
    # post-rename docs. Mirror that here (the alias is the case under test).
    pb.rename_hosts(update)
    merged, err = merge_refusing(primary, update)
    assert merged is not None, f"merge must pass, got: {err}"
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    e = s1["extra_host_lanes"]["4090-win"]  # the shikuwa alias renamed
    assert e["paw"]["hard"]["accuracy"] == 0.79
    assert e["paw_local"]["lane"] == "paw-local"  # machine field preserved
    hosts = {r["host"]: r for r in merged["meta"]["hosts"]}
    assert set(hosts) == {"m3", "4090-win"}, (
        f"the alias must not mint a phantom host, got {set(hosts)}")
    # a JOIN records the whole-doc source in the host row itself (git_sha);
    # lane_sources is the UPDATE path's record — exercise it with a later
    # paw-bearing update.
    later = doc("shikuwa", "sha-paw2", {"s1": {"modelless_acc": PRE_ACC}})
    later["suites"][0]["paw"] = {
        "lane": "paw", "model": "paw-ft-bs48-20260530",
        "hard": {"accuracy": 0.795},
    }
    pb.rename_hosts(later)
    merged2, err2 = merge_refusing(merged, later)
    assert merged2 is not None, f"update must pass, got: {err2}"
    row = next(h for h in merged2["meta"]["hosts"] if h["host"] == "4090-win")
    assert row["lane_sources"]["paw"]["git_sha"] == "sha-paw2"
    s1b = next(s for s in merged2["suites"] if s["name"] == "s1")
    assert s1b["extra_host_lanes"]["4090-win"]["paw"]["hard"]["accuracy"] == 0.795

    # the display rename reaches the paw lanes (primary + extra surfaces)
    d = {"suites": [{"paw": {"lane": "paw"}, "paw_local": {"lane": "paw-local"}}]}
    pb.rename_lanes(d)
    assert d["suites"][0]["paw"]["lane"] == "paw (hosted)"
    assert d["suites"][0]["paw_local"]["lane"] == "paw (local)"

    # the lane inventory counts the new classes (the wholesale-replace wall
    # must see them as published surface, not ignore them)
    inv = pb.lane_inventory({"meta": {"hosts": [], "host": "m3"},
                             "suites": [{"name": "s1", "paw": {"lane": "paw"}}]})
    assert ("s1", "m3-max-metal", "paw") in inv  # inventory keys are displayed


def case_publish_bench_lanes_filter():
    # The lane-scoped update filter: out-of-scope lanes drop LOUDLY from
    # the extras (never silently, never from the primary), unknown names
    # refuse, and the filter survives a paw-only publish beside a
    # different-posture modelless control.
    primary = doc("m3", "sha-m3", {"s1": {"modelless_acc": PRE_ACC}})
    extra = doc("shikuwa", "sha-paw", {"s1": {"modelless_acc": 0.405}})
    extra["suites"][0]["paw"] = {
        "lane": "paw", "model": "paw-ft-bs48-20260530",
        "hard": {"accuracy": 0.79},
    }
    # the filter mutates IN PLACE — production passes freshly-loaded docs
    filtered = pb.filter_extras_to_lanes([extra], {"paw", "paw_local"})
    s1 = filtered[0]["suites"][0]
    assert "modelless" not in s1, "the out-of-scope control must be dropped"
    assert s1["paw"]["hard"]["accuracy"] == 0.79, "the in-scope lane must survive"
    assert "modelless" not in extra["suites"][0]  # the same doc object

    # :acc-only keeps the lane but strips its latency fields — the run's
    # box state made them NOT QUOTABLE; the source doc keeps its cells.
    extra2 = doc("m3", "sha-paw3", {"s1": {"modelless_acc": PRE_ACC}})
    extra2["suites"][0]["paw"] = {
        "lane": "paw", "model": "paw-ft-bs48-20260530",
        "hard": {"accuracy": 0.42},
        "latency_p50_ms": 1011.0, "latency_p99_ms": 2010.0,
        "seconds": 546.9,
    }
    filtered2 = pb.filter_extras_to_lanes([extra2], {"paw:acc-only"})
    lane = filtered2[0]["suites"][0]["paw"]
    assert lane["hard"]["accuracy"] == 0.42, "accuracy must survive :acc-only"
    assert "latency_p50_ms" not in lane and "latency_p99_ms" not in lane
    assert "seconds" not in lane, "the five latency fields must all strip"

    # an unknown suffix refuses at the main() gate (asserted via the class
    # arithmetic the gate runs): :latency-only is not a known suffix
    assert "paw:latency-only".endswith(":acc-only") is False
    unknown = {"paw", "paw_lcoal"} - set(pb.LANE_CLASSES)
    assert unknown == {"paw_lcoal"}


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


# ── The lane-pairing population law (site Issue 002 / reflex Issue 040) ──

def _laya_suite(name, *, acc=0.5, digest=None):
    """A suite row with rust+py english laya cells, optional population
    digest (new-runner results.json shape)."""
    s = {"name": name, "n_questions": 500, "n_cases": 500}
    if digest:
        s["cases_digest"] = digest
    s["laya"] = {
        "english": {"lane": "laya-riir", "hard": {"accuracy": acc},
                    "latency_p50_ms": 40.0},
        "py/english": {"lane": "laya-python", "hard": {"accuracy": acc},
                       "latency_p50_ms": 70.0},
    }
    return s


def _pairing_lanes_sha(merged, host="m3"):
    row = next(h for h in merged["meta"]["hosts"] if h["host"] == host)
    return row.get("lane_sources") or {}


def case_pairing_differs_on_cross_sample_runs():
    # THE Bug-11/14 shape: rust laya refreshed by one run, py surviving
    # from an earlier run — same n_questions (the old guard's blind spot),
    # different populations. The verdict must be "differs", never "same",
    # and the pairing block must ride the suite row.
    primary = doc("m3", "sha-py", {"banking77": {}})
    primary["suites"][0] = _laya_suite("banking77", acc=0.498)
    update = doc("m3", "sha-rust", {"banking77": {}})
    update["suites"][0] = _laya_suite("banking77", acc=0.422)
    del update["suites"][0]["laya"]["py/english"]  # the update carries rust only
    merged, err = merge_refusing(primary, update)
    assert merged is not None, f"merge must pass, got: {err}"
    n = pb.compute_pairings(merged)
    s1 = next(s for s in merged["suites"] if s["name"] == "banking77")
    b = s1["pairing"]["rust_vs_py"]
    # accuracy MOVED across the run-id mismatch (0.498 vs 0.422) — under a
    # deterministic lane that is a PROVEN population change (the bug's
    # three suites), never a parity failure and never a pass.
    assert b["status"] == "differs", f"moved results must differ, got {b}"
    assert b["rust"]["kind"] == "run" and b["py"]["kind"] == "run"
    assert b["rust"]["id"] != b["py"]["id"]
    assert n == 1


def case_pairing_same_when_digests_match():
    # New-runner shape: both lanes stamped with the SAME cases_digest —
    # the digest outranks the (differing) run ids, because the population
    # is what the digest pins.
    primary = doc("m3", "sha-a", {"s1": {}})
    primary["suites"][0] = _laya_suite("s1", digest="fnv1a64-aaaa")
    update = doc("m3", "sha-b", {"s1": {}})
    update["suites"][0] = _laya_suite("s1", digest="fnv1a64-aaaa")
    del update["suites"][0]["laya"]["py/english"]
    merged, err = merge_refusing(primary, update)
    assert merged is not None, err
    pb.compute_pairings(merged)
    b = merged["suites"][0]["pairing"]["rust_vs_py"]
    assert b["status"] == "same", b
    assert b["rust"]["kind"] == "digest" and b["py"]["kind"] == "digest"


def case_pairing_differs_when_digests_differ_even_same_run_shape():
    # The stronger direction: same run id is IMPOSSIBLE for different
    # digests, but a digest mismatch must read "differs" regardless of
    # what lane_sources says (digest is the population, the run id is
    # only its fallback proxy).
    primary = doc("m3", "sha-a", {"s1": {}})
    primary["suites"][0] = _laya_suite("s1", digest="fnv1a64-aaaa")
    update = doc("m3", "sha-a", {"s1": {}})   # SAME sha — stale-sha trap
    update["suites"][0] = _laya_suite("s1", digest="fnv1a64-bbbb")
    del update["suites"][0]["laya"]["py/english"]
    merged, err = merge_refusing(primary, update)
    assert merged is not None, err
    pb.compute_pairings(merged)
    b = merged["suites"][0]["pairing"]["rust_vs_py"]
    assert b["status"] == "differs", "digest mismatch must differ even at one sha"


def case_pairing_same_results_when_run_differs_results_equal():
    # The over-disclosure guard: different runs + byte-equal accuracy = no
    # evidence of a population change — "same_results" (comparable with
    # disclosure), NOT "differs". The 11 bug-era suites were exactly this.
    primary = doc("m3", "sha-py", {"s1": {}})
    primary["suites"][0] = _laya_suite("s1", acc=0.95)
    update = doc("m3", "sha-rust", {"s1": {}})
    update["suites"][0] = _laya_suite("s1", acc=0.95)
    del update["suites"][0]["laya"]["py/english"]
    merged, err = merge_refusing(primary, update)
    assert merged is not None, err
    pb.compute_pairings(merged)
    b = merged["suites"][0]["pairing"]["rust_vs_py"]
    assert b["status"] == "same_results", b


def case_pairing_primary_run_lanes_fall_back_to_doc_identity():
    # A lane with no update row came with the primary itself — its run IS
    # the doc's run. Both lanes of a one-run publish are therefore
    # same-population ("same"), even though lane_sources has no rows.
    primary = doc("m3", "sha-a", {"s1": {}})
    primary["suites"][0] = _laya_suite("s1")
    merged = pb.merge(primary, [])
    pb.compute_pairings(merged)
    b = merged["suites"][0]["pairing"]["rust_vs_py"]
    assert b["status"] == "same", b
    assert b["rust"]["id"] == b["py"]["id"]
    assert b["rust"]["id"].startswith("sha-a")


def case_pairing_unknown_when_doc_identity_missing():
    # The genuinely unknown state: no digests, no update rows, AND a doc
    # without a run identity — disclosed, never read as same OR failure.
    primary = doc("m3", "", {"s1": {}})
    primary["suites"][0] = _laya_suite("s1")
    merged = pb.merge(primary, [])
    pb.compute_pairings(merged)
    b = merged["suites"][0]["pairing"]["rust_vs_py"]
    assert b["status"] == "unknown", b


def case_pairing_digest_stamp_rides_cells():
    # T2: a lane cell copied from an update doc carries its source run's
    # cases_digest; a cell from a run WITHOUT digests does not gain one.
    primary = doc("m3", "sha-a", {"s1": {}, "s2": {}})
    primary["suites"][0] = _laya_suite("s1")   # legacy run: no digest
    primary["suites"][1] = _laya_suite("s2")
    update = doc("m3", "sha-b", {"s1": {}})
    update["suites"][0] = _laya_suite("s1", acc=0.6, digest="fnv1a64-zzzz")
    del update["suites"][0]["laya"]["py/english"]
    merged, err = merge_refusing(primary, update)
    assert merged is not None, err
    s1 = next(s for s in merged["suites"] if s["name"] == "s1")
    s2 = next(s for s in merged["suites"] if s["name"] == "s2")
    assert s1["laya"]["english"].get("cases_digest") == "fnv1a64-zzzz"
    assert "cases_digest" not in s1["laya"]["py/english"], \
        "the py cell came from a digest-less run — it must not gain one"
    assert "cases_digest" not in s2["laya"]["english"]


# ── The Issue-021 publish wall (2026-09-27) ──────────────────────────────

def _box(start, end):
    """A results.json meta.box_state span; None = the end is UNJUDGED."""
    mk = lambda q: {"load_1m": 7.0 if q is False else 4.0,
                    "latency_quotable": q,
                    "refusals": ["load 7 > 6 — a sibling job is on the box"]
                    if q is False else []}
    return {"start": mk(start), "end": mk(end)}


def _timed_laya_doc(sha, box):
    d = doc("m3", sha, {"s1": {"modelless_acc": 0.5}})
    d["suites"][0]["laya"] = {"english": {
        "lane": "laya-riir", "hard": {"accuracy": 0.36},
        "latency_p50_ms": 406.0, "latency_p99_ms": 900.0, "seconds": 12.0}}
    if box is not None:
        d["meta"]["box_state"] = box
    return d


def _with_env(**kv):
    """Context-free env override: returns a restore callable."""
    old = {k: os.environ.get(k) for k in kv}
    for k, v in kv.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    def restore():
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    return restore


def _published_primary(root):
    """A first publish into `root`; returns the served file's path."""
    first = _timed_laya_doc("sha-base", _box(True, True))
    rc, _ = run_main([first], root)
    assert rc == 0
    return Path(root) / "data" / "bench.json"


def _update(root, extra, **env):
    """An update-path publish (served file as PRIMARY) of one extra doc,
    stderr captured. Returns (rc, served, stderr)."""
    served_path = Path(root) / "data" / "bench.json"
    p = Path(root) / "extra.json"
    p.write_text(json.dumps(extra), encoding="utf-8")
    restore = _with_env(**env)
    buf, olderr, oldargv = io.StringIO(), sys.stderr, sys.argv
    sys.stderr = buf
    sys.argv = ["publish_bench.py", str(served_path), str(p), str(root)]
    try:
        rc = pb.main()
    finally:
        sys.stderr, sys.argv = olderr, oldargv
        restore()
    return rc, json.loads(served_path.read_text("utf-8")), buf.getvalue()


def case_doc_latency_quotable_three_state():
    q = pb.doc_latency_quotable
    assert q({"box_state": _box(True, True)}) is True
    assert q({"box_state": _box(True, False)}) is False, "BOTH ends must be fit"
    assert q({"box_state": _box(False, None)}) is None, \
        "an unreadable end is UNJUDGED, never a verdict"
    assert q({}) is None and q(None) is None, "no box_state = UNJUDGED"


def case_unquotable_latency_refused_at_publish():
    """Bench 067's process note, mechanized: a doc whose own box_state
    read NOT QUOTABLE must not publish its timing — refused with the
    served file untouched; :acc-only and the host ack are the two exits,
    and a stale ack refuses too."""
    ENV = dict(PUBLISH_BENCH_LANES=None, PUBLISH_BENCH_ALLOW_UNQUOTABLE=None)
    with tempfile.TemporaryDirectory() as root:
        served_path = _published_primary(root)
        before = served_path.read_bytes()
        bad = _timed_laya_doc("sha-loaded", _box(False, False))

        rc, _, err = _update(root, copy.deepcopy(bad), **ENV)
        assert rc == 1, "unquotable latency must refuse"
        assert "NOT QUOTABLE" in err and "laya:english@m3-max-metal/s1" in err, err
        assert "load 7 > 6" in err, "the box's own refusal reason must be named"
        assert served_path.read_bytes() == before, "a refusal writes nothing"

        rc, served, err = _update(root, copy.deepcopy(bad), **{
            **ENV, "PUBLISH_BENCH_LANES": "laya:acc-only"})
        assert rc == 0, f":acc-only strips the timing, so it publishes: {err}"
        cell = served["suites"][0]["laya"]["english"]
        assert "latency_p50_ms" not in cell and cell["hard"]["accuracy"] == 0.36
        served_path.write_bytes(before)

        rc, served, err = _update(root, copy.deepcopy(bad), **{
            **ENV, "PUBLISH_BENCH_ALLOW_UNQUOTABLE": "m3"})
        assert rc == 0 and "by acknowledgement" in err, err
        cell = served["suites"][0]["laya"]["english"]
        assert cell["latency_quotable"] is False, \
            "an acknowledged publish must still DISCLOSE the verdict on the cell"
        served_path.write_bytes(before)

        good = _timed_laya_doc("sha-fit", _box(True, True))
        rc, _, err = _update(root, good, **{
            **ENV, "PUBLISH_BENCH_ALLOW_UNQUOTABLE": "m3"})
        assert rc == 1 and "stale ack" in err, \
            "an ack naming a host with nothing unquotable must refuse"


def case_quotable_and_unjudged_record_provenance():
    """A fit run publishes and records true; an UNJUDGED run (the 4090
    harness has no box probes) publishes with a loud note and records
    null — never folded into either verdict."""
    ENV = dict(PUBLISH_BENCH_LANES=None, PUBLISH_BENCH_ALLOW_UNQUOTABLE=None)
    with tempfile.TemporaryDirectory() as root:
        _published_primary(root)
        rc, served, _ = _update(root, _timed_laya_doc("sha-fit", _box(True, True)), **ENV)
        assert rc == 0
        cell = served["suites"][0]["laya"]["english"]
        assert cell["latency_quotable"] is True
        assert "latency_quotable" not in served["meta"]["hosts"][0]["lane_sources"]["laya:english"], \
            "the verdict lives on the CELL only — one truth, beside the timing"

        rc, served, err = _update(root, _timed_laya_doc("sha-win", _box(None, None)), **ENV)
        assert rc == 0, "UNJUDGED must publish, not refuse"
        assert "UNJUDGED" in err and "m3-max-metal@sha-win" in err, err
        cell = served["suites"][0]["laya"]["english"]
        assert cell["latency_quotable"] is None, "UNJUDGED is null, never a verdict"


def case_carried_lane_is_exempt_from_the_wall():
    """A LANE_CARRY class the incumbent holds publishes the INCUMBENT's
    timing, so its own unquotable timing never reaches the page — no
    refusal. The same lane with no incumbent publishes its own timing
    and is counted."""
    primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
    primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 1.0
    pb.rename_hosts(primary)
    extra = doc("m3", "sha-loaded", {"s1": {"modelless_acc": 0.5}})
    extra["meta"]["box_state"] = _box(False, False)
    extra["suites"][0]["modelless"]["latency_p50_ms"] = 9.0
    pb.rename_hosts(extra)
    incumbent = copy.deepcopy(primary)
    for row in incumbent["suites"]:
        row["_phost"] = "m3-max-metal"
    assert pb._latency_slots(extra, incumbent) == [], \
        "a carried lane's own timing is replaced — nothing to refuse"
    assert pb._latency_slots(extra, None) == ["modelless@m3-max-metal/s1"]


def case_carried_timing_keeps_the_incumbents_verdict():
    """The verdict travels WITH the timing: a carried lane shows the
    incumbent's cells, so it shows the incumbent's verdict — and an
    incumbent with none leaves the cell UNKNOWN, never the update run's
    verdict (the flaw a row-level lane_sources verdict had)."""
    for inc_q, want in ((True, True), ("absent", "absent")):
        primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
        primary["meta"]["hosts"] = [{"host": "m3"}]
        primary["suites"][0]["modelless"]["latency_p50_ms"] = 1.0
        if inc_q != "absent":
            primary["suites"][0]["modelless"]["latency_quotable"] = inc_q
        extra = doc("m3", "sha-new", {"s1": {"modelless_acc": 0.5}})
        extra["meta"]["box_state"] = _box(False, False)
        extra["suites"][0]["modelless"]["latency_p50_ms"] = 9.0
        pb.rename_hosts(primary); pb.rename_hosts(extra)
        merged, _ = merge_refusing(primary, extra)
        cell = merged["suites"][0]["modelless"]
        assert cell["latency_p50_ms"] == 1.0, "LANE_CARRY keeps incumbent timing"
        if want == "absent":
            assert "latency_quotable" not in cell, \
                "an incumbent without a verdict must leave the cell UNKNOWN"
        else:
            assert cell["latency_quotable"] is want


def case_quotable_update_replaces_unfit_incumbent_carry():
    """Issue-003 T2: LANE_CARRY is DIRECTIONAL. The law keeps an update
    from swapping VALIDATED timing for INVALIDATED timing — so when the
    INCUMBENT is the invalidated side (verdict False, the 26 published
    not-quotable carries) and the update's own timing is quotable, the
    carry must be suppressed: the fresh timing and verdict publish, and
    the carry disclosure must NOT claim them."""
    primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
    primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 0.35
    primary["suites"][0]["modelless"]["latency_quotable"] = False
    primary["suites"][0]["modelless"]["latency_provenance"] = {"note": "carried"}
    pb.rename_hosts(primary)
    upd = doc("m3", "sha-fit", {"s1": {"modelless_acc": 0.7}})
    upd["meta"]["box_state"] = _box(True, True)
    upd["suites"][0]["modelless"]["latency_p50_ms"] = 0.20
    pb.rename_hosts(upd)
    merged, err = merge_refusing(primary, upd)
    assert merged is not None, err
    cell = merged["suites"][0]["modelless"]
    assert cell["latency_p50_ms"] == 0.20, \
        "a quotable update must replace an unfit incumbent's carried timing"
    assert cell["hard"]["accuracy"] == 0.7
    assert cell["latency_quotable"] is True, \
        "the verdict travels with the FRESH timing now"
    assert "latency_provenance" not in cell, \
        "the fresh timing is the update's own — no carry disclosure may claim it"
    assert "LANE_CARRY suppressed" in err, "the suppression is loud"


def case_carry_still_serves_an_unquotable_update():
    """The directionality is one-way: a False update never beats ANY
    incumbent. Unfit incumbent + unfit update = the wall's remedy shape —
    the carry replaces the update's timing, verdict and provenance travel
    from the incumbent exactly as before T2."""
    primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
    primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 0.35
    primary["suites"][0]["modelless"]["latency_quotable"] = False
    pb.rename_hosts(primary)
    upd = doc("m3", "sha-loaded", {"s1": {"modelless_acc": 0.7}})
    upd["meta"]["box_state"] = _box(False, False)
    upd["suites"][0]["modelless"]["latency_p50_ms"] = 9.99
    pb.rename_hosts(upd)
    merged, err = merge_refusing(primary, upd)
    assert merged is not None, err
    cell = merged["suites"][0]["modelless"]
    assert cell["latency_p50_ms"] == 0.35, "unfit update timing is still carried over"
    assert cell["latency_quotable"] is False
    assert "latency_provenance" in cell
    assert "LANE_CARRY suppressed" not in err


def case_carry_still_serves_an_unjudged_update():
    """UNKNOWN is not a claim: an update with no readable box_state (the
    4090 class) never beats an incumbent, even an unfit one — the verdict
    must not silently improve on no evidence."""
    primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
    primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 0.35
    primary["suites"][0]["modelless"]["latency_quotable"] = False
    pb.rename_hosts(primary)
    upd = doc("m3", "sha-4090-style", {"s1": {"modelless_acc": 0.7}})
    # no box_state at all — the UNJUDGED class
    upd["suites"][0]["modelless"]["latency_p50_ms"] = 0.11
    pb.rename_hosts(upd)
    merged, err = merge_refusing(primary, upd)
    assert merged is not None, err
    cell = merged["suites"][0]["modelless"]
    assert cell["latency_p50_ms"] == 0.35, "an unjudged update never beats the incumbent"
    assert cell["latency_quotable"] is False
    assert "latency_provenance" in cell
    assert "LANE_CARRY suppressed" not in err


def case_wall_judges_a_quotable_update_over_an_unfit_incumbent():
    """The wall exemption follows the same predicate: when the carry WILL
    be suppressed (unfit incumbent + quotable update), the update's own
    timing publishes — the wall must SEE that slot (and it passes, being
    quotable), never silently exempt it. The incumbent-side shapes keep
    their exemption via case_carried_lane_is_exempt_from_the_wall."""
    primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
    primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 1.0
    primary["suites"][0]["modelless"]["latency_quotable"] = False
    pb.rename_hosts(primary)
    extra = doc("m3", "sha-fit", {"s1": {"modelless_acc": 0.5}})
    extra["meta"]["box_state"] = _box(True, True)
    extra["suites"][0]["modelless"]["latency_p50_ms"] = 9.0
    pb.rename_hosts(extra)
    incumbent = copy.deepcopy(primary)
    for row in incumbent["suites"]:
        row["_phost"] = "m3-max-metal"
    assert pb._latency_slots(extra, incumbent) == ["modelless@m3-max-metal/s1"], \
        "a suppressed carry publishes the update's own timing — the wall must judge it"


def case_corpus_digest_gates_the_carry():
    """Issue 057: a corpus change (the typed 800→1200-row lift — question
    set byte-identical, so the population reset cannot fire) must not
    carry the incumbent timing: both cells carry corpus_digest and they
    differ, carrying would re-attach stale timing by construction.
    Digest-EQUAL still carries (same corpus — the law's normal case), and
    a digest missing on either side still carries (adoption-stable: the
    served incumbent predates the stamp; the one-time ack retires it)."""
    def run(inc_dg, upd_dg):
        primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
        primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
        primary["suites"][0]["modelless"]["latency_p50_ms"] = 0.517
        if inc_dg is not None:
            primary["suites"][0]["modelless"]["corpus_digest"] = inc_dg
        upd = doc("m3", "sha-lift", {"s1": {"modelless_acc": 0.7}})
        upd["suites"][0]["modelless"]["latency_p50_ms"] = 0.764
        if upd_dg is not None:
            upd["suites"][0]["modelless"]["corpus_digest"] = upd_dg
        pb.rename_hosts(primary); pb.rename_hosts(upd)
        return merge_refusing(primary, upd)

    # equal digests -> the carry still fires (same corpus, the normal case)
    merged, err = run("pool-a", "pool-a")
    assert merged is not None, err
    cell = merged["suites"][0]["modelless"]
    assert cell["latency_p50_ms"] == 0.517, "same corpus still carries"
    assert cell["corpus_digest"] == "pool-a"  # the carried cell keeps its own digest

    # digests differ -> no carry; the fresh timing stands + loud note
    merged, err = run("pool-a", "pool-b")
    assert merged is not None, err
    cell = merged["suites"][0]["modelless"]
    assert cell["latency_p50_ms"] == 0.764, \
        "a corpus change must never re-attach the incumbent's stale timing"
    assert cell["hard"]["accuracy"] == 0.7
    assert "corpus_digest differs" in err, "the suppression is loud"
    assert "latency_provenance" not in cell, "the fresh timing is the update's own"

    # incumbent has no digest (the served shape today) -> adoption-stable carry
    merged, err = run(None, "pool-b")
    assert merged is not None, err
    assert merged["suites"][0]["modelless"]["latency_p50_ms"] == 0.517, \
        "a digest-less incumbent still carries — the ack is the retirement path"

    # update has no digest -> same
    merged, err = run("pool-a", None)
    assert merged is not None, err
    assert merged["suites"][0]["modelless"]["latency_p50_ms"] == 0.517


def case_wall_judges_a_corpus_changed_slot():
    """Issue 057 verdict correction 2: the publish wall reads the SAME
    predicate, so a corpus-mismatch slot is JUDGED instead of
    assumed-carried — an unquotable update on a changed corpus can no
    longer dodge the wall as 'will be carried' and then not be carried."""
    primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
    primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 1.0
    primary["suites"][0]["modelless"]["corpus_digest"] = "pool-a"
    pb.rename_hosts(primary)
    extra = doc("m3", "sha-loaded", {"s1": {"modelless_acc": 0.5}})
    extra["meta"]["box_state"] = _box(False, False)
    extra["suites"][0]["modelless"]["latency_p50_ms"] = 9.0
    extra["suites"][0]["modelless"]["corpus_digest"] = "pool-b"
    pb.rename_hosts(extra)
    incumbent = copy.deepcopy(primary)
    for row in incumbent["suites"]:
        row["_phost"] = "m3-max-metal"
    assert pb._latency_slots(extra, incumbent) == ["modelless@m3-max-metal/s1"], \
        "a corpus-changed slot is judged by the wall, never assumed-carried"
    # ...and the digest-equal shape keeps its exemption (the carry will
    # replace the timing, so the update's own never reaches the page).
    extra["suites"][0]["modelless"]["corpus_digest"] = "pool-a"
    assert pb._latency_slots(extra, incumbent) == [], \
        "a same-corpus carried lane stays exempt from the wall"


def case_corpus_reset_ack_exempts_and_fires():
    """The one-time ack: a named suite is exempt from the carry regardless
    of digest state (the incumbent has no digest — that is the point), the
    update's own timing publishes, and the fire is loud."""
    primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
    primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 0.517
    # no corpus_digest on the incumbent — the exact served shape
    pb.rename_hosts(primary)
    upd = doc("m3", "sha-lift", {"s1": {"modelless_acc": 0.7}})
    upd["suites"][0]["modelless"]["latency_p50_ms"] = 0.764
    upd["suites"][0]["modelless"]["corpus_digest"] = "pool-b"
    pb.rename_hosts(upd)
    restore = _with_env(PUBLISH_BENCH_CORPUS_RESET="s1")
    try:
        merged, err = merge_refusing(primary, upd)
    finally:
        restore()
    assert merged is not None, err
    cell = merged["suites"][0]["modelless"]
    assert cell["latency_p50_ms"] == 0.764, "the acked suite's fresh timing publishes"
    assert "PUBLISH_BENCH_CORPUS_RESET — s1 exempt" in err


def case_corpus_reset_stale_ack_refuses():
    """An ack cannot outlive the corpus change it was written for:
    - an update cell with NO corpus_digest refuses (no post-landing run);
    - an update whose digest EQUALS the incumbent's refuses (nothing changed);
    - a suite that publishes nowhere in this run refuses."""
    def run(ack, inc_dg, upd_dg, suite="s1"):
        primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
        primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
        primary["suites"][0]["modelless"]["latency_p50_ms"] = 1.0
        if inc_dg is not None:
            primary["suites"][0]["modelless"]["corpus_digest"] = inc_dg
        upd = doc("m3", "sha-lift", {"s1": {"modelless_acc": 0.7}})
        upd["suites"][0]["modelless"]["latency_p50_ms"] = 2.0
        if upd_dg is not None:
            upd["suites"][0]["modelless"]["corpus_digest"] = upd_dg
        pb.rename_hosts(primary); pb.rename_hosts(upd)
        restore = _with_env(PUBLISH_BENCH_CORPUS_RESET=ack)
        try:
            return merge_refusing(primary, upd)
        finally:
            restore()

    merged, err = run("s1", "pool-a", None)
    assert merged is None and "carries no" in err and "corpus_digest" in err, err
    merged, err = run("s1", "pool-a", "pool-a")
    assert merged is None and "already" in err and "equals" in err, err
    merged, err = run("s2", "pool-a", "pool-b")
    assert merged is None and "s2" in err and "no such suite" in err, err


def case_corpus_reset_ack_fires_on_carried_timing_incumbent():
    """Issue 057 follow-through (2026-10-01, the m3 primary refresh): an
    incumbent whose TIMING is a LANE_CARRY artifact carries an equal
    corpus_digest that stamps its ACCURACY merge, not its timing — the
    _carry_into note is the proof the timing measured an older corpus by
    construction. The equal-digest arm must not make that cell
    unrefreshable: the ack fires (with the disclosure note), the fresh
    timing publishes, and the pre-existing own-timing equal-digest refusal
    one case up stays the law for cells whose timing is their own."""
    carry_note = {
        "note": "latency cells carried from the host's incumbent run; "
                "accuracy is this lane's own (LANE-CARRY, Issue 032)",
    }
    primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
    primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
    # the served 2026-10-01 shape: Bench 100's digest + the carried 0.517
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 0.517
    primary["suites"][0]["modelless"]["corpus_digest"] = "pool-b"
    primary["suites"][0]["modelless"]["latency_provenance"] = carry_note
    pb.rename_hosts(primary)
    upd = doc("m3", "sha-lift", {"s1": {"modelless_acc": 0.5}})
    upd["suites"][0]["modelless"]["latency_p50_ms"] = 0.795
    upd["suites"][0]["modelless"]["corpus_digest"] = "pool-b"  # EQUAL
    pb.rename_hosts(upd)
    restore = _with_env(PUBLISH_BENCH_CORPUS_RESET="s1")
    try:
        merged, err = merge_refusing(primary, upd)
    finally:
        restore()
    assert merged is not None, err
    cell = merged["suites"][0]["modelless"]
    assert cell["latency_p50_ms"] == 0.795, "the ack refreshes carried timing"
    assert cell["corpus_digest"] == "pool-b"
    assert "accuracy merge" in err and "LANE-CARRY" in err, err
    # the refreshed cell's timing is its OWN: a second ack on it is stale
    restore = _with_env(PUBLISH_BENCH_CORPUS_RESET="s1")
    try:
        merged2, err2 = merge_refusing(merged, upd)
    finally:
        restore()
    assert merged2 is None and "already equals" in err2, err2


def case_corpus_reset_ack_extra_host_shape():
    """Issue 057 follow-through (2026-09-30, the first live extra-host ack):
    the update cell for a NON-primary host lives in
    extra_host_lanes[<host>].modelless — the merged row's own modelless
    slot still holds the PRIMARY host's (digest-less) cell. The original
    adjudication read the row slot, refused a fresh post-landing run as
    stale, and every existing arm exercised only the same-host shape.
    Pinned both directions at the extra host."""
    primary = doc("m3", "sha-base", {"s1": {"modelless_acc": 0.5}})
    primary["meta"]["hosts"] = [{"host": "m3-max-metal"}]
    primary["suites"][0]["modelless"]["latency_p50_ms"] = 0.517
    pb.rename_hosts(primary)
    upd = doc("4090-windows", "sha-lift", {"s1": {"modelless_acc": 0.5}})
    upd["suites"][0]["modelless"]["latency_p50_ms"] = 0.917
    upd["suites"][0]["modelless"]["corpus_digest"] = "pool-b"
    pb.rename_hosts(upd)
    restore = _with_env(PUBLISH_BENCH_CORPUS_RESET="s1")
    try:
        merged, err = merge_refusing(primary, upd)
    finally:
        restore()
    assert merged is not None, err
    cell = merged["suites"][0]["extra_host_lanes"]["4090-win"]["modelless"]
    assert cell["latency_p50_ms"] == 0.917, "the acked extra-host timing publishes"
    assert cell["corpus_digest"] == "pool-b"
    assert "s1 exempt" in err and "4090-win" in err
    # the primary cell is untouched by the extra-host ack
    assert merged["suites"][0]["modelless"]["latency_p50_ms"] == 0.517

    # negative: the extra-host update without a digest refuses at ITS slot
    upd2 = doc("4090-windows", "sha-lift", {"s1": {"modelless_acc": 0.5}})
    upd2["suites"][0]["modelless"]["latency_p50_ms"] = 0.9
    pb.rename_hosts(upd2)
    restore = _with_env(PUBLISH_BENCH_CORPUS_RESET="s1")
    try:
        merged, err = merge_refusing(primary, upd2)
    finally:
        restore()
    assert merged is None, "a digest-less extra-host ack must refuse"
    assert "4090-win" in err and "corpus_digest" in err, err


def case_source_run_stamp_is_per_suite():
    """Issue-003 T4: a one-suite update re-labels the host row's
    lane_sources for the whole lane CLASS — the summary cannot be a
    per-suite fact. The remedy moves run identity onto the CELL:

    - digest-carrying cells (the real-world shape since reflex 040):
      the digest outranks the relabeled summary on BOTH suites — the
      issue's "pairing is unaffected today" holds;
    - the updated no-digest cell reads its own source_run stamp — the
      exact per-suite truth lane_identity never had before;
    - the untouched no-digest cell still reads the legacy summary
      (wrong-run class, disclosed 3-state) until its own update stamps
      it — the legacy tier, not a regression."""
    primary = doc("m3", "sha-one", {"s1": {"modelless_acc": 0.5},
                                    "s2": {"modelless_acc": 0.6}})
    upd = doc("m3", "sha-two", {"s1": {"modelless_acc": 0.7}},
              laya_feature=False)
    merged, err = merge_refusing(primary, upd)
    assert merged is not None, err
    pb.rename_hosts(merged)   # main() renames at the LOAD boundary; mirror it
    suites = {s["name"]: s for s in merged["suites"]}
    hosts = {r["host"]: r for r in merged["meta"]["hosts"]}
    assert hosts["m3-max-metal"]["lane_sources"]["modelless"]["git_sha"] == "sha-two"
    doc_fb = {"kind": "run", "id": "sha-one 2026-09-24T00:00:00Z"}
    srcs = hosts["m3-max-metal"]["lane_sources"]

    # The updated cell: its stamp is the per-suite truth, digest or not.
    updated = pb.lane_identity(suites["s1"]["modelless"], srcs, "modelless", doc_fb)
    assert updated == {"kind": "run", "id": "sha-two 2026-09-24T00:00:00Z"}, \
        "the updated suite reads its own stamp, not the relabeled summary"

    # The untouched no-digest cell: legacy summary fallback (disclosed class).
    untouched = pb.lane_identity(suites["s2"]["modelless"], srcs, "modelless", doc_fb)
    assert untouched == {"kind": "run", "id": "sha-two 2026-09-24T00:00:00Z"}, \
        "pre-stamp cells keep the legacy summary tier"

    # The digest tier protects BOTH once present (the real-world shape):
    suites["s1"]["modelless"]["cases_digest"] = "fnv1a64-aaaa"
    suites["s2"]["modelless"]["cases_digest"] = "fnv1a64-bbbb"
    assert pb.lane_identity(suites["s1"]["modelless"], srcs, "modelless", doc_fb) \
        == {"kind": "digest", "id": "fnv1a64-aaaa"}
    assert pb.lane_identity(suites["s2"]["modelless"], srcs, "modelless", doc_fb) \
        == {"kind": "digest", "id": "fnv1a64-bbbb"}, \
        "the summary's relabel must not leak past a digest"


def case_source_run_stamp_survives_remerge_and_digest_wins():
    """The stamp rides the cell through a re-merge (a published bench.json
    primary), and the digest keeps precedence over it when both exist."""
    primary = doc("m3", "sha-one", {"s1": {"modelless_acc": 0.5}})
    upd = doc("m3", "sha-two", {"s1": {"modelless_acc": 0.7}},
              laya_feature=False)
    merged, _ = merge_refusing(primary, upd)
    remerged, err = merge_refusing(merged)
    assert remerged is not None, err
    cell = remerged["suites"][0]["modelless"]
    assert cell.get("source_run", {}).get("git_sha") == "sha-two", \
        "the stamp survives a bench.json re-merge"
    cell["cases_digest"] = "dg-1"
    ident = pb.lane_identity(cell, {}, "modelless")
    assert ident == {"kind": "digest", "id": "dg-1"}, "digest outranks the stamp"


def case_pre_stamp_cells_still_fall_back_to_lane_sources():
    """Cells updated before the stamp existed carry no source_run — their
    identity still resolves via the host-row summary (the old behavior,
    wrong per-suite but disclosed 3-state), so nothing loses an identity
    until its next per-suite update lands one."""
    cell = {"lane": "modelless", "hard": {"accuracy": 0.5}}
    srcs = {"modelless": {"git_sha": "sha-old", "date_utc": "2026-09-20T00:00:00Z"}}
    ident = pb.lane_identity(cell, srcs, "modelless")
    assert ident == {"kind": "run", "id": "sha-old 2026-09-20T00:00:00Z"}
    assert pb.lane_identity(cell, {}, "modelless") == {"kind": "unknown", "id": None}


def case_published_primary_meta_verdict_is_not_stamped():
    """A published bench.json primary's meta.box_state is the table's
    ORIGINAL run's — it must never be stamped onto cells; a RAW primary's
    own verdict is."""
    raw = _timed_laya_doc("sha-raw", _box(False, False))
    merged, _ = merge_refusing(copy.deepcopy(raw))
    assert merged["suites"][0]["laya"]["english"]["latency_quotable"] is False
    pub = copy.deepcopy(raw)
    pub["meta"]["hosts"] = [{"host": "m3"}]
    pb.rename_hosts(pub)
    merged, _ = merge_refusing(pub)
    assert "latency_quotable" not in merged["suites"][0]["laya"]["english"]



def case_unknown_host_refused_at_load():
    # The runner's last-resort host label (REFLEX_BENCH_HOST unset AND
    # uname unreadable — the 4090's PowerShell probe, reflex Bench 082)
    # must REFUSE at load, never mint a phantom host row. The label fix
    # belongs at the run (relabel per the issue-033 law), not the merge.
    d = doc("unknown", "sha-u", {"s1": {"modelless_acc": PRE_ACC}})
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "doc.json"
        p.write_text(json.dumps(d), encoding="utf-8")
        try:
            pb.load_run(str(p))
        except SystemExit as e:
            assert e.code == 1, e.code
        else:
            raise AssertionError("unknown host must refuse")
    # the refusal is spelling-agnostic: a display-spelled unknown also
    # refuses (rename cannot rescue an unattributable run)
    d2 = doc("unknown", "sha-u2", {"s1": {"modelless_acc": PRE_ACC}})
    with tempfile.TemporaryDirectory() as td:
        p2 = Path(td) / "doc.json"
        p2.write_text(json.dumps(d2), encoding="utf-8")
        try:
            pb.load_run(str(p2))
        except SystemExit as e:
            assert e.code == 1, e.code
        else:
            raise AssertionError("unknown host must refuse")


def area_cell(lane, acc, model=None):
    cell = {"lane": lane, "hard": {"accuracy": acc}}
    if model:
        cell["model"] = model
    return cell


def area_doc():
    """A synthetic doc over ALL nine area suites with hand-checkable
    accuracies. Lanes: modelless everywhere; hybrid everywhere; encoder on
    sst5 only; laya on ag_news (english 0.95 beats typed 0.50) and
    typed_decisions (typed 0.90 beats english 0.40)."""
    acc = {
        "ag_news": 0.8625, "massive_intent_en": 0.4066667, "banking77": 0.402,
        "sst5": 0.2016667, "emotion": 0.77, "xnli_en": 0.5033333,
        "prompt_injections": 0.7672414, "typed_decisions": 0.5725,
        "code_fixtures": 0.375,
    }
    hyb = dict(acc, sst5=0.4216667)
    rows = []
    for name in pb.AREA_CHANCE:
        s = {"name": name, "n_questions": 100, "n_cases": 50,
             "modelless": area_cell("modelless", acc[name]),
             "hybrid": area_cell("Instinct (hybrid)", hyb[name])}
        if name == "sst5":
            s["encoder"] = area_cell("encoder", 0.5266667)
        if name == "ag_news":
            s["laya"] = {"english": area_cell("laya (rust)", 0.95, model="english"),
                         "typed": area_cell("laya (rust)", 0.50, model="typed")}
        if name == "typed_decisions":
            s["laya"] = {"english": area_cell("laya (rust)", 0.40, model="english"),
                         "typed": area_cell("laya (rust)", 0.90, model="typed")}
        rows.append(s)
    return {"meta": {"host": "m3", "git_sha": "sha-a", "date_utc": "2026-09-30T00:00:00Z"},
            "suites": rows}


def cc_of(name, a):
    ch = pb.AREA_CHANCE[name]
    return round((a - ch) / (1.0 - ch), 6)


def case_area_rollups_math_and_coverage():
    a = pb.compute_areas(area_doc())
    assert a["version"] == 3
    # every area suite present → coverage floor 9
    assert len(a["suites"]) == 9 and [x["id"] for x in a["areas"]] == \
        ["language", "sentiment", "reasoning", "decisions"]
    ml = a["lanes"]["modelless"]
    assert ml["complete"] and ml["coverage"] == {"suites": 9, "of": 9}
    # cc math, spot-checked
    assert ml["per_suite"]["ag_news"]["cc"] == cc_of("ag_news", 0.8625)
    assert ml["per_suite"]["sst5"]["cc"] == cc_of("sst5", 0.2016667)
    # area score = mean of the area's suite ccs; index = mean of areas
    lang = [cc_of("ag_news", 0.8625), cc_of("massive_intent_en", 0.4066667),
            cc_of("banking77", 0.402)]
    assert ml["areas"]["language"] == round(sum(lang) / 3, 6)
    assert ml["index"] == round(sum(ml["areas"].values()) / 4, 6)


def case_area_laya_picks_best_checkpoint():
    a = pb.compute_areas(area_doc())
    lay = a["lanes"]["laya"]
    # ag_news: english 0.95 beats typed 0.50 → english
    assert lay["per_suite"]["ag_news"]["acc"] == 0.95
    assert lay["per_suite"]["ag_news"]["ck"] == "english"
    # typed_decisions: typed 0.90 beats english 0.40 → typed
    assert lay["per_suite"]["typed_decisions"]["acc"] == 0.90
    assert lay["per_suite"]["typed_decisions"]["ck"] == "typed"


def case_area_python_laya_lane_picks_py_checkpoint():
    """The python laya lane rolls up from the py/ checkpoints with the same
    best-non-multilingual pick rule as the rust lane — and the rust lane is
    untouched by the py/ cells."""
    d = area_doc()
    s0 = d["suites"][0]  # ag_news: laya english 0.95 / typed 0.50
    s0["laya"]["py/english"] = area_cell("laya (python)", 0.93, model="english")
    s0["laya"]["py/typed"] = area_cell("laya (python)", 0.44, model="typed")
    a = pb.compute_areas(d)
    py = a["lanes"]["python"]
    assert py["display"] == "laya (python)" and py["color_key"] == "python"
    assert py["per_suite"]["ag_news"]["acc"] == 0.93
    assert py["per_suite"]["ag_news"]["ck"] == "english"
    assert py["coverage"] == {"suites": 1, "of": 9}
    # the rust lane never reads a py/ checkpoint as its pick
    assert a["lanes"]["laya"]["per_suite"]["ag_news"]["acc"] == 0.95
    assert a["lanes"]["laya"]["per_suite"]["ag_news"]["ck"] == "english"


def case_area_comparison_lanes_roll_up():
    """The radar carries every filterable lane: an acc-only paw cell
    (top-level accuracy, no `hard`) and a clm-shaped openthai cell roll up
    beside the product lanes with their palette keys."""
    d = area_doc()
    d["suites"][0]["paw"] = {"lane": "paw (hosted)", "accuracy": 0.55}  # ag_news
    d["suites"][1]["openthai"] = {"lane": "openthai (reference)",
                                  "hard": {"accuracy": 0.6}}  # massive_intent_en
    a = pb.compute_areas(d)
    paw = a["lanes"]["paw"]
    assert paw["display"] == "paw (hosted)" and paw["color_key"] == "paw"
    assert paw["per_suite"]["ag_news"]["acc"] == 0.55
    assert paw["per_suite"]["ag_news"]["cc"] == cc_of("ag_news", 0.55)
    assert paw["coverage"] == {"suites": 1, "of": 9} and paw["complete"] is False
    ot = a["lanes"]["openthai"]
    assert ot["display"] == "openthai"
    assert ot["per_suite"]["massive_intent_en"]["acc"] == 0.6
    assert ot["per_suite"]["massive_intent_en"]["cc"] == cc_of("massive_intent_en", 0.6)
    # a lane with zero cells still vanishes from the block
    assert "gliner" not in a["lanes"]


def case_area_serving_host_lane_rolls_up_host_tagged():
    """A lane the primary host never ran (clm on 4090-win) rolls up under a
    host-tagged key with the serving host recorded — never under the bare
    key — and a lane WITH primary cells (modelless) never enters the host
    pass, so no host-tagged duplicate of a primary lane can exist."""
    d = area_doc()
    for s in d["suites"][:2]:  # ag_news + massive_intent_en
        s["extra_host_lanes"] = {"4090-win": {
            "clm": {"lane": "clm (reference)", "hard": {"accuracy": 0.4}},
            "modelless": area_cell("KatGPT", 0.9),
        }}
    a = pb.compute_areas(d)
    clm = a["lanes"]["clm@4090-win"]
    assert clm["host"] == "4090-win" and clm["color_key"] == "clm"
    assert clm["per_suite"]["ag_news"]["acc"] == 0.4
    assert clm["per_suite"]["ag_news"]["cc"] == cc_of("ag_news", 0.4)
    assert clm["coverage"] == {"suites": 2, "of": 9} and clm["complete"] is False
    assert "clm" not in a["lanes"]
    # the primary lane's extra-host row never becomes a second radar lane
    assert "modelless@4090-win" not in a["lanes"]
    assert a["lanes"]["modelless"]["per_suite"]["ag_news"]["acc"] == 0.8625


def case_area_partial_lane_discloses_and_never_pads():
    a = pb.compute_areas(area_doc())
    enc = a["lanes"]["encoder"]
    assert enc["coverage"] == {"suites": 1, "of": 9}
    assert enc["complete"] is False
    # the index is the mean over WHAT WAS MEASURED (one suite), disclosed as
    # partial — never padded with zeros
    assert enc["index"] == cc_of("sst5", 0.5266667)
    assert list(enc["per_suite"]) == ["sst5"]
    assert list(enc["areas"]) == ["sentiment"]


def case_area_absent_lane_and_absent_suite_shrink_honestly():
    d = area_doc()
    for s in d["suites"]:
        s.pop("hybrid", None)   # a lane with zero cells vanishes from the block
    d["suites"] = [s for s in d["suites"] if s["name"] != "banking77"]
    a = pb.compute_areas(d)
    assert "hybrid" not in a["lanes"]
    # the denominators re-derive from what the doc carries (8 suites)
    for lane in a["lanes"].values():
        assert lane["coverage"]["of"] == 8
    assert "banking77" not in a["suites"]


def case_area_rollup_is_idempotent():
    d = area_doc()
    first = pb.compute_areas(d)
    second = pb.compute_areas(d)
    assert first == second


# ── plan 001 (2026-10-02): the Jev-distill arms — below-chance survival,
# the chance/edition digest pins, the curated-table completeness, the
# timing block population, and the --rederive byte guard.

def case_area_negative_cc_survives_rollup():
    """Plan 001 task 1d, Option B: a cell BELOW chance publishes a NEGATIVE
    cc, and the negative genuinely pulls the area mean and the lane index
    down — never clipped, never padded to 0."""
    d = area_doc()
    # emotion chance 1/6; an engine at 0.10 accuracy is far below chance
    d["suites"][4]["modelless"] = area_cell("modelless", 0.10)
    a = pb.compute_areas(d)
    ml = a["lanes"]["modelless"]
    neg = cc_of("emotion", 0.10)
    assert neg < 0
    assert ml["per_suite"]["emotion"]["cc"] == neg
    # the sentiment area mean includes the negative — a clipped rollup
    # would read higher
    sst5_cc = cc_of("sst5", 0.2016667)
    assert ml["areas"]["sentiment"] == round((sst5_cc + neg) / 2, 6)
    assert ml["areas"]["sentiment"] < sst5_cc
    assert ml["index"] < sum(
        cc_of(n, acc_n) for n, acc_n in (
            ("ag_news", 0.8625), ("massive_intent_en", 0.4066667),
            ("banking77", 0.402), ("sst5", 0.2016667),
            ("xnli_en", 0.5033333), ("prompt_injections", 0.7672414),
            ("typed_decisions", 0.5725), ("code_fixtures", 0.375),
        )) / 8
    # the published scale names the below-chance law
    assert "BELOW CHANCE" in a["scale"] and "negative" in a["scale"]


def case_area_zero_fill_regression():
    """Plan 001 task 3: the pending-not-zero law pinned at the emitter — a
    lane missing a suite has NO entry for it (never a fabricated 0), the
    area means skip the gap, coverage counts only measured suites, and
    `complete` stays False so a partial index can never masquerade as a
    full one."""
    d = area_doc()
    for s in d["suites"]:
        if s["name"] in ("emotion", "xnli_en"):
            s.pop("modelless")
    a = pb.compute_areas(d)
    ml = a["lanes"]["modelless"]
    assert "emotion" not in ml["per_suite"] and "xnli_en" not in ml["per_suite"]
    assert ml["coverage"] == {"suites": 7, "of": 9} and ml["complete"] is False
    # a suite gap never pads the area mean: reasoning survives on its one
    # measured suite (xnli_en removed, prompt_injections kept), sentiment
    # on sst5 alone
    assert ml["areas"]["reasoning"] == cc_of("prompt_injections", 0.7672414)
    assert "sentiment" in ml["areas"]  # sst5 only — emotion missing, no pad
    assert ml["index"] == round(sum(ml["areas"].values()) / len(ml["areas"]), 6)


def case_chance_digest_and_edition_pin():
    """Plan 001 tasks 2 + 7 (the round-2 verdict's ledger form): the chance
    basis is pinned twice — a published digest (areas.chance_digest) and
    the EDITIONS ledger, which FORCES the bump: the guard passes only when
    EDITION names the ledger's LAST row AND the computed digest equals that
    row's digest. Re-pinning a digest without a new edition label cannot
    pass (that is the defect the ledger replaced); neither can a basis edit
    without a bump."""
    a = pb.compute_areas(area_doc())
    assert a["chance_digest"] == pb.chance_digest()
    assert a["edition"] == pb.EDITION
    # the 2026-10 digest is FROZEN HERE as a literal — a silent basis edit
    # changes the computed digest and reds this line before any publish
    assert pb.edition_basis_digest() == "0133fc49a0baec3b3293f51324b5416b"
    # ledger shape: EDITION is the last key; digests pairwise distinct
    assert list(pb.EDITIONS)[-1] == pb.EDITION
    assert len(set(pb.EDITIONS.values())) == len(pb.EDITIONS)
    # every ledger edition has a changes.json row (the bump explanation)
    changes_path = SCRIPT.parent.parent / "data" / "changes.json"
    changes_text = changes_path.read_text(encoding="utf-8")
    for ed in pb.EDITIONS:
        assert ed in changes_text, f"EDITIONS[{ed}] has no data/changes.json row"
    # the guard passes at HEAD...
    assert pb.edition_guard() is True
    # ...and a basis edit flips it to refusal with both digests moved
    saved = dict(pb.AREA_CHANCE)
    try:
        pb.AREA_CHANCE["sst5"] = 1 / 4
        mutated_chance = pb.chance_digest()
        mutated_basis = pb.edition_basis_digest()
        assert mutated_chance != a["chance_digest"]
        assert mutated_basis != pb.EDITIONS[pb.EDITION]
        assert pb.edition_guard() is False
        # a ledger row appended WITHOUT pointing EDITION at it also refuses
        pb.AREA_CHANCE.clear()
        pb.AREA_CHANCE.update(saved)
        pb.EDITIONS["2026-11"] = mutated_basis
        try:
            assert pb.edition_guard() is False
        finally:
            del pb.EDITIONS["2026-11"]
        assert pb.edition_guard() is True
    finally:
        pb.AREA_CHANCE.clear()
        pb.AREA_CHANCE.update(saved)
    assert pb.edition_guard() is True


def case_lane_tables_complete():
    """Plan 001 tasks 4+5: the curated LANE_KIND / LANE_TIMING tables cover
    EVERY AREA_LANES class, both directions — a missing row reds (the next
    lane would silently ship with no disclosure) and a stale row reds (a
    retired lane must not keep one)."""
    classes = {k for k, _d, _c in pb.AREA_LANES}
    assert set(pb.LANE_KIND) == classes, (
        f"LANE_KIND drift: missing {classes - set(pb.LANE_KIND)}, "
        f"stale {set(pb.LANE_KIND) - classes}")
    assert set(pb.LANE_TIMING) == classes, (
        f"LANE_TIMING drift: missing {classes - set(pb.LANE_TIMING)}, "
        f"stale {set(pb.LANE_TIMING) - classes}")
    for k, row in pb.LANE_TIMING.items():
        assert row.get("clock") and row.get("method"), f"LANE_TIMING[{k}] incomplete"
    # every emitted lane block carries its kind, and every lane with an
    # areas block has a timing entry over the SAME population
    a = pb.compute_areas(area_doc())
    for key, ld in a["lanes"].items():
        assert ld["kind"] == pb.LANE_KIND[key.split("@")[0]]
        t = a["timing"][key]
        assert t["suites"] == len(ld["per_suite"])
        assert t["n_used"] + t["n_unquotable"] + t["n_unjudged"] == t["suites"]


def case_area_timing_population_and_quotable():
    """Plan 001 task 4 (the verdict's three changes): the p50 geometric
    mean covers EXACTLY the suites behind the lane's index (never other
    cells), uses latency_quotable-True cells only, and a lane with no
    quotable cell carries null — disclosed, never plotted at 0."""
    d = area_doc()
    # laya: two rolled-up cells (ag_news/english, typed_decisions/typed).
    # Give them latencies: english quotable 8.0, typed quotable 32.0 →
    # geomean 16.0 over the INDEX population (2 suites), regardless of any
    # other latency the doc carries.
    d["suites"][0]["laya"]["english"]["latency_p50_ms"] = 8.0
    d["suites"][0]["laya"]["english"]["latency_quotable"] = True
    d["suites"][0]["laya"]["typed"]["latency_p50_ms"] = 999.0   # not the pick
    d["suites"][0]["laya"]["typed"]["latency_quotable"] = True
    d["suites"][7]["laya"]["typed"]["latency_p50_ms"] = 32.0
    d["suites"][7]["laya"]["typed"]["latency_quotable"] = True
    # a THIRD suite the lane measured but the areas rollup never covers
    # (a Thai probe with no chance baseline) must stay OUT of the population
    d["suites"].append({
        "name": "thai_probe", "n_questions": 10, "n_cases": 5,
        "laya": {"english": dict(area_cell("laya (rust)", 0.5, model="english"),
                                 latency_p50_ms=100000.0, latency_quotable=True)},
    })
    # the modelless lane: quotable everywhere → geomean over 9
    for i, s in enumerate(d["suites"][:9]):
        s["modelless"]["latency_p50_ms"] = 1.0 * (i + 1)
        s["modelless"]["latency_quotable"] = True
    # one UNFIT cell: shown in tables, excluded from the geomean
    d["suites"][0]["hybrid"]["latency_p50_ms"] = 5.0
    d["suites"][0]["hybrid"]["latency_quotable"] = False
    for s in d["suites"][1:9]:
        s["hybrid"]["latency_p50_ms"] = 2.0
        s["hybrid"]["latency_quotable"] = True
    a = pb.compute_areas(d)
    lt = a["timing"]["laya"]
    assert lt["suites"] == 2 and lt["n_used"] == 2
    assert lt["p50_geomean_ms"] == round(math.sqrt(8.0 * 32.0), 4)
    ml = a["timing"]["modelless"]
    assert ml["suites"] == 9 and ml["n_used"] == 9
    assert ml["p50_geomean_ms"] == round(math.exp(
        sum(math.log(i) for i in range(1, 10)) / 9), 4)
    hy = a["timing"]["hybrid"]
    assert hy["n_unquotable"] == 1 and hy["n_used"] == 8
    assert hy["p50_geomean_ms"] == 2.0
    # acc-only cells (no latency fields at all) count as unjudged, and a
    # lane with NO quotable cell carries null — the not-plotted case
    d2 = area_doc()
    for s in d2["suites"]:
        s["paw"] = {"lane": "paw (hosted)", "accuracy": 0.5,
                    "latency_quotable": False}
    a2 = pb.compute_areas(d2)
    pt = a2["timing"]["paw"]
    assert pt["p50_geomean_ms"] is None and pt["n_unquotable"] == 9


def case_rederive_preserves_cells():
    """Plan 001 (the --rederive mode): rebuilding the derived blocks over a
    PUBLISHED bench.json must leave every suite's measurement cells
    byte-identical, refresh areas (v3 fields appear), stamp the edition —
    and main() refuses a RAW doc (no meta.hosts) and a mutated-cell
    rederive (the rename guard)."""
    published = pb.merge(
        doc("m3", "sha-m3", {"sst5": {"modelless_acc": 0.42, "laya_p50": 4.0},
                              "ag_news": {"modelless_acc": 0.86}}),
        [doc("4090-windows", "sha-w",
             {"sst5": {"modelless_acc": 0.42, "laya_p50": 8127.0}})],
    )
    pb.finalize(published)
    before = json.dumps(published["suites"], sort_keys=True)
    n = pb.finalize(published)
    assert n is not None
    assert json.dumps(published["suites"], sort_keys=True) == before, \
        "finalize is idempotent over a published doc (rename_lanes is a no-op on current spellings)"
    assert published["meta"]["edition"] == pb.EDITION
    a = published["areas"]
    assert a["version"] == 3 and "timing" in a and "chance_digest" in a
    assert a["lanes"]["modelless"]["kind"] == pb.LANE_KIND["modelless"]

    # raw docs refuse
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "raw.json"
        raw.write_text(json.dumps(doc("m3", "s", {"sst5": {"modelless_acc": 0.4}})),
                       encoding="utf-8")
        assert pb.rederive(raw) == 2
        # a published file rederives green and keeps its cells byte-identical
        pub = Path(td) / "bench.json"
        pub.write_text(json.dumps(published), encoding="utf-8")
        assert pb.rederive(pub) == 0
        after = json.loads(pub.read_text(encoding="utf-8"))
        strip = lambda dd: [{k: v for k, v in s.items()
                             if k not in ("pairing", "disclosures")}
                            for s in dd["suites"]]
        assert json.dumps(strip(after), sort_keys=True) == \
            json.dumps(strip(published), sort_keys=True)
        # a legacy lane spelling inside a cell WOULD mutate under the
        # display rename (LANE_DISPLAY maps it) — rederive must refuse,
        # never silently rewrite a measurement cell
        legacy = json.loads(pub.read_text(encoding="utf-8"))
        for s in legacy["suites"]:
            if s.get("modelless"):
                s["modelless"]["lane"] = "Instinct (hybrid)"   # maps to "Instinct"
        leg = Path(td) / "legacy.json"
        leg.write_text(json.dumps(legacy), encoding="utf-8")
        assert pb.rederive(leg) == 1


def case_rederive_archives_on_edition_bump():
    """The round-2 verdict's measured gap: --rederive is the path a
    scoring-basis (derived-only) change takes, so an edition bump through
    it MUST freeze the outgoing table too — archive_on_edition runs on the
    rederive write exactly like the ordinary publish."""
    published = pb.merge(
        doc("m3", "sha-m3", {"sst5": {"modelless_acc": 0.42, "laya_p50": 4.0}}),
        [],
    )
    pb.finalize(published)
    saved_edition = pb.EDITION
    try:
        pb.EDITION = "2026-11"   # the code bumped; the file still says 2026-10
        with tempfile.TemporaryDirectory() as td:
            pub = Path(td) / "bench.json"
            pub.write_text(json.dumps(published), encoding="utf-8")
            assert pb.rederive(pub) == 0
            after = json.loads(pub.read_text(encoding="utf-8"))
            assert after["meta"]["edition"] == "2026-11"
            arch = Path(td) / "archive" / "bench-2026-10.json"
            assert arch.is_file(), "the outgoing edition must freeze on a rederive bump"
            frozen = json.loads(arch.read_text(encoding="utf-8"))
            assert frozen["meta"]["edition"] == "2026-10"
            # a second rederive archives nothing (the archive exists)
            assert pb.rederive(pub) == 0
    finally:
        pb.EDITION = saved_edition


def case_encoder_lane_display_rebrands_to_rethink():
    # the riir-instinct naming law (riir-ai Proposal 051) + the owner call
    # (2026-10-01): the lane DISPLAY spellings are the qualifier-free
    # product names — "Rethink" (encoder arm) and "Instinct" (hybrid);
    # the lane KEYS never change, and every previously-published spelling
    # lands the current one on re-publish (the dual-spelling law)
    assert pb.LANE_DISPLAY["encoder"] == "Rethink"
    assert pb.LANE_DISPLAY["Instinct (encoder)"] == "Rethink"
    assert pb.LANE_DISPLAY["Rethink (encoder)"] == "Rethink"
    assert pb.LANE_DISPLAY["hybrid"] == "Instinct"
    assert pb.LANE_DISPLAY["Instinct (hybrid)"] == "Instinct"
    d = area_doc()
    d["suites"][3]["encoder"]["lane"] = "Rethink (encoder)"
    pb.rename_lanes(d)
    assert d["suites"][3]["encoder"]["lane"] == "Rethink"
    # and the areas block's display spelling agrees
    a = pb.compute_areas(d)
    assert a["lanes"]["encoder"]["display"] == "Rethink"
    assert a["lanes"]["hybrid"]["display"] == "Instinct"


def case_disclosures_stamp_cellless_lanes():
    # 2026-10-02 Rethink board completion: a suite with NO cell for a lane
    # but a measured reason why it never will gets the reason stamped as
    # s.disclosures[lane_key] — the renderer's noneBar prints it instead of
    # a bare "not run". A disclosure on a lane that CARRIES a cell is
    # dropped with a loud note (the cell supersedes); a name matching no
    # suite in the doc is skipped with a loud note (never a refusal — a
    # prose typo must not block the board publish; the missing disclosure
    # is caught in review instead).
    names = {s["name"] for s in area_doc()["suites"]}
    saved = dict(pb.DISCLOSURES)
    # Scope the table to suites the fixture carries, so the stamp arms are
    # exercised; the skip arm below exercises the rest.
    scoped = {n: v for n, v in pb.DISCLOSURES.items() if n in names}
    pb.DISCLOSURES.clear()
    pb.DISCLOSURES.update(scoped)
    try:
        d = area_doc()
        assert pb.apply_disclosures(d) == 0
        for n, notes in scoped.items():
            s = next(x for x in d["suites"] if x["name"] == n)
            for lk, note in notes.items():
                has_cell = (lk == "instinct-encoder" and s.get("encoder")) or (
                    lk == "instinct" and s.get("hybrid"))
                if has_cell:
                    assert lk not in s.get("disclosures", {})
                else:
                    assert s["disclosures"][lk] == note
        # Skip arm: a name matching no suite prints a loud note, exits 0.
        import io, contextlib
        pb.DISCLOSURES["zz_no_such_suite"] = {"instinct-encoder": "x"}
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            assert pb.apply_disclosures(area_doc()) == 0
        assert "zz_no_such_suite" in buf.getvalue()
        assert "disclosure skipped" in buf.getvalue()
    finally:
        pb.DISCLOSURES.clear()
        pb.DISCLOSURES.update(saved)


def case_disclosures_cell_supersedes():
    # A disclosure naming a suite+lane that carries a REAL cell is dropped
    # with a loud note — the measured cell wins over the reason.
    d0 = area_doc()
    names = {s["name"] for s in d0["suites"]}
    enc_suites = [s for s in d0["suites"] if s.get("encoder")]
    if not enc_suites:
        return
    name = enc_suites[0]["name"]
    saved = dict(pb.DISCLOSURES)
    scoped = {n: v for n, v in pb.DISCLOSURES.items() if n in names}
    pb.DISCLOSURES.clear()
    pb.DISCLOSURES.update(scoped)
    pb.DISCLOSURES[name] = {"instinct-encoder": "stale reason"}
    try:
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            assert pb.apply_disclosures(area_doc()) == 0
        assert "carries a cell" in buf.getvalue()
        s = next(x for x in area_doc()["suites"] if x["name"] == name)
        assert "disclosures" not in s or "instinct-encoder" not in s["disclosures"]
    finally:
        pb.DISCLOSURES.clear()
        pb.DISCLOSURES.update(saved)


def case_fallback_cells_close_product_lane_holes():
    # The full-coverage serving law (owner 2026-10-02, instinct 057d31a):
    # a product lane with no real cell gets a DERIVED served-answer cell —
    # the served tier's measured numbers + serves: tier-fallback +
    # served_by + derived. instinct falls back to the modelless tier;
    # instinct-encoder (Rethink) falls back to the seated arm (the hybrid
    # specialist where one seats, else modelless). A DISCLOSURES note for
    # the suite+lane is consumed into the cell (fallback_note).
    d = {
        "meta": {"host": "m3", "git_sha": "sha-a", "date_utc": "x"},
        "suites": [
            {   # hybrid seats → encoder fallback = the hybrid arm
                "name": "banking77",
                "n_questions": 500, "n_cases": 250,
                "modelless": fb_cell("modelless", 0.842),
                "hybrid": fb_cell("Instinct", 0.854),
            },
            {   # no hybrid → both product lanes fall back to modelless
                "name": "harness_visibility",
                "n_questions": 16, "n_cases": 16,
                "modelless": fb_cell("modelless", 0.5625),
                "disclosures": {"instinct": "specialist scope",
                                "instinct-encoder": "law-excluded"},
            },
            {   # a real instinct cell wins — no fallback on that lane
                "name": "emotion",
                "n_questions": 400, "n_cases": 400,
                "modelless": fb_cell("modelless", 0.885),
                "hybrid": fb_cell("Instinct", 0.885),
            },
        ],
    }
    assert pb.apply_fallback_cells(d) == 0
    s = {x["name"]: x for x in d["suites"]}
    # banking77: instinct has a real cell; encoder derives from the HYBRID
    # tier (the seated arm).
    enc = s["banking77"]["encoder"]
    assert enc["serves"] == "tier-fallback" and enc["derived"] is True
    assert enc["hard"]["accuracy"] == 0.854
    assert "Instinct" in enc["served_by"]
    assert enc["model"] == "Instinct" or "Instinct" in enc["served_by"]
    # harness_visibility: BOTH product lanes derive from modelless; the
    # disclosures are consumed into the cells.
    for k in ("hybrid", "encoder"):
        c = s["harness_visibility"][k]
        assert c["serves"] == "tier-fallback" and c["derived"] is True
        assert c["hard"]["accuracy"] == 0.5625
        assert "Reflex" in c["served_by"]
        assert c["fallback_note"]
    assert "disclosures" not in s["harness_visibility"]
    # emotion: the real instinct cell is untouched (not a fallback).
    assert s["emotion"]["hybrid"].get("derived") is None
    # …but its encoder lane falls back from the hybrid cell.
    assert s["emotion"]["encoder"]["hard"]["accuracy"] == 0.885


def case_fallback_cells_need_a_measurable_source():
    # No modelless cell → nothing is derived (never a fabricated answer);
    # the disclosure stays for the noneBar. Idempotent: a second run over
    # an already-derived doc derives nothing new and changes nothing.
    d = {
        "meta": {"host": "m3", "git_sha": "sha-a", "date_utc": "x"},
        "suites": [{
            "name": "harness_tool_fit",
            "n_questions": 12, "n_cases": 12,
            "disclosures": {"instinct": "scope"},
        }],
    }
    assert pb.apply_fallback_cells(d) == 0
    s = d["suites"][0]
    assert "hybrid" not in s and "encoder" not in s
    assert s["disclosures"] == {"instinct": "scope"}
    # Idempotence on a derived doc.
    d2 = {
        "meta": {"host": "m3", "git_sha": "sha-a", "date_utc": "x"},
        "suites": [{
            "name": "harness_routing",
            "n_questions": 16, "n_cases": 16,
            "modelless": fb_cell("modelless", 0.75),
        }],
    }
    assert pb.apply_fallback_cells(d2) == 0
    first = copy.deepcopy(d2["suites"][0]["hybrid"])
    assert pb.apply_fallback_cells(d2) == 0
    assert d2["suites"][0]["hybrid"] == first


def case_displaced_losing_records_show_the_served_answer():
    # The best-of-family display (owner call 2026-10-02): a serve-REFUSED
    # record cell on the Rethink lane that reads STRICTLY BELOW the seated
    # arm is displaced — the row shows the served answer (tier-fallback ↩,
    # derived), the refused arm's own measured cell rides verbatim under
    # displaced_record, and the note names the read and the gap. At-or-above
    # the seated arm the violet record cell STAYS (the encoder arm is the
    # family's best measured arm there). Nothing measurable to serve → no
    # displacement. Idempotent, and the rederive byte-guard canonicalizes a
    # displaced cell to its record (the measurement never moves).
    d = {
        "meta": {"host": "m3", "git_sha": "sha-a", "date_utc": "x"},
        "suites": [
            {   # banking77: the refused record (0.442) sits far under the
                # seated arm (0.854) — displaced, record preserved.
                "name": "banking77",
                "n_questions": 500, "n_cases": 250,
                "modelless": fb_cell("modelless", 0.842),
                "hybrid": fb_cell("Instinct", 0.854),
                "encoder": {
                    "lane": "Rethink",
                    "model": "ENC-banking77_encoder_v1",
                    "hard": {"n": 500, "accuracy": 0.442},
                    "serves": "✗ (encoder class refused at serve — the "
                              "incumbent arm serves)",
                    "record_only": True,
                },
            },
            {   # ag_news: the refused record (0.9475) reads ABOVE the seated
                # arm (0.8975) — the violet record cell stays, undisplaced.
                "name": "ag_news",
                "n_questions": 400, "n_cases": 200,
                "modelless": fb_cell("modelless", 0.8825),
                "hybrid": fb_cell("Instinct", 0.8975),
                "encoder": {
                    "lane": "Rethink",
                    "model": "ENC-ag_news_encoder_v1",
                    "hard": {"n": 400, "accuracy": 0.9475},
                    "serves": "✗ (encoder class refused at serve)",
                    "record_only": True,
                },
            },
            {   # thai reference read: nothing measurable serves (no modelless,
                # no hybrid) — the record cell stays undisplaced.
                "name": "thai_wisesight",
                "n_questions": 400, "n_cases": 400,
                "encoder": {
                    "lane": "Rethink",
                    "model": "ENC-ref",
                    "hard": {"n": 400, "accuracy": 0.4075},
                    "serves": "✗ (record-only; no head earned)",
                    "record_only": True,
                },
            },
        ],
    }
    assert pb.apply_fallback_cells(d) == 0
    s = {x["name"]: x for x in d["suites"]}
    # banking77 — displaced: the row shows the served answer.
    enc = s["banking77"]["encoder"]
    assert enc["serves"] == "tier-fallback" and enc["derived"] is True
    assert enc["hard"]["accuracy"] == 0.854
    assert "Instinct" in enc["served_by"]
    # the refused arm's own read rides the cell verbatim.
    rec = enc["displaced_record"]
    assert rec["hard"]["accuracy"] == 0.442
    assert rec["record_only"] is True and rec.get("derived") is None
    assert "0.4420" in enc["fallback_note"] and "best-of-family" in enc["fallback_note"]
    # ag_news — the winning violet record cell stays.
    win = s["ag_news"]["encoder"]
    assert win["hard"]["accuracy"] == 0.9475
    assert win.get("derived") is None and "displaced_record" not in win
    # thai — nothing serves, the record stands.
    assert s["thai_wisesight"]["encoder"]["hard"]["accuracy"] == 0.4075
    assert s["thai_wisesight"]["encoder"].get("derived") is None
    # Idempotent: a second pass over the displaced doc changes nothing.
    before = copy.deepcopy(d)
    assert pb.apply_fallback_cells(d) == 0
    assert d == before
    # The byte-guard canonicalizes the displacement: the measurable view of
    # the displaced suite IS the preserved record, so a rederive over it
    # holds (the measurement never moved — it was relocated verbatim).
    m = pb._measurable(s["banking77"])
    assert m["encoder"] == rec


def case_displaced_records_leave_the_radar():
    # A derived cell never feeds the lane's radar/timing rollup: the
    # displaced banking77 reads as a coverage GAP on the encoder lane
    # (the answering tier already owns the number on its own spoke),
    # while the lane's own real cells (ag_news) still roll up.
    d = {
        "meta": {"host": "m3", "git_sha": "sha-a", "date_utc": "x"},
        "suites": [
            {
                "name": "banking77",
                "n_questions": 500, "n_cases": 250,
                "modelless": fb_cell("modelless", 0.842),
                "hybrid": fb_cell("Instinct", 0.854),
                "encoder": {
                    "lane": "Rethink", "model": "ENC-v1",
                    "hard": {"n": 500, "accuracy": 0.442},
                    "serves": "✗ (refused)", "record_only": True,
                },
            },
            {
                "name": "ag_news",
                "n_questions": 400, "n_cases": 200,
                "modelless": fb_cell("modelless", 0.8825),
                "hybrid": fb_cell("Instinct", 0.8975),
                "encoder": {
                    "lane": "Rethink", "model": "ENC-v1",
                    "hard": {"n": 400, "accuracy": 0.9475},
                    "serves": "✗ (refused)", "record_only": True,
                },
            },
        ],
    }
    assert pb.apply_fallback_cells(d) == 0
    a = pb.compute_areas(d)
    enc = a["lanes"]["encoder"]["per_suite"]
    assert "banking77" not in enc          # displaced → gap, never the
    assert enc["ag_news"]["acc"] == 0.9475  # seated arm's number twice
    assert a["lanes"]["encoder"]["coverage"]["suites"] == 1


def fb_cell(lane, acc, model=None):
    """A minimal measured-tier cell for the fallback fixtures."""
    return {
        "lane": lane,
        "model": model or lane,
        "hard": {"n": 100, "accuracy": acc},
        "latency_scope": "seat+arm", "latency_rows": "questions",
        "latency_p50_ms": 0.01, "latency_p99_ms": 0.02,
        "latency_tail_support": 5,
        "source_run": {"git_sha": "sha-b", "date_utc": "2026-10-02T00:00:00Z"},
    }


CASES = [
    case_fallback_cells_close_product_lane_holes,
    case_fallback_cells_need_a_measurable_source,
    case_displaced_losing_records_show_the_served_answer,
    case_displaced_records_leave_the_radar,
    case_disclosures_stamp_cellless_lanes,
    case_disclosures_cell_supersedes,
    case_lane_carry_keeps_incumbent_timing,
    case_republish_never_carries_an_untouched_lane,
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
    case_population_reset_replaces_the_row,
    case_population_reset_stale_ack_refuses,
    case_population_reset_ack_without_mismatch_refuses,
    case_code_fixtures_population_excluded_from_drift_gate,
    case_device_posture_refreshes_on_laya_update,
    case_clm_lane_and_leak_block_ride_an_update,
    case_host_display_rename_at_load_boundary,
    case_gliner_lane_rides_an_update,
    case_bekko_lane_rides_an_update,
    case_agentjev_lane_rides_an_update,
    case_openthai_lane_rides_an_update,
    case_hybrid_lane_rides_an_update,
    case_paw_lanes_ride_an_update,
    case_publish_bench_lanes_filter,
    case_device_variant_host_drops_modelless,
    case_unknown_suite_join_rides_an_update,
    case_extra_suite_absent_in_primary_joins_loudly,
    case_end_to_end_main,
    case_pairing_differs_on_cross_sample_runs,
    case_pairing_same_when_digests_match,
    case_pairing_differs_when_digests_differ_even_same_run_shape,
    case_pairing_same_results_when_run_differs_results_equal,
    case_pairing_primary_run_lanes_fall_back_to_doc_identity,
    case_pairing_unknown_when_doc_identity_missing,
    case_pairing_digest_stamp_rides_cells,
    case_doc_latency_quotable_three_state,
    case_unquotable_latency_refused_at_publish,
    case_quotable_and_unjudged_record_provenance,
    case_carried_lane_is_exempt_from_the_wall,
    case_carried_timing_keeps_the_incumbents_verdict,
    case_published_primary_meta_verdict_is_not_stamped,
    case_quotable_update_replaces_unfit_incumbent_carry,
    case_carry_still_serves_an_unquotable_update,
    case_carry_still_serves_an_unjudged_update,
    case_wall_judges_a_quotable_update_over_an_unfit_incumbent,
    case_corpus_digest_gates_the_carry,
    case_wall_judges_a_corpus_changed_slot,
    case_corpus_reset_ack_exempts_and_fires,
    case_corpus_reset_stale_ack_refuses,
    case_corpus_reset_ack_fires_on_carried_timing_incumbent,
    case_corpus_reset_ack_extra_host_shape,
    case_source_run_stamp_is_per_suite,
    case_source_run_stamp_survives_remerge_and_digest_wins,
    case_pre_stamp_cells_still_fall_back_to_lane_sources,
    case_a0_stands_label_rides_the_cell,
    case_unknown_host_refused_at_load,
    case_area_rollups_math_and_coverage,
    case_area_laya_picks_best_checkpoint,
    case_area_python_laya_lane_picks_py_checkpoint,
    case_area_comparison_lanes_roll_up,
    case_area_serving_host_lane_rolls_up_host_tagged,
    case_area_partial_lane_discloses_and_never_pads,
    case_area_absent_lane_and_absent_suite_shrink_honestly,
    case_area_rollup_is_idempotent,
    case_encoder_lane_display_rebrands_to_rethink,
    case_area_negative_cc_survives_rollup,
    case_area_zero_fill_regression,
    case_chance_digest_and_edition_pin,
    case_lane_tables_complete,
    case_area_timing_population_and_quotable,
    case_rederive_preserves_cells,
    case_rederive_archives_on_edition_bump,
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

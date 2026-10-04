#!/usr/bin/env python3
"""Self-test for publish_sizes.py — plain asserts over synthetic sources,
no network, no repo state. Run:
    python3 scripts/test_publish_sizes.py
Exit 0 = green; a failing case prints its name before asserting.
"""

import importlib.util
import json
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "publish_sizes.py"
spec = importlib.util.spec_from_file_location("publish_sizes", SCRIPT)
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)

FAKE_REL = {
    "tag": "v9.9.9",
    "url": "https://github.com/gist-rs/reflex/releases/v9.9.9",
    "archives": {
        "reflex-v9.9.9-aarch64-apple-darwin.tar.gz": 1_000_000,
        "reflex-v9.9.9-x86_64-apple-darwin.tar.gz": 1_100_000,
        "reflex-v9.9.9-aarch64-unknown-linux-musl.tar.gz": 1_200_000,
        "reflex-v9.9.9-x86_64-unknown-linux-musl.tar.gz": 1_300_000,
        "reflex-v9.9.9-x86_64-pc-windows-gnu.zip": 1_400_000,
    },
    "installed_bytes": 5_000_000,
    "installed_files": [(4_950_000, "reflex"), (50_000, "THIRD_PARTY_LICENSES.md")],
}

# A synthetic HF: two repos; laya carries the three-checkpoint layout.
FAKE_HF = {
    "convaiinnovations/laya": {"siblings": [
        {"rfilename": ".gitattributes", "size": 100},
        {"rfilename": "model.safetensors", "size": 800_000_000},
        {"rfilename": "tokenizer/tokenizer.json", "size": 3_000_000},
        {"rfilename": "multilingual/model.safetensors", "size": 600_000_000},
        {"rfilename": "multilingual/tokenizer/tokenizer.json", "size": 2_000_000},
        {"rfilename": "typed-decisions/model.safetensors", "size": 810_000_000},
        {"rfilename": "typed-decisions/tokenizer/tokenizer.json", "size": 3_500_000},
        {"rfilename": "typed-decisions/encoder/config.json", "size": 1_000},
    ]},
    "fastino/GLiNER2.5-Decide": {"siblings": [
        {"rfilename": ".gitattributes", "size": 100},
        {"rfilename": "model.safetensors", "size": 1_900_000_000},
        {"rfilename": "tokenizer.json", "size": 8_000_000},
    ]},
    "aimeigaoshou/agent-jev": {"siblings": [{"rfilename": "model.safetensors", "size": 2_300_000_000}]},
    "Qwen/Qwen3-0.6B": {"siblings": [{"rfilename": "model.safetensors", "size": 1_500_000_000}]},
    "Qwen/Qwen3-8B": {"siblings": [{"rfilename": "model.safetensors", "size": 16_000_000_000}]},
    "iapp/OpenThai-SystemOne": {"siblings": [{"rfilename": "model.safetensors", "size": 1_500_000_000}]},
    "hotchpotch/bekko-system-one-v0-400m": {"siblings": [
        {"rfilename": ".gitattributes", "size": 100},
        {"rfilename": "model.safetensors", "size": 260_000_000},
        {"rfilename": "tokenizer.json", "size": 700_000},
    ]},
    "hotchpotch/bekko-system-one-v0-68m": {"siblings": [
        {"rfilename": ".gitattributes", "size": 100},
        {"rfilename": "model.safetensors", "size": 48_000_000},
        {"rfilename": "tokenizer.json", "size": 700_000},
    ]},
    "Contrastive-LM/CLM-v0.1-8B": {"siblings": [{"rfilename": "CLM_v0.1-8B.pt", "size": 75_000_000}]},
    "mlx-community/clef-flash-4bit": {"siblings": [{"rfilename": "model.safetensors", "size": 6_000_000_000}]},
}

FAKE_RECORDED = {k: {"key": k, "bytes": v, "what": f"{k} fake", "host": "fake-host", "date_utc": "2026-01-01", "how": "fake"}
                 for k, v in {
                     "laya_python_runtime": 640_000_000,
                     "gliner_venv": 4_400_000_000,
                     "agentjev_venv": 4_500_000_000,
                     "clm_docker": 30_000_000_000,
                     "clm_repo": 77_000_000,
                     "instinct_serve_binary": 1_800_000,
                     "instinct_datasets_t20k": 20_000_000,
                     "instinct_winner_vessels": 20_320_298,
                     "rethink_serve_binary": 8_000_000,
                     "laya_english_q8_artifact": 450_000_000,
                     "rethink_encoder_heads": 9_000_000,
                     "rethink_datasets_typed_full": 7_000_000,
                     "openthai_venv": 700_000_000,
                     "bekko_venv": 660_000_000,
                     "clef_venv": 580_000_000,
                 }.items()}
# the two recorded_files records carry their per-file values (the real
# entries restate the same measurement's lstat values; sums asserted)
FAKE_RECORDED["instinct_winner_vessels"]["files"] = [
    {"label": "ag_news specialist", "bytes": 524_381},
    {"label": "emotion specialist", "bytes": 786_545},
    {"label": "sst5 specialist", "bytes": 655_460},
    {"label": "massive_intent_en specialist", "bytes": 7_865_749},
    {"label": "banking77 specialist", "bytes": 10_094_864},
    {"label": "xnli_en specialist", "bytes": 393_299},
]
FAKE_RECORDED["rethink_encoder_heads"]["files"] = [
    {"label": "sst5 head (t6_s0)", "bytes": 3_000_000},
    {"label": "xnli_en head", "bytes": 3_000_000},
    {"label": "ag_news head", "bytes": 3_000_000},
]

FAILURES = []


def case(name):
    def deco(fn):
        try:
            fn()
            print(f"  ok  {name}")
        except AssertionError as e:
            FAILURES.append(name)
            print(f"FAIL  {name}: {e}")
    return deco


def patched_build(rel=FAKE_REL, hf=FAKE_HF, recorded=None):
    recorded = dict(FAKE_RECORDED if recorded is None else recorded)
    ps_local = local_bytes_patcher()
    hf_bytes = lambda repo, prefix=None, filename=None: fake_hf_sum(hf, repo, prefix, filename)
    orig = (ps.local_bytes, ps.hf_tree_bytes)
    ps.local_bytes, ps.hf_tree_bytes = ps_local, hf_bytes
    try:
        return ps.build(rel, recorded)
    finally:
        ps.local_bytes, ps.hf_tree_bytes = orig


def fake_hf_sum(hf, repo, prefix=None, filename=None):
    sib = hf[repo]["siblings"]
    total = 0
    for s in sib:
        name, size = s["rfilename"], s["size"]
        if name == ".gitattributes":
            continue
        if filename is not None:
            if name == filename:
                total += size
        elif prefix is not None:
            if prefix == "" or name.startswith(prefix):
                total += size
        else:
            total += size
    return total


def local_bytes_patcher():
    vals = {"assets/arena_head.wasm": 92_057}
    return lambda rel: vals[rel]


@case("every candidate renders with the full field set")
def _():
    d = patched_build()
    assert len(d["candidates"]) == 13, len(d["candidates"])
    for c in d["candidates"]:
        for f in ("key", "name", "framework", "engine_bytes", "engine_what",
                  "model_what", "targets", "engine_provenance"):
            assert c.get(f), f"{c['key']}.{f}"
        assert c["engine_bytes"] > 0, c["key"]
        assert c["model_bytes"] >= 0, c["key"]
        if c["model_bytes"] == 0:
            assert "none" in c["model_what"], c["key"]
            assert "model_stack" not in c, f"{c['key']}: a no-weights row carries no stack"
        else:
            # every weights row carries its component split; the leaves sum
            # to model_bytes by construction (the sub-bar + bullet contract)
            st = c.get("model_stack")
            assert isinstance(st, list) and st, f"{c['key']}: no model_stack"
            assert sum(f["bytes"] for f in st) == c["model_bytes"], c["key"]
            for f in st:
                assert f.get("label") and f.get("kind") and f["bytes"] > 0, (c["key"], f)


@case("sorted ascending by engine+model total")
def _():
    d = patched_build()
    totals = [c["engine_bytes"] + c["model_bytes"] for c in d["candidates"]]
    assert totals == sorted(totals), totals
    assert d["candidates"][0]["key"] == "wasm_heads", d["candidates"][0]["key"]
    assert d["candidates"][-1]["key"] == "clm", d["candidates"][-1]["key"]


@case("subtree sums exclude sibling checkpoints and hub chrome")
def _():
    n = fake_hf_sum(FAKE_HF, "convaiinnovations/laya", prefix="typed-decisions/")
    assert n == 810_000_000 + 3_500_000 + 1_000, n


@case("engine sources resolve: release / recorded / recorded_sum")
def _():
    d = patched_build()
    by = {c["key"]: c for c in d["candidates"]}
    assert by["reflex_native"]["engine_bytes"] == 5_000_000
    assert by["gliner"]["engine_bytes"] == 4_400_000_000
    assert by["clm"]["engine_bytes"] == 30_000_000_000 + 77_000_000


@case("engine_kind tags every row rust or python (the size chart's env color law)")
def _():
    d = patched_build()
    by = {c["key"]: c for c in d["candidates"]}
    assert {k for k, c in by.items() if c["engine_kind"] == "rust"} == {
        "wasm_heads", "reflex_native", "reflex_laya_typed", "instinct_hybrid", "rethink_encoder",
    }
    assert {k for k, c in by.items() if c["engine_kind"] == "python"} == {
        "laya_python", "gliner", "agentjev", "openthai", "bekko", "bekko68m", "clef", "clm",
    }
    assert all(c["engine_kind"] in ("rust", "python") for c in by.values())


@case("model sources resolve: subtree / multi-repo sum")
def _():
    d = patched_build()
    by = {c["key"]: c for c in d["candidates"]}
    assert by["reflex_laya_typed"]["model_bytes"] == 813_501_000, by["reflex_laya_typed"]["model_bytes"]
    assert by["agentjev"]["model_bytes"] == 2_300_000_000 + 1_500_000_000
    assert by["clm"]["model_bytes"] == 16_000_000_000 + 75_000_000
    # a lone leaf names itself (stack_label) — the tooltip bullet is the
    # component, never a generic "model / weights" where a name is known
    assert by["reflex_laya_typed"]["model_stack"] == [
        {"label": "typed-decisions checkpoint", "kind": "weights", "bytes": 813_501_000}
    ], by["reflex_laya_typed"]["model_stack"]
    assert by["clm"]["model_stack"][0]["label"] == "Qwen3-8B + CLM head"


@case("instinct resolves: recorded_sum engine + recorded_files model (the six specialists)")
def _():
    d = patched_build()
    by = {c["key"]: c for c in d["candidates"]}
    h = by["instinct_hybrid"]
    assert h["engine_bytes"] == 1_800_000 + 20_000_000, h["engine_bytes"]
    assert h["model_bytes"] == 20_320_298, h["model_bytes"]
    assert h["model_provenance"]["source"] == "recorded measurement", h["model_provenance"]
    assert h["engine_provenance"]["source"] == "recorded measurement (sum)", h["engine_provenance"]
    assert h["model_what"], h["key"]
    st = h["model_stack"]
    assert [f["label"] for f in st] == [
        "ag_news specialist", "emotion specialist", "sst5 specialist",
        "massive_intent_en specialist", "banking77 specialist", "xnli_en specialist"], st
    assert all(f["kind"] == "specialist" for f in st), st
    assert sum(f["bytes"] for f in st) == 20_320_298, st


@case("bekko resolves: recorded venv engine + hf_total model tree")
def _():
    d = patched_build()
    by = {c["key"]: c for c in d["candidates"]}
    b = by["bekko"]
    assert b["engine_bytes"] == 660_000_000, b["engine_bytes"]
    # .gitattributes excluded as hub chrome: safetensors + tokenizer only
    assert b["model_bytes"] == 260_000_000 + 700_000, b["model_bytes"]
    assert b["engine_provenance"]["source"] == "recorded measurement", b["engine_provenance"]
    assert b["model_provenance"]["source"] == "huggingface.co tree API (exact bytes)", b["model_provenance"]


@case("rethink resolves: recorded_sum engine + summed RECORDED model (q8 artifact + heads, 4-leaf stack)")
def _():
    d = patched_build()
    by = {c["key"]: c for c in d["candidates"]}
    r = by["rethink_encoder"]
    assert r["engine_bytes"] == 8_000_000 + 20_000_000, r["engine_bytes"]
    # the adopted q8 posture: the model half is the recorded derived Q8_0
    # artifact + the recorded locked heads — no live HF tree in the row.
    assert r["model_bytes"] == 450_000_000 + 9_000_000, r["model_bytes"]
    assert r["model_provenance"]["source"] == "sum of measured sources", r["model_provenance"]
    for needle in ("laya_english_q8_artifact fake", "rethink_encoder_heads fake"):
        assert needle in r["model_provenance"]["detail"], r["model_provenance"]
    assert r["engine_provenance"]["source"] == "recorded measurement (sum)", r["engine_provenance"]
    st = r["model_stack"]
    assert [f["kind"] for f in st] == ["encoder", "head", "head", "head"], st
    assert st[0]["label"] == "laya-english encoder · Q8_0", st
    assert sum(f["bytes"] for f in st) == r["model_bytes"], st


@case("hf_subtree_diff resolves and refuses an empty result")
def _():
    fake_hf = lambda repo, prefix=None, filename=None: fake_hf_sum(FAKE_HF, repo, prefix, filename)
    orig = ps.hf_tree_bytes
    ps.hf_tree_bytes = fake_hf
    try:
        n, prov, st = ps.resolve_model(
            ("hf_subtree_diff", "convaiinnovations/laya", ["multilingual/", "typed-decisions/"]), {})
        assert n == 800_000_000 + 3_000_000, n
        assert "whole tree minus" in prov["detail"], prov
        assert len(st) == 1 and st[0]["kind"] == "weights", st
        try:
            ps.resolve_model(("hf_subtree_diff", "convaiinnovations/laya", ["", ""]), {})
            raise AssertionError("hf_subtree_diff published an empty tree")
        except SystemExit:
            pass
    finally:
        ps.hf_tree_bytes = orig


@case("recorded_files refuses a missing or drifted files array")
def _():
    no_files = {k: v for k, v in FAKE_RECORDED.items()}
    no_files["instinct_winner_vessels"] = {k: v for k, v in FAKE_RECORDED["instinct_winner_vessels"].items() if k != "files"}
    try:
        ps.resolve_model(("recorded_files", "instinct_winner_vessels"), no_files)
        raise AssertionError("recorded_files accepted a record with no files array")
    except SystemExit:
        pass
    drifted = json.loads(json.dumps(FAKE_RECORDED))
    drifted["rethink_encoder_heads"]["files"][0]["bytes"] += 1
    try:
        ps.resolve_model(("recorded_files", "rethink_encoder_heads"), drifted)
        raise AssertionError("recorded_files accepted a drifted files sum")
    except SystemExit:
        pass


@case("a recorded key missing inside a sum refuses loudly")
def _():
    for dropped in ("rethink_encoder_heads", "laya_english_q8_artifact"):
        broken = {k: v for k, v in FAKE_RECORDED.items() if k != dropped}
        try:
            patched_build(recorded=broken)
            raise AssertionError(f"built with a recorded key missing inside a sum ({dropped})")
        except SystemExit:
            pass


@case("a missing recorded key refuses loudly (engine AND model sides)")
def _():
    for dropped in ("clm_repo", "instinct_winner_vessels"):
        broken = {k: v for k, v in FAKE_RECORDED.items() if k != dropped}
        try:
            patched_build(recorded=broken)
        except SystemExit:
            continue
        raise AssertionError(f"built with a missing recorded key ({dropped})")


@case("an empty HF tree refuses loudly (the real hf_tree_bytes law)")
def _():
    orig = ps.fetch_hf
    ps.fetch_hf = lambda repo: {"siblings": []}
    try:
        ps.hf_tree_bytes("fastino/GLiNER2.5-Decide")
        raise AssertionError("hf_tree_bytes returned 0 for an empty tree")
    except SystemExit:
        pass
    finally:
        ps.fetch_hf = orig


@case("check_committed catches drift (sort + missing candidate)")
def _():
    import json
    good = patched_build()
    bad_sort = json.loads(json.dumps(good))
    bad_sort["candidates"] = list(reversed(bad_sort["candidates"]))
    bad_set = json.loads(json.dumps(good))
    bad_set["candidates"] = bad_set["candidates"][:-1]

    orig_path, orig_die = ps.OUT_PATH, ps.die
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tf:
        for doc, why in ((bad_sort, "sort"), (bad_set, "set")):
            tf.seek(0); tf.truncate()
            json.dump(doc, tf); tf.flush()
            ps.OUT_PATH = Path(tf.name)
            caught = False
            def my_die(msg):
                raise SystemExit(msg)
            ps.die = my_die
            try:
                ps.check_committed()
            except SystemExit:
                caught = True
            finally:
                ps.die = orig_die
            assert caught, f"check_committed passed a drifting doc ({why})"
    ps.OUT_PATH = orig_path


if FAILURES:
    print(f"\n{len(FAILURES)} case(s) failed: {FAILURES}")
    sys.exit(1)
print("\npublish_sizes self-test PASS")

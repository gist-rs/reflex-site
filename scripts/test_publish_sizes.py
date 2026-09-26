#!/usr/bin/env python3
"""Self-test for publish_sizes.py — plain asserts over synthetic sources,
no network, no repo state. Run:
    python3 scripts/test_publish_sizes.py
Exit 0 = green; a failing case prints its name before asserting.
"""

import importlib.util
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
    "Contrastive-LM/CLM-v0.1-8B": {"siblings": [{"rfilename": "CLM_v0.1-8B.pt", "size": 75_000_000}]},
}

FAKE_RECORDED = {k: {"key": k, "bytes": v, "what": f"{k} fake", "host": "fake-host", "date_utc": "2026-01-01", "how": "fake"}
                 for k, v in {
                     "laya_python_runtime": 640_000_000,
                     "gliner_venv": 4_400_000_000,
                     "agentjev_venv": 4_500_000_000,
                     "clm_docker": 30_000_000_000,
                     "clm_repo": 77_000_000,
                 }.items()}

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
    assert len(d["candidates"]) == 7, len(d["candidates"])
    for c in d["candidates"]:
        for f in ("key", "name", "framework", "engine_bytes", "engine_what",
                  "model_what", "targets", "engine_provenance"):
            assert c.get(f), f"{c['key']}.{f}"
        assert c["engine_bytes"] > 0, c["key"]
        assert c["model_bytes"] >= 0, c["key"]
        if c["model_bytes"] == 0:
            assert "none" in c["model_what"], c["key"]


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


@case("model sources resolve: subtree / multi-repo sum")
def _():
    d = patched_build()
    by = {c["key"]: c for c in d["candidates"]}
    assert by["reflex_laya_typed"]["model_bytes"] == 813_501_000, by["reflex_laya_typed"]["model_bytes"]
    assert by["agentjev"]["model_bytes"] == 2_300_000_000 + 1_500_000_000
    assert by["clm"]["model_bytes"] == 16_000_000_000 + 75_000_000


@case("a missing recorded key refuses loudly")
def _():
    broken = {k: v for k, v in FAKE_RECORDED.items() if k != "clm_repo"}
    try:
        patched_build(recorded=broken)
    except SystemExit:
        return
    raise AssertionError("built with a missing recorded key")


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

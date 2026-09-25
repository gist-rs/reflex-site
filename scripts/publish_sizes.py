#!/usr/bin/env python3
"""Generate data/sizes.json — the disk-footprint report behind the home
page's "What each lane costs on disk" section (#sizes).

The bench.json law, verbatim: every NUMBER on the page renders from
generated data, never hand-typed. Three source classes:

  LIVE — refreshed on every run:
    - gist-rs/reflex latest release: archive sizes from the GitHub API +
      the UNPACKED footprint (binary + THIRD_PARTY_LICENSES.md) of the
      aarch64-apple-darwin archive, downloaded to a tmpdir and stat'd
    - model trees from the HF API (blobs=true), summed per subtree
    - assets/arena_head.wasm (local stat)

  RECORDED — data/sizes.measurements.json, box-specific facts measured
    once per bench window (venvs, the docker image, the python oracle's
    import closure), each with host + command provenance.

Refuses loudly (exit 1) when any LIVE source fails or any RECORDED key is
missing: a partial size report must never render as a confident complete
one (the frontier-report law).

Usage:
    python3 scripts/publish_sizes.py            # write data/sizes.json
    python3 scripts/publish_sizes.py --check    # structural gate over the
                                                # committed file (offline)
Self-test (no network, synthetic sources):
    python3 scripts/test_publish_sizes.py
"""

import json
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = SITE_ROOT / "data" / "sizes.json"
MEAS_PATH = SITE_ROOT / "data" / "sizes.measurements.json"

GITHUB_API = "https://api.github.com/repos/gist-rs/reflex/releases/latest"
HF_API = "https://huggingface.co/api/models/{repo}?blobs=true"
UA = "reflex-site-publish-sizes/1.0"

# The candidate list is EDITORIAL (which lanes the page compares — the same
# lanes the bench/arena pages carry); every NUMBER under each candidate
# comes from a LIVE or RECORDED source, never from this table.
CANDIDATES = [
    {
        "key": "wasm_heads",
        "name": "reflex · in-browser (wasm heads)",
        "framework": "Rust → wasm32 (wasm-opt -Oz), zero deps",
        "engine": ("local", "assets/arena_head.wasm"),
        "engine_what": "arena_head.wasm — the engine's fitted game heads as one module",
        "model": None,
        "model_what": "none — the fitted heads are compiled into the module",
        "targets": ["browser tab", "edge worker (1 MB class)"],
        "note": "plays Tetris / Flappy / three-lanes in-tab with no engine install — parity-proven against the recorded engine play before it moves a piece",
    },
    {
        "key": "reflex_native",
        "name": "reflex · native binary (modelless)",
        "framework": "one static Rust binary (dist profile, stripped, fat LTO)",
        "engine": ("release_installed",),
        "engine_what": "installed binary + THIRD_PARTY_LICENSES.md (unpacked from the aarch64-apple-darwin archive)",
        "model": None,
        "model_what": "none — the corpus ships inside the binary; the game heads boot-fit from embedded fixtures",
        "targets": ["macOS", "Linux (musl, static)", "Windows", "container"],
        "note": None,  # archive range appended at generate time (it is a LIVE fact)
    },
    {
        "key": "reflex_laya_typed",
        "name": "reflex + laya · typed",
        "framework": "the same reflex binary + the laya-riir lane (runtime download)",
        "engine": ("release_installed",),
        "engine_what": "the same installed binary",
        "model": ("hf_subtree", "convaiinnovations/laya", "typed-decisions/"),
        "model_what": "the typed-decisions specialist checkpoint (SHA-256-pinned, downloaded at first boot)",
        "targets": ["macOS (Metal)", "Linux", "Windows (CUDA)", "container"],
        "note": None,  # english/multilingual sizes appended at generate time (LIVE facts)
    },
    {
        "key": "laya_python",
        "name": "laya · python reference",
        "framework": "CPython + torch (MPS build) + transformers + the pinned reference checkout",
        "engine": ("recorded", "laya_python_runtime"),
        "engine_what": "the oracle's python import closure + the pinned .raw/laya checkout",
        "model": ("hf_subtree", "convaiinnovations/laya", "typed-decisions/"),
        "model_what": "the same typed checkpoint, loaded by the original reference",
        "targets": ["python env", "GPU (MPS/CUDA)"],
        "note": "measurement-only lane — the reference is never shipped; footprint measured on the bench host that runs it",
    },
    {
        "key": "gliner",
        "name": "GLiNER2.5-Decide",
        "framework": "their gliner2 package in a torch-cu venv",
        "engine": ("recorded", "gliner_venv"),
        "engine_what": "the gliner2 venv (torch-cu + transformers + peft + accelerate)",
        "model": ("hf_total", "fastino/GLiNER2.5-Decide"),
        "model_what": "their model + tokenizer tree (HF, exact bytes)",
        "targets": ["python env", "GPU (CUDA)"],
        "note": None,
    },
    {
        "key": "agentjev",
        "name": "AgentJev-0.6B",
        "framework": "their jev_service in a torch venv",
        "engine": ("recorded", "agentjev_venv"),
        "engine_what": "their service venv (torch-cu + deps)",
        "model": ("hf_total", "aimeigaoshou/agent-jev", "Qwen/Qwen3-0.6B"),
        "model_what": "their agent-jev tensors + the Qwen3-0.6B backbone their service loads at boot",
        "targets": ["python env", "GPU (CUDA)"],
        "note": "their boot loads BOTH the agent-jev checkpoint and the Qwen3-0.6B base from the HF cache — both counted",
    },
    {
        "key": "clm",
        "name": "CLM v0.1-8B",
        "framework": "vLLM docker image + their clm-serve head",
        "engine": ("recorded_sum", "clm_docker", "clm_repo"),
        "engine_what": "the vLLM serving image + their CLM repo/head checkout",
        "model": ("hf_total", "Qwen/Qwen3-8B", "Contrastive-LM/CLM-v0.1-8B"),
        "model_what": "the Qwen3-8B encoder weights + the trained head (CLM_v0.1-8B.pt)",
        "targets": ["docker container", "GPU (CUDA)"],
        "note": None,
    },
]


def die(msg: str) -> None:
    print(f"publish_sizes: {msg}", file=sys.stderr)
    raise SystemExit(1)


def http_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


# ── LIVE sources ─────────────────────────────────────────────────────────

def fetch_release() -> dict:
    """The latest gist-rs/reflex release: per-target archive bytes + the
    UNPACKED installed footprint of the reference target (darwin-arm64)."""
    try:
        rel = http_json(GITHUB_API)
    except Exception as e:  # noqa: BLE001 — refuse loudly on any failure
        die(f"GitHub API unreachable ({e}) — the release half of the report must not render from cache")
    assets = {a["name"]: a["size"] for a in rel.get("assets", []) if a["name"] != "SHA256SUMS"}
    if len(assets) < 5:
        die(f"release {rel.get('tag_name', '?')} carries {len(assets)} archives (expected 5)")
    ref_name = next((n for n in assets if "aarch64-apple-darwin" in n), None)
    if not ref_name:
        die("no aarch64-apple-darwin archive in the latest release")
    ref_asset = next(a for a in rel["assets"] if a["name"] == ref_name)
    installed = 0
    installed_files = []
    with tempfile.TemporaryDirectory(prefix="reflex-sizes-") as td:
        tgz = Path(td) / "reflex.tar.gz"
        req = urllib.request.Request(ref_asset["browser_download_url"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=120) as r, open(tgz, "wb") as f:
            f.write(r.read())
        import tarfile
        with tarfile.open(tgz, "r:gz") as tf:
            tf.extractall(td)  # noqa: S202 — trusted release artifact, tmpdir-scoped
            for m in tf.getmembers():
                if m.isfile():
                    installed += m.size
                    installed_files.append((m.size, m.name))
    if installed <= 0 or not installed_files:
        die("unpacking the reference archive produced no files")
    return {
        "tag": rel["tag_name"],
        "url": rel["html_url"],
        "archives": assets,
        "installed_bytes": installed,
        "installed_files": installed_files,
    }


def fetch_hf(repo: str) -> dict:
    try:
        return http_json(HF_API.format(repo=repo))
    except Exception as e:  # noqa: BLE001
        die(f"HF API unreachable for {repo} ({e}) — the model half of the report must not render from cache")


def hf_tree_bytes(repo: str, prefix: str | None = None, filename: str | None = None) -> int:
    """Sum a repo's file tree: a subtree by path prefix, one named file, or
    the whole repo. `.gitattributes` and lock files are hub chrome, not
    model payload — excluded from subtree/file sums, included nowhere."""
    sib = fetch_hf(repo).get("siblings", [])
    total = 0
    for s in sib:
        name, size = s.get("rfilename", ""), s.get("size") or 0
        if name in (".gitattributes",):
            continue
        if filename is not None:
            if name == filename:
                total += size
        elif prefix is not None:
            if prefix == "" or name.startswith(prefix):
                total += size
        else:
            total += size
    if total <= 0:
        die(f"{repo} (prefix={prefix!r}, file={filename!r}) summed to {total} — refusing to publish an empty tree")
    return total


def local_bytes(rel: str) -> int:
    p = SITE_ROOT / rel
    if not p.is_file():
        die(f"local file missing: {rel}")
    return p.stat().st_size


# ── merge ────────────────────────────────────────────────────────────────

def build(release: dict, recorded: dict) -> dict:
    """Pure merge: candidates × sources → the published rows. Self-test
    drives this against synthetic inputs."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    for spec in CANDIDATES:
        engine_prov, engine_bytes = None, 0
        kind = spec["engine"][0]
        if kind == "local":
            engine_bytes = local_bytes(spec["engine"][1])
            engine_prov = {"source": "local file", "detail": spec["engine"][1]}
        elif kind == "release_installed":
            engine_bytes = release["installed_bytes"]
            engine_prov = {"source": "measured: unpacked release archive",
                           "detail": f"{release['tag']} aarch64-apple-darwin, downloaded + stat'd at publish time"}
        elif kind == "recorded":
            m = recorded.get(spec["engine"][1])
            if m is None:
                die(f"recorded measurement {spec['engine'][1]!r} (engine of {spec['key']}) missing from sizes.measurements.json")
            engine_bytes, engine_prov = m["bytes"], {
                "source": "recorded measurement",
                "detail": f"{m['what']} — measured {m['date_utc']} on {m['host']}: {m['how']}"}
        elif kind == "recorded_sum":
            missing_keys = [k for k in spec["engine"][1:] if k not in recorded]
            if missing_keys:
                die(f"recorded measurements missing for {spec['key']}: {missing_keys}")
            parts = [recorded[k] for k in spec["engine"][1:]]
            engine_bytes = sum(p["bytes"] for p in parts)
            engine_prov = {"source": "recorded measurement (sum)",
                           "detail": " + ".join(f"{p['bytes']:,} B ({p['what']}, {p['date_utc']} on {p['host']})" for p in parts)}
        else:
            die(f"unknown engine source kind {kind!r}")

        model_bytes, model_prov = 0, None
        if spec["model"] is not None:
            mk = spec["model"][0]
            if mk == "hf_subtree":
                _, repo, prefix = spec["model"]
                model_bytes = hf_tree_bytes(repo, prefix=prefix)
                model_prov = {"source": "huggingface.co tree API (exact bytes)",
                              "detail": f"{repo} · {prefix or '(repo root)'} subtree sum"}
            elif mk == "hf_total":
                repos = spec["model"][1:]
                model_bytes = sum(hf_tree_bytes(r) for r in repos)
                model_prov = {"source": "huggingface.co tree API (exact bytes)",
                              "detail": " + ".join(repos)}
            else:
                die(f"unknown model source kind {mk!r}")

        note = spec.get("note")
        if spec["key"] == "reflex_native":
            a = sorted(release["archives"].values())
            note = f"archive download {a[0] / 1e6:.2f}–{a[-1] / 1e6:.2f} MB across all {len(a)} release targets — the same binary serves every lane"
        if spec["key"] == "reflex_laya_typed":
            en = hf_tree_bytes("convaiinnovations/laya", prefix="") - hf_tree_bytes("convaiinnovations/laya", prefix="multilingual/") - hf_tree_bytes("convaiinnovations/laya", prefix="typed-decisions/")
            ml = hf_tree_bytes("convaiinnovations/laya", prefix="multilingual/")
            note = f"the english base is the same size class ({en / 1e6:.0f} MB); multilingual {ml / 1e6:.0f} MB; all three checkpoints ≈ {(en + ml + model_bytes) / 1e9:.2f} GB"

        rows.append({
            "key": spec["key"],
            "name": spec["name"],
            "framework": spec["framework"],
            "engine_bytes": engine_bytes,
            "engine_what": spec["engine_what"],
            "engine_provenance": engine_prov,
            "model_bytes": model_bytes,
            "model_what": spec["model_what"],
            "model_provenance": model_prov,
            "targets": spec["targets"],
            "note": note,
        })

    # the render law: smallest total first — enforced at the source, and the
    # smoke re-asserts it on the rendered page
    rows.sort(key=lambda r: r["engine_bytes"] + r["model_bytes"])

    archives = release["archives"]
    return {
        "meta": {
            "date_utc": now,
            "release": {"tag": release["tag"], "url": release["url"], "archives": archives},
            "law": "every byte count is measured (release archive unpack, HF tree API, local stat) or a recorded on-host measurement with provenance — never hand-typed",
            "order": "ascending total (engine + model)",
        },
        "candidates": rows,
    }


def main(argv: list[str]) -> None:
    if "--check" in argv:
        check_committed()
        return
    if not MEAS_PATH.is_file():
        die(f"missing {MEAS_PATH.name} — the recorded half of the report")
    recorded = {m["key"]: m for m in json.loads(MEAS_PATH.read_text())["measurements"]}
    missing = [c["key"] for c in CANDIDATES
               for k in ([c["engine"][1:]] if c["engine"][0].startswith("recorded") else [])
               if k and all(x not in recorded for x in k)]
    if missing:
        die(f"recorded measurements missing for: {missing}")
    release = fetch_release()
    doc = build(release, recorded)
    OUT_PATH.write_text(json.dumps(doc, indent=1) + "\n")
    tot = [(r["name"], r["engine_bytes"] + r["model_bytes"]) for r in doc["candidates"]]
    print(f"wrote data/sizes.json — {len(tot)} candidates, release {doc['meta']['release']['tag']}:")
    for n, b in tot:
        print(f"  {b:>14,} B  {n}")


def check_committed() -> None:
    """The offline structural gate: the committed file must parse, carry
    every candidate, be sorted ascending, and never hold a non-positive
    engine size. Run by publish_sizes.sh before any deploy."""
    if not OUT_PATH.is_file():
        die("data/sizes.json missing — run publish_sizes.py first")
    d = json.loads(OUT_PATH.read_text())
    keys = {c["key"] for c in d["candidates"]}
    want = {c["key"] for c in CANDIDATES}
    if keys != want:
        die(f"candidate set drifted: missing {want - keys}, extra {keys - want}")
    totals = [c["engine_bytes"] + c["model_bytes"] for c in d["candidates"]]
    if totals != sorted(totals):
        die("candidates not sorted ascending by total")
    for c in d["candidates"]:
        for f in ("name", "framework", "engine_what", "model_what", "targets", "engine_provenance"):
            if not c.get(f):
                die(f"{c['key']}: empty {f}")
        if c["engine_bytes"] <= 0:
            die(f"{c['key']}: non-positive engine_bytes")
        if c["model_bytes"] < 0:
            die(f"{c['key']}: negative model_bytes")
    print(f"sizes --check PASS ({len(totals)} candidates, ascending, all fields present)")


if __name__ == "__main__":
    main(sys.argv[1:])

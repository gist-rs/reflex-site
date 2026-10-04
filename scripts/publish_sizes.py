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
    import closure), each with host + command provenance. A record may
    carry a `files` array — the same measurement's per-file values,
    structured — which `recorded_files` turns into the row's `model_stack`
    (the sub-bar + tooltip-bullet split), and which an engine record (the
    dataset suites) turns into `engine_stack` parts; the split sum is
    asserted against the record total, so a drifted files list refuses
    loudly. Both stacks feed the per-row breakdown chart; each leaf's `src`
    indexes its side's provenance `parts` (the structured source list).

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

# Console-safe streams (the console_encoding discipline): this script prints
# non-ASCII glyphs and must not die with NO verdict on a cp874-class console.
# Backslashreplace keeps every byte of the message readable.
for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

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
        "name": "Reflex · in-browser (wasm heads)",
        "framework": "Rust → wasm32 (wasm-opt -Oz), zero deps",
        "engine_kind": "rust",
        "engine": ("local", "assets/arena_head.wasm"),
        "engine_what": "arena_head.wasm — the engine's fitted game heads as one module",
        "model": None,
        "model_what": "none — the fitted heads are compiled into the module",
        "targets": ["browser tab", "edge worker (1 MB class)"],
        "note": "plays Tetris / Flappy / three-lanes in-tab with no engine install — parity-proven against the recorded engine play before it moves a piece",
    },
    {
        "key": "reflex_native",
        "name": "Reflex · native binary (modelless)",
        "framework": "one static Rust binary (dist profile, stripped, fat LTO)",
        "engine_kind": "rust",
        "engine": ("release_installed",),
        "engine_what": "installed binary + THIRD_PARTY_LICENSES.md (unpacked from the aarch64-apple-darwin archive)",
        "model": None,
        "model_what": "none — the corpus ships inside the binary; the game heads boot-fit from embedded fixtures",
        "targets": ["macOS", "Linux (musl, static)", "Windows", "container"],
        "note": None,  # archive range appended at generate time (it is a LIVE fact)
    },
    {
        "key": "reflex_laya_typed",
        "name": "Reflex + laya · typed",
        "framework": "the same reflex binary + the laya-riir lane (runtime download)",
        "engine_kind": "rust",
        "engine": ("release_installed",),
        "engine_what": "the same installed binary",
        "model": ("hf_subtree", "convaiinnovations/laya", "typed-decisions/",
                   {"label": "typed-decisions checkpoint"}),
        "model_what": "the typed-decisions specialist checkpoint (SHA-256-pinned, downloaded at first boot)",
        "targets": ["macOS (Metal)", "Linux", "Windows (CUDA)", "container"],
        "note": None,  # english/multilingual sizes appended at generate time (LIVE facts)
    },
    {
        "key": "instinct_hybrid",
        "name": "Instinct · trained specialists",
        "framework": "one serve binary + the Reflex half's dataset seats + BLAKE3-pinned specialist files (the hosted serving posture)",
        "engine_kind": "rust",
        "engine": ("recorded_sum", "instinct_serve_binary", "instinct_datasets_t20k"),
        "engine_what": "the serve binary + the six t20k dataset suites (the Reflex half's corpora and question seats)",
        # recorded_files: the model stack splits into the record's own per-file
        # lstat values (sizes.measurements.json files:) — one sub-bar segment
        # per trained specialist, each pinned by the same BLAKE3 manifest.
        "model": ("recorded_files", "instinct_winner_vessels", {"kind": "specialist"}),
        "model_what": "the six winner files (each pinned by a BLAKE3 digest in the manifest, checked at load — the signed HOSTED-ONLY vessel is not yet the serving path)",
        "targets": ["container (cf-container)", "hosted serving"],
        "note": "the trained sibling lane: the specialists serve six text suites; game spots answer through its Reflex half. The three-product naming is Reflex / Instinct / Rethink — Instinct is the open teaching lane (052); Rethink is the private moat",
    },
    {
        "key": "rethink_encoder",
        "name": "Rethink · encoder arm",
        "framework": "one serve binary (GPU host) + the laya-riir encoder resident from boot + the Reflex half's dataset seats",
        "engine_kind": "rust",
        "engine": ("recorded_sum", "rethink_serve_binary", "instinct_datasets_t20k"),
        "engine_what": "the serve binary (the encoder lane's GPU-host build) + the six t20k dataset suites (the seats the ENC lanes boot from)",
        "model": ("sum",
                  ("recorded", "laya_english_q8_artifact",
                   {"label": "laya-english encoder · Q8_0", "kind": "encoder"}),
                  ("recorded_files", "rethink_encoder_heads", {"kind": "head"})),
        "model_what": "the laya-english checkpoint as the derived Q8_0 artifact (the adopted encoding — LAYA_WEIGHTS_VARIANT=q8; 53.1% of the F16 file) + the three locked NLEH heads (sst5 · xnli_en · ag_news v1)",
        "targets": ["GPU host (Metal/CUDA)", "record-only today"],
        "note": "the adopted q8 serving posture (riir-infer plan 616 Phases 1–2): 348.8 MiB device-resident q8 weights vs 1,654.9 MiB at the widened-F32 posture (4.74×) and 1,492 MiB whole-process RSS vs 4,825 MiB at the F16 host-widen posture — measured 2026-10-02 on m3-max-metal (AC). the lane is record-only today (GPU-host targets: the encoder class is refused at the CPU-only deploy shape, so nothing ships until a GPU serving deploy exists) — the serving lane loads the english checkpoint only; the typed cell is record-only (its v2 head is paired to the typed checkpoint through the arena's measurement lane, so that checkpoint + the typed full-pool corpus are recorded separately, not part of this posture) and serves only after a head retrained over english encodes or a typed serve lane; pre-adoption reference: the F16 english checkpoint tree was 848,195,504 B on HF — the row's model bytes before the q8 adoption",
    },
    {
        "key": "laya_python",
        "name": "laya · python reference",
        "framework": "CPython + torch (MPS build) + transformers + the pinned reference checkout",
        "engine_kind": "python",
        "engine": ("recorded", "laya_python_runtime"),
        "engine_what": "the oracle's python import closure + the pinned .raw/laya checkout",
        "model": ("hf_subtree", "convaiinnovations/laya", "typed-decisions/",
                  {"label": "typed-decisions checkpoint"}),
        "model_what": "the same typed checkpoint, loaded by the original reference",
        "targets": ["python env", "GPU (MPS/CUDA)"],
        "note": "measurement-only lane — the reference is never shipped; footprint measured on the bench host that runs it",
    },
    {
        "key": "gliner",
        "name": "GLiNER2.5-Decide",
        "framework": "their gliner2 package in a torch-cu venv",
        "engine_kind": "python",
        "engine": ("recorded", "gliner_venv"),
        "engine_what": "the gliner2 venv (torch-cu + transformers + peft + accelerate)",
        "model": ("hf_total", "fastino/GLiNER2.5-Decide",
                  {"label": "model + tokenizer tree"}),
        "model_what": "their model + tokenizer tree (HF, exact bytes)",
        "targets": ["python env", "GPU (CUDA)"],
        "note": None,
    },
    {
        "key": "agentjev",
        "name": "AgentJev-0.6B",
        "framework": "their jev_service in a torch venv",
        "engine_kind": "python",
        "engine": ("recorded", "agentjev_venv"),
        "engine_what": "their service venv (torch-cu + deps)",
        "model": ("hf_total", "aimeigaoshou/agent-jev", "Qwen/Qwen3-0.6B",
                  {"label": "agent-jev + Qwen3-0.6B"}),
        "model_what": "their agent-jev tensors + the Qwen3-0.6B backbone their service loads at boot",
        "targets": ["python env", "GPU (CUDA)"],
        "note": "their boot loads BOTH the agent-jev checkpoint and the Qwen3-0.6B base from the HF cache — both counted",
    },
    {
        "key": "openthai",
        "name": "OpenThai-SystemOne",
        "framework": "their FastAPI service in a torch venv (the Thai/English decision comparison lane)",
        "engine_kind": "python",
        "engine": ("recorded", "openthai_venv"),
        "engine_what": "their service venv (torch + transformers + fastapi/uvicorn + their openthai_systemone package)",
        "model": ("hf_total", "iapp/OpenThai-SystemOne",
                  {"label": "Qwen3.5-0.8B + decision head"}),
        "model_what": "their model tree (Qwen3.5-0.8B text tower + the 256-slot decision head, safetensors + tokenizer)",
        "targets": ["python env", "GPU (MPS/CUDA)"],
        "note": "the bench board's Thai-capability lane (Apache-2.0) — served on loopback, measured by our harness",
    },
    {
        "key": "bekko",
        "name": "Bekko-SystemOne-v0 (400M)",
        "framework": "their BekkoSentenceTransformer runtime in a torch venv",
        "engine_kind": "python",
        "engine": ("recorded", "bekko_venv"),
        "engine_what": "the bekko lane venv (python 3.12: torch + transformers + sentence-transformers — the card's runtime pins)",
        "model": ("hf_total", "hotchpotch/bekko-system-one-v0-400m",
                  {"label": "bekko-400m model tree"}),
        "model_what": "their 400M model tree (fp32 safetensors + tokenizer + the browser ONNX export, the card's pinned release revision 4aeb85b) — the tree a consumer downloads incl. onnx_browser/",
        "targets": ["python env", "CPU (FP32 reference posture)"],
        "note": "the bench board's bekko comparison lane — the seat moved 68M→400M (reflex Bench 107, Plan 617 A6: the 400M beats the 68M on all 9 suites); MIT (verified 2026-10-02); subprocess oracle on loopback, measured by our harness",
    },
    {
        "key": "bekko68m",
        "name": "Bekko-SystemOne-v0 (68M)",
        "framework": "their BekkoSentenceTransformer runtime in a torch venv (same venv as the 400M row — the two sizes share one engine)",
        "engine_kind": "python",
        "engine": ("recorded", "bekko_venv"),
        "engine_what": "the bekko lane venv (python 3.12: torch + transformers + sentence-transformers — the card's runtime pins)",
        "model": ("hf_total", "hotchpotch/bekko-system-one-v0-68m",
                  {"label": "bekko-68m model tree"}),
        "model_what": "their 68M model tree (fp32 safetensors + tokenizer + the browser ONNX export, the card's pinned release revision 6eb1bae2) — the tree a consumer downloads incl. onnx_browser/",
        "targets": ["python env", "CPU (FP32 reference posture)"],
        "note": "the lane's PRIOR seat (reflex Bench 103/104 era), superseded by the 400M on the board (Bench 107) — kept because it stays reachable: reflex pins resolve BEKKO_MODEL=bekko-system-one-v0-68m to it by name; the 68M-teacher distill record (riir-train Issue 608) reproduces against it; MIT (verified 2026-10-02)",
    },
    {
        "key": "clef",
        "name": "clef-flash (9B) \u00b7 local 4-bit",
        "framework": "the community MLX port (clef_mlx.py) in an mlx venv, behind a loopback HTTP shim",
        "engine_kind": "python",
        "engine": ("recorded", "clef_venv"),
        "engine_what": "the clef-flash (9B) lane venv (python 3.12: mlx + mlx-lm + mlx-vlm \u2014 the MLX port's tested pins)",
        "model": ("hf_total", "mlx-community/clef-flash-4bit",
                  {"label": "clef-flash (9B) 4-bit tree"}),
        "model_what": "their Clef-flash (9B) decision model as the community 4-bit MLX quant (two safetensors shards + the joint decision head + tokenizer) \u2014 the tree a consumer downloads",
        "targets": ["python env", "Apple GPU (MLX)"],
        "note": "the bench board's clef-flash (9B) local comparison lane (Cloudflare/clef-flash, Apache-2.0, not affiliated; their larger Clef (27B) is not measured) \u2014 the LOCAL posture the board measures; the hosted Workers-AI posture is owner-gated and never pooled with it",
    },
    {
        "key": "clm",
        "name": "CLM v0.1-8B",
        "framework": "vLLM docker image + their clm-serve head",
        "engine_kind": "python",  # vLLM is a Python serving stack — the image is a python env
        "engine": ("recorded_sum", "clm_docker", "clm_repo"),
        "engine_what": "the vLLM serving image + their CLM repo/head checkout",
        "model": ("hf_total", "Qwen/Qwen3-8B", "Contrastive-LM/CLM-v0.1-8B",
                  {"label": "Qwen3-8B + CLM head"}),
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


# ── source resolution (engine + model) ───────────────────────────────────

# A stack LEAF: the shape the size chart splits a side into — one bar in
# the row's breakdown chart, one sub-segment / tooltip bullet on the model
# side of the main bar. `src` indexes the side's provenance `parts` (the
# structured source list the breakdown's "how measured" list renders), so
# every leaf names the measurement it came from.
def _leaf(label: str, kind: str, bytes_: int, src: int = 0) -> dict:
    return {"label": label, "kind": kind, "bytes": bytes_, "src": src}


def _opts(spec: tuple) -> tuple[tuple, dict]:
    """A leaf spec may end with an optional {label, kind} override dict —
    everything before it is the source tuple proper."""
    if spec and isinstance(spec[-1], dict):
        return spec[:-1], spec[-1]
    return spec, {}


# A structured SOURCE: one measurement, as the breakdown's source list
# reads it — the same facts the flat `detail` string carries, unjoined.
def _live_src(source: str, what: str) -> dict:
    return {"source": source, "what": what}


def _rec_src(m: dict) -> dict:
    return {"source": "recorded measurement", "label": m.get("label") or m["key"],
            "what": m["what"], "date_utc": m["date_utc"], "host": m["host"], "how": m["how"]}


def _rec_detail(m: dict) -> str:
    return f"{m['what']} — measured {m['date_utc']} on {m['host']}: {m['how']}"


def _record(recorded: dict, key: str, side: str) -> dict:
    m = recorded.get(key)
    if m is None:
        die(f"recorded measurement {key!r} ({side}) missing from sizes.measurements.json")
    return m


def _record_leaves(m: dict, opts: dict, default_label: str, default_kind: str,
                   src: int, split: bool) -> list:
    """One record → its stack leaves. With `split` and a `files` array, one
    leaf per file — the record's own per-file values, sum ASSERTED against
    the record total (a drifted files list refuses loudly, never renders as
    a confident split). Otherwise one leaf for the whole record."""
    kind = opts.get("kind") or m.get("kind") or default_kind
    files = m.get("files")
    if split and isinstance(files, list) and files:
        stack = [_leaf(str(f.get("label", "component")), f.get("kind", kind),
                       int(f["bytes"]), src) for f in files]
        s = sum(f["bytes"] for f in stack)
        if s != m["bytes"]:
            die(f"recorded measurement {m['key']!r}: files sum to {s:,} but the "
                f"record says {m['bytes']:,} — refusing a drifted split")
        return stack
    return [_leaf(opts.get("label") or m.get("label") or default_label, kind, m["bytes"], src)]


def resolve_model(spec: tuple, recorded: dict) -> tuple[int, dict, list]:
    """One model spec tuple → (bytes, provenance, stack). The stack is the
    model's COMPONENT list in composition order — one leaf per measured
    part — which the chart renders as sub-bar segments and tooltip bullets.
    `sum` composes child specs (any kinds, recursively) so one row can
    carry a LIVE HF tree AND a RECORDED artifact side by side — the Rethink
    lane's checkpoints plus its locked heads. The provenance carries the
    flat `detail` string AND the structured `parts` list the leaves index.

    Conservative contract: only recorded leaves split into per-file
    components (via `recorded_files`, backed by the record's own `files`
    array — the same lstat values, structured). Every other shape is ONE
    leaf, so a committed row and its generator output can never disagree
    about granularity."""
    src, opts = _opts(spec)
    mk = src[0]
    label, kind = opts.get("label", "model / weights"), opts.get("kind", "weights")
    if mk in ("hf_subtree", "hf_subtree_diff", "hf_total"):
        if mk == "hf_subtree":
            _, repo, prefix = src
            total = hf_tree_bytes(repo, prefix=prefix)
            detail = f"{repo} · {prefix or '(repo root)'} subtree sum"
        elif mk == "hf_subtree_diff":
            _, repo, excludes = src
            total = hf_tree_bytes(repo) - sum(hf_tree_bytes(repo, prefix=p) for p in excludes)
            if total <= 0:
                die(f"{repo} whole-minus-{excludes} summed to {total} — refusing to publish an empty tree")
            detail = f"{repo} · whole tree minus {' + '.join(excludes)} (the root-level english checkpoint)"
        else:
            total = sum(hf_tree_bytes(r) for r in src[1:])
            detail = " + ".join(src[1:])
        source = "huggingface.co tree API (exact bytes)"
        return total, {"source": source, "detail": detail,
                       "parts": [_live_src(source, detail)]}, [_leaf(label, kind, total)]
    if mk in ("recorded", "recorded_files"):
        m = _record(recorded, src[1], "model")
        if mk == "recorded_files" and not (isinstance(m.get("files"), list) and m["files"]):
            die(f"recorded measurement {src[1]!r} carries no files array — "
                f"recorded_files needs the record's per-file values")
        stack = _record_leaves(m, opts, "model / weights", "weights", 0, mk == "recorded_files")
        return m["bytes"], {"source": "recorded measurement", "detail": _rec_detail(m),
                            "parts": [_rec_src(m)]}, stack
    if mk == "recorded_sum":
        missing_keys = [k for k in src[1:] if k not in recorded]
        if missing_keys:
            die(f"recorded measurements missing for model: {missing_keys}")
        parts = [recorded[k] for k in src[1:]]
        return (sum(p["bytes"] for p in parts), {
            "source": "recorded measurement (sum)",
            "detail": " + ".join(f"{p['bytes']:,} B ({p['what']}, {p['date_utc']} on {p['host']})" for p in parts),
            "parts": [_rec_src(p) for p in parts]},
            [lf for i, p in enumerate(parts) for lf in _record_leaves(p, {}, p["key"], kind, i, False)])
    if mk == "sum":
        kids = [resolve_model(child, recorded) for child in src[1:]]
        total = sum(b for b, _, _ in kids)
        parts, stack = [], []
        for _, prov, st in kids:
            stack += [{**lf, "src": lf["src"] + len(parts)} for lf in st]
            parts += prov["parts"]
        return total, {
            "source": "sum of measured sources",
            "detail": " + ".join(f"{b:,} B ({p['source']}: {p['detail']})" for b, p, _ in kids),
            "parts": parts}, stack
    die(f"unknown model source kind {mk!r}")


def resolve_engine(spec: tuple, release: dict, recorded: dict, row: str) -> tuple[int, dict, list]:
    """One engine spec tuple → (bytes, provenance, stack) — the runtime
    side's breakdown, same leaf + `parts` contract as resolve_model. A
    recorded record with a `files` array (the dataset suites) splits per
    file; the unpacked release splits into its archive members."""
    src, opts = _opts(spec)
    kind = src[0]
    if kind == "local":
        total = local_bytes(src[1])
        return total, {"source": "local file", "detail": src[1],
                       "parts": [_live_src("local file", src[1])]}, [
            _leaf(opts.get("label", Path(src[1]).name), opts.get("kind", "module"), total)]
    if kind == "release_installed":
        detail = f"{release['tag']} aarch64-apple-darwin, downloaded + stat'd at publish time"
        source = "measured: unpacked release archive"
        # the binary (the largest member) as its own bar; the rest — license
        # texts + the archive's metadata entries — as one, so a 163-byte
        # `._reflex` never earns a bar of its own
        files = sorted(release.get("installed_files") or [(release["installed_bytes"], "reflex")],
                       key=lambda f: -f[0])
        stack = [_leaf(Path(files[0][1]).name + " binary", "binary", files[0][0])]
        if len(files) > 1:
            stack.append(_leaf(f"licenses + archive metadata ({len(files) - 1} file{'s' if len(files) > 2 else ''})", "license",
                               sum(b for b, _ in files[1:])))
        if sum(f["bytes"] for f in stack) != release["installed_bytes"]:
            die("release installed_files do not sum to installed_bytes — refusing a drifted split")
        return release["installed_bytes"], {"source": source, "detail": detail,
                                            "parts": [_live_src(source, detail)]}, stack
    if kind == "recorded":
        m = _record(recorded, src[1], f"engine of {row}")
        return m["bytes"], {"source": "recorded measurement", "detail": _rec_detail(m),
                            "parts": [_rec_src(m)]}, _record_leaves(m, opts, "runtime env", "runtime", 0, True)
    if kind == "recorded_sum":
        missing_keys = [k for k in src[1:] if k not in recorded]
        if missing_keys:
            die(f"recorded measurements missing for {row}: {missing_keys}")
        parts = [recorded[k] for k in src[1:]]
        return sum(p["bytes"] for p in parts), {
            "source": "recorded measurement (sum)",
            "detail": " + ".join(f"{p['bytes']:,} B ({p['what']}, {p['date_utc']} on {p['host']})" for p in parts),
            "parts": [_rec_src(p) for p in parts]}, [
            lf for i, p in enumerate(parts) for lf in _record_leaves(p, {}, p["key"], "runtime", i, True)]
    die(f"unknown engine source kind {kind!r}")


# ── merge ────────────────────────────────────────────────────────────────

def build(release: dict, recorded: dict) -> dict:
    """Pure merge: candidates × sources → the published rows. Self-test
    drives this against synthetic inputs."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    for spec in CANDIDATES:
        engine_bytes, engine_prov, engine_stack = resolve_engine(spec["engine"], release, recorded, spec["key"])

        model_bytes, model_prov, model_stack = 0, None, []
        if spec["model"] is not None:
            model_bytes, model_prov, model_stack = resolve_model(spec["model"], recorded)

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
            "engine_kind": spec["engine_kind"],
            "engine_bytes": engine_bytes,
            "engine_what": spec["engine_what"],
            "engine_provenance": engine_prov,
            # the runtime side's breakdown (the row's breakdown chart) —
            # same leaf contract as model_stack, sums to engine_bytes
            "engine_stack": engine_stack,
            "model_bytes": model_bytes,
            "model_what": spec["model_what"],
            "model_provenance": model_prov,
            # the model's component split (the sub-bar + tooltip bullets);
            # every row with weights carries one — a lone leaf names itself
            # (stack_label), a split sums to model_bytes by construction
            **({"model_stack": model_stack} if model_bytes > 0 else {}),
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
    recorded = {m["key"]: m for m in json.loads(MEAS_PATH.read_text(encoding="utf-8"))["measurements"]}
    missing = [c["key"] for c in CANDIDATES
               for k in ([c["engine"][1:]] if c["engine"][0].startswith("recorded") else [])
                     + ([c["model"][1:]] if c["model"] and c["model"][0].startswith("recorded") else [])
               if k and all(x not in recorded for x in k)]
    if missing:
        die(f"recorded measurements missing for: {missing}")
    release = fetch_release()
    doc = build(release, recorded)
    OUT_PATH.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
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
    d = json.loads(OUT_PATH.read_text(encoding="utf-8"))
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
        if c.get("engine_kind") not in ("rust", "python"):
            die(f"{c['key']}: engine_kind must be 'rust' or 'python', got {c.get('engine_kind')!r}")
        # the breakdown contract: each side's stack sums to its bytes and
        # every leaf points at a source its provenance actually lists
        for side in ("engine", "model"):
            st, prov = c.get(f"{side}_stack") or [], c.get(f"{side}_provenance")
            if c[f"{side}_bytes"] > 0:
                if sum(f["bytes"] for f in st) != c[f"{side}_bytes"]:
                    die(f"{c['key']}: {side}_stack does not sum to {side}_bytes")
                n = len((prov or {}).get("parts") or [])
                if any(not (0 <= f.get("src", -1) < n) for f in st):
                    die(f"{c['key']}: a {side}_stack leaf points at no listed source")
    print(f"sizes --check PASS ({len(totals)} candidates, ascending, all fields present, stacks sum + cite their sources)")


if __name__ == "__main__":
    main(sys.argv[1:])

# BOUNDARY.md — reflex-site (public)

Visibility: public

The authoritative per-repo contract. On any conflict with README.md or
issues, this file wins.

## Domain test

Is this the **public arena site** — static pages, charts, the published
`data/bench.json`, the browser-live wasm head, and mirrors of engine bytes
built elsewhere? YES → here. NO → another repo; file there.

## Owns

- The static site served at `reflex.gist.rs` (Cloudflare Workers static
  assets, `wrangler.toml`): `index.html`, `bench/`, `arena/`, `playground/`,
  `skills/`, `assets/`.
- The publishers that turn harness output into site data:
  `scripts/publish_bench.py`, `scripts/publish_sizes.py`,
  `scripts/republish_bench.sh` — plus their self-tests and the cross-host
  drift gate.
- `wasm-head/` — a zero-dependency, own-workspace Rust port of the fitted
  Tetris game-head recipe, built to `assets/arena_head.wasm`.
- The site's smoke/parity checks (`scripts/*_smoke.*`, `*_parity.mjs`,
  `tests/`).
- Display naming: the brand is **Reflex**; lanes are *Reflex · modelless*
  (riir-reflex) and *Reflex · rulebook* (riir-reflexer); KatGPT is credited
  once, in the footer, as the substrate — never a lane name.

## Does not own

| Concern | Correct home |
|---|---|
| The modelless engine, heads, corpus recipe, bench harness and its measurements | riir-reflex — fed here via `publish_bench.py` and `scripts/sync_mirror.py` |
| The rulebook engine and its wasm build | riir-reflexer — `assets/reflexer*` are MIRRORS built by `../riir-reflexer/cloudflare/reflexer-worker/build.sh --site .`; never edit them here |
| The stateless demo Worker (`reflexer.gist.rs`) | riir-reflexer |
| Public substrate (board sim, lookahead, reference genome) | katgpt-rs (Issue-893 module) — `wasm-head` is a port pinned by a BLAKE3 fixture, not a dependency |
| Deploy orchestration across Workers | riir-deployer — this repo's own deploy is a config-less `npx wrangler deploy` |
| Hosted serving (metered/keyed/settled) | riir-dapps (private) |

## May depend on

| dep | status |
|---|---|
| (runtime) | **none** — `wasm-head` carries zero dependencies by design; the site is static files |
| `blake3` (dev-dependency of `wasm-head`) | host-side fixture pin check only; never in the wasm artifact |

**Zero workspace path dependencies — the leaf law.** `Visibility: public`
above is machine-read by the workspace boundary guard (riir-ai check C3b):
any path dep on a workspace sibling other than `katgpt-rs` fails the contract
check mechanically. Cross-repo coupling here is by MIRRORED BYTES with a
recorded source sha, never by a build edge. No secrets, no bindings, no KV.

## Public-origin content

- tetris (via the katgpt-rs Issue-893 module and its ports). Nothing from
  riir-games*, mmorpg, or seal domains may enter.

## Drift ledger

**None** at registration (2026-09-26).

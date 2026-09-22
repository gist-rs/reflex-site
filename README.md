# reflex-site

The public arena site for **Reflex** (the riir-reflex decision engine) —
static content only, deployed to `reflex.gist.rs` on Cloudflare Workers
static assets.

- `/` — install commands, the three-step start, the playground (talks to the
  visitor's OWN engine on `127.0.0.1:7331`; nothing is uploaded).
- `/bench/` — the per-task arena tables, rendered client-side from
  `data/bench.json`.
- `data/bench.json` — GENERATED from riir-reflex's harness output by
  `scripts/publish_bench.py` (sanitizes machine-local meta). Never
  hand-typed; a hand-typed number on the site is a defect by definition.

## Regenerate the tables

In `riir-reflex`:

```sh
scripts/fetch_datasets.sh            # once
cargo run --release --features laya-riir --bin harness
python3 ../reflex-site/scripts/publish_bench.py \
    .benchmarks/001_phase1_tables/results.json ../reflex-site
```

Commit + deploy. The provenance (git sha, date, host, protocols) rides
inside `bench.json` and renders on the page.

## Deploy

```sh
npx wrangler deploy          # static assets; the reflex.gist.rs custom domain
                             # is dashboard-attached (wrangler.toml has the why)
npx wrangler dev             # local preview
```

No secrets, no bindings, no KV — the worker serves files and nothing else.

## Theme

Dark red rust (`#B7410E` / `#7C1D05` family) — the owner's explicit color
call. No yellow anywhere.

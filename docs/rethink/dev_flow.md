PUBLIC BY MIRROR — this file ships to reflex.gist.rs; keep it concept-level (no code, no repo paths, no digests, no measured numbers)

# Rethink — the development flow

How a Rethink head is planned to travel from training to serving — the
hosted lane is not open yet, so this is the design, not today's path. The
head is trained on the trainer side, locked [hashed and signed — made
tamper-evident and checksum-verified],
minted into a HOSTED-ONLY vessel [weights that never leave our servers —
you call, we think], deployed to our GPU hosts, and served through the
storefront. No step ever places the weights on hardware we do not
control — that is the point of the flow.

The first two steps are live today — heads are trained and locked, and
their reads are measured on the public board (record-only until the hosted
lane opens); the hosted path from mint on is planned.

```gfflow
file  = "rethink_dev_flow.svg"
title = "Rethink: how a hosted head is made, locked, minted and served"
accent = "rethink"
intro = "Press play to walk the path one step at a time, or click a dot to jump."

[[lane]]
id = "trainer"; label = "Trainer";    note = "the head is trained"; color = "rethink"
[[lane]]
id = "hosts";   label = "Our GPU hosts"; note = "HOSTED-ONLY · weights never leave"; color = "rethink"

[[step]]
id = "train"; n = "1"; lane = "trainer"; col = 0
title = "Train the head"; body = "a small trained head above a frozen base"
status = "live"
[[step]]
id = "lock"; n = "2"; lane = "trainer"; col = 1
title = "Lock it"; body = "hashed and checksum-verified — tamper-evident"
status = "live"
[[step]]
id = "mint"; n = "3"; lane = "hosts"; col = 2
title = "Mint the vessel"; body = "one HOSTED-ONLY file; weights never leave us"
status = "planned"
[[step]]
id = "deploy"; n = "4"; lane = "hosts"; col = 3
title = "Deploy"; body = "our GPU hosts only, one container shape"
status = "planned"
[[step]]
id = "store"; n = "5"; lane = "hosts"; col = 4
title = "The storefront"; body = "you call, we think — receipts on answers"
status = "planned"

[[edge]]
from = "train"; to = "lock"
[[edge]]
from = "lock"; to = "mint"
[[edge]]
from = "mint"; to = "deploy"
[[edge]]
from = "deploy"; to = "store"

[[walk]]
title = "Train the head"
text  = "A small head trains above a frozen base — the base never trains, so its reading stays exact and repeatable. The heads on the public board today were made this way; their reads are measured there, record-only."
steps = ["train"]
[[walk]]
title = "Lock it"
text  = "The head is hashed and checksum-verified: any change to the file is caught at load, and nothing trains at serve time."
steps = ["lock"]
[[walk]]
title = "Mint the vessel"
text  = "The head is minted into one HOSTED-ONLY vessel — a locked file whose weights never leave our servers. The format is built; the hosted lane it serves is planned."
steps = ["mint"]
[[walk]]
title = "Deploy to our GPU hosts"
text  = "The vessel deploys to GPU hosts we control, in one container shape. No step of this flow ever places the weights on hardware nobody controls."
steps = ["deploy"]
[[walk]]
title = "Serve at the storefront"
text  = "You call, we think: the hosted API answers the questions the free floor abstained on, with a receipt on every answer. Planned — this is the public request it would carry, and its reply is published when the lane opens."
steps = ["store"]
illustrative = true
in    = { lang = "json", src = "data/flows/rethink_dev_flow/05_in.json", label = "the abstained question, sent up" }
```

## Status per step (the honesty table)

| # | Step | Status | Grounding |
|---|---|---|---|
| 1 | train the head | live — measured on the board | the encoder cells, record-only |
| 2 | lock it | live | digests pinned at load |
| 3 | mint the HOSTED-ONLY vessel | planned | the format is built; production mints wait on the lane |
| 4 | deploy to our GPU hosts | planned | the hosted serving shape |
| 5 | serve at the storefront | planned | pricing published when the lane opens |

When a status changes, edit the gfflow block above (then re-render with
reflex-site `python3 scripts/render_flows.py --only rethink_root`) and the
honesty table in the same commit. Walk payloads are derived by reflex-site
`scripts/build_flow_walks.py` from the captured public wire — never typed,
and nothing behind the public wire rides this figure (the moat law).

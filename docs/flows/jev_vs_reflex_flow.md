# Jev vs Reflex — how the same typed question gets answered (source for the public figure)

**Status:** PUBLISHED — rendered from the ` ```gfflow ` block below by
reflex-site `scripts/render_flows.py` (riir-ai Plan 620; family design guide
§8) into `assets/jev_vs_reflex_flow.svg` (desktop swimlane) and
`assets/jev_vs_reflex_flow_m.svg` (390 px card list), with the same bytes
beside this doc. Shown in the `#learn` section of reflex.gist.rs/resources.

This doc is SITE-LOCAL (reflex-site owns it — the figure compares an external
product with ours, so it has no sibling-repo home). It replaced a hand-built
comparison SVG.

**Not affiliated with TypeSafe AI or Cloudflare; their products are named
only to compare.** Keep the comparison factual and concept-level: where each
side runs, what each does when unsure, what leaves your machine. No their-side
internals beyond their public description, no our-side numbers in the figure
(numbers live in the walk payloads and the benchmark, never in the shapes).

## The comparison in one sentence each

- **Jev — hosted:** every decision is a network round-trip to a hosted model
  that reads the whole state in one pass and **always answers**, even when
  unsure; thresholding the probabilities is your job.
- **Reflex — local, modelless:** the same typed questions over loopback to an
  engine that answers from a corpus you author in microseconds; when the
  evidence is thin it **abstains** — "not sure" plus the full distribution —
  and only those abstained questions are candidates for a hosted, paid head.

The abstain is the whole difference: it is what makes paying for a hosted
head optional rather than constant.

## Numbering (§8.2)

The question (1) forks onto two routes: **2a/3a/4a** the Jev route (their
cloud), **2b** the Reflex floor, which forks **3b** sure / **3c** not sure →
abstains, and only the abstained questions escalate (**4b**, hosted Rethink,
planned). Route letters read down each column: a = hosted-model route,
b = local route.

```gfflow
file  = "jev_vs_reflex_flow.svg"
title = "Two ways to answer the same typed question: Jev hosted, Reflex local"
accent = "reflex"

[[lane]]
id = "jev"; label = "Jev · hosted model"; note = "their cloud · a network round-trip every decision"; color = "ai"
aside_title = "Always answers"
aside = "even when unsure — thresholding the probabilities is your job."
[[lane]]
id = "me";   label = "Your machine"; note = "local · free · private"; color = "reflex"
aside_title = "Reflex runs here:"
aside = "the modelless floor, your corpus, loopback only. Nothing leaves by default."
[[lane]]
id = "host"; label = "Our hosts"; note = "managed · paid per answer"; color = "rethink"

[[step]]
id = "ask"; n = "1"; lane = "me"; col = 0
title = "Your question"; body = "the same state + typed questions, either way"
status = "live"
[[step]]
id = "jev_trip"; n = "2a"; lane = "jev"; col = 1
title = "Network hop"; body = "every decision crosses the network to their cloud"
status = "live"
[[step]]
id = "floor"; n = "2b"; lane = "me"; col = 1
title = "Reflex floor"; body = "answers from your corpus in microseconds, over loopback"
status = "live"
[[step]]
id = "jev_read"; n = "3a"; lane = "jev"; col = 2
title = "One-pass read"; body = "a hosted model reads the whole state in one pass"
status = "live"
[[step]]
id = "sure"; n = "3b"; lane = "me"; col = 2
title = "Sure → answer"; body = "typed answer + calibrated confidence, back in your app"
status = "live"
[[step]]
id = "abstain"; n = "3c"; lane = "me"; col = 3
title = "It abstains"; body = "“not sure” + the full distribution attached — it never guesses"
status = "live"
[[step]]
id = "jev_answer"; n = "4a"; lane = "jev"; col = 3
title = "Always answers"; body = "typed answer + probabilities, even when unsure"
status = "live"
[[step]]
id = "escalate"; n = "4b"; lane = "host"; col = 4
title = "The hosted head"; body = "only abstentions go up — hosted, paid per answer"
status = "planned"; note = "lane opening"

[[edge]]
from = "ask"; to = "jev_trip"
[[edge]]
from = "ask"; to = "floor"
[[edge]]
from = "jev_trip"; to = "jev_read"
[[edge]]
from = "floor"; to = "sure"; label = "sure"
[[edge]]
from = "floor"; to = "abstain"; label = "not sure"
[[edge]]
from = "jev_read"; to = "jev_answer"
[[edge]]
from = "abstain"; to = "escalate"; label = "you choose"
```

## Status per step (the honesty table — re-check before every edit)

| # | Step | Lane | Status | Grounding |
|---|---|---|---|---|
| 1 | the same typed question | your machine | live | the typed question is the family wire (`decision_wire`) |
| 2a / 3a / 4a | Jev round-trip / one-pass read / always answers | their cloud | live (their product) | their public description; named to compare, not affiliated |
| 2b | Reflex floor | your machine | live | riir-reflex, the release binary |
| 3b | sure → answer + calibrated confidence | your machine | live | the calibrated readout shipped default (Bench 095) |
| 3c | not sure → abstains | your machine | live | the fused abstain, first-class in the wire |
| 4b | escalate to Rethink | our hosts | planned | the hosted lane opens later; pricing published then |

When a status changes, edit the gfflow block above (then re-render with
reflex-site `python3 scripts/render_flows.py --only jev_vs_reflex`) in the
same commit as the page edit.

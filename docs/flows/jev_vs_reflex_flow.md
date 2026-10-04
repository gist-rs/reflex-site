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

[[walk]]
title = "One question, two routes"
text  = "The same state and typed questions either way — here a security triage: route the ticket, promote or not, rate the severity. The difference is only where the answering happens and what happens when the answerer is unsure."
steps = ["ask"]
in    = { lang = "json", src = "data/flows/jev_vs_reflex_flow/01_in.json", label = "POST /decide — the same request either way" }
[[walk]]
title = "The Jev route — a network hop"
text  = "Every decision crosses the network to their cloud, where a hosted model reads the whole state in one pass. Their product, their wire — nothing here is ours to show beyond the public description."
steps = ["jev_trip"]
[[walk]]
title = "One-pass read"
text  = "A hosted model reads the state and every option together and always returns a typed answer with probabilities — even when it is unsure. Thresholding those probabilities is your job."
steps = ["jev_read"]
[[walk]]
title = "The Reflex route — loopback"
text  = "The same question goes over loopback to the modelless engine on your own machine. It answers from a corpus you author, in microseconds — nothing leaves by default."
steps = ["floor"]
in    = { lang = "json", src = "data/flows/jev_vs_reflex_flow/03b_in.json", label = "POST /decide · a question it is sure on" }
[[walk]]
title = "Sure — answer with confidence"
text  = "When the evidence is there, a typed answer comes back with calibrated confidence. This game-head question is one the engine is sure on."
steps = ["sure"]
in    = { lang = "json", src = "data/flows/jev_vs_reflex_flow/03b_in.json", label = "POST /decide" }
out   = { lang = "json", src = "data/flows/jev_vs_reflex_flow/03b_out.json", label = "sure: outcome yes" }
[[walk]]
title = "Not sure — it abstains"
text  = "On the harder triage question the engine abstains: “not sure” with the full distribution attached, never a guess. Your code routes the hard case instead of thresholding a confident-looking wrong answer."
steps = ["abstain"]
in    = { lang = "json", src = "data/flows/jev_vs_reflex_flow/03c_in.json", label = "POST /decide · the triage question" }
out   = { lang = "json", src = "data/flows/jev_vs_reflex_flow/03c_out.json", label = "not sure: every outcome is null" }
[[walk]]
title = "The hosted model always answers"
text  = "The Jev route's answer to the same triage question is a typed answer with probabilities — always. If you threshold it, you decide where “unsure” begins; if you don't, every case looks answered."
steps = ["jev_answer"]
[[walk]]
title = "Escalation is a choice, not a default"
text  = "Only the abstained questions are candidates for a hosted, paid head — and only if you point your app at it. That is what makes paying optional rather than constant. Planned: the hosted lane opens later."
steps = ["escalate"]
illustrative = true
in    = { lang = "json", src = "data/flows/jev_vs_reflex_flow/04b_in.json", label = "the abstained question, sent up" }
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

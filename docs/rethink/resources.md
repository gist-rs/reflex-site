PUBLIC BY MIRROR — this file ships to reflex.gist.rs; keep it concept-level (no code, no repo paths, no digests, no measured numbers)

# Rethink — the encoder tier

Rethink is the same Instinct idea one rung deeper: where a bag specialist is too coarse, a trained encoder head thinks — served HOSTED-ONLY from our GPU servers, so the weights never leave controlled hardware.

## What Rethink is

Rethink is a **product**, not a research note: it serves typed decisions
[structured questions that deserve a structured answer, not free text]
over the same wire the open lanes use, and every answer carries a receipt
[a signed summary of exactly what produced the answer]. It is also
**private forever** — the source stays ours, and so do the trained heads.

The heads themselves ship inside a **HOSTED-ONLY vessel** [weights that
never leave our servers — you call, we think]. That class is structural,
not a policy: a build without the hosted reader cannot open a hosted
vessel at all, so the heads cannot land on hardware we do not control —
not by accident, not by option.

## The rung model

**Reflex** is the floor: a modelless engine [no neural network — no
training run] that runs on your machine, answers in µs-class time, and
abstains [says "I don't know" instead of guessing] when it is unsure.
**Instinct** is the idea above the floor: when the engine abstains,
consult a specialist trained for exactly that domain — composed on top,
never instead. **Rethink** is that idea at the encoder tier: where a bag
specialist [a small per-domain scorer over hashed word-count features —
cheap and fast, but blind to word order and nuance] is too coarse, a
trained encoder head reads the question as a whole and thinks — ms-class
thinks, on our GPU hosts.

## Where it runs

On **our GPU hosts only**. Rethink ships its own serve binary to our own
servers — private distribution, never a public download. There is no
binary to fetch, and by design there never will be: the encoder lane does
not compile into a public build, and the heads ride vessels the public
reader refuses. "Can I run this myself?" has an honest answer: no — and
that is the whole point of the class.

## How to see it

- **The storefront** — [rethink.gist.rs](https://rethink.gist.rs)
  (**incoming**): the product surface once it deploys. Until then the
  link may be dark.
- **The measured side** — the site's [/bench/](/bench/) Rethink rows:
  every seated cell is the encoder arm measured against the open lanes
  on the same frozen test read. If the storefront has not opened yet,
  the bench rows are live today.

The free floor is always on, and always answers first: Rethink is paid
only where the free engine's confidence check [the fused gate — the
calibrated signal that decides whether a specialist is worth consulting]
abstains.

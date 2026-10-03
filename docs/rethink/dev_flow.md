PUBLIC BY MIRROR — this file ships to reflex.gist.rs; keep it concept-level (no code, no repo paths, no digests, no measured numbers)

# Rethink — the development flow

How a Rethink head travels from training to serving. The head is trained
on the trainer side, sealed [made tamper-evident and checksum-verified],
minted into a HOSTED-ONLY vessel [weights that never leave our servers —
you call, we think], deployed to our GPU hosts, and served through the
storefront. No step ever places the weights on hardware we do not
control — that is the point of the flow.

```mermaid
%% file: dev_flow.svg
%% aria: The Rethink development flow: train the head on the trainer side, seal it, mint a HOSTED-ONLY vessel, deploy to our GPU hosts only, and serve decisions through the storefront.
flowchart LR
    T[Make model<br/>train the head · trainer side] --> S[Seal<br/>tamper-evident · checksum-verified]
    S --> M[Mint<br/>HOSTED-ONLY vessel]
    M --> D[Deploy<br/>our GPU hosts only]
    D --> F[Storefront<br/>you call · we think]
```

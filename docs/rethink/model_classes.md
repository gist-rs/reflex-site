PUBLIC BY MIRROR — this file ships to reflex.gist.rs; keep it concept-level (no code, no repo paths, no digests, no measured numbers)

# Model classes — encoder, autoregressive, and what trains

The deep dive behind the family education page's build section: the three
model classes that answer typed questions, the industry words for training
and freezing, and why this family's serving ladder freezes everything below
a small trained head. Written for software developers — no machine-learning
background assumed, and every term is defined at first sight or in the
glossary below.

## Three ways a typed question becomes an answer

A typed question arrives the same way everywhere: a state (the situation)
plus questions whose answer space travels with the request. What differs is
the machine that answers it.

**Modelless** — the Reflex floor. There is no neural network at all: the
text is hashed into word-count features and each option is scored against a
corpus you author, one sigmoid [a squash of a score into the zero-to-one
range] per option. It is microsecond-class, it runs on your machine, and
when the evidence is thin it abstains instead of guessing.

**Encoder** — the class BERT made canonical, and the class our hosted rung
builds on. One forward pass [a single run of the input through the model]
reads the question AND every option together; every token's representation
may attend to every other token, left and right — there is no causal mask
[the rule that hides the future from each token]. Nothing is generated:
a small trained head turns the encoder's reading into one score per
option. The encoders in our lanes are ModernBERT-class
and always frozen: their weights are done training before we touch them.

**Autoregressive** — the chatbot class, the GPT family shape. Token after
token, each seeing only the past, in a predict-append-repeat loop. Superb
at writing text; slow and indirect for typed decisions — the answer has to
be parsed back out of free text, and every generated token costs a forward
pass.

```gfflow
file  = "model_classes_flow.svg"
title = "Three ways a typed question becomes an answer"
accent = "reflex"

[[lane]]
id = "me";  label = "Modelless · your machine"; note = "no neural network · free · µs-class"; color = "reflex"
[[lane]]
id = "enc"; label = "Encoder · our GPU hosts"; note = "reads the question whole · ms-class think"; color = "rethink"
[[lane]]
id = "ar";  label = "Autoregressive · a chatbot"; note = "writes free text, one token at a time"; color = "ai"

[[step]]
id = "q"; n = "1"; lane = "me"; col = 0
title = "A typed question"; body = "state + questions + options, asked on your machine"
status = "live"

[[step]]
id = "bag"; n = "2a.1"; lane = "me"; col = 1
title = "Hash the words"; body = "words and pairs become counts; order is lost"
status = "live"
[[step]]
id = "sig"; n = "2a.2"; lane = "me"; col = 2
title = "Score + abstain"; body = "sigmoid score per option vs your corpus"
status = "live"

[[step]]
id = "one"; n = "2b.1"; lane = "enc"; col = 1
title = "One forward pass"; body = "question AND every option read together"
status = "live"
[[step]]
id = "both"; n = "2b.2"; lane = "enc"; col = 2
title = "Both directions"; body = "every token attends left AND right"
status = "live"
[[step]]
id = "head"; n = "2b.3"; lane = "enc"; col = 3
title = "A small head"; body = "a tiny trained layer turns the reading into option scores"
status = "live"; note = "on the board"

[[step]]
id = "pre"; n = "2c.1"; lane = "ar"; col = 1
title = "Read the prompt"; body = "one pass over everything so far"
status = "live"
[[step]]
id = "tok"; n = "2c.2"; lane = "ar"; col = 2
title = "Predict a token"; body = "each token sees only the past — the causal mask"
status = "live"
[[step]]
id = "loop"; n = "2c.3"; lane = "ar"; col = 3
title = "Append, repeat"; body = "generation is a loop, one token per pass"
status = "live"

[[step]]
id = "ans"; n = "3"; lane = "me"; col = 4
title = "One typed answer"; body = "probabilities + confidence — or an honest abstain"
status = "live"

[[edge]]
from = "q"; to = "bag"
[[edge]]
from = "q"; to = "one"; label = "encoder"
[[edge]]
from = "q"; to = "pre"; label = "chatbot"
[[edge]]
from = "bag"; to = "sig"
[[edge]]
from = "sig"; to = "ans"; label = "µs-class"
[[edge]]
from = "one"; to = "both"
[[edge]]
from = "both"; to = "head"
[[edge]]
from = "head"; to = "ans"; label = "ms-class"
[[edge]]
from = "pre"; to = "tok"
[[edge]]
from = "tok"; to = "loop"; label = "next"
[[edge]]
from = "loop"; to = "tok"; back = true; label = "loop"
[[edge]]
from = "loop"; to = "ans"; label = "parse the text"
```

## The words, grouped

Grouped the way a developer meets them: what the models are, what training
touches, what freezing protects, and how a fit is judged.

### Model classes and anatomy

- **encoder** — a model that reads the whole input in one pass, every token
  attending both left and right, and produces per-token vectors — not text.
- **BERT** — the canonical pretrained encoder: pretraining hides words and
  predicts them from both directions.
- **ModernBERT** — the modern refresh of BERT (rotary positions,
  sliding-window attention); the encoder class our lanes build on.
- **decoder-only** — the autoregressive shape: one stack, each token seeing
  only the past, built to predict the next token.
- **causal mask** — the rule that hides the future from each token; what
  makes a model autoregressive rather than bidirectional.
- **forward pass** — one run of input through a model to its output. "One
  forward" is the unit of serve cost.
- **embedding** — a vector of numbers representing a piece of text; similar
  meanings land on nearby vectors.
- **tokenizer / BPE** — how text becomes subword pieces before a model sees
  it. Byte-pair encoding merges frequent pairs; the vocabulary is fixed
  before training.
- **sigmoid vs softmax** — two ways to turn scores into probabilities.
  Softmax makes options compete (the probabilities sum to one); sigmoid
  scores each option alone. This family's own primitives use sigmoid; a
  ported reference model may keep softmax to stay faithful to its numbers.

### Training techniques

- **pretraining** — the first, expensive training run on huge generic data
  that produces a base model. Nobody in this family pretrains; we consume
  pretrained bases.
- **fine-tuning** — any further training that adapts a pretrained model to
  a task.
- **SFT (supervised fine-tuning)** — fine-tuning on labeled examples with
  gold answers; the simplest adaptation. The heads in this family are a
  minimal SFT.
- **gold label** — the correct answer for an example, written by people.
- **distillation** — a big teacher model's probabilities train a small
  student; the student learns the teacher's soft opinions rather than only
  its hard picks.
- **teacher / student** — the big frozen model that labels (teacher) and
  the small cheap model that learns from it (student).
- **soft target** — a teacher's probability spread over the options, as
  opposed to one hard gold answer.
- **LoRA / adapter (PEFT)** — a small trainable patch injected into a
  frozen base, training a fraction of the parameters —
  parameter-efficient fine-tuning.
- **full fine-tune** — updating every weight of the base; the most
  expressive and the most expensive option.
- **behavioural cloning** — training a critic by imitating an expert's
  moves. Our arena measured its limit: agreeing with the expert is not the
  same as playing better.

### Freezing and serving discipline

- **frozen weights** — weights that are done training: locked bytes, never
  updated at serve time. Same input, same reading, forever.
- **head-only training** — freeze the whole base and train only a small
  head above it. The base's reading stays exact; the head is cheap to fit
  per domain.
- **linear probe** — the simplest head-only form: a single linear layer
  over frozen features. The classic baseline a real head must beat.
- **catastrophic forgetting** — a fully fine-tuned model losing skills it
  used to have. The risk full fine-tunes carry and frozen-below designs
  avoid by construction.
- **hot-swap** — replacing an artifact atomically, whole-for-whole, so a
  decision always observes one whole model.
- **never blend** — a weighted mix of two models' outputs is banned in this
  family: blends do not preserve rankings, so a decision could observe a
  model that never existed.

### Evaluation discipline

- **train / holdout / test split** — three disjoint slices of a corpus:
  fit on train, choose on holdout, and read test once for the verdict.
- **frozen test read** — the one-time read of the test split. A number
  quoted from it can never be improved by trying again — that is the point.
- **overfitting** — memorizing the training slice instead of learning the
  task; the holdout split is what catches it.
- **winner law** — a student serves only where it strictly beat the free
  floor on the frozen read. A tie or a loss sells nothing.
- **reference lane** — a frozen model nobody here trains, measured as the
  bar each student must clear.

## What trains, what stays frozen

The discipline in one sentence: everything below the head is frozen, and
only the head trains. The base encoder's weights are locked bytes — one
reading of a text, exact and repeatable, forever. A small head fits over
the encoder's cached reading, on gold labels or on a frozen teacher's
probabilities. The fit must earn its test read on held-out examples first,
and the winner law decides whether it serves at all. What wins is locked
and swapped whole — never blended — and serves composed: the floor answers
first, and the head is consulted only where the floor abstains.

```gfflow
file  = "train_freeze_flow.svg"
title = "Frozen below, trained above — how a student head is built"
accent = "rethink"

[[lane]]
id = "data"; label = "Public data + big models"; note = "the corpus and the frozen teacher"; color = "ai"
[[lane]]
id = "froz"; label = "The frozen encoder"; note = "our substrate — its weights never train"; color = "rethink"
aside_title = "Frozen means frozen"
aside = "the encoder's weights are locked bytes — one reading of a text, exact and repeatable, forever."
[[lane]]
id = "fit";  label = "The trainable top"; note = "a small head — cheap to fit per domain"; color = "instinct"
aside_title = "The only part we train"
aside = "a tiny head — small enough to fit per domain without a GPU farm, locked the moment it wins."
[[lane]]
id = "you";  label = "Your machine · the gate"; note = "the winner law and the serve"; color = "reflex"
aside_title = "The discipline"
aside = "one frozen test read, a strict-win gate, lock and swap whole — never blend."

[[step]]
id = "corpus"; n = "1"; lane = "data"; col = 0
title = "A labeled corpus"; body = "public data, frozen splits; the test split is read once"
status = "live"
[[step]]
id = "cache"; n = "2"; lane = "froz"; col = 1
title = "The frozen encoder"; body = "reads every example once; its weights never train"
status = "live"
[[step]]
id = "train"; n = "3"; lane = "fit"; col = 2
title = "Fit the small head"; body = "on gold labels, or a frozen teacher's probabilities"
status = "live"
[[step]]
id = "hold"; n = "4"; lane = "fit"; col = 3
title = "Earn the read"; body = "the fit must clear its bar on held-out examples"
status = "live"
[[step]]
id = "read"; n = "5"; lane = "you"; col = 4
title = "One frozen test read"; body = "the winner law: serve only a strict win"
status = "live"
[[step]]
id = "lock"; n = "6"; lane = "you"; col = 5
title = "Lock, never blend"; body = "the winner swaps in whole; losers are demoted"
status = "live"
[[step]]
id = "serve"; n = "7"; lane = "you"; col = 6
title = "Serve composed"; body = "the floor answers first; the head thinks on abstain"
status = "live"; note = "open today"

[[edge]]
from = "corpus"; to = "cache"; label = "every example"
[[edge]]
from = "cache"; to = "train"; label = "cached features"
[[edge]]
from = "train"; to = "hold"
[[edge]]
from = "hold"; to = "read"; label = "one read"
[[edge]]
from = "read"; to = "lock"
[[edge]]
from = "lock"; to = "serve"
```

## Teacher → student

Distillation is the flow that moves knowledge from a model too expensive to
serve into one cheap enough to keep. The teacher — a big pretrained model,
frozen — scores every training example, producing a probability over the
options for each. The student trains on those soft targets instead of (or
beside) the gold labels, learning the teacher's graded opinions: that one
wrong option is nearly right, another is wildly wrong.

Two honest lessons this family measured, both worth carrying into any
project:

- **Upgrade the student's features before the teacher.** A student over
  bag-of-words features stayed near its ceiling even under a far better
  teacher; the same teacher's signal over encoder features read far higher.
  The feature class, not the teacher, was binding.
- **Distillation is not a default.** A teacher's probabilities carry the
  teacher's own errors, and those errors can cap what a student learns;
  gold labels say only the truth but show less shape. Measure both before
  adopting either — the choice is an experiment, not a preference.

## Train or freeze — the comparison

Every technique below adapts a model to a task; they differ in what trains,
what stays frozen, and what the choice costs at serve time. The measured
side of every row is the benchmark — no number is typed here.

| Technique | What trains | What stays frozen | Why we choose it — or don't | Where the gain shows |
|---|---|---|---|---|
| Frozen, as-is | nothing | everything | the zero-cost baseline: score a pretrained model without training. Every lane must beat a frozen reference — or the free floor — before anything trains at all. | the comparison lanes on the benchmark |
| Head-only (frozen base + small head) | a tiny head | the whole base model | the hosted rung: the base's reading stays exact and repeatable, a head is cheap to fit per domain, and nothing below it can drift or forget. | the benchmark's Rethink rows — measured, record-only until the hosted lane opens |
| Distillation (teacher → student) | the student | the teacher | moves a big model's knowledge into a cheap student. The caveat we measured: the student's feature class can cap the lift — a better teacher could not raise a bag-features student past its ceiling. | the benchmark's Instinct rows |
| Adapter (LoRA — PEFT) | a small injected adapter | the base model | the industry's middle path, and the shape behind a published open decision model's recipe. Serve still pays the big base's cost — so it stays out of our serving ladder, kept on the map for a future retrain. | not seated — a mapped option |
| Full fine-tune | every weight | nothing | most expressive, most expensive, and it risks catastrophic forgetting. Overkill for typed decisions; nobody in the family's serving ladder does it. | not used — shown for contrast |
| Modelless fit | a few gate thresholds, offline | everything — there is no network at all | the free floor: an authored corpus plus fitted gates. Not training in the neural sense, and that is the point — nothing to freeze, nothing to forget. | the Reflex rows, every suite |

Read the table this way: the serving ladder (modelless → bag specialist →
encoder head) never leaves frozen-below-the-head, while the heavier
techniques stay available to the training side, where a measured win can
promote them.

## Rendering

Both figures are rendered from the gfflow blocks above by the family flow
renderer in the site repo — re-render after editing a block, never
hand-edit the SVGs. The rendered SVGs are committed beside this doc and
mirrored into the site's assets, byte-identically; the site's mirror check
is the drift detector between renders.

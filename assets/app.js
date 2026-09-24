/* Reflex arena — playground + status. Talks ONLY to the visitor's own
   localhost engine (127.0.0.1:7331); nothing is sent anywhere else. */

const ENGINE = "http://127.0.0.1:7331";

// ── status probe ───────────────────────────────────────────────────────────
async function probe() {
  const el = document.getElementById("status");
  const txt = document.getElementById("status-text");
  const launch = document.getElementById("launch-box");
  const ask = document.getElementById("ask");
  try {
    const r = await fetch(`${ENGINE}/healthz`, { mode: "cors", cache: "no-store" });
    if (r.ok) {
      el.className = "ok";
      txt.textContent = "local engine detected — ready";
      launch.hidden = true;
      ask.disabled = false;
      return;
    }
    throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    el.className = "err";
    txt.textContent = "no local engine — start it, then refresh";
    launch.hidden = false;
    ask.disabled = true;
  }
}

// ── request building ───────────────────────────────────────────────────────
function buildRequest() {
  const kind = document.getElementById("kind").value;
  const q = { id: "q0", kind, prompt: document.getElementById("prompt").value, options: [] };
  if (kind === "choice") {
    q.options = document.getElementById("options").value
      .split("\n").map((s) => s.trim()).filter(Boolean);
  } else if (kind === "score") {
    q.options = ["1", "2", "3", "4", "5"];
  }
  return { state: document.getElementById("state").value, questions: [q] };
}

function outcomeLabel(a) {
  if (a.outcome === null || a.outcome === undefined) return "abstain";
  return a.outcome;
}

function renderResponse(resp) {
  const box = document.getElementById("answer");
  box.innerHTML = "";
  for (const a of resp.answers || []) {
    const abstain = a.outcome === null || a.outcome === undefined;
    const row = document.createElement("div");
    row.className = "row" + (abstain ? " abstain" : "");
    const left = document.createElement("span");
    left.textContent = abstain
      ? "abstain — no signal, declining to guess"
      : `outcome: ${outcomeLabel(a)}`;
    const right = document.createElement("span");
    right.className = "conf";
    const probs = a.probabilities || [];
    right.textContent = `confidence ${a.confidence?.toFixed?.(3) ?? "—"}` +
      (probs.length ? ` · p=[${probs.map((p) => p.toFixed(3)).join(", ")}]` : "");
    row.appendChild(left);
    row.appendChild(right);
    box.appendChild(row);
  }
  const meta = document.createElement("div");
  meta.className = "meta";
  const routing = resp.routing ? `lane: ${resp.routing.lane} · ${resp.routing.reason}` : "";
  const cal = resp.calibration ? `calibration: ${resp.calibration.method}` : "";
  meta.textContent = [routing, cal].filter(Boolean).join(" · ");
  box.appendChild(meta);
}

function renderError(e) {
  const box = document.getElementById("answer");
  box.innerHTML = "";
  const row = document.createElement("div");
  row.className = "row abstain";
  row.textContent = String(e.message || e);
  box.appendChild(row);
}

document.getElementById("kind").addEventListener("change", () => {
  const kind = document.getElementById("kind").value;
  document.getElementById("options-box").classList.toggle("on", kind === "choice");
});

document.getElementById("ask").addEventListener("click", async () => {
  const btn = document.getElementById("ask");
  btn.disabled = true;
  try {
    const r = await fetch(`${ENGINE}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequest()),
    });
    const body = await r.json();
    if (!r.ok) {
      renderError(new Error(body.error || `HTTP ${r.status}`));
    } else {
      renderResponse(body);
    }
  } catch (e) {
    renderError(e);
    probe();
  } finally {
    btn.disabled = false;
  }
});

// ── copy buttons ───────────────────────────────────────────────────────────
document.querySelectorAll("button[data-copy]").forEach((b) => {
  b.addEventListener("click", () => {
    navigator.clipboard?.writeText(b.dataset.copy);
    const t = b.textContent;
    b.textContent = "copied";
    setTimeout(() => (b.textContent = t), 1200);
  });
});

probe();

// ── nav focus (home) ───────────────────────────────────────────────────────
// "Playground" is the home page's nav row; arriving at /#skill (the For
// agents link on another page) moves the highlight with it.
function navFocus() {
  const play = document.querySelector('nav a[href="/#playground"]');
  const skill = document.querySelector('nav a[href="/#skill"]');
  if (!play || !skill) return;
  const target = location.hash === "#skill" ? skill : play;
  for (const a of [play, skill]) {
    if (a === target) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}
window.addEventListener("hashchange", navFocus);
navFocus();

// ── bench teaser — the same rule as /bench/ (a hand-typed number on the
// site is a defect): every figure is read from data/bench.json at render
// time; the static HTML above is only the no-JS fallback.
async function teaser() {
  const big = document.getElementById("t-ml-p50");
  if (!big) return;
  let d;
  try {
    const r = await fetch("/data/bench.json", { cache: "no-store" });
    if (!r.ok) return;
    d = await r.json();
  } catch {
    return; // fetch failed — the static fallback stays
  }
  const suites = d.suites || [];
  const suite = (name) => suites.find((s) => s.name === name);
  // The /bench/ hero pick (bench-charts.js): the best-accuracy
  // non-multilingual laya checkpoint, first-max wins in lane order.
  const pickLaya = (s) => {
    let best = null;
    for (const l of Object.values(s.laya || {})) {
      if (l.lane !== "laya (rust)" && l.lane !== "laya (python)") continue;
      if (l.model === "multilingual" || !l.hard) continue;
      if (!best || (l.hard.accuracy ?? -1) > (best.hard.accuracy ?? -1)) best = l;
    }
    return best;
  };
  const lat = (v) => v < 1 ? +(v * 1000).toPrecision(3) + " µs" : v < 1000 ? +v.toPrecision(3) + " ms" : +(v / 1000).toPrecision(3) + " s";
  const td = suite("typed_decisions");
  if (td?.modelless?.latency_p50_ms != null) {
    big.textContent = lat(td.modelless.latency_p50_ms);
    const lbl = document.getElementById("t-ml-lbl");
    if (lbl && td.n_questions) {
      lbl.textContent = `modelless p50 per question — the typed-decision set (${td.n_questions.toLocaleString("en-US")} questions)`;
    }
  }
  const rows = [];
  for (const [name, label] of [["typed_decisions", "typed decisions"], ["ag_news", "AG News"], ["emotion", "emotion"]]) {
    const s = suite(name);
    if (!s) continue;
    const acc = s.modelless?.hard?.accuracy;
    const l = pickLaya(s);
    rows.push(
      `<tr><td>${label}</td><td>${typeof acc === "number" ? acc.toFixed(3) : "—"}</td>` +
      `<td>${l ? `<strong>${l.hard.accuracy.toFixed(3)}</strong>` : "—"}</td>` +
      `<td>${l && l.latency_p50_ms != null ? lat(l.latency_p50_ms) : "—"}</td></tr>`,
    );
  }
  const tb = document.getElementById("t-rows");
  if (tb && rows.length) tb.innerHTML = rows.join("");
  const prov = document.getElementById("t-prov");
  if (prov && d.meta?.date_utc) {
    prov.hidden = false;
    prov.textContent = `measured ${d.meta.date_utc.slice(0, 10)} · run ${d.meta.git_sha || "?"} on ${d.meta.host || "?"} — full tables on the benchmark page`;
  }
}
teaser();

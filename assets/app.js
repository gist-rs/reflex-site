/* Reflex site script — page-aware: the playground half runs only where the
   playground DOM exists (it moved to its own page, /playground/), the
   landing half only on the home page. Talks ONLY to the visitor's own
   localhost engine (127.0.0.1:7331); nothing is sent anywhere else. */

const ENGINE = "http://127.0.0.1:7331";

// ── copy buttons (every page) ───────────────────────────────────────────────
document.querySelectorAll("button[data-copy]").forEach((b) => {
  b.addEventListener("click", () => {
    navigator.clipboard?.writeText(b.dataset.copy);
    const t = b.textContent;
    b.textContent = "copied";
    setTimeout(() => (b.textContent = t), 1200);
  });
});

// ── playground (its own page) ───────────────────────────────────────────────
const askBtn = document.getElementById("ask");
if (askBtn) {
  const el = document.getElementById("status");
  const txt = document.getElementById("status-text");
  const launch = document.getElementById("launch-box");

  async function probe() {
    try {
      const r = await fetch(`${ENGINE}/healthz`, { mode: "cors", cache: "no-store" });
      if (r.ok) {
        el.className = "ok";
        txt.textContent = "local engine detected — ready";
        launch.hidden = true;
        askBtn.disabled = false;
        return;
      }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      el.className = "err";
      txt.textContent = "no local engine — start it, then refresh";
      launch.hidden = false;
      askBtn.disabled = true;
    }
  }

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

  askBtn.addEventListener("click", async () => {
    askBtn.disabled = true;
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
      askBtn.disabled = false;
    }
  });

  probe();
}

// ── home: the measured TL;DR + the compact averaged chart ──────────────────
// The same rule as /bench/ (a hand-typed number on the site is a defect):
// every figure renders from data/bench.json; the static HTML above is only
// the no-JS fallback. Speed statistic matches the arena TL;DR (the median of
// the per-suite modelless-vs-laya p50 ratios); the chart's latency bars are
// geometric means — the average that matches their log axis.
const lat = (v) => v < 1 ? +(v * 1000).toPrecision(3) + " µs" : v < 1000 ? +v.toPrecision(3) + " ms" : +(v / 1000).toPrecision(3) + " s";

function median(xs) {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}

async function homeFigure() {
  const tldrBody = document.getElementById("tldr-body");
  const chart = document.getElementById("bench-summary");
  if (!tldrBody && !chart) return;
  let d;
  try {
    const r = await fetch("/data/bench.json", { cache: "no-store" });
    if (!r.ok) return;
    d = await r.json();
  } catch {
    return; // fetch failed — the static fallback stays
  }
  if (!window.BenchCharts) return;
  BenchCharts.setLogDomain(d);
  // Latency rows plot the SERVED product (own arm + the base lane's clock
  // where it declined, ↩); unfit timing never plots — its lane keeps a
  // presence row; unjudged cells plot marked. Instinct and Rethink render
  // beside the base lanes; nothing ever vanishes from this chart
  // (2026-10-03 user reports).
  if (chart) BenchCharts.summary(d, chart);
  if (tldrBody) {
    // Issue-058 follow-up (2026-10-01): the SAME denominator as the arena
    // TL;DR (arena_tldr.js pick()) — modelless + laya.english + py/english,
    // all fields present. The old pickLayaBest() count included
    // code_fixtures (rust lane only, no py twin) and read "9 suites"
    // beside the arena's 8/8 — two pages, two denominators, one median
    // (191x) contradicting the other (218x). code_fixtures is the
    // population-excluded 16-case fixture suite; the headline speed claim
    // runs on the 8 dataset suites, exactly like the arena's verdict row.
    const tldrRows = [];
    for (const s of d.suites || []) {
      const km = s.modelless, l = s.laya?.english, py = s.laya?.["py/english"];
      if (!km || !l || !py) continue;
      if (km?.latency_p50_ms > 0 && l?.latency_p50_ms > 0 && py?.latency_p50_ms > 0) {
        tldrRows.push({ km, l });
      }
    }
    const ratios = tldrRows.map(({ km, l }) => l.latency_p50_ms / km.latency_p50_ms);
    const kmP50s = tldrRows.map(({ km }) => km.latency_p50_ms);
    const kmCells = tldrRows.map(({ km }) => km);
    const speedup = median(ratios), geo = median(kmP50s) && Math.exp(kmP50s.reduce((a, v) => a + Math.log(v), 0) / kmP50s.length);
    if (speedup && geo) {
      tldrBody.innerHTML =
        `Typical decision <b class="num">${lat(geo)}</b> — median <b class="num">${Math.round(speedup).toLocaleString("en-US")}×</b> faster than the open-weights ` +
        `model on the same questions, across <b class="num">${ratios.length}</b> of the <b class="num">${(d.suites || []).length}</b> ` +
        `published suites — the ones where both laya lanes (Rust and Python) also ran.`;
      // The Issue-021 verdict rides the claim it qualifies (never a
      // footnote elsewhere): a speed figure built on timing the run itself
      // judged unfit says so beside the number.
      const v = window.BenchProv ? BenchProv.latency(kmCells) : null;
      if (v && v.unfit) {
        tldrBody.innerHTML += ` <span class="caveat">⚠ ${BenchProv.unfitNote(`Reflex's timing on ${v.unfit}/${v.n} suites`)}</span>`;
      }
    }
  }
  // G1 badge — counted from the per-suite verdicts, never typed (a suite
  // with no calibration claim is excluded from the denominator, as on /bench/).
  const g1 = document.getElementById("g1-badge");
  if (g1) {
    const vs = (d.suites || []).map((s) => s.modelless).filter(Boolean)
      .map((m) => m.g1_verdict || (m.g1_pass === true ? "pass" : m.g1_pass === false ? "fail" : null))
      .filter((v) => v === "pass" || v === "fail");
    if (vs.length) {
      g1.textContent = `G1 calibration beats the conformal floor — ${vs.filter((v) => v === "pass").length}/${vs.length} suites`;
      g1.hidden = false;
    }
  }
  const prov = document.getElementById("home-prov");
  // The NEWEST contributing run, not meta's: meta is the table's original
  // run and lane-scoped updates never replace it (BenchProv.latestRun).
  const last = window.BenchProv ? BenchProv.latestRun(d) : null;
  if (prov && last) {
    prov.hidden = false;
    prov.textContent = `latest run ${last.date_utc.slice(0, 10)} · ${last.git_sha} on ${last.host} · lanes carry their own runs (see /bench/) · from data/bench.json`;
  }
}
homeFigure();

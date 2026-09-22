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

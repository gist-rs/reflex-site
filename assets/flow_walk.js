// flow_walk.js — the gist.rs family flow step-through (design guide §8.4,
// riir-ai .docs/13_web_family/design_guide.md; riir-ai Plan 620 P1.4).
//
// A <figure data-walk="/assets/<file>.svg"> becomes walkable: restart / prev /
// play / next controls, step dots, "step k / n", and a step panel under the
// figure. The figure's own <img> (or <picture>) stays the no-JS fallback —
// the swap happens only after everything loads, and any failure leaves the
// static figure untouched.
//
// Two figure kinds:
//   gfflow  the renderer's family figures (reflex-site scripts/render_flows.py
//           — root <svg data-gfflow="1">, a card per step <g data-step="id">,
//           an edge per <g data-edge="from->to">). The walk comes from the
//           sibling <file>.walk.json; the panel shows each step's IN / OUT
//           (captured payloads, an "illustrative · planned" chip where the
//           surface is not live). Both the desktop swimlane and the 390 px card
//           list (<source media> in the <picture>) are inlined and walked
//           together; CSS shows the one that fits. Reader-started: no autoplay
//           (§2: the step-through is the one allowed animation and the reader
//           starts it). The page's <details data-walk-static> fallback is
//           hidden once the walk mounts.
//   legacy  a mermaid figure walked by a SIDE-PANEL PLUG-IN that also supplies
//           the steps (mermaid node / edge ids) — the arena's Tetris rulebook
//           figures (flow_walk_tetris.js) until Plan 620 P2 moves them.
//
// Side panels are plug-ins: <figure data-walk-panel="NAME"> loads
// ./flow_walk_NAME.js, which calls registerPanel(NAME, plugin). A plugin's
// walk(name) returns the legacy config, or null to keep the figure static.
//
// Styles: the widget's default chrome is injected once, every rule wrapped in
// :where() (zero specificity) so a page's own .fw-* rules (the arena's
// arena.css) always win; colours are family tokens resolved at paint time.
// prefers-reduced-motion: no pulse, no dash animation, no autoplay.

const STEP_MS = 3000;
const PANELS = new Map();

export function registerPanel(name, plugin) {
  PANELS.set(name, plugin);
}

// legacy (mermaid) highlight: a lighter accent tint over an accent-washed fill
const C = {
  hiStroke: "color-mix(in srgb, var(--accent) 62%, #fff)",
  hiFill: "color-mix(in srgb, var(--accent) 18%, var(--surface-2))",
};

const STYLE = `
:where(.fw-controls){display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px}
:where(.fw-btn){border:1px solid var(--line-2);background:var(--surface);color:var(--text);border-radius:8px;min-width:42px;height:40px;padding:0 12px;font:500 15px/1 var(--sans);cursor:pointer}
:where(.fw-btn:hover){border-color:var(--accent);color:var(--accent)}
:where(.fw-btn.fw-playing){background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
:where(.fw-dots){display:inline-flex;gap:8px;align-items:center;margin:0 4px;flex-wrap:wrap}
:where(.fw-dot){width:13px;height:13px;border-radius:50%;padding:0;border:1px solid var(--muted);background:transparent;cursor:pointer}
:where(.fw-dot.fw-done){background:color-mix(in srgb,var(--accent) 40%,transparent);border-color:var(--accent)}
:where(.fw-dot[aria-current="step"]){background:var(--accent);border-color:var(--accent)}
:where(.fw-count){color:var(--muted);font:500 13px var(--mono);font-variant-numeric:tabular-nums}
:where(.fw-step){max-width:52rem;margin:12px auto 0;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:12px 16px 14px;font-size:15px;color:var(--text-2);line-height:1.55}
:where(.fw-step .fw-step-title){color:var(--accent);display:block;margin-bottom:4px}
:where(.fw-step .fw-step-text){margin:0}
:where(.fw-illu){display:inline-block;margin-left:8px;padding:0 9px;border:1px dashed var(--muted);border-radius:999px;color:var(--muted);font:500 13px/1.7 var(--mono);vertical-align:1px}
:where(.fw-io){margin-top:10px}
:where(.fw-io-h){margin:10px 0 4px;font:600 13px/1.4 var(--mono);letter-spacing:.06em;color:var(--muted)}
:where(.fw-io-h b){color:var(--text)}
:where(.fw-io pre.gf-code){margin:0;max-height:16rem;overflow:auto;font-size:13px;line-height:1.5;color:var(--text-2)}
:where(.fw-io-from){margin:4px 0 0;font:400 12px/1.5 var(--mono);color:var(--faint)}
:where(.gfw-stage){overflow-x:auto;overscroll-behavior-x:contain}
:where(.gfw-stage svg){display:block;width:100%;height:auto;margin-inline:auto}
:where(.gfw-mob){display:none}
@media (max-width:720px){
  :where(.gfw-has-mob .gfw-desk){display:none}
  :where(.gfw-has-mob .gfw-mob){display:block;max-height:68vh;overflow-y:auto;overscroll-behavior:contain}
}
svg[data-gfflow].fw-on [data-step],svg[data-gfflow].fw-on [data-edge]{transition:opacity .45s ease}
svg[data-gfflow].fw-on [data-step]:not(.fw-active){opacity:.35}
svg[data-gfflow].fw-on [data-step].fw-done{opacity:.66}
svg[data-gfflow].fw-on [data-edge]:not(.fw-edge-active){opacity:.22}
svg[data-gfflow] [data-edge].fw-edge-active path{animation:gfw-dash 1.1s linear infinite}
svg[data-gfflow] [data-step].fw-active{animation:gfw-pulse 1.8s ease-in-out infinite}
@keyframes gfw-dash{to{stroke-dashoffset:-24}}
@keyframes gfw-pulse{0%,100%{filter:drop-shadow(0 0 2px var(--gfw-glow,transparent))}50%{filter:drop-shadow(0 0 9px var(--gfw-glow,transparent))}}
@media (prefers-reduced-motion:reduce){svg[data-gfflow] [data-edge].fw-edge-active path,svg[data-gfflow] [data-step].fw-active{animation:none}}
`;

function injectStyle() {
  if (document.getElementById("gf-flow-walk-style")) return;
  const s = document.createElement("style");
  s.id = "gf-flow-walk-style";
  s.textContent = STYLE;
  // first in <head>: page stylesheets come later and win on equal footing
  document.head.prepend(s);
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── colour helpers (gfflow highlight = a lighter tint of the lane colour) ──

function hexMix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, "0")).join("");
}

// ── highlighters: apply(cur) paints step `cur` (−1 = intro, nothing lit) ──

function mermaidHighlighter(svg, svgId, steps) {
  const nodeId = (suffix) => svg.querySelector("#" + CSS.escape(svgId + "-" + suffix));
  const edgePath = (id) => svg.querySelector("#" + CSS.escape(svgId + "-" + id));
  const edgeLabel = (id) => {
    const label = svg.querySelector('g.label[data-id="' + id + '"]');
    return label ? label.closest(".edgeLabel") : null;
  };
  const firstSeen = new Map();
  steps.forEach((s, i) => s.nodes.forEach((n) => {
    if (!firstSeen.has(n)) firstSeen.set(n, i);
  }));
  function clearInline(node) {
    node.style.stroke = "";
    node.style.strokeWidth = "";
    node.style.fill = "";
    node.style.strokeDasharray = "";
  }
  return (cur) => {
    svg.classList.toggle("fw-on", cur >= 0);
    svg.querySelectorAll(".fw-active").forEach((n) => {
      n.classList.remove("fw-active");
      n.querySelectorAll("rect").forEach(clearInline);
    });
    svg.querySelectorAll(".fw-edge-active").forEach((n) => {
      n.classList.remove("fw-edge-active");
      if (n.tagName === "path") clearInline(n);
      else n.querySelectorAll("p, span, text").forEach((t) => { t.style.color = ""; t.style.fill = ""; });
    });
    if (cur >= 0) {
      const step = steps[cur];
      for (const n of step.nodes) {
        const g = nodeId(n);
        if (!g) continue;
        g.classList.add("fw-active");
        g.querySelectorAll("rect").forEach((r) => {
          r.style.stroke = C.hiStroke;
          r.style.strokeWidth = "2.5px";
          r.style.fill = C.hiFill;
        });
      }
      for (const e of step.edges || []) {
        const p = edgePath(e);
        if (p) {
          p.classList.add("fw-edge-active");
          p.style.stroke = C.hiStroke;
          p.style.strokeWidth = "2.5px";
          p.style.strokeDasharray = "7 5";
        }
        const lab = edgeLabel(e);
        if (lab && lab.querySelector("p, text")) {
          lab.classList.add("fw-edge-active");
          lab.querySelectorAll("p, span, text").forEach((t) => {
            t.style.color = C.hiStroke;
            t.style.fill = C.hiStroke;
          });
        }
      }
    }
    svg.querySelectorAll("g.node").forEach((g) => g.classList.remove("fw-done"));
    if (cur >= 0) {
      for (const [suffix, first] of firstSeen) {
        if (first >= cur) continue;
        if ((steps[cur].nodes || []).includes(suffix)) continue;
        const g = nodeId(suffix);
        if (g) g.classList.add("fw-done");
      }
    }
  };
}

function gfflowHighlighter(svgs, data, scrollBox) {
  const surface = "#161a23"; // --surface: the card ground the tint washes over
  const sel = (attr, id) => "[" + attr + '="' + CSS.escape(id) + '"]';
  const reset = (svg) => {
    svg.querySelectorAll("[data-step].fw-active, [data-step].fw-done").forEach((g) => {
      g.classList.remove("fw-active", "fw-done");
      g.style.removeProperty("--gfw-glow");
      const r = g.querySelector("rect.gf-cb");
      if (r) { r.style.fill = ""; r.style.stroke = ""; r.style.strokeWidth = ""; r.style.strokeOpacity = ""; }
    });
    svg.querySelectorAll("[data-edge].fw-edge-active").forEach((g) => {
      g.classList.remove("fw-edge-active");
      g.querySelectorAll("path").forEach((p) => { p.style.stroke = ""; p.style.strokeWidth = ""; p.style.strokeDasharray = ""; });
      g.querySelectorAll("text").forEach((t) => { t.style.fill = ""; });
    });
  };
  return (cur) => {
    for (const svg of svgs) {
      svg.classList.toggle("fw-on", cur >= 0);
      reset(svg);
      if (cur < 0) continue;
      const w = data.walk[cur];
      for (const id of w.steps) {
        const color = data.steps[id]?.color || data.accent;
        for (const g of svg.querySelectorAll(sel("data-step", id))) {
          g.classList.add("fw-active");
          g.style.setProperty("--gfw-glow", color + "99");
          const r = g.querySelector("rect.gf-cb");
          if (r) {
            r.style.fill = hexMix(surface, color, 0.2);
            r.style.stroke = hexMix(color, "#ffffff", 0.35);
            r.style.strokeWidth = "2.5px";
            r.style.strokeOpacity = "1";
          }
        }
      }
      const seen = new Set(data.walk.slice(0, cur).flatMap((x) => x.steps));
      for (const id of seen) {
        if (w.steps.includes(id)) continue;
        svg.querySelectorAll(sel("data-step", id)).forEach((g) => g.classList.add("fw-done"));
      }
      for (const eid of w.edges || []) {
        for (const g of svg.querySelectorAll(sel("data-edge", eid))) {
          g.classList.add("fw-edge-active");
          g.querySelectorAll("path").forEach((p) => {
            p.style.stroke = data.accent;
            p.style.strokeWidth = "2.4px";
            p.style.strokeDasharray = "7 5";
          });
          g.querySelectorAll("text").forEach((t) => { t.style.fill = data.accent; });
        }
      }
    }
    // the card list scrolls inside its own box: keep the lit card in view
    if (cur >= 0 && scrollBox && scrollBox.offsetParent) {
      const g = scrollBox.querySelector(sel("data-step", data.walk[cur].steps[0]));
      if (g) {
        const top = scrollBox.scrollTop + g.getBoundingClientRect().top - scrollBox.getBoundingClientRect().top - 12;
        scrollBox.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" });
      }
    }
  };
}

// ── the shared widget ──────────────────────────────────────────────────────
// cfg: { steps[{title, text}], intro, autoplay, highlight(cur),
//        label(cur)?, side(host, cur)?, io(host, cur)?, illustrative(cur)? }

function mountWalk(figure, stage, cfg) {
  let sideCol = null;
  if (cfg.side) {
    const cols = el("div", "fw-cols");
    sideCol = el("div", "fw-board");
    cols.append(stage, sideCol);
    figure.append(cols);
  } else {
    figure.append(stage);
  }

  const controls = el("div", "fw-controls");
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Flow playback controls");
  const btn = (cls, text, label) => {
    const b = el("button", cls, text);
    b.type = "button";
    b.setAttribute("aria-label", label);
    return b;
  };
  const bRestart = btn("fw-btn", "↺", "Restart from the first step");
  bRestart.title = "Restart from the first step";
  const bPrev = btn("fw-btn", "◀", "Previous step");
  const bToggle = btn("fw-btn fw-toggle", "play", "Play");
  const bNext = btn("fw-btn", "▶", "Next step");
  const dots = el("span", "fw-dots");
  const n = cfg.steps.length;
  const dotEls = cfg.steps.map((s, i) => {
    const d = btn("fw-dot", null, "Step " + (i + 1) + ": " + s.title);
    d.addEventListener("click", () => { pause(); go(i); });
    dots.appendChild(d);
    return d;
  });
  const count = el("span", "fw-count");
  controls.append(bRestart, bPrev, bToggle, bNext, dots, count);

  const panel = el("div", "fw-step");
  panel.setAttribute("role", "status");
  const pTitle = el("b", "fw-step-title");
  const pText = el("p", "fw-step-text");
  panel.append(pTitle, pText);
  let ioBox = null;
  if (cfg.io) {
    ioBox = el("div", "fw-io");
    panel.append(ioBox);
  }

  let cur = -1; // -1 = intro: nothing highlighted yet
  let playing = false;
  let timer = null;
  const label = cfg.label || ((i) => String(i + 1));

  function apply() {
    cfg.highlight(cur);
    pTitle.textContent = cur >= 0 ? label(cur) + " · " + cfg.steps[cur].title : "How to read this figure";
    if (cur >= 0 && cfg.illustrative?.(cur)) pTitle.append(el("span", "fw-illu", "○ illustrative · planned"));
    pText.textContent = cur >= 0 ? cfg.steps[cur].text : cfg.intro;
    count.textContent = cur >= 0 ? "step " + (cur + 1) + " / " + n : "0 / " + n;
    dotEls.forEach((d, i) => {
      if (i === cur) d.setAttribute("aria-current", "step");
      else d.removeAttribute("aria-current");
      d.classList.toggle("fw-done", cur >= 0 && i < cur);
    });
    if (sideCol) cfg.side(sideCol, cur);
    if (ioBox) cfg.io(ioBox, cur);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!playing) return;
      if (cur + 1 < n) {
        cur += 1;
        apply();
        schedule();
      } else {
        playing = false;
        syncToggle();
      }
    }, STEP_MS);
  }
  function syncToggle() {
    bToggle.textContent = playing ? "pause" : "play";
    bToggle.setAttribute("aria-label", playing ? "Pause" : "Play");
    bToggle.classList.toggle("fw-playing", playing);
  }
  function play() {
    if (playing) return;
    if (cur >= n - 1) cur = -1; // at the end: play = replay
    playing = true;
    syncToggle();
    if (cur < 0) { cur = 0; apply(); }
    schedule();
  }
  function pause() {
    playing = false;
    clearTimeout(timer);
    syncToggle();
  }
  function go(i) {
    cur = Math.max(0, Math.min(n - 1, i));
    apply();
  }

  bRestart.addEventListener("click", () => { pause(); cur = 0; apply(); play(); });
  bPrev.addEventListener("click", () => { pause(); if (cur >= 0) go(cur - 1); });
  bNext.addEventListener("click", () => { pause(); go(cur + 1); });
  bToggle.addEventListener("click", () => (playing ? pause() : play()));

  figure.append(controls, panel);
  apply();

  if (cfg.autoplay && !reducedMotion()) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            io.disconnect();
            play();
          }
        }
      },
      { threshold: 0.35 },
    );
    io.observe(figure);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
}

// ── loading ───────────────────────────────────────────────────────────────

async function fetchSvg(src) {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error("fetch " + src + " → " + resp.status);
  const holder = document.createElement("div");
  holder.innerHTML = await resp.text();
  const svg = holder.querySelector("svg");
  if (!svg) throw new Error("no <svg> in " + src);
  return svg;
}

async function loadPanel(name) {
  if (!/^[a-z0-9_-]+$/.test(name)) throw new Error("bad panel name " + name);
  if (!PANELS.has(name)) await import("./flow_walk_" + name + ".js");
  const p = PANELS.get(name);
  if (!p) throw new Error("panel " + name + " did not register");
  return p;
}

function renderIO(host, w) {
  host.replaceChildren();
  for (const [key, head] of [["in", "IN"], ["out", "OUT"]]) {
    const spec = w[key];
    if (!spec) continue;
    const h = el("p", "fw-io-h");
    h.append(el("b", null, head));
    if (spec.label) h.append(" · " + spec.label);
    const pre = el("pre", "gf-code");
    pre.textContent = spec.body;
    host.append(h, pre);
    if (spec.from) host.append(el("p", "fw-io-from", spec.from));
  }
}

async function setupGfflow(figure, src) {
  const walkUrl = src.replace(/\.svg$/, ".walk.json");
  const resp = await fetch(walkUrl);
  if (!resp.ok) throw new Error("fetch " + walkUrl + " → " + resp.status);
  const data = await resp.json();
  if (data.gfflow_walk !== 1 || !Array.isArray(data.walk) || !data.walk.length) throw new Error(walkUrl + ": not a gfflow walk");
  const picture = figure.querySelector("picture");
  const mobSrc = picture?.querySelector("source")?.getAttribute("srcset")?.split(/\s+/)[0];
  const desk = await fetchSvg(src);
  const mob = mobSrc ? await fetchSvg(mobSrc) : null;
  for (const svg of [desk, mob]) if (svg && svg.getAttribute("data-gfflow") !== "1") throw new Error("not a gfflow svg");

  const stage = el("div", "fw-stage gfw-stage" + (mob ? " gfw-has-mob" : ""));
  const deskBox = el("div", "gfw-desk");
  desk.style.maxWidth = desk.getAttribute("width") + "px";
  deskBox.append(desk);
  stage.append(deskBox);
  let mobBox = null;
  if (mob) {
    mobBox = el("div", "gfw-mob");
    mob.style.maxWidth = mob.getAttribute("width") + "px";
    mobBox.append(mob);
    stage.append(mobBox);
  }
  const img = figure.querySelector("img");
  (picture ?? img).replaceWith(stage);
  // the caption stays last: the controls + panel sit between figure and caption
  const caption = figure.querySelector(":scope > figcaption");
  mountWalk(figure, stage, {
    steps: data.walk,
    intro: data.intro,
    autoplay: false,
    highlight: gfflowHighlighter([desk, mob].filter(Boolean), data, mobBox),
    label: (i) => data.walk[i].steps.map((id) => data.steps[id]?.n ?? id).join(" · "),
    illustrative: (i) => !!data.walk[i].illustrative,
    io: (host, i) => (i >= 0 ? renderIO(host, data.walk[i]) : host.replaceChildren()),
  });
  if (caption) figure.append(caption);
  const name = src.split("/").pop();
  document.querySelector('details[data-walk-static="' + CSS.escape(name) + '"]')?.setAttribute("hidden", "");
}

async function setupLegacy(figure, src, panelName) {
  const name = src.split("/").pop();
  const img = figure.querySelector('img[src$="/' + name + '"]');
  if (!img) return;
  const plugin = await loadPanel(panelName);
  const cfg = await plugin.walk(name, figure);
  if (!cfg) return; // the plugin keeps this figure static
  const svg = await fetchSvg(img.getAttribute("src"));
  if (!svg.id) throw new Error(name + ": svg has no id");
  svg.style.maxWidth = ""; // mermaid inlines its own; page CSS owns sizing
  const stage = el("div", "fw-stage");
  stage.appendChild(svg);
  // the <img> sits in a .fig-x scroll wrapper; .fw-stage takes over that job
  (img.closest(".fig-x") ?? img).replaceWith(stage);
  mountWalk(figure, stage, {
    steps: cfg.steps,
    intro: cfg.intro,
    autoplay: cfg.autoplay,
    highlight: mermaidHighlighter(svg, svg.id, cfg.steps),
    side: cfg.renderSide ? (host, cur) => cfg.renderSide(host, cur) : null,
  });
}

async function boot() {
  injectStyle();
  for (const figure of document.querySelectorAll("figure[data-walk]")) {
    const src = figure.getAttribute("data-walk") || "";
    const panelName = figure.getAttribute("data-walk-panel");
    try {
      if (panelName) await setupLegacy(figure, src, panelName);
      else await setupGfflow(figure, src);
    } catch (err) {
      console.warn("[flow-walk] " + src.split("/").pop() + " stays static:", err.message);
    }
  }
}

// after the module graph evaluates: a statically imported plug-in has
// registered by then
queueMicrotask(boot);

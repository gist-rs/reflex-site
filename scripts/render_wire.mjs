// Render data/wire.json (captured by scripts/capture_wire.mjs from the
// release binary) into the served pages' marker blocks — never type a wire
// example by hand.
//
//   node scripts/render_wire.mjs          # rewrite the blocks in place
//   node scripts/render_wire.mjs --check  # exit 1 if any page is stale
//
// Markers (an unknown case name or an unclosed marker is a hard failure):
//   <!-- wire:case NAME -->…<!-- /wire:case -->  request pane + response pane
//   <!-- wire:version -->…<!-- /wire:version -->  "engine reflex X.Y.Z · release notes"
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PAGES = ["index.html", "playground/index.html", "arena/index.html", "bench/index.html", "resources/index.html", "docs/api/index.html", "404.html"];
const ENGINE = "http://127.0.0.1:7331"; // the documented default bind
const CHECK = process.argv.includes("--check");

const wire = JSON.parse(readFileSync(path.join(ROOT, "data/wire.json"), "utf8"));
const { _meta: meta, cases } = wire;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Compact-pretty JSON: a value stays on one line while it fits, so an answer
// row reads as one line. Numbers go through JSON.stringify, which reproduces
// the engine's own numerals — asserted per response below.
const WIDTH = 78;
// A number is kept as its SOURCE text (JSON.parse's reviver context), so the
// engine's `1.0` stays `1.0` instead of becoming JavaScript's `1`.
class Num {
  constructor(src) {
    this.src = src;
  }
}
const isNode = (v) => v !== null && typeof v === "object" && !(v instanceof Num);
function inline(v, sep = ", ", col = ": ") {
  if (v instanceof Num) return v.src;
  if (Array.isArray(v)) return `[${v.map((x) => inline(x, sep, col)).join(sep)}]`;
  if (isNode(v)) return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}${col}${inline(x, sep, col)}`).join(sep)}}`;
  return JSON.stringify(v);
}
// `lead` is everything already on the line before the value (indent + key),
// so a value fits only if the WHOLE line does.
function pretty(v, ind = "", lead = 0) {
  const one = inline(v);
  if (lead + one.length <= WIDTH || !isNode(v)) return one;
  const inner = ind + "  ";
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + pretty(x, inner, inner.length)).join(",\n")}\n${ind}]`;
  return `{\n${Object.entries(v)
    .map(([k, x]) => {
      const key = `${inner}${JSON.stringify(k)}: `;
      return key + pretty(x, inner, key.length);
    })
    .join(",\n")}\n${ind}}`;
}
function prettyBody(raw, where) {
  let v;
  try {
    v = JSON.parse(raw, (_k, x, ctx) => (typeof x === "number" ? new Num(ctx.source) : x));
  } catch {
    return raw; // a non-JSON body is shown verbatim
  }
  if (inline(v, ",", ":") !== raw) throw new Error(`${where}: re-serialising changes the engine's bytes — refusing to reformat`);
  return pretty(v);
}

const shq = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

function curl(c) {
  if (c.request_meta?.declared_content_length) {
    return `# a ${c.method} ${c.path} whose Content-Length header declares ${c.request_meta.declared_content_length} bytes`;
  }
  const parts = [`curl -s${c.method === "GET" ? "" : ` -X ${c.method}`} ${ENGINE}${c.path}`];
  if (c.request !== undefined) parts.push(`-H 'Content-Type: application/json'`);
  for (const [k, v] of Object.entries(c.headers ?? {})) parts.push(`-H ${shq(`${k}: ${v}`)}`);
  if (c.request !== undefined) {
    let body;
    try {
      body = prettyBody(c.request, "request");
    } catch {
      body = c.request;
    }
    parts.push(`-d ${shq(body)}`);
  }
  return parts.join(" \\\n  ");
}

function casePair(name) {
  const c = cases[name];
  if (!c) throw new Error(`unknown wire case ${JSON.stringify(name)} (data/wire.json has: ${Object.keys(cases).join(", ")})`);
  const req = curl(c);
  const res = prettyBody(c.response, name);
  const copy = c.request_meta ? "" : `<button data-copy="${esc(req)}">copy</button>`;
  return (
    `<div class="wire-pair" data-wire-case="${name}">` +
    `<div class="wire-pane"><div class="wire-h">Request${copy}</div><pre><code>${esc(req)}</code></pre></div>` +
    `<div class="wire-pane"><div class="wire-h">Response · HTTP ${c.status}</div><pre><code>${esc(res)}</code></pre></div>` +
    `</div>`
  );
}

// data-wire-version marks the stamp as a release IDENTIFIER, not a measured
// figure — the resources page's digit-free numbers law skips exactly it.
const version = `<span data-wire-version>engine <a href="${esc(meta.release_notes)}">${esc(meta.engine)} · release notes</a></span>`;

function render(html, page) {
  let out = html.replace(/<!-- wire:case ([a-z_]+) -->[\s\S]*?<!-- \/wire:case -->/g, (_, n) => `<!-- wire:case ${n} -->${casePair(n)}<!-- /wire:case -->`);
  out = out.replace(/<!-- wire:version -->[\s\S]*?<!-- \/wire:version -->/g, `<!-- wire:version -->${version}<!-- /wire:version -->`);
  const opens = (out.match(/<!-- wire:(case [a-z_]+|version) -->/g) ?? []).length;
  const closes = (out.match(/<!-- \/wire:(case|version) -->/g) ?? []).length;
  if (opens !== closes) throw new Error(`${page}: ${opens} wire markers opened, ${closes} closed`);
  if (!/<!-- wire:version -->/.test(out)) throw new Error(`${page}: no <!-- wire:version --> marker in the footer`);
  return out;
}

let stale = 0;
for (const page of PAGES) {
  const p = path.join(ROOT, page);
  const before = readFileSync(p, "utf8");
  const after = render(before, page);
  if (after === before) continue;
  stale += 1;
  if (CHECK) console.error(`render_wire: STALE — ${page} differs from data/wire.json (run node scripts/render_wire.mjs)`);
  else writeFileSync(p, after);
}
if (CHECK && stale) process.exit(1);
console.log(`render_wire: ${CHECK ? "check" : "render"} OK — ${PAGES.length} pages, ${meta.engine}${CHECK ? "" : `, ${stale} rewritten`}`);

/* gist-family v1 — code highlighter. SOURCE OF TRUTH:
 * riir-ai/.docs/13_web_family/family_hl.js; every site carries a
 * byte-identical copy (web_family_gate.mjs S3). Zero deps, one linear regex
 * pass, never changes the text (S3 round-trips it). Colours: the --hl-*
 * tokens + .hl-* classes in family.css.
 *   static : every <pre><code> and .cmd>code is coloured on load;
 *            language from data-lang="json|sh|off", else sniffed
 *            ({ or [ first -> json, otherwise sh)
 *   runtime: gfHl.el(node, lang?) after setting node.textContent;
 *            gfHl.html(text, lang?) -> escaped, coloured HTML string
 */
(function (g) {
  "use strict";
  var E = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return E[c]; }); }
  function sp(c, s) { return '<span class="hl-' + c + '">' + esc(s) + "</span>"; }

  // JSON: "string"(key if a colon follows) | number | literal | punctuation
  var JR = /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;
  function json(t) {
    var o = "", i = 0, m;
    JR.lastIndex = 0;
    while ((m = JR.exec(t))) {
      o += esc(t.slice(i, m.index));
      o += m[1] ? (m[2] ? sp("k", m[1]) + sp("p", m[2]) : sp("s", m[1]))
        : m[3] ? sp("n", m[3]) : m[4] ? sp("l", m[4]) : sp("p", m[5]);
      i = JR.lastIndex;
    }
    return o + esc(t.slice(i));
  }

  // sh: newline | \<newline> | 'single' | "double" | $VAR | operator | word
  var SR = /(\n)|(\\\n)|('[^']*'?)|("(?:[^"\\]|\\.)*"?)|(\$\{?\w+\}?)|(&&|\|\||[|;])|([^\s'"$|;&\\]+|[$&\\])/g;
  function sh(t) {
    var o = "", i = 0, m, head = true, w, q, eq;
    SR.lastIndex = 0;
    while ((m = SR.exec(t))) {
      var gap = t.slice(i, m.index), lead = gap.length > 0 || m.index === 0 || t[m.index - 1] === "\n";
      o += esc(gap);
      i = SR.lastIndex;
      if (m[1]) { o += m[1]; head = true; continue; }
      if (m[2]) { o += sp("p", "\\") + "\n"; continue; }
      if (m[3]) {
        q = m[3]; w = q.slice(1, q.length > 1 && q[q.length - 1] === "'" ? -1 : undefined);
        o += /^\s*[{[]/.test(w)
          ? sp("p", "'") + json(w) + (q.length > w.length + 1 ? sp("p", "'") : "")
          : sp("s", q);
        head = false; continue;
      }
      if (m[4]) { o += sp("s", m[4]); head = false; continue; }
      if (m[5]) { o += sp("v", m[5]); head = false; continue; }
      if (m[6]) { o += sp("p", m[6]); head = true; continue; }
      w = m[7];
      if (lead && w[0] === "#") { // comment to end of line
        var nl = t.indexOf("\n", m.index); if (nl < 0) nl = t.length;
        o += sp("m", t.slice(m.index, nl)); i = SR.lastIndex = nl; continue;
      }
      eq = head ? /^([A-Za-z_]\w*)=/.exec(w) : null;
      if (eq) { o += sp("v", eq[1]) + sp("p", "=") + esc(w.slice(eq[0].length)); continue; }
      if (head) { o += sp("c", w); head = false; continue; }
      o += lead && w[0] === "-" ? sp("f", w) : esc(w);
    }
    return o + esc(t.slice(i));
  }

  function sniff(t) { return /^\s*[{[]/.test(t) ? "json" : "sh"; }
  function html(t, lang) {
    lang = lang || sniff(t);
    return lang === "json" ? json(t) : lang === "sh" ? sh(t) : esc(t);
  }
  // One wrapping span keeps a flex/grid <code> container to a single item.
  function el(n, lang) {
    if (!n) return;
    lang = lang || n.getAttribute("data-lang");
    if (lang === "off") return;
    n.innerHTML = '<span class="hl">' + html(n.textContent, lang) + "</span>";
  }
  function all(root) {
    var ns = (root || document).querySelectorAll("pre>code,.cmd>code");
    for (var k = 0; k < ns.length; k++) el(ns[k]);
  }

  g.gfHl = { html: html, el: el, all: all };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { all(); });
    else all();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

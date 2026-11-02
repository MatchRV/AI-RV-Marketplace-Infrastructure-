import { Router, type IRouter, type Request, type Response } from "express";

/**
 * GET /ops/leads — private MatchRV lead inbox (buyer inquiries).
 *
 * A single self-contained page. It holds no data itself: it asks for the
 * INQUIRY_OPS_KEY once, keeps it in sessionStorage (never in the URL, never in
 * localStorage), and reads GET /api/inquiries/ops with a Bearer header. Every
 * value from an inquiry is rendered with textContent, never innerHTML, because
 * shopper names and messages are untrusted input.
 */
export const OPS_LEADS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<title>MatchRV lead inbox</title>
<style>
  body { font: 15px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f4f7f7; color: #0b1117; }
  header { background: #0b1117; color: #fff; padding: 14px 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  header h1 { font-size: 18px; margin: 0; flex: 1; }
  button { font: inherit; border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer; background: #00696b; color: #fff; }
  button.secondary { background: #e2e8f0; color: #0b1117; }
  main { max-width: 980px; margin: 0 auto; padding: 16px; }
  #login { background: #fff; border-radius: 12px; padding: 20px; max-width: 460px; margin: 40px auto; }
  #login input { width: 100%; box-sizing: border-box; font: inherit; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px; margin: 8px 0 12px; }
  .lead { background: #fff; border-radius: 12px; padding: 16px; margin: 0 0 14px; border-left: 6px solid #00696b; }
  .lead.test { border-left-color: #b45309; background: #fffbeb; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .badge { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #e2e8f0; }
  .badge.test { background: #b45309; color: #fff; }
  .badge.queued_for_matchrv { background: #fde68a; }
  .badge.delivered { background: #bbf7d0; }
  .badge.failed { background: #fecaca; }
  h2 { font-size: 16px; margin: 8px 0 4px; }
  dl { display: grid; grid-template-columns: 130px 1fr; gap: 2px 10px; margin: 8px 0; }
  dt { color: #3b4949; font-weight: 600; }
  dd { margin: 0; word-break: break-word; }
  .msg { white-space: pre-wrap; background: #f4f7f7; border-radius: 8px; padding: 10px; margin: 8px 0; }
  .fwd { border-top: 1px dashed #cbd5e1; margin-top: 10px; padding-top: 10px; }
  .muted { color: #5b6b6b; font-size: 13px; }
  #error { color: #b91c1c; }
</style>
</head>
<body>
<header>
  <h1>MatchRV lead inbox</h1>
  <span id="count" class="muted" style="color:#cbd5e1"></span>
  <button id="refresh" class="secondary" hidden>Refresh</button>
  <button id="logout" class="secondary" hidden>Forget key</button>
</header>
<main>
  <form id="login" hidden>
    <strong>Enter the ops key</strong>
    <div class="muted">Kept only in this browser tab (sessionStorage) and sent as an Authorization header. Closing the tab forgets it.</div>
    <input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="Ops key">
    <button type="submit">Open leads</button>
    <p id="error" role="alert"></p>
  </form>
  <div id="list"></div>
</main>
<script>
(function () {
  "use strict";
  var KEY = "matchrv_ops_key";
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]); }
    if (text != null) n.textContent = String(text);
    return n;
  }
  function isTest(i) {
    var name = (i.preview && i.preview.shopper && i.preview.shopper.name) || "";
    return i.dryRun === true || i.status === "dry_run" || i.test === true || /\\bTEST\\b/.test(name);
  }
  function fmtPrice(v) { return typeof v === "number" ? "$" + v.toLocaleString() : "n/a"; }
  function fmtTime(s) { try { return new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZoneName: "short" }); } catch (e) { return s; } }
  function addRow(dl, label, value, href) {
    dl.appendChild(el("dt", null, label));
    var dd = el("dd");
    if (href) { var a = el("a", { href: href, target: "_blank", rel: "noopener noreferrer" }, value); dd.appendChild(a); }
    else dd.textContent = value == null || value === "" ? "-" : String(value);
    dl.appendChild(dd);
  }
  function safeHref(u) { return typeof u === "string" && /^https?:\\/\\//i.test(u) ? u : null; }
  function forwardText(i) {
    var p = i.preview, s = p.shopper, u = p.unit, d = p.dealer;
    return [
      "To: " + d.name + " (" + d.city + ", " + d.state + ")" + (d.website ? " " + d.website : ""),
      "Subject: MatchRV shopper inquiry: " + u.title + " (stock " + (u.stockNumber || "n/a") + ")",
      "",
      "A shopper asked about this RV through MatchRV (ref " + i.id + ").",
      "RV: " + u.title,
      "Stock #: " + (u.stockNumber || "n/a") + "   VIN: " + (u.vin || "n/a") + "   Listed price: " + fmtPrice(u.priceUsd),
      "",
      "Shopper: " + s.name, "Email: " + (s.email || "-"), "Phone: " + (s.phone || "-"),
      "",
      "Message:", p.message
    ].join("\\n");
  }
  function render(list) {
    var root = $("list"); root.textContent = "";
    $("count").textContent = list.length + (list.length === 1 ? " lead" : " leads") + " · newest first";
    if (!list.length) { root.appendChild(el("p", { class: "muted" }, "No leads yet. Leads are kept for 90 days.")); return; }
    list.forEach(function (i) {
      var test = isTest(i);
      var p = i.preview || {}, s = p.shopper || {}, u = p.unit || {}, d = p.dealer || {};
      var card = el("article", { class: "lead" + (test ? " test" : ""), "data-id": i.id });
      var top = el("div", { class: "row" });
      if (test) top.appendChild(el("span", { class: "badge test" }, i.dryRun ? "TEST · dry run" : "TEST · do not forward"));
      top.appendChild(el("span", { class: "badge " + i.status }, String(i.status).replace(/_/g, " ")));
      top.appendChild(el("span", { class: "muted" }, fmtTime(i.createdAt) + " · " + i.id));
      card.appendChild(top);
      card.appendChild(el("h2", null, u.title || "(unit)"));
      var dl = el("dl");
      addRow(dl, "Shopper", s.name);
      addRow(dl, "Email", s.email, s.email ? "mailto:" + s.email : null);
      addRow(dl, "Phone", s.phone, s.phone ? "tel:" + String(s.phone).replace(/[^0-9+]/g, "") : null);
      addRow(dl, "Dealer", [d.name, [d.city, d.state].filter(Boolean).join(", ")].filter(Boolean).join(" — "));
      addRow(dl, "Dealer site", d.website, safeHref(d.website));
      addRow(dl, "Stock / VIN", (u.stockNumber || "n/a") + " / " + (u.vin || "n/a"));
      addRow(dl, "Listed price", fmtPrice(u.priceUsd));
      addRow(dl, "Listing", u.stockUrl ? "Dealer page" : null, safeHref(u.stockUrl));
      addRow(dl, "Delivery", (i.delivery && i.delivery.channel) || "-");
      addRow(dl, "Status note", i.statusDetail);
      if (i.dealerReply) addRow(dl, "Dealer reply", i.dealerReply.text);
      card.appendChild(dl);
      card.appendChild(el("div", { class: "msg" }, p.message || ""));
      if (!test && i.status === "queued_for_matchrv") {
        var fwd = el("div", { class: "fwd" });
        fwd.appendChild(el("strong", null, "Forward to dealer"));
        fwd.appendChild(el("div", { class: "muted" }, "MatchRV has no direct line to this dealer yet. Copy this and send it to the dealer, then reply to the shopper."));
        var pre = el("pre", { class: "msg" }, forwardText(i));
        fwd.appendChild(pre);
        var btn = el("button", { type: "button" }, "Copy forward text");
        btn.addEventListener("click", function () { navigator.clipboard && navigator.clipboard.writeText(pre.textContent).then(function () { btn.textContent = "Copied"; }); });
        fwd.appendChild(btn);
        card.appendChild(fwd);
      } else if (test) {
        card.appendChild(el("p", { class: "muted" }, "Test inquiry from MatchRV. Do not forward to the dealer."));
      }
      root.appendChild(card);
    });
  }
  function showLogin(msg) {
    $("login").hidden = false; $("refresh").hidden = true; $("logout").hidden = true;
    $("list").textContent = ""; $("count").textContent = ""; $("error").textContent = msg || "";
  }
  function load() {
    var key = sessionStorage.getItem(KEY);
    if (!key) { showLogin(""); return; }
    fetch("/api/inquiries/ops", { headers: { Authorization: "Bearer " + key }, cache: "no-store", credentials: "omit" })
      .then(function (r) {
        if (r.status === 401) { sessionStorage.removeItem(KEY); throw new Error("That key was not accepted."); }
        if (r.status === 503) throw new Error("The lead inbox is not configured on the server yet.");
        if (!r.ok) throw new Error("Could not load leads (HTTP " + r.status + ").");
        return r.json();
      })
      .then(function (data) {
        $("login").hidden = true; $("refresh").hidden = false; $("logout").hidden = false;
        render(data.inquiries || []);
      })
      .catch(function (e) { showLogin(e.message); });
  }
  $("login").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = $("key").value.trim(); $("key").value = "";
    if (v) { sessionStorage.setItem(KEY, v); load(); }
  });
  $("refresh").addEventListener("click", load);
  $("logout").addEventListener("click", function () { sessionStorage.removeItem(KEY); showLogin(""); });
  load();
})();
</script>
</body>
</html>
`;

const router: IRouter = Router();
router.get(["/ops/leads", "/ops/leads/"], (_req: Request, res: Response) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  res.type("html").send(OPS_LEADS_HTML);
});

export default router;

/**
 * Server-rendered lead pages. No scripts, no framework.
 *
 *   GET  /lead-receipt/:token          dealer receipt: records "opened", shows this one lead
 *   POST /lead-receipt/:token          dealer outcome: responded | appointment | sold | lost (+ reason)
 *   GET  /ops/leads-dashboard          owner dashboard (LEADS_DASHBOARD_TOKEN)
 *   POST /ops/leads-dashboard/login    form login -> HttpOnly, Secure, SameSite=Strict signed cookie
 *   POST /ops/leads-dashboard/logout
 *   GET  /ops/leads-dashboard.csv      CSV export (?include_contact=1 adds name/email/phone)
 *   GET  /ops/leads-dashboard/api/report               JSON report (Bearer only)
 *   POST /ops/leads-dashboard/api/leads/:id/stage      { stage, reason? } (Bearer only)
 *   POST /ops/leads-dashboard/api/leads/:id/receipt-link  issue/rotate a receipt link, shown once (Bearer only)
 *   POST /ops/leads-dashboard/api/purge-pii            run the LEAD_PII_RETENTION_DAYS purge (Bearer only)
 *
 * Receipt: 404 unless LEAD_TRACKING_ENABLED and the token matches a stored hash.
 * Dashboard: 404 unless LEADS_DASHBOARD_TOKEN is set (>= 24 chars). The secret is
 * accepted only in an Authorization: Bearer header or the login form body, never
 * a URL, and compared in constant time. State-changing JSON routes take the
 * Bearer header only, so a browser cookie can never be ridden cross-site.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { classifyUserAgent } from "../services/bot-detect";
import { DATA_DIR_FROZEN_RETRY_AFTER_SECONDS, isDataDirFrozen } from "../services/data-dir-freeze";
import { buildLeadReport, leadsCsv, type Breakdown } from "../services/lead-report";
import {
  LEAD_STAGES, LOST_REASONS, getLead, issueReceiptToken, leadByReceiptToken, listLeads, purgeLeadPii, recordLeadStage, recordReceiptView,
  type LeadRecord, type LeadStage, type LostReason,
} from "../services/lead-store";
import { dashboardToken, leadTrackingEnabled } from "../services/lead-tracking-config";

const router: IRouter = Router();

export const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function privateHeaders(res: Response): void {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
}

const PAGE_CSS = `body{font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f4f7f7;color:#0b1117}
header{background:#0b1117;color:#fff;padding:14px 20px}header h1{font-size:18px;margin:0}
main{max-width:1100px;margin:0 auto;padding:16px}section{background:#fff;border-radius:12px;padding:16px;margin:0 0 14px}
h2{font-size:16px;margin:0 0 8px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
th{color:#3b4949}td.n,th.n{text-align:right}.muted{color:#5b6b6b;font-size:13px}.err{color:#b91c1c}
button{font:inherit;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;background:#00696b;color:#fff}
input,select{font:inherit;padding:6px;border:2px solid #e2e8f0;border-radius:8px}dl{display:grid;grid-template-columns:170px 1fr;gap:2px 10px}dt{font-weight:600;color:#3b4949}dd{margin:0;word-break:break-word}
.msg{white-space:pre-wrap;background:#f4f7f7;border-radius:8px;padding:10px}.kpis{display:flex;gap:12px;flex-wrap:wrap}.kpi{background:#eef7f7;border-radius:10px;padding:10px 14px;min-width:120px}.kpi b{display:block;font-size:20px}`;

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body><header><h1>${esc(title)}</h1></header><main>${body}</main></body></html>`;

/** Same-origin check for form posts: an Origin (or Referer) header, when present, must name this host. */
export function sameOrigin(req: Request): boolean {
  const host = req.get("host");
  const origin = req.get("origin") ?? req.get("referer");
  if (!origin) return true;
  if (origin === "null") return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

// ── Small fixed-window limiter ─────────────────────────────────────────────

const windows = new Map<string, { n: number; at: number }>();
export function allowHit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || now - w.at > windowMs) {
    if (windows.size > 20_000) windows.clear();
    windows.set(key, { n: 1, at: now });
    return true;
  }
  w.n += 1;
  return w.n <= max;
}
export function __resetLeadPageLimits(): void { windows.clear(); }

// ── Receipt page ───────────────────────────────────────────────────────────

const OUTCOMES: Record<string, LeadStage> = { responded: "dealer_responded", appointment: "appointment", sold: "sold", lost: "lost" };
const REASON_LABELS: Record<LostReason, string> = {
  bought_elsewhere: "Bought elsewhere", unit_sold: "This RV was already sold", no_response_from_shopper: "Shopper did not respond",
  financing: "Financing did not work out", price: "Price", not_a_fit: "Not the right RV", duplicate: "Duplicate of another lead", spam: "Spam / not a real shopper", other: "Other",
};

const csrfFor = (lead: LeadRecord) => createHmac("sha256", lead.receipt!.token_hash).update("receipt-form-v1").digest("base64url");
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toUTCString() : "—");
const money = (n: number | null | undefined) => (typeof n === "number" ? `$${Math.round(n).toLocaleString("en-US")}` : "Price on request");

function receiptBody(lead: LeadRecord, note: string | null): string {
  const c = lead.contact;
  const lc = lead.lifecycle;
  const closed = lc.sold_at ? "sold" : lc.lost_at ? "lost" : null;
  const rows = (pairs: Array<[string, unknown]>) => pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v ?? "—")}</dd>`).join("");
  const form = closed
    ? `<p>This lead is closed as <b>${esc(closed)}</b>${lc.lost_reason ? ` (${esc(REASON_LABELS[lc.lost_reason])})` : ""}. Thank you.</p>`
    : `<form method="post"><input type="hidden" name="csrf" value="${esc(csrfFor(lead))}">
<p><label><input type="radio" name="outcome" value="responded" required> We contacted the shopper</label><br>
<label><input type="radio" name="outcome" value="appointment"> Appointment set</label><br>
<label><input type="radio" name="outcome" value="sold"> Sold to this shopper</label><br>
<label><input type="radio" name="outcome" value="lost"> Lost</label>
<select name="lost_reason"><option value="">Reason (if lost)</option>${LOST_REASONS.map((r) => `<option value="${r}">${esc(REASON_LABELS[r])}</option>`).join("")}</select></p>
<button type="submit">Save outcome</button></form>`;
  return `${note ? `<section><p>${esc(note)}</p></section>` : ""}
<section><h2>${esc(lead.unit.title ?? "RV")}</h2><dl>${rows([
    ["MatchRV ref", lead.inquiry_ids[0]], ["Stock #", lead.unit.stock_number], ["VIN", lead.unit.vin], ["Last listed price", money(lead.unit.price_usd)],
    ["Dealership", lead.dealer.name], ["Sent", fmt(lc.sent_at)],
  ])}</dl></section>
<section><h2>Shopper</h2>${c ? `<dl>${rows([["Name", c.name], ["Email", c.email], ["Phone", c.phone]])}</dl><div class="msg">${esc(c.message ?? "")}</div>` : `<p class="muted">Contact details for this lead are no longer kept by MatchRV.</p>`}</section>
<section><h2>Status</h2><dl>${rows([["Opened", fmt(lc.opened_at)], ["Shopper contacted", fmt(lc.dealer_responded_at)], ["Appointment", fmt(lc.appointment_at)], ["Sold", fmt(lc.sold_at)], ["Lost", fmt(lc.lost_at)]])}</dl>${form}
<p class="muted">This private page is only for the dealership that received this inquiry. It shows nothing about any other lead.</p></section>`;
}

const NOT_FOUND = page("MatchRV lead", `<section><p>This link is not valid.</p></section>`);

router.get("/lead-receipt/:token", (req: Request, res: Response) => {
  privateHeaders(res);
  if (!allowHit(`rv:${req.ip}`, 60, 10 * 60_000)) { res.status(429).type("html").send(page("MatchRV lead", "<section><p>Too many requests. Try again later.</p></section>")); return; }
  const lead = leadByReceiptToken(String(req.params.token));
  if (!lead) { res.status(404).type("html").send(NOT_FOUND); return; }
  // Mail link scanners prefetch links: bot user agents are counted apart and never mark the lead opened.
  if (!isDataDirFrozen()) recordReceiptView(lead, !classifyUserAgent(req.get("user-agent")).is_bot);
  res.type("html").send(page("MatchRV lead receipt", receiptBody(lead, null)));
});

router.post("/lead-receipt/:token", (req: Request, res: Response) => {
  privateHeaders(res);
  const token = String(req.params.token);
  if (!allowHit(`rp:${req.ip}`, 30, 60 * 60_000) || !allowHit(`rt:${createHash("sha256").update(token).digest("hex")}`, 20, 60 * 60_000)) {
    res.status(429).type("html").send(page("MatchRV lead", "<section><p>Too many requests. Try again later.</p></section>"));
    return;
  }
  const lead = leadByReceiptToken(token);
  if (!lead) { res.status(404).type("html").send(NOT_FOUND); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const csrf = typeof body.csrf === "string" ? Buffer.from(body.csrf) : Buffer.alloc(0);
  const expected = Buffer.from(csrfFor(lead));
  if (!sameOrigin(req) || csrf.length !== expected.length || !timingSafeEqual(csrf, expected)) {
    res.status(403).type("html").send(page("MatchRV lead", "<section><p class=\"err\">This form could not be verified. Reload the page and try again.</p></section>"));
    return;
  }
  if (isDataDirFrozen()) {
    res.setHeader("Retry-After", String(DATA_DIR_FROZEN_RETRY_AFTER_SECONDS));
    res.status(503).type("html").send(page("MatchRV lead", "<section><p>MatchRV is briefly not saving changes. Please try again in a few minutes.</p></section>"));
    return;
  }
  const stage = typeof body.outcome === "string" ? OUTCOMES[body.outcome] : undefined;
  const reason = typeof body.lost_reason === "string" && (LOST_REASONS as readonly string[]).includes(body.lost_reason) ? (body.lost_reason as LostReason) : null;
  if (!stage) { res.status(400).type("html").send(page("MatchRV lead receipt", receiptBody(lead, "Choose an outcome."))); return; }
  const r = recordLeadStage(lead.lead_id, stage, { reason, by: "dealer_receipt" });
  if (!r.ok) {
    const msg = r.code === "reason_required" ? "Choose a reason for a lost lead." : r.code === "already_closed" ? "This lead is already closed." : "The outcome could not be saved.";
    res.status(r.code === "already_closed" ? 409 : 400).type("html").send(page("MatchRV lead receipt", receiptBody(lead, msg)));
    return;
  }
  res.type("html").send(page("MatchRV lead receipt", receiptBody(r.lead, "Saved. Thank you.")));
});

// ── Dashboard auth ─────────────────────────────────────────────────────────

export const DASHBOARD_COOKIE = "__Host-mrv_leads";
const COOKIE_TTL_MS = 12 * 60 * 60 * 1000;

const digest = (s: string) => createHash("sha256").update(s).digest();
/** Constant-time compare without leaking length: both sides are hashed first. */
export function secretEquals(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}
const cookieKey = (token: string) => createHash("sha256").update(`leads-dashboard-cookie:${token}`).digest();

export function signDashboardCookie(token: string, now = Date.now()): string {
  const body = `v1.${now + COOKIE_TTL_MS}.${randomBytes(12).toString("base64url")}`;
  return `${body}.${createHmac("sha256", cookieKey(token)).update(body).digest("base64url")}`;
}

export function verifyDashboardCookie(value: string | undefined, token: string, now = Date.now()): boolean {
  if (!value) return false;
  const m = /^(v1\.(\d{10,16})\.[A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m || Number(m[2]) < now) return false;
  const expected = Buffer.from(createHmac("sha256", cookieKey(token)).update(m[1]).digest("base64url"));
  const got = Buffer.from(m[3]);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "");
  return m ? m[1].trim() : null;
}

type Auth = "disabled" | "none" | "bearer" | "cookie" | "bad_bearer";
function dashboardAuth(req: Request): Auth {
  const token = dashboardToken();
  if (!token) return "disabled";
  const b = bearer(req);
  if (b !== null) return secretEquals(b, token) ? "bearer" : "bad_bearer";
  return verifyDashboardCookie(readCookie(req, DASHBOARD_COOKIE), token) ? "cookie" : "none";
}

const DISABLED_BODY = "Not found";
function notFound(res: Response): void { res.status(404).type("text/plain").send(DISABLED_BODY); }

function loginPage(msg: string | null): string {
  return page("MatchRV leads dashboard", `<section><form method="post" action="/ops/leads-dashboard/login">
<p><strong>Enter the dashboard token</strong></p><p class="muted">Sent once in this form; the browser then keeps only a signed, HttpOnly session cookie for 12 hours.</p>
<p><input type="password" name="token" autocomplete="off" spellcheck="false" required></p><button type="submit">Open dashboard</button>
${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ""}</form></section>`);
}

router.post("/ops/leads-dashboard/login", (req: Request, res: Response) => {
  privateHeaders(res);
  const token = dashboardToken();
  if (!token) { notFound(res); return; }
  if (!allowHit(`dl:${req.ip}`, 10, 15 * 60_000)) { res.setHeader("Retry-After", "900"); res.status(429).type("html").send(loginPage("Too many attempts. Try again in 15 minutes.")); return; }
  if (!sameOrigin(req)) { res.status(403).type("html").send(loginPage("Cross-site login refused.")); return; }
  const given = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!given || !secretEquals(given, token)) { res.status(401).type("html").send(loginPage("That token was not accepted.")); return; }
  res.setHeader("Set-Cookie", `${DASHBOARD_COOKIE}=${signDashboardCookie(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_TTL_MS / 1000}`);
  res.redirect(303, "/ops/leads-dashboard");
});

router.post("/ops/leads-dashboard/logout", (req: Request, res: Response) => {
  privateHeaders(res);
  if (!dashboardToken()) { notFound(res); return; }
  if (!sameOrigin(req)) { res.status(403).end(); return; }
  res.setHeader("Set-Cookie", `${DASHBOARD_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  res.redirect(303, "/ops/leads-dashboard");
});

const q = (v: unknown) => (typeof v === "string" ? v : undefined);
const reportOpts = (req: Request) => ({
  from: q(req.query.from), to: q(req.query.to), granularity: q(req.query.granularity) === "week" ? "week" as const : "day" as const,
  includeTests: req.query.include_tests === "1",
});

// ── Dashboard HTML ─────────────────────────────────────────────────────────

const num = (v: number | null | undefined, suffix = "") => (v == null ? "—" : `${v.toLocaleString("en-US")}${suffix}`);
const usd = (v: number | null) => (v == null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const mins = (v: number | null) => (v == null ? "—" : v < 120 ? `${v} min` : `${Math.round((v / 60) * 10) / 10} h`);

function breakdownTable(title: string, rows: Breakdown[]): string {
  if (!rows.length) return `<section><h2>${esc(title)}</h2><p class="muted">No leads in this range.</p></section>`;
  return `<section><h2>${esc(title)}</h2><table><tr><th></th><th class="n">Leads</th><th class="n">Qualified</th><th class="n">Qualified %</th><th class="n">Repeats</th><th class="n">Sold</th><th class="n">Lost</th><th class="n">Cost</th><th class="n">Cost / lead</th><th class="n">Revenue</th><th class="n">Revenue / lead</th></tr>${rows.map((b) =>
    `<tr><td>${esc(b.key)}</td><td class="n">${num(b.leads)}</td><td class="n">${num(b.qualified)}</td><td class="n">${num(b.qualifiedPct, "%")}</td><td class="n">${num(b.repeats)}</td><td class="n">${num(b.sold)}</td><td class="n">${num(b.lost)}</td><td class="n">${usd(b.costUsd)}</td><td class="n">${usd(b.costUsd == null ? null : b.costUsd / b.leads)}</td><td class="n">${usd(b.revenueUsd)}</td><td class="n">${usd(b.revenueUsd == null ? null : b.revenueUsd / b.leads)}</td></tr>`).join("")}</table></section>`;
}

export function renderDashboard(report: ReturnType<typeof buildLeadReport>, recent: LeadRecord[]): string {
  const r = report;
  const sources = [...new Set(r.series.flatMap((s) => Object.keys(s.bySource)))].sort();
  const csvQuery = `from=${encodeURIComponent(r.range.from)}&to=${encodeURIComponent(r.range.to)}${r.range.includeTests ? "&include_tests=1" : ""}`;
  return page("MatchRV leads dashboard", `
<section><form method="get" action="/ops/leads-dashboard">From <input type="date" name="from" value="${esc(r.range.from)}"> to <input type="date" name="to" value="${esc(r.range.to)}">
<select name="granularity"><option value="day"${r.range.granularity === "day" ? " selected" : ""}>By day</option><option value="week"${r.range.granularity === "week" ? " selected" : ""}>By week</option></select>
<label><input type="checkbox" name="include_tests" value="1"${r.range.includeTests ? " checked" : ""}> include test leads</label> <button type="submit">Show</button></form>
<p class="muted">Days are UTC. <a href="/ops/leads-dashboard.csv?${csvQuery}">Download CSV</a> · <a href="/ops/leads-dashboard.csv?${csvQuery}&amp;include_contact=1">CSV with contact details</a></p>
<form method="post" action="/ops/leads-dashboard/logout"><button type="submit">Sign out</button></form></section>
<section><div class="kpis"><div class="kpi"><b>${num(r.totals.leads)}</b>leads</div><div class="kpi"><b>${num(r.totals.qualifiedPct, "%")}</b>qualified (${num(r.totals.qualified)})</div><div class="kpi"><b>${num(r.totals.repeats)}</b>repeat inquiries (not counted as leads)</div><div class="kpi"><b>${mins(r.totals.medianResponseMinutes)}</b>median dealer response</div><div class="kpi"><b>${mins(r.totals.p90ResponseMinutes)}</b>p90 dealer response</div></div></section>
<section><h2>Funnel</h2><table><tr><th>Step</th><th class="n">Shoppers (human)</th><th class="n">AI agent for a shopper</th><th class="n">Total</th><th class="n">Conversion from previous step</th></tr>${r.funnel.map((f) =>
    `<tr><td>${esc(f.step)}</td><td class="n">${num(f.human)}</td><td class="n">${num(f.aiAgentUser)}</td><td class="n">${num(f.total)}</td><td class="n">${num(f.conversionFromPreviousPct, "%")}</td></tr>`).join("")}</table>
<p class="muted">Bots and crawlers excluded (never counted above): ${Object.entries(r.botsExcluded).map(([k, v]) => `${esc(k)} ${num(v)}`).join(" · ") || "none"}</p></section>
<section><h2>Leads over time</h2><table><tr><th>${r.range.granularity === "week" ? "Week of" : "Day"}</th><th class="n">Leads</th><th class="n">Qualified</th>${sources.map((s) => `<th class="n">${esc(s)}</th>`).join("")}</tr>${r.series.map((s) =>
    `<tr><td>${esc(s.bucket)}</td><td class="n">${num(s.leads)}</td><td class="n">${num(s.qualified)}</td>${sources.map((k) => `<td class="n">${num(s.bySource[k] ?? 0)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="3" class="muted">No leads in this range.</td></tr>`}</table></section>
${breakdownTable("By source", r.bySource)}${breakdownTable("By surface", r.bySurface)}${breakdownTable("By campaign", r.byCampaign)}${breakdownTable("By dealer", r.byDealer)}${breakdownTable("By unit type", r.byUnitType)}${breakdownTable("By price band", r.byPriceBand)}${breakdownTable("By region (dealer state)", r.byRegion)}
<section><h2>Dealer response time</h2><table><tr><th>Dealer</th><th class="n">Leads</th><th class="n">Responses recorded</th><th class="n">Median</th><th class="n">p90</th></tr>${r.dealerResponse.map((d) =>
    `<tr><td>${esc(d.dealerName)}</td><td class="n">${num(d.leads)}</td><td class="n">${num(d.responded)}</td><td class="n">${mins(d.medianMinutes)}</td><td class="n">${mins(d.p90Minutes)}</td></tr>`).join("")}</table></section>
<section><h2>Outcomes</h2><table><tr><th>Reached</th><th class="n">Leads</th></tr>${Object.entries(r.reached).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${num(v)}</td></tr>`).join("")}</table>
<p class="muted">Lost reasons: ${Object.entries(r.lostReasons).map(([k, v]) => `${esc(k)} ${num(v)}`).join(" · ") || "none"}</p></section>
<section><h2>Recent leads</h2><table><tr><th>When (UTC)</th><th>Lead</th><th>Source</th><th>Surface</th><th>Dealer</th><th>RV</th><th class="n">Price</th><th>Qualified</th><th>Stage</th><th class="n">Repeats</th></tr>${recent.map((l) =>
    `<tr><td>${esc(l.created_at.slice(0, 16).replace("T", " "))}</td><td>${esc(l.lead_id)}</td><td>${esc(l.source)}${l.source_verified ? " ✓" : ""}</td><td>${esc(l.surface)}</td><td>${esc(l.dealer.name)}</td><td>${esc(l.unit.title)}</td><td class="n">${l.unit.price_usd == null ? "—" : usd(l.unit.price_usd)}</td><td>${l.qualification.qualified ? "yes" : "no"}</td><td>${esc(l.lifecycle.stage)}</td><td class="n">${num(l.repeat_count)}</td></tr>`).join("") || `<tr><td colspan="10" class="muted">No leads yet.</td></tr>`}</table>
<p class="muted">Contact details are in the CSV with contact details and the lead inbox (/ops/leads). Cost and revenue columns are placeholders until those numbers are recorded.</p></section>`);
}

router.get(["/ops/leads-dashboard", "/ops/leads-dashboard/"], (req: Request, res: Response) => {
  privateHeaders(res);
  const auth = dashboardAuth(req);
  if (auth === "disabled") { notFound(res); return; }
  if (auth === "none" || auth === "bad_bearer") { res.status(401).type("html").send(loginPage(auth === "bad_bearer" ? "That token was not accepted." : null)); return; }
  const opts = reportOpts(req);
  const report = buildLeadReport(opts);
  const recent = listLeads().filter((l) => opts.includeTests || !l.test).slice(0, 50);
  res.type("html").send(renderDashboard(report, recent));
});

router.get("/ops/leads-dashboard.csv", (req: Request, res: Response) => {
  privateHeaders(res);
  const auth = dashboardAuth(req);
  if (auth === "disabled") { notFound(res); return; }
  if (auth !== "bearer" && auth !== "cookie") { res.status(401).json({ error: "unauthorized" }); return; }
  const opts = reportOpts(req);
  const fname = `matchrv-leads-${opts.from ?? "last30"}-${opts.to ?? "today"}.csv`.replace(/[^A-Za-z0-9._-]/g, "");
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  res.type("text/csv; charset=utf-8").send(leadsCsv({ ...opts, includeContact: req.query.include_contact === "1" }));
});

// ── JSON ops API (Bearer only) ─────────────────────────────────────────────

function requireBearer(req: Request, res: Response): boolean {
  privateHeaders(res);
  const auth = dashboardAuth(req);
  if (auth === "disabled") { notFound(res); return false; }
  if (auth !== "bearer") { res.status(401).json({ error: "unauthorized" }); return false; }
  return true;
}

router.get("/ops/leads-dashboard/api/report", (req: Request, res: Response) => {
  if (!requireBearer(req, res)) return;
  res.json(buildLeadReport(reportOpts(req)));
});

router.post("/ops/leads-dashboard/api/leads/:id/stage", (req: Request, res: Response) => {
  if (!requireBearer(req, res)) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const stage = typeof b.stage === "string" && (LEAD_STAGES as readonly string[]).includes(b.stage) ? (b.stage as LeadStage) : null;
  const reason = typeof b.reason === "string" && (LOST_REASONS as readonly string[]).includes(b.reason) ? (b.reason as LostReason) : null;
  if (!stage) { res.status(400).json({ error: "invalid_stage" }); return; }
  const r = recordLeadStage(String(req.params.id), stage, { reason, by: "matchrv_ops" });
  if (!r.ok) { res.status(r.code === "not_found" ? 404 : r.code === "frozen" ? 503 : r.code === "already_closed" ? 409 : 400).json({ error: r.code }); return; }
  res.json({ lead_id: r.lead.lead_id, lifecycle: r.lead.lifecycle, changed: r.changed });
});

router.post("/ops/leads-dashboard/api/leads/:id/receipt-link", (req: Request, res: Response) => {
  if (!requireBearer(req, res)) return;
  if (!leadTrackingEnabled()) { res.status(409).json({ error: "lead_tracking_disabled" }); return; }
  if (!getLead(String(req.params.id))) { res.status(404).json({ error: "not_found" }); return; }
  const issued = issueReceiptToken(String(req.params.id));
  if (!issued) { res.status(503).json({ error: "writes_unavailable" }); return; }
  res.json({ url: issued.url, note: "Shown once. MatchRV keeps only a hash. Issuing a new link disables the previous one." });
});

router.post("/ops/leads-dashboard/api/purge-pii", (req: Request, res: Response) => {
  if (!requireBearer(req, res)) return;
  res.json({ purged: purgeLeadPii() });
});

export default router;

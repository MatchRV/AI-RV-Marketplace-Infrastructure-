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
 *   POST /ops/leads-dashboard/api/leads/:id/credit     { status: disputed|dealer_already_had|upheld|clear, reason?, dealer_record_at?, note? } (Bearer only)
 *   POST /ops/leads-dashboard/leads/:id/credit         the same from the dashboard's own form: signed-in cookie + per-session
 *                                                      form token + same-origin check (LEAD_CREDIT_ENABLED only)
 *   POST /ops/leads-dashboard/api/click-matches        { click_key, dealer_record_at, source, note? }: match a click to the dealer's
 *                                                      own record (CRM export / utm analytics); starts the click's dispute clock (Bearer only)
 *   POST /ops/leads-dashboard/api/click-matches/credit { click_key, status, reason?, proof_type?, dealer_record_at?, note? } (Bearer only)
 *   POST /ops/leads-dashboard/click-matches[/credit]   the same two from the dashboard's forms (cookie + form token + same origin)
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
  LEAD_STAGES, LOST_REASONS, getLead, issueReceiptToken, leadByReceiptToken, listLeads, purgeLeadPii, recordCreditReview, recordLeadStage, recordReceiptView,
  type LeadRecord, type LeadStage, type LostReason,
} from "../services/lead-store";
import {
  CLICK_MATCH_SOURCE_LABELS, CLICK_MATCH_SOURCES, CREDIT_REASON_LABELS, CREDIT_REASONS, PROOF_LABELS, PROOF_TYPES,
  cleanCreditReview, creditVerdict, dealerTimeZone, leadCreditEnabled, matchAsLead, type ClickCredit,
} from "../services/lead-credit";
import { buildCreditSummary, wrongNumberFlags, WRONG_NUMBER_FLAG_DAYS, WRONG_NUMBER_FLAG_LIMIT, type CreditSummary, type WrongNumberFlag } from "../services/lead-report";
import { getClickMatch, recordClickMatch, recordClickMatchReview } from "../services/click-matches";
import { outboundSummary } from "../services/outbound-clicks";
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
  financing: "Financing did not work out", price: "Price", not_a_fit: "Not the right RV", duplicate: "Duplicate of another lead", spam: "Spam / not a real shopper", wrong_number: "Wrong number / bad contact details", other: "Other",
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

/** Dashboard form token for the credit review form: bound to this signed-in browser session's cookie. */
export function creditFormToken(cookieValue: string, token: string): string {
  return createHmac("sha256", cookieKey(token)).update(`credit-form-v1:${cookieValue}`).digest("base64url");
}

const fmtDay = (iso: string | null | undefined) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");

/** Outbound clicks: how many shoppers MatchRV sent to dealer sites, by dealer. */
function outboundSection(): string {
  const o = outboundSummary();
  const top = o.byDealer.slice(0, 15);
  return `<section><h2>Shoppers sent to dealer sites</h2><p class="muted">Every click to a dealer's own site goes through MatchRV's tagged link (/api/out) with utm_source=matchrv. This is MatchRV's own record of when each shopper was sent, for lead-credit disputes. Total recorded: <b>${num(o.total)}</b>.</p>${top.length ? `<table><tr><th>Dealer</th><th class="n">Clicks</th></tr>${top.map((d) => `<tr><td>${esc(d.dealerName)}</td><td class="n">${num(d.clicks)}</td></tr>`).join("")}</table>` : `<p class="muted">No clicks recorded yet.</p>`}</section>`;
}

/** The dealer-dispute form shared by leads and matched clicks. */
function disputeForm(action: string, csrf: string, open: boolean, deadline: string | null, hidden: string, stands: string): string {
  return `<details><summary>Record dealer dispute</summary><form method="post" action="${esc(action)}">
<input type="hidden" name="csrf" value="${esc(csrf)}">${hidden}
<p class="muted">Dispute window (7 calendar days): ${esc(open ? `open until ${fmtDay(deadline)} UTC` : `closed, ${stands} (a dispute filed in time can still be resolved)`)}.</p>
<p><select name="status" required><option value="disputed">Dealer disputes (checking)</option><option value="dealer_already_had">Dealer's dated record is earlier: do not count</option><option value="upheld">Reviewed: MatchRV was first</option><option value="clear">Clear review</option></select></p>
<p><select name="reason"><option value="">Reason</option>${CREDIT_REASONS.map((x) => `<option value="${x}">${esc(CREDIT_REASON_LABELS[x])}</option>`).join("")}</select></p>
<p><select name="proof_type"><option value="">Proof the dealer showed</option>${PROOF_TYPES.map((x) => `<option value="${x}">${esc(PROOF_LABELS[x])}</option>`).join("")}</select></p>
<p>Date on the dealer's own record <input type="date" name="dealer_record_at"> <span class="muted">(the dealer's local day)</span></p>
<p class="muted">"Do not count" needs both the proof type and its date. An undated claim does not overturn a credit.</p>
<p><input type="text" name="note" maxlength="280" placeholder="Note (no shopper contact details)" style="width:100%"></p>
<button type="submit">Save</button></form></details>`;
}

/** Dealers marking "wrong number" unusually often from the receipt page. Shown whether or not lead credit is on. */
export function wrongNumberSection(flags: WrongNumberFlag[]): string {
  if (!flags.length) return "";
  return `<section><h2 class="err">Check: frequent "wrong number" marks</h2><p class="muted">These dealers marked more than ${WRONG_NUMBER_FLAG_LIMIT} leads "wrong number" on the receipt page in the last ${WRONG_NUMBER_FLAG_DAYS} days. Wrong-number leads never count, so check the contact details on these leads.</p>
<table><tr><th>Dealer</th><th class="n">Wrong number (last ${WRONG_NUMBER_FLAG_DAYS} days)</th></tr>${flags.map((f) => `<tr><td>${esc(f.dealerName ?? f.dealerId ?? "unknown")}</td><td class="n"><b>${f.count}</b></td></tr>`).join("")}</table></section>`;
}

const CLICK_STATUS_TEXT: Record<string, string> = {
  unmatched: "Not matched yet: counts 0 until matched to the dealer's own record",
  credited: "Matched; MatchRV's click came first",
  already_counted_as_inquiry: "Counted as a MatchRV inquiry instead",
  dealer_already_had: "Dealer's record is earlier or the same local day: does not count",
  outside_window: "Dealer's record came more than the window after the click: does not count",
  disputed_pending: "Dealer disputes (checking): does not count until reviewed",
  no_session: "No session: never counts",
};

/** Click-only credits: match form for unmatched clicks, verdict + dispute form for matched ones. */
function clickSection(clicks: ClickCredit[], csrf: string | null, sum: CreditSummary): string {
  const shown = clicks.filter((c) => c.status !== "already_counted_as_inquiry").slice(-50).reverse();
  const rows = shown.map((c) => {
    const hidden = `<input type="hidden" name="click_key" value="${esc(c.key)}">`;
    let action = "";
    if (csrf && !c.match) {
      action = `<details><summary>Record dealer match</summary><form method="post" action="/ops/leads-dashboard/click-matches">
<input type="hidden" name="csrf" value="${esc(csrf)}">${hidden}
<p>Date on the dealer's own record of this shopper <input type="date" name="dealer_record_at" required> <span class="muted">(dealer's local day)</span></p>
<p><select name="source" required><option value="">Where it came from</option>${CLICK_MATCH_SOURCES.map((x) => `<option value="${x}">${esc(CLICK_MATCH_SOURCE_LABELS[x])}</option>`).join("")}</select></p>
<p><input type="text" name="note" maxlength="280" placeholder="Note (no shopper contact details)" style="width:100%"></p>
<p class="muted">Saving sends the match: the dealer then has 7 calendar days to dispute it.</p>
<button type="submit">Save match</button></form></details>`;
    } else if (csrf && c.match) {
      action = disputeForm("/ops/leads-dashboard/click-matches/credit", csrf, c.dispute_window_open, c.dispute_deadline, hidden, "the credit stands");
    }
    const m = c.match;
    const r = m?.review;
    const matchLine = m
      ? `Dealer record ${esc(fmtDay(m.dealer_record_at))} (${esc(CLICK_MATCH_SOURCE_LABELS[m.source])})<br>Match sent ${esc(fmtDay(m.matched_at))}${r && r.status !== "none" ? `<br><span class="muted">Review: ${esc(r.status.replace(/_/g, " "))}${r.proof_type ? `, ${esc(PROOF_LABELS[r.proof_type])}` : ""}${r.dealer_record_at ? ` dated ${esc(fmtDay(r.dealer_record_at))}` : ""}</span>` : ""}`
      : `<span class="muted">No dealer record yet</span>`;
    return `<tr><td>${esc(fmtDay(c.clicked_at))}</td><td>${esc(c.dealer_name)}<br><span class="muted">${esc(dealerTimeZone(c.dealer_state))}</span></td><td>${esc(c.unit_id ?? "dealer home page")}<br><span class="muted">session ${esc((c.session ?? "").slice(0, 8))}…</span></td><td>${matchLine}</td><td><b>${esc(c.status.replace(/_/g, " "))}</b><br><span class="muted">${esc(CLICK_STATUS_TEXT[c.status] ?? "")}</span></td><td class="n"><b>${c.credit_weight}</b></td><td>${action}</td></tr>`;
  }).join("");
  return `<h3>Click-only credits</h3><p class="muted">Matched: ${sum.matchedClicks} (${sum.creditedClicks} counted × ${sum.weights.click} = ${sum.clickCredits}). <b>Unmatched clicks: ${sum.unmatchedClicks}</b>, counted 0 until ops matches them to the dealer's own record (CRM export, or the dealer's analytics on utm_source=matchrv).</p>
<table><tr><th>Clicked (UTC)</th><th>Dealer (time zone for same-day ties)</th><th>RV</th><th>Dealer match</th><th>Verdict</th><th class="n">Credit</th><th></th></tr>${rows || `<tr><td colspan="7" class="muted">No click-only referrals in this range.</td></tr>`}</table>`;
}

/** Lead credit: totals, MatchRV's evidence trail, verdict, weight and the dispute form for each recent lead. */
function creditSection(recent: LeadRecord[], csrf: string | null, sum: CreditSummary): string {
  const w = sum.weights;
  const rows = recent.map((l) => {
    const v = creditVerdict(l);
    const ev = l.credit?.evidence;
    const r = l.credit?.review;
    const signals = ev?.buying_signals?.length ? ev.buying_signals.join(", ").replace(/_/g, "-") : "none";
    const form = csrf
      ? disputeForm(`/ops/leads-dashboard/leads/${encodeURIComponent(l.lead_id)}/credit`, csrf, v.dispute_window_open, v.dispute_deadline, "", "the lead stands")
      : `<span class="muted">Sign in with the form to edit (or use the API)</span>`;
    const trail = `First view ${esc(fmtDay(ev?.first_view_at))}<br>Sent to dealer site ${esc(fmtDay(ev?.first_outbound_click_at))}${ev?.outbound_clicks ? ` (${ev.outbound_clicks}${ev.outbound_surfaces.length ? `, ${esc(ev.outbound_surfaces.join(", "))}` : ""})` : ""}${ev?.price_alert_before_leaving ? "<br>Price alert saved before leaving" : ""}<br>Inquiry ${esc(fmtDay(ev?.inquiry_at ?? l.created_at))}<br>Delivered ${esc(fmtDay(v.delivered_at))}<br><b>First touch ${esc(fmtDay(ev?.first_touch_at))}</b>`;
    const reviewLine = r && r.status !== "none"
      ? `<br><span class="muted">Review: ${esc(r.status.replace(/_/g, " "))}${r.reason ? `, ${esc(CREDIT_REASON_LABELS[r.reason])}` : ""}${r.proof_type ? `, ${esc(PROOF_LABELS[r.proof_type])}` : ""}${r.dealer_record_at ? ` dated ${esc(r.dealer_record_at.slice(0, 10))}` : ""}${r.dispute_filed_at ? `, filed ${esc(fmtDay(r.dispute_filed_at))}` : ""}${r.note ? `, "${esc(r.note)}"` : ""}</span>`
      : "";
    return `<tr><td>${esc(l.lead_id)}</td><td>${esc(l.dealer.name)}</td><td>${trail}</td><td>${ev?.has_phone ? "phone" : "no phone"}; signals: ${esc(signals)}<br>${esc(v.credit_tier ?? "—")}</td><td><b>${esc(v.status.replace(/_/g, " "))}</b><br><span class="muted">${esc(v.explanation)}</span>${reviewLine}</td><td class="n"><b>${v.credit_weight}</b></td><td>${form}</td></tr>`;
  }).join("");
  const nb = Object.entries(sum.notBillable).map(([k, n]) => `${esc(k.replace(/_/g, " "))} ${n}`).join(", ") || "none";
  return `<section><h2>Lead credit (Jonathan-approved pilot terms)</h2>
<div class="kpis"><div class="kpi"><b>${sum.totalCredits}</b>Total credits</div><div class="kpi"><b>${sum.leadCredits}</b>Lead credits (${sum.basicLeads} basic × ${w.inquiry}, ${sum.qualifiedLeads} qualified × ${w.qualified})</div><div class="kpi"><b>${sum.clickCredits}</b>Matched click credits (${sum.creditedClicks} × ${w.click})</div><div class="kpi"><b>${sum.unmatchedClicks}</b>Unmatched clicks (count 0)</div></div>
<p class="muted">${esc(sum.range.from)} to ${esc(sum.range.to)} (UTC). Not billable: ${nb}. Clicks already counted as a MatchRV inquiry: ${sum.clicksAlreadyCounted}. Window ${sum.windowDays} days from MatchRV's first touch; dealers have ${sum.disputeDays} calendar days from delivery (inquiries) or from the match being sent (clicks) to dispute with a dated record; ties and same-day close calls (on the dealer's local day; Pacific when unknown) go to ${sum.tiesToDealer ? "the dealer" : "the earliest timestamp"}. Qualified = phone + a buying signal (timeline, trade-in or financing). Clicks count only once matched to the dealer's own record. Nothing here charges anyone.</p>
<table><tr><th>Lead</th><th>Dealer</th><th>MatchRV evidence trail (UTC)</th><th>Tier</th><th>Verdict</th><th class="n">Credit</th><th></th></tr>${rows || `<tr><td colspan="7" class="muted">No leads yet.</td></tr>`}</table>
${clickSection(sum.clicks, csrf, sum)}</section>`;
}

export function renderDashboard(report: ReturnType<typeof buildLeadReport>, recent: LeadRecord[], opts: { creditCsrf?: string | null; creditSummary?: CreditSummary } = {}): string {
  const r = report;
  const sources = [...new Set(r.series.flatMap((s) => Object.keys(s.bySource)))].sort();
  const csvQuery = `from=${encodeURIComponent(r.range.from)}&to=${encodeURIComponent(r.range.to)}${r.range.includeTests ? "&include_tests=1" : ""}`;
  return page("MatchRV leads dashboard", `
<section><form method="get" action="/ops/leads-dashboard">From <input type="date" name="from" value="${esc(r.range.from)}"> to <input type="date" name="to" value="${esc(r.range.to)}">
<select name="granularity"><option value="day"${r.range.granularity === "day" ? " selected" : ""}>By day</option><option value="week"${r.range.granularity === "week" ? " selected" : ""}>By week</option></select>
<label><input type="checkbox" name="include_tests" value="1"${r.range.includeTests ? " checked" : ""}> include test leads</label> <button type="submit">Show</button></form>
<p class="muted">Days are UTC. <a href="/ops/leads-dashboard.csv?${csvQuery}">Download CSV</a> · <a href="/ops/leads-dashboard.csv?${csvQuery}&amp;include_contact=1">CSV with contact details</a></p>
<form method="post" action="/ops/leads-dashboard/logout"><button type="submit">Sign out</button></form></section>
${wrongNumberSection(opts.creditSummary?.wrongNumberFlags ?? wrongNumberFlags({ includeTests: r.range.includeTests }))}
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
<p class="muted">Contact details are in the CSV with contact details and the lead inbox (/ops/leads). Cost and revenue columns are placeholders until those numbers are recorded.</p></section>
${leadCreditEnabled() ? creditSection(recent, opts.creditCsrf ?? null, opts.creditSummary ?? buildCreditSummary({ from: r.range.from, to: r.range.to, includeTests: r.range.includeTests })) : ""}
${outboundSection()}`);
}

router.get(["/ops/leads-dashboard", "/ops/leads-dashboard/"], (req: Request, res: Response) => {
  privateHeaders(res);
  const auth = dashboardAuth(req);
  if (auth === "disabled") { notFound(res); return; }
  if (auth === "none" || auth === "bad_bearer") { res.status(401).type("html").send(loginPage(auth === "bad_bearer" ? "That token was not accepted." : null)); return; }
  const opts = reportOpts(req);
  const report = buildLeadReport(opts);
  const recent = listLeads().filter((l) => opts.includeTests || !l.test).slice(0, 50);
  const cookie = auth === "cookie" ? readCookie(req, DASHBOARD_COOKIE) : undefined;
  const token = dashboardToken();
  const creditCsrf = cookie && token ? creditFormToken(cookie, token) : null;
  res.type("html").send(renderDashboard(report, recent, { creditCsrf }));
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
  const ro = reportOpts(req);
  res.json(leadCreditEnabled() ? { ...buildLeadReport(ro), credit: buildCreditSummary(ro) } : buildLeadReport(ro));
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

function creditError(res: Response, code: string): void {
  const status = code === "not_found" ? 404 : code === "frozen" ? 503 : code === "disabled" || code === "dispute_window_closed" ? 409 : 400;
  res.status(status).json({ error: code === "disabled" ? "lead_credit_disabled" : code });
}

router.post("/ops/leads-dashboard/api/leads/:id/credit", (req: Request, res: Response) => {
  if (!requireBearer(req, res)) return;
  if (!leadTrackingEnabled() || !leadCreditEnabled()) { creditError(res, "disabled"); return; }
  const lead = getLead(String(req.params.id));
  if (!lead) { creditError(res, "not_found"); return; }
  const clean = cleanCreditReview((req.body ?? {}) as Record<string, unknown>, { lead });
  if (!clean.ok) { creditError(res, clean.code); return; }
  const r = recordCreditReview(String(req.params.id), clean.review);
  if (!r.ok) { creditError(res, r.code); return; }
  res.json({ lead_id: r.lead.lead_id, credit: r.lead.credit, verdict: creditVerdict(r.lead) });
});

const formError = (res: Response, status: number, msg: string) =>
  res.status(status).type("html").send(page("Lead credit", `<section><p class="err">Not saved: ${esc(msg.replace(/_/g, " "))}.</p><p><a href="/ops/leads-dashboard">Back to the dashboard</a></p></section>`));

/** Dashboard form gate: lead credit on, same origin, signed-in cookie and this session's form token. */
function creditFormAllowed(req: Request, res: Response): boolean {
  privateHeaders(res);
  const token = dashboardToken();
  if (!token || !leadTrackingEnabled() || !leadCreditEnabled()) { notFound(res); return false; }
  if (!sameOrigin(req)) { res.status(403).type("text/plain").send("Cross-site form refused."); return false; }
  const cookie = readCookie(req, DASHBOARD_COOKIE);
  if (!cookie || !verifyDashboardCookie(cookie, token)) { res.status(401).type("html").send(loginPage("Sign in again to save.")); return false; }
  const given = typeof req.body?.csrf === "string" ? req.body.csrf : "";
  if (!given || !secretEquals(given, creditFormToken(cookie, token))) { res.status(403).type("text/plain").send("Form expired. Reload the dashboard and try again."); return false; }
  return true;
}

const matchStatus = (code: string) => (code === "click_not_found" || code === "not_found" ? 404 : code === "frozen" || code === "write_failed" ? 503 : code === "dispute_window_closed" ? 409 : 400);

/** Validate + save a dispute review on a matched click. */
function reviewClickMatch(body: Record<string, unknown>): { ok: true; result: unknown } | { ok: false; code: string } {
  const key = typeof body.click_key === "string" ? body.click_key.trim() : "";
  const m = key ? getClickMatch(key) : null;
  if (!m) return { ok: false, code: "not_found" };
  const clean = cleanCreditReview(body, { lead: matchAsLead(m) });
  if (!clean.ok) return { ok: false, code: clean.code };
  const r = recordClickMatchReview(key, clean.review);
  if (!r.ok) return { ok: false, code: r.code };
  return { ok: true, result: { match: r.match } };
}

router.post("/ops/leads-dashboard/api/click-matches", (req: Request, res: Response) => {
  if (!requireBearer(req, res)) return;
  if (!leadTrackingEnabled() || !leadCreditEnabled()) { creditError(res, "disabled"); return; }
  const r = recordClickMatch((req.body ?? {}) as Record<string, unknown>);
  if (!r.ok) { res.status(matchStatus(r.code)).json({ error: r.code }); return; }
  res.status(r.created ? 201 : 200).json({ match: r.match, created: r.created });
});

router.post("/ops/leads-dashboard/api/click-matches/credit", (req: Request, res: Response) => {
  if (!requireBearer(req, res)) return;
  if (!leadTrackingEnabled() || !leadCreditEnabled()) { creditError(res, "disabled"); return; }
  const r = reviewClickMatch((req.body ?? {}) as Record<string, unknown>);
  if (!r.ok) { res.status(matchStatus(r.code)).json({ error: r.code }); return; }
  res.json(r.result);
});

router.post("/ops/leads-dashboard/click-matches", (req: Request, res: Response) => {
  if (!creditFormAllowed(req, res)) return;
  const r = recordClickMatch((req.body ?? {}) as Record<string, unknown>);
  if (!r.ok) { formError(res, matchStatus(r.code), r.code); return; }
  res.redirect(303, "/ops/leads-dashboard");
});

router.post("/ops/leads-dashboard/click-matches/credit", (req: Request, res: Response) => {
  if (!creditFormAllowed(req, res)) return;
  const r = reviewClickMatch((req.body ?? {}) as Record<string, unknown>);
  if (!r.ok) { formError(res, matchStatus(r.code), r.code); return; }
  res.redirect(303, "/ops/leads-dashboard");
});

router.post("/ops/leads-dashboard/leads/:id/credit", (req: Request, res: Response) => {
  privateHeaders(res);
  const token = dashboardToken();
  if (!token || !leadTrackingEnabled() || !leadCreditEnabled()) { notFound(res); return; }
  if (!sameOrigin(req)) { res.status(403).type("text/plain").send("Cross-site form refused."); return; }
  const cookie = readCookie(req, DASHBOARD_COOKIE);
  if (!cookie || !verifyDashboardCookie(cookie, token)) { res.status(401).type("html").send(loginPage("Sign in again to save.")); return; }
  const given = typeof req.body?.csrf === "string" ? req.body.csrf : "";
  if (!given || !secretEquals(given, creditFormToken(cookie, token))) { res.status(403).type("text/plain").send("Form expired. Reload the dashboard and try again."); return; }
  const formLead = getLead(String(req.params.id));
  if (!formLead) { res.status(404).type("html").send(page("Lead credit", `<section><p class="err">Not saved: not found.</p><p><a href="/ops/leads-dashboard">Back to the dashboard</a></p></section>`)); return; }
  const clean = cleanCreditReview((req.body ?? {}) as Record<string, unknown>, { lead: formLead });
  if (!clean.ok) { res.status(400).type("html").send(page("Lead credit", `<section><p class="err">Not saved: ${esc(clean.code.replace(/_/g, " "))}.</p><p><a href="/ops/leads-dashboard">Back to the dashboard</a></p></section>`)); return; }
  const r = recordCreditReview(String(req.params.id), clean.review);
  if (!r.ok) { res.status(r.code === "not_found" ? 404 : 503).type("html").send(page("Lead credit", `<section><p class="err">Not saved: ${esc(r.code.replace(/_/g, " "))}.</p><p><a href="/ops/leads-dashboard">Back to the dashboard</a></p></section>`)); return; }
  res.redirect(303, "/ops/leads-dashboard");
});

router.post("/ops/leads-dashboard/api/purge-pii", (req: Request, res: Response) => {
  if (!requireBearer(req, res)) return;
  res.json({ purged: purgeLeadPii() });
});

export default router;

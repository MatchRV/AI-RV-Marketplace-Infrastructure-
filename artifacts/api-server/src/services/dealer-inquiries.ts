/**
 * Dealer inquiries — the only MatchRV action that reaches outside MatchRV.
 *
 * Two steps, enforced server-side:
 *
 *   1. preview  (read-only, sends nothing): validates the shopper's contact
 *      info and message against a real inventory unit and returns the exact
 *      preview plus a signed, short-lived confirmation token. Stateless — the
 *      token itself carries the signed preview, so preparing has no side
 *      effects and the content cannot be altered between preview and send.
 *   2. send     (consequential): requires that token AND confirmed=true. It
 *      records the inquiry and delivers it through the best channel MatchRV
 *      actually has for that dealership:
 *        - "delivered"          the dealer has opted in to direct delivery
 *                               (dealer-inquiry-routes) and the email was
 *                               accepted by our mail server;
 *        - "queued_for_matchrv" no direct dealer route; MatchRV ops were
 *                               alerted (ntfy and/or email) and will forward;
 *        - "failed"             neither the dealer nor MatchRV ops could be
 *                               reached — the shopper is told to contact the
 *                               dealership directly;
 *        - "dry_run"            testing only: validated and recorded in memory,
 *                               nothing delivered to anyone.
 *
 * A dealer reply is only ever shown when MatchRV ops record one through the
 * authenticated ops endpoint. Nothing here fabricates a dealer response.
 *
 * Privacy: each inquiry has its own random status token (stored hashed);
 * status lookups require it, so no shopper can read another's inquiry.
 * ntfy alerts never include the shopper's email/phone/message (ntfy topics
 * are not private); full details go only to the MatchRV ops mailbox and the
 * authenticated ops endpoint. Records are purged after INQUIRY_RETENTION_DAYS.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CanonicalUnit } from "@workspace/agent-core";

export type InquiryStatus = "dry_run" | "delivered" | "queued_for_matchrv" | "failed";

export interface InquiryContact { name: string; email: string | null; phone: string | null }
export interface InquiryPreview {
  unit: { id: string; title: string; vin: string | null; stockNumber: string | null; priceUsd: number | null; condition: string; stockUrl: string | null; stockUrlNote: string | null };
  dealer: { id: string; name: string; city: string; state: string; website: string | null };
  shopper: InquiryContact;
  message: string;
  delivery: { channel: "dealer_email" | "matchrv_forward"; explanation: string };
  sendsNothingYet: true;
}

export interface DealerInquiry {
  id: string;
  createdAt: string;
  status: InquiryStatus;
  statusDetail: string;
  dryRun: boolean;
  nonce: string;
  statusTokenHash: string;
  scope: string | null;
  preview: InquiryPreview;
  delivery: { channel: "dealer_email" | "matchrv_forward" | "none"; attemptedAt: string; dealerEmailAccepted: boolean; opsNotified: { ntfy: boolean; email: boolean }; error: string | null };
  dealerReply: { text: string; receivedAt: string; recordedBy: "matchrv_ops" } | null;
}

export interface InquiryTransport {
  /** Email delivery (dealer or MatchRV ops). Throws when unavailable/failed. */
  sendEmail(msg: { to: string; subject: string; text: string; replyTo?: string | null }): Promise<void>;
  /** Push alert to MatchRV ops. Must not receive shopper PII. Throws when unavailable/failed. */
  notifyOps(msg: { title: string; body: string }): Promise<void>;
  emailConfigured(): boolean;
  opsPushConfigured(): boolean;
}

// ── Configuration ──────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 30 * 60 * 1000;
const RETENTION_MS = Number(process.env.INQUIRY_RETENTION_DAYS ?? 90) * 24 * 60 * 60 * 1000;
const signingSecret = process.env.INQUIRY_SIGNING_SECRET || randomBytes(32).toString("hex");
const OPS_EMAIL = process.env.INQUIRY_OPS_EMAIL || "sales@matchrv.com";
export const forceDryRun = () => /^(1|true|yes)$/i.test(process.env.INQUIRY_DRY_RUN ?? "");

/** Dealer ids that opted in to direct email delivery: env JSON or data/dealer-inquiry-routes.json. */
function loadRoutes(): Record<string, string> {
  try {
    if (process.env.DEALER_INQUIRY_ROUTES) return JSON.parse(process.env.DEALER_INQUIRY_ROUTES);
    const p = resolve(process.env.DEALER_INQUIRY_ROUTES_PATH ?? "data/dealer-inquiry-routes.json");
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")).routes ?? {};
  } catch (err) {
    console.warn("[inquiries] could not load dealer routes:", err instanceof Error ? err.message : err);
  }
  return {};
}
let routes: Record<string, string> = loadRoutes();
export function dealerRoute(dealerId: string): string | null {
  const email = routes[dealerId];
  return typeof email === "string" && EMAIL_RE.test(email) ? email : null;
}

// ── Validation ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

export type ValidationError = { field: string; problem: string };
export function validateContact(input: { name?: string; email?: string | null; phone?: string | null; message?: string }): { ok: true; contact: InquiryContact; message: string } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const name = clean(input.name ?? "").replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80 || !/\p{L}/u.test(name) || /[<>{}@]|https?:/i.test(name)) errors.push({ field: "name", problem: "Provide the shopper's name (2-80 characters, no links or symbols)." });
  const email = input.email ? clean(input.email).toLowerCase() : null;
  if (email && (email.length > 120 || !EMAIL_RE.test(email))) errors.push({ field: "email", problem: "That email address does not look valid." });
  let phone: string | null = null;
  if (input.phone) {
    const digits = input.phone.replace(/[^\d+]/g, "");
    const bare = digits.replace(/^\+/, "");
    if (!/^\+?\d+$/.test(digits) || bare.length < 10 || bare.length > 15 || /^(\d)\1+$/.test(bare.slice(-10))) errors.push({ field: "phone", problem: "Provide a phone number with 10-15 digits." });
    else phone = bare.length === 10 ? `+1${bare}` : `+${bare}`;
  }
  if (!email && !phone) errors.push({ field: "email|phone", problem: "Provide at least an email or a phone number so the dealership can reply." });
  const message = clean(input.message ?? "").replace(/\r\n?/g, "\n");
  if (message.length < 2 || message.length > 1500) errors.push({ field: "message", problem: "Provide a message of 2-1,500 characters." });
  if (errors.length) return { ok: false, errors };
  return { ok: true, contact: { name, email, phone }, message };
}

// ── Preview + confirmation token (stateless) ───────────────────────────────

interface TokenPayload { u: string; n: string; e: string | null; p: string | null; m: string; exp: number; nonce: string }
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string) => createHmac("sha256", signingSecret).update(body).digest("base64url");

export function buildPreview(unit: CanonicalUnit, contact: InquiryContact, message: string): InquiryPreview {
  const route = dealerRoute(unit.dealer.id);
  return {
    unit: {
      id: unit.id, title: unit.title, vin: unit.vin, stockNumber: unit.stockNumber, priceUsd: unit.priceUsd.value, condition: unit.condition,
      stockUrl: null,
      stockUrlNote: `MatchRV's snapshot does not store a per-unit listing URL; the dealership website is ${unit.dealer.website ?? unit.provenance.dealerDomain}.`,
    },
    dealer: { id: unit.dealer.id, name: unit.dealer.name, city: unit.dealer.city, state: unit.dealer.state, website: unit.dealer.website },
    shopper: contact,
    message,
    delivery: route
      ? { channel: "dealer_email", explanation: `${unit.dealer.name} accepts MatchRV inquiries by email. After you confirm, MatchRV emails this exact message and your contact details to the dealership.` }
      : { channel: "matchrv_forward", explanation: `MatchRV does not have a direct inquiry connection with ${unit.dealer.name}. After you confirm, MatchRV stores the inquiry and its team forwards it to the dealership; the status will say queued until then.` },
    sendsNothingYet: true,
  };
}

export function prepareInquiry(unit: CanonicalUnit, input: { name?: string; email?: string | null; phone?: string | null; message?: string }, now = Date.now()):
  | { ok: true; preview: InquiryPreview; confirmationToken: string; expiresAt: string }
  | { ok: false; errors: ValidationError[] } {
  const v = validateContact(input);
  if (!v.ok) return v;
  const payload: TokenPayload = { u: unit.id, n: v.contact.name, e: v.contact.email, p: v.contact.phone, m: v.message, exp: now + TOKEN_TTL_MS, nonce: randomBytes(9).toString("base64url") };
  const body = b64(JSON.stringify(payload));
  return { ok: true, preview: buildPreview(unit, v.contact, v.message), confirmationToken: `dic_${body}.${sign(body)}`, expiresAt: new Date(payload.exp).toISOString() };
}

function verifyToken(token: string, now = Date.now()): { ok: true; payload: TokenPayload } | { ok: false; code: "invalid_token" | "expired_token" } {
  const m = /^dic_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token ?? "");
  if (!m) return { ok: false, code: "invalid_token" };
  const expected = Buffer.from(sign(m[1]));
  const got = Buffer.from(m[2]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, code: "invalid_token" };
  let payload: TokenPayload;
  try { payload = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")); } catch { return { ok: false, code: "invalid_token" }; }
  if (payload.exp < now) return { ok: false, code: "expired_token" };
  return { ok: true, payload };
}

// ── Storage ────────────────────────────────────────────────────────────────

const inquiries = new Map<string, DealerInquiry>();
const byNonce = new Map<string, string>();
let loaded = false;
let persistenceEnabled = process.env.NODE_ENV !== "test" && !process.env.VITEST;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function storePath(): string {
  if (process.env.INQUIRIES_PATH) return resolve(process.env.INQUIRIES_PATH);
  if (process.env.LEARNED_FACTS_PATH) return resolve(dirname(resolve(process.env.LEARNED_FACTS_PATH)), "dealer-inquiries.json");
  return resolve("data/dealer-inquiries.json");
}
function load(): void {
  if (loaded) return;
  loaded = true;
  if (!persistenceEnabled) return;
  try {
    const p = storePath();
    if (!existsSync(p)) return;
    for (const inq of JSON.parse(readFileSync(p, "utf8")) as DealerInquiry[]) { inquiries.set(inq.id, inq); byNonce.set(inq.nonce, inq.id); }
  } catch (err) { console.warn("[inquiries] could not restore store:", err instanceof Error ? err.message : err); }
}
function purge(now = Date.now()): void {
  for (const [id, inq] of inquiries) {
    const age = now - Date.parse(inq.createdAt);
    if (age > RETENTION_MS || (inq.dryRun && age > 24 * 60 * 60 * 1000)) { inquiries.delete(id); byNonce.delete(inq.nonce); }
  }
}
function persistSoon(): void {
  if (!persistenceEnabled || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const p = storePath();
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify([...inquiries.values()].filter((i) => !i.dryRun)));
    } catch (err) { console.warn("[inquiries] could not persist store:", err instanceof Error ? err.message : err); }
  }, 300);
}

// ── Rate limiting ──────────────────────────────────────────────────────────

const hits = new Map<string, number[]>();
const LIMITS: Record<string, { max: number; windowMs: number }> = {
  requester: { max: 10, windowMs: 60 * 60 * 1000 },
  contact: { max: 5, windowMs: 60 * 60 * 1000 },
  global: { max: 300, windowMs: 60 * 60 * 1000 },
  preview: { max: 60, windowMs: 60 * 60 * 1000 },
};
export function rateLimit(kind: keyof typeof LIMITS, key: string, now = Date.now()): boolean {
  const { max, windowMs } = LIMITS[kind];
  const id = `${kind}:${key}`;
  const list = (hits.get(id) ?? []).filter((t) => t > now - windowMs);
  if (list.length >= max) { hits.set(id, list); return false; }
  list.push(now);
  hits.set(id, list);
  if (hits.size > 50_000) hits.clear();
  return true;
}

// ── Transport (real) ───────────────────────────────────────────────────────

export const defaultTransport: InquiryTransport = {
  emailConfigured: () => Boolean((process.env.SMTP_HOST && process.env.SMTP_FROM) || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)),
  opsPushConfigured: () => Boolean(process.env.NTFY_TOPIC || process.env.NTFY_URL),
  async sendEmail({ to, subject, text, replyTo }) {
    const { default: nodemailer } = await import("nodemailer");
    const useGmail = !process.env.SMTP_HOST;
    if (useGmail && !(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)) throw new Error("email_not_configured");
    const transport = nodemailer.createTransport({
      host: useGmail ? "smtp.gmail.com" : process.env.SMTP_HOST,
      port: useGmail ? 587 : Number(process.env.SMTP_PORT || 587),
      secure: useGmail ? false : process.env.SMTP_SECURE === "true",
      auth: useGmail ? { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! } : process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" } : undefined,
    });
    await transport.sendMail({ to, from: useGmail ? process.env.GMAIL_USER : process.env.SMTP_FROM, subject, text, ...(replyTo ? { replyTo } : {}) });
  },
  async notifyOps({ title, body }) {
    const base = process.env.NTFY_URL?.replace(/\/+$/, "") || "https://ntfy.sh";
    const topic = process.env.NTFY_TOPIC;
    if (!topic && !process.env.NTFY_URL) throw new Error("ntfy_not_configured");
    const url = topic && !base.endsWith(`/${topic}`) ? `${base}/${encodeURIComponent(topic)}` : base;
    const res = await fetch(url, { method: "POST", headers: { Title: title, Priority: "high", Tags: "rv,envelope", "Content-Type": "text/plain" }, body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`ntfy_http_${res.status}`);
  },
};
let transport: InquiryTransport = defaultTransport;

// ── Send ───────────────────────────────────────────────────────────────────

export type SendResult =
  | { ok: true; inquiry: PublicInquiry; statusToken: string; duplicate: boolean }
  | { ok: false; code: "not_confirmed" | "invalid_token" | "expired_token" | "unit_unavailable" | "rate_limited"; guidance: string };

export async function sendInquiry(args: {
  confirmationToken: string; confirmed: boolean; dryRun?: boolean;
  requesterKey: string; scope: string | null;
  lookupUnit: (id: string) => CanonicalUnit | undefined;
}): Promise<SendResult> {
  load(); purge();
  if (args.confirmed !== true) return { ok: false, code: "not_confirmed", guidance: "Show the shopper the preview and only call again with confirmed=true after they explicitly say to send it." };
  const v = verifyToken(args.confirmationToken);
  if (!v.ok) return { ok: false, code: v.code, guidance: v.code === "expired_token" ? "The preview expired (30 minutes). Prepare a new preview and confirm it with the shopper again." : "Unknown or altered confirmation token. Prepare a new preview." };
  const p = v.payload;
  const existingId = byNonce.get(p.nonce);
  if (existingId && inquiries.get(existingId)) {
    const existing = inquiries.get(existingId)!;
    return { ok: false, code: "invalid_token", guidance: `This preview was already sent (inquiry ${existing.id}, status ${existing.status}). It is not sent twice; use the status tool with the status token from the first send.` };
  }
  const unit = args.lookupUnit(p.u);
  if (!unit || unit.status === "removed") return { ok: false, code: "unit_unavailable", guidance: "This RV is no longer in MatchRV's inventory snapshot. Nothing was sent." };
  const dryRun = Boolean(args.dryRun) || forceDryRun();
  const contactKey = (p.e ?? p.p ?? "").toLowerCase();
  if (!rateLimit("requester", args.requesterKey) || !rateLimit("contact", contactKey) || !rateLimit("global", "all")) {
    return { ok: false, code: "rate_limited", guidance: "Too many inquiries were sent recently from this conversation or contact. Nothing was sent; try again later or contact the dealership directly." };
  }

  const contact: InquiryContact = { name: p.n, email: p.e, phone: p.p };
  const preview = buildPreview(unit, contact, p.m);
  const statusToken = `ist_${randomBytes(18).toString("base64url")}`;
  const inquiry: DealerInquiry = {
    id: `inq_${randomBytes(9).toString("base64url")}`,
    createdAt: new Date().toISOString(),
    status: "failed", statusDetail: "", dryRun, nonce: p.nonce,
    statusTokenHash: hashToken(statusToken), scope: args.scope, preview,
    delivery: { channel: "none", attemptedAt: new Date().toISOString(), dealerEmailAccepted: false, opsNotified: { ntfy: false, email: false }, error: null },
    dealerReply: null,
  };
  // Duplicate guard: same contact + unit within 24h returns a duplicate notice instead of resending.
  const dup = [...inquiries.values()].find((i) => !i.dryRun && !dryRun && i.preview.unit.id === unit.id && (i.preview.shopper.email ?? i.preview.shopper.phone ?? "").toLowerCase() === contactKey && Date.now() - Date.parse(i.createdAt) < 24 * 60 * 60 * 1000 && i.status !== "failed");

  if (dryRun) {
    inquiry.status = "dry_run";
    inquiry.statusDetail = "Dry run: validated and recorded for testing. Nothing was sent to the dealership or to MatchRV staff.";
  } else if (dup) {
    return { ok: true, inquiry: toPublic(dup), statusToken: "(use the status token from the first send)", duplicate: true };
  } else {
    await deliver(inquiry, unit);
  }
  inquiries.set(inquiry.id, inquiry);
  byNonce.set(inquiry.nonce, inquiry.id);
  persistSoon();
  return { ok: true, inquiry: toPublic(inquiry), statusToken, duplicate: false };
}

function dealerEmailText(i: DealerInquiry): string {
  const s = i.preview.shopper; const u = i.preview.unit;
  return [
    `New shopper inquiry via MatchRV (ref ${i.id})`, "",
    `RV: ${u.title}`, `Stock #: ${u.stockNumber ?? "n/a"}   VIN: ${u.vin ?? "n/a"}   Price listed: ${u.priceUsd != null ? `$${u.priceUsd.toLocaleString()}` : "n/a"}`, "",
    `Shopper: ${s.name}`, `Email: ${s.email ?? "-"}`, `Phone: ${s.phone ?? "-"}`, "",
    "Message:", i.preview.message, "",
    "The shopper reviewed this exact message and asked MatchRV to send it. Reply directly to the shopper. To share your reply with MatchRV, reply-all or forward it to " + OPS_EMAIL + ".",
  ].join("\n");
}

async function deliver(i: DealerInquiry, unit: CanonicalUnit): Promise<void> {
  const route = dealerRoute(unit.dealer.id);
  const d = i.delivery;
  if (route && transport.emailConfigured()) {
    d.channel = "dealer_email";
    try {
      await transport.sendEmail({ to: route, subject: `MatchRV inquiry: ${unit.title} (stock ${unit.stockNumber ?? "n/a"})`, text: dealerEmailText(i), replyTo: i.preview.shopper.email });
      d.dealerEmailAccepted = true;
      i.status = "delivered";
      i.statusDetail = `Emailed to ${unit.dealer.name}. "Delivered" means the dealership's mail server accepted it; it does not mean anyone has read or answered it yet.`;
    } catch (err) {
      d.error = `dealer_email_failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  if (i.status === "delivered") {
    await transport.notifyOps({ title: "MatchRV inquiry delivered", body: `${i.id}: ${unit.title} -> ${unit.dealer.name} (${unit.dealer.city}, ${unit.dealer.state}). Delivered by email.` }).then(() => { d.opsNotified.ntfy = true; }, () => {});
    return;
  }
  // No direct route (or it failed): queue for MatchRV to forward and alert ops.
  d.channel = "matchrv_forward";
  const firstName = i.preview.shopper.name.split(" ")[0];
  await transport.notifyOps({
    title: "MatchRV inquiry to forward",
    body: `${i.id}: ${firstName} asked about ${unit.title} (stock ${unit.stockNumber ?? "n/a"}) at ${unit.dealer.name}, ${unit.dealer.city} ${unit.dealer.state}. Full contact details in the ops inbox / GET /api/inquiries/ops/${i.id}.`,
  }).then(() => { d.opsNotified.ntfy = true; }, (err) => { d.error = [d.error, `ntfy_failed: ${err instanceof Error ? err.message : err}`].filter(Boolean).join("; "); });
  if (transport.emailConfigured()) {
    await transport.sendEmail({ to: OPS_EMAIL, subject: `[MatchRV] Forward inquiry ${i.id} to ${unit.dealer.name}`, text: `Forward to: ${unit.dealer.name}, ${unit.dealer.city} ${unit.dealer.state} (${unit.dealer.website ?? unit.provenance.dealerDomain})\n\n${dealerEmailText(i)}`, replyTo: i.preview.shopper.email })
      .then(() => { d.opsNotified.email = true; }, (err) => { d.error = [d.error, `ops_email_failed: ${err instanceof Error ? err.message : err}`].filter(Boolean).join("; "); });
  }
  if (d.opsNotified.ntfy || d.opsNotified.email) {
    i.status = "queued_for_matchrv";
    i.statusDetail = `Queued: MatchRV does not have a direct connection to ${unit.dealer.name}, so the MatchRV team was alerted and will forward this inquiry. It has NOT reached the dealership yet.`;
  } else {
    i.status = "failed";
    i.statusDetail = `Not delivered: MatchRV could not reach ${unit.dealer.name} or its own team right now. The shopper should contact the dealership directly${unit.dealer.website ? ` (${unit.dealer.website})` : ""}. The request is kept for MatchRV to retry.`;
  }
}

// ── Status / ops ───────────────────────────────────────────────────────────

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export interface PublicInquiry {
  inquiryId: string; createdAt: string; status: InquiryStatus; statusDetail: string; dryRun: boolean;
  dealer: InquiryPreview["dealer"]; unit: InquiryPreview["unit"]; shopper: InquiryContact; message: string;
  deliveryChannel: DealerInquiry["delivery"]["channel"];
  dealerReply: DealerInquiry["dealerReply"];
  dealerReplyNote: string;
}
function toPublic(i: DealerInquiry): PublicInquiry {
  return {
    inquiryId: i.id, createdAt: i.createdAt, status: i.status, statusDetail: i.statusDetail, dryRun: i.dryRun,
    dealer: i.preview.dealer, unit: i.preview.unit, shopper: i.preview.shopper, message: i.preview.message,
    deliveryChannel: i.delivery.channel, dealerReply: i.dealerReply,
    dealerReplyNote: i.dealerReply ? "Reply recorded by MatchRV from the dealership." : "No dealer reply has been recorded by MatchRV. Dealers usually reply to the shopper directly by email or phone.",
  };
}

/** Status lookup. Returns null for unknown id OR wrong token (never reveals existence). */
export function getInquiryStatus(id: string, statusToken: string): PublicInquiry | null {
  load(); purge();
  const i = inquiries.get(id);
  if (!i || typeof statusToken !== "string") return null;
  const a = Buffer.from(i.statusTokenHash); const b = Buffer.from(hashToken(statusToken));
  return a.length === b.length && timingSafeEqual(a, b) ? toPublic(i) : null;
}

export function opsKeyValid(header: string | undefined): boolean {
  const key = process.env.INQUIRY_OPS_KEY;
  if (!key || !header) return false;
  const got = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const exp = Buffer.from(key);
  return got.length === exp.length && timingSafeEqual(got, exp);
}
export function opsGet(id: string): DealerInquiry | null { load(); return inquiries.get(id) ?? null; }
export function opsList(): DealerInquiry[] { load(); purge(); return [...inquiries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200); }
export function opsUpdate(id: string, update: { status?: "delivered" | "queued_for_matchrv" | "failed"; statusDetail?: string; dealerReply?: string }): DealerInquiry | null {
  load();
  const i = inquiries.get(id);
  if (!i || i.dryRun) return null;
  if (update.status) i.status = update.status;
  if (update.statusDetail) i.statusDetail = clean(update.statusDetail).slice(0, 500);
  if (update.dealerReply) i.dealerReply = { text: clean(update.dealerReply).slice(0, 4000), receivedAt: new Date().toISOString(), recordedBy: "matchrv_ops" };
  persistSoon();
  return i;
}

/** Test hooks. */
export function __setTransport(t: InquiryTransport | null): void { transport = t ?? defaultTransport; }
export function __setRoutes(r: Record<string, string>): void { routes = r; }
export function __resetInquiries(): void { inquiries.clear(); byNonce.clear(); hits.clear(); loaded = true; }
export function __inquiryCount(): number { return inquiries.size; }

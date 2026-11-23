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
 *                               dealership directly. A later sweep may retry
 *                               that same authorized delivery; it does not
 *                               invent a new recipient;
 *        - "forwarded"          a MatchRV operator confirmed in the lead inbox
 *                               that they sent it to the dealership. An ops
 *                               alert or a queued message is not this status;
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
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { beginDurableWrite, dataDirAcceptsWrites, endDurableWrite, DATA_DIR_FROZEN_GUIDANCE, isDataDirFrozen, registerDataWriter } from "./data-dir-freeze";
import type { CanonicalUnit } from "@workspace/agent-core";
import { formatFitLines, sanitizeFit, type ShopperFit } from "./shopper-fit";
import { advertisablePrice } from "../lib/unit-insights";
import { recordInquiryOutcome } from "./product-analytics";
import { DELIVERY_RETRY_BACKOFF_MS } from "./inquiry-safety-policy";
import { dataDir, writeFileAtomic } from "./atomic-file";
import { boundClientId, inquiryAttribution, recordAttributionEvent, type AttributionContext, type InquiryAttribution } from "./attribution";
import { compactAttribution, expandCompactAttribution, overlayAttribution, type CleanAttribution, type LeadRequestContext } from "./lead-attribution";
import { buildReceiptUrl, mintReceiptToken, recordDuplicateInquiry, recordLeadFromInquiry, syncInquiryDelivery } from "./lead-store";
import { leadTrackingEnabled, receiptLinksInEmailEnabled } from "./lead-tracking-config";
import { reportOffsiteGenerateLead } from "./ga4-measurement-protocol";
export type { ShopperFit };

export type InquiryStatus = "dry_run" | "delivered" | "queued_for_matchrv" | "failed" | "forwarded";

export interface InquiryDelivery {
  channel: "dealer_email" | "matchrv_forward" | "none";
  attemptedAt: string;
  dealerEmailAccepted: boolean;
  opsNotified: { ntfy: boolean; email: boolean };
  error: string | null;
  /** Recipient locked at the shopper's confirmed send. Retries use this, not a later route table. */
  authorized?: { kind: "dealer_email" | "ops_queue"; dealerEmail: string | null; dealerDomain: string | null };
  autoRetries?: number;
  nextRetryAt?: string | null;
  retryState?: "active" | "succeeded" | "permanent" | "exhausted" | "stopped";
  claim?: { token: string; until: string } | null;
}

export interface InquiryContact { name: string; email: string | null; phone: string | null }

/**
 * Optional numbers the shopper typed into the website payment calculator and chose to share
 * ("Share my payment numbers with the dealer", off by default). Shopper-entered estimates only:
 * not a financing offer, a rate quote or a credit check.
 */
export const CREDIT_RANGES = ["excellent_720_plus", "good_680_719", "fair_620_679", "rebuilding_below_620", "not_sure"] as const;
export type CreditRange = typeof CREDIT_RANGES[number];
export const CREDIT_RANGE_LABELS: Record<CreditRange, string> = {
  excellent_720_plus: "Excellent (720+)", good_680_719: "Good (680-719)", fair_620_679: "Fair (620-679)",
  rebuilding_below_620: "Rebuilding (below 620)", not_sure: "Not sure",
};
export interface PaymentEstimate {
  priceUsd: number | null; downUsd: number | null; tradeUsd: number | null; aprPct: number | null;
  termMonths: number | null; taxPct: number | null; estMonthlyUsd: number | null;
  /** Shopper's own estimate of their credit; no credit check. */
  creditRange: CreditRange | null;
  note: string;
}
const PAYMENT_NOTE = "Numbers the shopper entered in MatchRV's payment calculator. Shopper's own estimate, not a financing offer, rate quote or credit check.";

/** Validates the optional shared calculator numbers. Anything out of range is dropped (null), never guessed. */
export function cleanPaymentEstimate(raw: unknown): PaymentEstimate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 100) / 100 : null);
  const pe: PaymentEstimate = {
    priceUsd: num(r.priceUsd, 1, 10_000_000), downUsd: num(r.downUsd, 0, 10_000_000), tradeUsd: num(r.tradeUsd, 0, 10_000_000),
    aprPct: num(r.aprPct, 0, 40), termMonths: num(r.termMonths, 1, 360), taxPct: num(r.taxPct, 0, 20),
    estMonthlyUsd: num(r.estMonthlyUsd, 0, 1_000_000),
    creditRange: typeof r.creditRange === "string" && (CREDIT_RANGES as readonly string[]).includes(r.creditRange) ? (r.creditRange as CreditRange) : null,
    note: PAYMENT_NOTE,
  };
  if (pe.termMonths !== null) pe.termMonths = Math.round(pe.termMonths);
  const any = [pe.priceUsd, pe.downUsd, pe.tradeUsd, pe.aprPct, pe.termMonths, pe.taxPct, pe.estMonthlyUsd, pe.creditRange].some((v) => v !== null);
  return any ? pe : null;
}

export function paymentEstimateLines(pe: PaymentEstimate | null | undefined): string[] {
  if (!pe) return [];
  const usd = (v: number | null) => (v === null ? "-" : `$${v.toLocaleString("en-US", Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  return [
    "Payment numbers the shopper chose to share (their own estimate, not a financing offer or credit check):",
    `  Price used: ${usd(pe.priceUsd)}   Down: ${usd(pe.downUsd)}   Trade-in: ${usd(pe.tradeUsd)}`,
    `  APR entered: ${pe.aprPct === null ? "-" : `${pe.aprPct}%`}   Term: ${pe.termMonths === null ? "-" : `${pe.termMonths} months`}   Sales tax: ${pe.taxPct === null ? "-" : `${pe.taxPct}%`}`,
    `  Estimated monthly payment: ${usd(pe.estMonthlyUsd)}`,
    `  Credit (shopper's estimate, no credit check): ${pe.creditRange ? CREDIT_RANGE_LABELS[pe.creditRange] : "-"}`,
  ];
}
/** Same wording as the RV cards: a listed price is what the dealer last showed, not a quote. */
export const INQUIRY_PRICE_LABEL = "Last listed price";
export const INQUIRY_PRICE_ON_REQUEST = "Price on request";

export interface InquiryPreview {
  unit: {
    id: string; title: string; vin: string | null; stockNumber: string | null;
    /**
     * The price that passes the website's public listing rule (advertisablePrice),
     * else null. Before this rule it was the raw stored price; it is now null when
     * that price is suppressed (e.g. the dealer's own text names a different price).
     */
    priceUsd: number | null;
    condition: string; stockUrl: string | null; stockUrlNote: string | null;
    /** Always "Last listed price". Optional only because inquiries stored before it lack it. */
    priceLabel?: string;
    /** "$48,995" or "Price on request". Show this, under priceLabel, rather than formatting priceUsd. */
    priceDisplay?: string;
    /** true when there is no price MatchRV will show: ask the dealer. */
    priceOnRequest?: boolean;
  };
  dealer: { id: string; name: string; city: string; state: string; website: string | null };
  shopper: InquiryContact;
  message: string;
  /** Present only when the shopper ticked "Share my payment numbers with the dealer". */
  paymentEstimate?: PaymentEstimate | null;
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
  delivery: InquiryDelivery;
  /** When the lead entered queued_for_matchrv. Age alerts count from here. */
  queuedAt?: string;
  /** Set only by an explicit ops confirmation, never by a transport accept. */
  forwarded?: { at: string; by: "matchrv_ops" };
  /** ISO timestamps once an age or exhaustion alert was delivered. `pending:<ms>` is an in-flight claim. */
  safety?: { alert2hAt?: string; alert24hAt?: string; exhaustedAlertAt?: string };
  dealerReply: { text: string; receivedAt: string; recordedBy: "matchrv_ops" } | null;
  /** Set by MatchRV ops for internal test inquiries: shown as TEST in the lead inbox, never forwarded. */
  test?: boolean;
  /** RV-fit facts the shopper stated (budget, tow vehicle, …). Ops/dealer only; never in PublicInquiry or ntfy. */
  fit?: ShopperFit;
  /** Which integration this lead came through. Ops and reports only; never in PublicInquiry, dealer email or ntfy. */
  attribution?: InquiryAttribution;
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

/**
 * Secret that signs confirmation tokens and derives status tokens.
 *
 *   env        INQUIRY_SIGNING_SECRET is set: used as is.
 *   data_dir   not set: a secret generated once and kept in the data directory
 *              (0600), so previews survive a restart or deploy without any
 *              configuration change.
 *   ephemeral  not set and the data directory is not writable (or tests): a
 *              per-process secret, as before. A restart invalidates previews
 *              that have not been sent yet.
 */
export type SigningSecretSource = "env" | "data_dir" | "ephemeral";
let signing: { secret: string; source: SigningSecretSource } | null = null;
let signingSecretFileEnabled = process.env.NODE_ENV !== "test" && !process.env.VITEST;
let signingSecretPathOverride: string | null = null;
const signingSecretPath = () => signingSecretPathOverride ?? resolve(dataDir(), "inquiry-signing-secret");
function resolveSigningSecret(): { secret: string; source: SigningSecretSource } {
  const fromEnv = process.env.INQUIRY_SIGNING_SECRET;
  if (fromEnv) return { secret: fromEnv, source: "env" };
  if (signingSecretFileEnabled) {
    const p = signingSecretPath();
    try {
      if (existsSync(p)) {
        const stored = readFileSync(p, "utf8").trim();
        if (/^[a-f0-9]{64}$/.test(stored)) return { secret: stored, source: "data_dir" };
        console.warn("[inquiries] stored signing secret is malformed; replacing it");
      }
      if (dataDirAcceptsWrites() && !isDataDirFrozen()) {
        const fresh = randomBytes(32).toString("hex");
        writeFileAtomic(p, fresh);
        return { secret: fresh, source: "data_dir" };
      }
    } catch (err) {
      console.warn("[inquiries] could not read or create the signing secret file:", err instanceof Error ? (err as NodeJS.ErrnoException).code ?? err.name : "error");
    }
  }
  return { secret: randomBytes(32).toString("hex"), source: "ephemeral" };
}
function signingSecret(): string {
  if (!signing) {
    signing = resolveSigningSecret();
    if (signing.source === "ephemeral" && process.env.NODE_ENV === "production") {
      console.warn("[inquiries] signing secret is per-process: pending previews will not survive a restart. Set INQUIRY_SIGNING_SECRET or give the service a writable data directory.");
    } else if (process.env.NODE_ENV === "production") {
      console.log(`[inquiries] signing secret source: ${signing.source}`);
    }
  }
  return signing.secret;
}
/** Where the signing secret comes from. Never returns the secret. */
export function signingSecretSource(): SigningSecretSource {
  signingSecret();
  return signing!.source;
}
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

interface TokenPayload {
  u: string; n: string; e: string | null; p: string | null; m: string; pe?: PaymentEstimate | null; exp: number; nonce: string; f?: ShopperFit;
  /** Verified client id the preview was prepared by. Absent for unkeyed callers. Only that identity may send it. */
  c?: string;
  /** Lead attribution given at prepare time (LEAD_TRACKING_ENABLED only). Whitelisted values, no contact details. */
  a?: Partial<CleanAttribution>;
}
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string) => createHmac("sha256", signingSecret()).update(body).digest("base64url");
/** Status token for an inquiry, derived from the preview's nonce so a repeated send returns the same one. */
const statusTokenFor = (nonce: string) => `ist_${createHmac("sha256", signingSecret()).update(`status:${nonce}`).digest("base64url")}`;

/** The unit's own dealer listing page, when the snapshot has one and it is a plain http(s) URL. */
export function unitListingUrl(unit: CanonicalUnit): string | null {
  const url = unit.provenance.listingUrl;
  return typeof url === "string" && /^https?:\/\/[^\s<>"']+$/i.test(url) && url.length <= 600 ? url : null;
}

const usdText = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** "Last listed price: $48,995" or "Price on request", for any stored preview (old ones lack the new fields). */
export function inquiryPriceLine(u: InquiryPreview["unit"]): string {
  return u.priceUsd != null && !u.priceOnRequest ? `${u.priceLabel ?? INQUIRY_PRICE_LABEL}: ${usdText(u.priceUsd)}` : INQUIRY_PRICE_ON_REQUEST;
}

export function buildPreview(unit: CanonicalUnit, contact: InquiryContact, message: string, paymentEstimate: PaymentEstimate | null = null): InquiryPreview {
  const route = dealerRoute(unit.dealer.id);
  const stockUrl = unitListingUrl(unit);
  // The website's public listing rule: never show a stored price that fails it.
  const price = advertisablePrice(unit);
  return {
    unit: {
      id: unit.id, title: unit.title, vin: unit.vin, stockNumber: unit.stockNumber, priceUsd: price, condition: unit.condition,
      priceLabel: INQUIRY_PRICE_LABEL,
      priceDisplay: price != null ? usdText(price) : INQUIRY_PRICE_ON_REQUEST,
      priceOnRequest: price == null,
      stockUrl,
      stockUrlNote: stockUrl
        ? `The dealer's own listing page for this RV, last seen by MatchRV on ${unit.provenance.lastSeenAt.slice(0, 10)}. The dealer may have changed or removed it since.`
        : `MatchRV's snapshot does not store a per-unit listing URL for this RV; the dealership website is ${unit.dealer.website ?? unit.provenance.dealerDomain}.`,
    },
    dealer: { id: unit.dealer.id, name: unit.dealer.name, city: unit.dealer.city, state: unit.dealer.state, website: unit.dealer.website },
    shopper: contact,
    message,
    ...(paymentEstimate ? { paymentEstimate } : {}),
    delivery: route
      ? { channel: "dealer_email", explanation: `${unit.dealer.name} accepts MatchRV inquiries by email. After you confirm, MatchRV emails this exact message and your contact details to the dealership.` }
      : { channel: "matchrv_forward", explanation: `MatchRV does not have a direct inquiry connection with ${unit.dealer.name}. After you confirm, MatchRV stores the inquiry and its team forwards it to the dealership; the status will say queued until then.` },
    sendsNothingYet: true,
  };
}

export function prepareInquiry(
  unit: CanonicalUnit,
  input: { name?: string; email?: string | null; phone?: string | null; message?: string; fit?: unknown; paymentEstimate?: unknown },
  now = Date.now(),
  /** Bind the preview to a verified client. Omitted or null: an unkeyed caller. */
  binding: { clientId?: string | null; leadAttribution?: CleanAttribution | null } = {},
):
  | { ok: true; preview: InquiryPreview; confirmationToken: string; expiresAt: string; fit?: ShopperFit }
  | { ok: false; errors: ValidationError[] } {
  const v = validateContact(input);
  if (!v.ok) return v;
  const fit = sanitizeFit(input.fit);
  const pe = cleanPaymentEstimate(input.paymentEstimate);
  const leadAttr = leadTrackingEnabled() && binding.leadAttribution ? compactAttribution(binding.leadAttribution) : null;
  const payload: TokenPayload = { u: unit.id, n: v.contact.name, e: v.contact.email, p: v.contact.phone, m: v.message, ...(pe ? { pe } : {}), exp: now + TOKEN_TTL_MS, nonce: randomBytes(9).toString("base64url"), ...(fit ? { f: fit } : {}), ...(binding.clientId ? { c: binding.clientId } : {}), ...(leadAttr ? { a: leadAttr } : {}) };
  const body = b64(JSON.stringify(payload));
  return { ok: true, preview: buildPreview(unit, v.contact, v.message, pe), confirmationToken: `dic_${body}.${sign(body)}`, expiresAt: new Date(payload.exp).toISOString(), ...(fit ? { fit } : {}) };

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
let diskDirty = false;

let storePathOverride: string | null = null;
function storePath(): string {
  if (storePathOverride) return storePathOverride;
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
function persistSync(): void {
  if (!persistenceEnabled) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    const p = storePath();
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify([...inquiries.values()].filter((i) => !i.dryRun)));
    renameSync(tmp, p);
    diskDirty = false;
  } catch (err) {
    diskDirty = true;
    console.warn("[inquiries] could not persist store:", err instanceof Error ? err.message : err);
  }
}
function persistSoon(): void {
  if (!persistenceEnabled) return;
  diskDirty = true;
  if (!dataDirAcceptsWrites()) return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; persistSync(); }, 300);
}
function inquiriesPending(): boolean {
  return persistenceEnabled && (diskDirty || saveTimer != null);
}
registerDataWriter({ name: "dealer-inquiries", pending: inquiriesPending, flush: persistSync });

// ── Rate limiting ──────────────────────────────────────────────────────────

const hits = new Map<string, number[]>();
const LIMITS: Record<string, { max: number; windowMs: number }> = {
  requester: { max: 10, windowMs: 60 * 60 * 1000 },
  contact: { max: 5, windowMs: 60 * 60 * 1000 },
  global: { max: 300, windowMs: 60 * 60 * 1000 },
  preview: { max: 60, windowMs: 60 * 60 * 1000 },
};
export function rateLimit(kind: keyof typeof LIMITS, key: string, now = Date.now(), maxOverride?: number): boolean {
  const { windowMs } = LIMITS[kind];
  const max = maxOverride ?? LIMITS[kind].max;
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
  | { ok: true; inquiry: PublicInquiry; statusToken: string; duplicate: boolean; /** This preview had already been sent; nothing was sent again. */ replayed?: boolean }
  | { ok: false; code: "not_confirmed" | "invalid_token" | "expired_token" | "unit_unavailable" | "rate_limited" | "writes_frozen" | "client_mismatch" | "client_not_permitted"; guidance: string };

interface SendArgs {
  confirmationToken: string; confirmed: boolean; dryRun?: boolean;
  requesterKey: string; scope: string | null;
  /** Fit facts recalled from this shopper's interview scope (ChatGPT path). Token fit wins when present. */
  fitHint?: ShopperFit | null;
  lookupUnit: (id: string) => CanonicalUnit | undefined;
  /** Where this send was accepted. Omitted callers stay "unknown" rather than guessed. */
  analyticsSource?: "mcp" | "website" | "unknown";
  /** Who is sending. A verified client may only send previews it prepared, and unkeyed callers only unbound ones. */
  attribution?: AttributionContext | null;
  /** Clock for createdAt and the delivery attempt. Defaults to Date.now(). */
  now?: number;
  /** Lead tracking context for this request (headers, attribution). Ignored unless LEAD_TRACKING_ENABLED. */
  leadContext?: LeadRequestContext | null;
}

/** Sends that have passed every check and are being delivered, by preview nonce. */
const inFlight = new Map<string, Promise<SendResult>>();

/** The stored result for a preview that was already sent, or null. Never delivers anything. */
function replayOf(nonce: string): SendResult | null {
  const id = byNonce.get(nonce);
  const existing = id ? inquiries.get(id) : undefined;
  if (!existing) return null;
  const token = statusTokenFor(nonce);
  // Inquiries stored before status tokens were derived keep their original random token, which cannot be shown again.
  const same = existing.statusTokenHash === hashToken(token);
  return { ok: true, inquiry: toPublic(existing), statusToken: same ? token : "(use the status token from the first send)", duplicate: !same, replayed: true };
}

/**
 * Send a previewed inquiry. Idempotent per preview: the first confirmed call
 * delivers it; any later or concurrent call with the same token returns that
 * same inquiry and status token, and delivers nothing.
 */
export async function sendInquiry(args: SendArgs): Promise<SendResult> {
  const note = (result: SendResult): SendResult => {
    try {
      recordInquiryOutcome({
        source: args.analyticsSource ?? "unknown",
        status: result.ok ? result.inquiry.status : result.code,
        channel: result.ok ? result.inquiry.deliveryChannel : "none",
        duplicate: result.ok ? result.duplicate || result.replayed === true : false,
        dryRun: result.ok ? result.inquiry.dryRun : false,
        listingId: result.ok ? result.inquiry.unit.id : undefined,
        dealerId: result.ok ? result.inquiry.dealer.id : undefined,
      });
    } catch {
      /* analytics must not change inquiry handling */
    }
    return result;
  };
  const durable = args.confirmed === true && !(Boolean(args.dryRun) || forceDryRun());
  if (durable && !beginDurableWrite()) {
    return note({ ok: false, code: "writes_frozen", guidance: DATA_DIR_FROZEN_GUIDANCE });
  }
  try {
    const now = args.now ?? Date.now();
    load();
    if (dataDirAcceptsWrites()) purge();
    if (args.confirmed !== true) return note({ ok: false, code: "not_confirmed", guidance: "Show the shopper the preview and only call again with confirmed=true after they explicitly say to send it." });
    const v = verifyToken(args.confirmationToken, now);
    if (!v.ok) return note({ ok: false, code: v.code, guidance: v.code === "expired_token" ? "The preview expired (30 minutes). Prepare a new preview and confirm it with the shopper again." : "Unknown or altered confirmation token. Prepare a new preview." });
    const p = v.payload;
    // Identity check comes before the replay lookup, so a token in the wrong hands cannot read back the stored inquiry.
    const caller = boundClientId(args.attribution);
    if ((p.c ?? null) !== caller) {
      recordAttributionEvent(args.attribution ?? null, "inquiry_client_mismatch", null);
      return note({ ok: false, code: "client_mismatch", guidance: "This preview was prepared under a different client identity. Only the API key that prepared a preview can send it, and a preview prepared without a key cannot be sent with one. Nothing was sent; prepare a new preview." });
    }
    if (caller && !args.attribution?.scopes.includes("inquiry")) {
      return note({ ok: false, code: "client_not_permitted", guidance: "This API key is not allowed to send dealer inquiries. Nothing was sent." });
    }
    const replay = replayOf(p.nonce);
    if (replay) return note(replay);
    const running = inFlight.get(p.nonce);
    if (running) {
      const first = await running;
      return first.ok ? { ...first, replayed: true } : first;
    }
    const job = performSend(args, p, now, durable);
    inFlight.set(p.nonce, job);
    try {
      return note(await job);
    } finally {
      inFlight.delete(p.nonce);
    }
  } finally {
    if (durable) endDurableWrite();
  }
}

async function performSend(args: SendArgs, p: TokenPayload, now: number, durable: boolean): Promise<SendResult> {
  const unit = args.lookupUnit(p.u);
  if (!unit || unit.status === "removed") return { ok: false, code: "unit_unavailable", guidance: "This RV is no longer in MatchRV's inventory snapshot. Nothing was sent." };
  const dryRun = Boolean(args.dryRun) || forceDryRun();
  const contactKey = (p.e ?? p.p ?? "").toLowerCase();
  // A verified client spends its own hourly budget and never the shared one, so no partner can use up sends for everyone else.
  const partner = boundClientId(args.attribution);
  const requesterOk = partner
    ? rateLimit("requester", `client:${partner}`, undefined, args.attribution?.limits?.inquiriesPerHour)
    : rateLimit("requester", args.requesterKey);
  if (!requesterOk || !rateLimit("contact", contactKey) || (!partner && !rateLimit("global", "all"))) {
    return { ok: false, code: "rate_limited", guidance: "Too many inquiries were sent recently from this conversation or contact. Nothing was sent; try again later or contact the dealership directly." };
  }

  const contact: InquiryContact = { name: p.n, email: p.e, phone: p.p };
  const preview = buildPreview(unit, contact, p.m, p.pe ? cleanPaymentEstimate(p.pe) : null);
  const fit = sanitizeFit(p.f) ?? sanitizeFit(args.fitHint) ?? undefined;
  const statusToken = statusTokenFor(p.nonce);
  const inquiry: DealerInquiry = {
    id: `inq_${randomBytes(9).toString("base64url")}`,
    createdAt: new Date(now).toISOString(),
    status: "failed", statusDetail: "", dryRun, nonce: p.nonce,
    statusTokenHash: hashToken(statusToken), scope: args.scope, preview,
    delivery: { channel: "none", attemptedAt: new Date(now).toISOString(), dealerEmailAccepted: false, opsNotified: { ntfy: false, email: false }, error: null },
    dealerReply: null,
    ...(fit ? { fit } : {}),
    ...(args.attribution ? { attribution: inquiryAttribution(args.attribution, unit.id, now) } : {}),
  };
  // Duplicate guard: same contact + unit within 24h returns a duplicate notice instead of resending.
  let receipt: { token: string; hash: string } | null = null;
  const dup = [...inquiries.values()].find((i) => !i.dryRun && !dryRun && i.preview.unit.id === unit.id && (i.preview.shopper.email ?? i.preview.shopper.phone ?? "").toLowerCase() === contactKey && now - Date.parse(i.createdAt) < 24 * 60 * 60 * 1000 && i.status !== "failed");

  if (dryRun) {
    inquiry.status = "dry_run";
    inquiry.statusDetail = "Dry run: validated and recorded for testing. Nothing was sent to the dealership or to MatchRV staff.";
  } else if (dup) {
    if (args.leadContext) recordDuplicateInquiry(dup.id, leadContextWithToken(args.leadContext, p), now);
    return { ok: true, inquiry: toPublic(dup), statusToken: "(use the status token from the first send)", duplicate: true };
  } else {
    // Reserve the nonce before the first await so nothing else can deliver this preview.
    byNonce.set(inquiry.nonce, inquiry.id);
    // Receipt link: minted only when it will go in the email. The raw token lives only in that email.
    receipt = receiptLinksInEmailEnabled() && args.leadContext && !isTestInquiry(inquiry) ? mintReceiptToken() : null;
    try {
      await deliver(inquiry, unit, now, receipt ? buildReceiptUrl(receipt.token) : null);
    } catch (err) {
      byNonce.delete(inquiry.nonce);
      throw err;
    }
  }
  inquiries.set(inquiry.id, inquiry);
  byNonce.set(inquiry.nonce, inquiry.id);
  if (durable || dataDirAcceptsWrites()) persistSoon();
  if (!dryRun && args.leadContext && leadTrackingEnabled()) {
    recordLeadFromInquiry({ inquiry: leadInputFor(inquiry), unit, ctx: leadContextWithToken(args.leadContext, p), receiptTokenHash: receipt?.hash ?? null, now });
  }
  // GA4 MP is independent of LEAD_TRACKING_ENABLED. Website browser leads
  // already send generate_lead from gtag; this only fires for off-site
  // sources (ChatGPT/MCP, LotAI, native app) and never throws.
  if (!dryRun && !isTestInquiry(inquiry)) {
    reportOffsiteGenerateLead({
      ctx: args.leadContext ? leadContextWithToken(args.leadContext, p) : null,
      unitId: unit.id,
      dealerId: unit.dealer.id,
      priceUsd: typeof unit.priceUsd === "number" ? unit.priceUsd : null,
      inquiryId: inquiry.id,
    });
  }
  return { ok: true, inquiry: toPublic(inquiry), statusToken, duplicate: false };
}

/** Prepare-time attribution from the signed token, overlaid by what the send call said. */
function leadContextWithToken(ctx: LeadRequestContext, p: TokenPayload): LeadRequestContext {
  const fromToken = p.a ? expandCompactAttribution(p.a) : null;
  return fromToken ? { ...ctx, attribution: overlayAttribution(fromToken, ctx.attribution) } : ctx;
}

function leadInputFor(i: DealerInquiry) {
  const s = i.preview.shopper; const u = i.preview.unit; const d = i.preview.dealer;
  return {
    inquiryId: i.id, createdAt: i.createdAt, status: i.status, channel: i.delivery.channel, test: isTestInquiry(i),
    contact: { name: s.name, email: s.email, phone: s.phone, message: i.preview.message },
    unit: { id: u.id, title: u.title, stockNumber: u.stockNumber, vin: u.vin, priceUsd: u.priceUsd },
    dealer: { id: d.id, name: d.name, city: d.city, state: d.state },
    shared: sharedSignals(i.preview.paymentEstimate ?? null),
  };
}

/** Trade-in / financing interest from payment numbers the shopper chose to share (lead-credit buying signals). */
function sharedSignals(pe: PaymentEstimate | null): { tradeIn: boolean; financing: boolean } | null {
  if (!pe) return null;
  return {
    tradeIn: typeof pe.tradeUsd === "number" && pe.tradeUsd > 0,
    financing: [pe.downUsd, pe.aprPct, pe.termMonths, pe.estMonthlyUsd].some((v) => typeof v === "number" && v > 0) || Boolean(pe.creditRange),
  };
}

const receiptLines = (url: string | null | undefined) => url
  ? ["", "Track this lead (for the dealership only): open this private link to confirm you received it and to record the outcome.", url]
  : [];

function dealerEmailText(i: DealerInquiry, receiptUrl: string | null = null): string {
  const s = i.preview.shopper; const u = i.preview.unit;
  const fitLines = formatFitLines(i.fit);
  return [
    `New shopper inquiry via MatchRV (ref ${i.id})`, "",
    `RV: ${u.title}`, `Stock #: ${u.stockNumber ?? "n/a"}   VIN: ${u.vin ?? "n/a"}   ${inquiryPriceLine(u)}`,
    ...(u.stockUrl ? [`Listing: ${u.stockUrl}`] : []), "",
    `Shopper: ${s.name}`, `Email: ${s.email ?? "-"}`, `Phone: ${s.phone ?? "-"}`, "",
    ...(fitLines.length ? ["Shopper fit (stated during MatchRV interview):", ...fitLines, ""] : []),
    "Message:", i.preview.message, "",
    ...(i.preview.paymentEstimate ? [...paymentEstimateLines(i.preview.paymentEstimate), ""] : []),
    "The shopper reviewed this exact message and asked MatchRV to send it. Reply directly to the shopper. To share your reply with MatchRV, reply-all or forward it to " + OPS_EMAIL + ".",
    ...receiptLines(receiptUrl),
  ].join("\n");
}

/** Plain-text block used by the ops inbox "Copy forward text" button and by dealer/ops email. */
export function formatInquiryForwardText(i: DealerInquiry): string {
  const p = i.preview; const s = p.shopper; const u = p.unit; const d = p.dealer;
  const fitLines = formatFitLines(i.fit);
  return [
    `To: ${d.name} (${d.city}, ${d.state})${d.website ? ` ${d.website}` : ""}`,
    `Subject: MatchRV shopper inquiry: ${u.title} (stock ${u.stockNumber ?? "n/a"})`,
    "",
    `A shopper asked about this RV through MatchRV (ref ${i.id}).`,
    `RV: ${u.title}`,
    `Stock #: ${u.stockNumber ?? "n/a"}   VIN: ${u.vin ?? "n/a"}   ${inquiryPriceLine(u)}`,
    ...(u.stockUrl ? [`Listing: ${u.stockUrl}`] : []),
    "",
    `Shopper: ${s.name}`, `Email: ${s.email ?? "-"}`, `Phone: ${s.phone ?? "-"}`,
    "",
    ...(fitLines.length ? ["Shopper fit:", ...fitLines, ""] : []),
    "Message:", p.message,
    ...(p.paymentEstimate ? ["", ...paymentEstimateLines(p.paymentEstimate)] : []),
  ].join("\n");
}

export function redactDeliveryError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]").slice(0, 300);
}

/** Permanent means the same attempt cannot succeed later (bad address, 4xx other than 429). Everything else stays retryable until the cap. */
export function classifyDeliveryFailure(message: string): "permanent" | "transient" {
  const m = message.toLowerCase();
  if (/email_not_configured|ntfy_not_configured|econn|etimedout|timeout|smtp down|network|temporar|429|http_5|ntfy_http_5/.test(m)) return "transient";
  if (/\b550\b|\b553\b|\b554\b|user unknown|invalid recipient|mailbox unavailable|permanent/.test(m)) return "permanent";
  if (/ntfy_http_4\d\d/.test(m) && !/ntfy_http_429/.test(m)) return "permanent";
  return "transient";
}

function worsen(current: "permanent" | "transient" | null, next: "permanent" | "transient"): "permanent" | "transient" {
  if (current === "transient" || next === "transient") return "transient";
  return "permanent";
}

function opsForwardPushBody(i: DealerInquiry): string {
  const firstName = i.preview.shopper.name.split(" ")[0];
  const u = i.preview.unit;
  const d = i.preview.dealer;
  return `${i.id}: ${firstName} asked about ${u.title} (stock ${u.stockNumber ?? "n/a"}) at ${d.name}, ${d.city} ${d.state}. Full contact details in the ops inbox / GET /api/inquiries/ops/${i.id}.`;
}

function opsForwardEmailText(i: DealerInquiry, dealerDomain: string | null, receiptUrl: string | null = null): string {
  const d = i.preview.dealer;
  const site = d.website ?? dealerDomain;
  return `Forward to: ${d.name}, ${d.city} ${d.state}${site ? ` (${site})` : ""}\n\n${dealerEmailText(i, receiptUrl)}`;
}

function deliveredDetail(dealerName: string): string {
  return `Emailed to ${dealerName}. "Delivered" means the dealership's mail server accepted it; it does not mean anyone has read or answered it yet.`;
}

function queuedDetail(dealerName: string): string {
  return `Queued: MatchRV does not have a direct connection to ${dealerName}, so the MatchRV team was alerted and will forward this inquiry. It has NOT reached the dealership yet.`;
}

function failedDetail(dealerName: string, website: string | null): string {
  return `Not delivered: MatchRV could not reach ${dealerName} or its own team right now. The shopper should contact the dealership directly${website ? ` (${website})` : ""}. The request is kept for MatchRV to retry.`;
}

function scheduleInitialFailure(i: DealerInquiry, now: number, failure: "permanent" | "transient"): void {
  i.delivery.autoRetries = 0;
  if (failure === "permanent") {
    i.delivery.retryState = "permanent";
    i.delivery.nextRetryAt = null;
    return;
  }
  i.delivery.retryState = "active";
  i.delivery.nextRetryAt = new Date(now + DELIVERY_RETRY_BACKOFF_MS[0]).toISOString();
}

export function isTestInquiry(i: DealerInquiry): boolean {
  if (i.dryRun || i.status === "dry_run" || i.test === true) return true;
  return /\bTEST\b/.test(i.preview?.shopper?.name ?? "");
}

async function deliver(i: DealerInquiry, unit: CanonicalUnit, now = Date.now(), receiptUrl: string | null = null): Promise<void> {
  const route = dealerRoute(unit.dealer.id);
  const d = i.delivery;
  const emailOn = transport.emailConfigured();
  const canEmailDealer = Boolean(route && emailOn);
  d.authorized = canEmailDealer
    ? { kind: "dealer_email", dealerEmail: route, dealerDomain: unit.provenance.dealerDomain ?? null }
    : { kind: "ops_queue", dealerEmail: null, dealerDomain: unit.provenance.dealerDomain ?? null };
  let dealerFailure: "permanent" | "transient" | null = null;
  let opsFailure: "permanent" | "transient" | null = null;
  if (canEmailDealer && route) {
    d.channel = "dealer_email";
    try {
      await transport.sendEmail({ to: route, subject: `MatchRV inquiry: ${unit.title} (stock ${unit.stockNumber ?? "n/a"})`, text: dealerEmailText(i, receiptUrl), replyTo: i.preview.shopper.email });
      d.dealerEmailAccepted = true;
      i.status = "delivered";
      i.statusDetail = deliveredDetail(unit.dealer.name);
      d.retryState = "succeeded";
      d.nextRetryAt = null;
    } catch (err) {
      dealerFailure = classifyDeliveryFailure(redactDeliveryError(err));
      d.error = `dealer_email_failed: ${redactDeliveryError(err)}`;
    }
  }
  if (i.status === "delivered") {
    await transport.notifyOps({ title: "MatchRV inquiry delivered", body: `${i.id}: ${unit.title} -> ${unit.dealer.name} (${unit.dealer.city}, ${unit.dealer.state}). Delivered by email.` }).then(() => { d.opsNotified.ntfy = true; }, () => {});
    return;
  }
  // No direct route (or it failed): queue for MatchRV to forward and alert ops.
  // Reaching ops is not proof the dealer received the inquiry.
  d.channel = "matchrv_forward";
  await transport.notifyOps({ title: "MatchRV inquiry to forward", body: opsForwardPushBody(i) }).then(() => { d.opsNotified.ntfy = true; }, (err) => {
    opsFailure = worsen(opsFailure, classifyDeliveryFailure(redactDeliveryError(err)));
    d.error = [d.error, `ntfy_failed: ${redactDeliveryError(err)}`].filter(Boolean).join("; ");
  });
  if (emailOn) {
    await transport.sendEmail({ to: OPS_EMAIL, subject: `[MatchRV] Forward inquiry ${i.id} to ${unit.dealer.name}`, text: opsForwardEmailText(i, unit.provenance.dealerDomain ?? null, receiptUrl), replyTo: i.preview.shopper.email })
      .then(() => { d.opsNotified.email = true; }, (err) => {
        opsFailure = worsen(opsFailure, classifyDeliveryFailure(redactDeliveryError(err)));
        d.error = [d.error, `ops_email_failed: ${redactDeliveryError(err)}`].filter(Boolean).join("; ");
      });
  }
  if (d.opsNotified.ntfy || d.opsNotified.email) {
    i.status = "queued_for_matchrv";
    i.queuedAt = new Date(now).toISOString();
    i.statusDetail = queuedDetail(unit.dealer.name);
    d.retryState = "succeeded";
    d.nextRetryAt = null;
    return;
  }
  i.status = "failed";
  i.statusDetail = failedDetail(unit.dealer.name, unit.dealer.website);
  const failure = dealerFailure === "transient" || opsFailure === "transient" ? "transient" : "permanent";
  scheduleInitialFailure(i, now, failure);
}

export type AuthorizedRetryOutcome = "delivered" | "queued" | "transient" | "permanent" | "skipped";

/**
 * Replay the delivery authorized on the original confirmed send.
 * Ops-queue leads are never turned into a dealer email, even if a route appears later.
 * Dealer leads go back to the stored address, not the current route table.
 */
export async function attemptAuthorizedRetry(i: DealerInquiry, now: number, stillFailed: () => boolean): Promise<AuthorizedRetryOutcome> {
  if (!stillFailed()) return "skipped";
  const auth = i.delivery.authorized;
  if (!auth) return "skipped";
  const d = i.delivery;
  let dealerFailure: "permanent" | "transient" | null = null;
  let opsFailure: "permanent" | "transient" | null = null;
  if (auth.kind === "dealer_email" && auth.dealerEmail && !d.dealerEmailAccepted) {
    if (!stillFailed()) return "skipped";
    try {
      await transport.sendEmail({
        to: auth.dealerEmail,
        subject: `MatchRV inquiry: ${i.preview.unit.title} (stock ${i.preview.unit.stockNumber ?? "n/a"})`,
        text: dealerEmailText(i),
        replyTo: i.preview.shopper.email,
      });
      d.dealerEmailAccepted = true;
      if (!stillFailed()) return "skipped";
      d.channel = "dealer_email";
      d.error = null;
      i.status = "delivered";
      i.statusDetail = deliveredDetail(i.preview.dealer.name);
      await transport.notifyOps({
        title: "MatchRV inquiry delivered",
        body: `${i.id}: ${i.preview.unit.title} -> ${i.preview.dealer.name} (${i.preview.dealer.city}, ${i.preview.dealer.state}). Delivered by email.`,
      }).then(() => { d.opsNotified.ntfy = true; }, () => {});
      syncInquiryDelivery(i.id, { status: "delivered", now });
      return "delivered";
    } catch (err) {
      dealerFailure = classifyDeliveryFailure(redactDeliveryError(err));
      d.error = `dealer_email_failed: ${redactDeliveryError(err)}`;
    }
  }
  if (!stillFailed()) return "skipped";
  if (!d.opsNotified.ntfy && !d.opsNotified.email) {
    const pushOn = transport.opsPushConfigured();
    const emailOn = transport.emailConfigured();
    if (!pushOn && !emailOn) return dealerFailure === "permanent" ? "permanent" : "transient";
    if (pushOn) {
      if (!stillFailed()) return "skipped";
      try {
        await transport.notifyOps({ title: "MatchRV inquiry to forward", body: opsForwardPushBody(i) });
        d.opsNotified.ntfy = true;
      } catch (err) {
        opsFailure = worsen(opsFailure, classifyDeliveryFailure(redactDeliveryError(err)));
        d.error = [d.error, `ntfy_failed: ${redactDeliveryError(err)}`].filter(Boolean).join("; ");
      }
    }
    if (!stillFailed()) return "skipped";
    if (emailOn) {
      try {
        await transport.sendEmail({
          to: OPS_EMAIL,
          subject: `[MatchRV] Forward inquiry ${i.id} to ${i.preview.dealer.name}`,
          text: opsForwardEmailText(i, auth.dealerDomain),
          replyTo: i.preview.shopper.email,
        });
        d.opsNotified.email = true;
      } catch (err) {
        opsFailure = worsen(opsFailure, classifyDeliveryFailure(redactDeliveryError(err)));
        d.error = [d.error, `ops_email_failed: ${redactDeliveryError(err)}`].filter(Boolean).join("; ");
      }
    }
  }
  if (!stillFailed()) return "skipped";
  if (d.opsNotified.ntfy || d.opsNotified.email) {
    if (i.status !== "delivered") {
      d.channel = "matchrv_forward";
      i.status = "queued_for_matchrv";
      i.queuedAt = new Date(now).toISOString();
      i.statusDetail = queuedDetail(i.preview.dealer.name);
    }
    syncInquiryDelivery(i.id, { status: i.status, now });
    return i.status === "delivered" ? "delivered" : "queued";
  }
  if (dealerFailure === "transient" || opsFailure === "transient") return "transient";
  return "permanent";
}

/** Age and exhaustion alerts. No shopper name, contact, message, or payment numbers. */
export async function emitOpsAlert(msg: { title: string; body: string }): Promise<"sent" | "unconfigured" | "failed"> {
  const push = transport.opsPushConfigured();
  const email = transport.emailConfigured();
  if (!push && !email) return "unconfigured";
  let sent = false;
  if (push) {
    try { await transport.notifyOps({ title: msg.title, body: msg.body }); sent = true; }
    catch { /* the mailbox may still be up */ }
  }
  if (email) {
    try { await transport.sendEmail({ to: OPS_EMAIL, subject: msg.title, text: msg.body }); sent = true; }
    catch { /* counted below */ }
  }
  return sent ? "sent" : "failed";
}

export function listStoredInquiries(): DealerInquiry[] {
  load();
  return [...inquiries.values()];
}

export function persistInquiriesSync(): void {
  if (!persistenceEnabled) return;
  if (!dataDirAcceptsWrites()) { diskDirty = true; return; }
  persistSync();
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
  load();
  if (dataDirAcceptsWrites()) purge();
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
export function opsList(): DealerInquiry[] { load(); if (dataDirAcceptsWrites()) purge(); return [...inquiries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200); }
export function opsUpdate(id: string, update: { status?: "delivered" | "queued_for_matchrv" | "failed"; statusDetail?: string; dealerReply?: string; test?: boolean }): DealerInquiry | null {
  if (isDataDirFrozen()) return null;
  load();
  const i = inquiries.get(id);
  if (!i || i.dryRun) return null;
  // Forwarded is sticky: a generic status edit must not downgrade a confirmed forward.
  if (update.status && i.status !== "forwarded") i.status = update.status;
  if (typeof update.test === "boolean") i.test = update.test;
  if (update.statusDetail) i.statusDetail = clean(update.statusDetail).slice(0, 500);
  if (update.dealerReply) i.dealerReply = { text: clean(update.dealerReply).slice(0, 4000), receivedAt: new Date().toISOString(), recordedBy: "matchrv_ops" };
  persistSoon();
  syncInquiryDelivery(i.id, { status: update.status ? i.status : undefined, dealerReplyRecorded: Boolean(update.dealerReply) });
  return i;
}

/**
 * Explicit ops confirmation that this lead was sent to the dealership.
 * Copying the forward text does not call this. A failed call leaves status unchanged.
 */
export function confirmInquiryForwarded(id: string, now = Date.now()): { ok: true; inquiry: DealerInquiry } | { ok: false; code: "not_found" | "not_forwardable" | "writes_frozen" } {
  if (isDataDirFrozen()) return { ok: false, code: "writes_frozen" };
  load();
  const i = inquiries.get(id);
  if (!i) return { ok: false, code: "not_found" };
  if (i.status === "forwarded" && i.forwarded) return { ok: true, inquiry: i };
  if (isTestInquiry(i) || i.dryRun || i.status === "dry_run") return { ok: false, code: "not_forwardable" };
  if (i.status !== "queued_for_matchrv" && i.status !== "failed") return { ok: false, code: "not_forwardable" };
  i.status = "forwarded";
  i.forwarded = { at: new Date(now).toISOString(), by: "matchrv_ops" };
  i.statusDetail = `Forwarded: a MatchRV operator confirmed this inquiry was sent to ${i.preview.dealer.name}. It has left MatchRV. This does not mean the dealership has read or answered it.`;
  i.delivery.nextRetryAt = null;
  if (i.delivery.retryState === "active") i.delivery.retryState = "stopped";
  persistSync();
  syncInquiryDelivery(i.id, { status: "forwarded", now });
  return { ok: true, inquiry: i };
}

/** Test hooks. */
export function __setSigningSecretFileForTests(enabled: boolean, filePath?: string): void {
  signingSecretFileEnabled = enabled;
  signingSecretPathOverride = filePath ?? null;
  signing = null;
}
export function __setTransport(t: InquiryTransport | null): void { transport = t ?? defaultTransport; }
export function __setRoutes(r: Record<string, string>): void { routes = r; }
export function __resetInquiries(): void { inquiries.clear(); byNonce.clear(); hits.clear(); loaded = true; }
export function __inquiryCount(): number { return inquiries.size; }
export function __exportInquiries(): DealerInquiry[] { return structuredClone([...inquiries.values()]); }
export function __importInquiries(rows: DealerInquiry[]): void {
  inquiries.clear();
  byNonce.clear();
  loaded = true;
  for (const row of structuredClone(rows)) {
    inquiries.set(row.id, row);
    if (row.nonce) byNonce.set(row.nonce, row.id);
  }
}
export function __setPersistenceForTests(enabled: boolean, filePath?: string): void {
  persistenceEnabled = enabled;
  storePathOverride = filePath ?? null;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  diskDirty = false;
}
export function __reloadPersistedInquiries(): void {
  inquiries.clear();
  byNonce.clear();
  loaded = false;
  load();
}

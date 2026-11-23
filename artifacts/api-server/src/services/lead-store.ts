/**
 * Canonical lead records: MatchRV's own source of truth for every dealer lead.
 *
 * One record per lead, whatever the entry point (website/app inquiry API,
 * /mcp send_dealer_inquiry, /mcp/v1 send_inquiry, the legacy /api/leads
 * route). The dealer inquiry store (dealer-inquiries.json) still owns
 * delivery; this store owns attribution, qualification, repeats, the outcome
 * lifecycle and the dealer receipt.
 *
 * Storage: one JSON file in the data directory (LEADS_PATH, else
 * <data dir>/leads.json), written with the same atomic temp+fsync+rename
 * pattern as the other durable stores, mode 0600, a daily .bak restore point,
 * debounced 300 ms, registered with the data-dir freeze so a freeze flushes
 * it and then stops it. Nothing is written unless LEAD_TRACKING_ENABLED.
 *
 * PII: name, email, phone and message live only here (and in the inquiry
 * store that already had them). Analytics events, logs and the funnel file
 * get ids, hashes and enums only. Receipt tokens are stored as SHA-256.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { CanonicalUnit } from "@workspace/agent-core";
import { backupPath, readJsonWithBackup, writeFileAtomic } from "./atomic-file";
import { dataDirAcceptsWrites, isDataDirFrozen, registerDataWriter } from "./data-dir-freeze";
import {
  classifyTraffic, emptyJourney, resolveSource,
  type CleanAttribution, type EntryPoint, type JourneySummary, type LeadRequestContext, type LeadSource, type LeadSurface, type TrafficClass,
} from "./lead-attribution";
import { dedupeWindowDays, leadsPath, leadTrackingEnabled, piiRetentionDays, publicBaseUrl } from "./lead-tracking-config";
import { journeyForSession, recordFunnelStep, sessionKeyFor } from "./lead-funnel";
import { captureLeadAnalyticsEvent } from "./product-analytics";
import { buildCreditEvidence, CREDIT_POLICY_VERSION, detectBuyingSignals, emptyReview, leadCreditEnabled, type CreditReview, type LeadCredit } from "./lead-credit";
import { clicksForSession, outboundSessionHash } from "./outbound-clicks";

export const LEAD_SCHEMA_VERSION = 1;
/** Version of the qualified rule below. Bump when the rule changes so old rows stay explainable. */
export const QUALIFIED_RULE_VERSION = 1;

export const LEAD_STAGES = ["sent", "delivered", "opened", "dealer_responded", "appointment", "sold", "lost"] as const;
export type LeadStage = typeof LEAD_STAGES[number];
const STAGE_RANK: Record<LeadStage, number> = { sent: 0, delivered: 1, opened: 2, dealer_responded: 3, appointment: 4, sold: 5, lost: 5 };

export const LOST_REASONS = ["bought_elsewhere", "unit_sold", "no_response_from_shopper", "financing", "price", "not_a_fit", "duplicate", "spam", "wrong_number", "other"] as const;
export type LostReason = typeof LOST_REASONS[number];

export const PRICE_BANDS = ["under_20k", "20k_40k", "40k_60k", "60k_100k", "100k_200k", "200k_plus", "unknown"] as const;
export type PriceBand = typeof PRICE_BANDS[number];

export function priceBand(price: number | null | undefined): PriceBand {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return "unknown";
  if (price < 20_000) return "under_20k";
  if (price < 40_000) return "20k_40k";
  if (price < 60_000) return "40k_60k";
  if (price < 100_000) return "60k_100k";
  if (price < 200_000) return "100k_200k";
  return "200k_plus";
}

export interface LeadContact { name: string | null; email: string | null; phone: string | null; message: string | null }

export interface LeadQualification {
  has_name: boolean;
  has_contact: boolean;
  specific_unit: boolean;
  exclusivity: boolean;
  qualified: boolean;
  rule_version: number;
}

export interface LeadLifecycle {
  stage: LeadStage;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  dealer_responded_at: string | null;
  appointment_at: string | null;
  sold_at: string | null;
  lost_at: string | null;
  lost_reason: LostReason | null;
  /** dealer_responded_at - sent_at, in minutes. Null until a response is recorded. */
  response_time_minutes: number | null;
  /** Who recorded the latest outcome. */
  outcome_by: "dealer_receipt" | "matchrv_ops" | null;
}

export interface LeadRepeat { at: string; inquiry_id: string | null; unit_id: string | null; source: LeadSource; surface: LeadSurface | null }

export interface LeadRecord {
  schema_version: number;
  lead_id: string;
  created_at: string;
  entry_point: EntryPoint;
  inquiry_ids: string[];
  source: LeadSource;
  /** True only when a valid MatchRV API key identified the client. */
  source_verified: boolean;
  surface: LeadSurface;
  traffic: Exclude<TrafficClass, "bot">;
  campaign: {
    campaign: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
    utm_term: string | null; utm_content: string | null; referrer_host: string | null; landing_page: string | null;
  };
  client: { platform: string | null; app_version: string | null };
  ids: {
    session_id: string | null; device_id: string | null; anonymous_id: string | null;
    agent_tier: string | null; agent_client_id: string | null; agent_client_name: string | null; agent_host_label: string | null; agent_session_hash: string | null;
  };
  unit: {
    id: string | null; stock_number: string | null; vin: string | null; title: string | null;
    /** The price shown to the shopper at inquiry (public listing rule), else null. */
    price_usd: number | null; price_band: PriceBand;
    unit_type: string | null; condition: string | null; year: number | null; make: string | null; model: string | null;
  };
  dealer: { id: string | null; name: string | null; city: string | null; state: string | null };
  region: string | null;
  delivery: { inquiry_status: string | null; channel: string | null };
  contact: LeadContact | null;
  /** Salted hashes of the normalized email and phone. Used for repeats and exclusivity; kept after a PII purge. */
  contact_hashes: string[];
  qualification: LeadQualification;
  test: boolean;
  lifecycle: LeadLifecycle;
  receipt: { token_hash: string; created_at: string; views: number; prefetch_views: number; last_viewed_at: string | null } | null;
  repeat_count: number;
  repeats: LeadRepeat[];
  journey: JourneySummary;
  /** Placeholders for the owner's unit economics. Not computed. */
  cost_usd: number | null;
  revenue_usd: number | null;
  pii_purged_at: string | null;
  /**
   * First-touch evidence and the dealer-dispute review (services/lead-credit.ts).
   * Optional: leads recorded before this field existed have none. Adding it does
   * not change the file schema version; older builds ignore it.
   */
  credit?: LeadCredit | null;
}

interface LeadFile { schema_version: number; created_at: string; hash_salt: string; leads: LeadRecord[] }

// ── State ──────────────────────────────────────────────────────────────────

const leads = new Map<string, LeadRecord>();
const byInquiry = new Map<string, string>();
const byReceipt = new Map<string, string>();
let salt: string | null = null;
let fileCreatedAt: string | null = null;
let loaded = false;
/** A file from a newer schema is never overwritten. */
let readOnly = false;
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceEnabled = process.env.NODE_ENV !== "test" && !process.env.VITEST;
let pathOverride: string | null = null;
let lastBackupDay: string | null = null;
let lastWriteError: string | null = null;

const storeFile = () => pathOverride ?? leadsPath();

function isLeadFile(v: unknown): v is LeadFile {
  return Boolean(v) && typeof v === "object" && Array.isArray((v as LeadFile).leads);
}

/** Migrations by version. v0 (no schema_version) has never shipped; it is treated as v1. */
export function migrateLeadFile(file: LeadFile): { file: LeadFile; migrated: boolean } {
  const from = typeof file.schema_version === "number" ? file.schema_version : 0;
  if (from > LEAD_SCHEMA_VERSION) return { file, migrated: false };
  let migrated = false;
  if (from < 1) {
    file.schema_version = 1;
    for (const l of file.leads) l.schema_version = 1;
    migrated = true;
  }
  return { file, migrated };
}

function index(l: LeadRecord): void {
  leads.set(l.lead_id, l);
  for (const id of l.inquiry_ids) byInquiry.set(id, l.lead_id);
  if (l.receipt) byReceipt.set(l.receipt.token_hash, l.lead_id);
}

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!persistenceEnabled) return;
  const p = storeFile();
  if (!existsSync(p) && !existsSync(backupPath(p))) return;
  const read = readJsonWithBackup(p, isLeadFile);
  if (!read.value) {
    // Unreadable file and backup: keep it, never overwrite it.
    readOnly = true;
    console.warn("[lead-tracking] lead store unreadable; writes disabled until it is repaired");
    return;
  }
  if (read.source === "backup") console.warn("[lead-tracking] lead store restored from its .bak copy");
  if ((read.value.schema_version ?? 0) > LEAD_SCHEMA_VERSION) {
    readOnly = true;
    console.warn(`[lead-tracking] lead store schema ${read.value.schema_version} is newer than this build (${LEAD_SCHEMA_VERSION}); writes disabled`);
  }
  const { file, migrated } = migrateLeadFile(read.value);
  salt = typeof file.hash_salt === "string" && /^[a-f0-9]{64}$/.test(file.hash_salt) ? file.hash_salt : null;
  fileCreatedAt = file.created_at ?? null;
  for (const l of file.leads) if (l && typeof l.lead_id === "string") index(l);
  if (migrated && !readOnly) dirty = true;
}

function hashSalt(): string {
  load();
  if (!salt) { salt = randomBytes(32).toString("hex"); dirty = true; }
  return salt;
}

function serialize(): string {
  const file: LeadFile = {
    schema_version: LEAD_SCHEMA_VERSION,
    created_at: fileCreatedAt ?? (fileCreatedAt = new Date().toISOString()),
    hash_salt: hashSalt(),
    leads: [...leads.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
  return JSON.stringify(file);
}

function persistSync(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!persistenceEnabled || readOnly) { dirty = false; return; }
  // Nothing changed since the last write (always the case while LEAD_TRACKING_ENABLED is off): never create or touch the file.
  if (!dirty) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const backup = lastBackupDay !== today;
    writeFileAtomic(storeFile(), serialize(), { backup });
    if (backup) lastBackupDay = today;
    dirty = false;
    lastWriteError = null;
  } catch (err) {
    dirty = true;
    lastWriteError = err instanceof Error ? (err as NodeJS.ErrnoException).code ?? err.name : "error";
    console.warn(`[lead-tracking] could not persist lead store: ${lastWriteError}`);
  }
}

function persistSoon(): void {
  dirty = true;
  if (!persistenceEnabled || readOnly || !dataDirAcceptsWrites() || saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; persistSync(); }, 300);
  saveTimer.unref?.();
}

registerDataWriter({ name: "lead-tracking", pending: () => persistenceEnabled && !readOnly && (dirty || saveTimer != null), flush: persistSync });

/** Mutations are allowed only when tracking is on and the data dir is not frozen. */
function canWrite(): boolean {
  return leadTrackingEnabled() && !isDataDirFrozen() && dataDirAcceptsWrites() && !readOnly;
}

// ── Hashing ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v && v.length <= 160 && EMAIL_RE.test(v) ? v : null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15 || /^(\d)\1+$/.test(digits.slice(-10))) return null;
  return digits.length === 10 ? `1${digits}` : digits;
}

function contactHashes(contact: LeadContact): string[] {
  const out: string[] = [];
  const e = normalizeEmail(contact.email);
  const p = normalizePhone(contact.phone);
  if (e) out.push(`e_${createHmac("sha256", hashSalt()).update(`email:${e}`).digest("hex").slice(0, 32)}`);
  if (p) out.push(`p_${createHmac("sha256", hashSalt()).update(`phone:${p}`).digest("hex").slice(0, 32)}`);
  return out;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// ── Receipt tokens ─────────────────────────────────────────────────────────

/** 32 random bytes (256 bits), base64url. Only the SHA-256 is stored. */
export function mintReceiptToken(): { token: string; hash: string } {
  const token = `lr_${randomBytes(32).toString("base64url")}`;
  return { token, hash: sha256(token) };
}

export const RECEIPT_TOKEN_RE = /^lr_[A-Za-z0-9_-]{43}$/;

/** The dealer receipt page URL for a raw token. */
export function buildReceiptUrl(token: string, base = publicBaseUrl()): string {
  return `${base}/lead-receipt/${token}`;
}

/** Look up a lead by raw receipt token. Constant-time compare on the stored hash. */
export function leadByReceiptToken(token: string): LeadRecord | null {
  if (!leadTrackingEnabled() || typeof token !== "string" || !RECEIPT_TOKEN_RE.test(token)) return null;
  load();
  const hash = sha256(token);
  const id = byReceipt.get(hash);
  const lead = id ? leads.get(id) : undefined;
  if (!lead?.receipt) return null;
  const a = Buffer.from(lead.receipt.token_hash, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? lead : null;
}

/** Issue (or replace) a lead's receipt token. Returns the raw token once; only its hash is kept. */
export function issueReceiptToken(leadId: string, now = Date.now()): { token: string; url: string } | null {
  if (!canWrite()) return null;
  load();
  const lead = leads.get(leadId);
  if (!lead) return null;
  const { token, hash } = mintReceiptToken();
  if (lead.receipt) byReceipt.delete(lead.receipt.token_hash);
  lead.receipt = { token_hash: hash, created_at: new Date(now).toISOString(), views: lead.receipt?.views ?? 0, prefetch_views: lead.receipt?.prefetch_views ?? 0, last_viewed_at: lead.receipt?.last_viewed_at ?? null };
  byReceipt.set(hash, lead.lead_id);
  persistSoon();
  return { token, url: buildReceiptUrl(token) };
}

// ── Qualification ──────────────────────────────────────────────────────────

/**
 * qualified (rule v1) = has_name AND has_contact AND specific_unit AND exclusivity, and the lead is not a test.
 *   has_name       a name of at least 2 characters containing a letter
 *   has_contact    a valid email or a valid 10-15 digit phone
 *   specific_unit  the inquiry names one unit that was in MatchRV's inventory at send time
 *   exclusivity    the same contact (email or phone hash) sent no lead to a DIFFERENT dealer
 *                  within the dedupe window either side of this lead. MatchRV always sends an
 *                  inquiry to exactly one dealer; this catches a shopper shopping one lead around.
 */
export function qualify(input: { contact: LeadContact; specificUnit: boolean; exclusive: boolean; test: boolean }): LeadQualification {
  const name = (input.contact.name ?? "").trim();
  const has_name = name.length >= 2 && /\p{L}/u.test(name);
  const has_contact = Boolean(normalizeEmail(input.contact.email) || normalizePhone(input.contact.phone));
  const qualified = has_name && has_contact && input.specificUnit && input.exclusive && !input.test;
  return { has_name, has_contact, specific_unit: input.specificUnit, exclusivity: input.exclusive, qualified, rule_version: QUALIFIED_RULE_VERSION };
}

function requalify(l: LeadRecord): void {
  const q = l.qualification;
  q.qualified = q.has_name && q.has_contact && q.specific_unit && q.exclusivity && !l.test;
}

// ── Creation ───────────────────────────────────────────────────────────────

export interface InquiryForLead {
  inquiryId: string;
  createdAt: string;
  status: string;
  channel: string;
  test: boolean;
  contact: LeadContact;
  unit: { id: string; title: string; stockNumber: string | null; vin: string | null; priceUsd: number | null };
  dealer: { id: string; name: string; city: string; state: string };
  /** What the shopper chose to share in the payment calculator (lead-credit buying signals). */
  shared?: { tradeIn: boolean; financing: boolean } | null;
}

export type LeadCreateResult =
  | { kind: "created"; lead: LeadRecord }
  | { kind: "repeat"; lead: LeadRecord }
  | { kind: "skipped"; reason: "disabled" | "frozen" | "bot" | "read_only" | "error" };

const MAX_REPEATS_KEPT = 50;

function surfaceFor(ctx: LeadRequestContext): LeadSurface {
  if (ctx.attribution.surface) return ctx.attribution.surface;
  // MCP shoppers reach a dealer through the chat; that is the ask_ai surface.
  if (ctx.channel === "mcp") return "ask_ai";
  return "other";
}

function journeyFor(ctx: LeadRequestContext, now: number): JourneySummary {
  const key = sessionKeyFor(ctx);
  const server = key ? journeyForSession(key, now) : null;
  if (server && server.events.length) return server;
  return ctx.attribution.journey ?? emptyJourney();
}

function windowMs(): number { return dedupeWindowDays() * 86_400_000; }

/**
 * Record the canonical lead for one inquiry that was actually sent (not a dry run).
 * Never throws: lead tracking must not change how an inquiry is handled.
 */
export function recordLeadFromInquiry(input: { inquiry: InquiryForLead; unit: CanonicalUnit | null; ctx: LeadRequestContext; receiptTokenHash?: string | null; now?: number }): LeadCreateResult {
  try {
    if (!leadTrackingEnabled()) return { kind: "skipped", reason: "disabled" };
    if (isDataDirFrozen() || !dataDirAcceptsWrites()) return { kind: "skipped", reason: "frozen" };
    load();
    if (readOnly) return { kind: "skipped", reason: "read_only" };
    const now = input.now ?? Date.now();
    const { ctx, inquiry, unit } = input;
    const { traffic, classification } = classifyTraffic(ctx.userAgent, ctx.attribution, ctx.channel);
    if (traffic === "bot") {
      recordFunnelStep({ step: "inquiry", source: "unknown", surface: null, traffic: "bot", botCategory: classification.is_bot ? classification.bot_category : "other_crawler", now });
      return { kind: "skipped", reason: "bot" };
    }
    if (byInquiry.has(inquiry.inquiryId)) {
      const existing = leads.get(byInquiry.get(inquiry.inquiryId)!)!;
      return { kind: "repeat", lead: existing };
    }
    const { source, verified } = resolveSource({ channel: ctx.channel, attr: ctx.attribution, agent: ctx.agent, classification });
    const surface = surfaceFor(ctx);
    const hashes = contactHashes(inquiry.contact);

    // Repeat: same contact + same dealer inside the window -> linked to the original lead, counted once.
    const cutoff = now - windowMs();
    const original = hashes.length
      ? [...leads.values()]
        .filter((l) => !l.test === !inquiry.test && l.dealer.id === inquiry.dealer.id && Date.parse(l.created_at) >= cutoff && l.contact_hashes.some((h) => hashes.includes(h)))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
      : undefined;
    if (original) {
      original.repeat_count += 1;
      original.repeats.push({ at: new Date(now).toISOString(), inquiry_id: inquiry.inquiryId, unit_id: inquiry.unit.id, source, surface });
      if (original.repeats.length > MAX_REPEATS_KEPT) original.repeats.splice(0, original.repeats.length - MAX_REPEATS_KEPT);
      original.inquiry_ids.push(inquiry.inquiryId);
      byInquiry.set(inquiry.inquiryId, original.lead_id);
      persistSoon();
      captureLeadAnalyticsEvent("lead_repeat", leadAnalyticsProps(original, { repeat: true }), sessionKeyFor(ctx));
      return { kind: "repeat", lead: original };
    }

    // Exclusivity: the same contact went to a different dealer inside the window (either side).
    const shared = hashes.length
      ? [...leads.values()].filter((l) => !l.test && !inquiry.test && l.dealer.id !== inquiry.dealer.id && Math.abs(Date.parse(l.created_at) - now) <= windowMs() && l.contact_hashes.some((h) => hashes.includes(h)))
      : [];
    for (const other of shared) {
      if (other.qualification.exclusivity) {
        other.qualification.exclusivity = false;
        requalify(other);
      }
    }

    const price = typeof inquiry.unit.priceUsd === "number" ? inquiry.unit.priceUsd : null;
    const specificUnit = Boolean(unit && unit.id === inquiry.unit.id);
    const a: CleanAttribution = ctx.attribution;
    const agent = ctx.agent;
    const sentAt = new Date(now).toISOString();
    const lead: LeadRecord = {
      schema_version: LEAD_SCHEMA_VERSION,
      lead_id: `lead_${randomBytes(12).toString("base64url")}`,
      created_at: sentAt,
      entry_point: ctx.entryPoint,
      inquiry_ids: [inquiry.inquiryId],
      source, source_verified: verified, surface, traffic,
      campaign: {
        campaign: a.campaign, utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign,
        utm_term: a.utm_term, utm_content: a.utm_content, referrer_host: a.referrer_host, landing_page: a.landing_page,
      },
      client: { platform: a.platform, app_version: a.app_version },
      ids: {
        session_id: a.session_id, device_id: a.device_id, anonymous_id: a.anonymous_id,
        agent_tier: agent?.tier ?? null,
        agent_client_id: agent?.tier === "verified_partner" ? agent.clientId : null,
        agent_client_name: agent?.tier === "verified_partner" ? agent.clientName : null,
        agent_host_label: agent?.tier === "unverified_host" ? agent.hostLabel : null,
        agent_session_hash: agent?.sessionHash ?? null,
      },
      unit: {
        id: inquiry.unit.id, stock_number: inquiry.unit.stockNumber, vin: inquiry.unit.vin, title: inquiry.unit.title,
        price_usd: price, price_band: priceBand(price),
        unit_type: unit?.rvType ?? null, condition: unit?.condition ?? null, year: unit?.year ?? null, make: unit?.make ?? null, model: unit?.model ?? null,
      },
      dealer: { id: inquiry.dealer.id, name: inquiry.dealer.name, city: inquiry.dealer.city, state: inquiry.dealer.state },
      region: inquiry.dealer.state ? inquiry.dealer.state.toUpperCase().slice(0, 3) : null,
      delivery: { inquiry_status: inquiry.status, channel: inquiry.channel },
      contact: { ...inquiry.contact },
      contact_hashes: hashes,
      qualification: qualify({ contact: inquiry.contact, specificUnit, exclusive: shared.length === 0, test: inquiry.test }),
      test: inquiry.test,
      lifecycle: {
        stage: "sent", sent_at: sentAt, delivered_at: null, opened_at: null, dealer_responded_at: null, appointment_at: null,
        sold_at: null, lost_at: null, lost_reason: null, response_time_minutes: null, outcome_by: null,
      },
      receipt: input.receiptTokenHash ? { token_hash: input.receiptTokenHash, created_at: sentAt, views: 0, prefetch_views: 0, last_viewed_at: null } : null,
      repeat_count: 0,
      repeats: [],
      journey: journeyFor(ctx, now),
      cost_usd: null,
      revenue_usd: null,
      pii_purged_at: null,
    };
    lead.credit = creditFor(lead, a.session_id, inquiry);
    if (inquiry.status === "delivered" || inquiry.status === "forwarded") {
      lead.lifecycle.delivered_at = sentAt;
      lead.lifecycle.stage = "delivered";
    }
    index(lead);
    persistSoon();
    if (!lead.test) {
      recordFunnelStep({ step: "inquiry", source, surface, traffic, now });
      captureLeadAnalyticsEvent("lead_created", leadAnalyticsProps(lead), sessionKeyFor(ctx));
    }
    return { kind: "created", lead };
  } catch (err) {
    console.warn("[lead-tracking] lead not recorded:", err instanceof Error ? err.name : "error");
    return { kind: "skipped", reason: "error" };
  }
}

/** First-touch evidence for a new lead. Never throws: missing evidence just means a later review by hand. */
function creditFor(lead: LeadRecord, sessionId: string | null, inquiry: InquiryForLead): LeadCredit | null {
  try {
    const c = inquiry.contact;
    return {
      policy_version: CREDIT_POLICY_VERSION,
      evidence: buildCreditEvidence({
        inquiryAt: lead.created_at, unitId: lead.unit.id, dealerId: lead.dealer.id,
        journey: lead.journey, clicks: clicksForSession(outboundSessionHash(sessionId)),
        hasName: lead.qualification.has_name,
        hasEmail: Boolean(normalizeEmail(c.email)),
        hasPhone: Boolean(normalizePhone(c.phone)),
        buyingSignals: detectBuyingSignals({ message: c.message, shared: inquiry.shared ?? null }),
      }),
      review: emptyReview(),
    };
  } catch {
    return null;
  }
}

export type CreditReviewResult = { ok: true; lead: LeadRecord } | { ok: false; code: "disabled" | "frozen" | "not_found" };

/**
 * Ops records a dealer's dispute ("we already had this shopper") or its outcome.
 * Needs LEAD_TRACKING_ENABLED and LEAD_CREDIT_ENABLED. The review is replaced as a
 * whole; the evidence is never edited.
 */
export function recordCreditReview(leadId: string, review: CreditReview): CreditReviewResult {
  if (!leadTrackingEnabled() || !leadCreditEnabled()) return { ok: false, code: "disabled" };
  if (isDataDirFrozen() || !dataDirAcceptsWrites() || readOnly) return { ok: false, code: "frozen" };
  load();
  const lead = leads.get(leadId);
  if (!lead) return { ok: false, code: "not_found" };
  if (!lead.credit) {
    // A lead from before evidence existed: keep its review, with evidence limited to the inquiry itself.
    lead.credit = {
      policy_version: CREDIT_POLICY_VERSION,
      evidence: {
        first_view_at: null, first_outbound_click_at: null, outbound_clicks: 0, outbound_surfaces: [], price_alert_before_leaving: false,
        inquiry_at: lead.created_at, first_touch_at: lead.created_at,
        has_name: lead.qualification.has_name, has_email: Boolean(normalizeEmail(lead.contact?.email)), has_phone: Boolean(normalizePhone(lead.contact?.phone)),
        buying_signals: detectBuyingSignals({ message: lead.contact?.message ?? null }),
      },
      review: emptyReview(),
    };
  }
  lead.credit.review = review;
  persistSoon();
  if (!lead.test) captureLeadAnalyticsEvent("lead_credit_review", { ...leadAnalyticsProps(lead), credit_review: review.status, ...(review.reason ? { credit_reason: review.reason } : {}) }, null);
  return { ok: true, lead };
}

/** A second confirmed send the inquiry store answered as a duplicate (same contact + unit within 24h). */
export function recordDuplicateInquiry(inquiryId: string, ctx: LeadRequestContext, now = Date.now()): LeadRecord | null {
  try {
    if (!canWrite()) return null;
    load();
    const id = byInquiry.get(inquiryId);
    const lead = id ? leads.get(id) : undefined;
    if (!lead) return null;
    const { traffic, classification } = classifyTraffic(ctx.userAgent, ctx.attribution, ctx.channel);
    if (traffic === "bot") return null;
    const { source } = resolveSource({ channel: ctx.channel, attr: ctx.attribution, agent: ctx.agent, classification });
    lead.repeat_count += 1;
    lead.repeats.push({ at: new Date(now).toISOString(), inquiry_id: inquiryId, unit_id: lead.unit.id, source, surface: ctx.attribution.surface });
    if (lead.repeats.length > MAX_REPEATS_KEPT) lead.repeats.splice(0, lead.repeats.length - MAX_REPEATS_KEPT);
    persistSoon();
    captureLeadAnalyticsEvent("lead_repeat", leadAnalyticsProps(lead, { repeat: true }), sessionKeyFor(ctx));
    return lead;
  } catch {
    return null;
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

const minutesBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));

export type StageResult = { ok: true; lead: LeadRecord; changed: boolean } | { ok: false; code: "disabled" | "not_found" | "frozen" | "invalid_stage" | "already_closed" | "reason_required" };

/**
 * Move a lead forward. Stages only move forward (an earlier stage recorded later
 * keeps its own timestamp and does not move the stage back). sold and lost are
 * terminal: once one is recorded, a different outcome is refused. Reaching a
 * stage fills in no earlier timestamps: a missing step stays null, so response
 * time is measured only from what was actually recorded.
 */
export function recordLeadStage(leadId: string, stage: LeadStage, opts: { reason?: LostReason | null; by?: "dealer_receipt" | "matchrv_ops" | "system"; now?: number } = {}): StageResult {
  if (!leadTrackingEnabled()) return { ok: false, code: "disabled" };
  if (isDataDirFrozen() || !dataDirAcceptsWrites() || readOnly) return { ok: false, code: "frozen" };
  if (!(LEAD_STAGES as readonly string[]).includes(stage)) return { ok: false, code: "invalid_stage" };
  load();
  const lead = leads.get(leadId);
  if (!lead) return { ok: false, code: "not_found" };
  const lc = lead.lifecycle;
  const at = new Date(opts.now ?? Date.now()).toISOString();
  const closed = lc.sold_at ? "sold" : lc.lost_at ? "lost" : null;
  if ((stage === "sold" || stage === "lost") && closed && closed !== stage) return { ok: false, code: "already_closed" };
  if (stage === "lost" && !opts.reason) return { ok: false, code: "reason_required" };
  let changed = false;
  const set = (key: keyof LeadLifecycle) => {
    if (lc[key] == null) { (lc as unknown as Record<string, unknown>)[key] = at; changed = true; }
  };
  switch (stage) {
    case "sent": break;
    case "delivered": set("delivered_at"); break;
    case "opened": set("opened_at"); break;
    case "dealer_responded": set("dealer_responded_at"); break;
    case "appointment": set("appointment_at"); break;
    case "sold": set("sold_at"); break;
    case "lost": set("lost_at"); if (changed) lc.lost_reason = opts.reason ?? "other"; break;
  }
  if (lc.dealer_responded_at && lc.response_time_minutes == null) lc.response_time_minutes = minutesBetween(lc.sent_at, lc.dealer_responded_at);
  if (!closed && STAGE_RANK[stage] >= STAGE_RANK[lc.stage] && changed) lc.stage = stage;
  if (changed && (opts.by === "dealer_receipt" || opts.by === "matchrv_ops")) lc.outcome_by = opts.by;
  if (changed) {
    persistSoon();
    if (!lead.test) captureLeadAnalyticsEvent("lead_stage", { ...leadAnalyticsProps(lead), stage, ...(stage === "lost" ? { lost_reason: lc.lost_reason } : {}), ...(stage === "dealer_responded" && lc.response_time_minutes != null ? { response_time_minutes: lc.response_time_minutes } : {}) }, null);
  }
  return { ok: true, lead, changed };
}

/** Delivery status changed in the inquiry store (forward confirmed, retry delivered, ops edit, dealer reply). */
export function syncInquiryDelivery(inquiryId: string, update: { status?: string; dealerReplyRecorded?: boolean; now?: number }): void {
  try {
    if (!canWrite()) return;
    load();
    const id = byInquiry.get(inquiryId);
    const lead = id ? leads.get(id) : undefined;
    if (!lead) return;
    if (update.status && lead.inquiry_ids[0] === inquiryId) {
      lead.delivery.inquiry_status = update.status;
      persistSoon();
    }
    if (update.status === "delivered" || update.status === "forwarded") recordLeadStage(lead.lead_id, "delivered", { by: "system", now: update.now });
    if (update.dealerReplyRecorded) recordLeadStage(lead.lead_id, "dealer_responded", { by: "matchrv_ops", now: update.now });
  } catch {
    /* fail open */
  }
}

/** Receipt page opened. Link scanners and prefetchers (bot user agents) count separately and never mark it opened. */
export function recordReceiptView(lead: LeadRecord, human: boolean, now = Date.now()): void {
  if (!canWrite() || !lead.receipt) return;
  if (human) {
    lead.receipt.views += 1;
    lead.receipt.last_viewed_at = new Date(now).toISOString();
    persistSoon();
    recordLeadStage(lead.lead_id, "opened", { by: "dealer_receipt", now });
  } else {
    lead.receipt.prefetch_views += 1;
    persistSoon();
  }
}

// ── PII retention ──────────────────────────────────────────────────────────

/**
 * Clear name, email, phone and message on leads older than LEAD_PII_RETENTION_DAYS
 * (or `days`). Hashes, flags, attribution and outcomes stay. Not scheduled: call it
 * from an operator task. Returns how many leads were purged.
 */
export function purgeLeadPii(opts: { days?: number | null; now?: number } = {}): number {
  const days = opts.days ?? piiRetentionDays();
  if (!days || !canWrite()) return 0;
  load();
  const cutoff = (opts.now ?? Date.now()) - days * 86_400_000;
  let n = 0;
  for (const l of leads.values()) {
    if (!l.contact || Date.parse(l.created_at) >= cutoff) continue;
    l.contact = null;
    l.pii_purged_at = new Date(opts.now ?? Date.now()).toISOString();
    n += 1;
  }
  if (n) persistSoon();
  return n;
}

// ── Reads ──────────────────────────────────────────────────────────────────

export function listLeads(): LeadRecord[] {
  load();
  return [...leads.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getLead(id: string): LeadRecord | null { load(); return leads.get(id) ?? null; }
export function leadForInquiry(inquiryId: string): LeadRecord | null { load(); const id = byInquiry.get(inquiryId); return id ? leads.get(id) ?? null : null; }

export function leadStoreStatus() {
  load();
  return { path: storeFile(), leads: leads.size, schemaVersion: LEAD_SCHEMA_VERSION, readOnly, pendingWrite: dirty || saveTimer != null, lastWriteError };
}

/** Analytics properties: ids, hashes and enums only. Never name, email, phone, message or free text. */
export function leadAnalyticsProps(l: LeadRecord, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    lead_id: l.lead_id,
    lead_source: l.source,
    lead_source_verified: l.source_verified,
    lead_surface: l.surface,
    traffic: l.traffic,
    entry_point: l.entry_point,
    qualified: l.qualification.qualified,
    has_name: l.qualification.has_name,
    has_contact: l.qualification.has_contact,
    specific_unit: l.qualification.specific_unit,
    exclusivity: l.qualification.exclusivity,
    price_band: l.unit.price_band,
    rv_type: l.unit.unit_type,
    region: l.region,
    listing_id: l.unit.id,
    dealer_id: l.dealer.id,
    utm_source: l.campaign.utm_source,
    utm_medium: l.campaign.utm_medium,
    utm_campaign: l.campaign.utm_campaign,
    stage: l.lifecycle.stage,
    repeat_count: l.repeat_count,
    ...extra,
  };
}

// ── Test hooks ─────────────────────────────────────────────────────────────

export function __resetLeadStore(): void {
  leads.clear(); byInquiry.clear(); byReceipt.clear();
  salt = null; fileCreatedAt = null; loaded = true; readOnly = false; dirty = false; lastBackupDay = null; lastWriteError = null;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
}
export function __setLeadPersistenceForTests(enabled: boolean, filePath?: string): void {
  persistenceEnabled = enabled;
  pathOverride = filePath ?? null;
}
export function __reloadLeadStore(): void {
  leads.clear(); byInquiry.clear(); byReceipt.clear();
  salt = null; fileCreatedAt = null; loaded = false; readOnly = false; dirty = false;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  load();
}
export function __flushLeadStore(): void { persistSync(); }
export function __readLeadFileForTests(): string | null {
  try { return readFileSync(storeFile(), "utf8"); } catch { return null; }
}

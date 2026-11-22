/**
 * Lead credit: who gets credit for a shopper, and when a dealer must never be
 * charged. Answers the pilot dealers' question "what if we both have the same
 * lead? I don't want to pay for my own lead."
 *
 * Evidence (captured on every canonical lead while LEAD_TRACKING_ENABLED):
 *   first_view_at            first time this browser session looked at this RV on MatchRV (server journey)
 *   first_outbound_click_at  first time MatchRV sent this session to the dealer's site (GET /api/out)
 *   inquiry_at               when MatchRV delivered the inquiry
 *   first_touch_at           earliest of the three: the start of MatchRV's credit window
 *
 * Review (MatchRV ops, from the leads dashboard): a dealer can show it already
 * had the shopper (CRM entry, its own web form, a walk-in or call). Ops records
 * the date of the dealer's own record and a reason. The verdict below then
 * decides "billable" or not:
 *
 *   - test lead                                           -> not billable
 *   - ops marked dealer_already_had                       -> not billable (never charged)
 *   - ops marked disputed (still being checked)           -> not billable until resolved
 *   - dealer's own record is on or before first_touch_at  -> dealer_already_had, not billable
 *   - dealer's own record is more than WINDOW days after  -> outside_window, not billable
 *   - otherwise (no earlier dealer record)                -> billable: MatchRV touched first, within the window
 *
 * DRAFT terms: the 30-day window and the rules above are a proposal pending
 * Jonathan and the CSO (docs/lead-tracking/LEAD_CREDIT_POLICY.md). Nothing here
 * charges anyone; MatchRV has no billing code. LEAD_CREDIT_ENABLED (default off)
 * only turns on the verdict column, the review controls and the CSV verdict.
 */
import type { JourneySummary } from "./lead-attribution";
import type { OutboundClick } from "./outbound-clicks";

const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test((v ?? "").trim());
let enabledOverride: boolean | null = null;

/** LEAD_CREDIT_ENABLED: show credit verdicts and allow dispute review. Off by default. */
export function leadCreditEnabled(): boolean {
  return enabledOverride ?? truthy(process.env.LEAD_CREDIT_ENABLED);
}

/** LEAD_CREDIT_WINDOW_DAYS (default 30, 1..365). DRAFT pending Jonathan/CSO pilot terms. */
export function creditWindowDays(): number {
  const raw = process.env.LEAD_CREDIT_WINDOW_DAYS;
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 365 ? Math.floor(n) : 30;
}

export const CREDIT_POLICY_VERSION = 1;

export const CREDIT_REVIEW_STATUSES = ["none", "disputed", "dealer_already_had", "upheld"] as const;
export type CreditReviewStatus = typeof CREDIT_REVIEW_STATUSES[number];

export const CREDIT_REASONS = [
  "dealer_crm_record_earlier",
  "shopper_used_dealer_form_first",
  "existing_customer",
  "walk_in_or_call_first",
  "other_lead_provider_first",
  "matchrv_evidence_earlier",
  "other",
] as const;
export type CreditReason = typeof CREDIT_REASONS[number];

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  dealer_crm_record_earlier: "Dealer's CRM shows the shopper earlier",
  shopper_used_dealer_form_first: "Shopper filled out the dealer's own web form first",
  existing_customer: "Existing customer of the dealer",
  walk_in_or_call_first: "Shopper walked in or called first",
  other_lead_provider_first: "Another lead provider sent the shopper first",
  matchrv_evidence_earlier: "MatchRV's evidence is earlier (dispute rejected)",
  other: "Other",
};

export interface CreditEvidence {
  first_view_at: string | null;
  first_outbound_click_at: string | null;
  outbound_clicks: number;
  outbound_surfaces: string[];
  /** A price-drop alert was saved on the "before you go" step on one of those clicks. */
  price_alert_before_leaving: boolean;
  inquiry_at: string;
  first_touch_at: string;
}

export interface CreditReview {
  status: CreditReviewStatus;
  reason: CreditReason | null;
  /** Date (or time) of the dealer's own earliest record of this shopper, as the dealer showed it. */
  dealer_record_at: string | null;
  /** Short ops note. Never sent to analytics. */
  note: string | null;
  by: "matchrv_ops" | null;
  at: string | null;
}

export interface LeadCredit { policy_version: number; evidence: CreditEvidence; review: CreditReview }

export const emptyReview = (): CreditReview => ({ status: "none", reason: null, dealer_record_at: null, note: null, by: null, at: null });

const earliest = (xs: Array<string | null | undefined>): string | null =>
  xs.filter((x): x is string => typeof x === "string" && Number.isFinite(Date.parse(x))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

/**
 * Evidence for one lead. Clicks count when they were for this RV or this dealer
 * and happened at or before the inquiry. Journey views count for this RV.
 */
export function buildCreditEvidence(input: {
  inquiryAt: string; unitId: string | null; dealerId: string | null;
  journey: JourneySummary | null | undefined; clicks: OutboundClick[];
}): CreditEvidence {
  const inquiryMs = Date.parse(input.inquiryAt);
  const views = (input.journey?.events ?? [])
    .filter((e) => (e.type === "view" || e.type === "swipe" || e.type === "favorite" || e.type === "compare") && (!input.unitId || e.unit_id === input.unitId))
    .map((e) => e.at);
  const clicks = input.clicks.filter((c) =>
    Date.parse(c.at) <= inquiryMs &&
    ((input.unitId && c.unitId === input.unitId) || (input.dealerId && c.dealerId.toLowerCase() === input.dealerId.toLowerCase())));
  const firstView = earliest(views);
  const firstClick = earliest(clicks.map((c) => c.at));
  return {
    first_view_at: firstView,
    first_outbound_click_at: firstClick,
    outbound_clicks: clicks.length,
    outbound_surfaces: [...new Set(clicks.map((c) => c.from))].slice(0, 10),
    price_alert_before_leaving: clicks.some((c) => c.alert === true),
    inquiry_at: input.inquiryAt,
    first_touch_at: earliest([firstView, firstClick, input.inquiryAt]) ?? input.inquiryAt,
  };
}

export type CreditVerdictStatus = "billable" | "dealer_already_had" | "disputed_pending" | "outside_window" | "test" | "no_evidence";

export interface CreditVerdict { billable: boolean; status: CreditVerdictStatus; explanation: string; window_days: number }

/** The billing verdict for one lead. Pure: same inputs, same answer. */
export function creditVerdict(
  lead: { test: boolean; created_at: string; credit?: LeadCredit | null },
  windowDays = creditWindowDays(),
): CreditVerdict {
  const v = (billable: boolean, status: CreditVerdictStatus, explanation: string): CreditVerdict => ({ billable, status, explanation, window_days: windowDays });
  if (lead.test) return v(false, "test", "Test lead. Never billed.");
  const credit = lead.credit;
  if (!credit) return v(false, "no_evidence", "Recorded before lead-credit evidence existed. Review by hand before billing.");
  const r = credit.review;
  if (r.status === "dealer_already_had") return v(false, "dealer_already_had", "The dealer showed it already had this shopper. Not billed.");
  if (r.status === "disputed") return v(false, "disputed_pending", "The dealer disputes this lead. Not billed until MatchRV reviews it.");
  const touch = Date.parse(credit.evidence.first_touch_at);
  const dealerAt = r.dealer_record_at ? Date.parse(r.dealer_record_at) : NaN;
  if (Number.isFinite(dealerAt)) {
    if (dealerAt <= touch) return v(false, "dealer_already_had", "The dealer's own record is on or before MatchRV's first touch. Not billed.");
    if (dealerAt - touch > windowDays * 86_400_000) return v(false, "outside_window", `The dealer's own record came more than ${windowDays} days after MatchRV's first touch. Not billed.`);
  }
  return v(true, "billable", `MatchRV touched this shopper first (${credit.evidence.first_touch_at.slice(0, 10)}) and no earlier dealer record was shown.`);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** Validates an ops review. Returns the cleaned review or an error code. */
export function cleanCreditReview(raw: Record<string, unknown>, now = Date.now()):
  { ok: true; review: CreditReview } | { ok: false; code: "invalid_status" | "reason_required" | "invalid_reason" | "invalid_date" | "date_in_future" } {
  const status = typeof raw.status === "string" ? raw.status.trim() : "";
  if (status === "clear") return { ok: true, review: emptyReview() };
  if (!(CREDIT_REVIEW_STATUSES as readonly string[]).includes(status) || status === "none") return { ok: false, code: "invalid_status" };
  const reasonRaw = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (reasonRaw && !(CREDIT_REASONS as readonly string[]).includes(reasonRaw)) return { ok: false, code: "invalid_reason" };
  const reason = (reasonRaw || null) as CreditReason | null;
  if ((status === "disputed" || status === "dealer_already_had") && !reason) return { ok: false, code: "reason_required" };
  const dateRaw = typeof raw.dealer_record_at === "string" ? raw.dealer_record_at.trim() : "";
  let dealerAt: string | null = null;
  if (dateRaw) {
    if (!DATE_RE.test(dateRaw) || !Number.isFinite(Date.parse(dateRaw))) return { ok: false, code: "invalid_date" };
    const iso = new Date(Date.parse(dateRaw.length === 10 ? `${dateRaw}T00:00:00Z` : dateRaw)).toISOString();
    if (Date.parse(iso) > now + 86_400_000) return { ok: false, code: "date_in_future" };
    dealerAt = iso;
  }
  const note = typeof raw.note === "string" ? raw.note.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 280) || null : null;
  return { ok: true, review: { status: status as CreditReviewStatus, reason, dealer_record_at: dealerAt, note, by: "matchrv_ops", at: new Date(now).toISOString() } };
}

export function __setLeadCreditForTests(on: boolean | null): void { enabledOverride = on; }

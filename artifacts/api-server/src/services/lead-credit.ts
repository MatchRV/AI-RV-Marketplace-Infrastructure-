/**
 * Lead credit: who gets credit for a shopper, how much, and when a dealer must
 * never be charged. Answers the pilot dealers' question "what if we both have
 * the same lead? I don't want to pay for my own lead."
 *
 * Terms approved by Jonathan on Nov 22, 2026 (docs/lead-tracking/LEAD_CREDIT_POLICY.md):
 *
 *   Window      30 days from MatchRV's first touch (LEAD_CREDIT_WINDOW_DAYS).
 *   Weights     outbound click with no MatchRV inquiry  0.5  (LEAD_CREDIT_WEIGHT_CLICK)
 *               basic inquiry (name + email)            1.0  (LEAD_CREDIT_WEIGHT_INQUIRY)
 *               qualified lead                          1.5  (LEAD_CREDIT_WEIGHT_QUALIFIED)
 *               qualified = a phone number AND at least one buying signal
 *               (timeline, trade-in or financing interest).
 *   Disputes    the dealer has 7 days from delivery (LEAD_CREDIT_DISPUTE_DAYS); after that the lead stands.
 *               Only a dated record of that shopper (CRM entry, email, timestamped web lead, call log)
 *               that predates MatchRV's first touch overturns it. An undated claim does not.
 *               Earliest timestamp wins; ties and same-day close calls go to the dealer while
 *               LEAD_CREDIT_TIES_TO_DEALER is on (default on for the pilots).
 *   Never billed test leads, spam, wrong number, duplicate (same shopper + same unit within the window).
 *
 * Nothing here charges anyone; MatchRV has no billing code. LEAD_CREDIT_ENABLED
 * (default off) only turns on the verdict, weights, totals and the review controls.
 */
import type { JourneySummary } from "./lead-attribution";
import type { OutboundClick } from "./outbound-clicks";

const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test((v ?? "").trim());
const falsy = (v: string | undefined) => /^(0|false|no|off)$/i.test((v ?? "").trim());
let enabledOverride: boolean | null = null;

/** LEAD_CREDIT_ENABLED: show credit verdicts and allow dispute review. Off by default. */
export function leadCreditEnabled(): boolean {
  return enabledOverride ?? truthy(process.env.LEAD_CREDIT_ENABLED);
}

const numberEnv = (name: string, fallback: number, min: number, max: number, int = false): number => {
  const raw = process.env[name];
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return int ? Math.floor(n) : n;
};

/** LEAD_CREDIT_WINDOW_DAYS (default 30, 1..365). */
export const creditWindowDays = (): number => numberEnv("LEAD_CREDIT_WINDOW_DAYS", 30, 1, 365, true);
/** LEAD_CREDIT_DISPUTE_DAYS: days from delivery a dealer has to dispute (default 7, 1..90). */
export const disputeWindowDays = (): number => numberEnv("LEAD_CREDIT_DISPUTE_DAYS", 7, 1, 90, true);
/** LEAD_CREDIT_TIES_TO_DEALER: ties and same-day close calls go to the dealer. Default ON (pilot). */
export const tiesToDealer = (): boolean => !falsy(process.env.LEAD_CREDIT_TIES_TO_DEALER);

export const DEFAULT_CREDIT_WEIGHTS = { click: 0.5, inquiry: 1.0, qualified: 1.5 } as const;
export interface CreditWeights { click: number; inquiry: number; qualified: number }
/** LEAD_CREDIT_WEIGHT_CLICK / _INQUIRY / _QUALIFIED (0..10). Defaults 0.5 / 1.0 / 1.5. */
export function creditWeights(): CreditWeights {
  return {
    click: numberEnv("LEAD_CREDIT_WEIGHT_CLICK", DEFAULT_CREDIT_WEIGHTS.click, 0, 10),
    inquiry: numberEnv("LEAD_CREDIT_WEIGHT_INQUIRY", DEFAULT_CREDIT_WEIGHTS.inquiry, 0, 10),
    qualified: numberEnv("LEAD_CREDIT_WEIGHT_QUALIFIED", DEFAULT_CREDIT_WEIGHTS.qualified, 0, 10),
  };
}

export const CREDIT_POLICY_VERSION = 2;

// ── Buying signals ─────────────────────────────────────────────────────────

export const BUYING_SIGNALS = ["timeline", "trade_in", "financing"] as const;
export type BuyingSignal = typeof BUYING_SIGNALS[number];

const DAY = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const MONTH = "(?:january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter)";
const TIMELINE_RE = new RegExp([
  String.raw`\b(?:this|next) (?:week|weekend|month)\b`,
  String.raw`\b(?:today|tomorrow|tonight)\b`,
  String.raw`\b(?:on |this |next )?${DAY}s?\b`,
  String.raw`\b(?:within|in(?: the next)?) (?:a|one|two|three|\d{1,2}) (?:days?|weeks?|months?)\b`,
  String.raw`\b(?:asap|as soon as possible)\b`,
  String.raw`\bready to (?:buy|purchase)\b`,
  String.raw`\b(?:buy|buying|purchase) (?:soon|now|this)\b`,
  String.raw`\bby (?:the end of )?${MONTH}\b`,
].join("|"), "i");
const TRADE_RE = /\btrade[- ]?ins?\b|\btrad(?:e|ing) (?:in )?(?:my|our)\b/i;
const FINANCING_RE = /\bfinanc(?:e|ed|ing)\b|\bloans?\b|\bmonthly payments?\b|\bpre-?approv|\bAPR\b|\bdown payment\b/i;

/**
 * Buying signals from what the shopper actually wrote or chose to share. The website's prefilled
 * "Is it still available, and when could I come by?" is not a timeline.
 */
export function detectBuyingSignals(input: { message?: string | null; shared?: { tradeIn?: boolean; financing?: boolean } | null }): BuyingSignal[] {
  const m = (input.message ?? "").slice(0, 4000);
  const out = new Set<BuyingSignal>();
  if (TIMELINE_RE.test(m)) out.add("timeline");
  if (TRADE_RE.test(m) || input.shared?.tradeIn) out.add("trade_in");
  if (FINANCING_RE.test(m) || input.shared?.financing) out.add("financing");
  return BUYING_SIGNALS.filter((s) => out.has(s));
}

// ── Review (disputes) ──────────────────────────────────────────────────────

export const CREDIT_REVIEW_STATUSES = ["none", "disputed", "dealer_already_had", "upheld"] as const;
export type CreditReviewStatus = typeof CREDIT_REVIEW_STATUSES[number];

export const CREDIT_REASONS = [
  "dealer_crm_record_earlier",
  "shopper_used_dealer_form_first",
  "existing_customer",
  "walk_in_or_call_first",
  "other_lead_provider_first",
  "matchrv_evidence_earlier",
  "undated_claim",
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
  undated_claim: "Dealer's claim has no dated record (dispute rejected)",
  other: "Other",
};

/** Proof a dealer can show. Each is a dated record of that shopper. */
export const PROOF_TYPES = ["crm_entry", "email", "web_lead_timestamped", "call_log", "other_dated_record"] as const;
export type ProofType = typeof PROOF_TYPES[number];
export const PROOF_LABELS: Record<ProofType, string> = {
  crm_entry: "CRM entry", email: "Email", web_lead_timestamped: "Web lead with timestamp", call_log: "Call log", other_dated_record: "Other dated record",
};

export interface CreditReview {
  status: CreditReviewStatus;
  reason: CreditReason | null;
  /** Date (or time) of the dealer's own earliest record of this shopper, as the dealer showed it. */
  dealer_record_at: string | null;
  /** What the dealer showed. Required with dealer_record_at to overturn a lead. */
  proof_type?: ProofType | null;
  /** Short ops note. Never sent to analytics. */
  note: string | null;
  by: "matchrv_ops" | null;
  at: string | null;
  /** When the dealer first raised the dispute (kept across later edits; must be inside the dispute window). */
  dispute_filed_at?: string | null;
}

export const emptyReview = (): CreditReview => ({ status: "none", reason: null, dealer_record_at: null, proof_type: null, note: null, by: null, at: null, dispute_filed_at: null });

// ── Evidence ───────────────────────────────────────────────────────────────

export interface CreditEvidence {
  first_view_at: string | null;
  first_outbound_click_at: string | null;
  outbound_clicks: number;
  outbound_surfaces: string[];
  /** A price-drop alert was saved on the "before you go" step on one of those clicks. */
  price_alert_before_leaving: boolean;
  inquiry_at: string;
  first_touch_at: string;
  /** Policy v2: what the inquiry contained (no contact values, only whether they were given). */
  has_name?: boolean;
  has_email?: boolean;
  has_phone?: boolean;
  buying_signals?: BuyingSignal[];
}

export interface LeadCredit { policy_version: number; evidence: CreditEvidence; review: CreditReview }

const earliest = (xs: Array<string | null | undefined>): string | null =>
  xs.filter((x): x is string => typeof x === "string" && Number.isFinite(Date.parse(x))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

/**
 * Evidence for one lead. Clicks count when they were for this RV or this dealer
 * and happened at or before the inquiry. Journey views count for this RV.
 */
export function buildCreditEvidence(input: {
  inquiryAt: string; unitId: string | null; dealerId: string | null;
  journey: JourneySummary | null | undefined; clicks: OutboundClick[];
  hasPhone?: boolean; hasEmail?: boolean; hasName?: boolean;
  buyingSignals?: BuyingSignal[];
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
    has_name: input.hasName ?? false,
    has_email: input.hasEmail ?? false,
    has_phone: input.hasPhone ?? false,
    buying_signals: input.buyingSignals ?? [],
  };
}

/** Qualified for credit (approved terms): a phone number plus at least one buying signal. */
export function creditQualified(ev: CreditEvidence | null | undefined): boolean {
  return Boolean(ev?.has_phone) && (ev?.buying_signals?.length ?? 0) > 0;
}

// ── Verdict ────────────────────────────────────────────────────────────────

export type CreditVerdictStatus =
  | "billable" | "dealer_already_had" | "disputed_pending" | "outside_window"
  | "test" | "spam" | "wrong_number" | "duplicate" | "no_evidence";

export interface CreditVerdict {
  billable: boolean;
  status: CreditVerdictStatus;
  explanation: string;
  window_days: number;
  /** Credits this lead counts for: 0 when not billable, else the inquiry or qualified weight. */
  credit_weight: number;
  /** "qualified" (phone + buying signal) or "basic". */
  credit_tier: "qualified" | "basic" | null;
  delivered_at: string | null;
  /** Last moment a dealer can raise a dispute. */
  dispute_deadline: string | null;
  dispute_window_open: boolean;
}

export interface LeadForCredit {
  test: boolean;
  created_at: string;
  credit?: LeadCredit | null;
  lifecycle?: { sent_at?: string | null; delivered_at?: string | null; lost_reason?: string | null } | null;
  /** The dealer's state/province, for judging "same day" on the dealer's local calendar. */
  dealer?: { state?: string | null } | null;
}

// ── Dealer local day ───────────────────────────────────────────────────────

/** When the dealer's location is unknown, "same day" is judged on Pacific time. */
export const DEFAULT_DEALER_TIME_ZONE = "America/Los_Angeles";

const STATE_TIME_ZONES: Record<string, string> = {
  CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York", GA: "America/New_York",
  ME: "America/New_York", MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", NH: "America/New_York",
  NJ: "America/New_York", NY: "America/New_York", NC: "America/New_York", OH: "America/New_York", PA: "America/New_York",
  RI: "America/New_York", SC: "America/New_York", VT: "America/New_York", VA: "America/New_York", WV: "America/New_York",
  IN: "America/Indiana/Indianapolis", KY: "America/New_York",
  AL: "America/Chicago", AR: "America/Chicago", IL: "America/Chicago", IA: "America/Chicago", KS: "America/Chicago",
  LA: "America/Chicago", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago", NE: "America/Chicago",
  ND: "America/Chicago", OK: "America/Chicago", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", WI: "America/Chicago",
  CO: "America/Denver", MT: "America/Denver", NM: "America/Denver", UT: "America/Denver", WY: "America/Denver", ID: "America/Boise",
  AZ: "America/Phoenix",
  CA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles",
  AK: "America/Anchorage", HI: "Pacific/Honolulu",
  BC: "America/Vancouver", AB: "America/Edmonton", SK: "America/Regina", MB: "America/Winnipeg", ON: "America/Toronto",
  QC: "America/Toronto", NB: "America/Halifax", NS: "America/Halifax", PE: "America/Halifax", NL: "America/St_Johns",
};

/** The dealer's time zone from its state/province (two-letter code); Pacific when unknown. */
export function dealerTimeZone(state: string | null | undefined): string {
  const code = typeof state === "string" ? state.trim().toUpperCase() : "";
  return STATE_TIME_ZONES[code] ?? DEFAULT_DEALER_TIME_ZONE;
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
/** Calendar day (YYYY-MM-DD) of an instant in a time zone. */
export function localDay(ms: number, timeZone = DEFAULT_DEALER_TIME_ZONE): string {
  let f = dayFormatters.get(timeZone);
  if (!f) { f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }); dayFormatters.set(timeZone, f); }
  return f.format(new Date(ms));
}

/** Offset (ms) of a time zone from UTC at an instant. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(ms)).reduce<Record<string, number>>((o, p) => { if (p.type !== "literal") o[p.type] = Number(p.value); return o; }, {});
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - (ms - (ms % 1000));
}

/** Midnight at the start of a calendar day (YYYY-MM-DD) in a time zone, as epoch ms. */
export function zonedMidnight(day: string, timeZone = DEFAULT_DEALER_TIME_ZONE): number {
  const utc = Date.parse(`${day}T00:00:00Z`);
  let guess = utc - zoneOffsetMs(utc, timeZone);
  guess = utc - zoneOffsetMs(guess, timeZone);
  return guess;
}

export function disputeDeadline(lead: LeadForCredit, days = disputeWindowDays()): { deliveredAt: string | null; deadline: string | null } {
  const deliveredAt = lead.lifecycle?.delivered_at ?? lead.lifecycle?.sent_at ?? lead.created_at ?? null;
  const ms = deliveredAt ? Date.parse(deliveredAt) : NaN;
  return { deliveredAt, deadline: Number.isFinite(ms) ? new Date(ms + days * 86_400_000).toISOString() : null };
}

/**
 * Who wins a date comparison. Earliest wins; with tiesToDealer, a tie or the same calendar day
 * on the dealer's local clock (dealer time zone, Pacific when unknown) goes to the dealer.
 */
export function dealerWins(dealerRecordMs: number, matchrvTouchMs: number, ties = tiesToDealer(), timeZone = DEFAULT_DEALER_TIME_ZONE): boolean {
  if (dealerRecordMs < matchrvTouchMs) return true;
  if (!ties) return false;
  return dealerRecordMs === matchrvTouchMs || localDay(dealerRecordMs, timeZone) === localDay(matchrvTouchMs, timeZone);
}

/** The billing verdict for one lead. Pure apart from config and `now`. */
export function creditVerdict(
  lead: LeadForCredit,
  opts: { windowDays?: number; weights?: CreditWeights; ties?: boolean; disputeDays?: number; now?: number } | number = {},
): CreditVerdict {
  const o = typeof opts === "number" ? { windowDays: opts } : opts;
  const windowDays = o.windowDays ?? creditWindowDays();
  const weights = o.weights ?? creditWeights();
  const now = o.now ?? Date.now();
  const tz = dealerTimeZone(lead.dealer?.state);
  const { deliveredAt, deadline } = disputeDeadline(lead, o.disputeDays);
  const open = deadline ? now <= Date.parse(deadline) : false;
  const credit = lead.credit;
  const tier: "qualified" | "basic" | null = credit ? (creditQualified(credit.evidence) ? "qualified" : "basic") : null;
  const v = (billable: boolean, status: CreditVerdictStatus, explanation: string): CreditVerdict => ({
    billable, status, explanation, window_days: windowDays,
    credit_weight: billable ? (tier === "qualified" ? weights.qualified : weights.inquiry) : 0,
    credit_tier: tier, delivered_at: deliveredAt, dispute_deadline: deadline, dispute_window_open: open,
  });
  if (lead.test) return v(false, "test", "Test lead. Never billed.");
  const lost = lead.lifecycle?.lost_reason;
  if (lost === "spam") return v(false, "spam", "Marked spam. Never billed.");
  if (lost === "wrong_number") return v(false, "wrong_number", "Wrong number or bad contact details. Never billed.");
  if (lost === "duplicate") return v(false, "duplicate", "Duplicate of another lead (same shopper, same RV). Never billed.");
  if (!credit) return v(false, "no_evidence", "Recorded before lead-credit evidence existed. Review by hand before billing.");
  const r = credit.review;
  if (r.status === "dealer_already_had") return v(false, "dealer_already_had", "The dealer showed a dated record of this shopper from before MatchRV's first touch. Not billed.");
  if (r.status === "disputed") return v(false, "disputed_pending", "The dealer disputed this lead in time. Not billed until MatchRV reviews the proof.");
  const touch = Date.parse(credit.evidence.first_touch_at);
  const dealerAt = r.dealer_record_at && r.proof_type ? Date.parse(r.dealer_record_at) : NaN;
  if (Number.isFinite(dealerAt)) {
    if (dealerWins(dealerAt, touch, o.ties, tz)) return v(false, "dealer_already_had", "The dealer's dated record is earlier than (or the same local day as) MatchRV's first touch. Not billed.");
    if (dealerAt - touch > windowDays * 86_400_000) return v(false, "outside_window", `The dealer's own record came more than ${windowDays} days after MatchRV's first touch. Not billed.`);
  }
  const what = tier === "qualified" ? "qualified lead (phone + buying signal)" : "basic inquiry";
  return v(true, "billable", `MatchRV touched this shopper first (${credit.evidence.first_touch_at.slice(0, 10)}); ${what}.${open ? "" : " Dispute window closed: the lead stands."}`);
}

// ── Click credits (outbound click, no MatchRV inquiry) ─────────────────────

export type ClickCreditStatus =
  | "unmatched" | "credited" | "already_counted_as_inquiry" | "dealer_already_had"
  | "outside_window" | "disputed_pending" | "no_session";

/** Where MatchRV ops found the dealer's own record of a shopper who clicked through. */
export const CLICK_MATCH_SOURCES = ["crm_export", "dealer_analytics_utm", "web_lead_timestamped", "email", "call_log", "other_dated_record"] as const;
export type ClickMatchSource = (typeof CLICK_MATCH_SOURCES)[number];
export const CLICK_MATCH_SOURCE_LABELS: Record<ClickMatchSource, string> = {
  crm_export: "Dealer CRM export",
  dealer_analytics_utm: "Dealer analytics (utm_source=matchrv)",
  web_lead_timestamped: "Dealer web lead with timestamp",
  email: "Dealer email",
  call_log: "Dealer call log",
  other_dated_record: "Other dated dealer record",
};

/** Ops matched a click to the dealer's own record of that shopper. `matched_at` (match sent) starts the dispute clock. */
export interface ClickMatch {
  click_key: string;
  dealer_id: string;
  unit_id: string | null;
  dealer_state: string | null;
  clicked_at: string;
  /** Date of the dealer's own record of this shopper (their contact with the dealer). */
  dealer_record_at: string;
  source: ClickMatchSource;
  note: string | null;
  matched_at: string;
  by: "matchrv_ops";
  /** Dealer dispute of the match (same rules as an inquiry). */
  review: CreditReview;
}

export interface ClickCredit {
  key: string | null;
  session: string | null; unit_id: string | null; dealer_id: string; dealer_name: string; dealer_state: string | null; clicked_at: string;
  status: ClickCreditStatus; credit_weight: number;
  match: { dealer_record_at: string; source: ClickMatchSource; matched_at: string; review: CreditReview } | null;
  dispute_deadline: string | null;
  dispute_window_open: boolean;
}

/** A matched click as a lead-shaped record, so the dispute rules (window from match sent, dated proof) are shared. */
export function matchAsLead(m: Pick<ClickMatch, "matched_at" | "clicked_at" | "review" | "dealer_state">): LeadForCredit {
  return {
    test: false, created_at: m.matched_at, lifecycle: { delivered_at: m.matched_at }, dealer: { state: m.dealer_state },
    credit: { policy_version: CREDIT_POLICY_VERSION, review: m.review, evidence: { first_view_at: null, first_outbound_click_at: m.clicked_at, outbound_clicks: 1, outbound_surfaces: [], price_alert_before_leaving: false, inquiry_at: m.clicked_at, first_touch_at: m.clicked_at } },
  };
}

/**
 * One click's credit. A click counts 0 until MatchRV ops matches it to the dealer's own record of
 * that shopper (CRM export or the dealer's analytics on the utm tag). Then it counts only when
 * MatchRV's click came first (same local day goes to the dealer while ties-to-dealer is on) and the
 * dealer's record is within the window. Never when a MatchRV inquiry from the same shopper already
 * counted. The dealer can dispute a match within the dispute window from when the match was sent.
 */
export function clickCreditVerdict(input: {
  clickedAt: string; match?: Pick<ClickMatch, "dealer_record_at" | "matched_at" | "review"> | null;
  dealerState?: string | null; inquiryCounted: boolean; hasSession: boolean;
  windowDays?: number; weights?: CreditWeights; ties?: boolean; disputeDays?: number; now?: number;
}): { status: ClickCreditStatus; credit_weight: number; dispute_deadline: string | null; dispute_window_open: boolean } {
  const w = (input.weights ?? creditWeights()).click;
  const tz = dealerTimeZone(input.dealerState);
  const m = input.match ?? null;
  const deadline = m ? disputeDeadline({ test: false, created_at: m.matched_at, lifecycle: { delivered_at: m.matched_at } }, input.disputeDays).deadline : null;
  const open = deadline ? (input.now ?? Date.now()) <= Date.parse(deadline) : false;
  const out = (status: ClickCreditStatus, credit = 0) => ({ status, credit_weight: credit, dispute_deadline: deadline, dispute_window_open: open });
  if (!input.hasSession) return out("no_session");
  if (input.inquiryCounted) return out("already_counted_as_inquiry");
  if (!m) return out("unmatched");
  const click = Date.parse(input.clickedAt);
  const r = m.review;
  if (r.status === "dealer_already_had") return out("dealer_already_had");
  if (r.status === "disputed") return out("disputed_pending");
  // A dated, proven earlier record from a dispute review beats the click.
  const proven = r.dealer_record_at && r.proof_type ? Date.parse(r.dealer_record_at) : NaN;
  if (Number.isFinite(proven) && dealerWins(proven, click, input.ties, tz)) return out("dealer_already_had");
  const dealerAt = Date.parse(m.dealer_record_at);
  if (!Number.isFinite(dealerAt)) return out("unmatched");
  if (dealerWins(dealerAt, click, input.ties, tz)) return out("dealer_already_had");
  if (dealerAt - click > (input.windowDays ?? creditWindowDays()) * 86_400_000) return out("outside_window");
  return out("credited", w);
}

/**
 * Click credits from the outbound log: one per shopper session per RV (or dealer home page),
 * earliest click wins, clicks without a session id never count, unmatched clicks count 0.
 * `inquirySessions` holds "session|unit" and "session|dealer:<id>" keys of leads already counted.
 */
export function computeClickCredits(
  clicks: OutboundClick[], inquirySessions: Set<string>,
  opts: { from?: string; to?: string; weights?: CreditWeights; matches?: Map<string, ClickMatch>; now?: number } = {},
): ClickCredit[] {
  const first = new Map<string, OutboundClick>();
  for (const c of clicks) {
    if (!c.session) continue;
    const day = c.at.slice(0, 10);
    if ((opts.from && day < opts.from) || (opts.to && day > opts.to)) continue;
    const key = `${c.session}|${c.unitId || `dealer:${c.dealerId.toLowerCase()}`}`;
    const cur = first.get(key);
    if (!cur || c.at < cur.at) first.set(key, c);
  }
  return [...first.entries()].sort((a, b) => a[1].at.localeCompare(b[1].at)).map(([key, c]) => {
    const counted = inquirySessions.has(`${c.session}|${c.unitId}`) || inquirySessions.has(`${c.session}|dealer:${c.dealerId.toLowerCase()}`);
    const match = opts.matches?.get(key) ?? null;
    const dealerState = match?.dealer_state ?? c.dealerState ?? null;
    const v = clickCreditVerdict({ clickedAt: c.at, match, dealerState, inquiryCounted: counted, hasSession: true, weights: opts.weights, now: opts.now });
    return {
      key, session: c.session ?? null, unit_id: c.unitId || null, dealer_id: c.dealerId, dealer_name: c.dealerName, dealer_state: dealerState, clicked_at: c.at,
      ...v,
      match: match ? { dealer_record_at: match.dealer_record_at, source: match.source, matched_at: match.matched_at, review: match.review } : null,
    };
  });
}

/** Validates ops input for a click match. Date-only dates are midnight on the dealer's local calendar. */
export function cleanClickMatch(raw: Record<string, unknown>, ctx: { now?: number; dealerState?: string | null; clickedAt?: string } = {}):
  { ok: true; value: { dealer_record_at: string; source: ClickMatchSource; note: string | null } } | { ok: false; code: "invalid_source" | "date_required" | "invalid_date" | "date_in_future" } {
  const now = ctx.now ?? Date.now();
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  if (!(CLICK_MATCH_SOURCES as readonly string[]).includes(source)) return { ok: false, code: "invalid_source" };
  const dateRaw = typeof raw.dealer_record_at === "string" ? raw.dealer_record_at.trim() : "";
  if (!dateRaw) return { ok: false, code: "date_required" };
  const ms = parseDealerDate(dateRaw, dealerTimeZone(ctx.dealerState));
  if (ms === null) return { ok: false, code: "invalid_date" };
  if (ms > now + 86_400_000) return { ok: false, code: "date_in_future" };
  return { ok: true, value: { dealer_record_at: new Date(ms).toISOString(), source: source as ClickMatchSource, note: cleanNote(raw.note) } };
}

// ── Ops input ──────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** A dealer-record date: a date-only value is midnight on the dealer's local calendar; a time without a zone is dealer-local too. */
function parseDealerDate(raw: string, timeZone: string): number | null {
  if (!DATE_RE.test(raw) || !Number.isFinite(Date.parse(raw.length === 10 ? `${raw}T00:00:00Z` : raw))) return null;
  if (raw.length === 10) return zonedMidnight(raw, timeZone);
  if (/(Z|[+-]\d{2}:\d{2})$/.test(raw)) return Date.parse(raw);
  const asUtc = Date.parse(`${raw}Z`);
  const day = raw.slice(0, 10);
  return asUtc - (Date.parse(`${day}T00:00:00Z`) - zonedMidnight(day, timeZone));
}

const cleanNote = (raw: unknown): string | null =>
  typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 280) || null : null;

export type CreditReviewError =
  | "invalid_status" | "reason_required" | "invalid_reason" | "invalid_date" | "date_in_future"
  | "invalid_proof" | "dated_record_required" | "dispute_window_closed";

/**
 * Validates an ops review against the approved terms. `lead` (when given) enforces the
 * dispute window: a new dispute must be filed within LEAD_CREDIT_DISPUTE_DAYS of delivery;
 * a dispute filed in time can still be resolved later. "upheld" and "clear" are always allowed.
 */
export function cleanCreditReview(raw: Record<string, unknown>, nowOrCtx: number | { now?: number; lead?: LeadForCredit | null } = {}):
  { ok: true; review: CreditReview } | { ok: false; code: CreditReviewError } {
  const ctx = typeof nowOrCtx === "number" ? { now: nowOrCtx } : nowOrCtx;
  const now = ctx.now ?? Date.now();
  const status = typeof raw.status === "string" ? raw.status.trim() : "";
  if (status === "clear") return { ok: true, review: emptyReview() };
  if (!(CREDIT_REVIEW_STATUSES as readonly string[]).includes(status) || status === "none") return { ok: false, code: "invalid_status" };
  const reasonRaw = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (reasonRaw && !(CREDIT_REASONS as readonly string[]).includes(reasonRaw)) return { ok: false, code: "invalid_reason" };
  const reason = (reasonRaw || null) as CreditReason | null;
  if ((status === "disputed" || status === "dealer_already_had") && !reason) return { ok: false, code: "reason_required" };
  const proofRaw = typeof raw.proof_type === "string" ? raw.proof_type.trim() : "";
  if (proofRaw && !(PROOF_TYPES as readonly string[]).includes(proofRaw)) return { ok: false, code: "invalid_proof" };
  const proof = (proofRaw || null) as ProofType | null;
  const dateRaw = typeof raw.dealer_record_at === "string" ? raw.dealer_record_at.trim() : "";
  let dealerAt: string | null = null;
  if (dateRaw) {
    const ms = parseDealerDate(dateRaw, dealerTimeZone(ctx.lead?.dealer?.state));
    if (ms === null) return { ok: false, code: "invalid_date" };
    const iso = new Date(ms).toISOString();
    if (Date.parse(iso) > now + 86_400_000) return { ok: false, code: "date_in_future" };
    dealerAt = iso;
  }
  // An undated claim never overturns a lead.
  if (status === "dealer_already_had" && (!dealerAt || !proof)) return { ok: false, code: "dated_record_required" };
  const prior = ctx.lead?.credit?.review;
  let filedAt: string | null = prior?.dispute_filed_at ?? (prior?.status === "disputed" ? prior.at : null);
  if (status === "disputed" || status === "dealer_already_had") {
    if (!filedAt) {
      if (ctx.lead) {
        const { deadline } = disputeDeadline(ctx.lead);
        if (deadline && now > Date.parse(deadline)) return { ok: false, code: "dispute_window_closed" };
      }
      filedAt = new Date(now).toISOString();
    }
  }
  const note = cleanNote(raw.note);
  return {
    ok: true,
    review: { status: status as CreditReviewStatus, reason, dealer_record_at: dealerAt, proof_type: proof, note, by: "matchrv_ops", at: new Date(now).toISOString(), dispute_filed_at: filedAt },
  };
}

export function __setLeadCreditForTests(on: boolean | null): void { enabledOverride = on; }

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import inquiriesRouter from '../src/routes/inquiries';
import leadPages, { __resetLeadPageLimits } from '../src/routes/lead-pages';
import swipeRouter from '../src/routes/swipe';
import { __resetInquiries, __setRoutes, __setTransport, type InquiryTransport } from '../src/services/dealer-inquiries';
import { __resetLeadStore, listLeads, recordLeadStage } from '../src/services/lead-store';
import { __resetLeadFunnel } from '../src/services/lead-funnel';
import { buildCreditSummary, leadsCsv } from '../src/services/lead-report';
import { __setLeadTrackingForTests } from '../src/services/lead-tracking-config';
import {
  __setLeadCreditForTests, cleanCreditReview, clickCreditVerdict, computeClickCredits, creditQualified, creditVerdict, creditWeights,
  dealerTimeZone, dealerWins, detectBuyingSignals, disputeWindowDays, emptyReview, localDay, tiesToDealer, zonedMidnight, type LeadCredit,
} from '../src/services/lead-credit';
import { allSessionClicks, outboundSessionHash, resetOutboundClicks, type OutboundClick } from '../src/services/outbound-clicks';
import { __resetClickMatches } from '../src/services/click-matches';
import { deckEligible } from '../src/services/swipe-deck';
import { getScreenedInventory } from '../src/services/screened-inventory';
import { resetProductAnalyticsForTests } from '../src/services/product-analytics';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TOKEN = 'dash-token-for-tests-only-0123456789abcdef';
const transport: InquiryTransport = { emailConfigured: () => true, opsPushConfigured: () => true, async sendEmail() {}, async notifyOps() {} };
const ENV = ['LEAD_CREDIT_WINDOW_DAYS', 'LEAD_CREDIT_DISPUTE_DAYS', 'LEAD_CREDIT_TIES_TO_DEALER', 'LEAD_CREDIT_WEIGHT_CLICK', 'LEAD_CREDIT_WEIGHT_INQUIRY', 'LEAD_CREDIT_WEIGHT_QUALIFIED'];

let base = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;
beforeAll(async () => {
  const app = express();
  app.use(express.json()); app.use(express.urlencoded({ extended: true }));
  app.use(leadPages); app.use('/api', inquiriesRouter); app.use('/api', swipeRouter);
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  // Keep idle sockets open longer than slow steps on CI, so fetch never reuses a socket the server just closed (ECONNRESET).
  server.keepAliveTimeout = 120_000; server.headersTimeout = 121_000;
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); __setTransport(null); __setLeadTrackingForTests({ enabled: null, receiptLinks: null }); __setLeadCreditForTests(null); resetProductAnalyticsForTests(); delete process.env.LEADS_DASHBOARD_TOKEN; });
beforeEach(() => {
  __resetInquiries(); __setRoutes({}); __setTransport(transport);
  __resetLeadStore(); __resetLeadFunnel(); __resetLeadPageLimits(); resetOutboundClicks(); __resetClickMatches();
  __setLeadTrackingForTests({ enabled: true, receiptLinks: false });
  __setLeadCreditForTests(true);
  for (const k of ENV) delete process.env[k];
  delete process.env.LEADS_DASHBOARD_TOKEN;
});

const units = () => getScreenedInventory().units.filter((u) => deckEligible(u) && u.provenance.listingUrl);
async function inquiry(unitId: string, sid: string, shopper: Record<string, string>) {
  const headers = { 'content-type': 'application/json', 'user-agent': CHROME, 'x-matchrv-session-id': sid };
  const prev = await (await fetch(`${base}/api/inquiries`, { method: 'POST', headers, body: JSON.stringify({ unit_id: unitId, ...shopper }) })).json();
  await fetch(`${base}/api/inquiries`, { method: 'POST', headers, body: JSON.stringify({ confirmation_token: prev.confirmationToken, confirmed: true }) });
}
const click = (unitId: string, sid: string) => fetch(`${base}/api/out?unit=${encodeURIComponent(unitId)}&from=swipe_detail&sid=${sid}`, { redirect: 'manual' });

const credit = (ev: Partial<LeadCredit['evidence']> = {}, review = emptyReview()): LeadCredit => ({
  policy_version: 2,
  evidence: { first_view_at: null, first_outbound_click_at: null, outbound_clicks: 0, outbound_surfaces: [], price_alert_before_leaving: false, inquiry_at: '2026-11-10T12:00:00.000Z', first_touch_at: '2026-11-10T12:00:00.000Z', has_name: true, has_email: true, has_phone: false, buying_signals: [], ...ev },
  review,
});
const lead = (c: LeadCredit | null, lost: string | null = null) => ({ test: false, created_at: '2026-11-10T12:00:00.000Z', credit: c, lifecycle: { sent_at: '2026-11-10T12:00:00.000Z', delivered_at: '2026-11-10T12:05:00.000Z', lost_reason: lost } });

describe('approved defaults', () => {
  it('window 30, dispute 7 days, ties to dealer on, weights 0.5 / 1.0 / 1.5, all configurable', () => {
    expect(disputeWindowDays()).toBe(7);
    expect(tiesToDealer()).toBe(true);
    expect(creditWeights()).toEqual({ click: 0.5, inquiry: 1, qualified: 1.5 });
    process.env.LEAD_CREDIT_WEIGHT_QUALIFIED = '2'; process.env.LEAD_CREDIT_WEIGHT_CLICK = '-1';
    process.env.LEAD_CREDIT_DISPUTE_DAYS = '10'; process.env.LEAD_CREDIT_TIES_TO_DEALER = 'off';
    expect(creditWeights()).toEqual({ click: 0.5, inquiry: 1, qualified: 2 });
    expect(disputeWindowDays()).toBe(10);
    expect(tiesToDealer()).toBe(false);
  });
});

describe('weights and qualification', () => {
  it('buying signals: timeline, trade-in, financing; the prefilled website message is not a timeline', () => {
    expect(detectBuyingSignals({ message: "I'd like to see the 2025 Rockwood 190TG in person. Is it still available, and when could I come by?" })).toEqual([]);
    expect(detectBuyingSignals({ message: 'Is this still available?' })).toEqual([]);
    expect(detectBuyingSignals({ message: 'Looking to buy this weekend, I have a trade-in and need financing' })).toEqual(['timeline', 'trade_in', 'financing']);
    expect(detectBuyingSignals({ message: 'Can I come Saturday?' })).toEqual(['timeline']);
    expect(detectBuyingSignals({ message: 'hello', shared: { tradeIn: true, financing: false } })).toEqual(['trade_in']);
  });
  it('qualified = phone + at least one buying signal', () => {
    expect(creditQualified(credit({ has_phone: true, buying_signals: ['financing'] }).evidence)).toBe(true);
    expect(creditQualified(credit({ has_phone: true }).evidence)).toBe(false);
    expect(creditQualified(credit({ buying_signals: ['timeline'] }).evidence)).toBe(false);
  });
  it('basic inquiry = 1.0, qualified = 1.5, not billable = 0', () => {
    expect(creditVerdict(lead(credit()))).toMatchObject({ billable: true, credit_weight: 1, credit_tier: 'basic' });
    expect(creditVerdict(lead(credit({ has_phone: true, buying_signals: ['trade_in'] })))).toMatchObject({ credit_weight: 1.5, credit_tier: 'qualified' });
    expect(creditVerdict(lead(credit({}, { ...emptyReview(), status: 'disputed', reason: 'other' })))).toMatchObject({ billable: false, credit_weight: 0 });
  });
});

describe('auto non-billable', () => {
  it('test, spam, wrong number and duplicate leads are never billed', () => {
    expect(creditVerdict({ ...lead(credit()), test: true })).toMatchObject({ billable: false, status: 'test' });
    expect(creditVerdict(lead(credit(), 'spam'))).toMatchObject({ billable: false, status: 'spam' });
    expect(creditVerdict(lead(credit(), 'wrong_number'))).toMatchObject({ billable: false, status: 'wrong_number' });
    expect(creditVerdict(lead(credit(), 'duplicate'))).toMatchObject({ billable: false, status: 'duplicate' });
  });
  it('ops can mark a lead lost as wrong_number', async () => {
    await inquiry(units()[0].id, '1763800000000-aaa1111', { name: 'Pat Shopper', email: 'pat@example.com', message: 'Is this still available?' });
    const [l] = listLeads();
    expect(recordLeadStage(l.lead_id, 'lost', { reason: 'wrong_number', by: 'matchrv_ops' }).ok).toBe(true);
    expect(creditVerdict(listLeads()[0]).status).toBe('wrong_number');
  });
  it('the same shopper asking about the same RV again is one lead (a repeat), so one credit', async () => {
    const u = units()[0];
    const shopper = { name: 'Pat Shopper', email: 'pat@example.com', message: 'Is this still available?' };
    await inquiry(u.id, '1763800000000-aaa1111', shopper);
    await inquiry(u.id, '1763800000000-aaa1111', { ...shopper, message: 'Following up' });
    expect(listLeads()).toHaveLength(1);
    expect(buildCreditSummary({}).leadCredits).toBe(1);
  });
});

describe('disputes', () => {
  const now = Date.parse('2026-11-14T00:00:00.000Z');
  const late = Date.parse('2026-11-18T00:00:00.000Z');
  it('a dealer has 7 days from delivery to dispute; after that the lead stands', () => {
    expect(cleanCreditReview({ status: 'disputed', reason: 'dealer_crm_record_earlier' }, { lead: lead(credit()), now })).toMatchObject({ ok: true, review: { dispute_filed_at: new Date(now).toISOString() } });
    expect(cleanCreditReview({ status: 'disputed', reason: 'dealer_crm_record_earlier' }, { lead: lead(credit()), now: late })).toEqual({ ok: false, code: 'dispute_window_closed' });
    expect(cleanCreditReview({ status: 'upheld', reason: 'matchrv_evidence_earlier' }, { lead: lead(credit()), now: late }).ok).toBe(true);
    expect(creditVerdict(lead(credit()), { now: late })).toMatchObject({ billable: true, dispute_window_open: false, dispute_deadline: '2026-11-17T12:05:00.000Z' });
  });
  it('a dispute filed in time can be resolved after the window', () => {
    const filed = cleanCreditReview({ status: 'disputed', reason: 'dealer_crm_record_earlier' }, { lead: lead(credit()), now });
    if (!filed.ok) throw new Error('not filed');
    const resolved = cleanCreditReview({ status: 'dealer_already_had', reason: 'dealer_crm_record_earlier', proof_type: 'crm_entry', dealer_record_at: '2026-11-01' }, { lead: lead(credit({}, filed.review)), now: late });
    expect(resolved).toMatchObject({ ok: true, review: { dispute_filed_at: filed.review.dispute_filed_at } });
  });
  it('an undated claim does not overturn a lead', () => {
    expect(cleanCreditReview({ status: 'dealer_already_had', reason: 'existing_customer' }, { lead: lead(credit()), now })).toEqual({ ok: false, code: 'dated_record_required' });
    expect(cleanCreditReview({ status: 'dealer_already_had', reason: 'existing_customer', dealer_record_at: '2026-11-01' }, { lead: lead(credit()), now })).toEqual({ ok: false, code: 'dated_record_required' });
    // A date without proof type on an "upheld" review is ignored by the verdict.
    expect(creditVerdict(lead(credit({}, { ...emptyReview(), status: 'upheld', dealer_record_at: '2026-11-01T00:00:00.000Z' })))).toMatchObject({ billable: true });
  });
  it('earliest timestamp wins; ties and same-day close calls go to the dealer while the pilot flag is on', () => {
    const touch = Date.parse('2026-11-10T12:00:00.000Z');
    expect(dealerWins(Date.parse('2026-11-09T23:00:00.000Z'), touch, true)).toBe(true);
    expect(dealerWins(Date.parse('2026-11-10T18:00:00.000Z'), touch, true)).toBe(true); // same day, later: pilot gives it to the dealer
    expect(dealerWins(Date.parse('2026-11-10T18:00:00.000Z'), touch, false)).toBe(false);
    expect(dealerWins(touch, touch, false)).toBe(false);
    expect(dealerWins(Date.parse('2026-11-11T09:00:00.000Z'), touch, true)).toBe(false);
  });
  it("same day means the dealer's local day (dealer time zone; Pacific when unknown), not UTC", () => {
    expect(dealerTimeZone('FL')).toBe('America/New_York');
    expect(dealerTimeZone('wa')).toBe('America/Los_Angeles');
    expect(dealerTimeZone(null)).toBe('America/Los_Angeles');
    expect(dealerTimeZone('ZZ')).toBe('America/Los_Angeles');
    // MatchRV touch 9 PM Pacific on Nov 10 (05:00 UTC Nov 11); dealer record 8 AM Pacific Nov 11.
    const touch = Date.parse('2026-11-11T05:00:00.000Z'), dealer = Date.parse('2026-11-11T16:00:00.000Z');
    expect(localDay(touch, 'America/Los_Angeles')).toBe('2026-11-10');
    expect(dealerWins(dealer, touch, true, 'America/Los_Angeles')).toBe(false); // different local days: MatchRV first
    expect(dealerWins(dealer, touch, true, 'America/New_York')).toBe(true);     // same local day in Florida: the dealer
    // The same pair on a lead: a Washington dealer loses the tie-break, a Florida dealer wins it.
    const l = (state: string) => ({ ...lead(credit({ first_touch_at: '2026-11-11T05:00:00.000Z' }, { ...emptyReview(), status: 'upheld', proof_type: 'crm_entry', dealer_record_at: '2026-11-11T16:00:00.000Z' })), dealer: { state } });
    expect(creditVerdict(l('WA'))).toMatchObject({ billable: true });
    expect(creditVerdict(l('FL'))).toMatchObject({ billable: false, status: 'dealer_already_had' });
    // A date-only dealer record is midnight on the dealer's local day.
    expect(new Date(zonedMidnight('2026-11-11', 'America/New_York')).toISOString()).toBe('2026-11-11T05:00:00.000Z');
    const fl = cleanCreditReview({ status: 'dealer_already_had', reason: 'dealer_crm_record_earlier', proof_type: 'crm_entry', dealer_record_at: '2026-11-11' }, { lead: { ...lead(credit()), dealer: { state: 'FL' } }, now: Date.parse('2026-11-12T00:00:00Z') });
    expect(fl.ok && fl.review.dealer_record_at).toBe('2026-11-11T05:00:00.000Z');
  });
});

describe('click-only credits (0.5, only once matched)', () => {
  const c = (at: string, session: string | undefined, unitId = 'u1', dealerId = 'd1'): OutboundClick => ({ at, session, unitId, dealerId, dealerName: 'D', host: 'd.example', from: 'swipe_detail' });
  const match = (dealer_record_at: string, matched_at = '2026-11-16T00:00:00.000Z', review = emptyReview()) => ({ dealer_record_at, matched_at, review });
  it('unmatched clicks count 0; once per shopper session per RV; never without a session or after a counted inquiry', () => {
    const credits = computeClickCredits([
      c('2026-11-10T10:00:00.000Z', 'sA'), c('2026-11-10T11:00:00.000Z', 'sA'),
      c('2026-11-10T10:00:00.000Z', 'sB'),
      c('2026-11-10T10:00:00.000Z', undefined),
      c('2026-11-10T10:00:00.000Z', 'sC', 'u2'),
    ], new Set(['sC|u2']));
    expect(credits.map((x) => [x.session, x.status, x.credit_weight])).toEqual([
      ['sA', 'unmatched', 0], ['sB', 'unmatched', 0], ['sC', 'already_counted_as_inquiry', 0],
    ]);
  });
  it("a matched click counts only if it precedes the dealer's own record, within the window", () => {
    const base = { clickedAt: '2026-11-10T12:00:00.000Z', inquiryCounted: false, hasSession: true, ties: true, now: Date.parse('2026-11-17T00:00:00.000Z') };
    expect(clickCreditVerdict({ ...base })).toMatchObject({ status: 'unmatched', credit_weight: 0 });
    expect(clickCreditVerdict({ ...base, match: match('2026-11-15T18:00:00.000Z') })).toMatchObject({ status: 'credited', credit_weight: 0.5, dispute_deadline: '2026-11-23T00:00:00.000Z', dispute_window_open: true });
    expect(clickCreditVerdict({ ...base, match: match('2026-11-09T18:00:00.000Z') })).toMatchObject({ status: 'dealer_already_had', credit_weight: 0 });
    expect(clickCreditVerdict({ ...base, match: match('2026-11-10T22:00:00.000Z') })).toMatchObject({ status: 'dealer_already_had', credit_weight: 0 }); // same local day
    expect(clickCreditVerdict({ ...base, match: match('2026-12-25T18:00:00.000Z') })).toMatchObject({ status: 'outside_window', credit_weight: 0 });
    expect(clickCreditVerdict({ ...base, inquiryCounted: true, match: match('2026-11-15T18:00:00.000Z') })).toMatchObject({ status: 'already_counted_as_inquiry', credit_weight: 0 });
  });
  it('a dealer dispute of a match: pending counts 0; a dated earlier record takes it off; the window runs 7 days from the match being sent', () => {
    const base = { clickedAt: '2026-11-10T12:00:00.000Z', inquiryCounted: false, hasSession: true, ties: true };
    expect(clickCreditVerdict({ ...base, match: match('2026-11-15T18:00:00.000Z', undefined, { ...emptyReview(), status: 'disputed', reason: 'existing_customer' }) })).toMatchObject({ status: 'disputed_pending', credit_weight: 0 });
    expect(clickCreditVerdict({ ...base, match: match('2026-11-15T18:00:00.000Z', undefined, { ...emptyReview(), status: 'upheld', proof_type: 'email', dealer_record_at: '2026-11-01T17:00:00.000Z' }) })).toMatchObject({ status: 'dealer_already_had' });
    expect(clickCreditVerdict({ ...base, now: Date.parse('2026-11-24T00:00:00Z'), match: match('2026-11-15T18:00:00.000Z') })).toMatchObject({ status: 'credited', dispute_window_open: false });
  });
});

describe('wrong-number flag', () => {
  it('flags a dealer marking more than 3 leads wrong_number from the receipt page in 30 days', async () => {
    const u = units()[0];
    for (let i = 0; i < 5; i++) await inquiry(u.id, `1763800000000-wn${i}aaaa`, { name: `Shopper ${i}`, email: `wn${i}@example.com`, message: 'hi' });
    const ls = listLeads();
    expect(ls.length).toBe(5);
    for (const l of ls.slice(0, 3)) recordLeadStage(l.lead_id, 'lost', { reason: 'wrong_number', by: 'dealer_receipt' });
    recordLeadStage(ls[3].lead_id, 'lost', { reason: 'wrong_number', by: 'matchrv_ops' }); // ops marks don't count toward the flag
    expect(buildCreditSummary({}).wrongNumberFlags).toEqual([]);
    recordLeadStage(ls[4].lead_id, 'lost', { reason: 'wrong_number', by: 'dealer_receipt' });
    expect(buildCreditSummary({}).wrongNumberFlags).toMatchObject([{ dealerId: u.dealer.id, count: 4 }]);
    expect(buildCreditSummary({ now: Date.now() + 31 * 86_400_000 }).wrongNumberFlags).toEqual([]); // rolling 30 days
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    __setLeadCreditForTests(false); // the flag shows even with lead credit off
    const html = await (await fetch(`${base}/ops/leads-dashboard`, { headers: { authorization: `Bearer ${TOKEN}` } })).text();
    expect(html).toContain('frequent "wrong number" marks');
  });
});

describe('totals, dashboard and CSV', () => {
  it('total credits = lead credits + click-only credits, with no double credit for a click followed by an inquiry', async () => {
    const [u1, u2] = [units()[0], units().find((u) => u.dealer.id !== units()[0].dealer.id)!];
    await click(u1.id, '1763800000000-bbb2222');           // later inquires -> click not counted
    await click(u2.id, '1763800000000-ccc3333');           // click only -> 0 until matched, then 0.5
    await click(u2.id, '1763800000000-eee5555');           // click only, never matched -> 0
    await new Promise((r) => setTimeout(r, 5));
    await inquiry(u1.id, '1763800000000-bbb2222', { name: 'Kim Shopper', email: 'kim@example.com', phone: '(253) 555-0142', message: 'Ready to buy this weekend, I have a trade-in.' });
    expect(buildCreditSummary({})).toMatchObject({ leadCredits: 1.5, clickCredits: 0, matchedClicks: 0, unmatchedClicks: 2, totalCredits: 1.5 });
    const recorded = allSessionClicks().find((x) => x.session === outboundSessionHash('1763800000000-ccc3333'))!;
    expect(recorded.dealerState ?? null).toBe(u2.dealer.state || null);
    const key = `${recorded.session}|${u2.id}`;
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const bad = await fetch(`${base}/ops/leads-dashboard/api/click-matches`, { method: 'POST', headers: auth, body: JSON.stringify({ click_key: key, dealer_record_at: tomorrow }) });
    expect(bad.status).toBe(400); // source required
    const missing = await fetch(`${base}/ops/leads-dashboard/api/click-matches`, { method: 'POST', headers: auth, body: JSON.stringify({ click_key: `${'0'.repeat(32)}|${u2.id}`, dealer_record_at: tomorrow, source: 'crm_export' }) });
    expect(missing.status).toBe(404);
    const made = await fetch(`${base}/ops/leads-dashboard/api/click-matches`, { method: 'POST', headers: auth, body: JSON.stringify({ click_key: key, dealer_record_at: tomorrow, source: 'dealer_analytics_utm' }) });
    expect(made.status).toBe(201);
    const sum = buildCreditSummary({});
    expect(sum).toMatchObject({ billableLeads: 1, qualifiedLeads: 1, leadCredits: 1.5, clickCredits: 0.5, creditedClicks: 1, matchedClicks: 1, unmatchedClicks: 1, clicksAlreadyCounted: 1, totalCredits: 2 });
    const html = await (await fetch(`${base}/ops/leads-dashboard`, { headers: { authorization: `Bearer ${TOKEN}` } })).text();
    expect(html).toContain('<b>2</b>Total credits');
    expect(html).toContain('<b>0.5</b>Matched click credits');
    expect(html).toContain('<b>1</b>Unmatched clicks (count 0)');
    expect(html).toContain('MatchRV evidence trail');
    const [head, row] = leadsCsv({}).split('\r\n');
    const cols = head.split(','); const vals = row.split(',');
    expect(vals[cols.indexOf('credit_weight')]).toBe('1.5');
    expect(vals[cols.indexOf('credit_tier')]).toBe('qualified');
    expect(vals[cols.indexOf('credit_buying_signals')]).toBe('timeline|trade_in');
    expect(vals[cols.indexOf('credit_first_outbound_click_at')]).not.toBe('');
    expect(vals[cols.indexOf('credit_dispute_deadline')]).not.toBe('');
    const report = await (await fetch(`${base}/ops/leads-dashboard/api/report`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
    expect(report.credit.totalCredits).toBe(2);
  });
  it('the review API refuses a dispute after the 7-day window (409)', async () => {
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    process.env.LEAD_CREDIT_DISPUTE_DAYS = '1';
    await inquiry(units()[0].id, '1763800000000-ddd4444', { name: 'Pat Shopper', email: 'pat@example.com', message: 'hi' });
    const [l] = listLeads();
    l.lifecycle.delivered_at = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const r = await fetch(`${base}/ops/leads-dashboard/api/leads/${l.lead_id}/credit`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'disputed', reason: 'existing_customer' }) });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('dispute_window_closed');
  });
  it('a click match starts its own 7-day dispute clock; a dispute inside it holds the credit, after it the credit stands', async () => {
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    const u = units()[0];
    await click(u.id, '1763800000000-fff6666');
    const key = `${outboundSessionHash('1763800000000-fff6666')}|${u.id}`;
    const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
    const later = new Date(Date.now() + 86_400_000).toISOString();
    expect((await fetch(`${base}/ops/leads-dashboard/api/click-matches`, { method: 'POST', headers: auth, body: JSON.stringify({ click_key: key, dealer_record_at: later, source: 'crm_export' }) })).status).toBe(201);
    const disputed = await fetch(`${base}/ops/leads-dashboard/api/click-matches/credit`, { method: 'POST', headers: auth, body: JSON.stringify({ click_key: key, status: 'disputed', reason: 'existing_customer' }) });
    expect(disputed.status).toBe(200);
    expect(buildCreditSummary({}).clicks.find((c) => c.key === key)).toMatchObject({ status: 'disputed_pending', credit_weight: 0 });
    // Correcting the match keeps the original match-sent time (the clock never restarts).
    const fixed = await (await fetch(`${base}/ops/leads-dashboard/api/click-matches`, { method: 'POST', headers: auth, body: JSON.stringify({ click_key: key, dealer_record_at: later, source: 'email' }) })).json();
    expect(fixed.created).toBe(false);
    expect(fixed.match.review.status).toBe('disputed');
    // A second click, matched long ago: a new dispute is refused.
    process.env.LEAD_CREDIT_DISPUTE_DAYS = '1';
    await click(u.id, '1763800000000-ggg7777');
    const key2 = `${outboundSessionHash('1763800000000-ggg7777')}|${u.id}`;
    const m2 = await (await fetch(`${base}/ops/leads-dashboard/api/click-matches`, { method: 'POST', headers: auth, body: JSON.stringify({ click_key: key2, dealer_record_at: later, source: 'crm_export' }) })).json();
    const { getClickMatch } = await import('../src/services/click-matches');
    getClickMatch(key2)!.matched_at = new Date(Date.now() - 3 * 86_400_000).toISOString();
    expect(m2.match.click_key).toBe(key2);
    const late = await fetch(`${base}/ops/leads-dashboard/api/click-matches/credit`, { method: 'POST', headers: auth, body: JSON.stringify({ click_key: key2, status: 'disputed', reason: 'existing_customer' }) });
    expect(late.status).toBe(409);
    expect(buildCreditSummary({}).clicks.find((c) => c.key === key2)).toMatchObject({ status: 'credited', credit_weight: 0.5, dispute_window_open: false });
  });
});

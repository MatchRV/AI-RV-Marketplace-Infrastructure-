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
  dealerWins, detectBuyingSignals, disputeWindowDays, emptyReview, tiesToDealer, type LeadCredit,
} from '../src/services/lead-credit';
import { resetOutboundClicks, type OutboundClick } from '../src/services/outbound-clicks';
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
  __resetLeadStore(); __resetLeadFunnel(); __resetLeadPageLimits(); resetOutboundClicks();
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
});

describe('click-only credits (0.5)', () => {
  const c = (at: string, session: string | undefined, unitId = 'u1', dealerId = 'd1'): OutboundClick => ({ at, session, unitId, dealerId, dealerName: 'D', host: 'd.example', from: 'swipe_detail' });
  it('counts once per shopper session per RV, never without a session, never when a MatchRV inquiry already counted', () => {
    const credits = computeClickCredits([
      c('2026-11-10T10:00:00.000Z', 'sA'), c('2026-11-10T11:00:00.000Z', 'sA'),
      c('2026-11-10T10:00:00.000Z', 'sB'),
      c('2026-11-10T10:00:00.000Z', undefined),
      c('2026-11-10T10:00:00.000Z', 'sC', 'u2'),
    ], new Set(['sC|u2']));
    expect(credits.map((x) => [x.session, x.status, x.credit_weight])).toEqual([
      ['sA', 'provisional', 0.5], ['sB', 'provisional', 0.5], ['sC', 'already_counted_as_inquiry', 0],
    ]);
  });
  it("a click counts only if it precedes the dealer's own record, within the window", () => {
    const base = { clickedAt: '2026-11-10T12:00:00.000Z', inquiryCounted: false, hasSession: true, ties: true };
    expect(clickCreditVerdict({ ...base, dealerRecordAt: '2026-11-15T00:00:00.000Z' })).toEqual({ status: 'credited', credit_weight: 0.5 });
    expect(clickCreditVerdict({ ...base, dealerRecordAt: '2026-11-09T00:00:00.000Z' })).toEqual({ status: 'dealer_already_had', credit_weight: 0 });
    expect(clickCreditVerdict({ ...base, dealerRecordAt: '2026-12-25T00:00:00.000Z' })).toEqual({ status: 'outside_window', credit_weight: 0 });
    expect(clickCreditVerdict({ ...base, inquiryCounted: true })).toEqual({ status: 'already_counted_as_inquiry', credit_weight: 0 });
  });
});

describe('totals, dashboard and CSV', () => {
  it('total credits = lead credits + click-only credits, with no double credit for a click followed by an inquiry', async () => {
    const [u1, u2] = [units()[0], units().find((u) => u.dealer.id !== units()[0].dealer.id)!];
    await click(u1.id, '1763800000000-bbb2222');           // later inquires -> click not counted
    await click(u2.id, '1763800000000-ccc3333');           // click only -> 0.5
    await new Promise((r) => setTimeout(r, 5));
    await inquiry(u1.id, '1763800000000-bbb2222', { name: 'Kim Shopper', email: 'kim@example.com', phone: '(253) 555-0142', message: 'Ready to buy this weekend, I have a trade-in.' });
    const sum = buildCreditSummary({});
    expect(sum).toMatchObject({ billableLeads: 1, qualifiedLeads: 1, leadCredits: 1.5, clickCredits: 0.5, creditedClicks: 1, clicksAlreadyCounted: 1, totalCredits: 2 });
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    const html = await (await fetch(`${base}/ops/leads-dashboard`, { headers: { authorization: `Bearer ${TOKEN}` } })).text();
    expect(html).toContain('<b>2</b>Total credits');
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
});

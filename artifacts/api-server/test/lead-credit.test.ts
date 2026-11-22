import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { getInventory } from '../src/services/agent-inventory';
import inquiriesRouter from '../src/routes/inquiries';
import leadFunnelRouter, { __resetFunnelRateLimit } from '../src/routes/lead-funnel';
import leadPages, { __resetLeadPageLimits } from '../src/routes/lead-pages';
import swipeRouter from '../src/routes/swipe';
import { __resetInquiries, __setRoutes, __setTransport, type InquiryTransport } from '../src/services/dealer-inquiries';
import { __resetLeadStore, listLeads } from '../src/services/lead-store';
import { __resetLeadFunnel } from '../src/services/lead-funnel';
import { leadsCsv } from '../src/services/lead-report';
import { __setLeadTrackingForTests } from '../src/services/lead-tracking-config';
import { __setLeadCreditForTests, buildCreditEvidence, cleanCreditReview, creditVerdict, creditWindowDays, emptyReview, type LeadCredit } from '../src/services/lead-credit';
import { clicksForSession, outboundSessionHash, outboundSummary, resetOutboundClicks } from '../src/services/outbound-clicks';
import { deckEligible, withUtm } from '../src/services/swipe-deck';
import { getScreenedInventory } from '../src/services/screened-inventory';
import { resetProductAnalyticsForTests } from '../src/services/product-analytics';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TOKEN = 'dash-token-for-tests-only-0123456789abcdef';
const SID = '1763800000000-abc1234';
const transport: InquiryTransport = { emailConfigured: () => true, opsPushConfigured: () => true, async sendEmail() {}, async notifyOps() {} };

let base = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;
const prevToken = process.env.LEADS_DASHBOARD_TOKEN;

beforeAll(async () => {
  const app = express();
  app.use(express.json()); app.use(express.urlencoded({ extended: true }));
  app.use(leadPages);
  app.use('/api', inquiriesRouter);
  app.use('/api', leadFunnelRouter);
  app.use('/api', swipeRouter);
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close(); __setTransport(null); __setLeadTrackingForTests({ enabled: null, receiptLinks: null }); __setLeadCreditForTests(null); resetProductAnalyticsForTests();
  if (prevToken === undefined) delete process.env.LEADS_DASHBOARD_TOKEN; else process.env.LEADS_DASHBOARD_TOKEN = prevToken;
});
beforeEach(() => {
  __resetInquiries(); __setRoutes({}); __setTransport(transport);
  __resetLeadStore(); __resetLeadFunnel(); __resetFunnelRateLimit(); __resetLeadPageLimits(); resetOutboundClicks();
  __setLeadTrackingForTests({ enabled: true, receiptLinks: false });
  __setLeadCreditForTests(null);
  delete process.env.LEADS_DASHBOARD_TOKEN;
  delete process.env.LEAD_CREDIT_WINDOW_DAYS;
});

/** An available unit with a dealer listing URL that the swipe deck would also show. */
const unit = () => getScreenedInventory().units.find((u) => deckEligible(u) && u.provenance.listingUrl && u.dealer.website)!;
const SHOPPER = { name: 'Pat Shopper', email: 'pat.shopper@example.com', phone: '(253) 555-0142', message: 'Is this still available?' };

async function websiteInquiry(unitId: string, sid = SID) {
  const headers = { 'content-type': 'application/json', 'user-agent': CHROME, 'x-matchrv-session-id': sid };
  const prev = await (await fetch(`${base}/api/inquiries`, { method: 'POST', headers, body: JSON.stringify({ unit_id: unitId, ...SHOPPER }) })).json();
  const r = await fetch(`${base}/api/inquiries`, { method: 'POST', headers, body: JSON.stringify({ confirmation_token: prev.confirmationToken, confirmed: true }) });
  return r.status;
}

const credit = (over: Partial<LeadCredit['evidence']> = {}, review = emptyReview()): LeadCredit => ({
  policy_version: 1,
  evidence: { first_view_at: null, first_outbound_click_at: null, outbound_clicks: 0, outbound_surfaces: [], price_alert_before_leaving: false, inquiry_at: '2026-11-10T12:00:00.000Z', first_touch_at: '2026-11-10T12:00:00.000Z', ...over },
  review,
});

describe('tagged outbound redirect (/api/out)', () => {
  it('records surface, time and a hashed session id, and tags the dealer URL with utm_source/medium/campaign', async () => {
    const u = unit();
    const r = await fetch(`${base}/api/out?unit=${encodeURIComponent(u.id)}&from=swipe_detail&sid=${SID}&alert=1`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get('location')!);
    const dealerHadUtm = [...new URL(u.provenance.listingUrl!).searchParams.keys()].some((k) => /^utm_/i.test(k));
    if (!dealerHadUtm) {
      expect(loc.searchParams.get('utm_source')).toBe('matchrv');
      expect(loc.searchParams.get('utm_medium')).toBe('referral');
      expect(loc.searchParams.get('utm_campaign')).toBe('swipe_detail');
    }
    const [click] = outboundSummary().recent;
    expect(click).toMatchObject({ unitId: u.id, dealerId: u.dealer.id, from: 'swipe_detail', alert: true, session: outboundSessionHash(SID) });
    expect(JSON.stringify(click)).not.toContain(SID);
    expect(clicksForSession(outboundSessionHash(SID))).toHaveLength(1);
  });

  it('dealer home links go only to a dealer MatchRV lists, never an arbitrary URL', async () => {
    const u = unit();
    const ok = await fetch(`${base}/api/out?dealer=${encodeURIComponent(u.dealer.id)}&from=answer_engine`, { redirect: 'manual' });
    expect(ok.status).toBe(302);
    expect(new URL(ok.headers.get('location')!).hostname).toBe(new URL(u.dealer.website!).hostname);
    const evil = await fetch(`${base}/api/out?dealer=${encodeURIComponent('https://evil.example')}&from=answer_engine`, { redirect: 'manual' });
    expect(evil.headers.get('location')).toBe('/swipe');
    const unknown = await fetch(`${base}/api/out?dealer=no-such-dealer&from=answer_engine`, { redirect: 'manual' });
    expect(unknown.headers.get('location')).toBe('/swipe');
    expect(outboundSummary().total).toBe(1);
    expect(outboundSummary().recent[0]).toMatchObject({ unitId: '', from: 'answer_engine' });
  });

  it('a malformed sid is ignored, never stored', async () => {
    const u = unit();
    await fetch(`${base}/api/out?unit=${encodeURIComponent(u.id)}&from=listing_detail&sid=${encodeURIComponent('a b<script>')}`, { redirect: 'manual' });
    expect(outboundSummary().recent[0].session).toBeUndefined();
  });

  it("keeps a dealer's own utm tags instead of overwriting them", () => {
    expect(withUtm('https://dealer.example.com/u/1?utm_source=google&utm_campaign=x', 'swipe')).toBe('https://dealer.example.com/u/1?utm_source=google&utm_campaign=x');
    expect(new URL(withUtm('https://dealer.example.com/u/1?stock=A', 'compare')).searchParams.get('utm_campaign')).toBe('compare');
  });
});

describe('first-touch evidence on the lead', () => {
  it('a later inquiry from the same session carries the outbound click as evidence', async () => {
    const u = unit();
    await fetch(`${base}/api/out?unit=${encodeURIComponent(u.id)}&from=swipe_detail&sid=${SID}`, { redirect: 'manual' });
    await new Promise((r) => setTimeout(r, 5));
    expect([200, 201]).toContain(await websiteInquiry(u.id));
    const [lead] = listLeads();
    expect(lead.credit?.evidence.outbound_clicks).toBe(1);
    expect(lead.credit?.evidence.outbound_surfaces).toEqual(['swipe_detail']);
    expect(Date.parse(lead.credit!.evidence.first_outbound_click_at!)).toBeLessThanOrEqual(Date.parse(lead.created_at));
    expect(lead.credit?.evidence.first_touch_at).toBe(lead.credit?.evidence.first_outbound_click_at);
    expect(lead.credit?.review.status).toBe('none');
  });

  it("another session's clicks never count", async () => {
    const u = unit();
    await fetch(`${base}/api/out?unit=${encodeURIComponent(u.id)}&from=swipe&sid=1763800000000-zzz9999`, { redirect: 'manual' });
    await websiteInquiry(u.id);
    const [lead] = listLeads();
    expect(lead.credit?.evidence.outbound_clicks).toBe(0);
    expect(lead.credit?.evidence.first_touch_at).toBe(lead.created_at);
  });

  it('buildCreditEvidence ignores clicks after the inquiry and views of other RVs', () => {
    const ev = buildCreditEvidence({
      inquiryAt: '2026-11-10T12:00:00.000Z', unitId: 'u-1', dealerId: 'd-1',
      journey: { source: 'server', counts: { views: 2, swipes: 0, favorites: 0, searches: 0, impressions: 0, compares: 0 }, first_at: null, last_at: null,
        events: [{ type: 'view', at: '2026-11-01T00:00:00.000Z', surface: 'grid', unit_id: 'u-other' }, { type: 'view', at: '2026-11-05T00:00:00.000Z', surface: 'unit_detail', unit_id: 'u-1' }] },
      clicks: [
        { at: '2026-11-06T00:00:00.000Z', unitId: 'u-1', dealerId: 'd-1', dealerName: 'D', host: 'd.example', from: 'swipe' },
        { at: '2026-11-11T00:00:00.000Z', unitId: 'u-1', dealerId: 'd-1', dealerName: 'D', host: 'd.example', from: 'swipe' },
      ],
    });
    expect(ev.first_view_at).toBe('2026-11-05T00:00:00.000Z');
    expect(ev.outbound_clicks).toBe(1);
    expect(ev.first_touch_at).toBe('2026-11-05T00:00:00.000Z');
  });
});

describe('credit verdict (DRAFT terms)', () => {
  const lead = (c: LeadCredit | null, test = false) => ({ test, created_at: '2026-11-10T12:00:00.000Z', credit: c });
  const reviewed = (status: 'disputed' | 'dealer_already_had' | 'upheld', dealer_record_at: string | null = null) =>
    ({ ...emptyReview(), status, reason: 'dealer_crm_record_earlier' as const, dealer_record_at, by: 'matchrv_ops' as const, at: '2026-11-12T00:00:00.000Z' });

  it('defaults to a 30-day window, configurable by LEAD_CREDIT_WINDOW_DAYS', () => {
    expect(creditWindowDays()).toBe(30);
    process.env.LEAD_CREDIT_WINDOW_DAYS = '45'; expect(creditWindowDays()).toBe(45);
    process.env.LEAD_CREDIT_WINDOW_DAYS = 'nonsense'; expect(creditWindowDays()).toBe(30);
  });
  it('billable when MatchRV touched first and no earlier dealer record was shown', () => {
    expect(creditVerdict(lead(credit()))).toMatchObject({ billable: true, status: 'billable' });
  });
  it('never billable when the dealer already had the shopper (marked, or its record is earlier or the same day)', () => {
    expect(creditVerdict(lead(credit({}, reviewed('dealer_already_had'))))).toMatchObject({ billable: false, status: 'dealer_already_had' });
    expect(creditVerdict(lead(credit({}, reviewed('upheld', '2026-11-09T00:00:00.000Z'))))).toMatchObject({ billable: false, status: 'dealer_already_had' });
    expect(creditVerdict(lead(credit({}, reviewed('upheld', '2026-11-10T12:00:00.000Z'))))).toMatchObject({ billable: false });
  });
  it('not billable while disputed, outside the window, for tests, or without evidence', () => {
    expect(creditVerdict(lead(credit({}, reviewed('disputed'))))).toMatchObject({ billable: false, status: 'disputed_pending' });
    expect(creditVerdict(lead(credit({}, reviewed('upheld', '2026-12-25T00:00:00.000Z'))))).toMatchObject({ billable: false, status: 'outside_window' });
    expect(creditVerdict(lead(credit({}, reviewed('upheld', '2026-11-20T00:00:00.000Z'))))).toMatchObject({ billable: true });
    expect(creditVerdict(lead(credit(), true))).toMatchObject({ billable: false, status: 'test' });
    expect(creditVerdict(lead(null))).toMatchObject({ billable: false, status: 'no_evidence' });
  });
  it('validates ops input: reason required for a dispute, dates checked, notes trimmed', () => {
    expect(cleanCreditReview({ status: 'disputed' })).toEqual({ ok: false, code: 'reason_required' });
    expect(cleanCreditReview({ status: 'bogus' })).toEqual({ ok: false, code: 'invalid_status' });
    expect(cleanCreditReview({ status: 'upheld', dealer_record_at: 'yesterday' })).toEqual({ ok: false, code: 'invalid_date' });
    expect(cleanCreditReview({ status: 'upheld', dealer_record_at: '2999-01-01' })).toEqual({ ok: false, code: 'date_in_future' });
    const ok = cleanCreditReview({ status: 'dealer_already_had', reason: 'existing_customer', dealer_record_at: '2026-11-01', note: 'x'.repeat(400) });
    expect(ok.ok && ok.review.dealer_record_at).toBe('2026-11-01T00:00:00.000Z');
    expect(ok.ok && ok.review.note?.length).toBe(280);
    expect(cleanCreditReview({ status: 'clear' })).toMatchObject({ ok: true, review: { status: 'none' } });
  });
});

describe('ops review from the dashboard', () => {
  it('flag off: review API answers 409 and the dashboard shows no credit section; CSV verdict columns stay empty', async () => {
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    await websiteInquiry(unit().id);
    const [lead] = listLeads();
    const r = await fetch(`${base}/ops/leads-dashboard/api/leads/${lead.lead_id}/credit`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'dealer_already_had', reason: 'existing_customer' }) });
    expect(r.status).toBe(409);
    const html = await (await fetch(`${base}/ops/leads-dashboard`, { headers: { authorization: `Bearer ${TOKEN}` } })).text();
    expect(html).not.toContain('Lead credit (DRAFT');
    expect(html).toContain('Shoppers sent to dealer sites');
    const csv = leadsCsv({}).split('\r\n');
    const cols = csv[0].split(',');
    const row = csv[1].split(',');
    expect(cols.slice(-2)).toEqual(['credit_verdict', 'credit_billable']);
    expect(row.slice(-2)).toEqual(['', '']);
  });

  it('flag on: Bearer API marks dealer_already_had, verdict flips to not billable, and the CSV shows it', async () => {
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    __setLeadCreditForTests(true);
    await websiteInquiry(unit().id);
    const [lead] = listLeads();
    expect(creditVerdict(lead).billable).toBe(true);
    const r = await fetch(`${base}/ops/leads-dashboard/api/leads/${lead.lead_id}/credit`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'dealer_already_had', reason: 'shopper_used_dealer_form_first', dealer_record_at: '2026-01-02' }) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.verdict).toMatchObject({ billable: false, status: 'dealer_already_had' });
    const csv = leadsCsv({}).split('\r\n')[1].split(',');
    expect(csv.slice(-2)).toEqual(['dealer_already_had', 'false']);
    expect((await fetch(`${base}/ops/leads-dashboard/api/leads/${lead.lead_id}/credit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
  });

  it('flag on: the signed-in dashboard form needs the per-session form token and the same origin', async () => {
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    __setLeadCreditForTests(true);
    await websiteInquiry(unit().id);
    const [lead] = listLeads();
    const login = await fetch(`${base}/ops/leads-dashboard/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: TOKEN }).toString() });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const html = await (await fetch(`${base}/ops/leads-dashboard`, { headers: { cookie } })).text();
    expect(html).toContain('Lead credit (DRAFT terms: 30-day window)');
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
    const url = `${base}/ops/leads-dashboard/leads/${lead.lead_id}/credit`;
    const form = (extra: Record<string, string>, headers: Record<string, string> = {}) =>
      fetch(url, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ status: 'disputed', reason: 'dealer_crm_record_earlier', ...extra }).toString() });
    expect((await form({ csrf: 'wrong' })).status).toBe(403);
    expect((await form({ csrf }, { origin: 'https://evil.example' })).status).toBe(403);
    const ok = await form({ csrf, note: 'Dealer emailed a CRM screenshot' });
    expect(ok.status).toBe(303);
    expect(listLeads()[0].credit?.review).toMatchObject({ status: 'disputed', reason: 'dealer_crm_record_earlier', note: 'Dealer emailed a CRM screenshot', by: 'matchrv_ops' });
    expect(creditVerdict(listLeads()[0])).toMatchObject({ billable: false, status: 'disputed_pending' });
  });
});

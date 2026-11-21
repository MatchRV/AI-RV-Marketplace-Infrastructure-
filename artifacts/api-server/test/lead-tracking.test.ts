import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchRvMcpHandler } from '../src/mcp';
import { getInventory } from '../src/services/agent-inventory';
import inquiriesRouter from '../src/routes/inquiries';
import leadFunnelRouter, { __resetFunnelRateLimit } from '../src/routes/lead-funnel';
import leadPages, { __resetLeadPageLimits, DASHBOARD_COOKIE } from '../src/routes/lead-pages';
import { __resetInquiries, __setRoutes, __setTransport, type InquiryTransport } from '../src/services/dealer-inquiries';
import {
  __flushLeadStore, __readLeadFileForTests, __reloadLeadStore, __resetLeadStore, __setLeadPersistenceForTests,
  buildReceiptUrl, issueReceiptToken, listLeads, mintReceiptToken, priceBand, purgeLeadPii, qualify, recordLeadStage, RECEIPT_TOKEN_RE,
} from '../src/services/lead-store';
import { __resetLeadFunnel } from '../src/services/lead-funnel';
import { buildLeadReport, leadsCsv } from '../src/services/lead-report';
import { __setLeadTrackingForTests } from '../src/services/lead-tracking-config';
import { cleanAttributionObject, classifyTraffic, emptyAttribution } from '../src/services/lead-attribution';
import { configureProductAnalyticsForTests, flushProductAnalytics, resetProductAnalyticsForTests } from '../src/services/product-analytics';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const GPTBOT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot';
const TOKEN = 'dash-token-for-tests-only-0123456789abcdef';

type Sent = { emails: { to: string; subject: string; text: string }[]; pushes: { title: string; body: string }[] };
const sent: Sent = { emails: [], pushes: [] };
const transport: InquiryTransport = {
  emailConfigured: () => true,
  opsPushConfigured: () => true,
  async sendEmail(m) { sent.emails.push(m); },
  async notifyOps(m) { sent.pushes.push(m); },
};

type Captured = { event: string; distinct_id: string; properties: Record<string, unknown> };
let captured: Captured[] = [];

let base = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;
const prevToken = process.env.LEADS_DASHBOARD_TOKEN;

beforeAll(async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use('/api/funnel/events', express.json({ limit: '8kb' }));
  app.use(express.json()); app.use(express.urlencoded({ extended: true }));
  app.use(leadPages);
  app.use('/api', inquiriesRouter);
  app.use('/api', leadFunnelRouter);
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close(); __setTransport(null); __setLeadTrackingForTests({ enabled: null, receiptLinks: null }); resetProductAnalyticsForTests();
  if (prevToken === undefined) delete process.env.LEADS_DASHBOARD_TOKEN; else process.env.LEADS_DASHBOARD_TOKEN = prevToken;
});
beforeEach(() => {
  __resetInquiries(); __setRoutes({}); __setTransport(transport); sent.emails.length = 0; sent.pushes.length = 0;
  __resetLeadStore(); __resetLeadFunnel(); __resetFunnelRateLimit(); __resetLeadPageLimits();
  __setLeadTrackingForTests({ enabled: true, receiptLinks: false });
  delete process.env.LEADS_DASHBOARD_TOKEN;
  captured = [];
  configureProductAnalyticsForTests({
    apiKey: 'test-project-token', host: 'https://us.i.posthog.com', timeoutMs: 50,
    transport: { async sendBatch(body) { captured.push(...(JSON.parse(body) as { batch: Captured[] }).batch); return { ok: true }; } },
  });
});
afterEach(() => { __setLeadPersistenceForTests(false); });

async function settle() { await new Promise((r) => setTimeout(r, 30)); await flushProductAnalytics(); }

const unit = () => getInventory().units.find((u) => u.dealer.city === 'Fife' && u.status === 'available')!;
const otherDealerUnit = () => getInventory().units.find((u) => u.status === 'available' && u.dealer.id !== unit().dealer.id)!;
const SHOPPER = { name: 'Pat Shopper', email: 'pat.shopper@example.com', phone: '(253) 555-0142', message: 'Is this still available? Could I see it Saturday?' };

async function websiteInquiry(opts: { unitId?: string; headers?: Record<string, string>; attribution?: unknown; shopper?: Partial<typeof SHOPPER>; ua?: string } = {}) {
  const headers = { 'content-type': 'application/json', 'user-agent': opts.ua ?? CHROME, ...(opts.headers ?? {}) };
  const body = { unit_id: opts.unitId ?? unit().id, ...SHOPPER, ...(opts.shopper ?? {}), ...(opts.attribution ? { attribution: opts.attribution } : {}) };
  const prev = await (await fetch(`${base}/api/inquiries`, { method: 'POST', headers, body: JSON.stringify(body) })).json();
  const r = await fetch(`${base}/api/inquiries`, { method: 'POST', headers, body: JSON.stringify({ confirmation_token: prev.confirmationToken, confirmed: true }) });
  return { status: r.status, json: await r.json() };
}

async function rpc(method: string, params: Record<string, unknown>, headers: Record<string, string> = {}) {
  const response = await matchRvMcpHandler.fetch(new Request('http://localhost/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  const raw = await response.text();
  return JSON.parse(raw.startsWith('event:') || raw.startsWith('data:') ? raw.split('\n').find((l) => l.startsWith('data:'))!.slice(5) : raw).result;
}
const tool = async (name: string, args: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const r = await rpc('tools/call', { name, arguments: args, _meta: { 'openai/subject': 'v1/lead-tracking-tester' } }, headers);
  return { isError: r.isError === true, data: JSON.parse(r.content.find((c: any) => c.type === 'text').text) };
};

describe('flags off (default): production behavior unchanged', () => {
  beforeEach(() => __setLeadTrackingForTests({ enabled: false }));

  it('an inquiry still sends and alerts ops, but creates no lead and writes no file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leads-off-'));
    __setLeadPersistenceForTests(true, join(dir, 'leads.json'));
    const r = await websiteInquiry({ headers: { 'x-matchrv-client': 'ios', 'x-matchrv-surface': 'swipe' } });
    expect(r.status).toBe(201);
    expect(r.json.inquiry.status).toBeTruthy();
    expect(sent.pushes.length + sent.emails.length).toBeGreaterThan(0);
    expect(listLeads()).toHaveLength(0);
    __flushLeadStore();
    expect(existsSync(join(dir, 'leads.json'))).toBe(false);
    for (const e of sent.emails) expect(e.text).not.toContain('/lead-receipt/');
  });

  it('funnel endpoint and receipt pages 404; dashboard 404 while LEADS_DASHBOARD_TOKEN is unset', async () => {
    expect((await fetch(`${base}/api/funnel/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: [{ type: 'view' }] }) })).status).toBe(404);
    expect((await fetch(`${base}/lead-receipt/lr_${'a'.repeat(43)}`)).status).toBe(404);
    expect((await fetch(`${base}/ops/leads-dashboard`)).status).toBe(404);
    expect((await fetch(`${base}/ops/leads-dashboard.csv`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
  });

  it('old-shape MCP prepare/send (no attribution) still works', async () => {
    const prep = await tool('prepare_dealer_inquiry', { unit_id: unit().id, ...SHOPPER });
    expect(prep.isError).toBe(false);
    const s = await tool('send_dealer_inquiry', { confirmation_token: prep.data.confirmation_token, confirmed: true });
    expect(s.isError).toBe(false);
    expect(listLeads()).toHaveLength(0);
  });
});

describe('canonical lead records', () => {
  it('website inquiry → one lead with source, surface, campaign, unit, dealer, qualification; ntfy still fires', async () => {
    const u = unit();
    const r = await websiteInquiry({
      headers: { 'x-matchrv-surface': 'unit_detail', 'x-matchrv-session-id': 'sess_web_12345678' },
      attribution: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'Spring Sale', referrer: 'https://www.google.com/search?q=pat', landing_page: '/listing/abc?x=1' },
    });
    expect(r.status).toBe(201);
    expect(sent.pushes.length + sent.emails.length).toBeGreaterThan(0);
    const [lead] = listLeads();
    expect(lead).toBeTruthy();
    expect(lead.lead_id).toMatch(/^lead_/);
    expect(lead.source).toBe('website');
    expect(lead.surface).toBe('unit_detail');
    expect(lead.traffic).toBe('human');
    expect(lead.campaign).toMatchObject({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'other', referrer_host: 'www.google.com', landing_page: '/listing/:id' });
    expect(lead.unit.id).toBe(u.id);
    expect(lead.dealer.id).toBe(u.dealer.id);
    expect(lead.unit.price_band).toBe(priceBand(lead.unit.price_usd));
    expect(lead.ids.session_id).toBe('sess_web_12345678');
    expect(lead.qualification).toMatchObject({ has_name: true, has_contact: true, specific_unit: true, exclusivity: true, qualified: true });
    expect(lead.lifecycle.stage === 'sent' || lead.lifecycle.stage === 'delivered').toBe(true);
    expect(lead.contact?.email).toBe('pat.shopper@example.com');
  });

  it('native app headers → native_ios / native_android, even with a non-browser app user agent', async () => {
    await websiteInquiry({ ua: 'MatchRV/1.0 CFNetwork/1494.0.7 Darwin/23.4.0', headers: { 'x-matchrv-client': 'native_ios', 'x-matchrv-platform': 'ios', 'x-matchrv-app-version': '1.0.0', 'x-matchrv-surface': 'swipe', 'x-matchrv-device-id': 'dev_ios_abcdef123' } });
    await websiteInquiry({ unitId: otherDealerUnit().id, ua: 'okhttp/4.12.0', shopper: { email: 'sam@example.com', phone: '(253) 555-0199', name: 'Sam Driver' }, headers: { 'x-matchrv-client': 'android', 'x-matchrv-surface': 'tow' } });
    const leads = listLeads();
    expect(leads.map((l) => l.source).sort()).toEqual(['native_android', 'native_ios']);
    const ios = leads.find((l) => l.source === 'native_ios')!;
    expect(ios).toMatchObject({ surface: 'swipe', client: { platform: 'ios', app_version: '1.0.0' } });
    expect(ios.ids.device_id).toBe('dev_ios_abcdef123');
    expect(leads.find((l) => l.source === 'native_android')!.surface).toBe('tow_fit');
  });

  it('MCP send_dealer_inquiry → chatgpt_app / ask_ai lead; optional attribution arg is accepted and old clients unaffected', async () => {
    const prep = await tool('prepare_dealer_inquiry', { unit_id: unit().id, ...SHOPPER, attribution: { surface: 'compare', utm_source: 'chatgpt' } }, { 'user-agent': 'openai-mcp/1.0.0' });
    expect(prep.isError).toBe(false);
    const s = await tool('send_dealer_inquiry', { confirmation_token: prep.data.confirmation_token, confirmed: true }, { 'user-agent': 'openai-mcp/1.0.0' });
    expect(s.isError).toBe(false);
    const [lead] = listLeads();
    expect(lead.entry_point).toBe('mcp_send_dealer_inquiry');
    expect(lead.source).toBe('chatgpt_app');
    expect(lead.traffic).toBe('ai_agent_user');
    expect(lead.surface).toBe('compare');
    expect(lead.campaign.utm_source).toBe('chatgpt');
  });

  it('a crawler user agent never creates a lead (counted only as an excluded bot)', async () => {
    await websiteInquiry({ ua: GOOGLEBOT });
    expect(listLeads()).toHaveLength(0);
    const report = buildLeadReport({});
    expect(report.totals.leads).toBe(0);
    expect(Object.values(report.botsExcluded).reduce((a: number, b) => a + (b as number), 0)).toBeGreaterThan(0);
  });

  it('dry runs never create leads', async () => {
    const prev = await (await fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': CHROME }, body: JSON.stringify({ unit_id: unit().id, ...SHOPPER }) })).json();
    await fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': CHROME }, body: JSON.stringify({ confirmation_token: prev.confirmationToken, confirmed: true, dry_run: true }) });
    expect(listLeads()).toHaveLength(0);
  });
});

describe('qualification and repeats', () => {
  it('qualify rule: name + contact + specific unit + exclusive, never a test lead', () => {
    const c = { name: 'Pat Shopper', email: 'pat@example.com', phone: null, message: 'hi' };
    expect(qualify({ contact: c, specificUnit: true, exclusive: true, test: false }).qualified).toBe(true);
    expect(qualify({ contact: { ...c, name: 'P' }, specificUnit: true, exclusive: true, test: false }).qualified).toBe(false);
    expect(qualify({ contact: { ...c, email: 'nope', phone: null }, specificUnit: true, exclusive: true, test: false }).has_contact).toBe(false);
    expect(qualify({ contact: c, specificUnit: false, exclusive: true, test: false }).qualified).toBe(false);
    expect(qualify({ contact: c, specificUnit: true, exclusive: false, test: false }).qualified).toBe(false);
    expect(qualify({ contact: c, specificUnit: true, exclusive: true, test: true }).qualified).toBe(false);
  });

  it('same contact + same dealer again inside the window is a repeat of the first lead, counted once', async () => {
    const u = unit();
    const second = getInventory().units.find((x) => x.status === 'available' && x.dealer.id === u.dealer.id && x.id !== u.id);
    await websiteInquiry();
    await websiteInquiry({ unitId: (second ?? u).id, shopper: { email: 'PAT.SHOPPER@example.com' } });
    const leads = listLeads();
    expect(leads).toHaveLength(1);
    if (second) {
      expect(leads[0].repeat_count).toBe(1);
      expect(leads[0].inquiry_ids).toHaveLength(2);
    }
    expect(buildLeadReport({}).totals.leads).toBe(1);
  });

  it('the same shopper sent to a second dealer marks both leads non-exclusive (not qualified)', async () => {
    await websiteInquiry();
    await websiteInquiry({ unitId: otherDealerUnit().id });
    const leads = listLeads();
    expect(leads).toHaveLength(2);
    for (const l of leads) expect(l.qualification).toMatchObject({ exclusivity: false, qualified: false });
  });
});

describe('outcome lifecycle and dealer receipt', () => {
  it('stages are timestamped, response time is computed, lost needs a reason, closed leads stay closed', async () => {
    await websiteInquiry();
    const [lead] = listLeads();
    const t0 = Date.parse(lead.lifecycle.sent_at);
    expect(recordLeadStage(lead.lead_id, 'dealer_responded', { by: 'matchrv_ops', now: t0 + 42 * 60_000 })).toMatchObject({ ok: true });
    expect(listLeads()[0].lifecycle.response_time_minutes).toBe(42);
    expect(recordLeadStage(lead.lead_id, 'appointment', { now: t0 + 3_600_000 })).toMatchObject({ ok: true });
    expect(recordLeadStage(lead.lead_id, 'lost', {})).toMatchObject({ ok: false, code: 'reason_required' });
    expect(recordLeadStage(lead.lead_id, 'sold', { now: t0 + 86_400_000 })).toMatchObject({ ok: true });
    const l = listLeads()[0].lifecycle;
    expect(l.stage).toBe('sold');
    expect(l.appointment_at).toBeTruthy();
    expect(l.sold_at).toBeTruthy();
    expect(recordLeadStage(lead.lead_id, 'lost', { reason: 'price' })).toMatchObject({ ok: false, code: 'already_closed' });
    expect(recordLeadStage('lead_doesnotexist123', 'opened')).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('receipt tokens are 256-bit, stored only as a hash, and go in the dealer email only when LEAD_RECEIPT_LINKS_IN_EMAIL is on', async () => {
    const m = mintReceiptToken();
    expect(m.token).toMatch(RECEIPT_TOKEN_RE);
    expect(buildReceiptUrl(m.token, 'https://matchrv.com')).toBe(`https://matchrv.com/lead-receipt/${m.token}`);
    await websiteInquiry();
    expect(sent.emails.every((e) => !e.text.includes('/lead-receipt/'))).toBe(true);
    __resetLeadStore(); __resetInquiries(); sent.emails.length = 0;
    __setLeadTrackingForTests({ receiptLinks: true });
    const dir = mkdtempSync(join(tmpdir(), 'leads-rcpt-'));
    __setLeadPersistenceForTests(true, join(dir, 'leads.json'));
    await websiteInquiry();
    const email = sent.emails.find((e) => e.text.includes('/lead-receipt/'));
    expect(email).toBeTruthy();
    const token = /\/lead-receipt\/(lr_[A-Za-z0-9_-]{43})/.exec(email!.text)![1];
    __flushLeadStore();
    const file = readFileSync(join(dir, 'leads.json'), 'utf8');
    expect(file).not.toContain(token);
    expect(listLeads()[0].receipt?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('receipt page: opened on human view (not on scanner prefetch), outcome POST with CSRF, bad token 404, rate limited', async () => {
    await websiteInquiry();
    const [lead] = listLeads();
    const issued = issueReceiptToken(lead.lead_id)!;
    const path = new URL(issued.url).pathname;
    // Link scanner first: does not mark opened.
    await fetch(`${base}${path}`, { headers: { 'user-agent': GOOGLEBOT } });
    expect(listLeads()[0].lifecycle.opened_at).toBeNull();
    const page = await fetch(`${base}${path}`, { headers: { 'user-agent': CHROME } });
    expect(page.status).toBe(200);
    expect(page.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(page.headers.get('cache-control')).toBe('no-store');
    const html = await page.text();
    expect(html).toContain('Pat Shopper');
    expect(listLeads()[0].lifecycle.opened_at).toBeTruthy();
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
    const form = (b: Record<string, string>, origin?: string) => fetch(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}) }, body: new URLSearchParams(b).toString(),
    });
    expect((await form({ outcome: 'responded', csrf: 'wrong' })).status).toBe(403);
    expect((await form({ outcome: 'responded', csrf }, 'https://evil.example')).status).toBe(403);
    expect((await form({ outcome: 'lost', csrf })).status).toBe(400); // reason required
    expect((await form({ outcome: 'responded', csrf })).status).toBe(200);
    expect(listLeads()[0].lifecycle).toMatchObject({ stage: 'dealer_responded', outcome_by: 'dealer_receipt' });
    expect(listLeads()[0].lifecycle.response_time_minutes).not.toBeNull();
    expect((await form({ outcome: 'lost', lost_reason: 'bought_elsewhere', csrf })).status).toBe(200);
    expect(listLeads()[0].lifecycle).toMatchObject({ stage: 'lost', lost_reason: 'bought_elsewhere' });
    expect((await fetch(`${base}/lead-receipt/lr_${'b'.repeat(43)}`)).status).toBe(404);
    expect((await fetch(`${base}/lead-receipt/not-a-token`)).status).toBe(404);
    let limited = false;
    for (let i = 0; i < 70 && !limited; i++) limited = (await fetch(`${base}/lead-receipt/lr_${'c'.repeat(43)}`)).status === 429;
    expect(limited).toBe(true);
  });
});

describe('funnel events', () => {
  const postEvents = (body: unknown, ua = CHROME, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/funnel/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua, ...headers }, body: JSON.stringify(body) });

  it('counts human steps by source/surface, excludes bots, rejects bad payloads and "inquiry" from clients', async () => {
    const h = { 'x-matchrv-client': 'ios', 'x-matchrv-session-id': 'sess_app_00000001' };
    expect((await postEvents({ events: [{ type: 'impression', surface: 'swipe', count: 10 }, { type: 'view', surface: 'swipe', unit_id: 'u1234' }, { type: 'favorite', surface: 'swipe', unit_id: 'u1234' }] }, 'MatchRV/1.0 CFNetwork/1494.0.7 Darwin/23.4.0', h)).status).toBe(202);
    expect((await postEvents({ events: [{ type: 'view' }] }, GPTBOT)).status).toBe(202);
    expect((await postEvents({ events: [{ type: 'inquiry' }] })).status).toBe(400);
    expect((await postEvents({ events: [] })).status).toBe(400);
    expect((await postEvents({ events: Array.from({ length: 26 }, () => ({ type: 'view' })) })).status).toBe(400);
    const report = buildLeadReport({});
    const step = (s: string) => report.funnel.find((f: any) => f.step === s)!;
    expect(step('impression').total).toBe(10);
    expect(step('view').total).toBe(1);
    expect(step('favorite').total).toBe(1);
    expect(Object.keys(report.botsExcluded).length).toBeGreaterThan(0);
  });

  it('a lead picks up the server-side journey of its session', async () => {
    const h = { 'x-matchrv-session-id': 'sess_web_journey01' };
    await postEvents({ events: [{ type: 'search', surface: 'grid' }, { type: 'view', surface: 'unit_detail', unit_id: unit().id }, { type: 'favorite', surface: 'unit_detail', unit_id: unit().id }] }, CHROME, h);
    await websiteInquiry({ headers: h });
    const [lead] = listLeads();
    expect(lead.journey.source).toBe('server');
    expect(lead.journey.counts).toMatchObject({ searches: 1, views: 1, favorites: 1 });
    expect(lead.journey.events.map((e) => e.type)).toEqual(['search', 'view', 'favorite']);
    expect(buildLeadReport({}).funnel.find((f: any) => f.step === 'inquiry')!.total).toBe(1);
  });

  it('rate limits per client address', async () => {
    let status = 202;
    for (let i = 0; i < 65 && status !== 429; i++) status = (await postEvents({ events: [{ type: 'view' }] })).status;
    expect(status).toBe(429);
  });
});

describe('no PII in analytics', () => {
  it('lead and funnel events sent to PostHog carry no name, email, phone or message', async () => {
    await fetch(`${base}/api/funnel/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': CHROME }, body: JSON.stringify({ events: [{ type: 'view', unit_id: 'pat.shopper@example.com' }], attribution: { session_id: 'pat.shopper@example.com', utm_source: 'pat.shopper@example.com' } }) });
    await websiteInquiry({ attribution: { utm_campaign: 'pat.shopper@example.com', campaign: 'Pat Shopper' } });
    const [lead] = listLeads();
    recordLeadStage(lead.lead_id, 'dealer_responded');
    await settle();
    const leadEvents = captured.filter((e) => e.event.startsWith('lead_'));
    expect(leadEvents.map((e) => e.event)).toEqual(expect.arrayContaining(['lead_created', 'lead_stage', 'lead_funnel_step']));
    const blob = JSON.stringify(captured);
    for (const pii of ['pat.shopper@example.com', 'Pat Shopper', '555-0142', '5550142', 'Saturday']) expect(blob).not.toContain(pii);
    expect(leadEvents.every((e) => e.properties.$process_person_profile === false)).toBe(true);
  });

  it('attribution values shaped like PII are dropped or collapsed', () => {
    const a = cleanAttributionObject({ session_id: 'a@b.co', device_id: 'Pat Shopper', utm_source: 'x@y.com', referrer: 'https://site.example/path?email=a@b.co' });
    expect(a.session_id).toBeNull();
    expect(a.device_id).toBeNull();
    expect(a.utm_source).toBe('other');
    expect(a.referrer_host).toBe('site.example');
  });

  it('traffic classes follow #109: browsers human, crawlers bot, MCP agents ai_agent_user', () => {
    const e = emptyAttribution();
    expect(classifyTraffic(CHROME, e, 'http').traffic).toBe('human');
    expect(classifyTraffic(GOOGLEBOT, e, 'http').traffic).toBe('bot');
    expect(classifyTraffic(GPTBOT, e, 'mcp').traffic).toBe('bot');
    expect(classifyTraffic('openai-mcp/1.0.0', e, 'mcp').traffic).toBe('ai_agent_user');
    expect(classifyTraffic('curl/8.0', e, 'http').traffic).toBe('bot');
  });
});

describe('owner dashboard', () => {
  it('is 404 when unset or too short, 401 without/with a wrong token, 200 with the right one', async () => {
    expect((await fetch(`${base}/ops/leads-dashboard`)).status).toBe(404);
    process.env.LEADS_DASHBOARD_TOKEN = 'short';
    expect((await fetch(`${base}/ops/leads-dashboard`)).status).toBe(404);
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    expect((await fetch(`${base}/ops/leads-dashboard`)).status).toBe(401);
    expect((await fetch(`${base}/ops/leads-dashboard`, { headers: { authorization: 'Bearer wrong-token-wrong-token-wrong' } })).status).toBe(401);
    expect((await fetch(`${base}/ops/leads-dashboard?token=${TOKEN}`)).status).toBe(401); // never via URL
    await websiteInquiry();
    const ok = await fetch(`${base}/ops/leads-dashboard`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('x-robots-tag')).toMatch(/noindex/);
    const html = await ok.text();
    for (const s of ['Funnel', 'By source', 'By surface', 'By dealer', 'By unit type', 'By price band', 'By region', 'Dealer response time', 'Outcomes', 'Cost / lead']) expect(html).toContain(s);
    expect(html).not.toContain('pat.shopper@example.com');
    expect(html).not.toContain(TOKEN);
  });

  it('form login sets a signed HttpOnly Secure SameSite=Strict cookie; JSON ops routes need Bearer', async () => {
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    const bad = await fetch(`${base}/ops/leads-dashboard/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `token=nope` });
    expect(bad.status).toBe(401);
    const good = await fetch(`${base}/ops/leads-dashboard/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: TOKEN }).toString() });
    expect(good.status).toBe(303);
    const cookie = good.headers.get('set-cookie')!;
    expect(cookie).toMatch(new RegExp(`^${DASHBOARD_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/); expect(cookie).toMatch(/Secure/); expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).not.toContain(TOKEN);
    const value = cookie.split(';')[0];
    expect((await fetch(`${base}/ops/leads-dashboard`, { headers: { cookie: value } })).status).toBe(200);
    expect((await fetch(`${base}/ops/leads-dashboard`, { headers: { cookie: value.slice(0, -2) + 'xx' } })).status).toBe(401);
    expect((await fetch(`${base}/ops/leads-dashboard/api/report`, { headers: { cookie: value } })).status).toBe(401);
    expect((await fetch(`${base}/ops/leads-dashboard/api/report`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
  });

  it('CSV export: no contact details by default, contact columns only on request, formula-safe cells', async () => {
    process.env.LEADS_DASHBOARD_TOKEN = TOKEN;
    await websiteInquiry({ shopper: { name: '=HYPERLINK("x") Pat' } });
    const csv = await fetch(`${base}/ops/leads-dashboard.csv`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/);
    expect(csv.headers.get('content-disposition')).toMatch(/^attachment; filename="matchrv-leads-[A-Za-z0-9._-]+\.csv"$/);
    const text = await csv.text();
    expect(text.split('\n')[0]).toContain('lead_id');
    expect(text).not.toContain('pat.shopper@example.com');
    const withContact = leadsCsv({ includeContact: true });
    expect(withContact).toContain('pat.shopper@example.com');
    expect(withContact).not.toMatch(/(^|,)"?=HYPERLINK/m);
    expect((await fetch(`${base}/ops/leads-dashboard.csv`)).status).toBe(401);
  });
});

describe('durable store and retention', () => {
  it('persists to the lead file and reloads; PII purge clears contact details but keeps the lead', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leads-store-'));
    __setLeadPersistenceForTests(true, join(dir, 'leads.json'));
    await websiteInquiry();
    __flushLeadStore();
    const raw = JSON.parse(__readLeadFileForTests()!);
    expect(raw.schema_version).toBe(1);
    expect(raw.leads).toHaveLength(1);
    __reloadLeadStore();
    const [lead] = listLeads();
    expect(lead.contact?.email).toBe('pat.shopper@example.com');
    expect(purgeLeadPii({ days: 30, now: Date.parse(lead.created_at) + 31 * 86_400_000 })).toBe(1);
    const after = listLeads()[0];
    expect(after.contact).toBeNull();
    expect(after.pii_purged_at).toBeTruthy();
    expect(after.contact_hashes.length).toBeGreaterThan(0);
    expect(purgeLeadPii({ days: null })).toBe(0); // unset = keep
  });
});

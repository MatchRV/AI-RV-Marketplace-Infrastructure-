import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { matchRvMcpHandler } from '../src/mcp';
import { getInventory } from '../src/services/agent-inventory';
import inquiriesRouter from '../src/routes/inquiries';
import {
  __inquiryCount, __resetInquiries, __setRoutes, __setTransport, formatInquiryForwardText, getInquiryStatus, opsGet, prepareInquiry, sendInquiry, validateContact, type InquiryTransport,
} from '../src/services/dealer-inquiries';
import { __resetShopperFit, rememberFit, type ShopperFit } from '../src/services/shopper-fit';

type Sent = { emails: { to: string; subject: string; text: string }[]; pushes: { title: string; body: string }[] };
function mockTransport(opts: { email?: boolean; push?: boolean; failEmail?: boolean } = {}): InquiryTransport & { sent: Sent } {
  const sent: Sent = { emails: [], pushes: [] };
  return {
    sent,
    emailConfigured: () => opts.email ?? true,
    opsPushConfigured: () => opts.push ?? true,
    async sendEmail(m) { if (!(opts.email ?? true) || opts.failEmail) throw new Error('smtp down'); sent.emails.push(m); },
    async notifyOps(m) { if (!(opts.push ?? true)) throw new Error('ntfy_not_configured'); sent.pushes.push(m); },
  };
}

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await matchRvMcpHandler.fetch(new Request('http://localhost/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  const raw = await response.text();
  return JSON.parse(raw.startsWith('event:') || raw.startsWith('data:') ? raw.split('\n').find(l => l.startsWith('data:'))!.slice(5) : raw).result;
}
const tool = async (name: string, args: Record<string, unknown>, meta: Record<string, unknown> = { 'openai/subject': 'v1/inquiry-tester' }) => {
  const r = await rpc('tools/call', { name, arguments: args, _meta: meta });
  return { isError: r.isError === true, data: JSON.parse(r.content.find((c: any) => c.type === 'text').text) };
};

const unit = () => getInventory().units.find((u) => u.dealer.city === 'Fife' && u.status === 'available')!;
const lookupUnit = (id: string) => getInventory().byId.get(id);
const shopper = { name: 'Pat Tester', email: 'pat@example.com', phone: '(253) 555-0142', message: 'Is this still available? Could I see it Saturday?' };
let mock: ReturnType<typeof mockTransport>;

beforeEach(() => { __resetInquiries(); __resetShopperFit(); __setRoutes({}); mock = mockTransport(); __setTransport(mock); });
afterAll(() => __setTransport(null));

describe('validation', () => {
  it('requires a real name, a valid email or phone, and a bounded message', () => {
    expect(validateContact({ name: 'A', email: 'bad', message: '' }).ok).toBe(false);
    expect(validateContact({ name: 'Pat', message: 'hi there' }).ok).toBe(false); // no email or phone
    expect(validateContact({ name: 'Pat', phone: '555', message: 'hi there' }).ok).toBe(false);
    expect(validateContact({ name: 'http://spam', email: 'a@b.co', message: 'hi there' }).ok).toBe(false);
    const ok = validateContact({ name: ' Pat  Tester ', email: 'PAT@Example.com', phone: '253-555-0142', message: 'hello' });
    expect(ok).toMatchObject({ ok: true, contact: { name: 'Pat Tester', email: 'pat@example.com', phone: '+12535550142' } });
  });
});

describe('two-step flow (service)', () => {
  it('prepare returns a full preview and sends/stores nothing', () => {
    const u = unit();
    const p = prepareInquiry(u, shopper);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.preview).toMatchObject({ sendsNothingYet: true, dealer: { name: u.dealer.name, city: 'Fife', state: 'WA' }, shopper: { name: 'Pat Tester', email: 'pat@example.com' } });
    expect(p.preview.unit).toHaveProperty('vin');
    expect(p.preview.unit).toHaveProperty('stockNumber');
    expect(p.preview.delivery.channel).toBe('matchrv_forward');
    expect(mock.sent.emails.length + mock.sent.pushes.length).toBe(0);
    expect(__inquiryCount()).toBe(0);
  });
  it('refuses to send without confirmed=true or with a tampered token', async () => {
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    expect(await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: false, requesterKey: 't', scope: null, lookupUnit })).toMatchObject({ ok: false, code: 'not_confirmed' });
    const [body, sig] = p.confirmationToken.slice(4).split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), m: 'changed' })).toString('base64url');
    expect(await sendInquiry({ confirmationToken: `dic_${forged}.${sig}`, confirmed: true, requesterKey: 't', scope: null, lookupUnit })).toMatchObject({ ok: false, code: 'invalid_token' });
    expect(mock.sent.emails.length + mock.sent.pushes.length).toBe(0);
  });
  it('opted-in dealer → delivered by email to the dealer route only; status visible only with the token', async () => {
    const u = unit();
    __setRoutes({ [u.dealer.id]: 'inquiries@dealer.test' });
    const p = prepareInquiry(u, shopper); if (!p.ok) throw new Error();
    expect(p.preview.delivery.channel).toBe('dealer_email');
    const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit });
    if (!r.ok) throw new Error(r.code);
    expect(r.inquiry.status).toBe('delivered');
    expect(mock.sent.emails.map((e) => e.to)).toEqual(['inquiries@dealer.test']);
    expect(mock.sent.emails[0].text).toContain(shopper.message);
    expect(getInquiryStatus(r.inquiry.inquiryId, r.statusToken)?.status).toBe('delivered');
    expect(getInquiryStatus(r.inquiry.inquiryId, 'ist_wrongtoken_wrongtoken')).toBeNull();
    expect(r.inquiry.dealerReply).toBeNull();
    // Re-using the same confirmation token never sends twice.
    expect(await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit })).toMatchObject({ ok: false });
    expect(mock.sent.emails.length).toBe(1);
  });
  it('no dealer route → queued_for_matchrv; the ntfy alert carries no shopper contact details or message', async () => {
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit });
    if (!r.ok) throw new Error(r.code);
    expect(r.inquiry.status).toBe('queued_for_matchrv');
    expect(r.inquiry.statusDetail).toMatch(/NOT reached the dealership/);
    expect(mock.sent.pushes).toHaveLength(1);
    expect(mock.sent.pushes[0].body).not.toContain('pat@example.com');
    expect(mock.sent.pushes[0].body).not.toContain('555');
    expect(mock.sent.pushes[0].body).not.toContain('Saturday');
    expect(mock.sent.emails.map((e) => e.to)).toEqual(['sales@matchrv.com']);
  });
  it('no channel at all → failed, and says so honestly', async () => {
    __setTransport(mockTransport({ email: false, push: false }));
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit });
    if (!r.ok) throw new Error(r.code);
    expect(r.inquiry.status).toBe('failed');
    expect(r.inquiry.statusDetail).toMatch(/contact the dealership directly/);
  });
  it('dry_run delivers to no one', async () => {
    __setRoutes({ [unit().dealer.id]: 'inquiries@dealer.test' });
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, dryRun: true, requesterKey: 't', scope: null, lookupUnit });
    if (!r.ok) throw new Error(r.code);
    expect(r.inquiry.status).toBe('dry_run');
    expect(mock.sent.emails.length + mock.sent.pushes.length).toBe(0);
  });
  it('rate-limits sends per requester', async () => {
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const p = prepareInquiry(unit(), { ...shopper, email: `p${i}@example.com` }); if (!p.ok) throw new Error();
      const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, dryRun: true, requesterKey: 'same-requester', scope: null, lookupUnit });
      if (!r.ok && r.code === 'rate_limited') limited = true;
    }
    expect(limited).toBe(true);
  });
});


describe('shopper fit', () => {
  const sampleFit: ShopperFit = {
    rvTypes: ['travel_trailer'],
    partySize: 4,
    towVehicle: '2021 Ford F-150 3.5 EcoBoost',
    location: 'Tacoma, WA',
    paymentMethod: 'finance',
    budgetMaxUsd: 40000,
    downPaymentUsd: 5000,
    monthlyPaymentUsd: 450,
  };

  it('stores fit on the inquiry when prepare includes it; PublicInquiry omits fit; ntfy still has no PII or fit', async () => {
    const p = prepareInquiry(unit(), { ...shopper, fit: sampleFit });
    if (!p.ok) throw new Error();
    expect(p.fit).toMatchObject({ budgetMaxUsd: 40000, towVehicle: sampleFit.towVehicle, partySize: 4 });
    const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't-fit', scope: null, lookupUnit });
    if (!r.ok) throw new Error(r.code);
    // Model-facing PublicInquiry must not grow new fields (ChatGPT tool output freeze).
    expect(r.inquiry).not.toHaveProperty('fit');
    const stored = opsGet(r.inquiry.inquiryId)!;
    expect(stored.fit).toMatchObject({ budgetMaxUsd: 40000, towVehicle: sampleFit.towVehicle, partySize: 4 });
    expect(mock.sent.emails[0].text).toContain('Shopper fit');
    expect(mock.sent.emails[0].text).toContain('2021 Ford F-150');
    expect(mock.sent.emails[0].text).toContain('$40,000');
    expect(mock.sent.pushes[0].body).not.toContain('pat@example.com');
    expect(mock.sent.pushes[0].body).not.toContain('F-150');
    expect(mock.sent.pushes[0].body).not.toContain('40000');
    expect(mock.sent.pushes[0].body).not.toContain('Budget');
    const fwd = formatInquiryForwardText(stored);
    expect(fwd).toContain('Shopper fit:');
    expect(fwd).toContain('Tow vehicle: 2021 Ford F-150 3.5 EcoBoost');
    expect(fwd).toContain('Budget max: $40,000');
  });

  it('accepts fitHint on send when the token has no fit (ChatGPT scope path)', async () => {
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    expect(p.fit).toBeUndefined();
    const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, dryRun: true, requesterKey: 't-hint', scope: 'scope-abc', fitHint: sampleFit, lookupUnit });
    if (!r.ok) throw new Error(r.code);
    expect(opsGet(r.inquiry.inquiryId)!.fit).toMatchObject({ partySize: 4, budgetMaxUsd: 40000 });
  });

  it('ignores income/credit-like strings and blank fit; old leads without fit still send', async () => {
    const p = prepareInquiry(unit(), { ...shopper, fit: { towVehicle: 'my credit score is 720 and income is $90k', partySize: 3 } });
    if (!p.ok) throw new Error();
    expect(p.fit?.towVehicle).toBeUndefined();
    expect(p.fit?.partySize).toBe(3);
    const bare = prepareInquiry(unit(), shopper); if (!bare.ok) throw new Error();
    const r = await sendInquiry({ confirmationToken: bare.confirmationToken, confirmed: true, dryRun: true, requesterKey: 't-bare', scope: null, lookupUnit });
    if (!r.ok) throw new Error(r.code);
    expect(opsGet(r.inquiry.inquiryId)!.fit).toBeUndefined();
  });
});

describe('MCP tools', () => {
  it('prepare_dealer_inquiry previews without sending; send_dealer_inquiry (dry_run) returns a status visible through get_dealer_inquiry_status', async () => {
    const u = unit();
    const prep = await tool('prepare_dealer_inquiry', { unit_id: u.id, ...shopper });
    expect(prep.isError).toBe(false);
    expect(prep.data.status).toBe('preview_only_nothing_sent');
    expect(__inquiryCount()).toBe(0);
    const unconfirmed = await tool('send_dealer_inquiry', { confirmation_token: prep.data.confirmation_token, confirmed: false });
    expect(unconfirmed.isError).toBe(true);
    expect(unconfirmed.data.sent).toBe(false);
    const sent = await tool('send_dealer_inquiry', { confirmation_token: prep.data.confirmation_token, confirmed: true, dry_run: true });
    expect(sent.data.status).toBe('dry_run');
    const status = await tool('get_dealer_inquiry_status', { inquiry_id: sent.data.inquiry_id, status_token: sent.data.status_token });
    expect(status.data.inquiry.status).toBe('dry_run');
    const other = await tool('get_dealer_inquiry_status', { inquiry_id: sent.data.inquiry_id, status_token: 'ist_not_this_shoppers_token' }, { 'openai/subject': 'v1/someone-else' });
    expect(other.isError).toBe(true);
    expect(mock.sent.emails.length + mock.sent.pushes.length).toBe(0);
  });
});

describe('HTTP endpoint', () => {
  let base = '';
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/api', inquiriesRouter);
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());
  it('POST previews, POST with token+confirmed records, GET needs the status token; ops routes need the ops key', async () => {
    const post = (b: unknown) => fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const prev = await post({ unit_id: unit().id, ...shopper });
    expect(prev.status).toBe(200);
    const pj = await prev.json();
    expect(pj.preview.sendsNothingYet).toBe(true);
    expect((await post({ unit_id: unit().id, name: 'x', message: '' })).status).toBe(400);
    const sent = await post({ confirmation_token: pj.confirmationToken, confirmed: true, dry_run: true });
    expect(sent.status).toBe(201);
    const sj = await sent.json();
    const ok = await fetch(`${base}/api/inquiries/${sj.inquiry.inquiryId}`, { headers: { 'x-inquiry-token': sj.statusToken } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).inquiry.status).toBe('dry_run');
    expect((await fetch(`${base}/api/inquiries/${sj.inquiry.inquiryId}?token=wrong`)).status).toBe(404);
    expect([401, 503]).toContain((await fetch(`${base}/api/inquiries/ops`)).status);
    expect(mock.sent.emails.length + mock.sent.pushes.length).toBe(0);
  });
});

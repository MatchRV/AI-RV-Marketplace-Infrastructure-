import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { getInventory } from '../src/services/agent-inventory';
import inquiriesRouter from '../src/routes/inquiries';
import opsLeadsPage, { OPS_LEADS_HTML } from '../src/routes/ops-leads-page';
import { __resetInquiries, __setRoutes, __setTransport, type InquiryTransport } from '../src/services/dealer-inquiries';

const OPS_KEY = 'test-ops-key-not-real-0123456789';
const pushes: { title: string; body: string }[] = [];
const transport: InquiryTransport = {
  emailConfigured: () => false,
  opsPushConfigured: () => true,
  async sendEmail() { throw new Error('email_not_configured'); },
  async notifyOps(m) { pushes.push(m); },
};

let base = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;
const prevKey = process.env.INQUIRY_OPS_KEY;
beforeAll(async () => {
  process.env.INQUIRY_OPS_KEY = OPS_KEY;
  const app = express(); app.use(express.json()); app.use(opsLeadsPage); app.use('/api', inquiriesRouter);
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); __setTransport(null); if (prevKey === undefined) delete process.env.INQUIRY_OPS_KEY; else process.env.INQUIRY_OPS_KEY = prevKey; });
beforeEach(() => { __resetInquiries(); __setRoutes({}); __setTransport(transport); pushes.length = 0; });

const unit = () => getInventory().units.find((u) => u.dealer.city === 'Fife' && u.status === 'available')!;
const post = (b: unknown) => fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const ops = (path = '', init: RequestInit = {}, key = OPS_KEY) =>
  fetch(`${base}/api/inquiries/ops${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${key}`, 'content-type': 'application/json' } });
async function send(name: string, dry = false, email = 'shopper@example.com') {
  const prev = await (await post({ unit_id: unit().id, name, email, message: 'Is this still available?' })).json();
  const sent = await post({ confirmation_token: prev.confirmationToken, confirmed: true, dry_run: dry });
  return (await sent.json()).inquiry;
}

describe('/ops/leads page', () => {
  it('is served private: noindex, no-store, no framing, no referrer', async () => {
    const r = await fetch(`${base}/ops/leads`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    expect(r.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
    const html = await r.text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
  });

  it('keeps the key in sessionStorage and the Authorization header only, and never renders data as HTML', () => {
    expect(OPS_LEADS_HTML).toContain('sessionStorage');
    expect(OPS_LEADS_HTML).not.toContain('localStorage');
    expect(OPS_LEADS_HTML).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(OPS_LEADS_HTML).toContain('Authorization: "Bearer " + key');
    expect(OPS_LEADS_HTML).not.toMatch(/[?&](key|token)=/);
    expect(OPS_LEADS_HTML).not.toContain(OPS_KEY);
  });

  it('marks test leads and offers forward text only for real queued leads', () => {
    expect(OPS_LEADS_HTML).toContain('TEST · do not forward');
    expect(OPS_LEADS_HTML).toContain('Forward to dealer');
    expect(OPS_LEADS_HTML).toMatch(/!test && i\.status === "queued_for_matchrv"/);
  });
});

describe('ops inbox API used by the page', () => {
  it('needs the key; lists newest first with full contact, unit and dealer', async () => {
    const first = await send('Pat Shopper');
    await new Promise((r) => setTimeout(r, 5));
    const second = await send('Lee Shopper', false, 'lee@example.com');
    expect(first.status).toBe('queued_for_matchrv');
    expect(pushes[0].body).not.toContain('shopper@example.com');
    expect((await fetch(`${base}/api/inquiries/ops`)).status).toBe(401);
    expect((await ops('', {}, 'wrong-key-wrong-key-wrong-key-00')).status).toBe(401);
    const list = (await (await ops()).json()).inquiries;
    expect(list.map((i: any) => i.id)).toEqual([second.inquiryId, first.inquiryId]);
    expect(list[0].preview.shopper).toMatchObject({ name: 'Lee Shopper', email: 'lee@example.com' });
    expect(list[0].preview.dealer.name).toBe(unit().dealer.name);
    expect(list[0].preview.unit.id).toBe(unit().id);
  });

  it('ops can flag a lead as a test without changing its status', async () => {
    const i = await send('MatchRV TEST - journey');
    const r = await ops(`/${i.inquiryId}`, { method: 'POST', body: JSON.stringify({ test: true }) });
    expect(r.status).toBe(200);
    const j = (await r.json()).inquiry;
    expect(j.test).toBe(true);
    expect(j.status).toBe('queued_for_matchrv');
  });
});

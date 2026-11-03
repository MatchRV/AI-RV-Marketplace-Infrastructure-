import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { getInventory } from '../src/services/agent-inventory';
import inquiriesRouter from '../src/routes/inquiries';
import { OPS_LEADS_HTML } from '../src/routes/ops-leads-page';
import { __resetInquiries, __setRoutes, __setTransport, cleanPaymentEstimate, paymentEstimateLines, prepareInquiry, sendInquiry, type InquiryTransport } from '../src/services/dealer-inquiries';

const OPS_KEY = 'test-ops-key-not-real-0123456789';
const emails: { to: string; text: string }[] = [];
const transport: InquiryTransport = {
  emailConfigured: () => true, opsPushConfigured: () => true,
  async sendEmail(m) { emails.push(m); }, async notifyOps() {},
};
const unit = () => getInventory().units.find((u) => u.dealer.city === 'Fife' && u.status === 'available')!;
const lookupUnit = (id: string) => getInventory().byId.get(id);
const shopper = { name: 'Pat Tester', email: 'pat@example.com', message: 'Is this still available?' };
const pe = { priceUsd: 39999, downUsd: 5000, tradeUsd: 8000, aprPct: 7.5, termMonths: 180, taxPct: 9.1, estMonthlyUsd: 294.12, creditRange: 'good_680_719' };

let base = ''; let server: ReturnType<ReturnType<typeof express>['listen']>;
const prevKey = process.env.INQUIRY_OPS_KEY;
beforeAll(async () => {
  process.env.INQUIRY_OPS_KEY = OPS_KEY;
  const app = express(); app.use(express.json()); app.use('/api', inquiriesRouter);
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); __setTransport(null); if (prevKey === undefined) delete process.env.INQUIRY_OPS_KEY; else process.env.INQUIRY_OPS_KEY = prevKey; });
beforeEach(() => { __resetInquiries(); __setRoutes({}); __setTransport(transport); emails.length = 0; });

describe('cleanPaymentEstimate', () => {
  it('keeps valid numbers and the self-reported credit range, with an estimate-only note', () => {
    const c = cleanPaymentEstimate(pe)!;
    expect(c).toMatchObject({ ...pe, creditRange: 'good_680_719' });
    expect(c.note).toMatch(/not a financing offer, rate quote or credit check/);
  });
  it('drops out-of-range or junk values (never guesses) and unknown credit labels', () => {
    const c = cleanPaymentEstimate({ priceUsd: -5, downUsd: 'lots', aprPct: 99, termMonths: 72.4, taxPct: 50, creditRange: 'superb', estMonthlyUsd: 100 })!;
    expect(c).toMatchObject({ priceUsd: null, downUsd: null, aprPct: null, termMonths: 72, taxPct: null, creditRange: null, estMonthlyUsd: 100 });
  });
  it('accepts 0% APR and zero down; null when nothing usable was sent', () => {
    expect(cleanPaymentEstimate({ aprPct: 0, downUsd: 0 })).toMatchObject({ aprPct: 0, downUsd: 0 });
    expect(cleanPaymentEstimate({})).toBeNull();
    expect(cleanPaymentEstimate(null)).toBeNull();
    expect(cleanPaymentEstimate('x')).toBeNull();
    expect(cleanPaymentEstimate({ creditRange: 'bogus' })).toBeNull();
  });
  it('dealer email lines label everything as the shopper\'s estimate, with no APR tied to credit', () => {
    const t = paymentEstimateLines(cleanPaymentEstimate(pe)).join('\n');
    expect(t).toMatch(/their own estimate, not a financing offer or credit check/);
    expect(t).toContain('Good (680-719)');
    expect(t).toContain('APR entered: 7.5%');
    expect(paymentEstimateLines(null)).toEqual([]);
  });
});

describe('payment numbers through the inquiry flow', () => {
  it('without payment_estimate the preview and email carry no payment section', async () => {
    __setRoutes({ [unit().dealer.id]: 'inquiries@dealer.test' });
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    expect(p.preview.paymentEstimate ?? null).toBeNull();
    const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit });
    if (!r.ok) throw new Error(r.code);
    expect(emails[0].text).not.toMatch(/Payment numbers|Credit/);
  });
  it('shared numbers survive the signed token into the email', async () => {
    __setRoutes({ [unit().dealer.id]: 'inquiries@dealer.test' });
    const p = prepareInquiry(unit(), { ...shopper, paymentEstimate: pe }); if (!p.ok) throw new Error();
    expect(p.preview.paymentEstimate).toMatchObject({ aprPct: 7.5, creditRange: 'good_680_719' });
    const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit });
    if (!r.ok) throw new Error(r.code);
    expect(emails[0].text).toContain('Estimated monthly payment: $294.12');
    expect(emails[0].text).toContain("Credit (shopper's estimate, no credit check): Good (680-719)");
  });
  it('POST /api/inquiries payment_estimate (dry run) → ops inbox shows it; the page renders it', async () => {
    const post = (b: unknown) => fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const prev = await (await post({ unit_id: unit().id, ...shopper, payment_estimate: pe })).json();
    expect(prev.preview.paymentEstimate.creditRange).toBe('good_680_719');
    const sent = await (await post({ confirmation_token: prev.confirmationToken, confirmed: true, dry_run: true })).json();
    expect(sent.inquiry.status).toBe('dry_run');
    expect(emails).toHaveLength(0);
    const list = (await (await fetch(`${base}/api/inquiries/ops`, { headers: { authorization: `Bearer ${OPS_KEY}` } })).json()).inquiries;
    expect(list[0].preview.paymentEstimate).toMatchObject({ downUsd: 5000, termMonths: 180, creditRange: 'good_680_719' });
    expect(OPS_LEADS_HTML).toContain("Payment (shopper's estimate)");
    expect(OPS_LEADS_HTML).toContain('Credit (self-reported)');
    expect(OPS_LEADS_HTML).toContain('Rebuilding (below 620)');
  });
});

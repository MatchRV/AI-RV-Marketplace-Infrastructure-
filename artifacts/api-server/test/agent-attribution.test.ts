import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchRvMcpHandler } from '../src/mcp';
import { apiPathAllowedWithoutDatabase } from '../src/app';
import attributionRouter from '../src/routes/attribution';
import inquiriesRouter from '../src/routes/inquiries';
import { OPS_LEADS_HTML } from '../src/routes/ops-leads-page';
import { getScreenedInventory } from '../src/services/screened-inventory';
import { backupPath, readJsonWithBackup, writeFileAtomic } from '../src/services/atomic-file';
import {
  __reloadAgentClients, __resetAgentClients, __setAgentClientPersistenceForTests, checkAgentKey, createAgentClient, listAgentClients, revokeAgentClient,
} from '../src/services/agent-clients';
import {
  __attributionSnapshot, __flushAttribution, __reloadAttribution, __resetAttribution, __setAttributionPersistenceForTests, ANONYMOUS_CONTEXT,
  attributionRows, purgeAttribution, recordAttributionEvent, type AttributionContext,
} from '../src/services/attribution';
import { buildAttributionReport } from '../src/services/attribution-report';
import {
  __exportInquiries, __importInquiries, __inquiryCount, __resetInquiries, __setRoutes, __setSigningSecretFileForTests, __setTransport,
  getInquiryStatus, opsList, prepareInquiry, sendInquiry, signingSecretSource, type InquiryTransport,
} from '../src/services/dealer-inquiries';
import { __resetDataDirFreezeForTests, freezeDataDir } from '../src/services/data-dir-freeze';
import { configureProductAnalyticsForTests, flushProductAnalytics, resetProductAnalyticsForTests } from '../src/services/product-analytics';
import { __resetStorageMonitorForTests, runStorageCheck, storageStatus } from '../src/services/storage-monitor';

const posix = process.platform !== 'win32';
const dir = mkdtempSync(join(tmpdir(), 'matchrv-attr-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Sent = { emails: { to: string; subject: string; text: string }[]; pushes: { title: string; body: string }[] };
function mockTransport(delayMs = 0): InquiryTransport & { sent: Sent } {
  const sent: Sent = { emails: [], pushes: [] };
  const wait = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());
  return {
    sent,
    emailConfigured: () => true,
    opsPushConfigured: () => true,
    async sendEmail(m) { await wait(); sent.emails.push(m); },
    async notifyOps(m) { sent.pushes.push(m); },
  };
}

async function mcp(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const response = await matchRvMcpHandler.fetch(new Request('http://localhost/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  const raw = await response.text();
  let message: any = null;
  try { message = JSON.parse(raw.startsWith('event:') || raw.startsWith('data:') ? raw.split('\n').find((l) => l.startsWith('data:'))!.slice(5) : raw); } catch { /* not json */ }
  return { status: response.status, headers: response.headers, message, raw };
}
async function tool(name: string, args: Record<string, unknown>, opts: { key?: string; meta?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
  const r = await mcp('tools/call', { name, arguments: args, ...(opts.meta ? { _meta: opts.meta } : {}) }, { ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}), ...(opts.headers ?? {}) });
  const result = r.message?.result;
  const text = result?.content?.find((c: any) => c.type === 'text')?.text;
  return { http: r.status, headers: r.headers, isError: result?.isError === true, data: text ? JSON.parse(text) : null };
}
/** Attribution is counted after the response is returned. */
const settle = () => new Promise((r) => setTimeout(r, 40));

const unit = () => getScreenedInventory().units.find((u) => u.status === 'available' && u.dealer.id)!;
const lookupUnit = (id: string) => getScreenedInventory().byId.get(id);
const shopper = { name: 'Pat Tester', email: 'pat.tester@example.com', phone: '(253) 555-0142', message: 'Is this one still available? Private note 7781.' };
const partner = (name: string, extra: { scopes?: string[]; limits?: Record<string, number> } = {}) => {
  const made = createAgentClient({ name, scopes: extra.scopes ?? ['read', 'inquiry'], limits: extra.limits });
  if (!made.ok) throw new Error(made.code);
  return made;
};
const ctxFor = (made: { client: { id: string; name: string; scopes: any; limits: any } }): AttributionContext => ({
  surface: 'mcp', tier: 'verified_partner', clientId: made.client.id, clientName: made.client.name, hostLabel: null, sessionHash: null,
  scopes: made.client.scopes, limits: made.client.limits, rejectedKey: false,
});

let mock: ReturnType<typeof mockTransport>;
beforeEach(() => {
  __resetDataDirFreezeForTests();
  __setAgentClientPersistenceForTests(false); __resetAgentClients();
  __setAttributionPersistenceForTests(false); __resetAttribution();
  __setSigningSecretFileForTests(false);
  __resetInquiries(); __setRoutes({});
  mock = mockTransport(); __setTransport(mock);
});
afterAll(() => { __setTransport(null); __resetDataDirFreezeForTests(); });

describe('atomic private files', () => {
  it('writes whole files, keeps a backup, and leaves no temp files behind under concurrent writers', async () => {
    const file = join(dir, 'concurrent.json');
    const payloads = Array.from({ length: 60 }, (_, i) => JSON.stringify({ writer: i, pad: 'x'.repeat(2000 + i) }));
    await Promise.all(payloads.map((body, i) => new Promise<void>((done) => setTimeout(() => { writeFileAtomic(file, body, { backup: true }); done(); }, i % 3))));
    const final = readFileSync(file, 'utf8');
    expect(payloads).toContain(final);
    expect(payloads).toContain(readFileSync(backupPath(file), 'utf8'));
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    if (posix) {
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(statSync(backupPath(file)).mode & 0o777).toBe(0o600);
    }
  });

  it('falls back to the backup when the main file is torn', () => {
    const file = join(dir, 'torn.json');
    writeFileAtomic(file, JSON.stringify({ v: 1 }), { backup: true });
    writeFileAtomic(file, JSON.stringify({ v: 2 }), { backup: true });
    writeFileSync(file, '{"v": 3, "trunc');
    const isObj = (x: unknown): x is { v: number } => Boolean(x) && typeof (x as any).v === 'number';
    expect(readJsonWithBackup(file, isObj)).toEqual({ value: { v: 1 }, source: 'backup' });
  });
});

describe('agent key registry', () => {
  it('shows a key once, stores only its hash, and survives a reload', () => {
    const file = join(dir, 'clients-a.json');
    __setAgentClientPersistenceForTests(true, file); __resetAgentClients();
    const made = partner('Acme Trip Planner');
    expect(made.key).toMatch(/^mrv_[a-f0-9]{12}_[A-Za-z0-9_-]{40,}$/);
    expect(made.client).not.toHaveProperty('keyHash');
    const onDisk = readFileSync(file, 'utf8');
    expect(onDisk).not.toContain(made.key);
    expect(onDisk).not.toContain(made.key.slice(17));
    if (posix) expect(statSync(file).mode & 0o777).toBe(0o600);
    __reloadAgentClients();
    expect(checkAgentKey(made.key)).toMatchObject({ status: 'ok', client: { id: made.client.id, name: 'Acme Trip Planner' } });
    expect(JSON.stringify(listAgentClients())).not.toContain('keyHash');
  });

  it('rejects malformed, unknown and tampered keys', () => {
    const made = partner('Key Shapes');
    expect(checkAgentKey('')).toEqual({ status: 'none' });
    expect(checkAgentKey('sk-not-ours')).toMatchObject({ status: 'invalid', reason: 'malformed' });
    expect(checkAgentKey(`mrv_${'0'.repeat(12)}_${'a'.repeat(43)}`)).toMatchObject({ status: 'invalid', reason: 'unknown' });
    const tampered = made.key.slice(0, -1) + (made.key.endsWith('A') ? 'B' : 'A');
    expect(checkAgentKey(tampered)).toMatchObject({ status: 'invalid', reason: 'unknown' });
    expect(createAgentClient({ name: 'Key Shapes' })).toEqual({ ok: false, code: 'name_taken' });
    expect(createAgentClient({ name: 'x' })).toEqual({ ok: false, code: 'invalid_name' });
    expect(createAgentClient({ name: 'Bad Scope', scopes: ['admin'] })).toEqual({ ok: false, code: 'invalid_scopes' });
  });

  it('revocation takes effect immediately and persists', () => {
    const file = join(dir, 'clients-b.json');
    __setAgentClientPersistenceForTests(true, file); __resetAgentClients();
    const made = partner('Soon Revoked');
    expect(checkAgentKey(made.key).status).toBe('ok');
    expect(revokeAgentClient(made.client.id)).toMatchObject({ status: 'revoked' });
    expect(checkAgentKey(made.key)).toMatchObject({ status: 'invalid', reason: 'revoked' });
    __reloadAgentClients();
    expect(checkAgentKey(made.key)).toMatchObject({ status: 'invalid', reason: 'revoked' });
    expect(revokeAgentClient('agc_000000000000')).toBeNull();
  });

  it('restores the registry from its backup when the file is corrupt', () => {
    const file = join(dir, 'clients-c.json');
    __setAgentClientPersistenceForTests(true, file); __resetAgentClients();
    const first = partner('First Partner');
    partner('Second Partner');
    writeFileSync(file, 'not json');
    __reloadAgentClients();
    expect(checkAgentKey(first.key).status).toBe('ok');
    expect(storageStatus().warnings.map((w) => w.code)).toContain('clients_restored_from_backup');
  });

  it('refuses to issue or revoke keys while the data directory is frozen', async () => {
    const made = partner('Frozen Partner');
    await freezeDataDir();
    expect(() => createAgentClient({ name: 'During Freeze' })).toThrow();
    expect(() => revokeAgentClient(made.client.id)).toThrow();
  });
});

describe('/mcp stays public and unchanged', () => {
  it('serves the same contract with no key, a valid key and a rejected key', async () => {
    const made = partner('Contract Check');
    const bare = await mcp('tools/list');
    const keyed = await mcp('tools/list', {}, { Authorization: `Bearer ${made.key}` });
    const rejected = await mcp('tools/list', {}, { Authorization: `Bearer mrv_${'0'.repeat(12)}_${'b'.repeat(43)}` });
    const foreign = await mcp('tools/list', {}, { Authorization: 'Bearer some-oauth-token' });
    for (const r of [bare, keyed, rejected, foreign]) expect(r.status).toBe(200);
    expect(bare.message.result.tools).toHaveLength(11);
    expect(keyed.raw).toBe(bare.raw);
    expect(rejected.raw).toBe(bare.raw);
    expect(foreign.raw).toBe(bare.raw);
    expect(rejected.headers.get('x-matchrv-key-status')).toBe('rejected');
    expect(bare.headers.get('x-matchrv-key-status')).toBeNull();
    expect(foreign.headers.get('x-matchrv-key-status')).toBeNull();
    const init = await mcp('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    const initKeyed = await mcp('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } }, { Authorization: `Bearer ${made.key}` });
    expect(initKeyed.raw).toBe(init.raw);
  });

  it('answers tool calls identically with and without a key', async () => {
    const made = partner('Same Answers');
    const u = unit();
    const bare = await tool('get_rv', { unit_id: u.id });
    const keyed = await tool('get_rv', { unit_id: u.id }, { key: made.key });
    expect(bare.http).toBe(200);
    expect(keyed.data).toEqual(bare.data);
    expect(JSON.stringify(keyed.data)).not.toContain(made.client.id);
  });
});

describe('attribution tiers', () => {
  it('counts keyed, host-labelled and anonymous traffic separately', async () => {
    const made = partner('Tier Partner');
    const u = unit();
    await tool('get_rv', { unit_id: u.id }, { key: made.key });
    await tool('get_rv', { unit_id: u.id }, { key: made.key });
    await tool('get_rv', { unit_id: u.id }, { meta: { 'openai/subject': 'v1/some-chatgpt-user' } });
    await tool('get_rv', { unit_id: u.id });
    // A caller who claims to be ChatGPT AND sends a bad key is still not verified.
    await tool('get_rv', { unit_id: u.id }, { key: `mrv_${'0'.repeat(12)}_${'c'.repeat(43)}`, meta: { 'openai/subject': 'v1/forged' } });
    await settle();
    const today = new Date().toISOString().slice(0, 10);
    const rows = attributionRows(today, today).filter((r) => r.event === 'detail_view');
    const pick = (tier: string) => rows.filter((r) => r.tier === tier);
    expect(pick('verified_partner')).toEqual([{ day: today, tier: 'verified_partner', client: made.client.id, dealer: u.dealer.id, event: 'detail_view', count: 2 }]);
    expect(pick('unverified_host')).toEqual([{ day: today, tier: 'unverified_host', client: 'chatgpt_app', dealer: u.dealer.id, event: 'detail_view', count: 2 }]);
    expect(pick('anonymous')).toEqual([{ day: today, tier: 'anonymous', client: '-', dealer: u.dealer.id, event: 'detail_view', count: 1 }]);
  });

  it('counts a served search and one impression per unit shown; a gated search counts nothing', async () => {
    const made = partner('Search Partner');
    const gated = await tool('search_rvs', { rv_types: ['travel_trailer'] }, { key: made.key });
    expect(gated.data.results).toEqual([]);
    const shown = await tool('search_rvs', { rv_types: ['travel_trailer'], shopper_requested_results_now: true, shopper_words: 'just show me', limit: 5 }, { key: made.key });
    expect(shown.data.status).toBe('shortlist');
    expect(shown.data.results.length).toBeGreaterThan(0);
    await settle();
    const today = new Date().toISOString().slice(0, 10);
    const rows = attributionRows(today, today).filter((r) => r.client === made.client.id);
    expect(rows.filter((r) => r.event === 'search').reduce((n, r) => n + r.count, 0)).toBe(1);
    expect(rows.filter((r) => r.event === 'impression').reduce((n, r) => n + r.count, 0)).toBe(shown.data.results.length);
    expect(rows.filter((r) => r.event === 'impression').every((r) => r.dealer !== '-')).toBe(true);
  });

  it('a revoked key stops being attributed but the public endpoint still answers', async () => {
    const made = partner('Revoked Mid Flight');
    const u = unit();
    await tool('get_rv', { unit_id: u.id }, { key: made.key });
    revokeAgentClient(made.client.id);
    const after = await tool('get_rv', { unit_id: u.id }, { key: made.key });
    expect(after.http).toBe(200);
    expect(after.headers.get('x-matchrv-key-status')).toBe('rejected');
    await settle();
    const today = new Date().toISOString().slice(0, 10);
    const rows = attributionRows(today, today).filter((r) => r.event === 'detail_view');
    expect(rows.find((r) => r.client === made.client.id)?.count).toBe(1);
    expect(rows.find((r) => r.tier === 'anonymous')?.count).toBe(1);
  });
});

describe('confirmation tokens are bound to the client that prepared them', () => {
  const prepareVia = async (key?: string) => {
    const r = await tool('prepare_dealer_inquiry', { unit_id: unit().id, ...shopper }, { key });
    expect(r.isError).toBe(false);
    return r.data.confirmation_token as string;
  };
  const sendVia = (token: string, key?: string) => tool('send_dealer_inquiry', { confirmation_token: token, confirmed: true }, { key });

  it('another key, no key, or the website cannot send a partner preview', async () => {
    const a = partner('Partner A'); const b = partner('Partner B');
    const token = await prepareVia(a.key);
    for (const attempt of [await sendVia(token, b.key), await sendVia(token)]) {
      expect(attempt.isError).toBe(true);
      expect(attempt.data).toMatchObject({ error: 'client_mismatch', sent: false });
      expect(JSON.stringify(attempt.data)).not.toContain(shopper.email);
    }
    const web = await sendInquiry({ confirmationToken: token, confirmed: true, requesterKey: 'ip:web', scope: null, lookupUnit, attribution: { ...ANONYMOUS_CONTEXT, surface: 'website' } });
    expect(web).toMatchObject({ ok: false, code: 'client_mismatch' });
    expect(__inquiryCount()).toBe(0);
    expect(mock.sent.emails).toHaveLength(0);
    expect(mock.sent.pushes).toHaveLength(0);
    const ok = await sendVia(token, a.key);
    expect(ok.isError).toBe(false);
    expect(opsList()[0].attribution).toMatchObject({ tier: 'verified_partner', clientId: a.client.id, clientName: 'Partner A', billingGrade: true, surface: 'mcp' });
  });

  it('a preview prepared without a key cannot be claimed by a partner', async () => {
    const a = partner('Claim Jumper');
    const token = await prepareVia();
    const claimed = await sendVia(token, a.key);
    expect(claimed.data).toMatchObject({ error: 'client_mismatch', sent: false });
    expect(__inquiryCount()).toBe(0);
    const ok = await sendVia(token);
    expect(ok.isError).toBe(false);
    expect(opsList()[0].attribution).toMatchObject({ tier: 'anonymous', clientId: null, billingGrade: false });
  });

  it('a wrong-identity replay cannot read back an inquiry that was already sent', async () => {
    const a = partner('Owner'); const b = partner('Snooper');
    const token = await prepareVia(a.key);
    expect((await sendVia(token, a.key)).isError).toBe(false);
    const peek = await sendVia(token, b.key);
    expect(peek.data).toMatchObject({ error: 'client_mismatch' });
    expect(JSON.stringify(peek.data)).not.toContain('inq_');
  });

  it('a revoked key cannot send the preview it prepared', async () => {
    const a = partner('Revoked Sender');
    const token = await prepareVia(a.key);
    revokeAgentClient(a.client.id);
    expect((await sendVia(token, a.key)).data).toMatchObject({ error: 'client_mismatch', sent: false });
    expect(__inquiryCount()).toBe(0);
  });

  it('a key without the inquiry scope cannot send', async () => {
    const reader = partner('Read Only', { scopes: ['read'] });
    const token = await prepareVia(reader.key);
    expect((await sendVia(token, reader.key)).data).toMatchObject({ error: 'client_not_permitted', sent: false });
    expect(__inquiryCount()).toBe(0);
  });

  it('host metadata is recorded as an unverified label, never as a partner', async () => {
    const meta = { 'openai/subject': 'v1/chatgpt-shopper' };
    const prep = await tool('prepare_dealer_inquiry', { unit_id: unit().id, ...shopper }, { meta });
    const sent = await tool('send_dealer_inquiry', { confirmation_token: prep.data.confirmation_token, confirmed: true }, { meta });
    expect(sent.isError).toBe(false);
    expect(opsList()[0].attribution).toMatchObject({ tier: 'unverified_host', hostLabel: 'chatgpt_app', clientId: null, billingGrade: false });
    expect(JSON.stringify(sent.data)).not.toContain('attribution');
    expect(JSON.stringify(sent.data)).not.toContain('billingGrade');
  });
});

describe('sends are idempotent', () => {
  it('a replayed token returns the same inquiry and status token and delivers once', async () => {
    const u = unit();
    __setRoutes({ [u.dealer.id]: 'leads@dealer.test' });
    const p = prepareInquiry(u, shopper); if (!p.ok) throw new Error();
    const args = { confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit };
    const first = await sendInquiry(args); if (!first.ok) throw new Error(first.code);
    const again = await sendInquiry(args); if (!again.ok) throw new Error(again.code);
    expect(again.inquiry.inquiryId).toBe(first.inquiry.inquiryId);
    expect(again.statusToken).toBe(first.statusToken);
    expect(again).toMatchObject({ duplicate: false, replayed: true });
    expect(getInquiryStatus(first.inquiry.inquiryId, again.statusToken)?.status).toBe('delivered');
    expect(mock.sent.emails).toHaveLength(1);
    expect(__inquiryCount()).toBe(1);
  });

  it('concurrent sends of one token deliver once', async () => {
    const u = unit();
    __setRoutes({ [u.dealer.id]: 'leads@dealer.test' });
    mock = mockTransport(30); __setTransport(mock);
    const p = prepareInquiry(u, shopper); if (!p.ok) throw new Error();
    const args = { confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit };
    const results = await Promise.all(Array.from({ length: 6 }, () => sendInquiry(args)));
    const ids = new Set(results.map((r) => (r.ok ? r.inquiry.inquiryId : r.code)));
    const tokens = new Set(results.map((r) => (r.ok ? r.statusToken : '')));
    expect(ids.size).toBe(1);
    expect(tokens.size).toBe(1);
    expect(results.filter((r) => r.ok && !r.replayed)).toHaveLength(1);
    expect(mock.sent.emails).toHaveLength(1);
    expect(__inquiryCount()).toBe(1);
  });

  it('a replay over MCP reads like the first answer', async () => {
    const prep = await tool('prepare_dealer_inquiry', { unit_id: unit().id, ...shopper });
    const one = await tool('send_dealer_inquiry', { confirmation_token: prep.data.confirmation_token, confirmed: true });
    const two = await tool('send_dealer_inquiry', { confirmation_token: prep.data.confirmation_token, confirmed: true });
    expect(two.isError).toBe(false);
    expect(two.data.inquiry_id).toBe(one.data.inquiry_id);
    expect(two.data.status_token).toBe(one.data.status_token);
    expect(mock.sent.pushes).toHaveLength(1);
  });

  it('a lead stored before derived status tokens replays as a duplicate without a token', async () => {
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    const args = { confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit };
    const first = await sendInquiry(args); if (!first.ok) throw new Error();
    const rows = __exportInquiries();
    rows[0].statusTokenHash = 'f'.repeat(64);
    __importInquiries(rows);
    const again = await sendInquiry(args); if (!again.ok) throw new Error();
    expect(again).toMatchObject({ duplicate: true, replayed: true });
    expect(again.statusToken).not.toMatch(/^ist_/);
    expect(again.inquiry.inquiryId).toBe(first.inquiry.inquiryId);
  });
});

describe('rate limits', () => {
  it('a key over its per-minute request budget gets 429; unkeyed traffic is unaffected', async () => {
    const made = partner('Chatty', { limits: { requestsPerMinute: 3 } });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await mcp('tools/list', {}, { Authorization: `Bearer ${made.key}` })).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    const limited = await mcp('tools/list', {}, { Authorization: `Bearer ${made.key}` });
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(limited.raw).not.toContain(made.key);
    expect((await mcp('tools/list')).status).toBe(200);
    const other = partner('Quiet');
    expect((await mcp('tools/list', {}, { Authorization: `Bearer ${other.key}` })).status).toBe(200);
  });

  it('a partner spends its own hourly send budget and cannot exhaust the shared one', async () => {
    const made = partner('Two An Hour', { limits: { inquiriesPerHour: 2 } });
    const ctx = ctxFor(made);
    const send = async (i: number, attribution?: AttributionContext) => {
      const p = prepareInquiry(unit(), { ...shopper, email: `p${i}@example.com` }, undefined, { clientId: attribution ? made.client.id : null });
      if (!p.ok) throw new Error();
      return sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, dryRun: true, requesterKey: `ip:${i}`, scope: null, lookupUnit, attribution });
    };
    expect((await send(1, ctx)).ok).toBe(true);
    expect((await send(2, ctx)).ok).toBe(true);
    expect(await send(3, ctx)).toMatchObject({ ok: false, code: 'rate_limited' });
    // The shared hourly bucket allows 300; the partner's two sends did not draw on it.
    for (let i = 10; i < 310; i += 1) expect((await send(i)).ok).toBe(true);
    expect(await send(999)).toMatchObject({ ok: false, code: 'rate_limited' });
  });
});

describe('retention', () => {
  it('drops counter days older than the window and keeps the rest', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
    recordAttributionEvent(null, 'search', null, 1, ago(120));
    recordAttributionEvent(null, 'search', null, 1, ago(91));
    recordAttributionEvent(null, 'search', null, 1, ago(89));
    recordAttributionEvent(null, 'search', null, 1, now);
    purgeAttribution(now);
    expect(attributionRows('2000-01-01', '2100-01-01').map((r) => r.day).sort()).toEqual([ago(89).toISOString().slice(0, 10), '2026-11-15']);
  });

  it('applies the window when loading from disk and honours ATTRIBUTION_RETENTION_DAYS', () => {
    const file = join(dir, 'attr-retention.json');
    __setAttributionPersistenceForTests(true, file); __resetAttribution();
    const old = new Date(Date.now() - 40 * 86_400_000);
    recordAttributionEvent(null, 'search', null, 3, old);
    recordAttributionEvent(null, 'search', null, 2, new Date());
    __flushAttribution();
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).days)).toHaveLength(2);
    process.env.ATTRIBUTION_RETENTION_DAYS = '30';
    try {
      __reloadAttribution();
      expect(attributionRows('2000-01-01', '2100-01-01')).toHaveLength(1);
      __flushAttribution();
      expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).days)).toHaveLength(1);
    } finally {
      delete process.env.ATTRIBUTION_RETENTION_DAYS;
    }
  });
});

describe('attribution persistence', () => {
  it('keeps exact totals across concurrent requests, a flush and a reload', async () => {
    const file = join(dir, 'attr-concurrent.json');
    __setAttributionPersistenceForTests(true, file); __resetAttribution();
    const made = partner('Parallel');
    const u = unit();
    await Promise.all(Array.from({ length: 40 }, (_, i) => tool('get_rv', { unit_id: u.id }, i % 2 ? { key: made.key } : {})));
    await settle();
    await Promise.all(Array.from({ length: 10 }, async () => { __flushAttribution(); }));
    __reloadAttribution();
    const today = new Date().toISOString().slice(0, 10);
    const rows = attributionRows(today, today).filter((r) => r.event === 'detail_view');
    expect(rows.find((r) => r.client === made.client.id)?.count).toBe(20);
    expect(rows.find((r) => r.tier === 'anonymous')?.count).toBe(20);
    if (posix) expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir).filter((n) => n.startsWith('attr-concurrent') && n.endsWith('.tmp'))).toEqual([]);
  });

  it('recovers from a corrupt counter file using the backup', () => {
    const file = join(dir, 'attr-corrupt.json');
    __setAttributionPersistenceForTests(true, file); __resetAttribution();
    recordAttributionEvent(null, 'search', null, 5);
    __flushAttribution();
    __reloadAttribution();
    recordAttributionEvent(null, 'search', null, 1);
    __flushAttribution();
    expect(existsSync(backupPath(file))).toBe(true);
    writeFileSync(file, '{"version":1,"days":{"2026-');
    __reloadAttribution();
    expect(attributionRows('2000-01-01', '2100-01-01').reduce((n, r) => n + r.count, 0)).toBe(5);
    expect(storageStatus().warnings.map((w) => w.code)).toContain('attribution_restored_from_backup');
  });

  it('holds counters in memory while the data directory is frozen', async () => {
    const file = join(dir, 'attr-frozen.json');
    __setAttributionPersistenceForTests(true, file); __resetAttribution();
    await freezeDataDir();
    recordAttributionEvent(null, 'search', null, 4);
    expect(existsSync(file)).toBe(false);
    expect(attributionRows('2000-01-01', '2100-01-01')[0].count).toBe(4);
  });
});

describe('reporting accuracy', () => {
  it('reports exact activity and leads per tier, client and dealer', async () => {
    const a = partner('Report A'); const b = partner('Report B');
    const u = unit();
    const other = getScreenedInventory().units.find((x) => x.status === 'available' && x.dealer.id !== u.dealer.id)!;
    __setRoutes({ [u.dealer.id]: 'leads@dealer.test' });
    for (let i = 0; i < 3; i += 1) await tool('get_rv', { unit_id: u.id }, { key: a.key, headers: { 'x-matchrv-session': 'session-0001' } });
    await tool('get_rv', { unit_id: other.id }, { key: a.key });
    await tool('get_rv', { unit_id: u.id }, { key: b.key });
    await tool('get_rv', { unit_id: u.id }, { meta: { 'openai/subject': 'v1/x' } });
    await tool('get_rv', { unit_id: u.id });
    await settle();

    const lead = async (unitId: string, email: string, opts: { key?: string; meta?: Record<string, unknown>; headers?: Record<string, string>; name?: string } = {}) => {
      const prep = await tool('prepare_dealer_inquiry', { unit_id: unitId, ...shopper, email, ...(opts.name ? { name: opts.name } : {}) }, opts);
      const sent = await tool('send_dealer_inquiry', { confirmation_token: prep.data.confirmation_token, confirmed: true }, opts);
      expect(sent.isError).toBe(false);
      return sent.data;
    };
    await lead(u.id, 'a1@example.com', { key: a.key, headers: { 'x-matchrv-session': 'session-0001' } }); // delivered
    await lead(other.id, 'a2@example.com', { key: a.key }); // queued
    await lead(u.id, 'b1@example.com', { key: b.key }); // delivered
    await lead(u.id, 'c1@example.com', { meta: { 'openai/subject': 'v1/x' } }); // delivered, unverified
    await lead(u.id, 'd1@example.com'); // delivered, anonymous
    await lead(u.id, 't1@example.com', { key: a.key, name: 'TEST Shopper' }); // test lead: excluded
    await settle();

    const report = buildAttributionReport();
    expect(report.verifiedPartners.billingGrade).toBe(true);
    expect(report.unverified.billingGrade).toBe(false);
    const ra = report.verifiedPartners.clients.find((c) => c.clientId === a.client.id)!;
    const rb = report.verifiedPartners.clients.find((c) => c.clientId === b.client.id)!;
    expect(report.verifiedPartners.clients).toHaveLength(2);
    expect(ra).toMatchObject({ name: 'Report A', status: 'active' });
    expect(ra.events.detail_view).toBe(4);
    expect(ra.events.inquiry_preview).toBe(3);
    expect(ra.leads).toEqual({ total: 2, delivered: 1, queued_for_matchrv: 1, forwarded: 0, failed: 0, reachedDealer: 1 });
    expect(ra.dealers.find((d) => d.dealerId === u.dealer.id)).toMatchObject({ dealerName: u.dealer.name, events: { detail_view: 3, inquiry_preview: 2 }, leads: { total: 1, delivered: 1 } });
    expect(ra.dealers.find((d) => d.dealerId === other.dealer.id)).toMatchObject({ events: { detail_view: 1, inquiry_preview: 1 }, leads: { total: 1, queued_for_matchrv: 1 } });
    expect(rb.events.detail_view).toBe(1);
    expect(rb.leads).toMatchObject({ total: 1, delivered: 1 });
    const src = (s: string) => report.unverified.sources.find((x) => x.source === s)!;
    expect(src('host:chatgpt_app').events.detail_view).toBe(1);
    expect(src('host:chatgpt_app').leads.total).toBe(1);
    expect(src('anonymous:mcp').events.detail_view).toBe(1);
    expect(src('anonymous:mcp').leads.total).toBe(1);
    // Every real lead is counted exactly once across the whole report.
    const partnerLeads = report.verifiedPartners.clients.reduce((n, c) => n + c.leads.total, 0);
    const otherLeads = report.unverified.sources.reduce((n, s) => n + s.leads.total, 0);
    expect(partnerLeads + otherLeads).toBe(5);
    // First touch from the session trail is stamped on the lead.
    const stamped = opsList().find((i) => i.preview.shopper.email === 'a1@example.com')!;
    expect(stamped.attribution?.firstTouchAt).toMatch(/^\d{4}-/);
    expect(stamped.attribution?.touches).toBeGreaterThanOrEqual(3);

    // Filters.
    const byDealer = buildAttributionReport({ dealerId: other.dealer.id });
    expect(byDealer.verifiedPartners.clients).toHaveLength(1);
    expect(byDealer.verifiedPartners.clients[0].leads.total).toBe(1);
    expect(byDealer.verifiedPartners.clients[0].events.detail_view).toBe(1);
    const byClient = buildAttributionReport({ clientId: b.client.id });
    expect(byClient.verifiedPartners.clients.map((c) => c.clientId)).toEqual([b.client.id]);
    expect(byClient.unverified.sources).toEqual([]);
    const past = buildAttributionReport({ from: '2020-01-01', to: '2020-01-31' });
    expect(past.verifiedPartners.clients).toEqual([]);
    // The report carries ids and counts only.
    const text = JSON.stringify(report);
    for (const secret of ['a1@example.com', 'Pat Tester', 'Private note', a.key, 'dic_', 'ist_']) expect(text).not.toContain(secret);
  });

  it('never counts a lead as billing-grade on a flag alone', async () => {
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit, attribution: ANONYMOUS_CONTEXT });
    const rows = __exportInquiries();
    rows[0].attribution = { ...rows[0].attribution!, billingGrade: true, tier: 'unverified_host', hostLabel: 'chatgpt_app', clientId: null };
    __importInquiries(rows);
    const report = buildAttributionReport();
    expect(report.verifiedPartners.clients).toEqual([]);
    expect(report.unverified.sources.find((s) => s.source === 'host:chatgpt_app')?.leads.total).toBe(1);
  });

  it('leads stored before attribution are reported as unrecorded, not guessed', async () => {
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: 't', scope: null, lookupUnit });
    const report = buildAttributionReport();
    expect(report.unverified.sources.map((s) => s.source)).toEqual(['unrecorded']);
  });
});

describe('nothing private reaches analytics, logs or attribution files', () => {
  afterEach(() => { resetProductAnalyticsForTests(); vi.restoreAllMocks(); });

  it('keeps shopper details, API keys and tokens out of every analytics surface', async () => {
    const file = join(dir, 'attr-privacy.json');
    const clientsFile = join(dir, 'clients-privacy.json');
    __setAttributionPersistenceForTests(true, file); __resetAttribution();
    __setAgentClientPersistenceForTests(true, clientsFile); __resetAgentClients();
    const batches: string[] = [];
    configureProductAnalyticsForTests({ apiKey: 'phc_test', transport: { async sendBatch(body) { batches.push(body); return { ok: true }; } } });
    const logged: string[] = [];
    for (const level of ['log', 'warn', 'error', 'info'] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

    const made = partner('Privacy Partner'); const rival = partner('Privacy Rival');
    const u = unit();
    const opts = { key: made.key, headers: { 'x-matchrv-session': 'conversation-raw-id-42' } };
    await tool('search_rvs', { query: 'trailer for pat.tester@example.com', rv_types: ['travel_trailer'], shopper_requested_results_now: true, shopper_words: 'just show me' }, opts);
    await tool('get_rv', { unit_id: u.id }, opts);
    const prep = await tool('prepare_dealer_inquiry', { unit_id: u.id, ...shopper }, opts);
    const token: string = prep.data.confirmation_token;
    await tool('send_dealer_inquiry', { confirmation_token: token, confirmed: true }, { key: rival.key });
    const sent = await tool('send_dealer_inquiry', { confirmation_token: token, confirmed: true }, opts);
    await tool('send_dealer_inquiry', { confirmation_token: token, confirmed: true }, opts);
    await mcp('tools/list', {}, { Authorization: `Bearer mrv_${'0'.repeat(12)}_${'d'.repeat(43)}` });
    await settle();
    await flushProductAnalytics();
    __flushAttribution();
    await runStorageCheck();

    expect(batches.length).toBeGreaterThan(0);
    const surfaces = {
      posthog: batches.join('\n'),
      console: logged.join('\n'),
      attributionFile: readFileSync(file, 'utf8'),
      attributionMemory: __attributionSnapshot(),
      clientsFile: readFileSync(clientsFile, 'utf8'),
      report: JSON.stringify(buildAttributionReport()),
      storage: JSON.stringify(storageStatus()),
    };
    const forbidden = [
      shopper.email, 'pat.tester', 'Pat Tester', '5550142', '555-0142', 'Private note 7781',
      made.key, made.key.slice(17), rival.key.slice(17), 'd'.repeat(43),
      token, token.slice(4, 40), sent.data.status_token, 'conversation-raw-id-42',
    ];
    for (const [name, text] of Object.entries(surfaces)) {
      for (const secret of forbidden) expect(text.includes(secret), `${name} leaked ${secret.slice(0, 12)}…`).toBe(false);
    }
    // The cross-client attempt is visible to monitoring as a count, with no content.
    const today = new Date().toISOString().slice(0, 10);
    expect(attributionRows(today, today).find((r) => r.event === 'inquiry_client_mismatch')).toMatchObject({ client: rival.client.id, count: 1 });
  });
});

describe('inquiry signing secret', () => {
  const prev = process.env.INQUIRY_SIGNING_SECRET;
  afterEach(() => { if (prev === undefined) delete process.env.INQUIRY_SIGNING_SECRET; else process.env.INQUIRY_SIGNING_SECRET = prev; __setSigningSecretFileForTests(false); });

  it('is generated once in the data directory and reused after a restart', async () => {
    delete process.env.INQUIRY_SIGNING_SECRET;
    const file = join(dir, 'inquiry-signing-secret');
    __setSigningSecretFileForTests(true, file);
    expect(signingSecretSource()).toBe('data_dir');
    const stored = readFileSync(file, 'utf8');
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
    if (posix) expect(statSync(file).mode & 0o777).toBe(0o600);
    const p = prepareInquiry(unit(), shopper); if (!p.ok) throw new Error();
    __setSigningSecretFileForTests(true, file); // a new process: the cached secret is gone
    expect(readFileSync(file, 'utf8')).toBe(stored);
    const sent = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, dryRun: true, requesterKey: 't', scope: null, lookupUnit });
    expect(sent.ok).toBe(true);
  });

  it('an explicit INQUIRY_SIGNING_SECRET wins and no file is written', () => {
    process.env.INQUIRY_SIGNING_SECRET = 'explicit-secret-for-this-test-only';
    const file = join(dir, 'unused-signing-secret');
    __setSigningSecretFileForTests(true, file);
    expect(signingSecretSource()).toBe('env');
    expect(existsSync(file)).toBe(false);
  });

  it('falls back to a per-process secret when the data directory is frozen, and says so', async () => {
    delete process.env.INQUIRY_SIGNING_SECRET;
    const file = join(dir, 'frozen-signing-secret');
    await freezeDataDir();
    __setSigningSecretFileForTests(true, file);
    expect(signingSecretSource()).toBe('ephemeral');
    expect(existsSync(file)).toBe(false);
    expect(storageStatus().warnings.map((w) => w.code)).toContain('signing_secret_ephemeral');
  });
});

describe('ops API and monitoring', () => {
  const OPS_KEY = 'test-ops-key-not-real-0123456789';
  const prevKey = process.env.INQUIRY_OPS_KEY;
  let base = '';
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  beforeAll(async () => {
    process.env.INQUIRY_OPS_KEY = OPS_KEY;
    const app = express(); app.use(express.json()); app.use('/api', attributionRouter); app.use('/api', inquiriesRouter);
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); if (prevKey === undefined) delete process.env.INQUIRY_OPS_KEY; else process.env.INQUIRY_OPS_KEY = prevKey; });
  const ops = (path: string, init: RequestInit = {}, key: string | null = OPS_KEY) =>
    fetch(`${base}/api/attribution/ops${path}`, { ...init, headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) } });

  it('every route needs the ops key and is never cached', async () => {
    for (const path of ['/report', '/clients', '/storage']) {
      expect((await ops(path, {}, null)).status).toBe(401);
      expect((await ops(path, {}, 'wrong-key')).status).toBe(401);
      const ok = await ops(path);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('cache-control')).toBe('no-store');
    }
    expect((await ops('/clients', { method: 'POST', body: JSON.stringify({ name: 'No Auth' }) }, null)).status).toBe(401);
    // An agent API key is not an ops key.
    const made = partner('Not Ops');
    expect((await ops('/report', {}, made.key)).status).toBe(401);
  });

  it('issues a key once, lists clients without secrets, and revokes', async () => {
    const created = await ops('/clients', { method: 'POST', body: JSON.stringify({ name: 'HTTP Partner', scopes: ['read', 'inquiry'], limits: { requestsPerMinute: 10 } }) });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.key).toMatch(/^mrv_/);
    expect(body.client).toMatchObject({ name: 'HTTP Partner', status: 'active', limits: { requestsPerMinute: 10, inquiriesPerHour: 30 } });
    expect((await ops('/clients', { method: 'POST', body: JSON.stringify({ name: 'HTTP Partner' }) })).status).toBe(409);
    expect((await ops('/clients', { method: 'POST', body: JSON.stringify({ name: '' }) })).status).toBe(400);
    const listed = await (await ops('/clients')).text();
    expect(listed).toContain(body.client.id);
    expect(listed).not.toContain(body.key);
    expect(listed).not.toContain('keyHash');
    expect(checkAgentKey(body.key).status).toBe('ok');
    const revoked = await ops(`/clients/${body.client.id}/revoke`, { method: 'POST' });
    expect((await revoked.json()).client.status).toBe('revoked');
    expect(checkAgentKey(body.key).status).toBe('invalid');
    expect((await ops('/clients/agc_ffffffffffff/revoke', { method: 'POST' })).status).toBe(404);
  });

  it('refuses key changes with 503 while the data directory is frozen', async () => {
    await freezeDataDir();
    const res = await ops('/clients', { method: 'POST', body: JSON.stringify({ name: 'Frozen HTTP' }) });
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('website inquiries are stamped as website and cannot redeem a partner preview', async () => {
    const made = partner('Web Mix');
    const post = (b: unknown) => fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const prev = await (await post({ unit_id: unit().id, ...shopper })).json();
    expect((await post({ confirmation_token: prev.confirmationToken, confirmed: true })).status).toBe(201);
    expect(opsList()[0].attribution).toMatchObject({ surface: 'website', tier: 'anonymous', billingGrade: false });
    const bound = prepareInquiry(unit(), { ...shopper, email: 'other@example.com' }, undefined, { clientId: made.client.id });
    if (!bound.ok) throw new Error();
    const refused = await post({ confirmation_token: bound.confirmationToken, confirmed: true });
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toBe('client_mismatch');
  });

  it('storage status reports files, backups, the secret source and warnings without contents', async () => {
    const file = join(dir, 'attr-status.json'); const clientsFile = join(dir, 'clients-status.json');
    __setAttributionPersistenceForTests(true, file); __resetAttribution();
    __setAgentClientPersistenceForTests(true, clientsFile); __resetAgentClients();
    const made = partner('Status Partner');
    recordAttributionEvent(null, 'search', null, 1);
    __flushAttribution();
    const status = await (await ops('/storage')).json();
    expect(status.files.map((f: any) => f.file).sort()).toEqual(['attr-status.json', 'clients-status.json']);
    expect(status.files.every((f: any) => f.exists && f.bytes > 0)).toBe(true);
    if (posix) expect(status.files.every((f: any) => f.mode === '600')).toBe(true);
    expect(status.agentClients).toMatchObject({ count: 1, active: 1 });
    expect(status.signingSecret.source).toBe('ephemeral');
    expect(JSON.stringify(status)).not.toContain(made.key);
    expect(JSON.stringify(status)).not.toContain(dir);
  });

  it('alerts ops once about a critical storage problem, with no private content', async () => {
    const clientsFile = join(dir, 'clients-alert.json');
    __setAgentClientPersistenceForTests(true, clientsFile); __resetAgentClients(); __resetStorageMonitorForTests();
    const made = partner('Alert Partner'); partner('Alert Partner Two');
    writeFileSync(clientsFile, 'garbage');
    __reloadAgentClients();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await runStorageCheck();
    await runStorageCheck();
    vi.restoreAllMocks();
    const alerts = mock.sent.pushes.filter((p) => p.title.includes('storage'));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toContain('clients_restored_from_backup');
    expect(alerts[0].body).not.toContain(made.key);
  });

  it('is reachable on the database-free production deployment', () => {
    expect(apiPathAllowedWithoutDatabase('GET', '/attribution/ops/report')).toBe(true);
    expect(apiPathAllowedWithoutDatabase('POST', '/attribution/ops/clients')).toBe(true);
  });

  it('the lead inbox labels the source and marks unverified labels as not billable', () => {
    expect(OPS_LEADS_HTML).toContain('Came through');
    expect(OPS_LEADS_HTML).toContain('unverified label, not billable');
    expect(OPS_LEADS_HTML).toContain('API key, verified');
  });
});

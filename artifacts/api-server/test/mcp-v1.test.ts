import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import app from '../src/app';
import { matchRvMcpHandler } from '../src/mcp';
import { __resetV1Quota, matchRvMcpV1Handler, MCP_V1_VERSION, publicUnit, V1_DEPTH_MAX } from '../src/mcp-v1';
import { getInventory } from '../src/services/agent-inventory';
import { getScreenedInventory } from '../src/services/screened-inventory';
import { __resetAgentClients, __setAgentClientPersistenceForTests, createAgentClient, revokeAgentClient } from '../src/services/agent-clients';
import { __resetAttribution, __setAttributionPersistenceForTests, attributionRows } from '../src/services/attribution';
import { buildAttributionReport } from '../src/services/attribution-report';
import { __inquiryCount, __resetInquiries, __setRoutes, __setTransport, opsList, type InquiryTransport } from '../src/services/dealer-inquiries';
import { __resetDataDirFreezeForTests } from '../src/services/data-dir-freeze';

const sent = { emails: 0, pushes: 0 };
const transport: InquiryTransport = {
  emailConfigured: () => true,
  opsPushConfigured: () => true,
  async sendEmail() { sent.emails += 1; },
  async notifyOps() { sent.pushes += 1; },
};

type Handler = { fetch: (r: Request) => Promise<Response> };
async function call(handler: Handler, path: string, method: string, params: Record<string, unknown>, key?: string, extra: Record<string, string> = {}) {
  const response = await handler.fetch(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...extra },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  const raw = await response.text();
  let message: any = null;
  try { message = JSON.parse(raw.startsWith('event:') || raw.startsWith('data:') ? raw.split('\n').find((l) => l.startsWith('data:'))!.slice(5) : raw); } catch { /* not json */ }
  return { status: response.status, headers: response.headers, message, raw };
}
const v1 = (method: string, params: Record<string, unknown> = {}, key?: string) => call(matchRvMcpV1Handler as Handler, '/mcp/v1', method, params, key);
async function tool(name: string, args: Record<string, unknown>, key?: string, handler: 'v1' | 'consumer' = 'v1') {
  const r = handler === 'v1'
    ? await v1('tools/call', { name, arguments: args }, key)
    : await call(matchRvMcpHandler as Handler, '/mcp', 'tools/call', { name, arguments: args }, key);
  const result = r.message?.result;
  const text = result?.content?.find((c: any) => c.type === 'text')?.text;
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* a schema rejection is plain text */ }
  return { http: r.status, isError: result?.isError === true, rpcError: r.message?.error ?? null, data, text: text ?? '' };
}
const settle = () => new Promise((r) => setTimeout(r, 40));
const partner = (name: string, extra: { scopes?: string[]; limits?: Record<string, number> } = {}) => {
  const made = createAgentClient({ name, scopes: extra.scopes ?? ['read', 'inquiry'], limits: extra.limits });
  if (!made.ok) throw new Error(made.code);
  return made;
};
const shopper = { name: 'Pat Tester', email: 'pat.tester@example.com', message: 'Is this one still available?' };
/** A collection service by name, or any of the stored fields that say how a record was obtained. */
const SOURCE_WORDS = /marketcheck|harvestMethod|sourceKind|lastSeenBasis|inventory_scraper|"provenance"/i;

const prevFlag = process.env.AGENT_V1_ENABLED;
beforeEach(() => {
  process.env.AGENT_V1_ENABLED = '1';
  __resetDataDirFreezeForTests();
  __setAgentClientPersistenceForTests(false); __resetAgentClients();
  __setAttributionPersistenceForTests(false); __resetAttribution();
  __resetV1Quota();
  __resetInquiries(); __setRoutes({}); __setTransport(transport);
  sent.emails = 0; sent.pushes = 0;
});
afterAll(() => { __setTransport(null); if (prevFlag === undefined) delete process.env.AGENT_V1_ENABLED; else process.env.AGENT_V1_ENABLED = prevFlag; });

describe('access', () => {
  it('answers 404 to everyone until AGENT_V1_ENABLED is set', async () => {
    const made = partner('Flag Off');
    delete process.env.AGENT_V1_ENABLED;
    for (const key of [undefined, made.key]) {
      const r = await v1('tools/list', {}, key);
      expect(r.status).toBe(404);
      expect(r.raw).not.toContain('search_inventory');
    }
    process.env.AGENT_V1_ENABLED = '0';
    expect((await v1('tools/list', {}, made.key)).status).toBe(404);
  });

  it('requires a valid key: none, foreign, unknown and revoked keys get 401 and learn nothing', async () => {
    const made = partner('Soon Gone');
    const attempts: (string | undefined)[] = [undefined, 'some-oauth-token', `mrv_${'0'.repeat(12)}_${'a'.repeat(43)}`];
    for (const key of attempts) {
      for (const method of ['initialize', 'tools/list', 'tools/call']) {
        const r = await v1(method, method === 'tools/call' ? { name: 'search_inventory', arguments: {} } : {}, key);
        expect(r.status).toBe(401);
        expect(r.headers.get('www-authenticate')).toContain('Bearer');
        expect(r.headers.get('cache-control')).toBe('no-store');
        expect(r.raw).not.toMatch(/search_inventory|unit_id|results/);
      }
    }
    expect((await v1('tools/list', {}, made.key)).status).toBe(200);
    revokeAgentClient(made.client.id);
    expect((await v1('tools/list', {}, made.key)).status).toBe(401);
    // ChatGPT-style metadata is not a credential.
    const forged = await call(matchRvMcpV1Handler as Handler, '/mcp/v1', 'tools/list', { _meta: { 'openai/subject': 'v1/someone' } }, undefined, { 'user-agent': 'openai-mcp/1.0' });
    expect(forged.status).toBe(401);
  });

  it('a key without the read scope gets 403', async () => {
    const made = partner('Inquiry Only', { scopes: ['inquiry'] });
    expect((await v1('tools/list', {}, made.key)).status).toBe(403);
  });

  it('a key over its per-minute budget gets 429', async () => {
    const made = partner('Chatty V1', { limits: { requestsPerMinute: 2 } });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await v1('tools/list', {}, made.key)).status);
    expect(statuses).toEqual([200, 200, 429, 429]);
  });
});

describe('contract', () => {
  it('is a separate, neutral server with seven tools and no interview', async () => {
    const made = partner('Contract V1');
    const init = (await v1('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } }, made.key)).message.result;
    expect(init.serverInfo).toMatchObject({ name: 'matchrv-inventory', version: MCP_V1_VERSION });
    expect(init.instructions).not.toMatch(/road to the sale|outfitter|golden ticket|covered_steps|swipe|needs_discovery|chatgpt/i);
    expect(init.instructions).toMatch(/never tell a shopper a combination is safe/i);
    expect(init.instructions).toMatch(/not live stock/i);
    expect(init.instructions).toMatch(/only a request to the dealer/i);
    const tools = (await v1('tools/list', {}, made.key)).message.result.tools;
    expect(tools.map((t: any) => t.name).sort()).toEqual(['compare_units', 'evaluate_tow_fit', 'get_inquiry_status', 'get_unit', 'prepare_inquiry', 'search_inventory', 'send_inquiry']);
    const text = JSON.stringify(tools);
    expect(text).not.toMatch(/covered_steps|shopper_requested_results_now|session_key|outfitter|openai/i);
    expect(tools.find((t: any) => t.name === 'send_inquiry').annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    for (const name of ['search_inventory', 'get_unit', 'compare_units', 'evaluate_tow_fit', 'get_inquiry_status']) {
      expect(tools.find((t: any) => t.name === name).annotations.readOnlyHint).toBe(true);
    }
  });

  it('turning v1 on or off does not change what /mcp serves', async () => {
    const consumer = (m: string, p: Record<string, unknown> = {}) => call(matchRvMcpHandler as Handler, '/mcp', m, p);
    const init = { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } };
    const on = [await consumer('initialize', init), await consumer('tools/list'), await consumer('resources/list')];
    delete process.env.AGENT_V1_ENABLED;
    const off = [await consumer('initialize', init), await consumer('tools/list'), await consumer('resources/list')];
    for (let i = 0; i < on.length; i += 1) {
      expect(on[i].status).toBe(200);
      expect(on[i].raw).toBe(off[i].raw);
    }
    expect(on[1].message.result.tools).toHaveLength(11);
    expect(on[1].raw).not.toContain('search_inventory');
  });
});

describe('search_inventory', () => {
  it('returns units on the first call, with totals and paging', async () => {
    const made = partner('Searcher');
    const first = await tool('search_inventory', { rv_types: ['travel_trailer'] }, made.key);
    expect(first.isError).toBe(false);
    expect(first.data.results).toHaveLength(10);
    expect(first.data.status).toBeUndefined();
    expect(first.data.totals.matched).toBeGreaterThan(10);
    expect(first.data.totals.searched).toBe(getScreenedInventory().units.length);
    expect(first.data.paging).toEqual({ offset: 0, returned: 10, next_offset: 10, depth_limit: V1_DEPTH_MAX });
    expect(first.data.area).toEqual({ scope: 'nationwide' });
    expect(first.text).not.toMatch(SOURCE_WORDS);
    for (const row of first.data.results) {
      expect(row.rv_type).toBe('travel_trailer');
      expect(typeof row.unit_id).toBe('string');
      expect(row.matchrv_url).toMatch(/^https:\/\/matchrv\.com\/listing\//);
      expect(row.dealer_id).toBeTruthy();
      expect(row.availability).toHaveProperty('last_seen_at');
      expect(getScreenedInventory().byId.has(row.unit_id)).toBe(true);
    }
    const second = await tool('search_inventory', { rv_types: ['travel_trailer'], offset: 10, limit: 25 }, made.key);
    expect(second.data.results).toHaveLength(25);
    const ids = new Set(first.data.results.map((r: any) => r.unit_id));
    expect(second.data.results.some((r: any) => ids.has(r.unit_id))).toBe(false);
    expect(second.data.usage.used_today).toBe(35);
  });

  it('applies every filter as given and never widens the area', async () => {
    const made = partner('Strict Filters');
    const r = await tool('search_inventory', { rv_types: ['class_a'], condition: 'used', price_max_usd: 120000, location: 'Tampa, FL', radius_miles: 100, verified_only: true, limit: 25 }, made.key);
    expect(r.isError).toBe(false);
    expect(r.data.area).toMatchObject({ scope: 'radius', radius_miles: 100 });
    expect(r.data.totals.unconfirmed).toBe(0);
    for (const row of r.data.results) {
      const unit = getScreenedInventory().byId.get(row.unit_id)!;
      expect(unit.rvType).toBe('class_a');
      expect(unit.condition).toBe('used');
      expect(unit.priceUsd.value).toBeLessThanOrEqual(120000);
      expect(row.distanceMi).toBeLessThanOrEqual(100);
      expect(row.verified).toBe(true);
    }
    const state = await tool('search_inventory', { rv_types: ['fifth_wheel'], location: 'Texas', limit: 25 }, made.key);
    expect(state.data.area.scope).toBe('state');
    for (const row of state.data.results) expect(row.dealerState).toBe('TX');
  });

  it('caps paging depth and page size, and explains an unknown place', async () => {
    const made = partner('Deep Pager');
    const last = await tool('search_inventory', { rv_types: ['travel_trailer'], offset: V1_DEPTH_MAX - 25, limit: 25 }, made.key);
    expect(last.isError).toBe(false);
    expect(last.data.paging.next_offset).toBeNull();
    const tooDeep = await tool('search_inventory', { rv_types: ['travel_trailer'], offset: V1_DEPTH_MAX - 10, limit: 25 }, made.key);
    expect(tooDeep.data).toMatchObject({ error: 'paging_limit' });
    for (const bad of [{ limit: 26 }, { offset: V1_DEPTH_MAX + 1 }, { limit: 0 }]) {
      const r = await tool('search_inventory', bad, made.key);
      expect(r.isError || r.rpcError !== null).toBe(true);
      expect(r.data?.results).toBeUndefined();
    }
    const nowhere = await tool('search_inventory', { location: 'Zzyzzxville, QQ' }, made.key);
    expect(nowhere.data.error).toBe('search_failed');
  });
});

describe('unit records', () => {
  it('get_unit serves specs, listing dates and availability, and nothing about how the record was obtained', async () => {
    const made = partner('Reader');
    const unit = getScreenedInventory().units.find((u) => u.status === 'available' && u.provenance.listingUrl)!;
    const r = await tool('get_unit', { unit_id: unit.id }, made.key);
    expect(r.isError).toBe(false);
    expect(r.data.unit.id).toBe(unit.id);
    expect(r.data.unit.provenance).toBeUndefined();
    expect(r.data.unit.listing).toMatchObject({ dealer_listing_url: unit.provenance.listingUrl, last_seen_at: unit.provenance.lastSeenAt, first_seen_at: unit.provenance.firstSeenAt });
    expect(r.data.unit.priceUsd).toEqual(unit.priceUsd);
    expect(r.data.availability).toMatchObject({ status: 'available', last_seen_at: unit.provenance.lastSeenAt });
    expect(r.data.availability.note).toMatch(/not a live stock check/);
    expect(r.text).not.toMatch(SOURCE_WORDS);
  });

  it('no served shape names a collection source, across the whole screened inventory', () => {
    const units = getScreenedInventory().units;
    let storedWithSourceWords = 0;
    let reworded = 0;
    for (const unit of units) {
      if (SOURCE_WORDS.test(JSON.stringify(unit))) storedWithSourceWords += 1;
      const text = JSON.stringify(publicUnit(unit));
      if (SOURCE_WORDS.test(text)) throw new Error(`unit ${unit.id.slice(0, 12)} exposes a source word`);
      if (text.includes("the dealer's listing")) reworded += 1;
    }
    // The check means something only if the stored records do carry what is being removed.
    expect(storedWithSourceWords).toBe(units.length);
    expect(reworded).toBeGreaterThan(1000);
    // A reworded note keeps its meaning and the value it describes.
    const noted = units.find((u) => /marketcheck/i.test(u.sleeps.note ?? '') && u.sleeps.value != null)!;
    const served = publicUnit(noted) as any;
    expect(served.sleeps.value).toBe(noted.sleeps.value);
    expect(served.sleeps.source).toBe(noted.sleeps.source);
    expect(served.sleeps.note).toMatch(/dealer's listing/);
  });

  it('does not serve units MatchRV is holding back', async () => {
    const made = partner('Held Back');
    const screened = getScreenedInventory();
    const held = getInventory().units.find((u) => !screened.byId.has(u.id));
    expect(held).toBeDefined();
    expect((await tool('get_unit', { unit_id: held!.id }, made.key)).data).toMatchObject({ error: 'unit_not_found' });
    expect((await tool('prepare_inquiry', { unit_id: held!.id, ...shopper }, made.key)).data).toMatchObject({ error: 'unit_not_found' });
    expect((await tool('evaluate_tow_fit', { unit_ids: [held!.id], vehicle: 'Ford F-150' }, made.key)).data).toMatchObject({ error: 'unit_not_found' });
  });

  it('compare_units and evaluate_tow_fit answer without source words and never say safe', async () => {
    const made = partner('Comparer');
    const trailers = getScreenedInventory().units.filter((u) => u.rvType === 'travel_trailer' && u.gvwrLbs.value).slice(0, 3);
    const cmp = await tool('compare_units', { unit_ids: trailers.map((u) => u.id) }, made.key);
    expect(cmp.isError).toBe(false);
    expect(cmp.data.units).toHaveLength(3);
    expect(cmp.text).not.toMatch(SOURCE_WORDS);
    const tow = await tool('evaluate_tow_fit', { unit_ids: trailers.map((u) => u.id), vehicle: '2022 Ford F-150 3.5L EcoBoost', truck_payload_lbs: 1800, passengers_lbs: 350 }, made.key);
    expect(tow.isError).toBe(false);
    expect(tow.data.fits).toHaveLength(3);
    expect(tow.data.payload_fits).toHaveLength(3);
    for (const fit of tow.data.fits) expect(fit.verdict).not.toBe('safe');
    expect(tow.text).not.toMatch(/\bis safe\b|\bsafe to tow\b|"safe"/i);
    expect(tow.text).not.toMatch(SOURCE_WORDS);
    const coach = getScreenedInventory().units.find((u) => u.rvType === 'class_a')!;
    const mh = await tool('evaluate_tow_fit', { unit_ids: [coach.id], trailer_weight_lbs: 5000 }, made.key);
    expect(mh.data.motorhome_tow).toHaveLength(1);
    expect(mh.text).not.toMatch(/\bis safe\b|\bsafe to tow\b|"safe"/i);
  });
});

describe('daily unit quota', () => {
  it('stops serving unit records at the limit, keeps tow checks working, and survives a restart', async () => {
    const made = partner('Small Quota', { limits: { unitsPerDay: 12 } });
    const a = await tool('search_inventory', { rv_types: ['travel_trailer'], limit: 10 }, made.key);
    expect(a.data.usage).toEqual({ used_today: 10, daily_limit: 12 });
    const b = await tool('search_inventory', { rv_types: ['travel_trailer'], limit: 10, offset: 10 }, made.key);
    expect(b.data.usage.used_today).toBe(20);
    const unitId = a.data.results[0].unit_id;
    for (const blocked of [
      await tool('search_inventory', { rv_types: ['travel_trailer'] }, made.key),
      await tool('get_unit', { unit_id: unitId }, made.key),
      await tool('compare_units', { unit_ids: [unitId, a.data.results[1].unit_id] }, made.key),
    ]) {
      expect(blocked.isError).toBe(true);
      expect(blocked.data).toMatchObject({ error: 'quota_exceeded' });
      expect(blocked.data.resets_at).toMatch(/T00:00:00Z$/);
    }
    expect((await tool('evaluate_tow_fit', { unit_ids: [unitId], vehicle: 'Ford F-150' }, made.key)).isError).toBe(false);
    // A restart loses the in-memory tally; the persisted counters refill it.
    await settle();
    __resetV1Quota();
    expect((await tool('get_unit', { unit_id: unitId }, made.key)).data).toMatchObject({ error: 'quota_exceeded' });
    // Another key is unaffected.
    const other = partner('Fresh Quota');
    expect((await tool('get_unit', { unit_id: unitId }, other.key)).isError).toBe(false);
  });
});

describe('inquiries', () => {
  const unit = () => getScreenedInventory().units.find((u) => u.status === 'available')!;

  it('needs the inquiry scope', async () => {
    const reader = partner('Read Only V1', { scopes: ['read'] });
    const r = await tool('prepare_inquiry', { unit_id: unit().id, ...shopper }, reader.key);
    expect(r.data).toMatchObject({ error: 'client_not_permitted' });
  });

  it('previews, sends once after approval, replays safely and reports status', async () => {
    const made = partner('Lead Partner');
    const u = unit();
    __setRoutes({ [u.dealer.id]: 'leads@dealer.test' });
    const prep = await tool('prepare_inquiry', { unit_id: u.id, ...shopper }, made.key);
    expect(prep.data.status).toBe('preview_only_nothing_sent');
    expect(prep.data.preview.dealer.name).toBe(u.dealer.name);
    expect(sent.emails).toBe(0);
    const token = prep.data.confirmation_token;
    const unapproved = await tool('send_inquiry', { confirmation_token: token, shopper_approved: false }, made.key);
    expect(unapproved.data).toMatchObject({ error: 'not_confirmed', sent: false });
    expect(sent.emails).toBe(0);
    const first = await tool('send_inquiry', { confirmation_token: token, shopper_approved: true }, made.key);
    expect(first.isError).toBe(false);
    expect(first.data).toMatchObject({ status: 'delivered', delivery_channel: 'dealer_email', dry_run: false });
    expect(first.data.already_sent).toBeUndefined();
    const again = await tool('send_inquiry', { confirmation_token: token, shopper_approved: true }, made.key);
    expect(again.data).toMatchObject({ inquiry_id: first.data.inquiry_id, status_token: first.data.status_token, already_sent: true });
    expect(sent.emails).toBe(1);
    expect(__inquiryCount()).toBe(1);
    const status = await tool('get_inquiry_status', { inquiry_id: first.data.inquiry_id, status_token: first.data.status_token }, made.key);
    expect(status.data).toMatchObject({ inquiry_id: first.data.inquiry_id, status: 'delivered' });
    expect((await tool('get_inquiry_status', { inquiry_id: first.data.inquiry_id, status_token: 'ist_wrong_wrong_wrong' }, made.key)).data).toMatchObject({ error: 'not_found' });
    expect(opsList()[0].attribution).toMatchObject({ surface: 'mcp_v1', tier: 'verified_partner', clientId: made.client.id, billingGrade: true });
    await settle();
    const report = buildAttributionReport();
    const row = report.verifiedPartners.clients.find((c) => c.clientId === made.client.id)!;
    expect(row.leads).toMatchObject({ total: 1, delivered: 1, reachedDealer: 1 });
    expect(row.events.inquiry_preview).toBe(1);
  });

  it('a v1 preview cannot be sent by another key or through the public endpoint', async () => {
    const owner = partner('Owner V1'); const rival = partner('Rival V1');
    const prep = await tool('prepare_inquiry', { unit_id: unit().id, ...shopper }, owner.key);
    const token = prep.data.confirmation_token;
    expect((await tool('send_inquiry', { confirmation_token: token, shopper_approved: true }, rival.key)).data).toMatchObject({ error: 'client_mismatch', sent: false });
    expect((await tool('send_dealer_inquiry', { confirmation_token: token, confirmed: true }, undefined, 'consumer')).data).toMatchObject({ error: 'client_mismatch', sent: false });
    expect(__inquiryCount()).toBe(0);
    expect(sent.emails + sent.pushes).toBe(0);
    // And a preview from the public endpoint cannot be claimed on v1.
    const open = await tool('prepare_dealer_inquiry', { unit_id: unit().id, ...shopper }, undefined, 'consumer');
    expect((await tool('send_inquiry', { confirmation_token: open.data.confirmation_token, shopper_approved: true }, owner.key)).data).toMatchObject({ error: 'client_mismatch' });
  });

  it('dry_run records without delivering', async () => {
    const made = partner('Integration Test');
    const prep = await tool('prepare_inquiry', { unit_id: unit().id, ...shopper }, made.key);
    const r = await tool('send_inquiry', { confirmation_token: prep.data.confirmation_token, shopper_approved: true, dry_run: true }, made.key);
    expect(r.data).toMatchObject({ status: 'dry_run', dry_run: true });
    expect(sent.emails + sent.pushes).toBe(0);
  });
});

describe('attribution', () => {
  it('counts v1 activity under the key as verified traffic', async () => {
    const made = partner('Counted');
    const s = await tool('search_inventory', { rv_types: ['class_c'], limit: 5 }, made.key);
    await tool('get_unit', { unit_id: s.data.results[0].unit_id }, made.key);
    await settle();
    const today = new Date().toISOString().slice(0, 10);
    const rows = attributionRows(today, today);
    expect(rows.every((r) => r.tier === 'verified_partner' && r.client === made.client.id)).toBe(true);
    const sum = (event: string) => rows.filter((r) => r.event === event).reduce((n, r) => n + r.count, 0);
    expect(sum('search')).toBe(1);
    expect(sum('impression')).toBe(5);
    expect(sum('detail_view')).toBe(1);
  });
});

describe('mounted in the app', () => {
  let base = '';
  let server: ReturnType<typeof app.listen>;
  beforeAll(async () => {
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) });
  const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

  it('/mcp/v1 is gated by the flag and the key while /mcp stays open', async () => {
    const made = partner('Mounted');
    expect((await post('/mcp/v1', list)).status).toBe(401);
    const ok = await post('/mcp/v1', list, { authorization: `Bearer ${made.key}` });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('search_inventory');
    const open = await post('/mcp', list);
    expect(open.status).toBe(200);
    const openText = await open.text();
    expect(openText).toContain('search_rvs');
    expect(openText).not.toContain('search_inventory');
    delete process.env.AGENT_V1_ENABLED;
    expect((await post('/mcp/v1', list, { authorization: `Bearer ${made.key}` })).status).toBe(404);
    expect((await post('/mcp', list)).status).toBe(200);
  });

  it('/api/agent serves the screened inventory only', async () => {
    const screened = getScreenedInventory();
    const held = getInventory().units.find((u) => !screened.byId.has(u.id))!;
    const kept = screened.units.find((u) => u.status === 'available')!;
    expect((await fetch(`${base}/api/agent/units/${encodeURIComponent(held.id)}`)).status).toBe(404);
    expect((await fetch(`${base}/api/agent/units/${encodeURIComponent(held.id)}/availability`)).status).toBe(404);
    expect((await fetch(`${base}/api/agent/units/${encodeURIComponent(kept.id)}`)).status).toBe(200);
    expect((await post('/api/agent/tow-fit', { vehicle: 'Ford F-150', unit_ids: [held.id] })).status).toBe(404);
    expect((await post('/api/agent/compare', { unit_ids: [held.id, kept.id], constraints: {} })).status).toBe(404);
    const search = await (await post('/api/agent/search', { constraints: { rvTypes: ['travel_trailer'] }, limit: 12 })).json();
    expect(search.results.length).toBeGreaterThan(0);
    for (const r of search.results) expect(screened.byId.has(r.unit.id)).toBe(true);
    expect(search.funnel.totalUnits).toBeLessThanOrEqual(screened.units.length);
  });
});

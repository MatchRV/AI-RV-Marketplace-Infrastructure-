import { beforeEach, describe, expect, it } from 'vitest';
import { matchRvMcpHandler } from '../src/mcp';
import { __resetMemory, memoryFingerprint } from '../src/services/learned-store';

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await matchRvMcpHandler.fetch(new Request('http://localhost/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  const raw = await response.text();
  const message = JSON.parse(raw.startsWith('event:') || raw.startsWith('data:') ? raw.split('\n').find(l => l.startsWith('data:'))!.slice(5) : raw);
  expect(message.error).toBeUndefined();
  return message.result;
}
const call = async (name: string, args: Record<string, unknown>, meta?: Record<string, unknown>) => {
  const r = await rpc('tools/call', { name, arguments: args, ...(meta ? { _meta: meta } : {}) });
  return { isError: r.isError === true, data: JSON.parse(r.content.find((c: any) => c.type === 'text').text) };
};
const A = { 'openai/subject': 'v1/shopper-A' };
const B = { 'openai/subject': 'v1/shopper-B' };
const VEHICLE = '2098 Isolation Test Truck';

let unitIds: string[] = [];
beforeEach(async () => {
  __resetMemory();
  if (!unitIds.length) {
    const s = await call('search_rvs', { location: 'Tacoma, WA', radius_miles: 50, shopper_requested_results_now: true, shopper_words: 'just show me', limit: 3, constraints: { rvTypes: ['travel_trailer'] } });
    unitIds = s.data.results.map((r: any) => r.unit_id);
    expect(unitIds.length).toBeGreaterThanOrEqual(2);
  }
});

describe('tool annotations', () => {
  it('only teach_outfitter and send_dealer_inquiry are write tools; send is destructive + open-world', async () => {
    const { tools } = await rpc('tools/list');
    const byName = Object.fromEntries(tools.map((t: any) => [t.name, t.annotations]));
    const writers = Object.entries(byName).filter(([, a]: any) => a.readOnlyHint !== true).map(([n]) => n).sort();
    expect(writers).toEqual(['send_dealer_inquiry', 'teach_outfitter']);
    expect(byName.send_dealer_inquiry).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: false });
    expect(byName.prepare_dealer_inquiry).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  });
});

describe('read-only tools never change memory', () => {
  it('search_rvs, evaluate_tow_fit, get_rv, compare_rvs, outfitter_* and inquiry preview/status leave the store untouched — even when a rating is stated', async () => {
    const before = memoryFingerprint();
    await call('search_rvs', { location: 'Tacoma, WA', shopper_requested_results_now: true, shopper_words: 'just show me', party_size: 4, truck_tow_rating_lbs: 8800, truck_payload_lbs: 1500, constraints: { towVehicle: VEHICLE }, limit: 3 }, A);
    await call('evaluate_tow_fit', { vehicle: `${VEHICLE} rated 8,800 lbs`, unit_ids: [unitIds[0]], truck_payload_lbs: 1500 }, A);
    await call('get_rv', { unit_id: unitIds[0] }, A);
    await call('compare_rvs', { unit_ids: unitIds.slice(0, 2) }, A);
    await call('outfitter_memory', { vehicle: VEHICLE }, A);
    await call('outfitter_discovery', { party_size: 4, tow_vehicle: VEHICLE, truck_tow_rating_lbs: 8800 }, A);
    await call('outfitter_guide', { topic: 'tow_basics' }, A);
    await call('prepare_dealer_inquiry', { unit_id: unitIds[0], name: 'Test Shopper', email: 'shopper@example.com', message: 'Is it available?' }, A);
    await call('get_dealer_inquiry_status', { inquiry_id: 'inq_doesnotexist', status_token: 'ist_doesnotexist000' }, A);
    expect(memoryFingerprint()).toBe(before);
    const recall = await call('outfitter_memory', { vehicle: VEHICLE }, A);
    expect(recall.data.recall).toBeNull();
  });
});

describe('memory isolation between shoppers', () => {
  it('a rating taught by shopper A is never visible to shopper B', async () => {
    const taught = await call('teach_outfitter', { vehicle: VEHICLE, tow_rating_lbs: 7300 }, A);
    expect(taught.data.scope).toBe('openai_subject');
    expect((await call('outfitter_memory', { vehicle: VEHICLE }, A)).data.recall.towRatingLbs).toBe(7300);
    expect((await call('outfitter_memory', { vehicle: VEHICLE }, B)).data.recall).toBeNull();
    expect((await call('outfitter_memory', { vehicle: VEHICLE })).data.recall).toBeNull();
    const searchA = await call('search_rvs', { location: 'Tacoma, WA', shopper_requested_results_now: true, shopper_words: 'just show me', party_size: 4, constraints: { towVehicle: VEHICLE }, limit: 3 }, A);
    const searchB = await call('search_rvs', { location: 'Tacoma, WA', shopper_requested_results_now: true, shopper_words: 'just show me', party_size: 4, constraints: { towVehicle: VEHICLE }, limit: 3 }, B);
    expect(searchA.data.sherpa.memory).toMatch(/LEARNED/);
    expect(searchB.data.sherpa.memory).toBeNull();
  });
  it('a unit fact taught by A overlays only A\'s get_rv', async () => {
    await call('teach_outfitter', { unit_id: unitIds[0], field: 'sleeps', value: 13 }, A);
    expect((await call('get_rv', { unit_id: unitIds[0] }, A)).data.unit.sleeps).toMatchObject({ value: 13, source: 'learned' });
    expect((await call('get_rv', { unit_id: unitIds[0] }, B)).data.unit.sleeps.value).not.toBe(13);
  });
  it('without host identity, teach issues a private session_key that only its holder can use', async () => {
    const taught = await call('teach_outfitter', { vehicle: VEHICLE, tow_rating_lbs: 6100 });
    expect(taught.data.scope).toBe('session_key');
    const key = taught.data.session_key;
    expect(key).toMatch(/^mrs_/);
    expect((await call('outfitter_memory', { vehicle: VEHICLE, session_key: key })).data.recall.towRatingLbs).toBe(6100);
    expect((await call('outfitter_memory', { vehicle: VEHICLE })).data.recall).toBeNull();
    expect((await call('outfitter_memory', { vehicle: VEHICLE, session_key: 'mrs_someoneelseskey000000000' })).data.recall).toBeNull();
    // Host identity outranks a copied key: shopper B cannot read it by pasting the key.
    expect((await call('outfitter_memory', { vehicle: VEHICLE, session_key: key }, B)).data.recall).toBeNull();
  });
});

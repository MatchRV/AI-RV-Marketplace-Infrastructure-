import { describe, it, expect } from 'vitest';
import { matchRvMcpHandler } from '../src/mcp';
async function rpc(method: string, params: unknown = {}) {
  const response = await matchRvMcpHandler.fetch(new Request('http://localhost/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  expect(response.status).toBe(200);
  const raw = await response.text();
  const message = JSON.parse(raw.startsWith('event:') || raw.startsWith('data:') ? raw.split('\n').find(l => l.startsWith('data:'))!.slice(5) : raw);
  expect(message.error).toBeUndefined();
  return message.result;
}
describe('MCP release transport', () => {
  it('exposes shared playbook and read-only shopping tools', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'release-test', version: '1' } });
    expect(init.instructions).toContain('SHARED PROFESSIONAL OUTFITTER METHOD');
    const list = await rpc('tools/list');
    expect(list.tools.map((t: any) => t.name)).toContain('search_rvs');
  });
  it('runs Texas strict constraints without promoting unsupported candidates', async () => {
    const result = await rpc('tools/call', { name: 'search_rvs', arguments: { location: 'Texas', sleepers: 4, length_reason: 'storage', constraints: { rvTypes: ['travel_trailer'], mustHave: ['bunkhouse'], lengthMaxFt: 30, priceMinUsd: 35000, priceMaxUsd: 45000 } } });
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content.find((c: any) => c.type === 'text').text);
    expect(data.appliedConstraints).toMatchObject({ lengthMaxFt: 30, priceMinUsd: 35000, priceMaxUsd: 45000, mustHave: ['bunkhouse'] });
    expect(data.funnel.verifiedMatches).toBe(0);
  }, 20000);
  it('honors top-level condition=new near Tacoma: no used units, no out-of-state dealers, per-store CW names', async () => {
    const result = await rpc('tools/call', { name: 'search_rvs', arguments: { location: 'Tacoma, WA', radius_miles: 50, condition: 'new', discovery_waived: true, limit: 10 } });
    const body = JSON.parse(result.content[0].text);
    expect(body.results.length).toBeGreaterThan(0);
    const year = new Date().getFullYear();
    for (const r of body.results) {
      expect(r.dealerState).toBe('WA');
      expect(r.dealer).not.toMatch(/Woodland, Fife/);
      expect(Number(r.title.slice(0, 4))).toBeGreaterThanOrEqual(year - 3);
    }
  });
  it('nationwide lowest-price sort never surfaces sub-floor prices', async () => {
    const result = await rpc('tools/call', { name: 'search_rvs', arguments: { sort: 'price_asc', condition: 'new', discovery_waived: true, constraints: { rvTypes: ['travel_trailer'] }, limit: 10 } });
    const body = JSON.parse(result.content[0].text);
    for (const r of body.results) expect(r.price).toBeGreaterThanOrEqual(8000);
  });
  it('sherpa gate: asks who sleeps in it before showing any trailer', async () => {
    const gated = await rpc('tools/call', { name: 'search_rvs', arguments: { location: 'Fife, WA', constraints: { rvTypes: ['travel_trailer'], maxWeightLbs: 6000, towVehicle: '2021 Ford F-150 3.5L EcoBoost' } } });
    const data = JSON.parse(gated.content.find((c: any) => c.type === 'text').text);
    expect(data.status).toBe('needs_discovery');
    expect(data.results).toEqual([]);
    expect(data.nextQuestion.id).toBe('sleepers');
    // Same request with the party known searches normally.
    const open = await rpc('tools/call', { name: 'search_rvs', arguments: { location: 'Fife, WA', sleepers: 2, floorplan_intent: 'couples', constraints: { rvTypes: ['travel_trailer'], maxWeightLbs: 6000, towVehicle: '2021 Ford F-150 3.5L EcoBoost' } } });
    const openData = JSON.parse(open.content.find((c: any) => c.type === 'text').text);
    expect(openData.status).not.toBe('needs_discovery');
    expect(openData.sherpa.towStatus).toContain('preliminary');
  }, 30000);
  it('Road to the Sale: a 35-ft cap asks storage-vs-comfort before searching', async () => {
    const gated = await rpc('tools/call', { name: 'search_rvs', arguments: { sleepers: 2, query: 'motorhome nothing longer than 35 ft', constraints: { rvTypes: ['class_c'] } } });
    const data = JSON.parse(gated.content.find((c: any) => c.type === 'text').text);
    expect(data.status).toBe('needs_discovery');
    expect(data.nextQuestion.id).toBe('length_reason');
    const stored = await rpc('tools/call', { name: 'search_rvs', arguments: { sleepers: 2, length_max_ft: 35, length_reason: 'storage', constraints: { rvTypes: ['class_c'] } } });
    const storedData = JSON.parse(stored.content.find((c: any) => c.type === 'text').text);
    expect(storedData.status).not.toBe('needs_discovery');
    expect(storedData.appliedConstraints.lengthMaxFt).toBe(35);
    const flexed = await rpc('tools/call', { name: 'search_rvs', arguments: { sleepers: 2, length_max_ft: 35, length_reason: 'comfort', length_flex_approved: true, constraints: { rvTypes: ['class_c'] } } });
    const flexedData = JSON.parse(flexed.content.find((c: any) => c.type === 'text').text);
    expect(flexedData.appliedConstraints.lengthMaxFt).toBe(37);
  }, 30000);
  it('exposes the sherpa discovery tool for any LLM host', async () => {
    const list = await rpc('tools/list');
    expect(list.tools.map((t: any) => t.name)).toContain('outfitter_discovery');
    const disc = await rpc('tools/call', { name: 'outfitter_discovery', arguments: {} });
    const data = JSON.parse(disc.content.find((c: any) => c.type === 'text').text);
    expect(data.readyToSearch).toBe(false);
    expect(data.nextQuestion.id).toBe('sleepers');
  });
  it('serves buyer-guide knowledge for education questions', async () => {
    const list = await rpc('tools/list');
    expect(list.tools.map((t: any) => t.name)).toContain('outfitter_guide');
    const guide = await rpc('tools/call', { name: 'outfitter_guide', arguments: { query: 'how does payload and tongue weight work?' } });
    const data = JSON.parse(guide.content.find((c: any) => c.type === 'text').text);
    expect(data.topics[0].id).toBe('tow_basics');
    expect(data.topics[0].points.join(' ')).toContain('Payload is usually the real bottleneck');
  });
  it('learns a tow rating once and recalls it forever (Hermes-style memory)', async () => {
    const list = await rpc('tools/list');
    expect(list.tools.map((t: any) => t.name)).toEqual(expect.arrayContaining(['teach_outfitter', 'outfitter_memory']));
    const taught = await rpc('tools/call', { name: 'teach_outfitter', arguments: { vehicle: '2099 Test Hauler XLT', tow_rating_lbs: 9100, payload_lbs: 1420 } });
    const taughtData = JSON.parse(taught.content.find((c: any) => c.type === 'text').text);
    expect(taughtData.learned.towRatingLbs).toBe(9100);
    const memory = await rpc('tools/call', { name: 'outfitter_memory', arguments: { vehicle: '2099 Test Hauler XLT' } });
    const memData = JSON.parse(memory.content.find((c: any) => c.type === 'text').text);
    expect(memData.recall.towRatingLbs).toBe(9100);
    expect(memData.recall.confirmations).toBe(1);
    // A second confirmation raises the count — memory compounds, not replaces.
    await rpc('tools/call', { name: 'teach_outfitter', arguments: { vehicle: '2099 Test Hauler XLT', tow_rating_lbs: 9100 } });
    const memory2 = await rpc('tools/call', { name: 'outfitter_memory', arguments: { vehicle: '2099 Test Hauler XLT' } });
    expect(JSON.parse(memory2.content.find((c: any) => c.type === 'text').text).recall.confirmations).toBe(2);
  });
  it('returns an explicit missing-record error', async () => {
    const result = await rpc('tools/call', { name: 'get_rv', arguments: { unit_id: 'test:does-not-exist' } });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toBe('unit_not_found');
  });
});

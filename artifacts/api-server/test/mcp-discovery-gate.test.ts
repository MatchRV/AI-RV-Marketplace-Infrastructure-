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
const callRaw = async (name: string, args: Record<string, unknown>) => {
  const r = await rpc('tools/call', { name, arguments: args });
  expect(r.isError).not.toBe(true);
  return { r, d: JSON.parse(r.content.find((c: any) => c.type === 'text').text) };
};
const call = async (name: string, args: Record<string, unknown>) => (await callRaw(name, args)).d;
const ids = (qs: { id: string }[]) => qs.map((q) => q.id);
// Big match counts the ChatGPT transcript led with ("198 verified matches").
const COUNT_TEXT = /\b\d{2,}\s+(?:verified\s+)?(?:matches|units|results|RVs)\b|\bfound\s+\d+/i;

const COMPLETE = { query: 'travel trailer', location: 'Tacoma, WA', radius_miles: 75, party_size: 4, tow_vehicle: 'none yet', no_length_limit: true, payment_method: 'cash', out_the_door_budget_usd: 40000, rv_types: ['travel_trailer'] };

describe('MCP 2.2.2 discovery gate + shortlist', () => {
  it("vague 'travel trailer for my family near Tacoma' returns no RVs, only the questions to ask", async () => {
    const d = await call('search_rvs', { query: 'I want a travel trailer for my family near Tacoma' });
    expect(d.status).toBe('needs_discovery');
    expect(d.results).toEqual([]);
    expect(ids(d.nextQuestions)).toEqual(['sleepers', 'tow_vehicle', 'size_limit']);
    expect(d.missingForProducts).toEqual(expect.arrayContaining(['sleepers', 'tow_vehicle', 'size_limit', 'pay_way']));
    expect(d.instruction).toMatch(/ASK, DON'T ASSUME/);
    expect(JSON.stringify(d)).not.toMatch(COUNT_TEXT);
    const rv = await call('rv_outfitter', { message: 'I want a travel trailer for my family near Tacoma' });
    expect(rv.status).toBe('needs_discovery');
    expect(rv.results).toEqual([]);
    expect(ids(rv.nextQuestions)).toEqual(['sleepers', 'tow_vehicle', 'size_limit']);
    const disc = await call('outfitter_discovery', { message: 'I want a travel trailer for my family near Tacoma' });
    expect(disc.status).toBe('needs_discovery');
    expect(ids(disc.nextQuestions)).toEqual(['sleepers', 'tow_vehicle', 'size_limit']);
  }, 60000);

  it('the guessed ChatGPT call (sleeps 4 + price, no tow vehicle / size / how they pay) is still gated', async () => {
    const d = await call('search_rvs', { location: 'Tacoma, WA', radius_miles: 75, sleeps_min: 4, price_max_usd: 35000, rv_types: ['travel_trailer'], condition: 'any' });
    expect(d.status).toBe('needs_discovery');
    expect(d.results).toEqual([]);
    expect(ids(d.nextQuestions)).toEqual(['tow_vehicle', 'size_limit', 'pay_way']);
  }, 60000);

  it('a host-set waiver without the shopper saying so is rejected; legacy discovery_waived / force_search no longer bypass', async () => {
    const d = await call('search_rvs', { query: 'travel trailer near Tacoma', shopper_requested_results_now: true, shopper_words: 'I want a travel trailer for my family' });
    expect(d.status).toBe('needs_discovery');
    expect(d.waiverRejected).toMatch(/shopper_words/);
    const legacy = await call('search_rvs', { query: 'travel trailer near Tacoma', discovery_waived: true, force_search: true, constraints: { sherpa: { discoveryWaived: true } } });
    expect(legacy.status).toBe('needs_discovery');
    expect(legacy.results).toEqual([]);
  }, 60000);

  it('complete facts return a shortlist of exactly 3, with no total match count in what the model sees', async () => {
    const { r, d } = await callRaw('search_rvs', COMPLETE);
    expect(d.status).toBe('shortlist');
    expect(d.results).toHaveLength(3);
    expect(d.shortlist.size).toBe(3);
    expect(d.funnel).toBeUndefined();
    expect(d.coverage.units_in_area).toBeUndefined();
    expect(d.coverage.nationwide_total).toBeUndefined();
    const text = r.content.map((c: any) => c.text).join(' ');
    expect(text).not.toMatch(COUNT_TEXT);
    expect(text).not.toMatch(/verifiedMatches|units_in_area|nationwide_total/);
    // Totals survive only as internal, widget-only metadata.
    expect(typeof r._meta['matchrv/internal'].funnel.verifiedMatches).toBe('number');
    // No tow vehicle yet: every towable says tow fit must be checked.
    for (const row of d.results) expect(row.towFit).toMatch(/verify tow fit/);
    // Units with dealer-published sleeping capacity come first.
    const confirmed = d.results.map((x: any) => x.sleepsConfirmed);
    expect(confirmed).toEqual([...confirmed].sort((a: boolean, b: boolean) => Number(b) - Number(a)));
    // Three different model lines when other good fits exist (not three floorplans of one trailer).
    const lines = d.results.map((x: any) => x.title.toLowerCase().replace(/^(19|20)\d\d\s+/, '').split(/\s+/).slice(0, -1).join(' '));
    expect(new Set(lines).size).toBe(3);
    // More only when asked for.
    const more = await call('search_rvs', { ...COMPLETE, limit: 6 });
    expect(more.results.length).toBeLessThanOrEqual(6);
    expect(more.results.length).toBeGreaterThan(3);
  }, 60000);

  it('respects a stated length limit and a stated tow vehicle', async () => {
    const d = await call('search_rvs', { ...COMPLETE, no_length_limit: undefined, length_max_ft: 26, length_reason: 'storage', tow_vehicle: '2021 Ford F-150 3.5L EcoBoost' });
    expect(d.status).toBe('shortlist');
    expect(d.appliedConstraints.lengthMaxFt).toBe(26);
    for (const row of d.results) {
      if (row.lengthFt != null) expect(row.lengthFt).toBeLessThanOrEqual(26);
      expect(row.towFit).toBeDefined();
    }
  }, 60000);

  it('a named make/model with sleeps, area and payment known lists results without the towable questions', async () => {
    const d = await call('search_rvs', { make: 'Tiffin', model: 'Allegro RED', location: 'Tacoma, WA', radius_miles: 150, party_size: 2, payment_method: 'cash', budget_declined: true });
    expect(d.status).toBe('shortlist');
    expect(d.results.length).toBeGreaterThan(0);
    expect(d.results.length).toBeLessThanOrEqual(3);
    for (const row of d.results) expect(row.series).toBe('Allegro RED');
  }, 60000);

  it("the shopper's own 'just show me' shows a 3-unit shortlist, then the questions resume", async () => {
    const d = await call('search_rvs', { query: 'travel trailer near Tacoma', shopper_requested_results_now: true, shopper_words: 'Just show me what you have' });
    expect(d.status).toBe('shortlist');
    expect(d.results.length).toBeGreaterThan(0);
    expect(d.results.length).toBeLessThanOrEqual(3);
    expect(d.roadToSale.waived).toBe(true);
    expect(ids(d.roadToSale.resumeQuestions)).toEqual(expect.arrayContaining(['sleepers']));
  }, 60000);

  it('tool descriptions and server instructions say ask, do not assume', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'gate-test', version: '1' } });
    expect(init.serverInfo.version).toBe('2.2.2');
    expect(init.instructions).toMatch(/ASK, DON'T ASSUME/);
    expect(init.instructions).not.toMatch(/Cite coverage\.units_in_area/);
    const list = await rpc('tools/list');
    expect(list.tools).toHaveLength(12);
    const search = list.tools.find((t: any) => t.name === 'search_rvs');
    expect(search.description).toMatch(/ASK, DON'T ASSUME/);
    const props = Object.keys(search.inputSchema.properties);
    expect(props).toEqual(expect.arrayContaining(['party_size', 'tow_vehicle', 'length_max_ft', 'no_length_limit', 'payment_method', 'shopper_requested_results_now', 'shopper_words']));
    expect(props).not.toContain('discovery_waived');
    expect(props).not.toContain('force_search');
    expect(search.inputSchema.properties.limit.default).toBe(3);
  });
});

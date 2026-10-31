import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchRvMcpHandler, MCP_VERSION } from '../src/mcp';

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
const body = (result: any) => JSON.parse(result.content.find((c: any) => c.type === 'text').text);
const SKIP = { shopper_requested_results_now: true, shopper_words: 'just show me' };

describe('MCP 2.2.7 — refine + walkthrough, tool surface unchanged from 2.2.6', () => {
  it('reports 2.2.7', async () => {
    expect(MCP_VERSION).toBe('2.2.7');
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'refine-test', version: '1' } });
    expect(init.serverInfo.version).toBe('2.2.7');
    expect(init.instructions).toContain('REFINING RESULTS');
    expect(init.instructions).toMatch(/ONE thing at a time/);
    expect(init.instructions).toContain('WALKTHROUGH VIDEOS');
    expect(init.instructions).toContain('Same model — this unit may differ');
  });

  it('keeps every tool name, title, description, input schema and annotation identical to the reviewed 2.2.6 surface', async () => {
    const reviewed = JSON.parse(readFileSync(new URL('./fixtures/mcp-tools-v2.2.6.json', import.meta.url), 'utf8'));
    const list = await rpc('tools/list');
    const now = list.tools
      .map((t: any) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    expect(now.map((t: any) => t.name)).toEqual(reviewed.map((t: any) => t.name));
    expect(now).toHaveLength(11);
    expect(now).toEqual(reviewed);
  });

  it('search_rvs rows carry a walkthrough and the response carries refine guidance', async () => {
    const r = body(await rpc('tools/call', { name: 'search_rvs', arguments: { ...SKIP, rv_types: ['travel_trailer'], location: 'Denver, CO', radius_miles: 100, party_size: 6 } }));
    expect(r.status).toBe('shortlist');
    expect(r.results.length).toBeGreaterThan(0);
    for (const row of r.results) {
      expect(row.walkthrough).toBeDefined();
      expect(['dealer_video', 'model_search']).toContain(row.walkthrough.kind);
      if (row.walkthrough.kind === 'model_search') {
        expect(row.walkthrough.label).toBe('Same model — this unit may differ');
        expect(row.walkthrough.sameUnit).toBe(false);
        expect(row.walkthrough.url).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=.+walkthrough$/);
        expect(row.walkthrough.query).toMatch(/^\d{4} /);
      } else {
        expect(row.walkthrough.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
      }
    }
    expect(r.refine).toMatchObject({ options: ['price', 'length', 'floorplan', 'distance', 'rv_type', 'new_vs_used'] });
    expect(typeof r.refine.suggested).toBe('boolean');
    expect(r.refine.ask).toMatch(/what would you change/);
    expect(r.nextStep).toMatch(/change one thing at a time/);
    expect(r.nextStep).toMatch(/walkthrough/);
    expect(r.outfitterGuidance).toContain('REFINE:');
    expect(r.outfitterGuidance).toContain('Want to see a walkthrough video of the inside?');
  }, 60000);

  it('flags thin results so the assistant asks what to change', async () => {
    const r = body(await rpc('tools/call', { name: 'search_rvs', arguments: { ...SKIP, rv_types: ['class_a'], location: 'Tacoma, WA', radius_miles: 5, price_max_usd: 20000 } }));
    expect(r.status).toBe('shortlist');
    expect(r.refine.suggested).toBe(true);
    expect(['no_local_matches', 'no_results', 'no_fully_verified_matches', 'fewer_than_requested']).toContain(r.refine.reason);
    expect(r.nextStep).toMatch(/look thin/);
  }, 60000);

  it('get_rv returns a walkthrough next to the unit, and the dealer video when the listing stored one', async () => {
    const r = body(await rpc('tools/call', { name: 'search_rvs', arguments: { ...SKIP, rv_types: ['fifth_wheel'], location: 'Sacramento, CA', radius_miles: 100 } }));
    const id = r.results[0].unit_id;
    const d = body(await rpc('tools/call', { name: 'get_rv', arguments: { unit_id: id } }));
    expect(d.unit.id).toBe(id);
    expect(d.walkthrough.kind).toBe('model_search');
    expect(d.walkthrough.label).toBe('Same model — this unit may differ');
    expect(d.walkthrough.query).toContain(String(d.unit.year));
    // A unit whose dealer description links its own YouTube tour (stored in the snapshot).
    const tour = await rpc('tools/call', { name: 'get_rv', arguments: { unit_id: 'vin:4EZFV4226T6043081' } });
    expect(tour.isError).not.toBe(true);
    expect(body(tour).walkthrough).toMatchObject({ kind: 'dealer_video', url: 'https://www.youtube.com/watch?v=lXPHoDmBkcU', source: 'dealer_listing_description' });
    expect(body(tour).walkthrough.note).toMatch(/hasn't verified it shows this exact unit/);
  }, 60000);
});

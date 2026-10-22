import { describe, it, expect } from 'vitest';
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
const callRaw = async (name: string, args: Record<string, unknown>) => {
  const r = await rpc('tools/call', { name, arguments: args });
  expect(r.isError).not.toBe(true);
  return { r, d: JSON.parse(r.content.find((c: any) => c.type === 'text').text) };
};
const call = async (name: string, args: Record<string, unknown>) => (await callRaw(name, args)).d;

describe('MCP 2.2.3 — Road to the Sale + make/model search', () => {
  it('reports version 2.2.3 and the Road to the Sale instructions', async () => {
    expect(MCP_VERSION).toBe('2.2.3');
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'r2s-test', version: '1' } });
    expect(init.serverInfo.version).toBe('2.2.3');
    expect(init.instructions).toContain('ROAD TO THE SALE');
    const list = await rpc('tools/list');
    const search = list.tools.find((t: any) => t.name === 'search_rvs');
    expect(Object.keys(search.inputSchema.properties)).toEqual(expect.arrayContaining(['make', 'model', 'exclude_makes', 'payment_method']));
  }, 60000);

  it('"Tiffin Allegro Red" returns only Allegro REDs', async () => {
    const { r: raw, d } = await callRaw('search_rvs', { query: 'Tiffin Allegro Red', shopper_requested_results_now: true, shopper_words: 'just show me', limit: 10 });
    expect(d.appliedConstraints).toMatchObject({ makes: ['Tiffin'], models: ['Allegro RED'] });
    expect(d.appliedConstraints.fuelType).toBeUndefined();
    expect(d.results.length).toBeGreaterThan(0);
    for (const r of d.results) {
      expect(r.make ?? 'Tiffin').toBe('Tiffin');
      expect(r.series).toBe('Allegro RED');
      expect(r.title).toMatch(/tiffin/i);
    }
    // The model count is internal only (never in what the shopper-facing model reads).
    expect(d.makeModelSummary).toBeUndefined();
    expect(raw._meta['matchrv/internal'].makeModelSummary.count).toBeGreaterThan(0);
  }, 60000);

  it('constraints.make / model are no longer stripped (top-level and nested both work)', async () => {
    const nested = await call('search_rvs', { constraints: { make: 'Tiffin', model: 'Phaeton' }, shopper_requested_results_now: true, shopper_words: 'just show me', limit: 10 });
    expect(nested.appliedConstraints).toMatchObject({ makes: ['Tiffin'], models: ['Phaeton'] });
    for (const r of nested.results) expect(r.series).toBe('Phaeton');
    const top = await call('search_rvs', { make: 'tiffin motorhomes', model: 'phaeton', shopper_requested_results_now: true, shopper_words: 'just show me', limit: 5 });
    expect(top.appliedConstraints).toMatchObject({ makes: ['Tiffin'], models: ['Phaeton'] });
    expect(top.results.map((r: any) => r.unit_id)).toEqual(nested.results.slice(0, 5).map((r: any) => r.unit_id));
  }, 60000);

  it('"Tiffin motorhomes" returns only motorized Tiffins', async () => {
    const d = await call('search_rvs', { query: 'Tiffin motorhomes', shopper_requested_results_now: true, shopper_words: 'just show me', limit: 10 });
    expect(d.appliedConstraints.makes).toEqual(['Tiffin']);
    expect(d.appliedConstraints.rvTypes).toEqual(['class_a', 'class_b', 'class_c']);
    for (const r of d.results) {
      expect(r.title).toMatch(/tiffin/i);
      expect(r.title).not.toMatch(/trailer|fifth wheel/i);
    }
  }, 60000);

  it('"good gas mileage" never applies a fuel filter; explicit "diesel" does', async () => {
    const mpg = await call('search_rvs', { query: 'class a with good gas mileage', shopper_requested_results_now: true, shopper_words: 'just show me', limit: 3 });
    expect(mpg.appliedConstraints.fuelType).toBeUndefined();
    expect(JSON.stringify(mpg.nextStep ?? '')).not.toMatch(/gas (?:vs\.?|or) diesel/i);
    const diesel = await call('search_rvs', { query: 'diesel class a', shopper_requested_results_now: true, shopper_words: 'just show me', limit: 3 });
    expect(diesel.appliedConstraints.fuelType).toBe('diesel');
  }, 60000);

  it('an exact model does not skip the questions, and its count stays internal', async () => {
    const { r, d } = await callRaw('search_rvs', { query: 'Tiffin Allegro Red near Tacoma, WA', radius_miles: 150 });
    expect(d.status).toBe('needs_discovery');
    expect(d.results).toEqual([]);
    expect(d.modelCount).toBeUndefined();
    expect(typeof r._meta['matchrv/internal'].modelCount.count).toBe('number');
    // The model answers "what do you want"; the rest of the list is still asked, in order.
    expect(d.nextQuestions.map((q: any) => q.id)).toEqual(['use', 'activities', 'vacation']);
    expect(d.missingForProducts).not.toContain('rv_type');
    expect(d.missingForProducts).toEqual(expect.arrayContaining(['who_going', 'buyers', 'trade', 'towing', 'storage', 'trips', 'pay_way']));
  }, 60000);

  it('"just show me" lists results and hands back the questions to resume', async () => {
    const d = await call('search_rvs', { query: 'Tiffin Allegro Red', shopper_requested_results_now: true, shopper_words: 'just show me', limit: 3 });
    expect(d.roadToSale.waived).toBe(true);
    expect(d.roadToSale.resumeQuestions.map((q: any) => q.id)).toEqual(['use', 'activities', 'vacation']);
  }, 60000);

  it('outfitter_discovery: Sherpa welcome for a vague opener; skips it when they say what they want', async () => {
    const hi = await call('outfitter_discovery', { message: 'hi' });
    expect(hi.route).toBe('welcome');
    expect(hi.welcome).toMatch(/^I'd love to help with anything RV\. Think of me as your Sherpa/);
    const edu = await call('outfitter_discovery', { message: "What's the difference between a motorhome and a trailer?" });
    expect(edu.route).toBe('education');
    expect(edu.status).toBe('answer_directly');
    expect(edu.nextQuestions).toEqual([]);
    expect(edu.welcome).toBeUndefined();
    const specific = await call('outfitter_discovery', { message: 'Looking for a Tiffin Phaeton near Spokane' });
    expect(specific.route).toBe('specific_rv');
    expect(specific.welcome).toBeUndefined();
    expect(specific.nextQuestions.length).toBeGreaterThan(0);
    expect(specific.nextQuestions.length).toBeLessThanOrEqual(3);
  });

  it('outfitter_guide serves the six ways to pay', async () => {
    const d = await call('outfitter_guide', { topic: 'how_to_pay' });
    expect(d.topics[0].id).toBe('how_to_pay');
    expect(d.topics[0].points.join(' ')).toMatch(/out-the-door/);
  });
});

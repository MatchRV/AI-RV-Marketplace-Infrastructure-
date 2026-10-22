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

const COUPLE_MSG = "We're a couple, just the two of us. Looking for a travel trailer around Tacoma. Cash budget is $35k out the door.";
// What the model sends for the couple/cash message: fit facts + the step it answers (buyers). No raw message.
const COUPLE_FACTS = { rv_types: ['travel_trailer'], location: 'Tacoma, WA', party_size: 2, covered_steps: ['buyers'], payment_method: 'cash', budget_max_usd: 35000 };
// The rest of the interview, as the model passes it: fit facts plus covered step names only.
const GT = { use_type: ['camping'], desired_features: ['outdoor_kitchen'], covered_steps: ['activities', 'vacation', 'buyers', 'trade', 'trips'] };
const COMPLETE = { ...GT, query: 'travel trailer', location: 'Tacoma, WA', radius_miles: 75, party_size: 4, tow_vehicle: 'none yet', no_length_limit: true, payment_method: 'cash', budget_max_usd: 40000, rv_types: ['travel_trailer'] };
const PRODUCT_SELECTION = ['rv_type', 'use', 'activities', 'vacation', 'who_going', 'buyers', 'trade', 'trade_details', 'towing', 'storage', 'length_reason', 'length_flex', 'trips', 'location', 'pay_way', 'fin_down', 'fin_monthly', 'fin_cash', 'pay_numbers'];

describe('MCP 2.2.6 interview gate (fit facts + covered steps) + shortlist', () => {
  it("vague 'travel trailer for my family near Tacoma' returns no RVs, only the next question", async () => {
    const d = await call('search_rvs', { query: 'travel trailer for my family near Tacoma' });
    expect(d.status).toBe('needs_discovery');
    expect(d.results).toEqual([]);
    expect(ids(d.nextQuestions)).toEqual(['use']);
    expect(d.missingForProducts).toEqual(['use', 'activities', 'vacation', 'who_going', 'buyers', 'trade', 'towing', 'storage', 'trips', 'pay_way', 'pay_numbers']);
    expect(d.instruction).toMatch(/ASK, DON'T ASSUME/);
    expect(JSON.stringify(d)).not.toMatch(COUNT_TEXT);
    const disc = await call('outfitter_discovery', { rv_types: ['travel_trailer'], location: 'Tacoma, WA' });
    expect(disc.status).toBe('needs_discovery');
    expect(ids(disc.nextQuestions)).toEqual(['use']);
    expect(disc.nextQuestion.step).toBe('use');
  }, 60000);

  it('the couple/cash facts (and the same words as search keywords) are never asked again', async () => {
    const open = ['use', 'activities', 'vacation', 'trade', 'towing', 'storage', 'trips'];
    const disc = await call('outfitter_discovery', COUPLE_FACTS);
    const search = await call('search_rvs', { query: COUPLE_MSG });
    expect(search.knownProfile).toMatchObject({ rvTypes: ['travel_trailer'], place: 'Tacoma', sleepers: 2, paymentMethod: 'cash', cashBudgetUsd: 35000 });
    for (const d of [disc, search]) {
      expect(d.nextQuestions).toHaveLength(1);
      expect(d.nextQuestion.id).toBe('use');
      expect(d.nextQuestion.prompt).toMatch(/I ask because/);
      expect(d.missingForProducts).toEqual(open);
      expect(JSON.stringify(d.nextQuestions)).not.toMatch(/how many will|making payments, or paying cash|cash budget/i);
    }
  }, 60000);

  it('never re-asks: covered steps walk the list once, in order, then shows exactly 3', async () => {
    let args: Record<string, any> = { ...COUPLE_FACTS };
    const asked: string[] = [];
    // Fit facts the model derives from each answer; rapport answers send only the step name.
    const facts: Record<string, Record<string, unknown>> = {
      use: { use_type: ['camping'] }, activities: { desired_features: ['outdoor_kitchen'] }, vacation: {}, trade: {},
      towing: { tow_vehicle: '2021 Ford F-150 3.5L EcoBoost' }, storage: { no_length_limit: true }, trips: { four_season: false },
    };
    for (let turn = 0; turn < 12; turn++) {
      const d = await call('outfitter_discovery', args);
      if (d.readyForProducts) { expect(d.searchConstraints).toBeDefined(); break; }
      expect(d.nextQuestions).toHaveLength(1);
      const q = d.nextQuestion;
      expect(q.prompt).toMatch(/[?.]\s+I ask (?:so|because)\b/);
      expect(asked).not.toContain(q.id); asked.push(q.id);
      if (q.id === 'trade') expect(q.followUp.prompt).toMatch(/What are you trading in, and what's making you want to trade it\? I ask so/);
      args = { ...args, ...facts[q.id], covered_steps: [...args.covered_steps, q.step] };
    }
    expect(asked).toEqual(['use', 'activities', 'vacation', 'trade', 'towing', 'storage', 'trips']);
    const d = await call('search_rvs', args);
    expect(d.status).toBe('shortlist');
    expect(d.results.length).toBeLessThanOrEqual(3);
    expect(d.appliedConstraints.prefer).toContain('outdoor_kitchen');
  }, 90000);

  it('financing asks down payment, monthly payment and cash budget, one at a time', async () => {
    const base = { ...GT, location: 'Spokane, WA', party_size: 2, rv_types: ['fifth_wheel'], tow_vehicle: '2022 Ram 2500', no_length_limit: true, payment_method: 'finance' };
    const d = await call('search_rvs', base);
    expect(d.status).toBe('needs_discovery');
    expect(ids(d.nextQuestions)).toEqual(['fin_down']);
    expect(d.missingForProducts).toEqual(['fin_down', 'fin_monthly', 'fin_cash']);
    const partial = await call('outfitter_discovery', { ...base, down_payment_usd: 8000 });
    expect(ids(partial.nextQuestions)).toEqual(['fin_monthly']);
    const partial2 = await call('outfitter_discovery', { ...base, down_payment_usd: 8000, monthly_payment_usd: 600 });
    expect(ids(partial2.nextQuestions)).toEqual(['fin_cash']);
    expect(partial2.nextQuestion.prompt).toMatch(/out of pocket/);
    const done = await call('search_rvs', { ...base, down_payment_usd: 8000, monthly_payment_usd: 600, budget_max_usd: 10000 });
    expect(done.status).toBe('shortlist');
    expect(done.appliedConstraints.priceMaxUsd).toBe(Math.round(8000 + 600 * 111.4));
  }, 60000);

  it('the guessed ChatGPT call (sleeps 4 + price, nothing else) is still gated', async () => {
    const d = await call('search_rvs', { location: 'Tacoma, WA', radius_miles: 75, sleeps_min: 4, price_max_usd: 35000, rv_types: ['travel_trailer'], condition: 'any' });
    expect(d.status).toBe('needs_discovery');
    expect(d.results).toEqual([]);
    expect(ids(d.nextQuestions)).toEqual(['use']);
  }, 60000);

  it("only an explicit skip in the shopper's words bypasses; named models do not", async () => {
    const rejected = await call('search_rvs', { query: 'travel trailer near Tacoma', shopper_requested_results_now: true, shopper_words: 'I want a travel trailer for my family' });
    expect(rejected.status).toBe('needs_discovery');
    expect(rejected.waiverRejected).toMatch(/shopper_words/);
    const legacy = await call('search_rvs', { query: 'travel trailer near Tacoma', constraints: { sherpa: { discoveryWaived: true } } });
    expect(legacy.status).toBe('needs_discovery');
    const model = await call('search_rvs', { make: 'Tiffin', model: 'Allegro RED', location: 'Tacoma, WA', radius_miles: 150, party_size: 2, payment_method: 'cash', declined_questions: ['payment'] });
    expect(model.status).toBe('needs_discovery');
    expect(ids(model.nextQuestions)).toEqual(['use']);
    const skip = await call('search_rvs', { query: 'travel trailer near Tacoma', shopper_requested_results_now: true, shopper_words: 'Skip the questions, just show me what you have' });
    expect(skip.status).toBe('shortlist');
    expect(skip.results.length).toBeGreaterThan(0);
    expect(skip.results.length).toBeLessThanOrEqual(3);
    expect(skip.roadToSale.waived).toBe(true);
    expect(ids(skip.roadToSale.resumeQuestions)).toEqual(['use']);
  }, 90000);

  it('a comparison question is answered directly, no interview first', async () => {
    const disc = await call('outfitter_discovery', { request_kind: 'general_question' });
    expect(disc.route).toBe('education');
    expect(disc.status).toBe('answer_directly');
    expect(disc.nextQuestions).toEqual([]);
    expect(disc.guidance).toMatch(/Answer it directly/);
    const hi = await call('outfitter_discovery', { request_kind: 'greeting' });
    expect(hi.route).toBe('welcome');
    expect(hi.welcome).toMatch(/\S/);
  }, 60000);

  it('complete answers return a shortlist of exactly 3 model lines, with no match count in what the model sees', async () => {
    const { r, d } = await callRaw('search_rvs', COMPLETE);
    expect(d.status).toBe('shortlist');
    expect(d.results).toHaveLength(3);
    expect(d.shortlist.size).toBe(3);
    expect(d.funnel).toBeUndefined();
    expect(d.coverage.units_in_area).toBeUndefined();
    expect(d.coverage.nationwide_total).toBeUndefined();
    const text = r.content.map((c: any) => c.text).join(' ');
    expect(text).not.toMatch(COUNT_TEXT);
    expect(text).not.toMatch(/verifiedMatches|units_in_area|nationwide_total|makeModelSummary|modelCount/);
    expect(typeof r._meta['matchrv/internal'].funnel.verifiedMatches).toBe('number');
    for (const row of d.results) expect(row.towFit).toMatch(/verify tow fit/);
    const lines = d.results.map((x: any) => x.title.toLowerCase().replace(/^(19|20)\d\d\s+/, '').split(/\s+/).slice(0, -1).join(' '));
    expect(new Set(lines).size).toBe(3);
    const more = await call('search_rvs', { ...COMPLETE, limit: 6 });
    expect(more.results.length).toBeLessThanOrEqual(6);
    expect(more.results.length).toBeGreaterThan(3);
  }, 60000);

  it('respects a stated length limit and a stated tow vehicle', async () => {
    const d = await call('search_rvs', { ...COMPLETE, no_length_limit: undefined, length_max_ft: 26, length_reason: 'storage', tow_vehicle: '2021 Ford F-150 3.5L EcoBoost' });
    expect(d.status).toBe('shortlist');
    expect(d.appliedConstraints.lengthMaxFt).toBe(26);
    for (const row of d.results) if (row.lengthFt != null) expect(row.lengthFt).toBeLessThanOrEqual(26);
  }, 60000);

  it('a named make/model with every step covered lists only that series', async () => {
    const d = await call('search_rvs', { ...GT, towed_vehicle: 'nothing', no_length_limit: true, make: 'Tiffin', model: 'Allegro RED', location: 'Tacoma, WA', radius_miles: 150, party_size: 2, payment_method: 'cash', declined_questions: ['payment'] });
    expect(d.status).toBe('shortlist');
    expect(d.results.length).toBeGreaterThan(0);
    expect(d.results.length).toBeLessThanOrEqual(3);
    for (const row of d.results) expect(row.series).toBe('Allegro RED');
  }, 60000);

  it('server instructions carry the interview; tools list has 11 tools; questions never say its name', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'gate-test', version: '1' } });
    expect(init.serverInfo.version).toBe('2.2.6');
    expect(init.instructions).toMatch(/ASK, DON'T ASSUME/);
    expect(init.instructions).toMatch(/Golden Ticket \(internal name; never say/);
    expect(init.instructions).toMatch(/How much time do you get off each year|vacation: how much time off/);
    const list = await rpc('tools/list');
    expect(list.tools).toHaveLength(11);
    expect(list.tools.map((t: any) => t.name)).not.toContain('rv_outfitter');
    const search = list.tools.find((t: any) => t.name === 'search_rvs');
    expect(search.description).toMatch(/ASK, DON'T ASSUME/);
    const props = Object.keys(search.inputSchema.properties);
    expect(props).toEqual(expect.arrayContaining(['party_size', 'tow_vehicle', 'towed_vehicle', 'length_max_ft', 'no_length_limit', 'payment_method', 'use_type', 'desired_features', 'covered_steps', 'declined_questions', 'budget_max_usd', 'shopper_requested_results_now', 'shopper_words']));
    for (const gone of ['discovery_waived', 'force_search', 'time_off', 'co_buyer_involved', 'owners', 'has_trade_in', 'trade_description', 'trade_reason', 'planned_trips', 'party_notes', 'activities', 'message']) expect(props).not.toContain(gone);
    expect(search.inputSchema.properties.limit.default).toBe(3);
    const d = await call('search_rvs', { query: 'travel trailer' });
    expect(JSON.stringify(d.nextQuestions)).not.toMatch(/golden/i);
    expect(PRODUCT_SELECTION).toContain(d.nextQuestions[0].id);
  });
});

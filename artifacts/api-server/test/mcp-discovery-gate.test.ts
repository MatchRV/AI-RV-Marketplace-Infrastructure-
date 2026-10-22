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
// The rest of the Golden Ticket, answered.
const GT = { planned_use: ['camping'], activities: ['hiking', 'grilling outside'], time_off: '3 weeks a year', co_buyer_involved: true, owners: 'me and my wife', has_trade_in: false, planned_trips: 'Mt. Rainier this summer' };
const COMPLETE = { ...GT, query: 'travel trailer', location: 'Tacoma, WA', radius_miles: 75, party_size: 4, tow_vehicle: 'none yet', no_length_limit: true, payment_method: 'cash', out_the_door_budget_usd: 40000, rv_types: ['travel_trailer'] };
const PRODUCT_SELECTION = ['rv_type', 'use', 'activities', 'vacation', 'who_going', 'buyers', 'trade', 'trade_details', 'towing', 'storage', 'length_reason', 'length_flex', 'trips', 'location', 'pay_way', 'fin_down', 'fin_monthly', 'fin_cash', 'pay_numbers'];

describe('MCP 2.2.3 Golden Ticket gate + shortlist', () => {
  it("vague 'travel trailer for my family near Tacoma' returns no RVs, only the next questions in order", async () => {
    const msg = 'I want a travel trailer for my family near Tacoma';
    const d = await call('search_rvs', { query: msg });
    expect(d.status).toBe('needs_discovery');
    expect(d.results).toEqual([]);
    expect(ids(d.nextQuestions)).toEqual(['use', 'activities', 'vacation']);
    expect(d.missingForProducts).toEqual(['use', 'activities', 'vacation', 'who_going', 'buyers', 'trade', 'towing', 'storage', 'trips', 'pay_way', 'pay_numbers']);
    expect(d.instruction).toMatch(/ASK, DON'T ASSUME/);
    expect(JSON.stringify(d)).not.toMatch(COUNT_TEXT);
    const rv = await call('rv_outfitter', { message: msg });
    expect(rv.status).toBe('needs_discovery');
    expect(rv.results).toEqual([]);
    expect(ids(rv.nextQuestions)).toEqual(['use', 'activities', 'vacation']);
    const disc = await call('outfitter_discovery', { message: msg });
    expect(disc.status).toBe('needs_discovery');
    expect(ids(disc.nextQuestions)).toEqual(['use', 'activities', 'vacation']);
  }, 60000);

  it('the couple/cash message is read in all three tools, and none of it is asked again', async () => {
    const answered = ['rv_type', 'who_going', 'buyers', 'location', 'pay_way', 'pay_numbers'];
    const open = ['use', 'activities', 'vacation', 'trade', 'towing', 'storage', 'trips'];
    const rv = await call('rv_outfitter', { message: COUPLE_MSG });
    expect(rv.extractedProfile).toMatchObject({ rvTypes: ['travel_trailer'], place: 'Tacoma', sleepers: 2, paymentMethod: 'cash', cashBudgetUsd: 35000, coBuyerInvolved: true });
    expect(rv.summary).toMatch(/type: travel trailer.*sleeps 2.*area: Tacoma.*paying: cash.*budget ≤ \$35,000/);
    const disc = await call('outfitter_discovery', { message: COUPLE_MSG });
    expect(disc.profile).toMatchObject({ rvTypes: ['travel_trailer'], place: 'Tacoma', sleepers: 2, paymentMethod: 'cash', cashBudgetUsd: 35000, outTheDoorBudgetUsd: 35000, coBuyerInvolved: true });
    const search = await call('search_rvs', { query: COUPLE_MSG });
    expect(search.knownProfile).toMatchObject({ rvTypes: ['travel_trailer'], place: 'Tacoma', sleepers: 2, paymentMethod: 'cash', cashBudgetUsd: 35000 });
    for (const d of [rv, disc, search]) {
      expect(d.missingForProducts).toEqual(open);
      expect(ids(d.nextQuestions)).toEqual(['use', 'activities', 'vacation']);
      for (const id of answered) expect(d.missingForProducts).not.toContain(id);
      expect(JSON.stringify(d.nextQuestions)).not.toMatch(/how many will|making payments, or paying cash|cash budget/i);
    }
  }, 60000);

  it('never re-asks: answering turn by turn walks the list once, in order, then shows exactly 3', async () => {
    let profile: Record<string, unknown> = { message: COUPLE_MSG };
    const asked: string[] = [];
    const answers: Record<string, Record<string, unknown>> = {
      use: { planned_use: ['camping'] }, activities: { activities: ['fishing'] }, vacation: { time_off: 'about 4 weeks' },
      trade: { has_trade_in: false }, towing: { tow_vehicle: '2021 Ford F-150 3.5L EcoBoost' }, storage: { no_length_limit: true }, trips: { planned_trips: 'Ocean Shores' },
    };
    for (let turn = 0; turn < 6; turn++) {
      const d = await call('outfitter_discovery', profile);
      if (d.readyForProducts) break;
      for (const q of d.nextQuestions) { expect(asked).not.toContain(q.id); asked.push(q.id); profile = { ...profile, ...answers[q.id] }; }
    }
    expect(asked).toEqual(['use', 'activities', 'vacation', 'trade', 'towing', 'storage', 'trips']);
    const { message: _m, ...rest } = profile as any;
    const d = await call('search_rvs', { ...rest, query: COUPLE_MSG });
    expect(d.status).toBe('shortlist');
    expect(d.results.length).toBeLessThanOrEqual(3);
  }, 90000);

  it('financing asks down payment, monthly payment and cash budget, and only what is still missing', async () => {
    const base = { ...GT, location: 'Spokane, WA', party_size: 2, rv_types: ['fifth_wheel'], tow_vehicle: '2022 Ram 2500', no_length_limit: true, payment_method: 'finance' };
    const d = await call('search_rvs', base);
    expect(d.status).toBe('needs_discovery');
    expect(ids(d.nextQuestions)).toEqual(['fin_down', 'fin_monthly', 'fin_cash']);
    const partial = await call('outfitter_discovery', { ...base, location: 'Spokane', message: 'We can put $8,000 down.' });
    expect(ids(partial.nextQuestions)).toEqual(['fin_monthly', 'fin_cash']);
    const done = await call('search_rvs', { ...base, down_payment_usd: 8000, monthly_payment_usd: 600, cash_budget_usd: 10000 });
    expect(done.status).toBe('shortlist');
    expect(done.appliedConstraints.priceMaxUsd).toBe(Math.round(8000 + 600 * 111.4));
  }, 60000);

  it('the guessed ChatGPT call (sleeps 4 + price, nothing else) is still gated', async () => {
    const d = await call('search_rvs', { location: 'Tacoma, WA', radius_miles: 75, sleeps_min: 4, price_max_usd: 35000, rv_types: ['travel_trailer'], condition: 'any' });
    expect(d.status).toBe('needs_discovery');
    expect(d.results).toEqual([]);
    expect(ids(d.nextQuestions)).toEqual(['use', 'activities', 'vacation']);
  }, 60000);

  it('only an explicit skip in the shopper\'s words bypasses; host flags and named models do not', async () => {
    const rejected = await call('search_rvs', { query: 'travel trailer near Tacoma', shopper_requested_results_now: true, shopper_words: 'I want a travel trailer for my family' });
    expect(rejected.status).toBe('needs_discovery');
    expect(rejected.waiverRejected).toMatch(/shopper_words/);
    const legacy = await call('search_rvs', { query: 'travel trailer near Tacoma', discovery_waived: true, force_search: true, constraints: { sherpa: { discoveryWaived: true } } });
    expect(legacy.status).toBe('needs_discovery');
    expect(legacy.results).toEqual([]);
    // A named model with party, area and payment known is still asked the rest.
    const model = await call('search_rvs', { make: 'Tiffin', model: 'Allegro RED', location: 'Tacoma, WA', radius_miles: 150, party_size: 2, payment_method: 'cash', budget_declined: true });
    expect(model.status).toBe('needs_discovery');
    expect(model.results).toEqual([]);
    expect(ids(model.nextQuestions)).toEqual(['use', 'activities', 'vacation']);
    // The shopper's own "skip the questions" shows a shortlist, then the questions resume.
    const skip = await call('search_rvs', { query: 'travel trailer near Tacoma', shopper_requested_results_now: true, shopper_words: 'Skip the questions, just show me what you have' });
    expect(skip.status).toBe('shortlist');
    expect(skip.results.length).toBeGreaterThan(0);
    expect(skip.results.length).toBeLessThanOrEqual(3);
    expect(skip.roadToSale.waived).toBe(true);
    expect(ids(skip.roadToSale.resumeQuestions)).toEqual(['use', 'activities', 'vacation']);
    const discSkip = await call('outfitter_discovery', { message: 'just show me', shopper_requested_results_now: true, shopper_words: 'just show me', rv_types: ['travel_trailer'] });
    expect(discSkip.readyForProducts).toBe(true);
  }, 90000);

  it("a comparison question ('whats better a motorhome or a 5th wheel') is answered directly, no gate", async () => {
    for (const message of ['whats better a motorhome or a 5th wheel', "What's better, a motorhome or a fifth wheel?"]) {
      const disc = await call('outfitter_discovery', { message });
      expect(disc.route).toBe('education');
      expect(disc.status).toBe('answer_directly');
      expect(disc.nextQuestions).toEqual([]);
      expect(disc.guidance).toMatch(/Answer it directly/);
      const rv = await call('rv_outfitter', { message });
      expect(rv.status).toBe('answer_directly');
      expect(rv.nextQuestions).toEqual([]);
    }
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
    const confirmed = d.results.map((x: any) => x.sleepsConfirmed);
    expect(confirmed).toEqual([...confirmed].sort((a: boolean, b: boolean) => Number(b) - Number(a)));
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
    for (const row of d.results) {
      if (row.lengthFt != null) expect(row.lengthFt).toBeLessThanOrEqual(26);
      expect(row.towFit).toBeDefined();
    }
  }, 60000);

  it('a named make/model with every answer lists only that series', async () => {
    const d = await call('search_rvs', { ...GT, towing_behind: 'nothing', no_length_limit: true, make: 'Tiffin', model: 'Allegro RED', location: 'Tacoma, WA', radius_miles: 150, party_size: 2, payment_method: 'cash', budget_declined: true });
    expect(d.status).toBe('shortlist');
    expect(d.results.length).toBeGreaterThan(0);
    expect(d.results.length).toBeLessThanOrEqual(3);
    for (const row of d.results) expect(row.series).toBe('Allegro RED');
  }, 60000);

  it('tool descriptions and server instructions carry the Golden Ticket; questions never say its name', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'gate-test', version: '1' } });
    expect(init.serverInfo.version).toBe('2.2.3');
    expect(init.instructions).toMatch(/ASK, DON'T ASSUME/);
    expect(init.instructions).toMatch(/Golden Ticket \(internal name; never say/);
    expect(init.instructions).not.toMatch(/share that count/);
    const list = await rpc('tools/list');
    expect(list.tools).toHaveLength(12);
    const search = list.tools.find((t: any) => t.name === 'search_rvs');
    expect(search.description).toMatch(/ASK, DON'T ASSUME/);
    expect(search.description).not.toMatch(/modelCount/);
    const props = Object.keys(search.inputSchema.properties);
    expect(props).toEqual(expect.arrayContaining(['party_size', 'tow_vehicle', 'towing_behind', 'length_max_ft', 'no_length_limit', 'payment_method', 'planned_use', 'activities', 'time_off', 'co_buyer_involved', 'has_trade_in', 'trade_reason', 'storage', 'planned_trips', 'cash_budget_usd', 'shopper_requested_results_now', 'shopper_words']));
    expect(props).not.toContain('discovery_waived');
    expect(props).not.toContain('force_search');
    expect(search.inputSchema.properties.limit.default).toBe(3);
    const d = await call('search_rvs', { query: 'travel trailer' });
    expect(JSON.stringify(d.nextQuestions)).not.toMatch(/golden/i);
    expect(PRODUCT_SELECTION).toContain(d.nextQuestions[0].id);
  });
});

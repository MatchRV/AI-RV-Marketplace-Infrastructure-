import { describe, it, expect } from 'vitest';
import { matchRvMcpHandler } from '../src/mcp';

async function rpc(method: string, params: unknown = {}) {
  const response = await matchRvMcpHandler.fetch(new Request('http://localhost/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  const raw = await response.text();
  const message = JSON.parse(raw.startsWith('event:') || raw.startsWith('data:') ? raw.split('\n').find(l => l.startsWith('data:'))!.slice(5) : raw);
  expect(message.error).toBeUndefined();
  return message.result;
}
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await rpc('tools/call', { name, arguments: args });
  expect(r.isError).not.toBe(true);
  return JSON.parse(r.content.find((c: any) => c.type === 'text').text);
};
const SENSITIVE = /^(?:.*name|email|phone|address|income|salary|credit.*|ssn|dob|birth.*|licensing_state|trade_payoff_usd|trade_value.*)$/i;
const COUPLE_MSG = "We're a couple, just the two of us. Looking for a travel trailer around Tacoma. Cash budget is $35k out the door.";

describe('MCP 2.2.4: interview tools state their purpose (OpenAI scan)', () => {
  it('outfitter_discovery, rv_outfitter and search_rvs explain every input as an RV-fit factor, all optional, nothing sensitive', async () => {
    const { tools } = await rpc('tools/list');
    expect(tools).toHaveLength(12);
    for (const name of ['outfitter_discovery', 'rv_outfitter', 'search_rvs']) {
      const t = tools.find((x: any) => x.name === name);
      expect(t.description).toMatch(/never asks for names, contact details, income,? (?:or )?credit/i);
      expect(t.description).toMatch(/decline any question/i);
      const props = t.inputSchema.properties as Record<string, any>;
      for (const [k, v] of Object.entries(props)) {
        expect(k).not.toMatch(SENSITIVE);
        expect(typeof v.description, `${name}.${k} has a description`).toBe('string');
      }
      expect(t.inputSchema.required ?? []).toEqual(name === 'rv_outfitter' ? ['message'] : []);
    }
    const d = tools.find((x: any) => x.name === 'outfitter_discovery');
    expect(d.title).toBe('RV fit interview: next question to find the right RV');
    expect(d.description).toMatch(/^Runs MatchRV's guided RV-fit interview/);
    expect(d.description).toMatch(/Every input is optional/);
    expect(d.description).toMatch(/Nothing is shared with a dealer unless the shopper explicitly asks and approves/);
    for (const phrase of [/outdoor kitchen/, /size and comfort tier/, /sleeping capacity/, /dealer handoff/, /never trade values/, /safe weight limits/, /length it must fit/, /off-grid and weather/, /the budget/]) expect(d.description).toMatch(phrase);
    const p = d.inputSchema.properties;
    expect(p.activities.description).toMatch(/outdoor kitchen/);
    expect(p.time_off.description).toMatch(/size and comfort tier/);
    expect(p.party_size.description).toMatch(/sleeping capacity/);
    expect(p.owners.description).toMatch(/dealer handoff/);
    expect(p.trade_description.description).toMatch(/Never pass trade values/);
    expect(p.tow_vehicle.description).toMatch(/safe weight limit/);
    expect(p.storage.description).toMatch(/length it must fit/);
    expect(p.planned_trips.description).toMatch(/off-grid/);
    expect(p.payment_method.description).toMatch(/budget/);
    expect(p.declined_questions.items.enum).toContain('vacation');
  });

  it('a shopper can decline any question; it is never asked again, still one question per turn', async () => {
    const base = { rv_types: ['travel_trailer'], location: 'Tacoma, WA', party_size: 2, co_buyer_involved: true, payment_method: 'cash', cash_budget_usd: 35000 };
    let profile: Record<string, unknown> = { ...base, planned_use: ['camping'], activities: ['hiking'] };
    const first = await call('outfitter_discovery', profile);
    expect(first.nextQuestions.map((q: any) => q.id)).toEqual(['vacation']);
    profile = { ...profile, declined_questions: ['vacation'] };
    const next = await call('outfitter_discovery', profile);
    expect(next.nextQuestions.map((q: any) => q.id)).toEqual(['trade']);
    expect(next.missingForProducts).not.toContain('vacation');
    // Declining who's going and the payment question still lets the shortlist happen.
    const all = { rv_types: ['travel_trailer'], location: 'Tacoma, WA', planned_use: ['camping'], activities: ['hiking'], time_off: '3 weeks', co_buyer_involved: false, has_trade_in: false, tow_vehicle: 'none yet', no_length_limit: true, planned_trips: 'nothing yet', declined_questions: ['who_going', 'pay_way'] };
    const ready = await call('outfitter_discovery', all);
    expect(ready.readyForProducts).toBe(true);
    const s = await call('search_rvs', all);
    expect(s.status).toBe('shortlist');
    expect(s.results.length).toBeLessThanOrEqual(3);
  }, 60000);

  it('the couple/cash message still gets exactly one question (use)', async () => {
    const d = await call('outfitter_discovery', { message: COUPLE_MSG });
    expect(d.nextQuestions.map((q: any) => q.id)).toEqual(['use']);
  }, 60000);
});

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
const SENSITIVE = /name$|email|phone|address|income|salary|credit|ssn|dob|birth|licensing|payoff|trade_|time_off|vacation|owners|co_buyer|planned_trips|party_notes|^message$|^activities$/i;
const COUPLE_FACTS = { rv_types: ['travel_trailer'], location: 'Tacoma, WA', party_size: 2, covered_steps: ['buyers'], payment_method: 'cash', budget_max_usd: 35000 };

describe('MCP 2.2.5: interview tools take only RV-fit facts (OpenAI scan)', () => {
  it('outfitter_discovery and search_rvs: every input is an RV-fit fact or a step name, described, optional', async () => {
    const { tools } = await rpc('tools/list');
    expect(tools).toHaveLength(11);
    expect(tools.map((t: any) => t.name)).not.toContain('rv_outfitter');
    for (const name of ['outfitter_discovery', 'search_rvs']) {
      const t = tools.find((x: any) => x.name === name);
      expect(t.description).toMatch(/never asks for names, contact details, income,? (?:or )?credit/i);
      expect(t.description).toMatch(/stores nothing/);
      expect(t.description).toMatch(/contacts no one/);
      const props = t.inputSchema.properties as Record<string, any>;
      for (const [k, v] of Object.entries(props)) {
        expect(k, `${name}.${k} is not a rapport/personal field`).not.toMatch(SENSITIVE);
        expect(typeof v.description, `${name}.${k} has a description`).toBe('string');
      }
      expect(t.inputSchema.required ?? []).toEqual([]);
      expect(props.covered_steps.items.enum).toEqual(['rv_type', 'use', 'activities', 'vacation', 'who_going', 'buyers', 'trade', 'towing', 'storage', 'trips', 'area', 'payment']);
      expect(props.declined_questions.items.enum).toEqual(props.covered_steps.items.enum);
      expect(props.desired_features.items.enum).toContain('outdoor_kitchen');
      expect(props.payment_method.enum).toEqual(['cash', 'finance']);
    }
    const d = tools.find((x: any) => x.name === 'outfitter_discovery');
    expect(d.title).toBe('RV fit interview: next question and search constraints');
    expect(d.description).toMatch(/^Returns the next question in MatchRV's guided RV-fit interview and, once enough fit facts are known, the search constraints for search_rvs\./);
    expect(d.description).toMatch(/their answers are never sent to MatchRV/);
    expect(Object.keys(d.inputSchema.properties)).toContain('request_kind');
  });

  it('a shopper can decline any step; it is never asked again, still one question per turn', async () => {
    const base = { ...COUPLE_FACTS, use_type: ['camping'], covered_steps: ['buyers', 'activities'] };
    const first = await call('outfitter_discovery', base);
    expect(first.nextQuestions.map((q: any) => q.id)).toEqual(['vacation']);
    const next = await call('outfitter_discovery', { ...base, declined_questions: ['vacation'] });
    expect(next.nextQuestions.map((q: any) => q.id)).toEqual(['trade']);
    expect(next.missingForProducts).not.toContain('vacation');
    const all = { rv_types: ['travel_trailer'], location: 'Tacoma, WA', use_type: ['camping'], tow_vehicle: 'none yet', no_length_limit: true, covered_steps: ['activities', 'vacation', 'buyers', 'trade', 'trips'], declined_questions: ['who_going', 'payment'] };
    const ready = await call('outfitter_discovery', all);
    expect(ready.readyForProducts).toBe(true);
    const s = await call('search_rvs', all);
    expect(s.status).toBe('shortlist');
    expect(s.results.length).toBeLessThanOrEqual(3);
  }, 60000);

  it('the couple/cash facts still get exactly one question (use); stray rapport answers are ignored, not used', async () => {
    const d = await call('outfitter_discovery', COUPLE_FACTS);
    expect(d.nextQuestions.map((q: any) => q.id)).toEqual(['use']);
    expect(d.nextQuestion.step).toBe('use');
    const stray = await call('outfitter_discovery', { ...COUPLE_FACTS, use_type: ['camping'], covered_steps: ['buyers', 'activities'], time_off: '3 weeks', message: 'we get 3 weeks off' });
    expect(stray.nextQuestions.map((q: any) => q.id)).toEqual(['vacation']);
    expect(JSON.stringify(stray)).not.toMatch(/3 weeks/);
  }, 60000);
});

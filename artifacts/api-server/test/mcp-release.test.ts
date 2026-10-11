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
    const result = await rpc('tools/call', { name: 'search_rvs', arguments: { location: 'Texas', constraints: { rvTypes: ['travel_trailer'], mustHave: ['bunkhouse'], lengthMaxFt: 30, priceMinUsd: 35000, priceMaxUsd: 45000 } } });
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content.find((c: any) => c.type === 'text').text);
    expect(data.appliedConstraints).toMatchObject({ lengthMaxFt: 30, priceMinUsd: 35000, priceMaxUsd: 45000, mustHave: ['bunkhouse'] });
    expect(data.funnel.verifiedMatches).toBe(0);
  }, 20000);
  it('returns an explicit missing-record error', async () => {
    const result = await rpc('tools/call', { name: 'get_rv', arguments: { unit_id: 'test:does-not-exist' } });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toBe('unit_not_found');
  });
});

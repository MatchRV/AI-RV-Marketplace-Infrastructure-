import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import app from '../src/app';
import { MCP_TOOL_DOCS, MCP_DOCS_ORDER } from '../src/lib/mcp-docs';

const TOOLS = ['teach_outfitter', 'outfitter_memory', 'outfitter_discovery', 'outfitter_guide', 'search_rvs', 'get_rv', 'compare_rvs', 'evaluate_tow_fit', 'prepare_dealer_inquiry', 'send_dealer_inquiry', 'get_dealer_inquiry_status'];
let server: Server; let base = '';
beforeAll(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const mcp = (method: string, params: unknown = {}) => fetch(`${base}/mcp`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
});
const parse = (raw: string) => JSON.parse(raw.split('\n').find((l) => l.startsWith('data:'))?.slice(5) ?? raw);

describe('public MCP docs page (/mcp-docs)', () => {
  it('returns 200 static HTML with every live tool, classes, consent and data handling, and no JS', async () => {
    const res = await fetch(`${base}/mcp-docs`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toMatch(/^<!doctype html>/i);
    for (const name of TOOLS) {
      expect(html).toContain(`id="${name}"`);
      expect(html).toContain(`<code>${name}</code>`);
    }
    expect(html).toContain('https://matchrv.com/mcp');
    expect(html).toMatch(/Streamable HTTP/);
    expect(html).toMatch(/Authentication:<\/strong> none/);
    expect(html).toContain('/matchrv-logo.png');
    for (const id of ['overview', 'endpoint', 'tools', 'consent', 'data', 'support']) expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(/send_dealer_inquiry<\/code> is a <strong>sensitive write/);
    expect(html).toMatch(/never ask for names, contact details, income or credit/);
    expect(html).toMatch(/their answers are never sent to MatchRV/);
    for (const href of ['/privacy', '/terms', '/contact']) expect(html).toContain(`href="${href}"`);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/golden ticket/i);
    // No inventory counts.
    expect(html).not.toMatch(/\b\d{1,3}(,\d{3})+\s+(units|rvs|listings|matches)\b|\b\d{3,}\s+(units|rvs|listings|dealers)\b/i);
    expect((await fetch(`${base}/mcp-docs/`)).status).toBe(200);
  });

  it('documents every tool the live registry serves, in the curated order', async () => {
    const list = parse(await (await mcp('tools/list')).text()).result.tools.map((t: any) => t.name).sort();
    expect(list).toEqual([...TOOLS].sort());
    expect(Object.keys(MCP_TOOL_DOCS).sort()).toEqual(list);
    expect([...MCP_DOCS_ORDER].sort()).toEqual(list);
    expect(MCP_TOOL_DOCS.send_dealer_inquiry.cls).toBe('Sensitive write');
    expect(MCP_TOOL_DOCS.teach_outfitter.cls).toBe('Write');
    expect(Object.entries(MCP_TOOL_DOCS).filter(([, d]) => d.cls === 'Read').map(([n]) => n).length).toBe(9);
  });

  it('/mcp itself is unaffected', async () => {
    const init = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'docs-test', version: '1' } });
    expect(init.status).toBe(200);
    const body = parse(await init.text());
    expect(body.result.serverInfo).toMatchObject({ name: 'matchrv', version: '2.2.5' });
    const list = parse(await (await mcp('tools/list')).text());
    expect(list.result.tools).toHaveLength(11);
    const get = await fetch(`${base}/mcp`, { headers: { Accept: 'text/html' } });
    expect(get.headers.get('content-type') ?? '').not.toMatch(/text\/html/);
  });
});

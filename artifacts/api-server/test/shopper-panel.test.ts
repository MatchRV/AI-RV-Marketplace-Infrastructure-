import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { SHOPPER_HTML } from '../src/ui/shopper';

// Minimal DOM stand-in: enough for the panel script to run under node:vm.
class FakeEl {
  children: FakeEl[] = [];
  text = '';
  className = '';
  hidden = false;
  disabled = false;
  value = '';
  [key: string]: unknown;
  constructor(public tag = 'div') {}
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(' '); }
  set textContent(v: string) { this.text = String(v); this.children = []; }
  append(...nodes: FakeEl[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeEl[]) { this.children = [...nodes]; }
}

const GUIDANCE = 'No RVs were returned on purpose. Ask nextQuestion (exactly one question) then STOP.';
const INSTRUCTION = "ASK, DON'T ASSUME. MatchRV returned no RVs because questions are still open.";
const PROMPT = 'What do you plan on using it for: living in it, camping, tailgating, or traveling?';
const needsDiscovery = {
  status: 'needs_discovery',
  results: [],
  instruction: INSTRUCTION,
  guidance: GUIDANCE,
  knownSummary: ['type: travel trailer'],
  nextQuestion: { id: 'use', prompt: PROMPT },
};

function loadPanel() {
  const script = SHOPPER_HTML.slice(SHOPPER_HTML.indexOf('<script>') + 8, SHOPPER_HTML.lastIndexOf('</script>'));
  const byId = new Map<string, FakeEl>();
  const listeners: ((e: unknown) => void)[] = [];
  const sent: any[] = [];
  const parent = { postMessage: (m: unknown) => sent.push(m) };
  const document = {
    getElementById: (id: string) => { if (!byId.has(id)) byId.set(id, new FakeEl()); return byId.get(id)!; },
    createElement: (tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => { const n = new FakeEl('#text'); n.textContent = t; return n; },
  };
  const window = { parent, addEventListener: (_: string, fn: (e: unknown) => void) => listeners.push(fn) };
  vm.runInNewContext(script, { document, window, setTimeout, clearTimeout, Intl, JSON, Number, String, Set, Map, Promise, Error });
  const deliver = (data: unknown) => listeners.forEach((fn) => fn({ source: parent, data }));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const get = (id: string) => document.getElementById(id);
  return { get, sent, deliver, tick };
}

describe('ChatGPT shopper panel (ui://matchrv/shopper-v1.html)', () => {
  it('no longer sends the removed discovery_waived flag', () => {
    expect(SHOPPER_HTML).not.toContain('discovery_waived');
  });

  it('form search sends only filters, then shows the next question and keeps the form', async () => {
    const p = loadPanel();
    const init = p.sent.find((m) => m.method === 'ui/initialize');
    p.deliver({ jsonrpc: '2.0', id: init.id, result: {} });
    await p.tick();

    p.get('rv-type')!.value = 'travel_trailer';
    p.get('place')!.value = 'Tacoma, WA';
    p.get('price')!.value = '40000';
    (p.get('search')!.onsubmit as (e: unknown) => void)({ preventDefault() {} });
    const call = p.sent.find((m) => m.method === 'tools/call');
    expect(call.params.name).toBe('search_rvs');
    expect(Object.keys(call.params.arguments).sort()).toEqual(['constraints', 'limit']);
    expect(call.params.arguments.constraints).toMatchObject({ rvTypes: ['travel_trailer'], priceMaxUsd: 40000, location: { place: 'Tacoma, WA' } });

    p.deliver({ jsonrpc: '2.0', id: call.id, result: { structuredContent: needsDiscovery } });
    await p.tick();

    const shown = p.get('content')!.textContent + ' ' + p.get('status')!.textContent;
    expect(shown).toContain(PROMPT);
    expect(shown).toMatch(/answer in the chat/i);
    expect(shown).not.toContain(GUIDANCE);
    expect(shown).not.toContain(INSTRUCTION);
    expect(shown).not.toMatch(/best fits? shown/);
    // Filters the shopper typed are not wiped.
    expect(p.get('rv-type')!.value).toBe('travel_trailer');
    expect(p.get('place')!.value).toBe('Tacoma, WA');
    expect(p.get('price')!.value).toBe('40000');
  });

  it('a needs_discovery tool result pushed by the host renders the question, not model guidance', async () => {
    const p = loadPanel();
    p.deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: needsDiscovery } });
    await p.tick();
    const shown = p.get('content')!.textContent;
    expect(shown).toContain(PROMPT);
    expect(shown).not.toContain(GUIDANCE);
    expect(shown).not.toContain(INSTRUCTION);
  });
});

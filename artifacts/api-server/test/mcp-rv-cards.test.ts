import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchRvMcpHandler } from "../src/mcp";
import { CARDS_META_KEY } from "../src/lib/rv-cards";
import { RV_CARDS_HTML, RV_CARDS_URI } from "../src/ui/rv-cards";
import { SHOPPER_HTML, SHOPPER_URI } from "../src/ui/shopper";

async function rpc(method: string, params: unknown = {}) {
  const response = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  expect(response.status).toBe(200);
  const raw = await response.text();
  const message = JSON.parse(raw.startsWith("event:") || raw.startsWith("data:") ? raw.split("\n").find((l) => l.startsWith("data:"))!.slice(5) : raw);
  expect(message.error).toBeUndefined();
  return message.result;
}

/** tools/list as it was before RV cards (v2.2.7, d239429). */
const before = JSON.parse(readFileSync(new URL("./fixtures/mcp-tools-pre-rvcards.json", import.meta.url), "utf8")) as Array<Record<string, any>>;
const textOf = (result: any) => JSON.parse(result.content.find((c: any) => c.type === "text").text);
const JUST_SHOW = { shopper_requested_results_now: true, shopper_words: "just show me" };

describe("RV cards on /mcp: backward compatibility", () => {
  it("lists every prior tool with unchanged name, title, description, input schema and annotations", async () => {
    const { tools } = await rpc("tools/list");
    const now = new Map(tools.map((t: any) => [t.name, t]));
    expect([...now.keys()].sort()).toEqual(before.map((t) => t.name));
    for (const prev of before) {
      const live = now.get(prev.name) as any;
      expect(live.title).toBe(prev.title);
      expect(live.description).toBe(prev.description);
      expect(live.inputSchema).toEqual(prev.inputSchema);
      expect(live.annotations).toEqual(prev.annotations);
    }
  });

  it("points search, detail and compare at the RV cards widget; tow fit keeps the shopper widget", async () => {
    const { tools } = await rpc("tools/list");
    const meta = (name: string) => tools.find((t: any) => t.name === name)._meta;
    for (const name of ["search_rvs", "get_rv", "compare_rvs"]) expect(meta(name)).toEqual({ ui: { resourceUri: RV_CARDS_URI, visibility: ["model", "app"] } });
    expect(meta("evaluate_tow_fit")).toEqual({ ui: { resourceUri: SHOPPER_URI, visibility: ["model", "app"] } });
    // Tools that had no template still have none.
    for (const prev of before.filter((t) => !t._meta)) expect(meta(prev.name)).toBeUndefined();
  });

  it("lists and serves both widgets with a minimal CSP", async () => {
    const { resources } = await rpc("resources/list");
    expect(resources.map((r: any) => r.uri).sort()).toEqual([RV_CARDS_URI, SHOPPER_URI].sort());
    const cards = await rpc("resources/read", { uri: RV_CARDS_URI });
    const c = cards.contents[0];
    expect(c).toMatchObject({ uri: RV_CARDS_URI, mimeType: "text/html;profile=mcp-app", text: RV_CARDS_HTML });
    expect(c._meta.ui.csp.connectDomains).toEqual([]);
    const domains: string[] = c._meta.ui.csp.resourceDomains;
    expect(domains.length).toBeGreaterThan(0);
    for (const d of domains) expect(d).toMatch(/^https:\/\/[^/]+$/);
    const shopper = await rpc("resources/read", { uri: SHOPPER_URI });
    expect(shopper.contents[0]).toMatchObject({ uri: SHOPPER_URI, text: SHOPPER_HTML, _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } } });
  });
});

describe("RV cards payload on tool results", () => {
  it("search_rvs: cards ride in _meta; text content and structuredContent are unchanged and card-free", async () => {
    const result = await rpc("tools/call", { name: "search_rvs", arguments: { location: "Tacoma, WA", radius_miles: 50, limit: 4, ...JUST_SHOW } });
    const text = textOf(result);
    expect(text.status).toBe("shortlist");
    expect(result.structuredContent).toEqual(text);
    expect(JSON.stringify(text)).not.toContain("matchrv.rv-cards");
    expect(result._meta["matchrv/internal"]).toBeDefined();
    const cards = result._meta[CARDS_META_KEY];
    expect(cards).toMatchObject({ schema: "matchrv.rv-cards", version: 1, view: "results" });
    expect(cards.units.map((u: any) => u.id)).toEqual(text.results.map((r: any) => r.unit_id ?? r.id));
    for (const [i, u] of cards.units.entries()) {
      expect(u.url).toMatch(/^https:\/\/matchrv\.com\/listing\//);
      expect(u.title).toBe(text.results[i].title);
      if (u.photo) expect(u.photo).toMatch(/^https:\/\//);
      for (const v of Object.values(u)) {
        expect(v).not.toBeNull();
        expect(v).not.toBe(0);
      }
    }
  }, 60_000);

  it("search_rvs that asks a question first carries an empty results payload", async () => {
    const result = await rpc("tools/call", { name: "search_rvs", arguments: { location: "Fife, WA" } });
    expect(textOf(result).results).toEqual([]);
    expect(result._meta[CARDS_META_KEY]).toEqual({ schema: "matchrv.rv-cards", version: 1, view: "results", units: [], status: textOf(result).status });
  }, 60_000);

  it("get_rv returns a detail card and compare_rvs a compare payload; errors carry none", async () => {
    const search = textOf(await rpc("tools/call", { name: "search_rvs", arguments: { location: "Tacoma, WA", radius_miles: 50, limit: 3, ...JUST_SHOW } }));
    const ids = search.results.map((r: any) => r.unit_id ?? r.id);
    const detail = await rpc("tools/call", { name: "get_rv", arguments: { unit_id: ids[0] } });
    expect(detail.structuredContent).toEqual(textOf(detail));
    expect(detail._meta[CARDS_META_KEY]).toMatchObject({ view: "detail", units: [{ id: ids[0] }] });
    const compare = await rpc("tools/call", { name: "compare_rvs", arguments: { unit_ids: ids.slice(0, 2) } });
    expect(compare.structuredContent).toEqual(textOf(compare));
    expect(compare._meta[CARDS_META_KEY].view).toBe("compare");
    expect(compare._meta[CARDS_META_KEY].units.map((u: any) => u.id)).toEqual(ids.slice(0, 2));
    const missing = await rpc("tools/call", { name: "get_rv", arguments: { unit_id: "stk:nobody:none" } });
    expect(missing.isError).toBe(true);
    expect(missing._meta?.[CARDS_META_KEY]).toBeUndefined();
  }, 60_000);
});

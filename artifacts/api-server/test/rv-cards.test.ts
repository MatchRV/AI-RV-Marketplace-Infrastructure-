import { describe, expect, it } from "vitest";
import vm from "node:vm";
import type { CanonicalUnit } from "@workspace/agent-core";
import { buildCardUnit, buildCardsPayload, cleanText, photoOrigins, safeUrl, CARDS_META_KEY } from "../src/lib/rv-cards";
import { RV_CARDS_HTML, RV_CARDS_URI } from "../src/ui/rv-cards";

const fact = <T>(value: T | null, source: string | null = value == null ? null : "dealer_listing") => ({ value, source, confidence: value == null ? null : "high" }) as any;

function unit(over: Partial<CanonicalUnit> = {}): CanonicalUnit {
  return {
    id: "stk:example.com:A1",
    vin: null,
    stockNumber: "A1",
    title: "2025 Grand Design Imagine 2600RB",
    year: 2025,
    make: "Grand Design",
    model: "Imagine",
    trim: null,
    floorplanCode: "2600RB",
    rvType: "travel_trailer",
    condition: "new",
    status: "available",
    priceUsd: fact(48995),
    msrpUsd: fact(null),
    lengthFt: fact(31.5),
    dryWeightLbs: fact(6600),
    gvwrLbs: fact(8995),
    hitchWeightLbs: fact(null),
    sleeps: fact(4),
    slideouts: fact(1),
    freshWaterGal: fact(null),
    greyWaterGal: fact(null),
    blackWaterGal: fact(null),
    bunkhouse: fact(false),
    entryDoors: fact(null),
    solar: fact(null),
    lithiumBattery: fact(null),
    generator: fact(null),
    fourSeason: fact(null),
    outdoorKitchen: fact(null),
    boondocking: { score: null, knownInputs: [], missingInputs: [] },
    dealer: { id: "example.com:main", name: "Example RV Sales", city: "Tacoma", state: "WA", lat: null, lng: null, website: null },
    images: ["https://img.example.com/a.jpg"],
    description: null,
    features: [],
    provenance: { sourceKind: "dealer_website_snapshot", dealerDomain: "example.com", firstSeenAt: "2026-11-01T00:00:00Z", lastSeenAt: "2026-11-15T00:00:00Z", listingUrl: "https://example.com/rv/a1" },
    ...over,
  } as CanonicalUnit;
}

describe("card payload builder", () => {
  it("maps every stated field and links to the canonical MatchRV listing", () => {
    const card = buildCardUnit(unit());
    expect(card).toEqual({
      id: "stk:example.com:A1",
      url: "https://matchrv.com/listing/stk:example.com:A1",
      title: "2025 Grand Design Imagine 2600RB",
      photo: "https://img.example.com/a.jpg",
      year: 2025,
      make: "Grand Design",
      model: "Imagine",
      condition: "new",
      priceUsd: 48995,
      dealerName: "Example RV Sales",
      dealerLocation: "Tacoma, WA",
      type: "travel_trailer",
      typeLabel: "Travel trailer",
      gvwrLbs: 8995,
      dryWeightLbs: 6600,
      lengthFt: 31.5,
      sleeps: 4,
    });
  });

  it("omits missing fields entirely and never invents 0s, CCC or placeholder photos", () => {
    const card = buildCardUnit(unit({
      priceUsd: fact(0), gvwrLbs: fact(null), dryWeightLbs: fact(null), lengthFt: fact(Number.NaN), sleeps: fact(null),
      images: [], condition: "unknown", dealer: { id: "x", name: "", city: "", state: "", lat: null, lng: null, website: null },
    }));
    for (const key of ["priceUsd", "gvwrLbs", "dryWeightLbs", "cccLbs", "lengthFt", "sleeps", "photo", "condition", "dealerName", "dealerLocation", "status"]) {
      expect(card).not.toHaveProperty(key);
    }
    expect(JSON.stringify(card)).not.toMatch(/:0[,}]|null|undefined|placeholder/i);
    // CCC only from a published cargo capacity, never GVWR - dry weight.
    expect(buildCardUnit(unit())).not.toHaveProperty("cccLbs");
    expect(buildCardUnit(unit({ rvType: "class_c", towing: { cargoCapacityLbs: fact(1800) } as any })).cccLbs).toBe(1800);
  });

  it("keeps only http(s) links and https photos", () => {
    const card = buildCardUnit(unit({
      images: ["javascript:alert(1)", "http://insecure.example.com/x.jpg", "data:image/png;base64,AAAA", "https://ok.example.com/p.jpg"],
      provenance: { ...unit().provenance, listingUrl: "javascript:alert(1)" },
    }), { detail: true });
    expect(card.photo).toBe("https://ok.example.com/p.jpg");
    expect(card).not.toHaveProperty("dealerListingUrl");
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("https://user:pw@example.com/")).toBeUndefined();
    expect(safeUrl("http://example.com/")).toBe("http://example.com/");
    expect(safeUrl("http://example.com/", true)).toBeUndefined();
    expect(buildCardUnit(unit({ images: ["http://only-http.example.com/x.jpg"] }))).not.toHaveProperty("photo");
  });

  it("returns plain text (no markup interpretation) with control characters stripped", () => {
    const card = buildCardUnit(unit({ title: "<img src=x onerror=alert(1)>\u0000 Trailer\n\nX" }));
    expect(card.title).toBe("<img src=x onerror=alert(1)> Trailer X");
    expect(cleanText("   ")).toBeUndefined();
    expect(cleanText("a".repeat(500))!.length).toBeLessThanOrEqual(160);
  });

  it("detail view adds slideouts, dealer listing link and a real description only", () => {
    const boiler = buildCardUnit(unit({ description: "This website uses cookies to improve your experience. Accept all cookies to continue browsing our site today." }), { detail: true });
    expect(boiler).not.toHaveProperty("description");
    const real = buildCardUnit(unit({ description: "Rear bath couples coach with an island queen, theater seating, a 15K BTU ducted A/C and a big pass-through storage bay." }), { detail: true });
    expect(real.description).toContain("island queen");
    expect(real.slideouts).toBe(1);
    expect(real.dealerListingUrl).toBe("https://example.com/rv/a1");
    expect(buildCardUnit(unit())).not.toHaveProperty("slideouts");
  });

  it("versioned payload caps units per view", () => {
    const many = Array.from({ length: 12 }, (_, i) => unit({ id: `stk:example.com:${i}` }));
    const results = buildCardsPayload("results", many);
    expect(results).toMatchObject({ schema: "matchrv.rv-cards", version: 1, view: "results" });
    expect(results.units).toHaveLength(10);
    expect(buildCardsPayload("compare", many).units).toHaveLength(4);
    expect(buildCardsPayload("detail", many).units).toHaveLength(1);
    expect(buildCardsPayload("results", [], { status: "needs_discovery" })).toEqual({ schema: "matchrv.rv-cards", version: 1, view: "results", units: [], status: "needs_discovery" });
  });

  it("photo origins are https origins only, deduplicated", () => {
    const origins = photoOrigins([unit(), unit({ images: ["https://img.example.com/b.jpg"] }), unit({ images: ["http://x.example.com/a.jpg"] }), unit({ images: [] })]);
    expect(origins).toEqual(["https://img.example.com"]);
  });
});

// ── widget ──────────────────────────────────────────────────────────────────

class FakeNode {
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  attrs: Record<string, string> = {};
  listeners: Record<string, ((e: any) => void)[]> = {};
  className = "";
  text = "";
  [key: string]: any;
  constructor(public tagName: string) {}
  get firstChild() { return this.childNodes[0] ?? null; }
  get textContent(): string { return this.text + this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v: string) { this.text = String(v); this.childNodes = []; }
  appendChild(n: FakeNode) { n.parentNode = this; this.childNodes.push(n); return n; }
  removeChild(n: FakeNode) { this.childNodes = this.childNodes.filter((c) => c !== n); n.parentNode = null; return n; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  addEventListener(t: string, fn: (e: any) => void) { (this.listeners[t] ??= []).push(fn); }
  all(): FakeNode[] { return [this, ...this.childNodes.flatMap((c) => c.all())]; }
}

function loadWidget(openai?: Record<string, unknown>) {
  const script = RV_CARDS_HTML.slice(RV_CARDS_HTML.indexOf("<script>") + 8, RV_CARDS_HTML.lastIndexOf("</script>"));
  const root = new FakeNode("main");
  const html = new FakeNode("html");
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const sent: any[] = [];
  const parent = { postMessage: (m: unknown) => sent.push(m) };
  const document = {
    getElementById: () => root,
    createElement: (tag: string) => new FakeNode(tag),
    createTextNode: (t: string) => { const n = new FakeNode("#text"); n.text = t; return n; },
    documentElement: Object.assign(html, { scrollHeight: 300 }),
  };
  const window: any = { parent, openai, addEventListener: (t: string, fn: (e: any) => void) => (listeners[t] ??= []).push(fn) };
  vm.runInNewContext(script, { document, window, setTimeout, clearTimeout, URL, Promise, Error, Math, String, Array });
  const deliver = (data: unknown) => (listeners.message ?? []).forEach((fn) => fn({ source: parent, data }));
  return { root, html, sent, deliver };
}

describe("RV cards widget", () => {
  const evil = unit({ id: "stk:x:1", title: '<script>alert("x")</script> Trailer' });
  const payload = buildCardsPayload("results", [evil, unit({ id: "stk:x:2", images: [], priceUsd: fact(null), sleeps: fact(null) })]);

  it("is self-contained: no external scripts, styles or fonts", () => {
    expect(RV_CARDS_URI).toBe("ui://matchrv/rv-cards-v1.html");
    expect(RV_CARDS_HTML).not.toMatch(/<script[^>]+src=/i);
    expect(RV_CARDS_HTML).not.toMatch(/<link[^>]+href=/i);
    expect(RV_CARDS_HTML).not.toMatch(/@import|fonts\.googleapis|cdn\./i);
    expect(RV_CARDS_HTML).not.toContain("innerHTML");
    expect(RV_CARDS_HTML.length).toBeLessThan(16_000);
  });

  it("renders results from window.openai.toolResponseMetadata as text, never markup", () => {
    const { root } = loadWidget({ toolResponseMetadata: { [CARDS_META_KEY]: payload } });
    const nodes = root.all();
    expect(nodes.filter((n) => n.tagName === "article")).toHaveLength(2);
    expect(nodes.some((n) => n.tagName === "script")).toBe(false);
    expect(root.textContent).toContain('<script>alert("x")</script> Trailer');
    // Missing fields render nothing: one price, one photo, no "Unknown"/"$0".
    expect(nodes.filter((n) => n.className === "price")).toHaveLength(1);
    expect(nodes.filter((n) => n.tagName === "img")).toHaveLength(1);
    expect(root.textContent).not.toMatch(/unknown|\$0\b|undefined|null|NaN/i);
    const links = nodes.filter((n) => n.tagName === "a");
    expect(links.map((a) => a.href)).toEqual(["https://matchrv.com/listing/stk:x:1", "https://matchrv.com/listing/stk:x:2"]);
  });

  it("drops non-http(s) links and non-https photos even if the payload carries them", () => {
    const bad = { ...payload, units: [{ ...payload.units[0], url: "javascript:alert(1)", photo: "http://x.example.com/a.jpg" }] };
    const { root } = loadWidget({ toolResponseMetadata: { [CARDS_META_KEY]: bad } });
    expect(root.all().filter((n) => n.tagName === "a")).toHaveLength(0);
    expect(root.all().filter((n) => n.tagName === "img")).toHaveLength(0);
  });

  it("renders compare and detail views from the MCP Apps tool-result notification", () => {
    const { root, deliver, sent } = loadWidget();
    expect(sent[0]).toMatchObject({ method: "ui/initialize" });
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { content: [], _meta: { [CARDS_META_KEY]: buildCardsPayload("compare", [unit(), unit({ id: "stk:x:9", gvwrLbs: fact(null) })]) } } });
    const table = root.all().find((n) => n.tagName === "table")!;
    const rowHeads = table.all().filter((n) => n.tagName === "th").map((n) => n.textContent);
    expect(rowHeads).toContain("GVWR");
    expect(rowHeads).not.toContain("CCC"); // no unit states it: row hidden
    expect(table.textContent).toContain("—"); // one unit lacks GVWR
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { _meta: { [CARDS_META_KEY]: buildCardsPayload("detail", [unit()]) } } });
    expect(root.all().some((n) => n.tagName === "table")).toBe(false);
    expect(root.textContent).toContain("Dry weight (UVW)");
    expect(root.textContent).toContain("Slideouts");
  });

  it("ignores payloads that are not RV cards and shows a neutral note when the search asked a question", () => {
    const { root, deliver } = loadWidget();
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { _meta: { [CARDS_META_KEY]: { view: "results", units: [{ title: "x" }] } } } });
    expect(root.childNodes).toHaveLength(0);
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { _meta: { [CARDS_META_KEY]: buildCardsPayload("results", [], { status: "needs_discovery" }) } } });
    expect(root.textContent).toContain("question for you in the chat");
  });

  it("applies the host theme", () => {
    const { html } = loadWidget({ theme: "dark", toolResponseMetadata: {} });
    expect(html.attrs["data-theme"]).toBe("dark");
  });
});

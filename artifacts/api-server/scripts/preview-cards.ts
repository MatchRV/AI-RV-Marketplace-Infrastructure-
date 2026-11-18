/**
 * Render the RV cards widget's three views to static HTML for screenshots.
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/preview-cards.ts [outDir]
 *
 * Each file is the real widget HTML with a window.openai mock injected ahead
 * of its script (toolResponseMetadata["matchrv/cards"] = the payload), so it
 * renders exactly as it would in ChatGPT. Sample units are fixtures, not
 * inventory; the photos are inline SVG data URIs swapped in after the build
 * step, so the preview needs no network (the real builder only allows https).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CanonicalUnit } from "@workspace/agent-core";
import { buildCardsPayload, CARDS_META_KEY, type RvCardsPayload } from "../src/lib/rv-cards";
import { RV_CARDS_HTML } from "../src/ui/rv-cards";

const outDir = resolve(process.argv[2] ?? "/workspace/rvcards-run/preview");
const f = <T>(value: T | null) => ({ value, source: value == null ? null : "dealer_listing", confidence: value == null ? null : "high" }) as never;

function sample(i: number, o: { title: string; year: number; make: string; model: string; type: CanonicalUnit["rvType"]; price: number | null; dealer: string; city: string; state: string; len: number | null; sleeps: number | null; gvwr: number | null; dry: number | null; ccc?: number; slides?: number; condition?: CanonicalUnit["condition"]; status?: CanonicalUnit["status"]; description?: string }): CanonicalUnit {
  return {
    id: `stk:preview.example:${i}`, vin: null, stockNumber: String(i), title: o.title, year: o.year, make: o.make, model: o.model, trim: null, floorplanCode: null,
    rvType: o.type, condition: o.condition ?? "new", status: o.status ?? "available",
    priceUsd: f(o.price), msrpUsd: f(null), lengthFt: f(o.len), dryWeightLbs: f(o.dry), gvwrLbs: f(o.gvwr), hitchWeightLbs: f(null), sleeps: f(o.sleeps), slideouts: f(o.slides ?? null),
    freshWaterGal: f(null), greyWaterGal: f(null), blackWaterGal: f(null), bunkhouse: f(null), entryDoors: f(null), solar: f(null), lithiumBattery: f(null), generator: f(null), fourSeason: f(null), outdoorKitchen: f(null),
    ...(o.ccc ? { towing: { cargoCapacityLbs: f(o.ccc) } } : {}),
    boondocking: { score: null, knownInputs: [], missingInputs: [] },
    dealer: { id: `preview:${i}`, name: o.dealer, city: o.city, state: o.state, lat: null, lng: null, website: null },
    images: [`https://photos.preview.example/${i}.jpg`], description: o.description ?? null, features: [],
    provenance: { sourceKind: "dealer_website_snapshot", dealerDomain: "preview.example", firstSeenAt: "2026-11-01T00:00:00Z", lastSeenAt: "2026-11-15T00:00:00Z", listingUrl: `https://dealer.preview.example/rv/${i}` },
  } as CanonicalUnit;
}

const units = [
  sample(1, { title: "2025 Grand Design Imagine 2600RB", year: 2025, make: "Grand Design", model: "Imagine", type: "travel_trailer", price: 48995, dealer: "Poulsbo RV", city: "Sumner", state: "WA", len: 31.5, sleeps: 4, gvwr: 8995, dry: 6640, slides: 1, description: "Rear-bath couples coach with an island queen bed, theater seating, a 15K BTU ducted A/C, a power awning with LED lights and a large pass-through storage bay." }),
  sample(2, { title: "2026 Jayco Jay Flight SLX 260BH", year: 2026, make: "Jayco", model: "Jay Flight SLX", type: "travel_trailer", price: 31480, dealer: "Camping World of Fife", city: "Fife", state: "WA", len: 30.9, sleeps: 8, gvwr: 7800, dry: 5465 }),
  sample(3, { title: "2024 Winnebago View 24D", year: 2024, make: "Winnebago", model: "View", type: "class_c", price: 154900, dealer: "Bish's RV of Tacoma", city: "Tacoma", state: "WA", len: 25.5, sleeps: 4, gvwr: 11030, dry: null, ccc: 1720, condition: "used" }),
  sample(4, { title: "2025 Keystone Cougar Half-Ton 29BHL", year: 2025, make: "Keystone", model: "Cougar Half-Ton", type: "fifth_wheel", price: null, dealer: "Olympia RV Center", city: "Olympia", state: "WA", len: 33.9, sleeps: null, gvwr: 10495, dry: 8030, status: "pending" }),
];

const colors = ["#2f7f86", "#7a5c2e", "#3d5a80", "#6b4f7a"];
const svg = (i: number, label: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${colors[i % colors.length]}"/><text x="200" y="160" font-family="system-ui" font-size="22" fill="#fff" text-anchor="middle">${label.replace(/[<&]/g, "")}</text></svg>`)}`;
function withPreviewPhotos(p: RvCardsPayload): RvCardsPayload {
  return { ...p, units: p.units.map((u, i) => (u.photo ? { ...u, photo: svg(i, `Sample photo: ${u.make ?? "RV"}`) } : u)) };
}

function page(payload: RvCardsPayload, theme: "light" | "dark"): string {
  const mock = `<script>window.openai=${JSON.stringify({ theme, toolOutput: {}, toolResponseMetadata: { [CARDS_META_KEY]: payload } }).replace(/</g, "\\u003c")};</script>`;
  // Preview only: let the data: photos load (the real widget validates https).
  const html = RV_CARDS_HTML.replace("function photo(u){var h=href(u);return h&&h.indexOf('https:')===0?h:null;}", "function photo(u){if(typeof u==='string'&&u.indexOf('data:image/svg+xml')===0)return u;var h=href(u);return h&&h.indexOf('https:')===0?h:null;}");
  if (html === RV_CARDS_HTML) throw new Error("preview photo hook not found");
  return html.replace("<head>", `<head>${mock}`);
}

mkdirSync(outDir, { recursive: true });
const views = {
  results: withPreviewPhotos(buildCardsPayload("results", units)),
  compare: withPreviewPhotos(buildCardsPayload("compare", units.slice(0, 3))),
  detail: withPreviewPhotos(buildCardsPayload("detail", [units[0]])),
};
for (const [name, payload] of Object.entries(views)) {
  writeFileSync(resolve(outDir, `${name}.html`), page(payload, "light"));
  writeFileSync(resolve(outDir, `${name}-dark.html`), page(payload, "dark"));
  writeFileSync(resolve(outDir, `${name}.payload.json`), JSON.stringify(payload, null, 2));
}
console.log(`wrote ${Object.keys(views).length * 2} previews to ${outDir}`);

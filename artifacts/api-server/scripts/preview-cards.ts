/**
 * Render the RV cards widget's three views, and the dealer-inquiry preview,
 * to static HTML for review.
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/preview-cards.ts [outDir]
 *
 * Writes results.html, compare.html, detail.html (each with one unit showing a
 * "Last listed price" and one showing "Price on request") and
 * inquiry-preview.html (the real buildPreview() output and the dealer-facing
 * text it produces, for a priced unit and a suppressed-price unit). The
 * inquiry page is a review aid only, not production UI.
 *
 * Prices go through the real advertisablePrice rule, which reads the
 * inventory snapshot's screen once (a few seconds). Fixture ids are not in
 * the snapshot, so only the description check can suppress their prices.
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
import { advertisablePrice, priceConflictsWithDescription } from "../src/lib/unit-insights";
import { buildPreview, formatInquiryForwardText, type DealerInquiry } from "../src/services/dealer-inquiries";
import { RV_CARDS_HTML } from "../src/ui/rv-cards";

const outDir = resolve(process.argv[2] ?? "/workspace/rvcards-run/preview2");
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
  // Stored $13,900, but the dealer's own text names $36,900 / $29,900: the public listing rule suppresses it.
  sample(5, { title: "2018 Forest River Rockwood Mini Lite 2507S", year: 2018, make: "Forest River", model: "Rockwood Mini Lite", type: "travel_trailer", price: 13900, dealer: "Puyallup RV", city: "Puyallup", state: "WA", len: 29.5, sleeps: 4, gvwr: 7600, dry: 5400, slides: 1, condition: "used", description: "Inventory Number: 2502C002 Year: 2018 Listing Price: $36,900 Reduced Price: $29,900. Clean rear-bath couples coach with an island queen bed, a slide-out dinette and a big pass-through storage bay." }),
];
const conflicted = units[4];
if (!priceConflictsWithDescription(conflicted) || advertisablePrice(conflicted) !== null) throw new Error("conflict fixture no longer trips the public listing rule");
if (advertisablePrice(units[0]) !== 48995) throw new Error("priced fixture lost its price");

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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const RAW = /13,?900/;
function check(name: string, payload: unknown, html: string): void {
  // Each preview must show both states and never the suppressed stored number.
  if (!JSON.stringify(payload).includes("priceOnRequest") || RAW.test(JSON.stringify(payload))) throw new Error(`${name}: payload check failed`);
  if (RAW.test(html.replace(/Reduced Price: \$29,900/g, ""))) throw new Error(`${name}: raw price in html`);
}

/** The detail view shows one unit, so detail.html frames two real widget renders side by side. */
function framed(title: string, frames: { caption: string; html: string }[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px system-ui,sans-serif;margin:16px;color:#14262b}.f{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;flex:1 1 380px}iframe{width:100%;height:900px;border:1px solid #d5e3e3;border-radius:12px}figcaption{margin:0 0 6px;font-weight:600}</style></head><body><h1 style="font-size:18px">${esc(title)}</h1><div class="f">${frames.map((f) => `<figure><figcaption>${esc(f.caption)}</figcaption><iframe sandbox="allow-scripts" srcdoc="${esc(f.html)}"></iframe></figure>`).join("")}</div></body></html>`;
}

mkdirSync(outDir, { recursive: true });
const views = {
  results: withPreviewPhotos(buildCardsPayload("results", [units[0], conflicted, units[1], units[3]])),
  compare: withPreviewPhotos(buildCardsPayload("compare", [units[0], conflicted, units[2]])),
};
for (const [name, payload] of Object.entries(views)) {
  const html = page(payload, "light");
  check(name, payload, html);
  writeFileSync(resolve(outDir, `${name}.html`), html);
  writeFileSync(resolve(outDir, `${name}-dark.html`), page(payload, "dark"));
  writeFileSync(resolve(outDir, `${name}.payload.json`), JSON.stringify(payload, null, 2));
}
const detailPriced = withPreviewPhotos(buildCardsPayload("detail", [units[0]]));
const detailOnRequest = withPreviewPhotos(buildCardsPayload("detail", [conflicted]));
check("detail", [detailPriced, detailOnRequest], page(detailOnRequest, "light"));
writeFileSync(resolve(outDir, "detail.html"), framed("Detail view: a priced unit and a suppressed-price unit", [
  { caption: "Priced unit (Last listed price)", html: page(detailPriced, "light") },
  { caption: "Stored price conflicts with the dealer's text (Price on request)", html: page(detailOnRequest, "light") },
]));
writeFileSync(resolve(outDir, "detail-dark.html"), framed("Detail view (dark)", [
  { caption: "Priced unit", html: page(detailPriced, "dark") },
  { caption: "Suppressed price", html: page(detailOnRequest, "dark") },
]));
writeFileSync(resolve(outDir, "detail.payload.json"), JSON.stringify({ priced: detailPriced, onRequest: detailOnRequest }, null, 2));

// ── inquiry preview: the real buildPreview() output and dealer-facing text ──
const contact = { name: "Pat Tester", email: "pat@example.com", phone: "+12535550142" };
const message = "Could you confirm the price and that it is still available? I could come see it Saturday.";
const inquiries = [
  { caption: "Priced unit", unit: units[0] },
  { caption: "Stored price conflicts with the dealer's text", unit: conflicted },
].map(({ caption, unit }) => {
  const preview = buildPreview(unit, contact, message);
  const stored = { id: "inq_PREVIEW", preview } as DealerInquiry;
  return { caption, preview, dealerText: formatInquiryForwardText(stored) };
});
for (const i of inquiries.slice(1)) if (RAW.test(JSON.stringify(i.preview)) || RAW.test(i.dealerText)) throw new Error("raw price leaked into the inquiry preview");
const card = (i: (typeof inquiries)[number]) => {
  const u = i.preview.unit;
  return `<section><h2>${esc(i.caption)}</h2>
<div class="pv"><div class="muted">What the shopper is asked to approve (rendered from preview fields)</div>
<div class="t">${esc(u.title)}</div>
<div class="muted">${esc(i.preview.dealer.name)} · ${esc(`${i.preview.dealer.city}, ${i.preview.dealer.state}`)} · Stock ${esc(u.stockNumber ?? "n/a")}</div>
${u.priceOnRequest ? "" : `<div class="pl">${esc(u.priceLabel ?? "")}</div>`}<div class="price${u.priceOnRequest ? " por" : ""}">${esc(u.priceDisplay ?? "")}</div>
<div class="muted">To: ${esc(i.preview.dealer.name)} · From: ${esc(i.preview.shopper.name)} (${esc(i.preview.shopper.email ?? "")})</div>
<p>${esc(i.preview.message)}</p><div class="muted">${esc(i.preview.delivery.explanation)}</div></div>
<h3>Dealer-facing text (formatInquiryForwardText)</h3><pre>${esc(i.dealerText)}</pre>
<h3>preview JSON (buildPreview)</h3><pre>${esc(JSON.stringify(i.preview, null, 2))}</pre></section>`;
};
writeFileSync(resolve(outDir, "inquiry-preview.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dealer inquiry preview (review aid)</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:16px;color:#14262b;max-width:1200px}.note{background:#fff6e0;border:1px solid #e8d29a;padding:8px 10px;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:20px}.pv{border:1px solid #d5e3e3;border-radius:12px;padding:12px}.t{font-weight:650;font-size:15px}.muted{color:#566b70;font-size:13px}.pl{color:#566b70;font-size:12px;margin-top:6px}.price{font-weight:700;font-size:17px;color:#075e63}.por{font-size:15px;font-weight:600}pre{white-space:pre-wrap;background:#f4f8f8;border:1px solid #d5e3e3;border-radius:8px;padding:8px;font-size:12px}</style></head><body><h1 style="font-size:18px">Dealer inquiry preview: fixture rendering</h1><p class="note">Review aid only, not production UI. The shopper sees this preview through the assistant (prepare_dealer_inquiry); the website sends without showing it. Data below is the real buildPreview() and formatInquiryForwardText() output for fixture units.</p><div class="grid">${inquiries.map(card).join("")}</div></body></html>`);
writeFileSync(resolve(outDir, "inquiry-preview.json"), JSON.stringify(inquiries, null, 2));
console.log(`wrote results, compare, detail (light + dark) and inquiry-preview to ${outDir}`);

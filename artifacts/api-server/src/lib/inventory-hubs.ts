/**
 * Shopping hub pages: /rvs/{state}, /rvs/{state}/{type} and
 * /rvs/{state}/{type}/under-{price}.
 *
 * These answer the searches buyers actually type ("travel trailers for sale
 * in Washington under $40,000"), which no single unit page can rank for.
 * They also give every indexable unit an internal link from a crawlable page,
 * instead of only a sitemap entry.
 *
 * Server-rendered, standalone HTML (no SPA shell), built only from the
 * inventory snapshot. A hub exists only when it lists at least MIN_HUB_UNITS
 * indexable units, so there are no thin or empty hub pages.
 */
import type { CanonicalUnit } from "@workspace/agent-core";
import { perSnapshot } from "../services/agent-inventory";
import {
  RV_TYPE_LABEL,
  advertisablePrice,
  dealerDisplayName,
  isIndexableUnit,
  unitLocation,
  unitUrl,
} from "./unit-insights";

const SITE = "https://matchrv.com";
export const MIN_HUB_UNITS = 12;
/** Units listed on one hub page. */
export const HUB_PAGE_UNITS = 60;
export const PRICE_CAPS = [15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 75_000, 100_000] as const;

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export const TYPE_SLUG: Record<string, string> = {
  travel_trailer: "travel-trailers",
  fifth_wheel: "fifth-wheels",
  toy_hauler: "toy-haulers",
  class_a: "class-a-motorhomes",
  class_b: "class-b-camper-vans",
  class_c: "class-c-motorhomes",
  truck_camper: "truck-campers",
  popup_camper: "pop-up-campers",
};
const TYPE_PLURAL: Record<string, string> = {
  travel_trailer: "Travel Trailers",
  fifth_wheel: "Fifth Wheels",
  toy_hauler: "Toy Haulers",
  class_a: "Class A Motorhomes",
  class_b: "Class B Camper Vans",
  class_c: "Class C Motorhomes",
  truck_camper: "Truck Campers",
  popup_camper: "Pop-Up Campers",
};

const stateSlug = (code: string) => US_STATES[code]!.toLowerCase().replace(/\s+/g, "-");
const SLUG_TO_STATE = new Map(Object.keys(US_STATES).map((c) => [stateSlug(c), c]));
const SLUG_TO_TYPE = new Map(Object.entries(TYPE_SLUG).map(([t, s]) => [s, t]));

export interface HubRef { url: string; label: string }

interface HubKey { state: string; type: string | null; cap: number | null }

export function hubPath(k: HubKey): string {
  let p = `/rvs/${stateSlug(k.state)}`;
  if (k.type) p += `/${TYPE_SLUG[k.type]}`;
  if (k.type && k.cap) p += `/under-${k.cap}`;
  return p;
}

export function hubLabel(k: HubKey): string {
  const what = k.type ? TYPE_PLURAL[k.type] : "RVs";
  return `${what} for Sale in ${US_STATES[k.state]}${k.cap ? ` Under $${k.cap.toLocaleString("en-US")}` : ""}`;
}

const keyStr = (k: HubKey) => `${k.state}|${k.type ?? ""}|${k.cap ?? ""}`;

/** Hub membership and the rendered-page cache, built once per loaded snapshot. */
const hubState = perSnapshot((inv) => ({ hubs: buildHubs(inv.units), html: new Map<string, string>() }));

function hubs(): Map<string, CanonicalUnit[]> {
  return hubState().hubs;
}

/** Build the hub index for the current snapshot now (startup and snapshot reload warm it off the request path). */
export function warmHubs(): number {
  return hubState().hubs.size;
}

function buildHubs(units: CanonicalUnit[]): Map<string, CanonicalUnit[]> {
  const map = new Map<string, CanonicalUnit[]>();
  const add = (k: HubKey, u: CanonicalUnit) => {
    const s = keyStr(k);
    let a = map.get(s);
    if (!a) map.set(s, (a = []));
    a.push(u);
  };
  for (const u of units) {
    const state = (u.dealer.state ?? "").toUpperCase();
    if (!US_STATES[state] || !TYPE_SLUG[u.rvType]) continue;
    if (!isIndexableUnit(u)) continue;
    add({ state, type: null, cap: null }, u);
    add({ state, type: u.rvType, cap: null }, u);
    const price = advertisablePrice(u);
    if (price != null) for (const cap of PRICE_CAPS) if (price <= cap) add({ state, type: u.rvType, cap }, u);
  }
  for (const [k, list] of map) {
    if (list.length < MIN_HUB_UNITS) map.delete(k);
    // Freshest first, then cheapest: the page shows what is most likely still on the lot.
    else list.sort((a, b) => (b.provenance.lastSeenAt ?? "").localeCompare(a.provenance.lastSeenAt ?? "") || (advertisablePrice(a) ?? 9e9) - (advertisablePrice(b) ?? 9e9));
  }
  return map;
}

export function resetHubCache(): void {
  hubState.reset();
}

/** The state × type hub that links to this unit, when it exists. */
export function hubForUnit(unit: CanonicalUnit): HubRef | null {
  const state = (unit.dealer.state ?? "").toUpperCase();
  if (!US_STATES[state] || !TYPE_SLUG[unit.rvType]) return null;
  const k = { state, type: unit.rvType, cap: null };
  if (!hubs().has(keyStr(k))) return null;
  return { url: `${SITE}${hubPath(k)}`, label: hubLabel(k) };
}

/** Every hub URL, for the sitemap. */
export function listHubUrls(): string[] {
  const out: string[] = [];
  for (const s of hubs().keys()) {
    const [state, type, cap] = s.split("|");
    out.push(`${SITE}${hubPath({ state, type: type || null, cap: cap ? Number(cap) : null })}`);
  }
  return out.sort();
}

/** Parse a /rvs/... path. Returns null for anything that is not a known hub shape. */
export function parseHubPath(path: string): HubKey | null {
  const m = /^\/rvs\/([a-z-]+)(?:\/([a-z-]+))?(?:\/under-(\d+))?\/?$/.exec(path);
  if (!m) return null;
  const state = SLUG_TO_STATE.get(m[1]);
  if (!state) return null;
  const type = m[2] ? SLUG_TO_TYPE.get(m[2]) ?? undefined : null;
  if (type === undefined) return null;
  const cap = m[3] ? Number(m[3]) : null;
  if (cap != null && (!type || !(PRICE_CAPS as readonly number[]).includes(cap))) return null;
  return { state, type, cap };
}

// ── rendering ───────────────────────────────────────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const jsonLd = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
}

const CSS = `
:root{--slate:#465267;--teal:#2f9fb0;--ink:#1f2633;--muted:#5b6575;--line:#e3e7ee;--bg:#f7f9fb}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
header{background:var(--slate)}header .wrap{display:flex;align-items:center;gap:20px;padding:14px 16px}header a{color:#fff;text-decoration:none;font-weight:700}header nav{margin-left:auto}header nav a{color:#dff4f7;font-weight:400;margin-left:16px}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}main{padding:24px 0 48px}
h1{font-size:1.9rem;line-height:1.2;margin:6px 0 8px}h2{font-size:1.3rem;margin:32px 0 10px}
a{color:var(--teal)}.crumbs{font-size:.9rem;color:var(--muted)}.crumbs a{color:var(--muted)}
.lead{color:var(--muted);margin:0 0 16px}.stats{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
.stat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:140px}.stat b{display:block;font-size:1.2rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;padding:0;list-style:none}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}.card a{text-decoration:none;color:inherit;display:block}
.card img{width:100%;aspect-ratio:4/3;object-fit:cover;background:#e9edf2;display:block}.card .body{padding:10px 12px}
.card .t{font-weight:600;color:var(--ink)}.card .p{color:var(--teal);font-weight:700}.card .m{color:var(--muted);font-size:.88rem}
.pager{margin:20px 0;display:flex;gap:16px;align-items:center}h1 small{font-size:.9rem;color:var(--muted);font-weight:400}
.links{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.links a{display:inline-block;background:#fff;border:1px solid var(--line);border-radius:999px;padding:4px 12px;text-decoration:none;font-size:.92rem}
footer{border-top:1px solid var(--line);padding:20px 0;color:var(--muted);font-size:.9rem}
`;

/** Hub pages kept in memory; the rest re-render (a few ms each). */
const HTML_CACHE_MAX = 300;

export function hubPageCount(unitCount: number): number {
  return Math.max(1, Math.ceil(unitCount / HUB_PAGE_UNITS));
}

export interface HubPageData {
  label: string;
  /** Canonical URL of this page (with ?page=N past page 1). */
  url: string;
  page: number;
  pages: number;
  total: number;
  dealers: number;
  stateName: string;
  /** Units on this page, in the same order as the HTML page. */
  units: CanonicalUnit[];
  prevUrl: string | null;
  nextUrl: string | null;
}

/**
 * The data behind one hub page (same units, order and paging as
 * renderHubPage), for non-HTML renderings such as Markdown. Null exactly when
 * renderHubPage would return null.
 */
export function hubPageData(path: string, page = 1): HubPageData | null {
  const k = parseHubPath(path);
  if (!k) return null;
  const units = hubs().get(keyStr(k));
  if (!units) return null;
  const pages = hubPageCount(units.length);
  if (!Number.isInteger(page) || page < 1 || page > pages) return null;
  const first = `${SITE}${hubPath(k)}`;
  const at = (n: number) => (n > 1 ? `${first}?page=${n}` : first);
  return {
    label: hubLabel(k),
    url: at(page),
    page,
    pages,
    total: units.length,
    dealers: new Set(units.map((u) => u.dealer.id)).size,
    stateName: US_STATES[k.state]!,
    units: units.slice((page - 1) * HUB_PAGE_UNITS, page * HUB_PAGE_UNITS),
    prevUrl: page > 1 ? at(page - 1) : null,
    nextUrl: page < pages ? at(page + 1) : null,
  };
}

/**
 * Rendered hub page, or null when the path is not a hub with enough units or
 * the page number is past the end. Every page links the next, so each
 * indexable unit is reachable from a crawlable page, not only the sitemap.
 */
export function renderHubPage(path: string, page = 1): string | null {
  const k = parseHubPath(path);
  if (!k) return null;
  const state = hubState();
  const htmlCache = state.html;
  const all = state.hubs;
  const units = all.get(keyStr(k));
  if (!units) return null;
  const pages = hubPageCount(units.length);
  if (!Number.isInteger(page) || page < 1 || page > pages) return null;
  const cacheKey = `${keyStr(k)}|${page}`;
  const hit = htmlCache.get(cacheKey);
  if (hit) return hit;

  const firstUrl = `${SITE}${hubPath(k)}`;
  const url = page > 1 ? `${firstUrl}?page=${page}` : firstUrl;
  const pageUrl = (n: number) => (n > 1 ? `${hubPath(k)}?page=${n}` : hubPath(k));
  const label = hubLabel(k);
  const pageSuffix = page > 1 ? ` (Page ${page} of ${pages})` : "";
  const stateName = US_STATES[k.state]!;
  const prices = units.map(advertisablePrice).filter((p): p is number => p != null).sort((a, b) => a - b);
  const dealers = new Set(units.map((u) => u.dealer.id)).size;
  const newCount = units.filter((u) => u.condition === "new").length;
  const usedCount = units.filter((u) => u.condition === "used").length;
  const dry = units.map((u) => u.dryWeightLbs?.value).filter((n): n is number => typeof n === "number").sort((a, b) => a - b);
  const sleeps = units.map((u) => u.sleeps?.value).filter((n): n is number => typeof n === "number").sort((a, b) => a - b);

  const lead: string[] = [`MatchRV tracks ${units.length.toLocaleString("en-US")} ${k.type ? TYPE_PLURAL[k.type].toLowerCase() : "RVs"}${k.cap ? ` listed at or under ${usd(k.cap)}` : ""} at ${dealers} ${dealers === 1 ? "dealership" : "dealerships"} in ${stateName}.`];
  if (prices.length >= 5) lead.push(`Most are priced between ${usd(pct(prices, 0.1))} and ${usd(pct(prices, 0.9))}, with a median asking price of ${usd(pct(prices, 0.5))}.`);
  if (dry.length >= 5 && k.type && ["travel_trailer", "fifth_wheel", "toy_hauler", "popup_camper"].includes(k.type)) {
    lead.push(`Where the dealer lists it, the median dry weight is ${Math.round(pct(dry, 0.5)).toLocaleString("en-US")} lbs, so plan your tow vehicle around that plus cargo.`);
  }
  if (sleeps.length >= 5) lead.push(`Median sleeping capacity is ${pct(sleeps, 0.5)}.`);
  lead.push(`Prices and availability come from each dealer's own website when MatchRV last saw them; confirm with the dealership before you visit.`);

  const shown = units.slice((page - 1) * HUB_PAGE_UNITS, page * HUB_PAGE_UNITS);
  const cards = shown.map((u) => {
    const price = advertisablePrice(u);
    const facts = [
      u.sleeps?.value != null ? `Sleeps ${u.sleeps.value}` : null,
      u.lengthFt?.value != null ? `${u.lengthFt.value} ft` : null,
      u.dryWeightLbs?.value != null ? `${Math.round(u.dryWeightLbs.value).toLocaleString("en-US")} lbs dry` : null,
    ].filter(Boolean).join(" · ");
    const img = u.images?.[0];
    return `<li class="card"><a href="${esc(unitUrl(u.id))}">${img ? `<img src="${esc(img)}" alt="${esc(u.title)}" loading="lazy" width="400" height="300">` : ""}<div class="body"><div class="t">${esc(`${u.condition === "new" ? "New" : u.condition === "used" ? "Used" : ""} ${u.title}`.trim())}</div><div class="p">${price != null ? esc(usd(price)) : "Price on request"}</div><div class="m">${esc(dealerDisplayName(u))}${unitLocation(u) ? ` · ${esc(unitLocation(u))}` : ""}</div>${facts ? `<div class="m">${esc(facts)}</div>` : ""}</div></a></li>`;
  }).join("");

  // Related hubs: other price caps for this type, other types in this state.
  const related: HubRef[] = [];
  if (k.type) {
    for (const cap of PRICE_CAPS) {
      const rk = { state: k.state, type: k.type, cap };
      if (cap !== k.cap && all.has(keyStr(rk))) related.push({ url: hubPath(rk), label: `Under ${usd(cap)}` });
    }
  }
  const typeLinks: HubRef[] = [];
  for (const t of Object.keys(TYPE_SLUG)) {
    const rk = { state: k.state, type: t, cap: null };
    if (t !== k.type && all.has(keyStr(rk))) typeLinks.push({ url: hubPath(rk), label: TYPE_PLURAL[t] });
  }

  const crumbs: HubRef[] = [{ url: "/", label: "MatchRV" }, { url: hubPath({ state: k.state, type: null, cap: null }), label: `RVs in ${stateName}` }];
  if (k.type) crumbs.push({ url: hubPath({ state: k.state, type: k.type, cap: null }), label: TYPE_PLURAL[k.type] });
  if (k.cap) crumbs.push({ url: hubPath(k), label: `Under ${usd(k.cap)}` });

  const description = `${units.length.toLocaleString("en-US")} ${k.type ? TYPE_PLURAL[k.type].toLowerCase() : "RVs"} for sale in ${stateName}${k.cap ? ` under ${usd(k.cap)}` : ""} at ${dealers} dealers${prices.length >= 5 ? `, median ${usd(pct(prices, 0.5))}` : ""}. Compare specs, tow fit and price context on MatchRV.`;
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: label,
      url,
      description,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: units.length,
        itemListElement: shown.map((u, i) => ({ "@type": "ListItem", position: (page - 1) * HUB_PAGE_UNITS + i + 1, url: unitUrl(u.id), name: u.title })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: `${SITE}${c.url}` })),
    },
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(label + pageSuffix)} | MatchRV</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.ico">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(label + pageSuffix)} | MatchRV">
${page > 1 ? `<link rel="prev" href="${esc(SITE + pageUrl(page - 1))}">` : ""}${page < pages ? `<link rel="next" href="${esc(SITE + pageUrl(page + 1))}">` : ""}
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="MatchRV">
<script type="application/ld+json">${jsonLd(ld)}</script>
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap"><a href="/">MatchRV</a><nav><a href="/shop">Shop with the RV Outfitter</a><a href="/tow-guide">Tow guide</a></nav></div></header>
<main class="wrap">
<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map((c, i) => (i === crumbs.length - 1 ? esc(c.label) : `<a href="${esc(c.url)}">${esc(c.label)}</a>`)).join(" › ")}</nav>
<h1>${esc(label)}${page > 1 ? ` <small>page ${page}</small>` : ""}</h1>
<p class="lead">${esc(lead.join(" "))}</p>
<div class="stats">
<div class="stat"><b>${units.length.toLocaleString("en-US")}</b>listings</div>
<div class="stat"><b>${dealers}</b>dealerships</div>
${prices.length >= 5 ? `<div class="stat"><b>${esc(usd(pct(prices, 0.5)))}</b>median price</div>` : ""}
${newCount || usedCount ? `<div class="stat"><b>${newCount.toLocaleString("en-US")} / ${usedCount.toLocaleString("en-US")}</b>new / used</div>` : ""}
</div>
${pages > 1 ? `<p class="muted">Most recently seen first. Showing ${((page - 1) * HUB_PAGE_UNITS + 1).toLocaleString("en-US")} to ${((page - 1) * HUB_PAGE_UNITS + shown.length).toLocaleString("en-US")} of ${units.length.toLocaleString("en-US")}.</p>` : ""}
<ul class="grid">${cards}</ul>
${pages > 1 ? `<nav class="pager" aria-label="Pages">${page > 1 ? `<a rel="prev" href="${esc(pageUrl(page - 1))}">← Previous</a>` : ""} Page ${page} of ${pages} ${page < pages ? `<a rel="next" href="${esc(pageUrl(page + 1))}">Next →</a>` : ""}</nav>` : ""}
${related.length ? `<h2>By price</h2><ul class="links">${related.map((r) => `<li><a href="${esc(r.url)}">${esc(r.label)}</a></li>`).join("")}</ul>` : ""}
${typeLinks.length ? `<h2>Other RV types in ${esc(stateName)}</h2><ul class="links">${typeLinks.map((r) => `<li><a href="${esc(r.url)}">${esc(r.label)}</a></li>`).join("")}</ul>` : ""}
<h2>Not sure which one fits?</h2>
<p>Tell the <a href="/shop">MatchRV RV Outfitter</a> how you camp, who is coming and what you tow with, and it narrows this list to the units that actually fit. The <a href="/tow-guide">tow guide</a> explains GVWR, hitch weight and payload.</p>
</main>
<footer><div class="wrap"><a href="/">Home</a> · <a href="/about">About</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></div></footer>
</body>
</html>`;
  if (htmlCache.size >= HTML_CACHE_MAX) htmlCache.delete(htmlCache.keys().next().value!);
  htmlCache.set(cacheKey, html);
  return html;
}

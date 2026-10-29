/**
 * Keystone crawler: https://www.keystonerv.com/product/<series>/<category>/floorplans/<CODE>
 * Specs come from the page's Specifications table; the floorplan description
 * ("Single axle, non-slide, single bunks") is kept and used for bunkhouse = yes.
 *
 * Model year: Keystone's floorplan pages don't print a model year. The year is
 * taken from Keystone's own floorplan drawing file name on that page
 * (e.g. ..._CM_17B_2027.png) and only when exactly one year appears for that
 * code; otherwise the page is skipped. Every record notes this.
 *
 *   npx tsx scripts/brochure-crawl/keystone.ts
 */
import { parseSpecTableText, type ManufacturerSpecRecord } from "../../src/manufacturer-specs.js";
import { BlockedError, getPage, inventoryDemand, normCode, priority, sitemapLocs, stripTags, today } from "./common.js";
import { writeMakerRecords } from "./write-records.js";

const FLOORPLAN_URL = /^https:\/\/www\.keystonerv\.com\/product\/([a-z0-9-]+)\/([a-z0-9-]+)\/floorplans\/([A-Za-z0-9-]+)$/;

const SERIES_OVERRIDES: Record<string, string> = { "coleman-travel-trailers": "Coleman" };
export const seriesFromSlug = (slug: string) =>
  SERIES_OVERRIDES[slug] ?? slug.split("-").map((w) => (w === "sl" ? "SL" : w[0].toUpperCase() + w.slice(1))).join(" ").replace(/^Cougar Half Ton$/, "Cougar Half-Ton");

export function parseKeystonePage(html: string, url: string): ManufacturerSpecRecord | { skip: string } {
  const m = FLOORPLAN_URL.exec(url);
  if (!m) return { skip: "not_floorplan_url" };
  const code = m[3].toUpperCase();
  const esc = code.replace(/[^A-Z0-9]/g, "");
  const years = new Set([...html.matchAll(new RegExp(`_${esc}_(20\\d{2})\\.(?:png|jpe?g|webp)`, "gi"))].map((x) => Number(x[1])));
  if (years.size !== 1) return { skip: `model_year_not_unique:${[...years].join("/")}` };
  const year = [...years][0];
  const text = stripTags(html);
  const lines = text.split("\n");
  const a = lines.indexOf("Specification Value");
  const b = lines.findIndex((l, i) => i > a && /^Standards & Options/.test(l));
  if (a < 0 || b < 0) return { skip: "no_specifications_table" };
  const pairs: string[] = [];
  for (let i = a + 1; i + 1 < b; i += 2) pairs.push(`${lines[i]} ${lines[i + 1]}`);
  const { specs, labels } = parseSpecTableText(pairs.join("\n"));
  if (!Object.keys(specs).length) return { skip: "no_parsable_specs" };
  // "17B - Comfort Travel Trailers" followed by the floorplan description line.
  const h = lines.findIndex((l) => new RegExp(`^${esc}\\s+-\\s+`, "i").test(l));
  const desc = h >= 0 && lines[h + 1] && !/^Back to all/i.test(lines[h + 1]) ? lines[h + 1] : undefined;
  const rec: ManufacturerSpecRecord = {
    year, make: "Keystone", series: seriesFromSlug(m[1]), floorplanCode: code, sourceUrl: url, retrievedAt: today(), labels, specs,
    ...(desc ? { floorplanName: desc } : {}),
    note: `Model year ${year} read from Keystone's floorplan drawing file name on this page; the page text does not print a model year.${m[1] === "coleman-travel-trailers" ? " Keystone files this under Coleman \"Comfort\" travel trailers." : ""}`,
  };
  if (m[1].startsWith("coleman")) rec.brandAliases = ["Coleman"];
  if (desc && /\bbunk/i.test(desc) && !/\bno bunks?\b|without bunks?/i.test(desc)) { rec.bunkhouse = true; rec.bunkhouseEvidence = desc; }
  return rec;
}

async function main() {
  const demand = await inventoryDemand("Keystone");
  const sm = await getPage("https://www.keystonerv.com/sitemap.xml");
  if (!sm) throw new Error("Keystone sitemap unavailable");
  const urls = sitemapLocs(sm.html).filter((u) => FLOORPLAN_URL.test(u));
  const byCode = new Map<string, { units: number; noSleeps: number; bunkUnknown: number }>();
  for (const [k, d] of demand) { const c = k.split("|")[1]; const t = byCode.get(c) ?? { units: 0, noSleeps: 0, bunkUnknown: 0 }; t.units += d.units; t.noSleeps += d.noSleeps; t.bunkUnknown += d.bunkUnknown; byCode.set(c, t); }
  const queued = urls.map((u) => { const c = normCode(FLOORPLAN_URL.exec(u)![3]); return { u, c, d: byCode.get(c) }; })
    .filter((x) => x.d).sort((a, b) => priority(b.c, b.d!) - priority(a.c, a.d!));
  const records: ManufacturerSpecRecord[] = []; const skipped: Record<string, number> = {}; const blocked: string[] = [];
  let fetched = 0, cached = 0;
  for (const { u } of queued) {
    try {
      const page = await getPage(u);
      if (!page) { skipped.http_or_robots = (skipped.http_or_robots ?? 0) + 1; continue; }
      page.fromCache ? cached++ : fetched++;
      const r = parseKeystonePage(page.html, u);
      if ("skip" in r) { const k = r.skip.split(":")[0]; skipped[k] = (skipped[k] ?? 0) + 1; continue; }
      records.push(r);
    } catch (e) {
      if (e instanceof BlockedError) { blocked.push(`${e.url} (${e.reason})`); if (blocked.length >= 3) break; continue; }
      throw e;
    }
  }
  const report = { maker: "Keystone", ranAt: new Date().toISOString(), sitemapFloorplanUrls: urls.length, matchingInventory: queued.length, fetched, cached, records: records.length, skipped, blocked,
    note: "keystonerv.com publishes only the current production run; the model year comes from the floorplan drawing file name." };
  writeMakerRecords("Keystone", "KEYSTONE_SPEC_RECORDS", records, report);
  console.log(JSON.stringify(report));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });

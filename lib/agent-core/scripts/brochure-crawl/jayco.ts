/**
 * Jayco crawler: https://www.jayco.com/rvs/<type>/<year>-<series>/<floorplan>/
 * (2023–2027 model years are listed in Jayco's own sitemap-rvs). Specs come from
 * the floorplan page's Specifications tables; nothing is computed.
 *
 *   npx tsx scripts/brochure-crawl/jayco.ts
 */
import { parseSpecTableText, type ManufacturerSpecRecord } from "../../src/manufacturer-specs.js";
import { BlockedError, getPage, inventoryDemand, normCode, priority, sitemapLocs, stripTags, decodeEntities, today } from "./common.js";
import { writeMakerRecords } from "./write-records.js";

const FLOORPLAN_URL = /^https:\/\/www\.jayco\.com\/rvs\/([a-z-]+)\/(20\d{2})-([a-z0-9-]+)\/([a-z0-9-]+)\/$/;
const NOT_FLOORPLAN = new Set(["floorplans", "gallery", "features", "brochure", "videos", "reviews", "specs", "build"]);

export function parseJaycoPage(html: string, url: string): ManufacturerSpecRecord | { skip: string } {
  const m = FLOORPLAN_URL.exec(url);
  if (!m) return { skip: "not_floorplan_url" };
  const year = Number(m[2]);
  const title = decodeEntities(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "");
  // "2027 Jay Flight - 270BHSW | Jayco RV"
  // Also tolerates Jayco's hand-typed variants: "2024 Jay Flight- 264BH | Jayco, Inc", "2026 Jay Feather Air SL 15TBSL | Jayco, Inc".
  let t = /^\s*(20\d{2})\s+(.+?)\s*-\s*([A-Za-z0-9][A-Za-z0-9 -]*?)\s*\|\s*Jayco/i.exec(title);
  if (!t) {
    const u = new RegExp(`^\\s*(20\\d{2})\\s+([A-Za-z ]+?)\\s+(${m[4].replace(/-/g, "[ -]?")})\\s*\\|\\s*Jayco`, "i").exec(title);
    if (u) t = u;
  }
  if (!t) return { skip: `unparsed_title:${title}` };
  // The series in the title must be the series in Jayco's own URL ("2025-jay-flight-slx" → "Jay Flight SLX").
  const TYPE_SUFFIX = /[\s-]+(fifth[\s-]wheels?|travel[\s-]trailers?|toy[\s-]haulers?)$/i;
  const titleSeries = t[2].replace(TYPE_SUFFIX, "").trim();
  if (titleSeries.toLowerCase().replace(/[^a-z0-9]/g, "") !== m[3].replace(TYPE_SUFFIX, "").replace(/-/g, "")) return { skip: `series_mismatch_title_vs_url:${t[2]}/${m[3]}` };
  if (Number(t[1]) !== year) return { skip: "year_mismatch_title_vs_url" };
  const series = titleSeries;
  // "172DB Sport Edition" → code 172DB, published name kept as floorplanName.
  const published = t[3].trim();
  const code = published.split(/\s+/)[0].toUpperCase();
  // Exact: a "265thw" (Western-built) or "24r-csa" page titled "265TH"/"24R" is a variant, not that floorplan.
  if (normCode(code) !== normCode(m[4])) return { skip: `code_mismatch_title_vs_url:${code}/${m[4]}` };
  // Specifications tables only (first block of label/value rows after the "Specifications" heading).
  const specStart = html.search(/<h3>\s*Specifications\s*<\/h3>/i);
  if (specStart < 0) return { skip: "no_specifications_table" };
  const block = html.slice(specStart, specStart + 20_000);
  const end = block.search(/Interior Designs|<h3>(?!\s*Specifications)/i);
  const rows = [...(end > 0 ? block.slice(0, end) : block).matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)]
    .map((r) => `${stripTags(r[1]).replace(/\n/g, " ")} ${stripTags(r[2]).replace(/\n/g, " ")}`);
  if (!rows.length) return { skip: "empty_specifications_table" };
  const { specs, labels } = parseSpecTableText(rows.join("\n"));
  const text = stripTags(html);
  let note: string | undefined;
  // Jayco: Western- and Eastern-built units of some series carry different fresh tanks.
  if (specs.freshWaterGal !== undefined && /western-built|eastern-built|built in (?:the )?(?:west|east)/i.test(text)) {
    delete specs.freshWaterGal; delete labels.freshWaterGal;
    note = "Fresh water omitted on purpose: Jayco says Western- and Eastern-built units of this series carry different fresh tanks, so the page's figure is not exact for every VIN.";
  }
  if (labels.sleeps && /up to/i.test(rows.find((r) => /^Sleeps\b/i.test(r)) ?? "")) labels.sleeps = "Sleeps (up to)";
  if (!Object.keys(specs).length) return { skip: "no_parsable_specs" };
  // Published floorplan name, e.g. "270BHSW Sport Edition" (title) or "270BHSW - Sport Edition" (page heading).
  const heading = text.split("\n").find((l) => normCode(l.split(" - ")[0]) === normCode(code) && l.length <= 60 && l.includes(" - "));
  const nameLine = heading ?? (published.toUpperCase() !== code ? published : undefined);
  const rec: ManufacturerSpecRecord = {
    year, make: "Jayco", series, floorplanCode: code, sourceUrl: url, retrievedAt: today(), labels, specs,
    ...(nameLine && nameLine.toUpperCase() !== code ? { floorplanName: nameLine } : {}),
    ...(note ? { note } : {}),
  };
  if (/\bbunk/i.test(nameLine ?? "")) { rec.bunkhouse = true; rec.bunkhouseEvidence = nameLine!; }
  return rec;
}

async function main() {
  const demand = await inventoryDemand("Jayco");
  const sm = await getPage("https://www.jayco.com/sitemap-rvs/");
  if (!sm) throw new Error("Jayco sitemap-rvs unavailable");
  const urls = sitemapLocs(sm.html).filter((u) => { const m = FLOORPLAN_URL.exec(u); return m && !NOT_FLOORPLAN.has(m[4]); });
  const queued = urls.map((u) => { const m = FLOORPLAN_URL.exec(u)!; const k = `${m[2]}|${normCode(m[4])}`; return { u, k, d: demand.get(k) }; })
    .filter((x) => x.d).sort((a, b) => priority(b.k.split("|")[1], b.d!) - priority(a.k.split("|")[1], a.d!));
  const limit = Number(process.env.CRAWL_LIMIT ?? Infinity);
  const records: ManufacturerSpecRecord[] = [];
  const skipped: Record<string, number> = {}; const blocked: string[] = [];
  let fetched = 0, cached = 0;
  for (const { u } of queued.slice(0, limit)) {
    try {
      const page = await getPage(u);
      if (!page) { skipped.http_or_robots = (skipped.http_or_robots ?? 0) + 1; continue; }
      page.fromCache ? cached++ : fetched++;
      const r = parseJaycoPage(page.html, u);
      if ("skip" in r) { const k = r.skip.split(":")[0]; skipped[k] = (skipped[k] ?? 0) + 1; continue; }
      records.push(r);
    } catch (e) {
      if (e instanceof BlockedError) { blocked.push(`${e.url} (${e.reason})`); if (blocked.length >= 3) { console.warn("Jayco is blocking; stopping."); break; } continue; }
      throw e;
    }
    if ((fetched + cached) % 25 === 0) console.log(`jayco: ${fetched + cached}/${queued.length} pages, ${records.length} records`);
  }
  const report = { maker: "Jayco", ranAt: new Date().toISOString(), sitemapFloorplanUrls: urls.length, matchingInventory: queued.length, fetched, cached, records: records.length, skipped, blocked };
  writeMakerRecords("Jayco", "JAYCO_SPEC_RECORDS", records, report);
  console.log(JSON.stringify(report));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });

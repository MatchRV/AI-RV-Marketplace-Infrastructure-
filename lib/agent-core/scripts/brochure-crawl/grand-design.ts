/**
 * Grand Design crawler: https://www.granddesignrv.com/<type>/<series>/<floorplan>
 * Grand Design publishes each floorplan's spec sheet as structured page metadata
 * (cludo:field_* tags: sleep capacity, UVW, GVWR, pin/hitch weight, length,
 * tanks, slides, standard bunk dimensions). Only the current model year is on
 * the site; the year is read from the page's own FloorplanName ("2027 Imagine …").
 *
 *   npx tsx scripts/brochure-crawl/grand-design.ts
 */
import type { ManufacturerSpecRecord, SpecField } from "../../src/manufacturer-specs.js";
import { BlockedError, getPage, inventoryDemand, normCode, priority, sitemapLocs, decodeEntities, today } from "./common.js";
import { writeMakerRecords } from "./write-records.js";

const FLOORPLAN_URL = /^https:\/\/www\.granddesignrv\.com\/(travel-trailers|fifth-wheels|toy-haulers|motorized|motorhomes)\/([a-z0-9-]+)\/([a-z0-9-]+)$/;

const NA = (v: string | undefined) => v === undefined || /^\s*(n\/?a|none|-|0|)\s*$/i.test(v);
const num = (v: string | undefined): number | null => {
  if (NA(v)) return null;
  const m = /([\d,]+(?:\.\d+)?)/.exec(v!);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

export function parseGrandDesignPage(html: string, url: string): ManufacturerSpecRecord | { skip: string } {
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta name="cludo:([^"]+)" content="([^"]*)"/g)) meta[m[1]] = decodeEntities(m[2]).trim();
  const fpName = meta.FloorplanName ?? "";
  const y = /^(20\d{2})\s/.exec(fpName);
  if (!y) return { skip: `no_model_year:${fpName}` };
  const code = (meta.TrueName ?? "").toUpperCase();
  // "Reflection Travel Trailer" / "Momentum G-Class Fifth Wheel" → the series name used in listing titles.
  const series = (meta.Brand ?? "").replace(/\s+(Travel Trailers?|Fifth Wheels?|Toy Haulers?)$/i, "").trim();
  if (!code || !series) return { skip: "no_code_or_series" };
  if (normCode(code) !== normCode(FLOORPLAN_URL.exec(url)?.[3] ?? "")) return { skip: "code_mismatch_url" };
  const dealerStock = meta.IsDealerStock === "true"; // discontinued floorplan still on dealer lots; Grand Design still publishes its spec sheet
  const specs: Partial<Record<SpecField, number>> = {};
  const labels: Partial<Record<SpecField, string>> = {};
  const put = (f: SpecField, v: number | null, label: string) => { if (v !== null) { specs[f] = v; labels[f] = label; } };
  put("sleeps", num(meta.field_sleep_capacity), "Sleep Capacity");
  put("dryWeightLbs", num(meta.field_uvw), "UVW");
  put("gvwrLbs", num(meta.field_gvwr), "GVWR");
  // Motorized pages reuse this field for towing/hitch capacity, which is not the unit's own hitch weight.
  if (!/\/motorized\//.test(url)) put("hitchWeightLbs", num(meta.field_pin_weight ?? meta.field_pin_weight_formatted), /fifth/.test(url) ? "Pin Weight" : "Hitch Weight");
  const lenIn = num(meta.field_length_inches);
  put("lengthFt", lenIn !== null ? Math.round((lenIn / 12) * 100) / 100 : null, "Length");
  put("freshWaterGal", num(meta.field_fresh_wc), "Fresh Water");
  put("greyWaterGal", num(meta.field_grey_wc), "Grey Water");
  put("blackWaterGal", num(meta.field_waste_wc), "Black/Waste Water");
  const slides = meta.field_num_slides;
  if (slides !== undefined && /^\d$/.test(slides)) put("slideouts", Number(slides), "Number of Slides");
  if (!Object.keys(specs).length) return { skip: "no_parsable_specs" };
  const rec: ManufacturerSpecRecord = {
    year: Number(y[1]), make: "Grand Design", series, floorplanCode: code, sourceUrl: url, retrievedAt: today(),
    labels, specs, floorplanName: fpName,
    ...(dealerStock ? { note: "Grand Design lists this floorplan as dealer stock (no longer in current production); spec sheet as published." } : {}),
  };
  // Bunkhouse: Grand Design's spec sheet lists "Standard Bunk Dimensions" for floorplans with bunks.
  const bunkDim = meta.field_std_bunk_dim;
  // Yes only. "N/A" is NOT a denial: e.g. the Reflection 342BHTS bunkhouse also shows N/A.
  if (!NA(bunkDim)) { rec.bunkhouse = true; rec.bunkhouseEvidence = `Standard Bunk Dimensions: ${bunkDim}`; }
  if (!NA(meta.field_spec_notes)) rec.note = `${rec.note ? rec.note + " " : ""}Grand Design spec note: ${meta.field_spec_notes}`;
  return rec;
}

async function main() {
  const demand = await inventoryDemand("Grand Design");
  const sm = await getPage("https://www.granddesignrv.com/sitemap.xml");
  if (!sm) throw new Error("Grand Design sitemap unavailable");
  const urls = sitemapLocs(sm.html).filter((u) => FLOORPLAN_URL.test(u) && !/dealer-stock/.test(u));
  // The site carries one model year; queue every floorplan whose code exists in inventory for any year, demand-ordered.
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
      const r = parseGrandDesignPage(page.html, u);
      if ("skip" in r) { const k = r.skip.split(":")[0]; skipped[k] = (skipped[k] ?? 0) + 1; continue; }
      records.push(r);
    } catch (e) {
      if (e instanceof BlockedError) { blocked.push(`${e.url} (${e.reason})`); if (blocked.length >= 3) break; continue; }
      throw e;
    }
  }
  const report = { maker: "Grand Design", ranAt: new Date().toISOString(), sitemapFloorplanUrls: urls.length, matchingInventory: queued.length, fetched, cached, records: records.length, skipped, blocked,
    note: "granddesignrv.com publishes only the current model year; older years are not on the site." };
  writeMakerRecords("Grand Design", "GRAND_DESIGN_SPEC_RECORDS", records, report);
  console.log(JSON.stringify(report));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });

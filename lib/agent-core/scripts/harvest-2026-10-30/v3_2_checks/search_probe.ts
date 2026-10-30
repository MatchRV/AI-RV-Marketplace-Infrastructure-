import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { indexSnapshot, runSearch, resolvePlace, haversineMiles } from "@workspace/agent-core";
// Run from artifacts/api-server: node --import tsx <copy>.ts <snapshot.json.gz> <tag>
import { screenMcpInventory } from "./src/services/mcp-inventory-quality";
const [path, tag] = [process.argv[2], process.argv[3]];
const snap = JSON.parse(gunzipSync(readFileSync(path)).toString("utf-8"));
// raw lat/lng presence for WA units with blank/state city
const raw = snap.units as any[];
const waRaw = raw.filter(u => (u.dealer?.state||"").toUpperCase()==="WA");
const rawStats = { waUnits: waRaw.length, waBlankCity: waRaw.filter(u=>!u.dealer.city||u.dealer.city.toUpperCase()==="WA").length,
  waBlankCityWithLatLng: waRaw.filter(u=>(!u.dealer.city||u.dealer.city.toUpperCase()==="WA") && u.dealer.lat!=null).length,
  waWithRawLatLng: waRaw.filter(u=>u.dealer.lat!=null).length };
const idx = screenMcpInventory(indexSnapshot(snap));
const units = idx.units;
const t = resolvePlace("Tacoma")!;
const wa = units.filter(u => (u.dealer.state||"").toUpperCase()==="WA");
const noCoords = wa.filter(u => u.dealer.lat==null);
const byDom: Record<string, number> = {};
for (const u of noCoords) { const d = u.provenance?.dealerDomain ?? u.dealer.id.split(":")[0]; byDom[d]=(byDom[d]??0)+1; }
const q = (name: string, c: any) => { const o = runSearch(units, c); const r = o.results;
  return { name, pass: r.filter((m:any)=>m.hardStatus==="pass").length, unverified: r.filter((m:any)=>m.hardStatus==="unverified").length, total: o.funnel?.total ?? units.length, funnel: o.funnel }; };
const out: any = { tag, raw: rawStats, served: units.length, tacoma: t, waServed: wa.length, waNoCoords: noCoords.length, waNoCoordsByDomain: byDom, searches: [] };
for (const r of [50, 100]) {
  out.searches.push(q(`Tacoma ${r}mi all`, { location: { place: "Tacoma", radiusMiles: r } }));
  out.searches.push(q(`Tacoma ${r}mi travel_trailer`, { location: { place: "Tacoma", radiusMiles: r }, rvTypes: ["travel_trailer"] }));
}
out.searches.push(q("used TT <$40k within 100mi Tacoma", { location: { place: "Tacoma", radiusMiles: 100 }, rvTypes: ["travel_trailer"], condition: "used", priceMaxUsd: 40000 }));
out.searches.push(q("new fifth wheel (nationwide)", { rvTypes: ["fifth_wheel"], condition: "new" }));
out.searches.push(q("new fifth wheel within 100mi Tacoma", { location: { place: "Tacoma", radiusMiles: 100 }, rvTypes: ["fifth_wheel"], condition: "new" }));
// raw geometric counts (lat/lng only, no other filters)
const within = (r: number) => units.filter(u => u.dealer.lat!=null && haversineMiles(t, {lat:u.dealer.lat!,lng:u.dealer.lng!})<=r).length;
out.geomWithin50 = within(50); out.geomWithin100 = within(100);
writeFileSync(`/workspace/harvest-2026-10-30/geo/search_${tag}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ tag, ...rawStats, served: units.length, waNoCoords: noCoords.length, g50: out.geomWithin50, g100: out.geomWithin100, s: out.searches.map((s:any)=>`${s.name}: pass=${s.pass} unv=${s.unverified}`) }, null, 1));

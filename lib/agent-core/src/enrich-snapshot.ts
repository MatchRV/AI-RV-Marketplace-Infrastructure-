/**
 * Runtime enrichment for the committed MarketCheck/Replit snapshot.
 *
 * The live snapshot ships with null dealer lat/lng and sparse sleeps. Rather
 * than recommitting a 49MB JSON blob on every fix, we geocode dealers from
 * city/state once when the snapshot is indexed. Sleeping capacity is NEVER
 * inferred for serving: it comes from the dealer listing (or the dealer's VIN
 * feed) or a matched manufacturer spec; otherwise it stays null (not published).
 *
 * IMPORTANT: this module must stay browser-safe (no node:fs / path / url).
 * Agent-core is bundled into the Vite marketplace client.
 */

import { EXTRA_CITY_COORDS } from "./national-geo.js";
import type { CanonicalUnit, Fact, RvType } from "./types.js";
import { resolvePlace, scanForCity, CITY_COORDS, haversineMiles, type LatLng } from "./geo.js";
import {
  extractFloorplanCode,
  floorplanSuggestsBunks,
  floorplanCodeIsBunkhouse,
  fact, buildCorpus, extractSpecsFromText, extractBunkhouse,
} from "./enrich.js";
import { VIN_SLEEPS } from "./vin-sleeps.js";
import { DEALER_CITY_COORDS } from "./dealer-city-coords.js";
import { lookupDealer } from "./dealer-registry.js";
import {
  cityFromDealerName, cityKey, dealerCityCandidates, listingLocationFromTitle, reconcileYearAndCondition,
} from "./listing-reconcile.js";

/** Extra US dealer cities present in the MarketCheck snapshot (outside PNW table). */
/**
 * Coarse state centroids. ONLY used to sanity-check that a coordinate lies
 * inside a dealer's state (coordsMatchState). Never assigned to a dealer: a
 * centroid put every unresolved WA dealer ~92 mi from Tacoma (and ~70k units
 * nationwide on their state's centre), which radius search reported as a
 * real distance.
 */
const STATE_COORDS: Record<string, LatLng> = {
  AL: { lat: 32.8067, lng: -86.7911 }, AK: { lat: 61.3707, lng: -152.4044 },
  AZ: { lat: 34.0489, lng: -111.0937 }, AR: { lat: 34.9697, lng: -92.3731 },
  CA: { lat: 36.7783, lng: -119.4179 }, CO: { lat: 39.0598, lng: -105.3111 },
  CT: { lat: 41.6032, lng: -73.0877 }, DE: { lat: 39.3185, lng: -75.5071 },
  DC: { lat: 38.8972, lng: -77.0369 }, FL: { lat: 27.6648, lng: -81.5158 },
  GA: { lat: 33.0406, lng: -83.6431 }, HI: { lat: 21.0943, lng: -157.4983 },
  ID: { lat: 44.0682, lng: -114.742 }, IL: { lat: 40.6331, lng: -89.3985 },
  IN: { lat: 39.8494, lng: -86.2583 }, IA: { lat: 42.0115, lng: -93.2105 },
  KS: { lat: 38.5266, lng: -96.7265 }, KY: { lat: 37.6681, lng: -84.6701 },
  LA: { lat: 31.1695, lng: -91.8678 }, ME: { lat: 44.6939, lng: -69.3819 },
  MD: { lat: 39.0639, lng: -76.8021 }, MA: { lat: 42.2302, lng: -71.5301 },
  MI: { lat: 43.3266, lng: -84.5361 }, MN: { lat: 46.1907, lng: -94.6858 },
  MS: { lat: 32.7416, lng: -89.6787 }, MO: { lat: 38.4561, lng: -92.2884 },
  MT: { lat: 46.8797, lng: -110.3626 }, NE: { lat: 41.1254, lng: -98.2681 },
  NV: { lat: 38.3135, lng: -117.0554 }, NH: { lat: 43.4525, lng: -71.5639 },
  NJ: { lat: 40.0583, lng: -74.4057 }, NM: { lat: 34.8405, lng: -106.2485 },
  NY: { lat: 42.9538, lng: -75.5267 }, NC: { lat: 35.6301, lng: -79.8064 },
  ND: { lat: 47.5289, lng: -99.784 }, OH: { lat: 40.3888, lng: -82.7649 },
  OK: { lat: 35.5653, lng: -96.9289 }, OR: { lat: 43.8041, lng: -120.5542 },
  PA: { lat: 40.5908, lng: -77.2098 }, RI: { lat: 41.6809, lng: -71.5118 },
  SC: { lat: 33.8569, lng: -80.945 }, SD: { lat: 44.2998, lng: -99.4388 },
  TN: { lat: 35.7478, lng: -86.6923 }, TX: { lat: 31.9686, lng: -99.9018 },
  UT: { lat: 40.1135, lng: -111.8535 }, VT: { lat: 44.0459, lng: -72.7107 },
  VA: { lat: 37.7693, lng: -78.17 }, WA: { lat: 47.4009, lng: -120.5015 },
  WV: { lat: 38.5976, lng: -80.4549 }, WI: { lat: 44.2685, lng: -89.6165 },
  WY: { lat: 42.756, lng: -107.3025 },
};

const CITY_ALIASES_EXTRA: Record<string, string> = {
  "mt vernon": "mount vernon",
  "mt. vernon": "mount vernon",
  kitsap: "bremerton",
  "ft myers": "fort myers",
  "ft. myers": "fort myers",
  "ft worth": "fort worth",
  "ft. worth": "fort worth",
  "ft pierce": "fort pierce",
};

/**
 * Max plausible miles from a state's centroid to any point in it. City tables
 * are keyed by bare name ("lakewood" = Lakewood WA), so a hit for a dealer in
 * another state (Windish RV, Lakewood CO) must be rejected, not trusted.
 */
const STATE_RADIUS_MI: Record<string, number> = { AK: 1500, HI: 400, TX: 600, CA: 550, MT: 400, FL: 450, NV: 400, MI: 400, NY: 350, ID: 350, OR: 300, WA: 280 };
const DEFAULT_STATE_RADIUS_MI = 350;

/** True when coords are plausibly inside `state` (or the state is unknown). */
export function coordsMatchState(coords: LatLng, state: string | null | undefined): boolean {
  const st = (state || "").toUpperCase();
  const centroid = STATE_COORDS[st];
  if (!centroid) return true;
  return haversineMiles(coords, centroid) <= (STATE_RADIUS_MI[st] ?? DEFAULT_STATE_RADIUS_MI);
}

/**
 * Real coordinates for a dealer city, or null. Null means "location unknown":
 * the unit gets no distance and radius searches exclude it. Never falls back
 * to a state centroid.
 */
export function resolveDealerCoords(city: string, state: string, dealerName?: string | null, dealerDomain?: string | null): LatLng | null {
  return resolveDealerLocation(city, state, dealerName, dealerDomain)?.coords ?? null;
}

/** Like resolveDealerCoords, but also returns the city name that resolved. */
export function resolveDealerLocation(city: string, state: string, dealerName?: string | null, dealerDomain?: string | null): { coords: LatLng; city: string } | null {
  const st = (state || "").toUpperCase();
  const raw = (city || "").trim();
  const candidates = raw && raw.toLowerCase() !== "unknown" && raw.toUpperCase() !== st ? dealerCityCandidates(raw) : [];
  const fromName = cityFromDealerName(dealerName);
  if (fromName) candidates.push(...dealerCityCandidates(fromName).slice(0, 1));
  // Curated single-store registry city (wa-dealers.json), same state only.
  // Multi-location dealers are skipped: their default city is not the unit's store.
  const reg = dealerDomain ? lookupDealer(dealerDomain) : null;
  if (reg && reg.state.toUpperCase() === st && !/\blocations?\b/i.test(dealerName ?? "")) candidates.push(reg.city);
  for (const c of candidates) {
    const hit = resolveCityInState(c, st);
    if (hit) return { coords: hit, city: c };
  }
  return null;
}

function resolveCityInState(city: string, st: string): LatLng | null {
  const aliased = CITY_ALIASES_EXTRA[city.toLowerCase()] ?? city;
  // State-qualified gazetteer first: unambiguous ("Lakewood|CO" ≠ "Lakewood|WA").
  if (st) {
    const g = DEALER_CITY_COORDS[cityKey(aliased, st)];
    if (g) return { lat: g[0], lng: g[1] };
  }
  const hit = resolveDealerCoordsUnchecked(aliased, st);
  return hit && coordsMatchState(hit, st) ? hit : null;
}

/** Camping World stores all share one domain; never label one store with another's city. */
export function chainStoreName(name: string, city: string): string {
  const m = /^camping world of (.+)$/i.exec(name.trim());
  if (!m || !city || city.toLowerCase() === "unknown") return name;
  return m[1].trim().toLowerCase() === city.trim().toLowerCase() ? name : `Camping World of ${city.trim()}`;
}

function resolveDealerCoordsUnchecked(city: string, state: string): LatLng | null {
  const st = (state || "").toUpperCase();
  const raw = (city || "").trim().toLowerCase();
  if (!raw || raw === "unknown") return null;
  const aliased = CITY_ALIASES_EXTRA[raw] ?? raw;

  if (aliased === "longview" && st === "TX") {
    return EXTRA_CITY_COORDS.longview_tx;
  }

  const fromTable = resolvePlace(aliased) ?? resolvePlace(`${aliased}, ${st}`);
  if (fromTable) return { lat: fromTable.lat, lng: fromTable.lng };
  if (CITY_COORDS[aliased]) return CITY_COORDS[aliased];
  if (EXTRA_CITY_COORDS[aliased]) return EXTRA_CITY_COORDS[aliased];
  const scanned = scanForCity(aliased);
  if (scanned) return { lat: scanned.lat, lng: scanned.lng };
  return null;
}

/**
 * Industry-typical sleeping capacity from floorplan / type when dealer omits it.
 * @deprecated Not used for serving (facts-only rule): an estimate is never
 * shown to shoppers or used to match. Kept only for offline analysis.
 */
export function inferSleeps(unit: {
  sleeps: Fact<number>;
  floorplanCode: string | null;
  title: string;
  model: string;
  rvType: RvType;
  lengthFt: Fact<number>;
  bunkhouse: Fact<boolean>;
}): Fact<number> {
  if (unit.sleeps.value !== null) return unit.sleeps;

  const code =
    unit.floorplanCode ??
    extractFloorplanCode(unit.model || "", unit.title || "");
  const lengthFromCode = code ? parseInt(code.replace(/\D.*$/, ""), 10) : null;
  const length =
    unit.lengthFt.value ??
    (lengthFromCode && lengthFromCode >= 8 && lengthFromCode <= 60 ? lengthFromCode : null);

  const bunk =
    unit.bunkhouse.value === true ||
    floorplanSuggestsBunks(code) ||
    /\bbunk/i.test(`${unit.title} ${unit.model}`);

  if (bunk) {
    let sleeps = 8;
    if (length !== null) {
      if (length < 18) sleeps = 6;
      else if (length < 26) sleeps = 8;
      else sleeps = 10;
    }
    return fact(
      sleeps,
      "derived_model_code",
      "medium",
      code
        ? `Inferred from bunkhouse floorplan ${code} (dealer did not publish sleeps).`
        : "Inferred from bunkhouse layout (dealer did not publish sleeps).",
    );
  }

  const byType: Record<RvType, number> = {
    truck_camper: 3,
    popup_camper: 4,
    class_b: 2,
    class_c: 6,
    class_a: 6,
    fifth_wheel: 6,
    toy_hauler: 6,
    travel_trailer: 4,
  };
  let sleeps = byType[unit.rvType] ?? 4;
  if (length !== null) {
    if (
      unit.rvType === "travel_trailer" ||
      unit.rvType === "fifth_wheel" ||
      unit.rvType === "toy_hauler"
    ) {
      if (length < 18) sleeps = 4;
      else if (length < 28) sleeps = 6;
      else sleeps = 8;
    }
  }

  return fact(
    sleeps,
    "computed",
    "low",
    `Inferred from ${unit.rvType.replace(/_/g, " ")}${
      length ? ` (~${length} ft)` : ""
    } — dealer did not publish sleeps; confirm with dealer.`,
  );
}

export interface EnrichStats {
  geocoded: number;
  /** Always 0 now: unresolved dealers get no coordinates (kept for log compatibility). */
  stateFallback: number;
  /** Units whose dealer city could not be geocoded: no distance, excluded from radius search. */
  unresolvedLocation: number;
  /** Units moved to the store named in their own title ("… | Jacksonville, FL"). */
  relocatedFromTitle: number;
  /** Units whose model year was corrected from title/VIN evidence. */
  yearCorrected: number;
  /** Units labelled new demoted to used (model year < current-1, or title says used). */
  conditionCorrected: number;
  stillMissingCoords: number;
  sleepsFromVin: number;
  /** Always 0 now: sleeps are never inferred (kept for log compatibility). */
  sleepsInferred: number;
  sleepsAlreadyKnown: number;
  /** Units with no dealer-published sleeps; left null (not published). */
  sleepsNotPublished: number;
}

/** Mutates units in place (snapshot is loaded once per process). */
function isStateCentroid(lat: number, lng: number): boolean {
  return Object.values(STATE_COORDS).some((c) => c.lat === lat && c.lng === lng);
}

export function enrichSnapshotUnits(units: CanonicalUnit[], now = new Date()): EnrichStats {
  const stats: EnrichStats = {
    geocoded: 0,
    stateFallback: 0,
    unresolvedLocation: 0,
    relocatedFromTitle: 0,
    yearCorrected: 0,
    conditionCorrected: 0,
    stillMissingCoords: 0,
    sleepsFromVin: 0,
    sleepsInferred: 0,
    sleepsAlreadyKnown: 0,
    sleepsNotPublished: 0,
  };

  for (const u of units) {
    // Revalidate legacy text-derived evidence when loading an existing snapshot.
    const corpus = buildCorpus(u.title, u.description, u.features);
    if (u.lengthFt.source === "derived_text") {
      u.lengthFt = fact(extractSpecsFromText(corpus).lengthFt, "derived_text", "medium", "Revalidated explicit overall-length evidence; component measurements excluded.");
    }
    // Scraped listing flags were historically promoted from generic feature text.
    // Preserve explicit negatives, but require unit-specific evidence for positives.
    u.bunkhouse = extractBunkhouse(u.bunkhouse.value === false ? false : null, corpus, u.floorplanCode, u.rvType);
    if (u.sleeps.source === "derived_model_code" || u.sleeps.source === "computed") {
      u.sleeps = fact<number>(null, null, null);
    }

    const rec = reconcileYearAndCondition(u, now);
    if (rec.yearCorrected) stats.yearCorrected++;
    if (rec.conditionCorrected) stats.conditionCorrected++;

    // The listing's own location beats a chain's HQ city (General RV units were
    // all filed under Wayland, MI while their titles name the selling store).
    const loc = listingLocationFromTitle(u.title);
    if (loc && (loc.state !== (u.dealer.state || "").toUpperCase() || loc.city.toLowerCase() !== (u.dealer.city || "").trim().toLowerCase())) {
      const domain = u.dealer.id.split(":")[0] || u.provenance.dealerDomain;
      u.dealer = { ...u.dealer, id: `${domain}:${loc.city.toLowerCase().replace(/\s+/g, "-")}-${loc.state.toLowerCase()}`, city: loc.city, state: loc.state, lat: null, lng: null };
      stats.relocatedFromTitle++;
    }

    u.dealer.name = chainStoreName(u.dealer.name, u.dealer.city);
    if (u.dealer.lat !== null && u.dealer.lng !== null
      && (!coordsMatchState({ lat: u.dealer.lat, lng: u.dealer.lng }, u.dealer.state) || isStateCentroid(u.dealer.lat, u.dealer.lng))) {
      u.dealer.lat = null;
      u.dealer.lng = null;
    }
    if (u.dealer.lat === null || u.dealer.lng === null) {
      const resolved = resolveDealerLocation(u.dealer.city || "", u.dealer.state || "", u.dealer.name, u.provenance?.dealerDomain ?? u.dealer.id.split(":")[0]);
      if (resolved) {
        u.dealer.lat = resolved.coords.lat;
        u.dealer.lng = resolved.coords.lng;
        // Street-glued or state-only city ("Pacific Hwy EFife", "WA"): show the city that resolved.
        if (resolved.city.toLowerCase() !== (u.dealer.city || "").trim().toLowerCase()) {
          u.dealer.city = resolved.city.replace(/(^|[\s'-])\w/g, (c) => c.toUpperCase());
        }
        stats.geocoded++;
      } else {
        stats.unresolvedLocation++;
        stats.stillMissingCoords++;
      }
    }

    if (u.sleeps.value !== null) {
      stats.sleepsAlreadyKnown++;
      continue;
    }

    const vin = u.vin?.toUpperCase();
    const fromVin = vin ? VIN_SLEEPS[vin] : undefined;
    if (fromVin != null) {
      u.sleeps = fact(
        fromVin,
        "dealer_listing",
        "high",
        "Backfilled from MatchRV WA/OR/ID dealer feed.",
      );
      stats.sleepsFromVin++;
      continue;
    }

    if (!u.floorplanCode) {
      u.floorplanCode = extractFloorplanCode(u.model || "", u.title || "");
    }
    if (u.bunkhouse.value === null && floorplanCodeIsBunkhouse(u.floorplanCode, u.rvType)) {
      u.bunkhouse = fact(
        true,
        "derived_model_code",
        "medium",
        `Floorplan code ${u.floorplanCode} carries the manufacturer's BH (bunkhouse) label on a towable.`,
      );
    }

    // Facts only: no dealer- or manufacturer-published sleeps → null (not published).
    u.sleeps = fact<number>(null, null, null, "Sleeping capacity not published by the dealer; confirm with the dealer.");
    stats.sleepsNotPublished++;
  }

  return stats;
}

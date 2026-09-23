/**
 * Runtime enrichment for the committed MarketCheck/Replit snapshot.
 *
 * The live snapshot ships with null dealer lat/lng and sparse sleeps. Rather
 * than recommitting a 49MB JSON blob on every fix, we geocode dealers from
 * city/state and infer sleeping capacity (with explicit low/medium confidence)
 * once when the snapshot is indexed.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CanonicalUnit, Fact, RvType } from "./types.js";
import { resolvePlace, scanForCity, CITY_COORDS, type LatLng } from "./geo.js";
import {
  extractFloorplanCode,
  floorplanSuggestsBunks,
  fact,
} from "./enrich.js";

/** Extra US dealer cities present in the MarketCheck snapshot (outside PNW table). */
const EXTRA_CITY_COORDS: Record<string, LatLng> = {
  hewitt: { lat: 31.4624, lng: -97.1953 },
  lincolnshire: { lat: 42.19, lng: -87.9084 },
  alvarado: { lat: 32.4065, lng: -97.2117 },
  "fort myers": { lat: 26.6406, lng: -81.8723 },
  yuma: { lat: 32.6927, lng: -114.6277 },
  buda: { lat: 30.0852, lng: -97.8403 },
  caledonia: { lat: 42.9731, lng: -77.8553 },
  "junction city": { lat: 44.2193, lng: -123.2057 },
  rockford: { lat: 42.2711, lng: -89.094 },
  "panama city": { lat: 30.1588, lng: -85.6602 },
  tonawanda: { lat: 42.985, lng: -78.8778 },
  "fort worth": { lat: 32.7555, lng: -97.3308 },
  fairfield: { lat: 38.2494, lng: -122.04 },
  seguin: { lat: 29.5688, lng: -97.9647 },
  bath: { lat: 42.337, lng: -77.3178 },
  willis: { lat: 30.4249, lng: -95.4797 },
  "college station": { lat: 30.628, lng: -96.3344 },
  "grass valley": { lat: 39.2191, lng: -121.0611 },
  montclair: { lat: 34.0775, lng: -117.6898 },
  meridian: { lat: 43.6121, lng: -116.3915 },
  "idaho falls": { lat: 43.4917, lng: -112.044 },
  boerne: { lat: 29.7947, lng: -98.7317 },
  chandler: { lat: 33.3062, lng: -111.8413 },
  jacksonville: { lat: 30.3322, lng: -81.6557 },
  conroe: { lat: 30.3119, lng: -95.4561 },
  "jane lew": { lat: 39.109, lng: -80.4076 },
  beaverton: { lat: 45.4871, lng: -122.8037 },
  tucson: { lat: 32.2226, lng: -110.9747 },
  "fort pierce": { lat: 27.4467, lng: -80.3256 },
  // TX Longview (WA Longview already in CITY_COORDS — state disambiguates via caller)
  longview_tx: { lat: 32.5007, lng: -94.7405 },
  phoenix: { lat: 33.4484, lng: -112.074 },
  mesa: { lat: 33.4152, lng: -111.8315 },
  dallas: { lat: 32.7767, lng: -96.797 },
  houston: { lat: 29.7604, lng: -95.3698 },
  austin: { lat: 30.2672, lng: -97.7431 },
  "san antonio": { lat: 29.4241, lng: -98.4936 },
  orlando: { lat: 28.5383, lng: -81.3792 },
  tampa: { lat: 27.9506, lng: -82.4572 },
  miami: { lat: 25.7617, lng: -80.1918 },
  denver: { lat: 39.7392, lng: -104.9903 },
  "las vegas": { lat: 36.1699, lng: -115.1398 },
  sacramento: { lat: 38.5816, lng: -121.4944 },
  "los angeles": { lat: 34.0522, lng: -118.2437 },
  "san diego": { lat: 32.7157, lng: -117.1611 },
  chicago: { lat: 41.8781, lng: -87.6298 },
  atlanta: { lat: 33.749, lng: -84.388 },
};

/** Coarse state centroids — only used when city is Unknown/unresolvable. */
const STATE_COORDS: Record<string, LatLng> = {
  WA: { lat: 47.4009, lng: -120.5015 },
  OR: { lat: 43.8041, lng: -120.5542 },
  ID: { lat: 44.0682, lng: -114.742 },
  MT: { lat: 46.8797, lng: -110.3626 },
  CA: { lat: 36.7783, lng: -119.4179 },
  AZ: { lat: 34.0489, lng: -111.0937 },
  TX: { lat: 31.9686, lng: -99.9018 },
  FL: { lat: 27.6648, lng: -81.5158 },
  NY: { lat: 42.9538, lng: -75.5267 },
  IL: { lat: 40.6331, lng: -89.3985 },
  NJ: { lat: 40.0583, lng: -74.4057 },
  WV: { lat: 38.5976, lng: -80.4549 },
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

function resolveDealerCoords(city: string, state: string): LatLng | null {
  const st = (state || "").toUpperCase();
  const raw = (city || "").trim().toLowerCase();
  if (!raw || raw === "unknown") {
    return STATE_COORDS[st] ?? null;
  }
  const aliased = CITY_ALIASES_EXTRA[raw] ?? raw;

  // Disambiguate Longview TX vs WA
  if (aliased === "longview" && st === "TX") {
    return EXTRA_CITY_COORDS.longview_tx;
  }

  const fromTable = resolvePlace(aliased) ?? resolvePlace(`${aliased}, ${st}`);
  if (fromTable) return { lat: fromTable.lat, lng: fromTable.lng };
  if (CITY_COORDS[aliased]) return CITY_COORDS[aliased];
  if (EXTRA_CITY_COORDS[aliased]) return EXTRA_CITY_COORDS[aliased];
  const scanned = scanForCity(aliased);
  if (scanned) return { lat: scanned.lat, lng: scanned.lng };
  return STATE_COORDS[st] ?? null;
}

/** Industry-typical sleeping capacity from floorplan / type when dealer omits it. */
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

let vinSleepsCache: Map<string, number> | null | undefined;

function loadVinSleeps(): Map<string, number> | null {
  if (vinSleepsCache !== undefined) return vinSleepsCache;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../data/vin-sleeps.json"),
    resolve(here, "../../data/vin-sleeps.json"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) {
    vinSleepsCache = null;
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, number>;
    vinSleepsCache = new Map(Object.entries(raw));
  } catch {
    vinSleepsCache = null;
  }
  return vinSleepsCache;
}

export interface EnrichStats {
  geocoded: number;
  stateFallback: number;
  stillMissingCoords: number;
  sleepsFromVin: number;
  sleepsInferred: number;
  sleepsAlreadyKnown: number;
}

/** Mutates units in place (snapshot is loaded once per process). */
export function enrichSnapshotUnits(units: CanonicalUnit[]): EnrichStats {
  const vinSleeps = loadVinSleeps();
  const stats: EnrichStats = {
    geocoded: 0,
    stateFallback: 0,
    stillMissingCoords: 0,
    sleepsFromVin: 0,
    sleepsInferred: 0,
    sleepsAlreadyKnown: 0,
  };

  for (const u of units) {
    if (u.dealer.lat === null || u.dealer.lng === null) {
      const city = (u.dealer.city || "").trim();
      const coords = resolveDealerCoords(city, u.dealer.state || "");
      if (coords) {
        u.dealer.lat = coords.lat;
        u.dealer.lng = coords.lng;
        if (!city || city.toLowerCase() === "unknown") stats.stateFallback++;
        else stats.geocoded++;
      } else {
        stats.stillMissingCoords++;
      }
    }

    if (u.sleeps.value !== null) {
      stats.sleepsAlreadyKnown++;
      continue;
    }

    const vin = u.vin?.toUpperCase();
    const fromVin = vin && vinSleeps ? vinSleeps.get(vin) : undefined;
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
    if (u.bunkhouse.value === null && floorplanSuggestsBunks(u.floorplanCode)) {
      u.bunkhouse = fact(
        true,
        "derived_model_code",
        "medium",
        `Floorplan code ${u.floorplanCode} indicates a bunk layout.`,
      );
    }

    u.sleeps = inferSleeps(u);
    stats.sleepsInferred++;
  }

  return stats;
}

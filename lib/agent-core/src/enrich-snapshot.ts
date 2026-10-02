/**
 * Runtime enrichment for the committed MarketCheck/Replit snapshot.
 *
 * The live snapshot ships with null dealer lat/lng and sparse sleeps. Rather
 * than recommitting a 49MB JSON blob on every fix, we geocode dealers from
 * city/state and infer sleeping capacity (with explicit low/medium confidence)
 * once when the snapshot is indexed.
 *
 * IMPORTANT: this module must stay browser-safe (no node:fs / path / url).
 * Agent-core is bundled into the Vite marketplace client.
 */

import { EXTRA_CITY_COORDS } from "./national-geo.js";
import type { CanonicalUnit, Fact, RvType } from "./types.js";
import { resolvePlace, scanForCity, CITY_COORDS, type LatLng } from "./geo.js";
import {
  extractFloorplanCode,
  floorplanSuggestsBunks,
  fact,
} from "./enrich.js";
import { VIN_SLEEPS } from "./vin-sleeps.js";

/** Extra US dealer cities present in the MarketCheck snapshot (outside PNW table). */
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

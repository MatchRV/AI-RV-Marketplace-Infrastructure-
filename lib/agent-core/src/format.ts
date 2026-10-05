/**
 * Compact formatters for WebMCP tool results.
 *
 * Chrome's WebMCP guidance recommends keeping individual tool outputs around
 * ~1.5K characters so they don't blow up the agent's context. These builders
 * produce dense, structured JSON summaries; the full detail always remains
 * one `get_unit_details` call away, and the human sees everything in the UI.
 */

import type { CanonicalUnit, Fact, MotorhomeSpecs, SearchOutcome, UnitMatch } from "./types.js";
import { freshnessHours } from "./dataset.js";

const usd = (n: number | null) => (n === null ? null : Math.round(n));

export function compactUnitSummary(m: UnitMatch): Record<string, unknown> {
  const u = m.unit;
  const meets = m.hardChecks.filter((h) => h.status === "pass").length;
  const why = m.softChecks
    .filter((s) => s.satisfied === true)
    .map((s) => s.preference)
    .slice(0, 3);
  const sleepsConfirmed =
    u.sleeps.value !== null &&
    (u.sleeps.source === "dealer_listing" || u.sleeps.confidence === "high");
  return {
    id: u.id,
    unit_id: u.id,
    title: u.title,
    price: usd(u.priceUsd.value),
    lengthFt: u.lengthFt.value,
    dryLbs: u.dryWeightLbs.value,
    sleeps: u.sleeps.value,
    sleepsConfirmed,
    sleepsSource: u.sleeps.source,
    sleepsConfidence: u.sleeps.confidence,
    distanceMi: m.distanceMiles,
    dealer: `${u.dealer.name}, ${u.dealer.city}${u.dealer.state ? `, ${u.dealer.state}` : ""}`,
    dealerState: u.dealer.state,
    match: m.score,
    verified: m.hardStatus === "pass",
    checks: `${meets}/${m.hardChecks.length}`,
    ...(m.identicalUnitIds?.length ? { inStock: m.identicalUnitIds.length + 1 } : {}),
    ...(why.length ? { plus: why } : {}),
    ...(m.unknownFields.length ? { unknown: m.unknownFields.slice(0, 3) } : {}),
  };
}

export function compactSearchResult(
  outcome: SearchOutcome,
  limit: number,
): Record<string, unknown> {
  const shown = outcome.results.slice(0, limit);
  const coverage = outcome.coverage;
  const emptyGuidance = coverage?.noLocalMatches
    ? `No local matches within ${coverage.radiusMiles} mi of ${coverage.requestedArea}. Do not substitute out-of-area inventory. Ask the shopper to widen radius_miles or pick another place.`
    : "No units satisfy every hard constraint. Relax one (see excluded counts) or move it to a soft preference.";

  return {
    funnel: {
      searched: outcome.funnel.totalUnits,
      verifiedMatches: outcome.funnel.passedHard,
      unverified: outcome.funnel.unverified,
      excluded: outcome.funnel.excluded.slice(0, 6).map((e) => `${e.reason}: ${e.count}`),
    },
    locationResolution: outcome.locationResolution,
    coverage: {
      requested_area: coverage?.requestedArea ?? null,
      radius_miles: outcome.locationResolution?.state ? null : coverage?.radiusMiles ?? null,
      scope: outcome.locationResolution?.state ? "state" : outcome.locationResolution ? "radius" : "nationwide",
      units_in_area: coverage?.unitsInArea ?? null,
      nationwide_total: coverage?.nationwideTotal ?? outcome.funnel.totalUnits,
      no_local_matches: coverage?.noLocalMatches ?? false,
    },
    ...(outcome.towResolution
      ? {
          towVehicle: {
            resolved: outcome.towResolution.matched?.label ?? outcome.towResolution.input,
            capLbs: outcome.towResolution.filterCapLbs,
            note: outcome.towResolution.caveats[0],
          },
        }
      : {}),
    results: shown.map(compactUnitSummary),
    ...(shown.length === 0
      ? { guidance: emptyGuidance }
      : {
          note: "Cite coverage.units_in_area for local inventory size. sleepsConfirmed=false means inferred — say so. get_rv for full detail.",
        }),
  };
}

export function compactUnitDetail(u: CanonicalUnit): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: u.id,
    title: u.title,
    type: u.rvType,
    condition: u.condition,
  };
  if (u.floorplanCode) out.floorplan = u.floorplanCode;

  const fact = (label: string, f: { value: unknown; source: string | null }) => {
    out[label] = f.value;
    if (f.value !== null && f.source) out[`${label}_src`] = f.source;
  };
  fact("price", u.priceUsd);
  fact("lengthFt", u.lengthFt);
  fact("dryLbs", u.dryWeightLbs);
  fact("gvwrLbs", u.gvwrLbs);
  fact("hitchLbs", u.hitchWeightLbs);
  fact("sleeps", u.sleeps);
  fact("slides", u.slideouts);
  fact("freshGal", u.freshWaterGal);
  fact("greyGal", u.greyWaterGal);
  fact("blackGal", u.blackWaterGal);
  fact("bunkhouse", u.bunkhouse);
  fact("entryDoors", u.entryDoors);
  fact("solar", u.solar);
  fact("lithium", u.lithiumBattery);
  fact("generator", u.generator);
  fact("fourSeason", u.fourSeason);
  fact("outdoorKitchen", u.outdoorKitchen);

  out.boondocking = u.boondocking.score;
  out.dealer = { name: u.dealer.name, city: u.dealer.city, state: u.dealer.state, site: u.dealer.website };
  out.lastVerified = u.provenance.lastSeenAt;
  out.legend =
    "null = dealer does not publish this (verify before purchase). _src: dealer_listing = structured dealer data; derived_text/derived_model_code = parsed from dealer text (medium confidence); computed = deterministic MatchRV calculation.";
  return out;
}

/** Full evidence payload for get_rv; intentionally separate from compact search cards. */
export function unitKnowledgeReceipts(u: CanonicalUnit): Record<string, unknown> {
  const listingUrl = u.provenance.sourceUrl ?? null;
  const observedAt = u.provenance.lastSeenAt;
  const receipt = (f: Fact<unknown>) => ({
    value: f.value,
    source: f.source,
    confidence: f.confidence,
    sourceUrl: f.value === null ? null : f.sourceUrl ?? listingUrl,
    observedAt: f.value === null ? null : f.observedAt ?? observedAt,
    ...(f.note ? { note: f.note } : {}),
  });
  const core = {
    priceUsd: u.priceUsd, msrpUsd: u.msrpUsd, lengthFt: u.lengthFt,
    dryWeightLbs: u.dryWeightLbs, gvwrLbs: u.gvwrLbs,
    hitchWeightLbs: u.hitchWeightLbs, sleeps: u.sleeps,
  };
  const facts = Object.fromEntries(Object.entries(core).map(([key, value]) => [key, receipt(value)]));
  const result: Record<string, unknown> = {
    facts,
    availability: { status: u.status, source: "dealer_website_snapshot", sourceUrl: listingUrl, observedAt },
    photos: { urls: u.images, source: "dealer_website_snapshot", sourceUrl: listingUrl, observedAt },
    identity: { year: u.year, make: u.make, model: u.model, vin: u.vin, chassis: u.motorhome?.chassis.value ?? null, sourceUrl: listingUrl, observedAt },
  };
  if (["class_a", "class_b", "class_c"].includes(u.rvType)) {
    const keys: (keyof MotorhomeSpecs)[] = [
      "uvwLbs", "occcLbs", "cccLbs", "gcwrLbs", "frontAxleRatingLbs",
      "rearAxleRatingLbs", "receiverHitchRatingLbs", "tongueWeightRatingLbs",
      "engine", "horsepowerHp", "torqueLbFt", "transmission", "chassis",
      "towCapacityAtGvwrLbs",
    ];
    result.motorhome = Object.fromEntries(keys.map((key) => [key,
      receipt(u.motorhome?.[key] ?? { value: null, source: null, confidence: null }),
    ]));
    result.towingNote = "Tow capacity at GVWR is a screening ceiling, not a safe tow determination. Verify loaded coach weight, GCWR, receiver and tongue ratings, axle limits and vehicle-specific equipment.";
  }
  return result;
}

export function availabilitySummary(u: CanonicalUnit, datasetNote: string): Record<string, unknown> {
  const hours = freshnessHours(u);
  return {
    id: u.id,
    status: u.status,
    lastVerified: u.provenance.lastSeenAt,
    hoursSinceVerified: Math.round(hours),
    stale: hours > 48,
    datasetNote,
    guidance:
      "Treat anything not verified within 48h as needing dealer confirmation. submit_dealer_contact (after human approval) is the way to confirm with the dealership.",
  };
}

/** Rough char-size guard used in tests: keep compact outputs lean. */
export function jsonSize(v: unknown): number {
  return JSON.stringify(v).length;
}

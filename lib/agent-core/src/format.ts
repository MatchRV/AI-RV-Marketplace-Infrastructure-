/**
 * Compact formatters for WebMCP tool results.
 *
 * Chrome's WebMCP guidance recommends keeping individual tool outputs around
 * ~1.5K characters so they don't blow up the agent's context. These builders
 * produce dense, structured JSON summaries; the full detail always remains
 * one `get_unit_details` call away, and the human sees everything in the UI.
 */

import type { CanonicalUnit, SearchOutcome, UnitMatch } from "./types.js";
import { freshnessHours } from "./dataset.js";

const usd = (n: number | null) => (n === null ? null : Math.round(n));

export function compactUnitSummary(m: UnitMatch): Record<string, unknown> {
  const u = m.unit;
  const meets = m.hardChecks.filter((h) => h.status === "pass").length;
  const why = m.softChecks
    .filter((s) => s.satisfied === true)
    .map((s) => s.preference)
    .slice(0, 3);
  return {
    id: u.id,
    title: u.title,
    price: usd(u.priceUsd.value),
    lengthFt: u.lengthFt.value,
    dryLbs: u.dryWeightLbs.value,
    sleeps: u.sleeps.value,
    distanceMi: m.distanceMiles,
    dealer: `${u.dealer.name}, ${u.dealer.city}`,
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
  return {
    funnel: {
      searched: outcome.funnel.totalUnits,
      verifiedMatches: outcome.funnel.passedHard,
      unverified: outcome.funnel.unverified,
      excluded: outcome.funnel.excluded.slice(0, 6).map((e) => `${e.reason}: ${e.count}`),
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
      ? {
          guidance:
            "No units satisfy every hard constraint. Relax one (see excluded counts) or move it to a soft preference.",
        }
      : {
          note: "Page shows these same results. explain_match/get_unit_details for depth; 'unknown' = dealer doesn't publish it, not 'no'.",
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

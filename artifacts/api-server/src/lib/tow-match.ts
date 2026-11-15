/**
 * One answer per RV to "can my truck tow this?", built from the two checks
 * MatchRV already runs (tow rating vs trailer weight, payload vs tongue/pin
 * weight) and the weights the dealer or manufacturer actually published.
 *
 * It never says "safe". The best answer is that the unit clears the limits
 * that were checked; anything not checked is listed under stillToConfirm.
 */
import { TOWABLE_TYPES, type CanonicalUnit, type PayloadFit, type TowFitResult } from "@workspace/agent-core";

export type TowMatchAnswer =
  | "over_limit"
  | "not_towable"
  | "depends_on_truck_configuration"
  | "clears_checked_limits_with_margin"
  | "clears_checked_limits_tight"
  | "not_yet_confirmed";

export interface TowMatch {
  unit_id: string;
  title: string;
  answer: TowMatchAnswer;
  headline: string;
  limitingFactor: "tow_rating" | "payload" | "tow_rating_and_payload" | null;
  checks: {
    towRating: { status: "clears_with_margin" | "clears_tight" | "depends_on_configuration" | "over" | "unknown" | "not_checked"; detail: string };
    payload: { status: "clears_with_margin" | "clears_tight" | "over" | "unknown" | "not_checked"; detail: string };
  };
  weightsUsed: Record<"gvwrLbs" | "dryWeightLbs" | "hitchWeightLbs", { value: number | null; source: string | null }>;
  stillToConfirm: string[];
}

const fact = (f: { value: number | null; source?: string | null }) => ({ value: f.value ?? null, source: f.value != null ? f.source ?? null : null });

export function towMatch(unit: CanonicalUnit, fit: TowFitResult | null, payload: PayloadFit | null, opts: { ratingIsExact: boolean }): TowMatch {
  const weightsUsed = { gvwrLbs: fact(unit.gvwrLbs), dryWeightLbs: fact(unit.dryWeightLbs), hitchWeightLbs: fact(unit.hitchWeightLbs) };
  const base = { unit_id: unit.id, title: unit.title, weightsUsed };
  const part = unit.rvType === "fifth_wheel" ? "pin" : "tongue";

  if (!TOWABLE_TYPES.includes(unit.rvType)) {
    return {
      ...base, answer: "not_towable", limitingFactor: null,
      headline: "This is a motorhome, not a trailer: it is driven, not towed.",
      checks: { towRating: { status: "not_checked", detail: "Not a towable RV." }, payload: { status: "not_checked", detail: "Not a towable RV." } },
      stillToConfirm: [],
    };
  }

  const towRating: TowMatch["checks"]["towRating"] = !fit
    ? { status: "not_checked", detail: "No tow vehicle was given, so the tow rating was not checked." }
    : {
        status: fit.verdict === "fits_with_margin" ? "clears_with_margin" : fit.verdict === "marginal" ? "clears_tight" : fit.verdict === "depends_on_config" ? "depends_on_configuration" : fit.verdict === "exceeds" ? "over" : "unknown",
        detail: fit.detail,
      };
  const pay: TowMatch["checks"]["payload"] = !payload
    ? { status: "not_checked", detail: "No door-sticker payload was given, so payload was not checked. Payload usually runs out before the tow rating does." }
    : { status: payload.verdict === "fits" ? "clears_with_margin" : payload.verdict === "tight" ? "clears_tight" : payload.verdict === "exceeds" ? "over" : "unknown", detail: payload.detail };

  const stillToConfirm: string[] = [];
  if (unit.gvwrLbs.value == null) stillToConfirm.push("The trailer's GVWR from its own weight sticker (the dealer does not publish it, so the loaded weight is not known).");
  if (!fit) stillToConfirm.push("The truck's tow rating for its exact configuration (owner's manual or manufacturer towing guide).");
  else if (!opts.ratingIsExact) stillToConfirm.push("The truck's exact tow rating: a model name covers a wide range by engine, cab, axle ratio and tow package.");
  if (!payload) stillToConfirm.push("The truck's payload from the yellow sticker inside the driver's door.");
  stillToConfirm.push(`Actual loaded ${part} weight on a scale, the hitch or receiver rating, and the truck's rear axle and combined (GCWR) limits.`);

  const towOver = towRating.status === "over";
  const payOver = pay.status === "over";
  if (towOver || payOver) {
    const limitingFactor = towOver && payOver ? "tow_rating_and_payload" : towOver ? "tow_rating" : "payload";
    return {
      ...base, answer: "over_limit", limitingFactor,
      headline: limitingFactor === "payload"
        ? `Over the truck's payload once the ${part} weight, people and cargo are added.`
        : limitingFactor === "tow_rating" ? "Heavier than the truck's tow rating." : "Over both the truck's tow rating and its payload.",
      checks: { towRating, payload: pay }, stillToConfirm,
    };
  }
  if (towRating.status === "depends_on_configuration") {
    return {
      ...base, answer: "depends_on_truck_configuration", limitingFactor: "tow_rating",
      headline: "Some configurations of this truck can tow it and some cannot. The exact tow rating decides.",
      checks: { towRating, payload: pay }, stillToConfirm,
    };
  }
  const cleared = (s: string) => s === "clears_with_margin" || s === "clears_tight";
  if (cleared(towRating.status) && cleared(pay.status)) {
    const tight = towRating.status === "clears_tight" || pay.status === "clears_tight";
    return {
      ...base, answer: tight ? "clears_checked_limits_tight" : "clears_checked_limits_with_margin", limitingFactor: tight ? (pay.status === "clears_tight" ? "payload" : "tow_rating") : null,
      headline: tight
        ? "Within the tow rating and payload that were checked, but with little room to spare."
        : "Within the tow rating and payload that were checked, with margin. Not a safety guarantee.",
      checks: { towRating, payload: pay }, stillToConfirm,
    };
  }
  const clearedNames = [cleared(towRating.status) ? "tow rating" : null, cleared(pay.status) ? "payload" : null].filter(Boolean);
  return {
    ...base, answer: "not_yet_confirmed", limitingFactor: null,
    headline: clearedNames.length
      ? `Clears the ${clearedNames.join(" and ")} check, but the other check could not be completed. Not confirmed yet.`
      : "Cannot be confirmed from the numbers available.",
    checks: { towRating, payload: pay }, stillToConfirm,
  };
}

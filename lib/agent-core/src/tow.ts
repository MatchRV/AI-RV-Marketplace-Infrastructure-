/**
 * Tow-vehicle reference data and fit evaluation.
 *
 * Safety posture: tow ratings vary widely by engine, cab, bed, drivetrain,
 * axle ratio, and package — a bare "F-150" spans 5,000–13,500 lbs. So we
 * never pretend one number. With only a model name we evaluate against the
 * RANGE ("fits any configuration" vs "depends on configuration" vs "exceeds
 * all") and hand the agent the follow-up questions that narrow it: which
 * engine, which tow package, what the door-jamb label says. Every detail the
 * shopper adds tightens the band; a stated rating replaces it and we plan
 * against that with a safety margin. Output is planning guidance, never a
 * safety guarantee — and it says so.
 */

import type {
  CanonicalUnit,
  TowFitResult,
  TowQuestion,
  TowResolution,
  TowVariant,
  TowVehicleSpec,
  TowVerdict,
} from "./types.js";
import { TOWABLE_TYPES } from "./types.js";

/** Fraction of a stated tow rating we treat as comfortably usable. */
export const TOW_SAFETY_MARGIN = 0.8;

// ── Powertrain bands ────────────────────────────────────────────────────────
// Approximate bands from manufacturer towing guides, ~2019–2025 model years,
// conventional (bumper-pull) towing. Order matters: the first alias that
// matches wins, so specific tokens ("i-force max", "powerboost") come before
// the tokens they contain, and umbrella tokens ("ecoboost", "v8") come last.

const F150_VARIANTS: TowVariant[] = [
  { key: "raptor", label: "Raptor", aliases: ["raptor"], towLbsMin: 8200, towLbsMax: 8200 },
  { key: "lightning", label: "Lightning (electric)", aliases: ["lightning"], towLbsMin: 5000, towLbsMax: 10000, note: "10,000 lbs needs the extended-range battery and Max Tow." },
  { key: "powerboost", label: "3.5L PowerBoost hybrid", aliases: ["powerboost", "hybrid"], towLbsMin: 11200, towLbsMax: 12700 },
  { key: "ecoboost_35", label: "3.5L EcoBoost V6", aliases: ["3.5"], towLbsMin: 11000, towLbsMax: 13500, packageMinLbs: 12700 },
  { key: "ecoboost_27", label: "2.7L EcoBoost V6", aliases: ["2.7"], towLbsMin: 7600, towLbsMax: 10100 },
  { key: "v8_50", label: "5.0L V8", aliases: ["5.0", "v8", "coyote"], towLbsMin: 8700, towLbsMax: 13000, packageMinLbs: 11000 },
  { key: "v6_33", label: "3.3L V6", aliases: ["3.3", "ti-vct"], towLbsMin: 5000, towLbsMax: 8200, note: "8,200 lbs needs the Trailer Tow package." },
  { key: "ecoboost_any", label: "EcoBoost (2.7L or 3.5L?)", aliases: ["ecoboost"], towLbsMin: 7600, towLbsMax: 13500, ambiguous: true, options: ["2.7L EcoBoost V6", "3.5L EcoBoost V6"] },
];

const GM_HALF_TON_VARIANTS: TowVariant[] = [
  { key: "duramax_30", label: "3.0L Duramax diesel", aliases: ["3.0", "duramax", "diesel"], towLbsMin: 8800, towLbsMax: 13300 },
  { key: "v8_62", label: "6.2L V8", aliases: ["6.2"], towLbsMin: 9300, towLbsMax: 13300 },
  { key: "v8_53", label: "5.3L V8", aliases: ["5.3"], towLbsMin: 8000, towLbsMax: 11300 },
  { key: "turbo_27", label: "2.7L Turbo (TurboMax)", aliases: ["2.7", "turbomax", "turbo four", "four-cylinder", "4-cylinder"], towLbsMin: 6700, towLbsMax: 9500 },
  { key: "v8_any", label: "V8 (5.3L or 6.2L?)", aliases: ["v8"], towLbsMin: 8000, towLbsMax: 13300, ambiguous: true, options: ["5.3L V8", "6.2L V8"] },
];

const RAM_1500_VARIANTS: TowVariant[] = [
  { key: "trx", label: "TRX", aliases: ["trx"], towLbsMin: 8100, towLbsMax: 8100 },
  { key: "ecodiesel", label: "3.0L EcoDiesel", aliases: ["ecodiesel", "diesel"], towLbsMin: 8800, towLbsMax: 12560 },
  { key: "hurricane", label: "3.0L Hurricane I6", aliases: ["hurricane", "i6", "inline-six", "straight-six"], towLbsMin: 8250, towLbsMax: 11580 },
  { key: "hemi_57", label: "5.7L HEMI V8", aliases: ["5.7", "hemi", "v8"], towLbsMin: 8900, towLbsMax: 12750 },
  { key: "v6_36", label: "3.6L Pentastar V6", aliases: ["3.6", "pentastar", "v6"], towLbsMin: 6100, towLbsMax: 7730 },
];

const TUNDRA_VARIANTS: TowVariant[] = [
  { key: "iforce_max", label: "i-FORCE MAX hybrid (2022+)", aliases: ["i-force max", "iforce max", "hybrid"], towLbsMin: 10340, towLbsMax: 11450 },
  { key: "iforce_34", label: "3.4L i-FORCE twin-turbo V6 (2022+)", aliases: ["3.4", "i-force", "iforce", "twin-turbo", "twin turbo"], towLbsMin: 8300, towLbsMax: 12000 },
  { key: "v8_57", label: "5.7L V8 (2007–2021)", aliases: ["5.7", "v8"], towLbsMin: 8800, towLbsMax: 10200 },
];

const TACOMA_VARIANTS: TowVariant[] = [
  { key: "iforce_max", label: "i-FORCE MAX hybrid (2024+)", aliases: ["i-force max", "iforce max", "hybrid"], towLbsMin: 6000, towLbsMax: 6000 },
  { key: "turbo_24", label: "2.4L turbo (2024+)", aliases: ["2.4", "turbo", "i-force"], towLbsMin: 3500, towLbsMax: 6500, packageMinLbs: 6000 },
  { key: "v6_35", label: "3.5L V6 (2016–2023)", aliases: ["3.5", "v6"], towLbsMin: 3500, towLbsMax: 6800, packageMinLbs: 6400 },
];

const F250_VARIANTS: TowVariant[] = [
  { key: "diesel_67", label: "6.7L Power Stroke diesel", aliases: ["6.7", "power stroke", "powerstroke", "diesel"], towLbsMin: 15000, towLbsMax: 20000 },
  { key: "gas_73", label: "7.3L V8 gas", aliases: ["7.3", "godzilla"], towLbsMin: 12300, towLbsMax: 15000 },
  { key: "gas_68", label: "6.8L V8 gas", aliases: ["6.8"], towLbsMin: 12000, towLbsMax: 14500 },
  { key: "gas_any", label: "gas V8 (7.3L or 6.8L?)", aliases: ["gas", "gasoline"], towLbsMin: 12000, towLbsMax: 15000, ambiguous: true, options: ["7.3L V8 gas", "6.8L V8 gas"] },
];

const F350_VARIANTS: TowVariant[] = [
  { key: "diesel_67", label: "6.7L Power Stroke diesel", aliases: ["6.7", "power stroke", "powerstroke", "diesel"], towLbsMin: 18000, towLbsMax: 21200 },
  { key: "gas_73", label: "7.3L V8 gas", aliases: ["7.3", "godzilla"], towLbsMin: 13500, towLbsMax: 15000 },
  { key: "gas_68", label: "6.8L V8 gas", aliases: ["6.8"], towLbsMin: 12500, towLbsMax: 14500 },
  { key: "gas_any", label: "gas V8 (7.3L or 6.8L?)", aliases: ["gas", "gasoline"], towLbsMin: 12500, towLbsMax: 15000, ambiguous: true, options: ["7.3L V8 gas", "6.8L V8 gas"] },
];

const RANGER_VARIANTS: TowVariant[] = [
  { key: "raptor", label: "Raptor 3.0L EcoBoost", aliases: ["raptor", "3.0"], towLbsMin: 5510, towLbsMax: 5510 },
  { key: "ecoboost_27", label: "2.7L EcoBoost (2024+)", aliases: ["2.7"], towLbsMin: 7500, towLbsMax: 7500 },
  { key: "ecoboost_23", label: "2.3L EcoBoost", aliases: ["2.3"], towLbsMin: 3500, towLbsMax: 7500, packageMinLbs: 7500 },
];

const GRAND_CHEROKEE_VARIANTS: TowVariant[] = [
  { key: "4xe", label: "4xe plug-in hybrid", aliases: ["4xe", "hybrid", "phev"], towLbsMin: 6000, towLbsMax: 6000 },
  { key: "hemi_57", label: "5.7L HEMI V8", aliases: ["5.7", "hemi", "v8"], towLbsMin: 7200, towLbsMax: 7200 },
  { key: "v6_36", label: "3.6L V6", aliases: ["3.6", "v6"], towLbsMin: 3500, towLbsMax: 6200 },
];

const DURANGO_VARIANTS: TowVariant[] = [
  { key: "v8_64", label: "6.4L V8 (SRT)", aliases: ["6.4", "srt"], towLbsMin: 8700, towLbsMax: 8700 },
  { key: "hemi_57", label: "5.7L HEMI V8", aliases: ["5.7"], towLbsMin: 7400, towLbsMax: 7400 },
  { key: "v6_36", label: "3.6L V6", aliases: ["3.6", "v6"], towLbsMin: 6200, towLbsMax: 6200 },
  { key: "v8_any", label: "V8 (5.7L or 6.4L?)", aliases: ["v8", "hemi"], towLbsMin: 7400, towLbsMax: 8700, ambiguous: true, options: ["5.7L HEMI V8", "6.4L V8 (SRT)"] },
];

/**
 * Curated from manufacturer-published ratings for recent model years
 * (~2019-2025). Ranges span common configurations, not records.
 */
export const TOW_VEHICLES: TowVehicleSpec[] = [
  { key: "ford_f150", label: "Ford F-150", aliases: ["f-150", "f150", "f 150"], towLbsMin: 5000, towLbsMax: 13500, note: "Varies by engine/cab/axle; many are 7,000-11,300 lbs.", variants: F150_VARIANTS, towPackageName: "Max Trailer Tow package" },
  { key: "ford_f250", label: "Ford F-250 Super Duty", aliases: ["f-250", "f250", "f 250"], towLbsMin: 12300, towLbsMax: 20000, note: "Conventional hitch; gooseneck/5th-wheel higher.", variants: F250_VARIANTS },
  { key: "ford_f350", label: "Ford F-350 Super Duty", aliases: ["f-350", "f350", "f 350"], towLbsMin: 14000, towLbsMax: 21200, note: "Conventional hitch; gooseneck/5th-wheel higher.", variants: F350_VARIANTS },
  { key: "ford_ranger", label: "Ford Ranger", aliases: ["ranger"], towLbsMin: 3500, towLbsMax: 7500, note: "7,500 lbs requires the tow package.", variants: RANGER_VARIANTS, towPackageName: "Trailer Tow package" },
  { key: "ford_maverick", label: "Ford Maverick", aliases: ["maverick"], towLbsMin: 2000, towLbsMax: 4000, note: "4,000 lbs requires the 4K tow package.", towPackageName: "4K Tow package", packageMinLbs: 4000 },
  { key: "ford_expedition", label: "Ford Expedition", aliases: ["expedition"], towLbsMin: 6000, towLbsMax: 9600, note: "Heavy-duty tow package required for the top rating.", towPackageName: "Heavy-Duty Trailer Tow package", packageMinLbs: 9000 },
  { key: "ford_explorer", label: "Ford Explorer", aliases: ["explorer"], towLbsMin: 3000, towLbsMax: 5600, note: "" },
  { key: "chevrolet_silverado_1500", label: "Chevrolet Silverado 1500", aliases: ["silverado", "silverado 1500"], towLbsMin: 6700, towLbsMax: 13300, note: "Varies by engine and axle.", variants: GM_HALF_TON_VARIANTS, towPackageName: "Max Trailering package" },
  { key: "chevrolet_silverado_2500", label: "Chevrolet Silverado 2500HD", aliases: ["silverado 2500", "silverado 2500hd"], towLbsMin: 14500, towLbsMax: 18500, note: "" },
  { key: "chevrolet_silverado_3500", label: "Chevrolet Silverado 3500HD", aliases: ["silverado 3500", "silverado 3500hd"], towLbsMin: 14500, towLbsMax: 20000, note: "Conventional hitch; gooseneck higher." },
  { key: "chevrolet_suburban", label: "Chevrolet Suburban", aliases: ["suburban"], towLbsMin: 7400, towLbsMax: 8300, note: "" },
  { key: "chevrolet_tahoe", label: "Chevrolet Tahoe", aliases: ["tahoe"], towLbsMin: 7400, towLbsMax: 8400, note: "" },
  { key: "chevrolet_colorado", label: "Chevrolet Colorado", aliases: ["colorado"], towLbsMin: 3500, towLbsMax: 7700, note: "" },
  { key: "chevrolet_traverse", label: "Chevrolet Traverse", aliases: ["traverse"], towLbsMin: 1500, towLbsMax: 5000, note: "5,000 lbs requires the tow package.", towPackageName: "Trailering package", packageMinLbs: 5000 },
  { key: "gmc_sierra_1500", label: "GMC Sierra 1500", aliases: ["sierra", "sierra 1500"], towLbsMin: 6700, towLbsMax: 13200, note: "Varies by engine and axle.", variants: GM_HALF_TON_VARIANTS, towPackageName: "Max Trailering package" },
  { key: "gmc_yukon", label: "GMC Yukon", aliases: ["yukon", "yukon xl"], towLbsMin: 7400, towLbsMax: 8400, note: "" },
  { key: "ram_1500", label: "Ram 1500", aliases: ["ram", "ram 1500"], towLbsMin: 6100, towLbsMax: 12750, note: "Varies by engine and axle.", variants: RAM_1500_VARIANTS, towPackageName: "Trailer Tow Group" },
  { key: "ram_2500", label: "Ram 2500", aliases: ["ram 2500"], towLbsMin: 14000, towLbsMax: 19680, note: "" },
  { key: "ram_3500", label: "Ram 3500", aliases: ["ram 3500"], towLbsMin: 15000, towLbsMax: 23000, note: "Conventional hitch; gooseneck far higher." },
  { key: "toyota_tundra", label: "Toyota Tundra", aliases: ["tundra"], towLbsMin: 8300, towLbsMax: 12000, note: "", variants: TUNDRA_VARIANTS, towPackageName: "Tow package" },
  { key: "toyota_tacoma", label: "Toyota Tacoma", aliases: ["tacoma"], towLbsMin: 3500, towLbsMax: 6800, note: "6,800 lbs requires the tow package.", variants: TACOMA_VARIANTS, towPackageName: "Tow package" },
  { key: "toyota_4runner", label: "Toyota 4Runner", aliases: ["4runner", "4 runner"], towLbsMin: 5000, towLbsMax: 6000, note: "" },
  { key: "toyota_sequoia", label: "Toyota Sequoia", aliases: ["sequoia"], towLbsMin: 8980, towLbsMax: 9520, note: "" },
  { key: "toyota_highlander", label: "Toyota Highlander", aliases: ["highlander"], towLbsMin: 3500, towLbsMax: 5000, note: "" },
  { key: "jeep_grand_cherokee", label: "Jeep Grand Cherokee", aliases: ["grand cherokee"], towLbsMin: 3500, towLbsMax: 7200, note: "7,200 lbs requires V8/tow package.", variants: GRAND_CHEROKEE_VARIANTS, towPackageName: "Trailer Tow Group" },
  { key: "jeep_gladiator", label: "Jeep Gladiator", aliases: ["gladiator"], towLbsMin: 4000, towLbsMax: 7700, note: "", towPackageName: "Max Tow package", packageMinLbs: 7000 },
  { key: "nissan_titan", label: "Nissan Titan", aliases: ["titan"], towLbsMin: 9270, towLbsMax: 9660, note: "" },
  { key: "nissan_frontier", label: "Nissan Frontier", aliases: ["frontier"], towLbsMin: 6270, towLbsMax: 6720, note: "" },
  { key: "honda_ridgeline", label: "Honda Ridgeline", aliases: ["ridgeline"], towLbsMin: 5000, towLbsMax: 5000, note: "" },
  { key: "honda_pilot", label: "Honda Pilot", aliases: ["pilot"], towLbsMin: 3500, towLbsMax: 5000, note: "AWD required for 5,000 lbs." },
  { key: "dodge_durango", label: "Dodge Durango", aliases: ["durango"], towLbsMin: 6200, towLbsMax: 8700, note: "", variants: DURANGO_VARIANTS, towPackageName: "Trailer Tow Group" },
];

const STANDARD_CAVEATS = [
  "Actual capacity depends on cab, bed, drivetrain, axle ratio, and package — check the door-jamb sticker and owner's manual.",
  "Payload (passengers, cargo, hitch/tongue weight) usually runs out before tow rating does.",
  "This is planning guidance from MatchRV's reference table, not a safety determination for a specific vehicle.",
];

// ── Parsing the shopper's own words ─────────────────────────────────────────

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "3.5" also matches "3.5L", "3.5-liter"; never matches inside "13.5" or "3.55". */
function aliasRe(alias: string): RegExp {
  const displacement = /^\d\.\d$/.test(alias) ? String.raw`(?:\s*(?:l|-?liter|-?litre))?` : "";
  return new RegExp(String.raw`(?<![a-z0-9.])${escapeRe(alias)}${displacement}(?![a-z0-9.])`, "i");
}

function matchVariant(spec: TowVehicleSpec, text: string): TowVariant | null {
  for (const v of spec.variants ?? []) {
    if (v.aliases.some((a) => aliasRe(a).test(text))) return v;
  }
  return null;
}

const PACKAGE_RE =
  /\b(?:max(?:imum)?[\s-]*(?:trailer[\s-]*)?tow(?:ing)?(?:[\s-]*(?:package|pkg))?|max[\s-]*trailering(?:[\s-]*(?:package|pkg))?|(?:trailer|tow)(?:ing)?[\s-]*(?:prep[\s-]*)?(?:package|pkg|group)|heavy[\s-]*duty[\s-]*(?:trailer[\s-]*)?tow(?:ing)?(?:[\s-]*(?:package|pkg))?|hd[\s-]*tow(?:ing)?(?:[\s-]*(?:package|pkg))?|4k[\s-]*tow(?:[\s-]*(?:package|pkg))?)\b/i;
const NEGATION_RE = /(?:\bno|\bwithout|\bw\/o|\bnot|\blacks|\bdoesn'?t\s+have|\bdoes\s+not\s+have|\bmissing)\s+(?:the\s+|a\s+|any\s+)?$/i;

/** true = shopper says it has the tow package, false = says it doesn't, null = didn't say. */
function parseTowPackage(text: string): boolean | null {
  const m = PACKAGE_RE.exec(text);
  if (!m) return null;
  return NEGATION_RE.test(text.slice(Math.max(0, m.index - 24), m.index)) ? false : true;
}

function parseModelYear(text: string): number | null {
  const m = text.match(/\b(?:19[89]\d|20[0-4]\d)\b/);
  return m ? parseInt(m[0], 10) : null;
}

const fmtRange = (r: { min: number; max: number }) => `${r.min.toLocaleString()}–${r.max.toLocaleString()} lbs`;

function exactRatingSources(spec: TowVehicleSpec | null): string[] {
  const make = spec ? spec.label.split(" ")[0] : "The manufacturer";
  return [
    "Door-jamb or hitch label on the vehicle (max trailer weight)",
    "Owner's manual towing section",
    `${make}'s towing guide for the model year — needs engine, cab, bed, drivetrain and axle ratio`,
    "Third-party per-model towing tables such as TorkLift's or Trailer Life's towing guides",
  ];
}

function followUps(spec: TowVehicleSpec, variant: TowVariant | null, towPackage: boolean | null, range: { min: number; max: number }): TowQuestion[] {
  const ask: TowQuestion[] = [];
  const variants = (spec.variants ?? []).filter((v) => !v.ambiguous);
  if (variants.length > 0 && (!variant || variant.ambiguous)) {
    ask.push({
      id: "engine",
      question: `Which engine is in the ${spec.label}?`,
      options: variant?.ambiguous && variant.options
        ? variant.options
        : [...variants].sort((a, b) => a.towLbsMin - b.towLbsMin || a.towLbsMax - b.towLbsMax).map((v) => v.label),
      why: `Engine is the biggest swing in the ${spec.label}'s rating — one answer replaces the ${fmtRange(range)} range with a single engine's band.`,
    });
  }
  const packageMatters = variant ? variant.ambiguous || variant.packageMinLbs != null : spec.packageMinLbs != null || variants.length > 0;
  if (spec.towPackageName && towPackage == null && packageMatters) {
    ask.push({
      id: "package",
      question: `Does it have the ${spec.towPackageName}? (The window sticker or the door-jamb label says.)`,
      why: "The package moves the top of the band by up to a few thousand pounds.",
    });
  }
  if (range.max - range.min > 800) {
    ask.push({
      id: "rating",
      question: `What max trailer weight is on the door-jamb or hitch label (or in the owner's manual)? Failing that: year, engine, cab, bed, 4x2/4x4 and axle ratio pin it down in the ${spec.label.split(" ")[0]} towing guide.`,
      why: `One number replaces the range; MatchRV then plans with a ${Math.round((1 - TOW_SAFETY_MARGIN) * 100)}% safety margin.`,
    });
  }
  return ask;
}

/**
 * Resolve a free-text tow vehicle ("2024 Ford F-150", "F-150 5.0 V8 Max Tow",
 * "F-150 rated 8,000 lbs") to a spec + planning numbers. Engine and tow
 * package narrow the range; an explicit stated rating always wins.
 */
export function resolveTowVehicle(input: string): TowResolution {
  const text = input.trim().toLowerCase();

  const explicit = text.match(/([\d,]{4,7})\s*(?:lb|lbs|pound|#)/);
  const explicitLbs = explicit ? parseInt(explicit[1].replace(/,/g, ""), 10) : null;

  let matched: TowVehicleSpec | null = null;
  let bestLen = 0;
  for (const spec of TOW_VEHICLES) {
    for (const alias of [spec.label.toLowerCase(), ...spec.aliases]) {
      if (text.includes(alias) && alias.length > bestLen) {
        matched = spec;
        bestLen = alias.length;
      }
    }
  }

  const variant = matched ? matchVariant(matched, text) : null;
  const towPackage = parseTowPackage(text);
  const configuration = { modelYear: parseModelYear(text), engine: variant?.label ?? null, towPackage };
  const resolvedLabel = matched ? `${matched.label}${variant ? ` ${variant.label}` : ""}` : input.trim();
  const safetyMarginPct = Math.round((1 - TOW_SAFETY_MARGIN) * 100);
  const caveats = [...STANDARD_CAVEATS];

  if (explicitLbs && explicitLbs >= 1500 && explicitLbs <= 40000) {
    caveats.unshift(
      `Using your stated ${explicitLbs.toLocaleString()} lbs rating; "comfortable" = under ${Math.round(explicitLbs * TOW_SAFETY_MARGIN).toLocaleString()} lbs (${safetyMarginPct}% margin).`,
    );
    return {
      input,
      matched,
      resolvedLabel,
      configuration,
      statedRatingLbs: explicitLbs,
      rangeLbs: matched ? { min: matched.towLbsMin, max: matched.towLbsMax } : null,
      filterCapLbs: explicitLbs,
      comfortCapLbs: Math.round(explicitLbs * TOW_SAFETY_MARGIN),
      safetyMarginPct,
      caveats,
      askShopper: [],
      exactRatingSources: [],
    };
  }

  if (matched) {
    let min = matched.towLbsMin;
    let max = matched.towLbsMax;
    const packageFloor = variant ? variant.packageMinLbs : matched.packageMinLbs;
    if (variant) {
      min = variant.towLbsMin;
      max = variant.towLbsMax;
    }
    if (packageFloor != null && towPackage === true) min = Math.max(min, packageFloor);
    if (packageFloor != null && towPackage === false) max = Math.min(max, packageFloor);
    if (min > max) min = max;
    const range = { min, max };
    const ask = followUps(matched, variant, towPackage, range);

    const toAsk: string[] = [];
    if (ask.some((q) => q.id === "engine")) toAsk.push("which engine");
    if (ask.some((q) => q.id === "package")) toAsk.push(`whether it has the ${matched.towPackageName}`);
    const narrowing = toAsk.length > 0
      ? `Ask ${toAsk.join(" and ")}, or the door-sticker rating (e.g. "rated 8,000 lbs"), before recommending anything near the top of the range.`
      : `State the door-sticker rating (e.g. "rated ${max.toLocaleString()} lbs") for precision.`;
    caveats.unshift(
      `${resolvedLabel} ratings span ${fmtRange(range)} by ${variant ? "cab, bed, axle ratio and package" : "configuration"}. ${narrowing} Filtering out anything above the top rating; results show whether a unit fits any configuration or only some.`,
    );
    if (variant?.note) caveats.push(variant.note);
    else if (matched.note) caveats.push(matched.note);
    return {
      input,
      matched,
      resolvedLabel,
      configuration,
      statedRatingLbs: null,
      rangeLbs: range,
      filterCapLbs: max,
      comfortCapLbs: Math.round(min * TOW_SAFETY_MARGIN),
      safetyMarginPct,
      caveats,
      askShopper: ask,
      exactRatingSources: exactRatingSources(matched),
    };
  }

  caveats.unshift(
    "Vehicle not in MatchRV's reference table — provide the tow rating from the door-jamb label or owner's manual (e.g. \"rated 8,000 lbs\") for weight-aware matching.",
  );
  return {
    input,
    matched: null,
    resolvedLabel,
    configuration,
    statedRatingLbs: null,
    rangeLbs: null,
    filterCapLbs: null,
    comfortCapLbs: null,
    safetyMarginPct,
    caveats,
    askShopper: [
      {
        id: "rating",
        question: "What max trailer weight is on the door-jamb or hitch label, or in the owner's manual? Year, make, model, engine, cab and axle ratio also pin it down in the manufacturer's towing guide.",
        why: "This vehicle isn't in MatchRV's reference table, so a stated rating is the only way to check weight fit.",
      },
    ],
    exactRatingSources: exactRatingSources(null),
  };
}

/** Evaluate one unit against a tow resolution. Honest about which weight was used. */
export function evaluateTowFit(unit: CanonicalUnit, tow: TowResolution): TowFitResult {
  if (!TOWABLE_TYPES.includes(unit.rvType)) {
    return {
      unitId: unit.id,
      verdict: "not_towable",
      comparedWeightLbs: null,
      comparedWeightField: null,
      detail: `${unit.title} is a drivable ${unit.rvType.replace(/_/g, " ")}, not a towable.`,
    };
  }

  const gvwr = unit.gvwrLbs.value;
  const dry = unit.dryWeightLbs.value;
  const field = gvwr != null ? "gvwrLbs" : dry != null ? "dryWeightLbs" : null;
  const weight = gvwr ?? dry;

  if (field == null || weight == null) {
    return {
      unitId: unit.id,
      verdict: "unknown",
      comparedWeightLbs: null,
      comparedWeightField: null,
      detail: "Dealer listing omits both GVWR and dry weight — weight fit cannot be verified.",
    };
  }

  const basis =
    field === "gvwrLbs"
      ? "GVWR (loaded max)"
      : "dry weight (GVWR unknown; loaded weight typically runs 1,000-1,500+ lbs higher)";

  let verdict: TowVerdict;
  let detail: string;

  if (tow.statedRatingLbs != null) {
    const rating = tow.statedRatingLbs;
    const comfort = tow.comfortCapLbs ?? Math.round(rating * TOW_SAFETY_MARGIN);
    if (weight <= comfort) verdict = "fits_with_margin";
    else if (weight <= rating) verdict = "marginal";
    else verdict = "exceeds";
    detail = `${weight.toLocaleString()} lbs ${basis} vs your ${rating.toLocaleString()} lbs rating (comfort cap ${comfort.toLocaleString()}).`;
  } else if (tow.rangeLbs != null) {
    const { min, max } = tow.rangeLbs;
    if (weight <= Math.round(min * TOW_SAFETY_MARGIN)) verdict = "fits_with_margin";
    else if (weight <= min) verdict = "marginal";
    else if (weight <= max) verdict = "depends_on_config";
    else verdict = "exceeds";
    detail = `${weight.toLocaleString()} lbs ${basis} vs ${tow.resolvedLabel} range ${min.toLocaleString()}–${max.toLocaleString()} lbs.`;
  } else {
    return {
      unitId: unit.id,
      verdict: "unknown",
      comparedWeightLbs: weight,
      comparedWeightField: field,
      detail: "No usable tow rating — provide vehicle details or a stated rating.",
    };
  }

  // A dry-weight-only basis can't support a confident green light.
  if (verdict === "fits_with_margin" && field === "dryWeightLbs") {
    verdict = "marginal";
    detail += " Downgraded to marginal because only dry weight is verified.";
  }

  return { unitId: unit.id, verdict, comparedWeightLbs: weight, comparedWeightField: field, detail };
}

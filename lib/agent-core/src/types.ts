/**
 * Canonical agent-facing RV inventory schema.
 *
 * Design rules (these are the product):
 *  1. Every critical fact carries provenance: where it came from and when.
 *  2. Unknown is a first-class value. We never guess, default, or fabricate.
 *  3. Derived facts (parsed out of dealer text) are labeled as derived, with
 *     lower confidence than facts the dealer listed as structured fields.
 */

/** Where a fact came from. */
export type FactSource =
  | "dealer_listing" // structured field in the dealer's own inventory listing
  | "derived_text" // deterministically parsed from dealer description/features text
  | "derived_model_code" // decoded from the manufacturer floorplan code (e.g. "26BH")
  | "reference_table" // MatchRV curated reference data (e.g. tow ratings)
  | "computed"; // deterministic computation over other known facts

export type Confidence = "high" | "medium" | "low";

/** A fact with provenance. `value: null` means genuinely unknown. */
export interface Fact<T> {
  value: T | null;
  source: FactSource | null; // null when value is null (nothing to attribute)
  confidence: Confidence | null;
  note?: string;
}

export type RvType =
  | "travel_trailer"
  | "fifth_wheel"
  | "toy_hauler"
  | "class_a"
  | "class_b"
  | "class_c"
  | "popup_camper"
  | "truck_camper";

export const TOWABLE_TYPES: RvType[] = [
  "travel_trailer",
  "fifth_wheel",
  "toy_hauler",
  "popup_camper",
  "truck_camper",
];

export type Condition = "new" | "used";

export type SolarStatus = "installed" | "prep" | "none";

export interface DealerRef {
  id: string; // stable slug, e.g. "poulsborv.com:sumner"
  name: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  website: string | null;
}

export interface CanonicalUnit {
  /** Stable MatchRV unit id: "vin:<VIN>" or "stk:<dealer>:<stock>". */
  id: string;
  vin: string | null;
  stockNumber: string | null;
  title: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  /** Manufacturer floorplan code parsed from the model/title, e.g. "26BH". */
  floorplanCode: string | null;
  rvType: RvType;
  condition: Condition;
  status: "available" | "pending" | "removed" | "unknown";

  priceUsd: Fact<number>; // asking price (sale price when the dealer lists one)
  msrpUsd: Fact<number>;
  lengthFt: Fact<number>;
  dryWeightLbs: Fact<number>;
  gvwrLbs: Fact<number>;
  hitchWeightLbs: Fact<number>;
  sleeps: Fact<number>;
  slideouts: Fact<number>;
  freshWaterGal: Fact<number>;
  greyWaterGal: Fact<number>;
  blackWaterGal: Fact<number>;

  bunkhouse: Fact<boolean>;
  entryDoors: Fact<number>;
  solar: Fact<SolarStatus>;
  lithiumBattery: Fact<boolean>;
  generator: Fact<boolean>;
  fourSeason: Fact<boolean>;
  outdoorKitchen: Fact<boolean>;

  /** 0-100 deterministic off-grid readiness score + the receipts. */
  boondocking: {
    score: number | null;
    knownInputs: string[];
    missingInputs: string[];
  };

  dealer: DealerRef;
  images: string[];
  description: string | null;
  features: string[];

  /** Provenance of the record itself. */
  provenance: {
    sourceKind: "dealer_website_snapshot";
    dealerDomain: string;
    firstSeenAt: string; // ISO
    lastSeenAt: string; // ISO — the freshness anchor for check_availability
  };
}

// ── Search constraints ──────────────────────────────────────────────────────

export type FeatureKey =
  | "bunkhouse"
  | "solar"
  | "solar_prep"
  | "lithium"
  | "generator"
  | "four_season"
  | "outdoor_kitchen"
  | "two_entry_doors";

export const FEATURE_KEYS: FeatureKey[] = [
  "bunkhouse",
  "solar",
  "solar_prep",
  "lithium",
  "generator",
  "four_season",
  "outdoor_kitchen",
  "two_entry_doors",
];

export type SortKey =
  | "best_match"
  | "price_asc"
  | "price_desc"
  | "distance"
  | "newest_model_year";

/**
 * The compiled shopping constraints — the shared object the human and the
 * agent both edit. Hard constraints gate; soft preferences rank.
 */
export interface Constraints {
  location?: { place: string; radiusMiles: number } | null;
  priceMaxUsd?: number | null;
  priceMinUsd?: number | null;
  rvTypes?: RvType[] | null;
  condition?: Condition | "any" | null;
  lengthMaxFt?: number | null;
  lengthMinFt?: number | null;
  /** Max unit weight the buyer will accept, compared against GVWR when known, else dry weight (flagged). */
  maxWeightLbs?: number | null;
  /** Free-text tow vehicle, e.g. "2024 Ford F-150". Resolved via the reference table. */
  towVehicle?: string | null;
  sleepsMin?: number | null;
  mustHave?: FeatureKey[] | null; // hard requirements
  prefer?: FeatureKey[] | null; // soft preferences
  freshWaterMinGal?: number | null;
  /** Soft: weight boondocking readiness heavily in ranking. */
  boondocking?: boolean | null;
  sort?: SortKey | null;
}

// ── Match results ───────────────────────────────────────────────────────────

export type CheckStatus = "pass" | "fail" | "unknown";

export interface ConstraintCheck {
  constraint: string; // human-readable, e.g. "price ≤ $45,000"
  status: CheckStatus;
  actual: string; // "42,995 USD" | "unknown"
  source: FactSource | null;
}

export interface SoftCheck {
  preference: string;
  satisfied: boolean | null; // null = unknown
  detail: string;
}

export interface UnitMatch {
  unit: CanonicalUnit;
  /** Other in-stock units identical in model/price/branch (collapsed rows). */
  identicalUnitIds?: string[];
  distanceMiles: number | null;
  /** All hard constraints pass on verified data. */
  hardStatus: "pass" | "unverified" | "fail";
  hardChecks: ConstraintCheck[];
  softChecks: SoftCheck[];
  unknownFields: string[]; // canonical field names that were needed but unknown
  /** 0-100. Deterministic. */
  score: number;
  scoreBreakdown: { label: string; points: number }[];
}

export interface ExclusionBucket {
  reason: string; // e.g. "price above $45,000"
  count: number;
}

export interface SearchFunnel {
  totalUnits: number;
  passedHard: number;
  unverified: number; // no hard fail, but ≥1 hard constraint unverifiable
  excluded: ExclusionBucket[];
}

export interface SearchOutcome {
  funnel: SearchFunnel;
  /** hard-pass matches first (by score), then unverified (flagged). */
  results: UnitMatch[];
  appliedConstraints: Constraints;
  towResolution: TowResolution | null;
  locationResolution: { place: string; lat: number; lng: number } | null;
}

// ── Tow fit ────────────────────────────────────────────────────────────────

export interface TowVariant {
  key: string;
  /** "5.0L V8" */
  label: string;
  /** Lower-cased tokens that identify this powertrain in free text; "3.5" also matches "3.5L" / "3.5-liter". */
  aliases: string[];
  towLbsMin: number;
  towLbsMax: number;
  /** Bottom of the band once the factory tow package is confirmed, where the package moves the band. */
  packageMinLbs?: number;
  /** Umbrella tokens ("EcoBoost", "V8") that still need one more answer; `options` lists the candidates. */
  ambiguous?: boolean;
  options?: string[];
  note?: string;
}

export interface TowVehicleSpec {
  key: string;
  label: string; // "Ford F-150"
  aliases: string[];
  /** Manufacturer-published max tow range across common configurations, lbs. */
  towLbsMin: number;
  towLbsMax: number;
  note: string;
  /** Powertrain bands, when the model's range is wide enough to be worth narrowing. */
  variants?: TowVariant[];
  /** Factory package that unlocks the top of the range, if the model has one worth asking about. */
  towPackageName?: string;
  /** Bottom of the band once that package is confirmed (models without per-engine bands). */
  packageMinLbs?: number;
}

/** A follow-up the agent should put to the shopper to narrow the tow range. */
export interface TowQuestion {
  id: "engine" | "package" | "rating";
  question: string;
  options?: string[];
  why: string;
}

export interface TowResolution {
  input: string;
  matched: TowVehicleSpec | null;
  /** Model plus whatever configuration was parsed: "Ford F-150 5.0L V8". Falls back to the input. */
  resolvedLabel: string;
  /** Configuration details read from the shopper's own words. */
  configuration: { modelYear: number | null; engine: string | null; towPackage: boolean | null };
  /** Rating the shopper explicitly stated ("rated 8,000 lbs"), if any. */
  statedRatingLbs: number | null;
  /** Manufacturer range across configurations, when the vehicle is known. */
  rangeLbs: { min: number; max: number } | null;
  /** Hard-filter cap for search: stated rating, else top of the range. */
  filterCapLbs: number | null;
  /** "Comfortable" planning cap (safety margin applied). */
  comfortCapLbs: number | null;
  safetyMarginPct: number;
  caveats: string[];
  /** Questions that narrow the range (engine, tow package, sticker rating); empty once a rating is stated. */
  askShopper: TowQuestion[];
  /** Where the exact rating comes from: door-jamb label, owner's manual, the manufacturer's towing guide. */
  exactRatingSources: string[];
}

export type TowVerdict =
  | "fits_with_margin"
  | "marginal"
  | "depends_on_config"
  | "exceeds"
  | "not_towable"
  | "unknown";

export interface TowFitResult {
  unitId: string;
  verdict: TowVerdict;
  comparedWeightLbs: number | null;
  comparedWeightField: "gvwrLbs" | "dryWeightLbs" | null;
  detail: string;
}

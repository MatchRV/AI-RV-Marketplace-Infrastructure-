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

export type FuelType = "gas" | "diesel";

/**
 * Motorhome "Powertrain & Towing" section. Each field is its own Fact: power,
 * carrying capacity and towing limits are separate questions and are never
 * inferred from each other or from an engine family (a "Cummins L9" is
 * 330-450 hp depending on configuration; we only store a rating the source
 * states for this unit). Fact.note carries the applicable configuration.
 */
export interface Powertrain {
  fuelType: Fact<FuelType>;
  /** Manufacturer, engine model, displacement as published. */
  engine: Fact<string>;
  horsepower: Fact<number>;
  horsepowerRpm: Fact<number>;
  torqueLbFt: Fact<number>;
  /** Single RPM or range as published, e.g. "1,200-1,400". */
  torqueRpm: Fact<string>;
  /** Manufacturer, model, number of gears. */
  transmission: Fact<string>;
  /** Manufacturer, model, chassis model year. */
  chassis: Fact<string>;
  /** Engine/exhaust brake type as published. */
  engineBrake: Fact<string>;
}

/** Carrying and towing limits for a motorhome, each kept separate. */
export interface MotorhomeTowing {
  cargoCapacityLbs: Fact<number>;
  gcwrLbs: Fact<number>;
  frontAxleRatingLbs: Fact<number>;
  rearAxleRatingLbs: Fact<number>;
  /** Hitch receiver towing rating. Not proof the combination is within GCWR/GVWR/axle limits. */
  hitchTowRatingLbs: Fact<number>;
  tongueWeightLimitLbs: Fact<number>;
}

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

  /** Motorized RVs only. Absent = nothing known (treat every field as unknown). */
  powertrain?: Powertrain;
  towing?: MotorhomeTowing;

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
  /** Hard: engine fuel (motorhomes). */
  fuelType?: FuelType | null;
  /** Hard minimum: a lower stated rating fails, an unknown rating can never pass. */
  horsepowerMin?: number | null;
  /** Soft: ranks units at/above this rating; never excludes. */
  horsepowerPreferred?: number | null;
  /** Hard minimum torque, lb-ft (exact unit's rating, never an engine-family max). */
  torqueMinLbFt?: number | null;
  torquePreferredLbFt?: number | null;
  /** Loaded trailer the motorhome must tow. Non-motorized units fail. */
  trailerWeightLbs?: number | null;
  /** Loaded trailer tongue weight, if the shopper knows it. */
  trailerTongueLbs?: number | null;
  /** Shopper's loaded (weighed) coach weight, if known — checked against GVWR first. */
  coachLoadedWeightLbs?: number | null;
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

export interface SearchCoverage {
  requestedArea: string | null;
  radiusMiles: number | null;
  unitsInArea: number;
  nationwideTotal: number;
  /** True when a location was requested and zero units passed the geo hard filter. */
  noLocalMatches: boolean;
}

export interface SearchOutcome {
  funnel: SearchFunnel;
  /** hard-pass matches first (by score), then unverified (flagged). */
  results: UnitMatch[];
  appliedConstraints: Constraints;
  towResolution: TowResolution | null;
  locationResolution: { place: string; lat: number; lng: number; radiusMiles: number; state?: string } | null;
  coverage: SearchCoverage;
}

// ── Tow fit ────────────────────────────────────────────────────────────────

export interface TowVehicleSpec {
  key: string;
  label: string; // "Ford F-150"
  aliases: string[];
  /** Manufacturer-published max tow range across common configurations, lbs. */
  towLbsMin: number;
  towLbsMax: number;
  note: string;
}

export interface TowResolution {
  input: string;
  matched: TowVehicleSpec | null;
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

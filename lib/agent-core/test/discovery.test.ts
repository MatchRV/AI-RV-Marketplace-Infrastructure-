import { describe, expect, it } from "vitest";
import {
  assessDiscovery,
  estimateTongueRange,
  evaluatePayloadFit,
  normalizeRecord,
  profileToConstraints,
  runSearch,
  type CanonicalUnit,
  type RawScrapeRecord,
} from "../src/index.js";

const base: RawScrapeRecord = {
  dealer_name: "Poulsbo RV",
  dealer_domain: "poulsborv.com",
  dealer_location: "Sumner",
  _first_seen: "2026-04-21T00:00:00Z",
  _last_seen: "2026-05-12T00:00:00Z",
  inventory_status: "available",
  condition: "new",
  year: 2026,
  make: "Keystone",
  model: "Couples 25RL",
  title: "2026 Keystone Couples 25RL Travel Trailer",
  stock_number: "C1",
  vin: "COUPLES00001",
  rv_type: "Travel Trailer",
  price: 32000,
  length: "28",
  dry_weight: 5200,
  gvwr: 6500,
  sleeps: 4,
  slideouts: 1,
  bunkhouse: false,
  description: "Rear living couples layout with a walk-around queen bed.",
  features: ["Power Awning"],
  image_urls: ["https://example.com/a.jpg"],
};

function unit(overrides: Partial<RawScrapeRecord> = {}): CanonicalUnit {
  const r = normalizeRecord("vin:X", { ...base, ...overrides });
  if ("reject" in r) throw new Error(r.reject.reason);
  return r.unit;
}

// The reported failure: a small cheap bunkhouse vs. a couples trailer.
const bunkhouse = () =>
  unit({ vin: "BUNK0000001", stock_number: "B1", model: "Hideout 17BH", title: "2027 Keystone Hideout 17BH Travel Trailer", price: 11999, length: "20", dry_weight: 2544, gvwr: 3518, sleeps: 4, slideouts: 0, bunkhouse: true, description: "Compact bunkhouse for the family." });
const couples = () => unit();

describe("sherpa discovery gate", () => {
  it("blocks a first recommendation until sleeping party is known", () => {
    const a = assessDiscovery({});
    expect(a.readyToSearch).toBe(false);
    expect(a.nextQuestion?.id).toBe("sleepers");
  });

  it("is ready with sleepers alone (floorplan implied), and never re-asks", () => {
    const a = assessDiscovery({ sleepers: 2 });
    expect(a.readyToSearch).toBe(true);
    expect(a.nextQuestion).toBeNull();
    expect(profileToConstraints({ sleepers: 2 }).sherpa?.floorplanIntent).toBe("couples");
  });

  it("respects an explicit 'just show me' waiver", () => {
    expect(assessDiscovery({ discoveryWaived: true }).readyToSearch).toBe(true);
  });

  it("only makes bunks a hard requirement when bunks are explicitly wanted", () => {
    expect(profileToConstraints({ sleepers: 4, kids: 2 }).mustHave).toBeUndefined();
    expect(profileToConstraints({ sleepers: 4, kids: 2, wantsBunks: true }).mustHave).toEqual(["bunkhouse"]);
  });
});

describe("lifestyle ranking (the F-150 complaint)", () => {
  it("ranks a couples trailer above a cheaper bunkhouse for two adults", () => {
    const out = runSearch([bunkhouse(), couples()], {
      sleepsMin: 2,
      sherpa: { sleepers: 2, floorplanIntent: "couples" },
    });
    expect(out.results[0].unit.title).toContain("Couples");
    const bunk = out.results.find((m) => m.unit.title.includes("Hideout"))!;
    const coup = out.results.find((m) => m.unit.title.includes("Couples"))!;
    expect(coup.score - bunk.score).toBeGreaterThanOrEqual(15);
    expect(bunk.scoreBreakdown.some((b) => b.label.includes("lifestyle"))).toBe(true);
  });

  it("ranks the bunkhouse first for a family that wants bunks", () => {
    const out = runSearch([couples(), bunkhouse()], {
      sleepsMin: 4,
      mustHave: ["bunkhouse"],
      sherpa: { sleepers: 4, floorplanIntent: "family_bunks" },
    });
    expect(out.results[0].unit.title).toContain("Hideout");
  });

  it("does not let 'under a weight ceiling' collapse to the smallest trailer", () => {
    // Both under a 6,000-lb dry-weight ceiling; couples intent must still win.
    const out = runSearch([bunkhouse(), couples()], {
      maxWeightLbs: 7000,
      sleepsMin: 2,
      sherpa: { sleepers: 2, floorplanIntent: "couples" },
    });
    expect(out.results[0].unit.title).toContain("Couples");
  });
});

describe("Road to the Sale: length is clarified, never assumed", () => {
  it("asks storage-vs-comfort before searching at a stated cap", () => {
    const a = assessDiscovery({ sleepers: 2, lengthMaxFt: 35 });
    expect(a.readyToSearch).toBe(false);
    expect(a.nextQuestion?.id).toBe("length_reason");
    expect(a.nextQuestion?.prompt).toContain("35-foot");
  });

  it("storage means the cap is exact — no flex question, no extra foot", () => {
    const p = { sleepers: 2, lengthMaxFt: 35, lengthReason: "storage" as const };
    expect(assessDiscovery(p).readyToSearch).toBe(true);
    expect(profileToConstraints(p).lengthMaxFt).toBe(35);
  });

  it("comfort asks permission to keep the gate open, in the buyer's numbers", () => {
    const a = assessDiscovery({ sleepers: 2, lengthMaxFt: 35, lengthReason: "comfort" });
    expect(a.readyToSearch).toBe(false);
    expect(a.nextQuestion?.id).toBe("length_flex");
    expect(a.nextQuestion?.prompt).toContain("37");
  });

  it("approved comfort flexibility opens exactly +2 ft, declined opens nothing", () => {
    expect(profileToConstraints({ sleepers: 2, lengthMaxFt: 35, lengthReason: "comfort", lengthFlexApproved: true }).lengthMaxFt).toBe(37);
    expect(profileToConstraints({ sleepers: 2, lengthMaxFt: 35, lengthReason: "comfort", lengthFlexApproved: false }).lengthMaxFt).toBe(35);
    // Even if flex is somehow flagged, a storage limit never widens.
    expect(profileToConstraints({ sleepers: 2, lengthMaxFt: 35, lengthReason: "storage", lengthFlexApproved: true }).lengthMaxFt).toBe(35);
  });

  it("a 36-ft motorhome is out at a 35-ft storage cap and in with approved comfort flex", () => {
    const mh36 = () => unit({ rv_type: "Class C", model: "Coachmen 36C", title: "2026 Coachmen 36C Class C", length: "36", bunkhouse: false });
    const stored = runSearch([mh36()], { sleepsMin: 2, sherpa: { sleepers: 2, floorplanIntent: "couples", lengthMaxStatedFt: 35, lengthReason: "storage", lengthFlexApproved: null }, lengthMaxFt: profileToConstraints({ sleepers: 2, lengthMaxFt: 35, lengthReason: "storage" }).lengthMaxFt });
    expect(stored.funnel.passedHard).toBe(0);
    const flexed = runSearch([mh36()], { sleepsMin: 2, sherpa: { sleepers: 2, floorplanIntent: "couples", lengthMaxStatedFt: 35, lengthReason: "comfort", lengthFlexApproved: true }, lengthMaxFt: profileToConstraints({ sleepers: 2, lengthMaxFt: 35, lengthReason: "comfort", lengthFlexApproved: true }).lengthMaxFt });
    expect(flexed.funnel.passedHard).toBe(1);
  });
});

describe("tongue weight + payload", () => {
  it("estimates tongue from GVWR at 10-15%, not the empty hitch weight", () => {
    const t = estimateTongueRange(unit({ gvwr: 3900, dry_weight: 2995 }));
    expect(t).toEqual({ lowLbs: 390, highLbs: 585, basis: "GVWR × 10–15%" });
  });

  it("fails payload when tongue + people/cargo exceeds the door sticker", () => {
    const u = unit({ gvwr: 3900, dry_weight: 2995 });
    const fit = evaluatePayloadFit(u, { truckPayloadLbs: 1000, passengersLbs: 400, cargoLbs: 200 });
    expect(fit.verdict).toBe("exceeds");
    const ok = evaluatePayloadFit(u, { truckPayloadLbs: 1800, passengersLbs: 400, cargoLbs: 200 });
    expect(ok.verdict).toBe("fits");
  });

  it("stays 'unknown' without a payload sticker — never a confident green", () => {
    expect(evaluatePayloadFit(unit(), { truckPayloadLbs: null }).verdict).toBe("unknown");
  });

  it("payload overload is a hard fail in search when the sticker is known", () => {
    const out = runSearch([unit({ gvwr: 3900, dry_weight: 2995 })], {
      sherpa: { sleepers: 2, floorplanIntent: "couples", truckPayloadLbs: 1000, passengersLbs: 400, cargoLbs: 200 },
    });
    expect(out.funnel.passedHard).toBe(0);
  });
});

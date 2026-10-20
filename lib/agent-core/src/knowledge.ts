/**
 * Outfitter buyer-education knowledge, distilled from MatchRV's published
 * buyer guides (MatchRV_Outfitter_Knowledge_Pack/buyer-guides). This is the
 * sherpa's Mode-1 knowledge: honest education that earns trust before any
 * inventory is shown. Summaries only — never a substitute for the engine's
 * sourced facts, and towing guidance here defers to tow.ts / discovery.ts
 * (GVWR-based, payload-first). Pack-era model-level tow tables are NOT
 * reproduced: exact ratings come from the buyer's vehicle, not a lookup.
 */

export interface GuideTopic {
  id: string;
  title: string;
  source: string;
  keywords: string[];
  points: string[];
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: "tow_basics",
    title: "Towing basics: the five numbers that decide fit",
    source: "buyer-guides/tow-vehicle-guide.tsx, towing-guide.tsx",
    keywords: ["tow", "towing", "payload", "tongue", "gvwr", "hitch", "capacity", "weight", "truck", "f-150", "80%"],
    points: [
      "Start with the vehicle you own, not the RV you want — work backward from its real numbers.",
      "Five numbers decide fit: tow rating, payload (door sticker), GCWR, trailer GVWR, and tongue/pin weight.",
      "Payload is usually the real bottleneck: tongue weight, passengers, and cargo all spend from the same sticker number.",
      "Always compare against trailer GVWR (loaded), never dry weight — dry weight is the classic first-timer trap.",
      "Tongue weight runs 10–15% of loaded weight for travel trailers; fifth-wheel pin weight runs 15–25%.",
      "Keep loaded trailer weight at or under ~80% of the vehicle's max rating for regular towing.",
    ],
  },
  {
    id: "motorhome_vs_trailer",
    title: "Motorhome vs. travel trailer",
    source: "buyer-guides/guides/motorhome-vs-travel-trailer.tsx",
    keywords: ["motorhome", "travel trailer", "drive", "towable", "class a", "class c", "versus", "vs", "difference"],
    points: [
      "The core difference: a motorhome carries its living space; a trailer separates living space from the vehicle that moves it.",
      "Motorhomes set up faster at camp and allow living-area access while driving, but you duplicate an engine/drivetrain to maintain.",
      "Towables are usually cheaper per square foot and let you unhitch and drive the truck at camp.",
      "Towables suit buyers who already own a capable tow vehicle and campsites with length/weight limits; motorhomes suit frequent movers who prioritise convenience.",
      "Coach-system maintenance (seals, roof, appliances, water heater) is comparable either way; motorhomes add engine/chassis upkeep.",
    ],
  },
  {
    id: "trailer_vs_fifth_wheel",
    title: "Travel trailer vs. fifth wheel",
    source: "buyer-guides/guides/travel-trailer-vs-fifth-wheel.tsx",
    keywords: ["fifth wheel", "5th wheel", "travel trailer", "hitch", "pin weight", "gooseneck", "versus", "vs"],
    points: [
      "Travel trailers hitch at the rear bumper receiver; fifth wheels hitch in the truck bed, which tows more stably with less sway.",
      "Fifth wheels typically offer more living space, higher ceilings, and more storage; they need a pickup with a bed hitch and higher pin-weight capacity (15–25% of GVWR).",
      "Travel trailers work with a wider range of tow vehicles, including many SUVs, and are usually less expensive.",
      "Decide from the truck first: bed length, payload, and pin weight rule fifth wheels in or out before floorplans matter.",
    ],
  },
  {
    id: "families",
    title: "RVs for families",
    source: "buyer-guides/guides/best-rvs-for-families.tsx",
    keywords: ["family", "families", "kids", "children", "bunk", "bunkhouse", "grandkids"],
    points: [
      "Storage is the most underestimated family need — a family of four brings roughly four times a solo traveler's gear.",
      "For families, look for a dedicated bunk space, at least one full bathroom, a slide-out living area, and 26–32 ft for workable kitchen space in a towable.",
      "Bunkhouse travel trailers are the family value sweet spot; very light trailers under ~4,000 lbs often trade away construction quality.",
      "Ask how often everyone actually travels together — occasional grandkids need a different layout than kids on every trip.",
    ],
  },
  {
    id: "full_time",
    title: "Full-time RV living",
    source: "buyer-guides/guides/best-rvs-for-full-time-living.tsx",
    keywords: ["full-time", "full time", "fulltime", "live in", "residential", "long term", "snowbird"],
    points: [
      "Most RVs are not built for full-time use — insulation, storage, and build quality matter more than floorplan novelty.",
      "Storage runs out first; whatever you think you need, halve it, then still choose the unit with the most storage.",
      "Plan the unglamorous parts early: mail forwarding, healthcare access on your route, generator noise rules, and connectivity.",
      "Systems break and routines take time — budget and temperament for grey-tank days, not just scenic ones.",
    ],
  },
  {
    id: "used_buying",
    title: "Buying a used RV",
    source: "buyer-guides/guides/how-to-buy-a-used-rv.tsx",
    keywords: ["used", "pre-owned", "inspection", "water damage", "second hand", "older"],
    points: [
      "Water damage is the expensive killer: check ceilings/walls for staining or soft spots, roof seams for cracked sealant, and walk every inch of floor for spongy areas.",
      "A 2–5 year old unit is often the financial sweet spot — first owner absorbed the steepest depreciation and early defects are usually fixed.",
      "Certified/dealer-inspected used units cost more than private sales but can be worth it for inspection and limited warranty coverage.",
      "Decide towable vs. motorized first, then inspect the specific unit — category fit before unit hunting.",
    ],
  },
  {
    id: "costs",
    title: "What an RV really costs",
    source: "buyer-guides/guides/rv-cost-guide.tsx",
    keywords: ["cost", "price", "budget", "own", "ownership", "depreciation", "slide", "expensive", "afford"],
    points: [
      "Purchase price is the beginning: budget insurance, maintenance, storage, campground fees, and a repair reserve on top.",
      "Each slide-out adds meaningful cost (roughly $3,000–$8,000 at MSRP) along with living space; bunkhouse and island-kitchen layouts sit at the expensive end of configurations.",
      "Depreciation is steepest in the first 3–5 years — a key argument for late-model used for many buyers.",
      "Use current listings for real numbers; broad ranges are planning aids, not quotes.",
    ],
  },
  {
    id: "financing",
    title: "Financing an RV",
    source: "buyer-guides/guides/rv-financing-guide.tsx",
    keywords: ["financing", "loan", "payment", "payments", "rate", "interest", "down payment", "credit", "term"],
    points: [
      "Aim for 10–20% down without draining your emergency fund; keep a dedicated RV repair fund as well.",
      "The shortest term you can afford usually wins: on long 15–20 year terms, interest can add tens of thousands over the loan's life.",
      "Get pre-approved from at least two sources (credit unions are often competitive on RV loans) and ask the dealer to beat your rate.",
      "Check your credit first — if it is below ~720, a few months of paying down revolving debt can meaningfully improve the rate.",
      "Read for prepayment penalties, and get insurance quotes before finalising the budget.",
    ],
  },
];

/** Keyword search over the guide library; empty query lists all topics. */
export function searchGuides(query: string): GuideTopic[] {
  const q = query.toLowerCase().trim();
  if (!q) return GUIDE_TOPICS;
  const terms = q.split(/[^a-z0-9%+-]+/).filter(Boolean);
  const scored = GUIDE_TOPICS.map((g) => {
    const hay = `${g.id} ${g.title} ${g.keywords.join(" ")}`.toLowerCase();
    const score = terms.reduce((acc, term) => acc + (hay.includes(term) ? 1 : 0), 0);
    return { g, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.g);
}

export function getGuide(id: string): GuideTopic | null {
  return GUIDE_TOPICS.find((g) => g.id === id) ?? null;
}

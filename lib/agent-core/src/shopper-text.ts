/**
 * Shopper free text → structured constraints, plus first-message routing
 * for the Sherpa welcome. One parser for every surface (search_rvs `query`,
 * rv_outfitter, outfitter_discovery), so a phrase means the same thing
 * everywhere.
 *
 * Fuel rule (approved): gas / diesel filters ONLY when the shopper
 * explicitly asks for one. "gas mileage", "propane", "gas station", "gas
 * grill" or "gas or diesel, either is fine" never set a fuel filter.
 */

import type { Constraints, FuelType, RvType } from "./types.js";
import { parseMakeModel, SERIES } from "./brands.js";
import { searchGuides } from "./knowledge.js";
import { resolvePlace } from "./geo.js";

export interface ParsedShopperText {
  constraints: Partial<Constraints>;
  /** "gas"/"diesel" mentioned without a clear request (e.g. "not diesel?"). Ask, do not filter. */
  fuelMentionUnclear: boolean;
}

const MOTORIZED: RvType[] = ["class_a", "class_b", "class_c"];

/** Explicit fuel request only. Returns null when fuel was not clearly requested. */
export function explicitFuel(text: string): { fuel: FuelType | null; unclear: boolean } {
  const q = ` ${text.toLowerCase()} `;
  const neutral = /gas\s*mileage|\bmpg\b|gas\s*station|propane|gas\s*(?:grill|stove|range|oven|cooktop|fireplace|furnace|water\s*heater|generator|tank|bill|money|prices?)|fuel\s*economy|gas\s*(?:or|\/)\s*diesel|diesel\s*(?:or|\/)\s*gas|either\s*(?:gas|diesel|fuel)(?:\s*(?:or|\/|and)\s*(?:gas|diesel))?|(?:gas|diesel)\s*(?:is|are)?\s*(?:fine|ok|okay)\s*either|(?:don'?t|do\s*not)\s*care\s*(?:about\s*)?(?:the\s*)?(?:gas|diesel|fuel)(?:\s*(?:or|\/|and|vs\.?)\s*(?:gas|diesel))?/;
  const negated = /\b(?:not|no|without|avoid|never)\s+(?:a\s+)?(?:gas|diesel)\b/;
  const diesel = /\bdiesel(?:\s*pusher)?s?\b|\bcummins\b/;
  const gas = /\b(?:gas|gasoline)\s*(?:-\s*)?(?:powered|motorhomes?|motor\s*homes?|class\s*[abc]\b|coach(?:es)?|engines?|rigs?|models?|ones?|chassis|units?|rvs?|versions?)\b|\bgassers?\b|\bgas\s*(?:-|\s)?engine\b|\b(?:a|the|prefer|want|need|only)\s+gas\b|\bgas\s+only\b/;
  if (neutral.test(q)) {
    // "gas mileage" alongside an explicit "diesel pusher" still honours the diesel request.
    const stripped = q.replace(new RegExp(neutral.source, "g"), " ");
    if (!diesel.test(stripped) && !gas.test(stripped)) return { fuel: null, unclear: false };
    if (negated.test(stripped)) return { fuel: null, unclear: true };
    if (diesel.test(stripped) && !gas.test(stripped)) return { fuel: "diesel", unclear: false };
    if (gas.test(stripped) && !diesel.test(stripped)) return { fuel: "gas", unclear: false };
    return { fuel: null, unclear: true };
  }
  if (negated.test(q)) return { fuel: null, unclear: true };
  const d = diesel.test(q), g = gas.test(q);
  if (d && !g) return { fuel: "diesel", unclear: false };
  if (g && !d) return { fuel: "gas", unclear: false };
  if (d && g) return { fuel: null, unclear: true };
  return { fuel: null, unclear: false };
}

/** Pull structured constraints out of a ChatGPT-style free-text query. */
export function parseShopperText(query: string | undefined | null): ParsedShopperText {
  if (!query?.trim()) return { constraints: {}, fuelMentionUnclear: false };
  const q = query.toLowerCase();
  const out: Record<string, unknown> = {};
  const sleeps = /sleeps?\s*:?\s*(\d{1,2})\b/.exec(q) ?? /\b(?:family|party|group)\s+of\s+(\d{1,2})\b/.exec(q) ?? /\b(\d{1,2})\s+(?:people|persons|of\s+us|adults?\s+and\s+\d+\s+kids?)\b/.exec(q);
  const ak = /\b(\d{1,2})\s+adults?\s+(?:and|&|\+)\s+(\d{1,2})\s+(?:kids?|children)\b/.exec(q);
  if (ak) out.sleepsMin = Math.min(14, parseInt(ak[1], 10) + parseInt(ak[2], 10));
  else if (sleeps) out.sleepsMin = Math.min(14, Math.max(1, parseInt(sleeps[1], 10)));
  const types: RvType[] = [];
  const typeMap: [RegExp, RvType][] = [
    [/travel\s*trailers?|\btt\b/, "travel_trailer"],
    [/fifth\s*wheels?|5th\s*wheels?/, "fifth_wheel"],
    [/toy\s*haulers?/, "toy_hauler"],
    [/class\s*a\b|diesel\s*pushers?/, "class_a"],
    [/class\s*b\b|camper\s*vans?/, "class_b"],
    [/class\s*c\b/, "class_c"],
    [/truck\s*campers?/, "truck_camper"],
    [/pop\s*-?\s*ups?|popup|tent\s*trailers?/, "popup_camper"],
  ];
  for (const [re, t] of typeMap) if (re.test(q)) types.push(t);
  // "motorhome" / "motor home" / "motorcoach" = something you drive: Class A, B or C.
  if (!types.some((t) => MOTORIZED.includes(t)) && /\bmotor\s*homes?\b|\bmotorhomes?\b|\bmotor\s*coach(?:es)?\b|\bdrivable\b|\bsomething\s+(?:i|we)\s+(?:can\s+)?drive\b/.test(q)) types.push(...MOTORIZED);
  if (types.length) out.rvTypes = [...new Set(types)];
  const price = /under\s*\$?([\d,]+)\s*(k\b)?|\$?([\d,]+)\s*(k\b)?\s*(?:or\s*)?less|max(?:imum)?\s*price\s*\$?([\d,]+)\s*(k\b)?/.exec(q);
  if (price) {
    const raw = price[1] || price[3] || price[5];
    const k = price[2] || price[4] || price[6];
    let n = parseInt(raw.replace(/,/g, ""), 10) * (k ? 1000 : 1);
    if (Number.isFinite(n) && n > 1000) out.priceMaxUsd = n;
  }
  const lenMax = /(?:nothing longer than|no longer than|not longer than|under|less than|up to|max(?:imum)?(?: of)?|at most)\s*(\d{1,2}(?:\.\d+)?)\s*(?:ft\.?|feet|foot)\b/.exec(q) ?? /(\d{1,2}(?:\.\d+)?)\s*(?:ft\.?|feet|foot)\s*(?:or less|max(?:imum)?|and under)\b/.exec(q);
  if (lenMax) { const n = parseFloat(lenMax[1]); if (n >= 8 && n <= 60) out.lengthMaxFt = n; }
  const fuel = explicitFuel(q);
  if (fuel.fuel) out.fuelType = fuel.fuel;
  // "450 hp" / "at least 450 horsepower" = minimum; "450 hp preferred"/"ideally" = preference.
  const hp = /(\d{3})\s*(?:hp|horsepower)\b(\s*(?:preferred|ideally|if possible))?/.exec(q);
  if (hp) out[hp[2] || /(prefer|ideally)[^.]{0,30}\d{3}\s*(?:hp|horse)/.test(q) ? "horsepowerPreferred" : "horsepowerMin"] = parseInt(hp[1], 10);
  const tq = /([\d,]{3,5})\s*(?:lb[\s.-]*ft|ft[\s.-]*lbs?|pound[\s-]*feet)/.exec(q);
  if (tq) out.torqueMinLbFt = parseInt(tq[1].replace(/,/g, ""), 10);
  const trailer = /([\d,]{4,6})\s*(?:-?\s*(?:lb|lbs|pound))?\s*(?:loaded\s+)?(?:trailer|car|toad)/.exec(q) ?? /tow(?:ing)?\s+(?:a\s+)?([\d,]{4,6})/.exec(q);
  if (trailer) {
    const n = parseInt(trailer[1].replace(/,/g, ""), 10);
    if (n >= 500 && n <= 40_000) out.trailerWeightLbs = n;
  }
  const mm = parseMakeModel(query);
  if (mm.makes.length) out.makes = mm.makes;
  if (mm.models.length) out.models = mm.models;
  if (/\bnew\b/.test(q) && !/\b(?:used|pre-?owned)\b/.test(q) && /\bnew\s+(?:rv|motorhome|trailer|class|travel|fifth|toy|tiffin|\d{4}|one|units?|models?)/.test(q)) out.condition = "new";
  else if (/\b(?:used|pre-?owned)\b/.test(q) && !/\bnew\b/.test(q)) out.condition = "used";
  return { constraints: out as Partial<Constraints>, fuelMentionUnclear: fuel.unclear };
}

/** Back-compat name used by older callers. */
export function constraintsFromQuery(query: string | undefined | null): Partial<Constraints> {
  return parseShopperText(query).constraints;
}

// ── Sherpa welcome + first-message routing ────────────────────────────────

/** Approved Sherpa welcome (use when the first message is a greeting or vague). */
export const SHERPA_WELCOME =
  "I'd love to help with anything RV. Think of me as your Sherpa: you wouldn't climb Everest without one, and you don't have to shop for an RV alone either. I can compare a motorhome vs. a trailer, help you set up a campsite, track down a specific RV, or work out which one fits you and your family best. What brings you in today?";

export type OpeningRoute = "welcome" | "education" | "specific_rv" | "help_choose";

export interface OpeningAssessment {
  route: OpeningRoute;
  /** Present only when route = welcome. */
  welcome?: string;
  /** Guide topics to answer from (route = education). */
  guideTopics?: string[];
  /** What the message already told us. */
  extracted: Partial<Constraints>;
  guidance: string;
}

const GREETING = /^\s*(?:hi|hello|hey|hiya|howdy|yo|good\s+(?:morning|afternoon|evening)|greetings|sup|what'?s\s+up)\b[\s!.,?]*(?:there|matchrv|sherpa|outfitter)?[\s!.,?]*$/i;
const VAGUE = /^\s*(?:help|i\s+need\s+(?:some\s+)?help|can\s+you\s+help(?:\s+me)?|i\s+have\s+(?:a\s+)?questions?|rvs?\??|i'?m\s+(?:just\s+)?(?:looking|browsing)|just\s+looking|start|let'?s\s+(?:start|go)|i\s+want\s+(?:an?\s+)?rv|(?:i'?m\s+)?(?:interested|thinking)\s+(?:in|about)\s+(?:getting\s+)?(?:an?\s+)?rvs?)[\s!.,?]*$/i;
const EDUCATION = /\b(?:vs\.?|versus|difference\s+between|compare(?:d)?\s+(?:a|an|the)?\s*(?:motorhome|trailer|fifth|class)|pros\s+and\s+cons|how\s+(?:do|does|much|should|to)|what\s+(?:is|are|does|should)|explain|set\s*up\s+(?:a|my|the)?\s*camp(?:site|ground)?|campsite\s+set\s*up|should\s+i\s+(?:get|buy)\s+(?:a|an)\s+\w+\s+or\b|is\s+it\s+(?:better|worth))\b/i;
const HELP_CHOOSE = /\b(?:help\s+me\s+(?:choose|pick|find|decide|figure)|which\s+(?:rv|one|type)\b|what\s+(?:kind|type)\s+of\s+rv|not\s+sure\s+what|first\s+rv|right\s+rv\s+for|best\s+(?:rv|fit)\s+for)\b/i;

/**
 * Route the shopper's first message. A vague or greeting-only message gets
 * the Sherpa welcome; a message that already says what they want skips the
 * welcome and dives in.
 */
export function classifyOpening(message: string | null | undefined): OpeningAssessment {
  const text = (message ?? "").trim();
  const parsed = parseShopperText(text);
  const extracted = parsed.constraints;
  const hasSpecificRv = Boolean(extracted.makes?.length || extracted.models?.length);
  if (hasSpecificRv && !(EDUCATION.test(text) && /\b(?:vs\.?|versus|difference)\b/i.test(text) && !(extracted.models?.length))) {
    return { route: "specific_rv", extracted, guidance: "They named a specific RV. Call search_rvs with make/model (and location if known) — it first returns how many are nearby. Share that count, then ask the open Goal One / Goal Two questions before listing units." };
  }
  if (EDUCATION.test(text) && !HELP_CHOOSE.test(text)) {
    const topics = searchGuides(text).slice(0, 3).map((g) => g.id);
    return { route: "education", guideTopics: topics, extracted, guidance: "Answer the question directly from outfitter_guide (topics listed). Teach first; offer to look at real RVs only after answering." };
  }
  if (!text || GREETING.test(text) || VAGUE.test(text)) {
    return { route: "welcome", welcome: SHERPA_WELCOME, extracted, guidance: "Send the Sherpa welcome (verbatim or very close) and wait for their answer. Then route: general questions → outfitter_guide; a specific RV → search_rvs with make/model; 'help me choose' → Product Selection (outfitter_discovery)." };
  }
  return { route: "help_choose", extracted, guidance: "They told you what they want, so skip the welcome and dive into Product Selection: pass what they said to outfitter_discovery and ask its nextQuestions." };
}

/** Curated series names, for tool descriptions/tests. */
export const CURATED_SERIES = Object.fromEntries(Object.entries(SERIES).map(([b, t]) => [b, t.map((s) => s.name)]));

/**
 * "near Tacoma", "in Tacoma, WA", "around Spokane" → a place MatchRV can
 * resolve (null when it can't). Never guesses a location.
 */
export function placeFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const re = /\b(?:near|in|around|by|close\s+to|outside(?:\s+of)?|from)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}(?:,\s*[A-Z]{2}\b)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const candidate = m[1].trim();
    const words = candidate.split(/\s+/);
    // Try the longest phrase first ("Tacoma, WA", "Fort Collins"), then shorter.
    for (let n = words.length; n >= 1; n--) {
      const phrase = words.slice(0, n).join(" ").replace(/[.,]$/, "");
      if (resolvePlace(phrase)) return phrase;
    }
  }
  return null;
}

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
import { resolvePlace, resolveSearchPlace } from "./geo.js";
import { US_STATES } from "./national-geo.js";
import type { BuyerProfile, PlannedUse } from "./discovery.js";

export interface ParsedShopperText {
  constraints: Partial<Constraints>;
  /** "gas"/"diesel" mentioned without a clear request (e.g. "not diesel?"). Ask, do not filter. */
  fuelMentionUnclear: boolean;
}

const MOTORIZED: RvType[] = ["class_a", "class_b", "class_c"];

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
/** "We're a couple", "just the two of us", "me and my wife", "my husband and I". */
const COUPLE = /\b(?:we'?re|we\s+are)\s+(?:a\s+)?(?:married\s+|retired\s+)?couple\b|\b(?:just\s+)?(?:the\s+)?two\s+of\s+us\b|\b(?:me|myself)\s+and\s+my\s+(?:wife|husband|spouse|partner|girlfriend|boyfriend|fianc[eé]e?)\b|\bmy\s+(?:wife|husband|spouse|partner|girlfriend|boyfriend|fianc[eé]e?)\s+and\s+(?:i|me)\b|\b(?:a|the)\s+couple\s+of\s+us\b|\bjust\s+us\s+two\b/i;
const SOLO = /\bjust\s+(?:me|myself)\b|\bby\s+myself\b|\b(?:i'?m|i\s+am)\s+(?:a\s+)?solo\b|\bonly\s+me\b/i;
/** Others coming along beyond the couple/solo traveler (people, not pets). */
const OTHERS_COMING = /\b(?:kids?|children|grand\s*kids?|grandchildren|sons?|daughters?|friends?|guests?|family\s+of|parents|in-?laws?)\b/i;

/** "$35k", "35,000", "$35.5k" → dollars (null when not money-sized). */
function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|grand|thousand)?/i.exec(raw);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}
const MONEY = String.raw`\$?\s*\d[\d,]*(?:\.\d+)?\s*(?:k\b|grand\b|thousand\b)?`;
const pick = (re: RegExp, text: string): number | null => { const m = re.exec(text); return m ? money(m.slice(1).find(Boolean)) : null; };

/** Budget ceiling stated in plain words ("budget is $35k", "$35k out the door"). */
function budgetFromText(q: string): number | null {
  const n = pick(new RegExp(String.raw`(${MONEY})\s*(?:out\s+the\s+door|otd)\b|out\s+the\s+door\s+(?:budget\s+)?(?:of|is|at|around|about|under|=|:)?\s*(?:about|around|under)?\s*(${MONEY})|budget\s+(?:is|of|around|about|at|under|=|:)?\s*(?:about|around|under|roughly)?\s*(${MONEY})|(${MONEY})\s+(?:cash\s+|total\s+)?budget\b`, "i"), q);
  return n != null && n >= 1000 ? n : null;
}

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

/** Drop "trading in my 2012 Jayco …" so the trade's make/model/type is never read as what they want. */
export function withoutTradeText(text: string): string {
  return text.replace(/\btrad(?:e|ing)(?:[-\s]?in)?\b[^.;!?]*/gi, " ");
}

/** Pull structured constraints out of a ChatGPT-style free-text query. */
export function parseShopperText(query: string | undefined | null): ParsedShopperText {
  if (!query?.trim()) return { constraints: {}, fuelMentionUnclear: false };
  const q = query.toLowerCase();
  const out: Record<string, unknown> = {};
  const sleeps = /sleeps?\s*:?\s*(\d{1,2})\b/.exec(q) ?? /\b(?:family|party|group)\s+of\s+(\d{1,2})\b/.exec(q) ?? /\b(\d{1,2})\s+(?:people|persons|of\s+us|adults?\s+and\s+\d+\s+kids?)\b/.exec(q);
  const wordSleeps = /\b(?:family|party|group)\s+of\s+(two|three|four|five|six|seven|eight|nine|ten)\b/.exec(q) ?? /\b(?:all\s+|the\s+)?(two|three|four|five|six|seven|eight|nine|ten)\s+of\s+us\b/.exec(q);
  const ak = /\b(\d{1,2})\s+adults?\s+(?:and|&|\+)\s+(\d{1,2})\s+(?:kids?|children)\b/.exec(q);
  if (ak) out.sleepsMin = Math.min(14, parseInt(ak[1], 10) + parseInt(ak[2], 10));
  else if (sleeps) out.sleepsMin = Math.min(14, Math.max(1, parseInt(sleeps[1], 10)));
  else if (wordSleeps) out.sleepsMin = WORD_NUMBERS[wordSleeps[1]];
  else if (COUPLE.test(q) && !OTHERS_COMING.test(q)) out.sleepsMin = 2;
  else if (SOLO.test(q) && !OTHERS_COMING.test(q)) out.sleepsMin = 1;
  const types: RvType[] = [];
  const typeMap: [RegExp, RvType][] = [
    [/travel\s*trailers?|\btt\b|destination\s*trailers?|park\s*models?/, "travel_trailer"],
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
  const budget = budgetFromText(q);
  if (budget != null) out.priceMaxUsd = budget;
  const price = /under\s*\$?([\d,]+)\s*(k\b)?|\$?([\d,]+)\s*(k\b)?\s*(?:or\s*)?less|max(?:imum)?\s*price\s*\$?([\d,]+)\s*(k\b)?/.exec(q);
  if (price) {
    const raw = price[1] || price[3] || price[5];
    const k = price[2] || price[4] || price[6];
    let n = parseInt(raw.replace(/,/g, ""), 10) * (k ? 1000 : 1);
    if (Number.isFinite(n) && n > 1000 && out.priceMaxUsd == null) out.priceMaxUsd = n;
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

/**
 * Golden Ticket facts the shopper stated in plain words. Conservative: only
 * what the words clearly say; anything unclear stays unknown and is asked.
 * Explicit tool arguments always win over these (see mergeProfile).
 */
export function profileFactsFromText(text: string | null | undefined): Partial<BuyerProfile> {
  if (!text?.trim()) return {};
  const q = text.toLowerCase();
  // What they're trading in is not what they're shopping for: keep its make/model/type out of the search.
  const shopping = withoutTradeText(text);
  const parsed = parseShopperText(shopping).constraints;
  const out: Partial<BuyerProfile> = {};
  if (parsed.rvTypes?.length) out.rvTypes = parsed.rvTypes;
  if (parsed.makes?.length) out.makes = parsed.makes;
  if (parsed.models?.length) out.models = parsed.models;
  if (parsed.condition === "new" || parsed.condition === "used") out.newOrUsed = parsed.condition;
  if (parsed.lengthMaxFt != null) out.lengthMaxFt = parsed.lengthMaxFt;
  if (parsed.sleepsMin != null) out.sleepers = parsed.sleepsMin;
  const place = placeFromText(text);
  if (place) out.place = place;
  if (/\bnot\s+sure\s+(?:what|which)\s+(?:kind|type|rv)|\bhelp\s+me\s+(?:decide|choose|pick)\b|\bopen\s+to\s+(?:any|all)\s+types?\b/.test(q)) out.rvTypeUndecided = true;

  // Q1 use.
  const uses: PlannedUse[] = [];
  if (/\blive\s+in\s+(?:it|one|an?\s+rv)|\bfull[-\s]?tim(?:e|ing|er)\b|\bliving\s+in\s+(?:it|one)/.test(q)) uses.push("living");
  if (/\bcamp(?:ing|ed|s)?\b/.test(q.replace(/camping\s+world/g, " "))) uses.push("camping");
  if (/\btailgat/.test(q)) uses.push("tailgating");
  if (/\btravel(?:l?ing|l?ed)?\b(?!\s*trailers?)|\broad\s*trips?\b|\bsee\s+the\s+country\b|\bsnowbird/.test(q)) uses.push("traveling");
  if (uses.length) out.plannedUses = uses;

  // Q2 activities (feature matching).
  const acts: [RegExp, string][] = [
    [/\bfish(?:ing)?\b/, "fishing"], [/\bhunt(?:ing)?\b/, "hunting"], [/\bhik(?:e|es|ing)\b/, "hiking"],
    [/\b(?:mountain\s+)?bik(?:e|es|ing)\b/, "biking"], [/\bkayak/, "kayaking"], [/\bboat(?:s|ing)?\b/, "boating"],
    [/\bgolf/, "golf"], [/\batvs?\b|\butvs?\b|side[-\s]by[-\s]sides?|dirt\s*bikes?|\boff[-\s]?road(?:ing)?\b/, "off-roading / ATVs"],
    [/\b(?:bbq|barbecue|grill(?:ing)?|cook(?:ing)?\s+outside|outdoor\s+(?:kitchen|cooking)|outside\s+kitchen)\b/, "outdoor cooking"],
    [/\bbeach/, "beach"], [/\bski(?:ing)?\b|\bsnowboard/, "skiing"], [/\bfootball\b|\bsports?\s+(?:games?|events?)\b/, "sports events"],
  ];
  const activities = acts.filter(([re]) => re.test(q)).map(([, label]) => label);
  if (activities.length) out.activities = activities;

  // Q3 vacation / time off.
  const weeks = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight)\s+weeks?\s+(?:off|of\s+(?:vacation|pto)|vacation|a\s+year|per\s+year|each\s+year)\b/.exec(q);
  if (/\bretired\b/.test(q)) out.timeOff = "retired";
  else if (weeks) out.timeOff = `${weeks[1]} week${weeks[1] === "1" || weeks[1] === "one" ? "" : "s"} a year`;
  else if (uses.includes("living")) out.timeOff = "full time";

  // Q4 who's going.
  const who: string[] = [];
  if (COUPLE.test(q)) who.push("a couple");
  else if (SOLO.test(q)) who.push("just them");
  const grandkids = /\bgrand\s*(?:kids?|children)\b/.test(q);
  if (grandkids) who.push("grandkids");
  if (!grandkids && /\b(?:kids?|children)\b/.test(q)) who.push("kids");
  if (/\bdogs?\b|\bpupp(?:y|ies)\b/.test(q)) who.push("dog");
  if (/\bcats?\b/.test(q)) who.push("cat");
  if (who.length) out.partyNotes = who.join(", ");

  // Q5 who it's for (buyers). A couple is taken as buying together; anything unclear is asked.
  if (/\bgo(?:ing|es)?\s+in\s+on\s+it\b|\bco-?(?:buyer|sign(?:er|ing)?)\b|\bsplit(?:ting)?\s+(?:it|the\s+cost)\b|\b(?:we'?re|we\s+are)\s+buying\s+(?:it\s+)?together\b/.test(q)) { out.coBuyerInvolved = true; out.owners = "buying with someone else"; }
  else if (/\b(?:just\s+me|only\s+me|i'?m\s+the\s+only\s+one)\s+(?:buying|on\s+(?:it|the\s+title|the\s+loan))\b|\bbuying\s+it\s+(?:myself|on\s+my\s+own|alone)\b|\bsole\s+buyer\b/.test(q)) { out.coBuyerInvolved = false; out.owners = "sole buyer"; }
  else if (COUPLE.test(q)) { out.coBuyerInvolved = true; out.owners = "the couple (likely buying together)"; }

  // Q6 trade.
  if (/\bno\s+trade(?:-?\s*ins?)?\b|\b(?:don'?t|do\s+not)\s+have\s+(?:a\s+|any\s+)?trade|\bnothing\s+to\s+trade\b|\bnot\s+trading\b/.test(q)) out.hasTradeIn = false;
  else {
    const tr = /\btrad(?:e|ing)(?:[-\s]?in)?\s+(?:in\s+)?(?:my|our)\s+([^,;!?]{3,60}?)(?:\s+(?:because|since|for|to\s+get)\b|[,;!?]|\.(?:\s|$)|$)/i.exec(text);
    if (tr || /\b(?:have|got)\s+a\s+trade(?:[-\s]?in)?\b/.test(q)) { out.hasTradeIn = true; if (tr) out.tradeDescription = tr[1].trim(); }
    const why = /\btrad(?:e|ing)[^.]*?\b(?:because|since|to\s+get)\s+([^.;!?]{3,100})/i.exec(text);
    if (why && out.hasTradeIn) out.tradeReason = why[1].trim();
  }

  // Q7 towing.
  if (/\b(?:don'?t|do\s+not)\s+have\s+(?:a\s+)?(?:tow\s+vehicle|truck)(?:\s+yet)?\b|\bno\s+(?:tow\s+vehicle|truck)(?:\s+yet)?\b|\bneed\s+(?:to\s+buy\s+)?a\s+truck\b/.test(q)) out.towVehicleUnknown = true;
  else {
    const tv = /\btow(?:ing)?\s+(?:it\s+|the\s+\w+\s+)?with\s+(?:my|our|a|an)\s+([^,;!?]{3,60}?)(?=[,;!?]|\.(?:\s|$)|\s+(?:and|but)\b|$)/i.exec(text)
      ?? /\b(?:i|we)\s+(?:have|drive|own|got)\s+(?:a|an)\s+((?:19|20)\d\d\s+[^,;!?]{2,50}?)(?=[,;!?]|\.(?:\s|$)|\s+(?:and|but)\b|$)/i.exec(text);
    if (tv) out.towVehicle = tv[1].trim();
  }
  const behind = /\btow(?:ing)?\s+(?:a|an|my|our)\s+([^.,;!?]{2,40}?)\s+behind\b/i.exec(text);
  if (behind) out.towingBehind = behind[1].trim();
  else if (/\b(?:not|won'?t\s+be|no)\s+tow(?:ing)?\s+(?:anything|a\s+car|a\s+toad)\b|\bnothing\s+behind\s+it\b/.test(q)) out.towingBehind = "nothing";

  // Q8 storage / length.
  if (/\bno\s+(?:length|size)\s+(?:limit|restriction|requirement)s?\b|\b(?:length|size)\s+(?:doesn'?t|does\s+not)\s+matter\b|\bany\s+(?:length|size)\s+(?:is\s+)?(?:fine|ok)/.test(q)) out.noLengthLimit = true;
  const st = /\bstor(?:e|ing)\s+it\s+(?:in|at|on|beside|next\s+to)\s+((?:my|our|the|a)\s+[^.,;!?]{3,40}?)(?=[.,;!?]|\s+(?:and|but)\b|$)/i.exec(text)
    ?? /\b(storage\s+lot|storage\s+unit|driveway|garage|carport|rv\s+pad|side\s+yard|back\s*yard)\b/i.exec(text);
  if (st) out.storage = st[1].trim();

  // Q9 trips.
  if (/\bno\s+trips?\s+planned\b|\bnothing\s+planned\b|\bno\s+plans\s+yet\b/.test(q)) out.plannedTrips = "nothing planned yet";
  else {
    const trip = /\b(?:trip|going|headed|heading|drive|driving)\s+(?:up\s+|down\s+|out\s+)?to\s+((?:[A-Z][\w'.-]+)(?:\s+(?:National\s+Park|[A-Z][\w'.-]+)){0,3})/.exec(text)
      ?? /\bfavou?rite\s+(?:campground|campsite|spot|park)\s+(?:is\s+)?([^.,;!?]{3,50})/i.exec(text);
    if (trip) out.plannedTrips = trip[1].trim();
  }

  // Q10 how they'll pay, plus the numbers.
  const finance = /\bfinanc|\b(?:make|making)\s+payments\b|\bmonthly\s+payments?\b|\bpayments\s+(?:of|around|about)\b|\bloan\b/.test(q);
  const special = /\b(?:bad|poor|rough|challenged)\s+credit\b|\bcredit\s+(?:is|isn'?t)\s+(?:bad|great|good|a\s+challenge)|\bspecial\s+financ/.test(q);
  const cash = /\b(?:pay(?:ing)?|in|all)\s+cash\b|\bcash\s+(?:budget|buyer|deal|purchase|out\s+the\s+door)\b|\bcash\b(?!\s*(?:back|down))/.test(q);
  if (special) out.paymentMethod = "special_finance";
  else if (finance) out.paymentMethod = "finance";
  else if (cash) out.paymentMethod = "cash";
  const down = pick(new RegExp(String.raw`(${MONEY})\s+down\b|down\s*payment\s+(?:of|is|around|about|would\s+be|=|:)?\s*(?:about|around|maybe)?\s*(${MONEY})|(${MONEY})\s+(?:as\s+(?:a\s+)?)?down\s*payment`, "i"), q);
  if (down != null && down >= 100) out.downPaymentUsd = down;
  const monthly = pick(new RegExp(String.raw`(${MONEY})\s*(?:a|per|\/|each)\s*mo(?:nth)?\b|(${MONEY})\s+monthly|monthly\s+(?:payment\s+)?(?:of|is|around|about|under|=|:)?\s*(?:about|around|under)?\s*(${MONEY})`, "i"), q);
  if (monthly != null && monthly >= 25 && monthly <= 20000) out.monthlyPaymentUsd = monthly;
  if (out.monthlyPaymentUsd != null && !out.paymentMethod) out.paymentMethod = "finance";
  const pocket = pick(new RegExp(String.raw`(${MONEY})\s+out\s+of\s+pocket|out\s+of\s+pocket\s+(?:is|of|around|about|=|:)?\s*(?:about|around|maybe)?\s*(${MONEY})|cash\s+budget\s+(?:is|of|around|about|=|:)?\s*(?:about|around)?\s*(${MONEY})`, "i"), q);
  const otd = pick(new RegExp(String.raw`(${MONEY})\s*(?:out\s+the\s+door|otd)\b|out\s+the\s+door\s+(?:budget\s+)?(?:of|is|at|around|about|under|=|:)?\s*(?:about|around|under)?\s*(${MONEY})`, "i"), q);
  const budget = budgetFromText(q);
  if (otd != null && otd >= 1000) out.outTheDoorBudgetUsd = otd;
  if (pocket != null && pocket >= 100) out.cashBudgetUsd = pocket;
  else if (out.paymentMethod === "cash" && (otd ?? budget) != null) out.cashBudgetUsd = (otd ?? budget)!;
  if (budget != null && out.outTheDoorBudgetUsd == null && out.paymentMethod !== "finance" && out.paymentMethod !== "special_finance") out.budgetMaxUsd = budget;
  if (/\b(?:rather\s+not|prefer\s+not\s+to)\s+(?:say|share)\b.*\bbudget|\bno\s+budget\s+yet\b/.test(q)) out.budgetDeclined = true;
  return out;
}

/** Explicit facts win; text-derived facts only fill what is still unknown. Never re-ask what either holds. */
export function mergeProfile(explicit: BuyerProfile, fromText: Partial<BuyerProfile>): BuyerProfile {
  const out: Record<string, unknown> = { ...explicit };
  for (const [k, v] of Object.entries(fromText)) {
    if (v == null) continue;
    const cur = out[k];
    if (cur == null || (Array.isArray(cur) && cur.length === 0)) out[k] = v;
  }
  return out as BuyerProfile;
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
const EDUCATION = /\b(?:vs\.?|versus|what'?s\s+(?:the\s+)?(?:better|best|difference|pros?)|which\s+(?:is|one\s+is|would\s+be|are)\s+(?:better|best)|is\s+(?:a|an)\s+[\w\s-]{2,30}\s+better|better\s*,?\s+(?:a|an)\s+[\w\s-]{2,30}\s+or\s+(?:a|an)\b|difference\s+between|compare(?:d)?\s+(?:a|an|the)?\s*(?:motorhome|trailer|fifth|class)|pros\s+and\s+cons|how\s+(?:do|does|much|should|to)|what\s+(?:is|are|does|should)|explain|set\s*up\s+(?:a|my|the)?\s*camp(?:site|ground)?|campsite\s+set\s*up|should\s+i\s+(?:get|buy)\s+(?:a|an)\s+\w+\s+or\b|is\s+it\s+(?:better|worth))\b/i;
const HELP_CHOOSE = /\b(?:help\s+me\s+(?:choose|pick|find|decide|figure)|which\s+(?:rv|one|type)\b|what\s+(?:kind|type)\s+of\s+rv|not\s+sure\s+what|first\s+rv|right\s+rv\s+for|best\s+(?:rv|fit)\s+for)\b/i;

/**
 * Route the shopper's first message. A vague or greeting-only message gets
 * the Sherpa welcome; a message that already says what they want skips the
 * welcome and dives in.
 */
export function classifyOpening(message: string | null | undefined): OpeningAssessment {
  const text = (message ?? "").trim();
  const parsed = parseShopperText(withoutTradeText(text));
  const extracted = parsed.constraints;
  const hasSpecificRv = Boolean(extracted.makes?.length || extracted.models?.length);
  if (hasSpecificRv && !(EDUCATION.test(text) && /\b(?:vs\.?|versus|difference)\b/i.test(text) && !(extracted.models?.length))) {
    return { route: "specific_rv", extracted, guidance: "They named a specific RV. Note the make/model, then ask the open Product Selection questions (nextQuestions) before listing anything. A named model does not skip the questions. Never quote how many exist." };
  }
  if (EDUCATION.test(text) && !HELP_CHOOSE.test(text)) {
    const topics = searchGuides(text).slice(0, 3).map((g) => g.id);
    return { route: "education", guideTopics: topics, extracted, guidance: "This is a question, not an RV search: answer it directly (outfitter_guide topics listed), with no discovery questions first. After answering, offer to help them find one; only then start the questions." };
  }
  if (!text || GREETING.test(text) || VAGUE.test(text)) {
    return { route: "welcome", welcome: SHERPA_WELCOME, extracted, guidance: "Send the Sherpa welcome (verbatim or very close) and wait for their answer. Then route: general questions → outfitter_guide; a specific RV or 'help me choose' → Product Selection (outfitter_discovery)." };
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
  // ZIPs only with an explicit cue ("ZIP 98444", "my zip is 98444", "near 98402", "Tacoma, WA 98402"),
  // never a bare 5-digit number (that is usually a price or a budget).
  const zipCues = [
    /\bzip(?:\s*code)?(?:\s+is)?\s*[:#]?\s*(\d{5}(?:-\d{4})?)\b/gi,
    /\b(?:near|around|close\s+to)\s+(\d{5}(?:-\d{4})?)\b/gi,
    /\b[A-Z][A-Za-z.'-]+,?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/g, // City, ST 98402 (case-sensitive state code)
  ];
  for (const cue of zipCues) {
    for (let z: RegExpExecArray | null; (z = cue.exec(text)); ) {
      if (z.length > 2 && !US_STATES[z[1] as keyof typeof US_STATES]) continue;
      const zip = z[z.length - 1];
      if (resolveSearchPlace(zip)) return zip;
    }
  }
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

/**
 * Did the shopper literally ask to skip the questions and see RVs now?
 * Used to verify a host's "just show me" claim against the shopper's own
 * words, so an assistant can't waive discovery on the shopper's behalf.
 */
const RESULTS_NOW = /\bjust\s+(?:show|list|give|send)\b|\bshow\s+me\s+(?:what|the|some|them|any|options|everything|results|listings|rvs?|trailers?|units?|inventory|what(?:'s| is) (?:out there|available))|\bskip\s+(?:the\s+|your\s+|all\s+(?:the\s+)?)?questions\b|\bno\s+(?:more\s+)?questions\b|\bstop\s+asking\b|\blet\s+me\s+(?:see|look)\b|\b(?:i\s+(?:just\s+)?want\s+to|can\s+i|i'd\s+like\s+to)\s+see\s+(?:some|the|what|options|results|listings)/i;
export function shopperAskedForResultsNow(text: string | null | undefined): boolean {
  return Boolean(text && RESULTS_NOW.test(text));
}

/** "Don't have one yet", "not sure", "unknown": an answer about the tow vehicle, not a vehicle. */
const NO_TOW_VEHICLE = /^\s*(?:unknown|not\s+sure|unsure|don'?t\s+know|no(?:ne)?(?:\s+yet)?|not\s+yet|n\/?a|tbd|i\s+don'?t\s+have\s+(?:one|a\s+\w+)(?:\s+yet)?|don'?t\s+have\s+(?:one|a\s+\w+)(?:\s+yet)?|no\s+tow\s+vehicle(?:\s+yet)?|will\s+buy\s+(?:one|a\s+\w+)(?:\s+later)?|buying\s+(?:one|a\s+\w+)\s+later)\s*\.?\s*$/i;
export function isNoTowVehicleAnswer(text: string | null | undefined): boolean {
  return Boolean(text && NO_TOW_VEHICLE.test(text));
}

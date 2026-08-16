import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const OUTFITTER_SYSTEM_PROMPT = `You are the RV Outfitter — a warm, knowledgeable RV guide on MatchRV.com. You have TWO modes:

═══════════════════════════════════════════════════════════
MODE 1: RV KNOWLEDGE (Open Q&A)
═══════════════════════════════════════════════════════════
When a user asks a general RV question (brand comparisons, maintenance, features, lifestyle, towing, campground tips, etc.), answer it directly and helpfully. You are an encyclopedia of RV knowledge. Examples:
- "Why do people like Tiffin motorhomes?"
- "What's the difference between a fifth wheel and a travel trailer?"
- "Can I tow a 30ft trailer with my F-150?"
- "What should I look for in a used Class C?"
- "How much does it cost to full-time in an RV?"

In this mode:
- Be conversational, warm, and genuinely helpful
- Give honest, balanced answers (pros AND cons)
- Share insider knowledge that a first-timer wouldn't know
- If their question reveals they might benefit from a personalized match, gently mention: "By the way, if you ever want me to find specific RVs that fit your situation, just say 'help me find one' and I'll walk you through it."
- Do NOT push the quiz or product selection unless they ask

═══════════════════════════════════════════════════════════
MODE 2: PRODUCT SELECTION (Personalized Matching)
═══════════════════════════════════════════════════════════
When a user says they want help finding an RV, or responds to the initial greeting by engaging with the matching flow, switch to Product Selection mode.

YOUR PHILOSOPHY (Professional Outfitter Methodology):
You are NOT a salesperson. You are a professional outfitter — like a Sherpa guiding someone up a mountain. Your job is to understand HOW they will live in and use their RV, then match them to the right one. You never ask "what features do you want?" because that locks people into one solution. Instead, you ask about their LIFE and translate that into the right RV.

Key principles:
- Customers research incorrectly — they've overwhelmed themselves with internet info and can't tell what matters from noise
- You listen MORE than you talk
- You ask about lifestyle and use, NOT features
- You sometimes recommend LESS expensive options that fit better (builds trust)
- You NEVER pressure or rush
- You take the pressure off: "There's no rush — let's just figure out what makes sense for your life"

YOUR PERSONALITY:
- Like a knowledgeable friend who genuinely loves helping people find the right RV
- Warm, patient, occasionally funny
- Honest about tradeoffs — you'll tell them when something ISN'T a good fit
- You celebrate their excitement about camping without being cheesy
- You use plain language, not industry jargon (unless they clearly know the lingo)

YOUR CONVERSATION FLOW (Professional Outfitter Discovery):
1. PRIME USE - "Tell me about how you see yourself using this RV. What does a perfect camping trip look like for you?" (This is the most important question — it reveals everything)
2. WHO'S COMING - Who travels with them? Family size, ages, pets? Follow up on frequency: "How often will the grandkids join?" changes the rec.
3. WHERE & WHEN - Where do they want to go? What climates? How long are their trips? (Weekend warrior vs. snowbird vs. full-timer)
4. LOCATION - "Where are you located? City or zip code works — I'll find RVs near you first." (This lets you prioritize nearby inventory.)
5. DRIVE OR TOW - Do they want to drive it or tow it? What do they drive now? (Only ask about tow vehicle if towable)
6. SIZE - "Any constraints on size? Driveway limits, storage situation, roads you'll be on?"
7. BUDGET - Ask "Are you thinking payments or cash?" first. If PAYMENTS: ask BOTH down payment AND monthly payment together in one message. If CASH: ask total budget. Keep it casual: "Just so I can make sure I'm looking in the right neighborhood..."
   - If the buyer is VAGUE about money ("good budget", "strong financing", "money's not an issue", "decent budget"), ask ONCE for a ballpark — a rough total cash number OR a monthly payment — so you can search the right price range. If they give a figure, capture it. If they decline, are unsure, or say "show me everything" / "just show me what's available", proceed with what you have. NEVER block the match on budget or loop back to it.
8. FORK IN THE ROAD — When you have captured the ESSENTIALS (prime use, who's coming, where/when, drive-or-tow, and budget), summarize what you've learned warmly, then offer:
   "I've got a good picture now — I can find your top 3 matches right now, or we can dig a bit deeper on preferences first. What sounds good?"
   A) Generate matches now
   B) Go deeper (floorplan, must-haves, dealbreakers, experience level)

   CRITICAL STOP RULE: The moment the user chooses A, or says anything meaning "show me matches", "find my RV", "yes", "sure", "let's go", "go ahead", "do it", or any affirmative — STOP asking questions immediately. Output <stage>matching</stage> and transition warmly ("Perfect — let me pull up your top matches now..."). Do NOT confirm, clarify, or ask anything else.

DEEP DIVE (Path B):
9. FLOORPLAN - Rear bedroom, rear living, bunkhouse, front kitchen, or flexible?
10. MUST-HAVES - "Anything you absolutely need? Outdoor kitchen, king bed, washer/dryer?"
11. DEALBREAKERS - "Anything you definitely don't want?"
12. EXPERIENCE - "Have you owned an RV before, or is this your first?"

When all DEEP DIVE questions are answered, immediately transition: acknowledge briefly what you've learned, then set <stage>matching</stage>. Do NOT ask additional questions.

Then proceed to MATCHING.

KEY RULES:
- Ask ONE question at a time (exception: down payment + monthly payment together)
- Keep messages SHORT and conversational — no walls of text
- NEVER ask about features first — only discuss them if the customer brings them up
- Match on LIFESTYLE and USE, not a feature checklist
- NEVER show anything over budget
- If first-time buyer, be educational and reassuring: "That's totally normal — most first-timers feel the same way"
- TYPE MATCHING — CRITICAL: If rvType is set and is NOT "not_sure", ONLY recommend that exact type
- LENGTH MATCHING — CRITICAL: If lengthFlexibility is false and min/maxLength are set, ONLY recommend within range
- NO MATCH: If nothing fits, output <no_match>true</no_match> and explain compassionately

ANTI-LOOP / COMPLETION RULE — CRITICAL:
- Before asking ANY question, re-read the profile. NEVER re-ask something you already know (don't ask budget twice, don't re-ask who's coming, don't re-confirm the RV type, etc.).
- CORE FIELDS = prime use (useCase), who's coming (travelers), drive-or-tow / RV type, and budget (OR an explicit "show me everything" / "I'm flexible on budget").
- The MOMENT all core fields are captured, STOP discovery and go straight to the FORK (offer to generate matches now). Do NOT invent extra probing questions that aren't in the flow above (bedroom layout, couch position, mattress size, paint color, awning brand, etc.).
- DEEP DIVE (Path B) questions are OPTIONAL and asked ONLY if the buyer explicitly chooses to go deeper. Never silently loop back into discovery once the core is done.
- If the buyer says "show me everything", "just show me", "I'm flexible", "whatever you've got", or anything meaning they're ready, set <stage>matching</stage> immediately and stop asking questions.

PROFILE EXTRACTION:
After each message, extract any buyer profile data you've learned. Output a JSON block at the END of your message (after your conversational text) in this exact format:
<profile>
{
  "rvType": "travel_trailer|fifth_wheel|class_a|class_b|class_c|toy_hauler|popup_camper|truck_camper|not_sure|null",
  "useCase": "weekends|full_time|seasonal|tailgating|other|null",
  "activities": ["camping", "hiking", "biking", "boondocking", "fishing", "kids", "pets"],
  "travelers": null,
  "hasKids": null,
  "hasPets": null,
  "hasTrade": null,
  "towVehicle": null,
  "paymentType": "payments|cash|null",
  "minBudget": null,
  "maxBudget": null,
  "monthlyPayment": null,
  "downPayment": null,
  "minLength": null,
  "maxLength": null,
  "rawLengthInput": null,
  "lengthFlexibility": null,
  "intendedUse": null,
  "towingNeeds": null,
  "sleepingCapacity": null,
  "mustHaves": [],
  "timeline": null,
  "experience": "first_time|some_experience|experienced|null",
  "campingStyle": "full_hookup|boondocking|mixed|null"
}
</profile>

Only include fields you've actually learned. Use null for unknown fields. The conversational text comes BEFORE the profile block.

LENGTH PARSING RULES:
- Set rawLengthInput to the buyer's verbatim length answer
- Set lengthFlexibility to true only if they said "flexible", "open", or "no preference"
- "25–30 ft" → minLength=25, maxLength=30
- "30–35 ft" → minLength=30, maxLength=35
- "35–40 ft" → minLength=35, maxLength=40
- "40+ ft" → minLength=40, maxLength=null
- "Under 25 ft" → minLength=null, maxLength=25
- "around 40 ft" → minLength=38, maxLength=42

BUDGET MATH — CRITICAL:
When a buyer gives monthly payment + down payment, ALWAYS compute maxBudget.
Formula: maxBudget = downPayment + (monthlyPayment × 111.4)
Example: $300/mo + $2,000 down → maxBudget = $35,420
NEVER leave maxBudget null when you have payment information.

MODE DETECTION:
- If the user's first message is a question about RVs in general → Mode 1 (Knowledge)
- If the user says "help me find one", "match me", "what RV should I get", "I'm looking for..." → Mode 2 (Product Selection)
- If in Mode 1 and user says "actually help me find one" or similar → transition to Mode 2
- If in Mode 2 and user asks a tangent question ("wait, what's the deal with diesel vs gas?") → answer it briefly, then gently return to where you were in the flow

STAGE TRACKING:
Output the current stage at the very end:
<stage>knowledge|prime_use|who|where_when|location|drive_or_tow|size|budget|fork|deep_dive|matching|complete</stage>

Use "knowledge" stage when in Mode 1 (open Q&A). Use the other stages for Mode 2 (product selection flow).

CRITICAL — DO NOT OUTPUT MATCH CRITERIA AS TEXT:
When you are ready to find matches (stage = matching or complete), do NOT output any JSON block, XML block, <match_request> tag, or structured data in your conversational message. The server reads your <profile> and <stage> tags automatically and runs the matching pipeline. Your message to the customer should be a warm, natural transition — something like: "Perfect — I have everything I need. Let me pull up your top matches now..." followed by a brief summary of what you're looking for. Do NOT show raw JSON, XML tags, or structured criteria blocks to the customer under any circumstances.`;

// ─── Tow capacity lookup (lbs) for common vehicles ───
const TOW_CAPACITY: Record<string, number> = {
  "f150": 13000, "f250": 20000, "f350": 37000,
  "silverado1500": 13300, "silverado2500": 20000, "silverado3500": 36000,
  "ram1500": 12750, "ram2500": 20000, "ram3500": 37090,
  "tundra": 12000, "tacoma": 6800, "colorado": 7700, "ranger": 7500,
  "gladiator": 7700, "ridgeline": 5000, "frontier": 6720,
  "suburban": 8300, "tahoe": 8400, "expedition": 9300,
  "yukon": 8400, "4runner": 5000, "pilot": 5000,
  "highlander": 5000, "explorer": 5600, "durango": 8700,
};

function estimateTowCapacity(vehicle: string | null | undefined): number | null {
  if (!vehicle) return null;
  const v = String(vehicle).toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [key, cap] of Object.entries(TOW_CAPACITY)) {
    if (v.includes(key)) return cap;
  }
  return null;
}

// ─── WA city coordinate lookup (avoids Nominatim API calls for common cities) ───
const WA_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "seattle": { lat: 47.6062, lng: -122.3321 }, "tacoma": { lat: 47.2529, lng: -122.4443 },
  "kent": { lat: 47.3809, lng: -122.2348 }, "auburn": { lat: 47.3073, lng: -122.2285 },
  "everett": { lat: 47.9790, lng: -122.2021 }, "spokane": { lat: 47.6588, lng: -117.4260 },
  "vancouver": { lat: 45.6387, lng: -122.6615 }, "olympia": { lat: 47.0379, lng: -122.9007 },
  "bellingham": { lat: 48.7519, lng: -122.4787 }, "yakima": { lat: 46.6021, lng: -120.5059 },
  "mount vernon": { lat: 48.4213, lng: -122.3341 }, "marysville": { lat: 48.0518, lng: -122.1771 },
  "puyallup": { lat: 47.1854, lng: -122.2929 }, "poulsbo": { lat: 47.7354, lng: -122.6468 },
  "bremerton": { lat: 47.5673, lng: -122.6326 }, "silverdale": { lat: 47.6479, lng: -122.6943 },
  "port orchard": { lat: 47.5401, lng: -122.6329 }, "gig harbor": { lat: 47.3318, lng: -122.5793 },
  "federal way": { lat: 47.3223, lng: -122.3126 }, "renton": { lat: 47.4829, lng: -122.2171 },
  "bellevue": { lat: 47.6101, lng: -122.2015 }, "kirkland": { lat: 47.6815, lng: -122.2087 },
  "redmond": { lat: 47.6740, lng: -122.1215 }, "issaquah": { lat: 47.5301, lng: -122.0326 },
  "lynnwood": { lat: 47.8209, lng: -122.3151 }, "edmonds": { lat: 47.8107, lng: -122.3779 },
  "shoreline": { lat: 47.7543, lng: -122.3429 }, "burien": { lat: 47.4704, lng: -122.3468 },
  "des moines": { lat: 47.4018, lng: -122.3243 }, "tukwila": { lat: 47.4742, lng: -122.2612 },
  "lakewood": { lat: 47.1718, lng: -122.5185 }, "pasco": { lat: 46.2396, lng: -119.1006 },
  "kennewick": { lat: 46.2113, lng: -119.1372 }, "richland": { lat: 46.2804, lng: -119.2752 },
  "wenatchee": { lat: 47.4235, lng: -120.3103 }, "walla walla": { lat: 46.0646, lng: -118.3430 },
  "moses lake": { lat: 47.1301, lng: -119.2779 }, "ellensburg": { lat: 46.9965, lng: -120.5487 },
  "aberdeen": { lat: 46.9754, lng: -123.8154 }, "centralia": { lat: 46.7162, lng: -122.9543 },
  "longview": { lat: 46.1382, lng: -122.9382 }, "port angeles": { lat: 48.1181, lng: -123.4307 },
  "sequim": { lat: 48.0793, lng: -123.1007 }, "oak harbor": { lat: 48.2929, lng: -122.6429 },
  "anacortes": { lat: 48.5126, lng: -122.6126 }, "burlington": { lat: 48.4754, lng: -122.3279 },
  "monroe": { lat: 47.8554, lng: -121.9715 }, "snohomish": { lat: 47.9126, lng: -122.0987 },
  "arlington": { lat: 48.1654, lng: -122.1251 }, "stanwood": { lat: 48.2415, lng: -122.3743 },
  "bonney lake": { lat: 47.1779, lng: -122.1762 }, "maple valley": { lat: 47.3690, lng: -122.0479 },
  "enumclaw": { lat: 47.2021, lng: -121.9921 }, "yelm": { lat: 46.9429, lng: -122.6093 },
  "lacey": { lat: 47.0340, lng: -122.8232 }, "tumwater": { lat: 47.0076, lng: -122.9085 },
  "shelton": { lat: 47.2151, lng: -123.1007 }, "covington": { lat: 47.3601, lng: -122.1029 },
};

async function geocodeBuyerLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  const city = location.split(",")[0].trim().toLowerCase();
  if (WA_CITY_COORDS[city]) return WA_CITY_COORDS[city];
  try {
    const query = encodeURIComponent(location);
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=us`,
      { headers: { "User-Agent": "MatchRV/1.0 (contact@matchrv.com)" } }
    );
    if (!resp.ok) return null;
    const results = await resp.json() as Array<{ lat: string; lon: string }>;
    if (!results.length) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch { return null; }
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Budget Calculation Helper ───
function computeEffectiveMaxBudget(profile: Record<string, unknown>): number | null {
  const explicit = Number(profile.maxBudget);
  if (profile.maxBudget && !isNaN(explicit) && explicit > 0) return explicit;

  const monthly = Number(profile.monthlyPayment);
  if (!profile.monthlyPayment || isNaN(monthly) || monthly <= 0) return null;

  const monthlyRate = 0.0699 / 12;
  const termMonths = 180;
  const loanAmount = monthly * ((1 - Math.pow(1 + monthlyRate, -termMonths)) / monthlyRate);

  const down = profile.downPayment && !isNaN(Number(profile.downPayment)) ? Number(profile.downPayment) : 0;
  return Math.round(loanAmount + down);
}

// ─── Server-side length parser ───
export function parseLengthInput(raw: string): {
  minLength?: number;
  maxLength?: number;
  lengthFlexibility: boolean;
} {
  if (!raw) return { lengthFlexibility: false };

  const norm = raw.toLowerCase().trim();

  if (/\bflex(ible)?\b|\bopen\b|\bno preference\b|\bany(thing)?\b|\bdon.?t care\b/.test(norm)) {
    return { lengthFlexibility: true };
  }

  const rangeMatch = norm.match(/(\d+)\s*(?:to|-|–|—)\s*(\d+)\s*(?:ft|feet|foot)?/);
  if (rangeMatch) {
    return {
      minLength: parseInt(rangeMatch[1]),
      maxLength: parseInt(rangeMatch[2]),
      lengthFlexibility: false,
    };
  }

  const underMatch = norm.match(/(?:under|less than|no more than|max(?:imum)?|up to)\s*(\d+)/);
  if (underMatch) {
    return { maxLength: parseInt(underMatch[1]), lengthFlexibility: false };
  }

  const overMatch = norm.match(/(\d+)\s*\+|(?:over|at least|more than|minim(?:um)?|min)\s*(\d+)/);
  if (overMatch) {
    const n = parseInt(overMatch[1] ?? overMatch[2]);
    return { minLength: n, lengthFlexibility: false };
  }

  const exactMatch = norm.match(/(?:around|about|approximately|roughly)?\s*(\d+)\s*(?:ft|feet|foot)/);
  if (exactMatch) {
    const n = parseInt(exactMatch[1]);
    return { minLength: n - 3, maxLength: n + 3, lengthFlexibility: false };
  }

  const bareNum = norm.match(/^(\d+)$/);
  if (bareNum) {
    const n = parseInt(bareNum[1]);
    if (n >= 15 && n <= 65) {
      return { minLength: n - 3, maxLength: n + 3, lengthFlexibility: false };
    }
  }

  return { lengthFlexibility: false };
}

// ─── Step 1: Build SQL filters from the full buyer profile ───
function buildListingFilters(profile: Record<string, unknown>): string[] {
  const conditions: string[] = [];

  const allowedTypes = ["travel_trailer","fifth_wheel","class_a","class_b","class_c","toy_hauler","popup_camper","truck_camper"];
  if (profile.rvType && profile.rvType !== "not_sure" && allowedTypes.includes(String(profile.rvType))) {
    conditions.push(`type = '${String(profile.rvType).replace(/'/g, "''")}'`);
  }

  const effectiveMax = computeEffectiveMaxBudget(profile);
  if (effectiveMax && effectiveMax > 0) {
    conditions.push(`price <= ${effectiveMax}`);
  }
  if (profile.minBudget && !isNaN(Number(profile.minBudget))) {
    conditions.push(`price >= ${Number(profile.minBudget)}`);
  }

  const sleepCount = profile.sleepingCapacity ?? profile.travelers;
  if (sleepCount && !isNaN(Number(sleepCount))) {
    conditions.push(`sleeps >= ${Number(sleepCount)}`);
  }

  const flexible = profile.lengthFlexibility === true;
  const slack = flexible ? 5 : 0;

  if (profile.maxLength && !isNaN(Number(profile.maxLength))) {
    conditions.push(`(length IS NOT NULL AND length <= ${Number(profile.maxLength) + slack})`);
  }
  if (profile.minLength && !isNaN(Number(profile.minLength))) {
    conditions.push(`(length IS NOT NULL AND length >= ${Number(profile.minLength) - slack})`);
  }

  const towCap = estimateTowCapacity(profile.towVehicle as string);
  if (towCap) {
    const towableTypes = ["travel_trailer","fifth_wheel","toy_hauler","popup_camper","truck_camper"];
    if (profile.rvType && towableTypes.includes(String(profile.rvType))) {
      conditions.push(`COALESCE(gvwr, dry_weight) <= ${towCap}`);
    }
  }

  if (profile.campingStyle === "boondocking") {
    conditions.push(`(boondocking_score >= 50 OR generator = true OR solar_installed = true)`);
  }

  if (profile.condition === "new") {
    conditions.push(`condition = 'new'`);
  } else if (profile.condition === "used") {
    conditions.push(`condition = 'used'`);
  }

  return conditions;
}

// ─── Step 2: AI Re-ranking — Claude picks the best 3 from candidates ───
const RERANK_SYSTEM_PROMPT = `You are the RV Outfitter matching engine. You receive a buyer profile and a list of candidate RV listings. Your job is to select the TOP 3 listings that BEST match this specific buyer's needs and lifestyle.

You think like a professional outfitter: you match based on HOW the buyer will USE the RV, not just features. A family that camps every weekend needs different things than a retired couple doing month-long trips.

TYPE CONSTRAINT — ABSOLUTE: If the buyer profile has rvType set and it is NOT "not_sure", you MUST ONLY select listings whose type field exactly equals that value. Zero exceptions.

LENGTH CONSTRAINT — ABSOLUTE: If the buyer profile has minLength set, NEVER select a listing with length less than minLength. If maxLength is set, NEVER select a listing with length greater than maxLength.

MATCHING PRIORITIES (in order):
1. BUDGET — NEVER recommend anything over their maxBudget. Non-negotiable.
2. RV TYPE — Must match what they asked for.
3. LENGTH — Must be within their stated range.
4. LIFESTYLE FIT — How well does this RV support their described camping life? (prime use, trip length, climate, activities)
5. TRAVELERS — Does it sleep everyone comfortably? Floorplan suitable for kids/pets?
6. TOW VEHICLE — If towable, GVWR must be within tow capacity.
7. CAMPING STYLE — Boondocking: generator, tanks, solar. Full hookup: slides, washer/dryer. Mixed: balance.
8. VALUE — Deal score, days on market, price vs. market value.

For each of your top 3 picks, write a personalized "whyMatch" explanation (2-3 sentences) that:
- References their SPECIFIC lifestyle and use case (not generic praise)
- Explains how THIS particular RV supports the way THEY camp
- Mentions at least one concrete detail from their profile
- Sounds like a knowledgeable friend explaining why, not a salesperson pitching

Respond in this exact JSON format:
{
  "matches": [
    {
      "listingId": "<id of the listing>",
      "rank": 1,
      "whyMatch": "personalized explanation referencing their specific needs",
      "matchScore": 95
    }
  ]
}

Return ONLY valid JSON, no other text.`;

// Deterministic, dependency-free scoring of candidates against the buyer
// profile. This is the always-available baseline: it guarantees a ranked list
// with non-null whyMatch/matchScore even when the AI rerank is slow or fails,
// so recommendations never come back unexplained.
function scoreCandidatesDeterministic(
  profile: Record<string, unknown>,
  candidates: Record<string, unknown>[]
): Record<string, unknown>[] {
  const maxBudget = Number(profile.maxBudget) || undefined;
  const travelers = Number(profile.travelers) || undefined;
  const requiredType =
    profile.rvType && profile.rvType !== "not_sure" ? String(profile.rvType) : undefined;
  const currentYear = new Date().getFullYear();

  const scored = candidates.map((c) => {
    let score = 50;
    const reasons: string[] = [];

    const price = Number(c.price) || 0;
    if (maxBudget && price > 0) {
      if (price <= maxBudget) {
        score += 20;
        reasons.push(
          price / maxBudget <= 0.85
            ? `well within your $${maxBudget.toLocaleString("en-US")} budget`
            : `fits your $${maxBudget.toLocaleString("en-US")} budget`
        );
      } else {
        score -= 25;
      }
    }

    if (requiredType && String(c.type) === requiredType) {
      score += 15;
      reasons.push(`it's the ${requiredType.replace(/_/g, " ")} you wanted`);
    }

    const sleeps = Number(c.sleeps) || 0;
    if (travelers && sleeps) {
      if (sleeps >= travelers) {
        score += 10;
        reasons.push(`sleeps ${sleeps} — room for your group`);
      } else {
        score -= 10;
      }
    } else if (sleeps) {
      reasons.push(`sleeps ${sleeps}`);
    }

    const deal = String(c.deal_score ?? "");
    if (deal === "great_deal") {
      score += 15;
      reasons.push("priced well below market — a great deal");
    } else if (deal === "good_deal") {
      score += 8;
      reasons.push("priced under market value");
    }

    const dist = c.distance_miles;
    if (dist != null) {
      const d = Number(dist);
      if (d <= 50) {
        score += 8;
        reasons.push(`only ~${d} miles away`);
      } else if (d <= 150) {
        score += 3;
        reasons.push(`about ${d} miles away`);
      }
    }

    const year = Number(c.year) || 0;
    if (year && currentYear - year <= 3) score += 5;
    if (String(c.condition) === "new") score += 3;

    const matchScore = Math.max(1, Math.min(100, Math.round(score)));
    let whyMatch = "A solid all-around match for what you're looking for.";
    if (reasons.length > 0) {
      const joined = reasons.slice(0, 3).join(", ");
      whyMatch = joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
    }

    return { ...c, whyMatch, matchScore };
  });

  return scored.sort((a, b) => (b.matchScore as number) - (a.matchScore as number));
}

// Robustly pull a JSON object out of a model response. Faster models
// (claude-haiku) frequently wrap JSON in ```json fences or add a sentence of
// preamble despite instructions, which breaks a naive JSON.parse and silently
// forced the deterministic fallback.
function extractJsonObject(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t;
}

async function rerankWithAI(
  profile: Record<string, unknown>,
  candidates: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (candidates.length === 0) return [];

  // Heuristic scoring first — this is both the input to the AI (we only send the
  // strongest few) and the guaranteed fallback if the AI call is slow/unparsable.
  const scored = scoreCandidatesDeterministic(profile, candidates);
  const deterministicTop3 = scored.slice(0, 3);

  // Keep the AI payload small so the call stays fast: only the top candidates,
  // and only fields that matter for ranking (no descriptions/feature lists).
  const aiCandidates = scored.slice(0, 8);
  const candidateSummaries = aiCandidates.map((c) => ({
    id: c.id,
    title: c.title,
    make: c.make,
    model: c.model,
    year: c.year,
    type: c.type,
    price: Number(c.price),
    condition: c.condition,
    sleeps: c.sleeps,
    length: c.length,
    slides: c.slides,
    generator: c.generator,
    solar: c.solar,
    awning: c.awning,
    outdoor_kitchen: c.outdoor_kitchen,
    washer_dryer: c.washer_dryer,
    deal_score: c.deal_score,
    state: c.state,
    distance_miles: c.distance_miles,
  }));

  const rerankTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Rerank AI timeout")), 10_000)
  );

  try {
    const rerankResponse = await Promise.race([
      anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: RERANK_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `BUYER PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nCANDIDATE LISTINGS (${aiCandidates.length} total):\n${JSON.stringify(candidateSummaries, null, 2)}`,
          },
        ],
      }),
      rerankTimeout,
    ]);

    const rerankText = rerankResponse.content[0]?.type === "text" ? rerankResponse.content[0].text : "";

    const parsed = JSON.parse(extractJsonObject(rerankText));
    const matches = parsed.matches || [];

    const ranked = matches
      .sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank)
      .slice(0, 3)
      .map((match: { listingId: string; whyMatch?: string; matchScore?: number }) => {
        const listing = candidates.find((c) => String(c.id) === String(match.listingId));
        if (!listing) return null;
        // Backfill from deterministic scoring if the AI omitted either field, so
        // the response is never missing whyMatch/matchScore.
        const fallback = scored.find((d) => String(d.id) === String(listing.id));
        return {
          ...listing,
          whyMatch: match.whyMatch ?? fallback?.whyMatch ?? "A strong match for your needs.",
          matchScore: match.matchScore ?? fallback?.matchScore ?? 75,
        };
      })
      .filter(Boolean) as Record<string, unknown>[];

    // Guarantee the "top 3" contract: if the AI returned fewer than 3 valid
    // picks (unknown listingIds, or post-filter removals), backfill from the
    // deterministic ranking, skipping any listing already selected.
    if (ranked.length < 3) {
      const selectedIds = new Set(ranked.map((r) => String(r.id)));
      for (const candidate of scored) {
        if (ranked.length >= 3) break;
        if (selectedIds.has(String(candidate.id))) continue;
        ranked.push(candidate);
        selectedIds.add(String(candidate.id));
      }
    }

    return ranked.length > 0 ? ranked : deterministicTop3;
  } catch {
    console.error("AI re-ranking unavailable, using deterministic scoring");
    return deterministicTop3;
  }
}

// ─── Applied filters and expansion suggestions for no-match reporting ───
interface AppliedFilters {
  rvType?: string;
  minLength?: number;
  maxLength?: number;
}

interface ExpansionSuggestion {
  action: "expand_range" | "show_closest" | "change_type" | "start_over";
  label: string;
  message: string | null;
}

function buildExpansionSuggestions(filters: AppliedFilters): ExpansionSuggestion[] {
  const suggestions: ExpansionSuggestion[] = [];

  if (filters.minLength || filters.maxLength) {
    const lo = filters.minLength != null ? filters.minLength - 10 : undefined;
    const hi = filters.maxLength != null ? filters.maxLength + 10 : undefined;
    const rangeDesc = lo != null && hi != null ? `${lo}–${hi} ft` : lo != null ? `${lo}+ ft` : `under ${hi} ft`;
    suggestions.push({
      action: "expand_range",
      label: "Expand to wider range",
      message: `Please expand my length criteria to ${rangeDesc} and show me the closest available matches.`,
    });
  }

  suggestions.push({
    action: "show_closest",
    label: "Show closest matches",
    message: "Show me the closest available options even if they don't exactly match my criteria — I'm open to seeing what's near my request.",
  });

  suggestions.push({
    action: "change_type",
    label: "Change RV type",
    message: "Let me reconsider my RV type. What other types would work well for my needs?",
  });

  suggestions.push({
    action: "start_over",
    label: "Start over",
    message: null,
  });

  return suggestions;
}

// ─── Combined matching pipeline ───
async function getMatchedListings(
  profile: Record<string, unknown>
): Promise<{
  listings: Record<string, unknown>[];
  noMatch: boolean;
  appliedFilters: AppliedFilters;
  expansionSuggestions: ExpansionSuggestion[];
}> {
  const effectiveMax = computeEffectiveMaxBudget(profile);
  const enrichedProfile: Record<string, unknown> = {
    ...profile,
    ...(effectiveMax && !profile.maxBudget ? { maxBudget: effectiveMax } : {}),
  };

  const conditions = buildListingFilters(enrichedProfile);
  // Never recommend a no-photo unit.
  conditions.push("jsonb_array_length(images) > 0");
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const requiredType =
    enrichedProfile.rvType && enrichedProfile.rvType !== "not_sure"
      ? String(enrichedProfile.rvType)
      : null;

  const appliedFilters: AppliedFilters = {
    rvType: requiredType ?? undefined,
    minLength: enrichedProfile.minLength as number | undefined,
    maxLength: enrichedProfile.maxLength as number | undefined,
  };

  const recRows = await db.execute(
    sql.raw(`SELECT * FROM listings ${whereClause} ORDER BY is_featured DESC, deal_score ASC LIMIT 50`)
  );

  let candidates = (recRows as { rows?: Record<string, unknown>[] }).rows ?? [];

  if (candidates.length === 0) {
    return {
      listings: [],
      noMatch: true,
      appliedFilters,
      expansionSuggestions: buildExpansionSuggestions(appliedFilters),
    };
  }

  // ── Distance-based filtering ──
  const buyerLocStr = enrichedProfile.buyerLocation as string | undefined
    ?? enrichedProfile.buyerZip as string | undefined;
  const buyerState = enrichedProfile.buyerState as string | undefined;
  let buyerCoords: { lat: number; lng: number } | null = null;

  if (buyerLocStr) {
    buyerCoords = await geocodeBuyerLocation(buyerLocStr);
  }

  if (buyerCoords) {
    // Attach distance_miles to each candidate
    candidates = candidates.map((c) => {
      const lat = c.latitude as number | null;
      const lng = c.longitude as number | null;
      if (lat != null && lng != null) {
        return { ...c, distance_miles: Math.round(haversineDistance(buyerCoords!.lat, buyerCoords!.lng, lat, lng)) };
      }
      return { ...c, distance_miles: null };
    });

    // Expanding radius: 25 → 50 → 100 → 200 → all
    const radii = [25, 50, 100, 200];
    let nearby: Record<string, unknown>[] = [];
    for (const radius of radii) {
      nearby = candidates.filter((c) => c.distance_miles == null || (c.distance_miles as number) <= radius);
      if (nearby.length >= 3) break;
    }
    // Sort by distance (nulls last), take top 15 for AI rerank
    candidates = [
      ...nearby.filter((c) => c.distance_miles != null).sort((a, b) => (a.distance_miles as number) - (b.distance_miles as number)),
      ...nearby.filter((c) => c.distance_miles == null),
      // append any remaining candidates beyond radius for AI to consider if needed
      ...candidates.filter((c) => !nearby.includes(c)),
    ].slice(0, 15);
  } else if (buyerState) {
    // Fallback: state match
    const stateMatches = candidates.filter((c) => String(c.state ?? "").toUpperCase() === buyerState.toUpperCase());
    if (stateMatches.length >= 3) {
      candidates = stateMatches.slice(0, 15);
    }
  } else {
    candidates = candidates.slice(0, 15);
  }

  let listings = await rerankWithAI(enrichedProfile, candidates);

  // ── Absolute post-rerank safety net ──
  if (requiredType) {
    listings = listings.filter((l) => String(l.type) === requiredType);
  }
  const minLen = enrichedProfile.lengthFlexibility !== true
    ? (enrichedProfile.minLength as number | undefined)
    : undefined;
  const maxLen = enrichedProfile.lengthFlexibility !== true
    ? (enrichedProfile.maxLength as number | undefined)
    : undefined;
  if (minLen != null) {
    listings = listings.filter((l) => l.length != null && Number(l.length) >= minLen);
  }
  if (maxLen != null) {
    listings = listings.filter((l) => l.length != null && Number(l.length) <= maxLen);
  }

  if (listings.length === 0) {
    let fallback = candidates;
    if (requiredType) fallback = fallback.filter((c) => String(c.type) === requiredType);
    if (minLen != null) fallback = fallback.filter((c) => c.length != null && Number(c.length) >= minLen);
    if (maxLen != null) fallback = fallback.filter((c) => c.length != null && Number(c.length) <= maxLen);
    listings = fallback.slice(0, 3);
  }

  if (listings.length === 0) {
    return {
      listings: [],
      noMatch: true,
      appliedFilters,
      expansionSuggestions: buildExpansionSuggestions(appliedFilters),
    };
  }

  return { listings, noMatch: false, appliedFilters, expansionSuggestions: [] };
}

// ─── Routes ───

router.post("/outfitter/chat", async (req, res) => {
  try {
    const { messages = [], sessionId, buyerProfile } = req.body;

    const sessionIdOut = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const chatMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const chatTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Outfitter AI timeout")), 30_000)
    );
    const response = await Promise.race([
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1100,
        system: OUTFITTER_SYSTEM_PROMPT,
        messages: chatMessages,
      }),
      chatTimeout,
    ]);

    const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";

    // Extract profile JSON
    const profileMatch = rawText.match(/<profile>([\s\S]*?)<\/profile>/);
    const stageMatch = rawText.match(/<stage>([\s\S]*?)<\/stage>/);
    const noMatchTag = rawText.match(/<no_match>([\s\S]*?)<\/no_match>/);
    const aiReportsNoMatch = noMatchTag && noMatchTag[1].trim() === "true";

    let updatedProfile: Record<string, unknown> = buyerProfile || {};
    if (profileMatch) {
      try {
        const extracted = JSON.parse(profileMatch[1].trim());
        updatedProfile = { ...updatedProfile };
        for (const [key, value] of Object.entries(extracted)) {
          if (value !== null && value !== undefined) {
            updatedProfile[key] = value;
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    // Server-side backstop: parse rawLengthInput
    const rawLen = updatedProfile.rawLengthInput as string | undefined;
    if (rawLen && updatedProfile.lengthFlexibility !== true) {
      const parsed = parseLengthInput(rawLen);
      if (!updatedProfile.minLength && parsed.minLength !== undefined) {
        updatedProfile.minLength = parsed.minLength;
      }
      if (!updatedProfile.maxLength && parsed.maxLength !== undefined) {
        updatedProfile.maxLength = parsed.maxLength;
      }
      if (updatedProfile.lengthFlexibility === null || updatedProfile.lengthFlexibility === undefined) {
        updatedProfile.lengthFlexibility = parsed.lengthFlexibility;
      }
    }

    let stage = (stageMatch ? stageMatch[1].trim() : "knowledge") as string;

    // Strip all structured control tags from the visible message — the server
    // processes them server-side. Any tag not stripped here would leak raw
    // JSON/XML to the customer, which is the bug we're fixing.
    const cleanMessage = rawText
      .replace(/<profile>[\s\S]*?<\/profile>/g, "")
      .replace(/<stage>[\s\S]*?<\/stage>/g, "")
      .replace(/<no_match>[\s\S]*?<\/no_match>/g, "")
      .replace(/<match_request>[\s\S]*?<\/match_request>/g, "")
      .replace(/<match_criteria>[\s\S]*?<\/match_criteria>/g, "")
      .replace(/<search_params>[\s\S]*?<\/search_params>/g, "")
      .replace(/<filters>[\s\S]*?<\/filters>/g, "")
      .replace(/<json>[\s\S]*?<\/json>/g, "")
      .trim();

    // ── Server-side safety net: force stage=matching if the AI forgot to ──
    // Fires when: profile has essentials AND last user message is affirmative
    // OR the AI's own reply text implies it's transitioning to matching.
    const lastMsg = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
    const isAffirmative = lastMsg?.role === "user" &&
      /\b(yes|yeah|sure|yep|ok|okay|go ahead|show me|let'?s go|do it|find|^a$|option a|choice a|generate|ready|sounds good|go for it|perfect|great|absolutely|works for me|let'?s do it)\b/i
        .test(lastMsg.content.trim());
    // Buyer signalling "just show me anything" satisfies the budget requirement —
    // we shouldn't keep probing for a dollar figure they've declined to give.
    const showEverything = lastMsg?.role === "user" &&
      /\b(show me everything|just show me|whatever you (?:have|got|can find)|don'?t care about (?:budget|price)|budget.{0,12}(?:flexible|isn'?t an issue|no issue|open)|flexible.{0,12}budget|no budget limit|any budget)\b/i
        .test(lastMsg.content);
    const hasBudgetSignal = !!computeEffectiveMaxBudget(updatedProfile) || Boolean(showEverything);
    const hasEssentials = !!(
      hasBudgetSignal &&
      (updatedProfile.useCase || updatedProfile.rvType)
    );
    if (stage !== "matching" && stage !== "complete" && hasEssentials && (isAffirmative || showEverything)) {
      stage = "matching";
    }
    // Also catch: AI message implies transitioning to matching but forgot the stage tag
    if (stage !== "matching" && stage !== "complete" && hasEssentials &&
      /pull.{0,15}up your|top matches|finding your|let me find|here are your matches|searching.*inventory/i.test(cleanMessage)) {
      stage = "matching";
    }

    // If matching stage, use the full profile pipeline (SQL filter + AI re-rank)
    let recommendations: Record<string, unknown>[] = [];
    let noMatch = false;
    let noMatchFilters: AppliedFilters = {};
    let expansionSuggestions: ExpansionSuggestion[] = [];

    if ((stage === "matching" || stage === "complete" || stage === "deep_dive") && updatedProfile) {
      const result = await getMatchedListings(updatedProfile);
      recommendations = result.listings;
      noMatch = result.noMatch || Boolean(aiReportsNoMatch);
      noMatchFilters = result.appliedFilters;
      expansionSuggestions = result.expansionSuggestions;
    }

    const formattedRecommendations = recommendations.map((r) => ({
      id: r.id,
      title: r.title,
      make: r.make,
      model: r.model,
      year: r.year,
      type: r.type,
      price: Number(r.price),
      marketValue: Number(r.market_value ?? r.marketValue ?? 0),
      dealScore: r.deal_score ?? r.dealScore,
      dealSavings: Number(r.deal_savings ?? r.dealSavings ?? 0),
      location: r.location,
      state: r.state,
      dealerName: r.dealer_name ?? r.dealerName,
      dealerId: r.dealer_id ?? r.dealerId,
      images: (r.images as string[]) ?? [],
      daysOnMarket: Number(r.days_on_market ?? r.daysOnMarket ?? 0),
      sleeps: Number(r.sleeps ?? 2),
      length: r.length,
      condition: r.condition,
      isNew: Boolean(r.is_new ?? r.isNew),
      isFeatured: Boolean(r.is_featured ?? r.isFeatured),
      slides: r.slides,
      freshWater: r.fresh_water ?? r.freshWater,
      generator: r.generator,
      solar: r.solar,
      awning: r.awning,
      outdoorKitchen: r.outdoor_kitchen ?? r.outdoorKitchen,
      washerDryer: r.washer_dryer ?? r.washerDryer,
      whyMatch: r.whyMatch ?? null,
      matchScore: r.matchScore ?? null,
      distanceMiles: r.distance_miles ?? null,
    }));

    res.json({
      message: cleanMessage,
      sessionId: sessionIdOut,
      updatedProfile,
      recommendations: formattedRecommendations,
      stage,
      noMatch,
      noMatchFilters,
      expansionSuggestions,
    });
  } catch (err) {
    console.error("Outfitter chat error:", err);
    res.status(500).json({ message: "Outfitter is temporarily unavailable. Please try again." });
  }
});

router.post("/outfitter/recommendations", async (req, res) => {
  try {
    const profile = req.body as Record<string, unknown>;

    const { listings: matched } = await getMatchedListings(profile);

    const listings = matched.map((r) => ({
      id: r.id,
      title: r.title,
      make: r.make,
      model: r.model,
      year: r.year,
      type: r.type,
      price: Number(r.price),
      marketValue: Number(r.market_value ?? 0),
      dealScore: r.deal_score,
      dealSavings: Number(r.deal_savings ?? 0),
      location: r.location,
      state: r.state,
      dealerName: r.dealer_name,
      dealerId: r.dealer_id,
      images: (r.images as string[]) ?? [],
      daysOnMarket: Number(r.days_on_market ?? 0),
      sleeps: Number(r.sleeps ?? 2),
      length: r.length,
      condition: r.condition,
      isNew: Boolean(r.is_new),
      isFeatured: Boolean(r.is_featured),
      slides: r.slides,
      freshWater: r.fresh_water,
      generator: r.generator,
      solar: r.solar,
      awning: r.awning,
      outdoorKitchen: r.outdoor_kitchen,
      washerDryer: r.washer_dryer,
      whyMatch: r.whyMatch ?? null,
      matchScore: r.matchScore ?? null,
    }));

    res.json({ listings, explanation: "AI-ranked matches based on your complete profile." });
  } catch (err) {
    console.error("Recommendations error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

# MatchRV — AI RV Outfitter: Complete Source & Knowledge Bundle

> Generated: 2026-06-27
> Product: MatchRV (matchrv.com) — AI-powered RV marketplace
> This document contains **everything** behind the AI RV Outfitter: what it is,
> what it is "trained on" (its prompts + baked-in knowledge), every word it says,
> and the full source code for the backend brain, the web chat, and the mobile chat.

---

## Table of Contents

1. What it is (architecture overview)
2. What it's "trained on" — the two system prompts (verbatim)
3. Baked-in knowledge (tow capacities, geo, budget math, length parsing, scoring)
4. Key user-facing copy (verbatim)
5. The matching pipeline, step by step
6. Full source — Backend brain (`artifacts/api-server/src/routes/outfitter.ts`)
7. Full source — Web chat page (`artifacts/rv-marketplace/src/pages/outfitter.tsx`)
8. Full source — Web chat state hook (`artifacts/rv-marketplace/src/hooks/use-chat-session.ts`)
9. Full source — Mobile chat screen (`artifacts/lotlink-mobile/app/(tabs)/outfitter.tsx`)
10. API contract (OpenAPI excerpt)
11. Known contract mismatch (stage vocabulary)

---

## 1. What it is (architecture overview)

The RV Outfitter is **not a single model** — it is a small system built around **two
Anthropic Claude models** plus deterministic logic and a Postgres inventory database.

| Role | Model | Where | Limits |
|------|-------|-------|--------|
| **Conversation brain** (talks to the buyer, runs discovery, extracts profile) | `claude-sonnet-4-6` | `POST /api/outfitter/chat` | `max_tokens: 1100`, 30s timeout |
| **Matching / re-rank engine** (picks the top 3 RVs + writes "why it matches") | `claude-haiku-4-5` | inside the matching pipeline | `max_tokens: 1024`, 10s timeout, deterministic fallback |

**Two conversation modes** (decided by the brain):

- **Mode 1 — Knowledge:** open Q&A about RVs (brands, towing, maintenance, lifestyle). It just answers.
- **Mode 2 — Product Selection:** a guided "professional outfitter" discovery flow that asks about the buyer's *life and use* (never a feature checklist), builds a structured buyer profile, then hands off to the matching engine.

**How structured data flows:** the brain embeds hidden control tags at the end of every
reply — `<profile>{...json...}</profile>`, `<stage>...</stage>`, and optionally
`<no_match>true</no_match>`. The server parses these, **strips them from the visible
message**, updates the buyer profile, and — when the stage is `matching`/`complete` —
runs the matching pipeline. The customer never sees raw JSON/XML.

**Endpoints** (`artifacts/api-server/src/routes/outfitter.ts`):
- `POST /api/outfitter/chat` — the conversational turn (brain + optional matching).
- `POST /api/outfitter/recommendations` — matching pipeline only, from a finished profile.

**Front-ends:**
- **Web** (`rv-marketplace`): `artifacts/rv-marketplace/src/pages/outfitter.tsx` (UI) + `artifacts/rv-marketplace/src/hooks/use-chat-session.ts` (state, retries, localStorage persistence, analytics).
- **Mobile** (`lotlink-mobile`, Expo/React Native): `artifacts/lotlink-mobile/app/(tabs)/outfitter.tsx` (chat + quick-pick pill widgets + a "Match Report" modal).

---

## 2. What it's "trained on" — the system prompts (verbatim)

The Outfitter is not fine-tuned; its entire personality, methodology, rules, and output
contract live in these two system prompts. **This is the heart of the feature.**

### 2.1 Conversation brain — `OUTFITTER_SYSTEM_PROMPT` (model: `claude-sonnet-4-6`)

````text
You are the RV Outfitter — a warm, knowledgeable RV guide on MatchRV.com. You have TWO modes:

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
When you are ready to find matches (stage = matching or complete), do NOT output any JSON block, XML block, <match_request> tag, or structured data in your conversational message. The server reads your <profile> and <stage> tags automatically and runs the matching pipeline. Your message to the customer should be a warm, natural transition — something like: "Perfect — I have everything I need. Let me pull up your top matches now..." followed by a brief summary of what you're looking for. Do NOT show raw JSON, XML tags, or structured criteria blocks to the customer under any circumstances.
````

### 2.2 Matching engine — `RERANK_SYSTEM_PROMPT` (model: `claude-haiku-4-5`)

````text
You are the RV Outfitter matching engine. You receive a buyer profile and a list of candidate RV listings. Your job is to select the TOP 3 listings that BEST match this specific buyer's needs and lifestyle.

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

Return ONLY valid JSON, no other text.
````

---

## 3. Baked-in knowledge (deterministic, no AI)

Beyond the prompts, the Outfitter carries hard-coded domain knowledge so it works fast
and never depends on the AI for facts it can compute.

### 3.1 Tow-capacity lookup (lbs) — `TOW_CAPACITY`
Used to make sure a towable RV's GVWR fits the buyer's vehicle.

````ts
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
````

### 3.2 Washington city coordinates — `WA_CITY_COORDS`
Roughly 60 WA cities pre-geocoded (the full table is below) so "find RVs near me" works
without an API call. Anything not in the table falls back to OpenStreetMap Nominatim.

````ts
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
````

### 3.3 Budget math (payments → max price)
When a buyer gives a monthly payment, the server amortizes it into a max purchase price.

- **Server formula** (`computeEffectiveMaxBudget`): 6.99% APR, 180-month term.
  `loanAmount = monthly × (1 − (1 + r)^−180) / r`, where `r = 0.0699 / 12`; then `maxBudget = loanAmount + downPayment`.
- **Prompt-level shortcut** the brain is told to use: `maxBudget = downPayment + (monthlyPayment × 111.4)`.
- The **web** client mirrors the server formula in `computeMaxBudget`. The **mobile** client does **not** recompute budget — it only reads `profile.maxBudget` (already set by the server) when drawing its "within budget" badges.

### 3.4 Length parsing (`parseLengthInput`)
Turns natural language into `minLength`/`maxLength`/`lengthFlexibility`:
"flexible/open/any" → flexible; "25–30 ft" → 25–30; "under 25" → max 25; "40+" → min 40;
"around 40 ft" → 37–43; a bare number 15–65 → ±3 ft.

### 3.5 Deterministic match scoring (`scoreCandidatesDeterministic`)
The always-available baseline that guarantees ranked results with a `whyMatch` string
even if the AI re-rank is slow or fails. Starts every candidate at 50 and adjusts:

| Signal | Effect |
|--------|--------|
| Price within max budget | +20 (and "well within"/"fits your budget" reason) |
| Price over budget | −25 |
| RV type matches requested | +15 |
| Sleeps ≥ travelers | +10 (under → −10) |
| Deal score `great_deal` / `good_deal` | +15 / +8 |
| Within ~50 mi / ~150 mi | +8 / +3 |
| Model year within 3 years | +5 |
| New condition | +3 |

Scores are clamped to 1–100; reasons are joined into the `whyMatch` sentence.

---

## 4. Key user-facing copy (verbatim)

> This section collects the **primary** strings the Outfitter shows. It is a curated
> highlight, not an exhaustive string dump — **every** literal string the feature can
> display lives in the full source in Parts 7–9. Other strings present in the source but
> not reproduced here include the web SEO description, voice-input states ("Listening…"),
> "No photo" placeholders, and the mobile match-report chrome ("AI Outfitter", "Powered
> by Claude AI", "Your Match Report", "{N} RVs Matched", "Based on your lifestyle…",
> "TOP MATCHES", "Full Report", "Recommended for You" / "Showing …"), plus the fallback
> no-match labels "Expand range" / "Show closest".

### 4.1 Opening greeting — Web (`use-chat-session.ts`)
> Hey there! I'm your RV Outfitter — think of me as a friend who knows way too much about RVs.
>
> You can ask me anything — like "Why do people love Airstreams?" or "What can I tow with my truck?" — and I'll give you a straight answer.
>
> Or if you're ready to find YOUR RV, just say "help me find one" and I'll walk you through a few quick questions about how you camp. No pressure either way — what's on your mind?

### 4.2 Opening greeting — Mobile (`outfitter.tsx`)
> Hi! I'm your AI Outfitter. I'll help you find the perfect RV by asking a few questions about how you'll use it. Ready to find your ideal rig?

### 4.3 Web header + input copy
- Header subtitle: `Ask me anything about RVs — or say "help me find one" to get personalized matches`
- Input placeholder (knowledge mode): `Ask me anything about RVs...`
- Input placeholder (discovery): `Type your answer…`
- Footer hint: `Ask any RV question, or say "help me find one" to start a personalized match`

### 4.4 Web suggested questions (shown before first message)
- "What's the difference between a fifth wheel and a travel trailer?"
- "What should I look for in a used RV?"
- "Can I full-time in an RV?"
- "Help me find my perfect RV"

### 4.5 Mobile quick-pick pills
**RV types:** Class A Motorhome · Class B (Camper Van) · Class C Motorhome · Travel Trailer · Fifth Wheel · Toy Hauler · Truck Camper · Not sure — help me decide

**Length ranges:** Under 25 ft · 25–30 ft · 30–35 ft · 35–40 ft · 40+ ft · Flexible — I'm open

### 4.6 Results / sign-in gate (Web)
- Matches header: `Your Matches`
- Sign-in gate title: `Your matches are ready!`
- Sign-in gate body: `Sign in to see your {N} personalized RV matches — free, takes 10 seconds.`
- Sign-in button: `Sign In to View Matches`
- Full-report CTA: `Get Your Full Match Report`

### 4.7 No-match copy
- **Web:** `No exact matches for those criteria` / `Our inventory changes daily. Here are some options:`
- **Mobile:** `No exact matches found` / `We couldn't find a {criteria} in our current Washington inventory. Let's try adjusting your criteria.`
- **Expansion buttons:** "Expand to wider range" · "Show closest matches" · "Change RV type" · "Start over"

### 4.8 Error messages
- **Web (timeout/failure):** `Sorry — that took longer than expected on my end. Mind sending that again?`
- **Mobile (failure):** `Sorry, something went wrong. Please try again.`
- **Server 500:** `Outfitter is temporarily unavailable. Please try again.`

### 4.9 Match-report note (Mobile)
> Match scores are calculated by your AI Outfitter — weighing budget fit, lifestyle match, and deal quality.

---

## 5. The matching pipeline, step by step

When `stage` becomes `matching` / `complete` (or `deep_dive`), `getMatchedListings()` runs:

1. **Compute effective budget** — fold monthly payment → max price if needed.
2. **SQL filter** (`buildListingFilters`) — type, price ≤ budget, sleeps ≥ travelers, length range (+5 ft slack if flexible), GVWR ≤ tow capacity (towables), boondocking gear, condition. Pulls up to 50 candidates ordered by featured + deal score.
3. **Distance filter** — geocode the buyer (WA table or Nominatim), attach `distance_miles` via haversine, then expand the radius 25 → 50 → 100 → 200 mi until ≥3 remain. The survivors are ordered nearest-first, any candidates still beyond the radius are appended after them, and the list is sliced to the first 15 for re-ranking.
4. **AI re-rank** (`rerankWithAI`) — deterministically score, send the top 8 (ranking-relevant fields only) to `claude-haiku-4-5`, parse its JSON (fence-tolerant via `extractJsonObject`), take its top 3 and **backfill** from deterministic scoring if it returns fewer than 3 or times out.
5. **Hard safety net** — re-filter the AI's picks by required type and length range so it can never return something off-spec.
6. **Fallback pass** — if the safety net empties the list, fall back to the pre-rerank candidates (re-filtered by the same type/length rules) and take the top 3.
7. **No-match handling** — only if that is *also* empty, return `noMatch: true` with expansion suggestions.
8. **Format** — normalize DB rows into the API's `Listing` shape with `whyMatch` + `matchScore`.

---

## 6. Full source — Backend brain
**`artifacts/api-server/src/routes/outfitter.ts`** (989 lines) — the complete file, including both system prompts, knowledge tables, the matching pipeline, and both routes.

````ts
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

````

---

## 7. Full source — Web chat page
**`artifacts/rv-marketplace/src/pages/outfitter.tsx`** (380 lines)

````tsx
import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useChatSession } from "@/hooks/use-chat-session";
import { Send, Loader2, Sparkles, Compass, ChevronRight, Heart, ExternalLink, Search, AlertTriangle, RefreshCw, MessageCircle, HelpCircle, Mic, MicOff } from "lucide-react";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { formatCurrency, formatRvType } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useAppAuth } from "@/contexts/auth-context";
import type { BuyerProfile } from "@workspace/api-client-react/src/generated/api.schemas";
import type { ExpansionSuggestion } from "@/hooks/use-chat-session";

// ── Client-side budget helper (mirrors server formula) ──────────────────────
function computeMaxBudget(prof: BuyerProfile): number | null {
  if (prof.maxBudget) return prof.maxBudget;
  if (prof.monthlyPayment) {
    const r = 0.0699 / 12;
    const n = 180;
    const loan = prof.monthlyPayment * ((1 - Math.pow(1 + r, -n)) / r);
    return Math.round(loan + (prof.downPayment ?? 0));
  }
  return null;
}

// ── Match reason badges for a listing vs buyer profile ──────────────────────
function getMatchBadges(listing: Record<string, unknown>, prof: BuyerProfile): string[] {
  const badges: string[] = [];

  if (prof.rvType && prof.rvType !== "not_sure" && listing.type === prof.rvType) {
    badges.push(`${formatRvType(prof.rvType)} ✓`);
  }

  if (listing.length != null) {
    const l = Number(listing.length);
    const hasRange = prof.minLength || prof.maxLength;
    if (hasRange) {
      const minOk = !prof.minLength || l >= prof.minLength - 1;
      const maxOk = !prof.maxLength || l <= prof.maxLength + 1;
      if (minOk && maxOk) badges.push(`${l.toFixed(0)} ft ✓`);
    }
  }

  const maxB = computeMaxBudget(prof);
  if (maxB && Number(listing.price) <= maxB) badges.push("Within budget ✓");

  const needed = prof.sleepingCapacity ?? prof.travelers;
  if (needed && Number(listing.sleeps) >= Number(needed)) {
    badges.push(`Sleeps ${listing.sleeps} ✓`);
  }

  if (prof.useCase && prof.useCase !== "other") {
    const useCaseLabel: Record<string, string> = {
      weekends: "Weekend-ready ✓",
      full_time: "Full-time ✓",
      seasonal: "Seasonal ✓",
      tailgating: "Tailgating ✓",
    };
    const label = useCaseLabel[prof.useCase];
    if (label) badges.push(label);
  }

  return badges.slice(0, 4);
}

// ── Suggested questions for open Q&A mode ───────────────────────────────────
const SUGGESTED_QUESTIONS = [
  { label: "What's the difference between a fifth wheel and a travel trailer?", icon: HelpCircle },
  { label: "What should I look for in a used RV?", icon: Search },
  { label: "Can I full-time in an RV?", icon: Compass },
  { label: "Help me find my perfect RV", icon: Heart },
];

export function Outfitter() {
  const { messages, sendMessage, isTyping, profile, recommendations, stage, noMatch, noMatchFilters, expansionSuggestions, messagesEndRef } = useChatSession();
  const { isAuthenticated, login, isSaved, toggleSave } = useAppAuth();
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(true);

  useEffect(() => {
    trackEvent("page_view", { metadata: { page: "outfitter_chat" } });
  }, []);

  // Hide suggestions after first user message
  useEffect(() => {
    if (messages.length > 1) {
      setShowSuggestions(false);
    }
  }, [messages]);

  const { status: micStatus, toggle: toggleMic } = useSpeechToText({
    onResult: (transcript) => setInput(prev => prev ? `${prev} ${transcript}` : transcript),
  });

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || isTyping) return;
    setInput("");
    await sendMessage(text);
  };

  const handleSuggestionClick = (question: string) => {
    setShowSuggestions(false);
    sendMessage(question);
  };

  const hasRecommendations = recommendations.length > 0;

  return (
    <Layout>
      <SEO
        title="RV Outfitter — Your Personal RV Expert"
        description="Ask any RV question or let our AI Outfitter help you find the perfect RV for your lifestyle. Free, no pressure."
        canonical="https://matchrv.com/outfitter"
      />

      <div className="flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>

        {/* Header */}
        <section className="bg-[#0B1117] text-white py-5 px-4 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#00CED1]/20 flex items-center justify-center flex-shrink-0">
                <Compass className="w-5 h-5 text-[#00CED1]" />
              </div>
              <div>
                <h1 className="text-lg font-display font-black tracking-tight">RV Outfitter</h1>
                <p className="text-white/60 text-xs">
                  Ask me anything about RVs — or say "help me find one" to get personalized matches
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Chat area */}
        <div className="flex-1 bg-background flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-3">

              {/* Messages */}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-[#0B1117] flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                      <Compass className="w-3.5 h-3.5 text-[#00CED1]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-[#0B1117] text-white rounded-br-sm"
                        : "bg-white border border-[#E2E8F0] text-[#161d1d] rounded-bl-sm shadow-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-full bg-[#0B1117] flex items-center justify-center flex-shrink-0 mr-2">
                    <Compass className="w-3.5 h-3.5 text-[#00CED1]" />
                  </div>
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <div className="flex gap-1 items-center h-4">
                      {[0, 150, 300].map(delay => (
                        <div
                          key={delay}
                          className="w-1.5 h-1.5 bg-[#3b4949] rounded-full animate-bounce"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Suggested questions (shown initially) */}
              {showSuggestions && messages.length <= 1 && !isTyping && (
                <div className="mt-4">
                  <p className="text-xs text-[#3b4949] mb-3 font-medium">Or try one of these:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SUGGESTED_QUESTIONS.map((q) => {
                      const Icon = q.icon;
                      return (
                        <button
                          key={q.label}
                          onClick={() => handleSuggestionClick(q.label)}
                          className="text-left px-4 py-3 bg-white border border-[#E2E8F0] rounded-xl text-sm text-[#161d1d] hover:border-[#0B1117] hover:bg-[#00CED1]/5 transition flex items-start gap-2.5"
                        >
                          <Icon className="w-4 h-4 text-[#0B1117] flex-shrink-0 mt-0.5" />
                          <span>{q.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No match state */}
              {noMatch && !isTyping && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm">
                  <div className="flex items-center gap-2 font-bold text-amber-800 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    No exact matches for those criteria
                  </div>
                  <p className="text-amber-700 text-xs mb-3">
                    Our inventory changes daily. Here are some options:
                  </p>
                  {expansionSuggestions.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {expansionSuggestions.map((s: ExpansionSuggestion, i: number) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s.message ?? s.label)}
                          className="text-left px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Recommendations */}
              {hasRecommendations && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-[#0B1117]" />
                    <span className="text-sm font-black text-[#161d1d]">Your Matches</span>
                  </div>

                  {!isAuthenticated ? (
                    /* ── Sign-in gate ── */
                    <div className="bg-white border border-[#0B1117]/20 rounded-2xl p-6 text-center shadow-sm">
                      <div className="w-12 h-12 rounded-full bg-[#00CED1]/30 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="w-6 h-6 text-[#0B1117]" />
                      </div>
                      <p className="font-black text-[#161d1d] text-base mb-1">
                        Your matches are ready!
                      </p>
                      <p className="text-sm text-[#3b4949] mb-5 leading-relaxed">
                        Sign in to see your {recommendations.length} personalized RV matches — free, takes 10 seconds.
                      </p>
                      <button
                        onClick={login}
                        className="w-full py-3 rounded-xl bg-[#0B1117] text-white font-black text-sm hover:bg-[#002829] transition flex items-center justify-center gap-2"
                      >
                        <Heart className="w-4 h-4" /> Sign In to View Matches
                      </button>
                    </div>
                  ) : (
                    /* ── Authenticated: show cards ── */
                    <>
                      {recommendations.map((rec: Record<string, unknown>, i: number) => {
                        const badges = getMatchBadges(rec, profile);
                        return (
                          <Link key={String(rec.id)} href={`/listing/${rec.id}`}>
                            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden hover:border-[#0B1117] transition cursor-pointer shadow-sm">
                              <div className="flex">
                                {/* Image */}
                                <div className="w-28 h-28 flex-shrink-0 bg-[#eef5f4]">
                                  {Array.isArray(rec.images) && rec.images[0] ? (
                                    <img src={String(rec.images[0])} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[#3b4949] text-xs">No photo</div>
                                  )}
                                </div>
                                {/* Details */}
                                <div className="flex-1 p-3 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs text-[#3b4949] truncate">{formatRvType(String(rec.type))}</p>
                                      <p className="text-sm font-bold text-[#161d1d] truncate">
                                        {rec.year} {rec.make} {rec.model}
                                      </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-sm font-black text-[#0B1117]">{formatCurrency(Number(rec.price))}</p>
                                    </div>
                                  </div>
                                  {/* Match badges */}
                                  {badges.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {badges.map((b) => (
                                        <span key={b} className="px-2 py-0.5 bg-[#00CED1]/30 text-[#0B1117] text-[10px] font-bold rounded">
                                          {b}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Why it matches */}
                                  {rec.whyMatch && (
                                    <p className="text-xs text-[#3b4949] mt-1.5 line-clamp-2 leading-relaxed">
                                      {String(rec.whyMatch)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Link>
                        );
                      })}

                      {/* CTA to full match report */}
                      <Link href="/match">
                        <button className="w-full mt-2 py-3 rounded-xl bg-[#0B1117] text-white font-black text-sm hover:bg-[#002829] transition flex items-center justify-center gap-2">
                          <Heart className="w-4 h-4" /> Get Your Full Match Report
                        </button>
                      </Link>
                    </>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="bg-white border-t border-[#E2E8F0] shadow-md flex-shrink-0">
            <form onSubmit={handleSend} className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={micStatus === "listening"
                  ? "Listening…"
                  : stage === "knowledge" || messages.length <= 1
                    ? "Ask me anything about RVs..."
                    : "Type your answer…"
                }
                className={`flex-1 px-4 py-3 rounded-xl border text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none bg-white transition ${
                  micStatus === "listening"
                    ? "border-red-400 focus:border-red-400 bg-red-50"
                    : "border-[#E2E8F0] focus:border-[#0B1117]"
                }`}
                disabled={isTyping}
              />
              {micStatus !== "unsupported" && (
                <button
                  type="button"
                  onClick={toggleMic}
                  disabled={isTyping}
                  title={micStatus === "listening" ? "Stop recording" : "Speak your answer"}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition flex-shrink-0 disabled:opacity-40 ${
                    micStatus === "listening"
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-[#eef5f4] text-[#3b4949] hover:bg-[#E2E8F0]"
                  }`}
                >
                  {micStatus === "listening" ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="w-12 h-12 rounded-xl bg-[#0B1117] text-white flex items-center justify-center hover:bg-[#002829] transition disabled:opacity-40 flex-shrink-0"
              >
                {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
            <div className="max-w-3xl mx-auto px-4 pb-2">
              <p className="text-[10px] text-[#3b4949] text-center">
                Ask any RV question, or say "help me find one" to start a personalized match
              </p>
            </div>
          </div>
        </div>

      </div>
    </Layout>
  );
}

````

---

## 8. Full source — Web chat state hook
**`artifacts/rv-marketplace/src/hooks/use-chat-session.ts`** (169 lines) — holds the conversation, the opening greeting, shorthand expansion ("30k" → "$30,000"), retry policy, localStorage persistence, and analytics.

````ts
import { useState, useCallback, useRef, useEffect } from "react";
import { useOutfitterChat } from "@workspace/api-client-react";
import type {
  ChatMessage,
  BuyerProfile,
  Listing,
  NoMatchFilters,
  ExpansionSuggestion,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { recordBuyerIntent } from "@/lib/buyer-intent";

export type { NoMatchFilters, ExpansionSuggestion };

/**
 * Expand shorthand number notation before sending to the AI.
 * "30k" → "$30,000", "1.5m" → "$1,500,000", "50K budget" → "$50,000 budget"
 */
function expandShorthands(text: string): string {
  let result = text.replace(/\b(\d+(?:\.\d+)?)\s*[kK]\b/g, (_m, n) => {
    const val = Math.round(parseFloat(n) * 1_000);
    return `$${val.toLocaleString("en-US")}`;
  });
  result = result.replace(/\b(\d+(?:\.\d+)?)\s*[mM]\b/g, (_m, n) => {
    const val = Math.round(parseFloat(n) * 1_000_000);
    return `$${val.toLocaleString("en-US")}`;
  });
  return result;
}

export function useChatSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hey there! I'm your RV Outfitter — think of me as a friend who knows way too much about RVs.\n\nYou can ask me anything — like \"Why do people love Airstreams?\" or \"What can I tow with my truck?\" — and I'll give you a straight answer.\n\nOr if you're ready to find YOUR RV, just say \"help me find one\" and I'll walk you through a few quick questions about how you camp. No pressure either way — what's on your mind?"
    }
  ]);
  const [sessionId, setSessionId] = useState<string>(`session_${Math.random().toString(36).substr(2, 9)}`);
  const [profile, setProfile] = useState<BuyerProfile>({});
  const [recommendations, setRecommendations] = useState<Listing[]>([]);
  const [stage, setStage] = useState<string>("greeting");
  const [noMatch, setNoMatch] = useState(false);
  const [noMatchFilters, setNoMatchFilters] = useState<NoMatchFilters>({});
  const [expansionSuggestions, setExpansionSuggestions] = useState<ExpansionSuggestion[]>([]);
  
  const chatMutation = useOutfitterChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const trackedStage = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, chatMutation.isPending]);

  const sendMessage = useCallback(async (rawContent: string) => {
    if (!rawContent.trim() || chatMutation.isPending) return;

    const content = expandShorthands(rawContent);
    // Reset noMatch state when user sends a new message
    setNoMatch(false);
    setExpansionSuggestions([]);
    const userMsg: ChatMessage = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    const attemptRequest = async (attemptsLeft: number): Promise<void> => {
      try {
        const response = await chatMutation.mutateAsync({
          data: {
            messages: newMessages,
            sessionId,
            buyerProfile: profile,
          }
        });

        setMessages(prev => [...prev, { role: "assistant", content: response.message }]);
        
        if (response.sessionId) setSessionId(response.sessionId);
        if (response.updatedProfile) {
          setProfile(response.updatedProfile);
          try {
            localStorage.setItem("rv_outfitter_session", JSON.stringify({
              sessionId: response.sessionId ?? sessionId,
              profile: response.updatedProfile,
              messages: [...newMessages, { role: "assistant", content: response.message }],
              updatedAt: new Date().toISOString(),
            }));
          } catch { /* ignore */ }
        }
        if (response.recommendations) setRecommendations(response.recommendations);
        if (response.noMatch !== undefined) setNoMatch(Boolean(response.noMatch));
        if (response.noMatchFilters) setNoMatchFilters(response.noMatchFilters);
        if (response.expansionSuggestions) setExpansionSuggestions(response.expansionSuggestions);
        if (response.stage) {
          setStage(response.stage);

          // Track stage transitions for analytics
          const shouldTrack = (response.stage === "matching" || response.stage === "complete")
            && trackedStage.current !== response.stage;
          if (shouldTrack) {
            trackedStage.current = response.stage;
            const p = response.updatedProfile ?? profile;
            const deepDiveDone = Boolean(
              p.experience ||
              p.campingStyle ||
              (Array.isArray(p.mustHaves) && p.mustHaves.length > 0)
            );
            const outfitterEvent = deepDiveDone
              ? "outfitter_full_complete"
              : "outfitter_half_complete";
            recordBuyerIntent(outfitterEvent, {
              metadata: {
                rvType: p.rvType,
                useCase: p.useCase,
                maxBudget: p.maxBudget,
                travelers: p.travelers,
                towVehicle: p.towVehicle,
                experience: p.experience,
                campingStyle: p.campingStyle,
                mustHaves: p.mustHaves,
                stage: response.stage,
              },
            });
          }

          // Track knowledge mode engagement
          if (response.stage === "knowledge" && trackedStage.current !== "knowledge") {
            trackedStage.current = "knowledge";
            recordBuyerIntent("outfitter_knowledge_mode", {
              metadata: { sessionId },
            });
          }
        }
      } catch (error) {
        // Only retry transient network blips — never retry server/HTTP errors
        // (e.g. an AI-timeout 500). Retrying a 15-30s request 3x compounds into a
        // multi-minute hang, which is what made the AI feel "broken."
        const isServerError = (error as { name?: string } | null)?.name === "ApiError";
        if (!isServerError && attemptsLeft > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return attemptRequest(attemptsLeft - 1);
        }
        console.error("Failed to send message:", error);
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Sorry — that took longer than expected on my end. Mind sending that again?" 
        }]);
      }
    };

    await attemptRequest(2);
  }, [messages, sessionId, profile, chatMutation]);

  return {
    messages,
    sendMessage,
    isTyping: chatMutation.isPending,
    profile,
    recommendations,
    stage,
    noMatch,
    noMatchFilters,
    expansionSuggestions,
    messagesEndRef
  };
}

````

---

## 9. Full source — Mobile chat screen
**`artifacts/lotlink-mobile/app/(tabs)/outfitter.tsx`** (849 lines) — React Native / Expo screen with quick-pick pill widgets and a Match Report modal.

````tsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DealBadge } from "@/components/DealBadge";
import { useColors } from "@/hooks/useColors";

// ── Types ────────────────────────────────────────────────────────────────────

interface RichListing {
  id: number;
  year: number;
  make: string;
  model: string;
  price: number;
  type: string;
  images?: string[];
  dealScore?: string;
  location?: string;
  dealerName?: string;
  matchScore?: number;
  whyMatch?: string;
  [key: string]: unknown;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface NoMatchFilters {
  rvType?: string;
  minLength?: number;
  maxLength?: number;
}

interface ExpansionSuggestion {
  action: "expand_range" | "show_closest" | "change_type" | "start_over";
  label: string;
  message: string | null;
}

interface ChatState {
  messages: Message[];
  sessionId?: string;
  buyerProfile?: Record<string, unknown>;
  recommendations: RichListing[];
  stage: string;
  noMatch: boolean;
  noMatchFilters: NoMatchFilters;
  expansionSuggestions: ExpansionSuggestion[];
}

interface OutfitterChatResponse {
  message: string;
  sessionId?: string;
  updatedProfile?: Record<string, unknown>;
  recommendations?: RichListing[];
  stage: string;
  noMatch?: boolean;
  noMatchFilters?: NoMatchFilters;
  expansionSuggestions?: ExpansionSuggestion[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RV_TYPES = [
  { label: "Class A Motorhome",            value: "class_a",        msg: "I'm looking for a Class A Motorhome" },
  { label: "Class B (Camper Van)",          value: "class_b",        msg: "I'm looking for a Class B Motorhome (Camper Van)" },
  { label: "Class C Motorhome",            value: "class_c",        msg: "I'm looking for a Class C Motorhome" },
  { label: "Travel Trailer",               value: "travel_trailer", msg: "I'm looking for a Travel Trailer" },
  { label: "Fifth Wheel",                 value: "fifth_wheel",    msg: "I'm looking for a Fifth Wheel" },
  { label: "Toy Hauler",                  value: "toy_hauler",     msg: "I'm looking for a Toy Hauler" },
  { label: "Truck Camper",                value: "truck_camper",   msg: "I'm looking for a Truck Camper" },
  { label: "Not sure — help me decide",   value: "not_sure",       msg: "I'm not sure yet — help me decide what type is right for me" },
];

const LENGTH_RANGES = [
  { label: "Under 25 ft",         msg: "I'm looking for something under 25 ft" },
  { label: "25–30 ft",            msg: "I want something in the 25–30 ft range" },
  { label: "30–35 ft",            msg: "I want something in the 30–35 ft range" },
  { label: "35–40 ft",            msg: "I want something in the 35–40 ft range" },
  { label: "40+ ft",              msg: "I want 40 ft or longer" },
  { label: "Flexible — I'm open", msg: "I'm flexible on length, I'm open to anything that fits my needs" },
];

const INITIAL_MESSAGE: Message = {
  id: "intro",
  role: "assistant",
  content: "Hi! I'm your AI Outfitter. I'll help you find the perfect RV by asking a few questions about how you'll use it. Ready to find your ideal rig?",
};

const INITIAL_CHAT: ChatState = {
  messages: [INITIAL_MESSAGE],
  recommendations: [],
  stage: "greeting",
  noMatch: false,
  noMatchFilters: {},
  expansionSuggestions: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(p: number) {
  return "$" + p.toLocaleString("en-US");
}

function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 6);
}

function expandShorthands(text: string): string {
  let result = text.replace(/\b(\d+(?:\.\d+)?)\s*[kK]\b/g, (_m: string, n: string) => {
    const val = Math.round(parseFloat(n) * 1_000);
    return `$${val.toLocaleString("en-US")}`;
  });
  result = result.replace(/\b(\d+(?:\.\d+)?)\s*[mM]\b/g, (_m: string, n: string) => {
    const val = Math.round(parseFloat(n) * 1_000_000);
    return `$${val.toLocaleString("en-US")}`;
  });
  return result;
}

function formatRvType(type: string): string {
  const map: Record<string, string> = {
    class_a: "Class A",
    class_b: "Class B",
    class_c: "Class C",
    travel_trailer: "Travel Trailer",
    fifth_wheel: "Fifth Wheel",
    toy_hauler: "Toy Hauler",
    truck_camper: "Truck Camper",
    not_sure: "Not Sure",
  };
  return map[type] ?? type;
}

function getMatchBadges(listing: RichListing, profile: Record<string, unknown>): string[] {
  const badges: string[] = [];

  const rvType = profile.rvType as string | undefined;
  if (rvType && rvType !== "not_sure" && listing.type === rvType) {
    badges.push(`${formatRvType(rvType)} ✓`);
  }

  if (listing.length != null) {
    const l = Number(listing.length);
    const minLen = profile.minLength as number | undefined;
    const maxLen = profile.maxLength as number | undefined;
    if (minLen || maxLen) {
      const minOk = !minLen || l >= minLen - 1;
      const maxOk = !maxLen || l <= maxLen + 1;
      if (minOk && maxOk) badges.push(`${l.toFixed(0)} ft ✓`);
    }
  }

  const maxBudget = profile.maxBudget as number | undefined;
  if (maxBudget && listing.price <= maxBudget) badges.push("Within budget ✓");

  const needed = ((profile.sleepingCapacity ?? profile.travelers) as number | undefined);
  if (needed && Number(listing.sleeps) >= Number(needed)) badges.push(`Sleeps ${listing.sleeps} ✓`);

  const useCase = profile.useCase as string | undefined;
  if (useCase && useCase !== "other") {
    const useCaseLabel: Record<string, string> = {
      weekends: "Weekend-ready ✓",
      full_time: "Full-time ✓",
      seasonal: "Seasonal ✓",
      tailgating: "Tailgating ✓",
    };
    const label = useCaseLabel[useCase];
    if (label) badges.push(label);
  }

  return badges.slice(0, 4);
}

// ── MatchBadge ────────────────────────────────────────────────────────────────

function MatchBadge({ score, colors }: { score: number; colors: ReturnType<typeof useColors> }) {
  const color = score >= 90 ? "#22c55e" : score >= 75 ? colors.primary : "#f59e0b";
  return (
    <View style={[styles.matchBadge, { backgroundColor: color + "18", borderColor: color }]}>
      <Text style={[styles.matchBadgeText, { color }]}>{score}% match</Text>
    </View>
  );
}

// ── MatchReportModal ──────────────────────────────────────────────────────────

interface MatchReportProps {
  visible: boolean;
  recommendations: RichListing[];
  buyerProfile?: Record<string, unknown>;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  insets: { top: number; bottom: number };
}

function MatchReportModal({ visible, recommendations, buyerProfile, onClose, colors, insets }: MatchReportProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.reportContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.reportHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={styles.sheetClose}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.reportTitle, { color: colors.foreground }]}>Your Match Report</Text>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.reportBody, { paddingBottom: insets.bottom + 40 }]}>
          <View style={[styles.reportHero, { backgroundColor: colors.primary + "12", borderRadius: colors.radius }]}>
            <View style={[styles.reportHeroIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="compass" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.reportHeroTitle, { color: colors.foreground }]}>
              {recommendations.length} RVs Matched
            </Text>
            <Text style={[styles.reportHeroSub, { color: colors.mutedForeground }]}>
              Based on your lifestyle preferences, budget, and camping style
            </Text>
          </View>

          <Text style={[styles.reportSectionLabel, { color: colors.mutedForeground }]}>TOP MATCHES</Text>

          {recommendations.map((listing, index) => {
            const badges = buyerProfile ? getMatchBadges(listing, buyerProfile) : [];
            return (
              <Pressable
                key={listing.id}
                onPress={() => { onClose(); router.push(`/listing/${listing.id}`); }}
                style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <View style={styles.reportCardRow}>
                  <View style={[styles.rankBadge, { backgroundColor: index === 0 ? colors.primary : colors.secondary }]}>
                    <Text style={[styles.rankText, { color: index === 0 ? "#fff" : colors.mutedForeground }]}>#{index + 1}</Text>
                  </View>

                  {listing.images?.[0] ? (
                    <Image source={{ uri: listing.images[0] }} style={styles.reportCardImage} />
                  ) : (
                    <View style={[styles.reportCardImagePlaceholder, { backgroundColor: colors.muted }]}>
                      <Ionicons name="car-outline" size={20} color={colors.mutedForeground} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reportCardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {listing.year} {listing.make} {listing.model}
                    </Text>
                    <Text style={[styles.reportCardPrice, { color: colors.foreground }]}>
                      {formatPrice(listing.price)}
                    </Text>
                    <View style={styles.reportCardMeta}>
                      {listing.dealScore && <DealBadge score={listing.dealScore} size="sm" />}
                      {listing.matchScore != null && (
                        <MatchBadge score={listing.matchScore} colors={colors} />
                      )}
                    </View>
                    {badges.length > 0 && (
                      <View style={styles.criteriaTagsRow}>
                        {badges.map(b => (
                          <View key={b} style={[styles.criteriaTag, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                            <Text style={[styles.criteriaTagText, { color: colors.primary }]}>{b}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </View>

                {listing.whyMatch && (
                  <View style={[styles.whyMatchRow, { borderTopColor: colors.border }]}>
                    <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
                    <Text style={[styles.whyMatchText, { color: colors.mutedForeground }]}>{listing.whyMatch}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          <View style={[styles.reportNote, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.reportNoteText, { color: colors.mutedForeground }]}>
              Match scores are calculated by your AI Outfitter — weighing budget fit, lifestyle match, and deal quality.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function OutfitterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<ChatState>(INITIAL_CHAT);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // Widget state
  const [rvTypeSubmitted, setRvTypeSubmitted] = useState(false);
  const [lengthSubmitted, setLengthSubmitted] = useState(false);
  const [lengthFreeText, setLengthFreeText] = useState("");

  const flatListRef = useRef<FlatList>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Send message (accepts preformed text for pill selections) ──────────────
  const sendMessage = useCallback(async (preformedText?: string) => {
    const raw = preformedText ?? input.trim();
    if (!raw || isSending) return;

    const text = expandShorthands(raw);
    if (!preformedText) setInput("");
    setIsSending(true);

    const userMsg: Message = { id: genId(), role: "user", content: text };

    setChat((prev) => ({
      ...prev,
      noMatch: false,
      expansionSuggestions: [],
      messages: [userMsg, ...prev.messages],
    }));

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : "";
      const currentChat = chat;

      const response = await fetch(`${baseUrl}/api/outfitter/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...currentChat.messages.slice().reverse().map((m) => ({
              role: m.role,
              content: m.content,
            })),
            { role: "user", content: text },
          ],
          sessionId: currentChat.sessionId,
          buyerProfile: currentChat.buyerProfile,
        }),
      });

      const data: OutfitterChatResponse = await response.json();
      const assistantMsg: Message = { id: genId(), role: "assistant", content: data.message };

      setChat((prev) => ({
        ...prev,
        messages: [assistantMsg, ...prev.messages],
        sessionId: data.sessionId ?? prev.sessionId,
        buyerProfile: data.updatedProfile ?? prev.buyerProfile,
        recommendations: (data.recommendations as RichListing[]) ?? prev.recommendations,
        stage: data.stage,
        noMatch: Boolean(data.noMatch),
        noMatchFilters: data.noMatchFilters ?? {},
        expansionSuggestions: data.expansionSuggestions ?? [],
      }));
    } catch {
      const errMsg: Message = {
        id: genId(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      };
      setChat((prev) => ({ ...prev, messages: [errMsg, ...prev.messages] }));
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, chat]);

  // ── No-match expansion action handler ─────────────────────────────────────
  function handleExpansionAction(suggestion: ExpansionSuggestion) {
    if (suggestion.action === "start_over") {
      setChat(INITIAL_CHAT);
      setRvTypeSubmitted(false);
      setLengthSubmitted(false);
      setLengthFreeText("");
      setInput("");
      return;
    }
    if (suggestion.action === "change_type") {
      setRvTypeSubmitted(false);
    }
    if (suggestion.message) {
      sendMessage(suggestion.message);
    }
  }

  // ── Fallback no-match handlers (when server suggestions not yet loaded) ────
  function handleExpandRange() {
    sendMessage("Please expand the length range by 10 ft on each side and show me the closest available matches.");
  }
  function handleShowClosest() {
    sendMessage("Show me the closest available options even if they don't exactly match my criteria — I'm open to seeing what's near my request.");
  }
  function handleChangeType() {
    setRvTypeSubmitted(false);
    sendMessage("Let me reconsider my RV type. What are my other options given my needs?");
  }

  // ── Widget visibility ──────────────────────────────────────────────────────
  const profile = chat.buyerProfile;
  const showRvTypeWidget =
    !rvTypeSubmitted &&
    !isSending &&
    !profile?.rvType &&
    chat.stage === "want";

  const showLengthWidget =
    !lengthSubmitted &&
    !isSending &&
    !profile?.minLength &&
    !profile?.maxLength &&
    !profile?.lengthFlexibility &&
    chat.stage === "size";

  // ── No-match description ───────────────────────────────────────────────────
  const noMatchDescription = (() => {
    const f = chat.noMatchFilters;
    const parts: string[] = [];
    if (f.rvType) parts.push(formatRvType(f.rvType));
    if (f.minLength || f.maxLength) {
      if (f.minLength && f.maxLength) parts.push(`${f.minLength}–${f.maxLength} ft`);
      else if (f.minLength) parts.push(`${f.minLength}+ ft`);
      else if (f.maxLength) parts.push(`under ${f.maxLength} ft`);
    }
    return parts.length > 0 ? parts.join(", ") : "your criteria";
  })();

  // ── Recommendations heading ────────────────────────────────────────────────
  const matchHeading = (() => {
    const parts: string[] = [];
    if (profile?.rvType && profile.rvType !== "not_sure") {
      parts.push(formatRvType(profile.rvType as string));
    }
    if (profile?.minLength || profile?.maxLength) {
      const min = profile.minLength as number | undefined;
      const max = profile.maxLength as number | undefined;
      if (min && max) parts.push(`${min}–${max} ft`);
      else if (min) parts.push(`${min}+ ft`);
      else if (max) parts.push(`under ${max} ft`);
    }
    return parts.length > 0 ? `Showing ${parts.join(" · ")}` : "Recommended for You";
  })();

  // ── Render message bubble ──────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Ionicons name="compass" size={14} color="#fff" />
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser
            ? { backgroundColor: colors.primary, borderRadius: colors.radius }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius },
          { maxWidth: "78%" },
        ]}>
          <Text style={[styles.bubbleText, { color: isUser ? colors.primaryForeground : colors.foreground }]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const hasRecs = chat.recommendations.length > 0;

  // ── List header: widgets + typing indicator ────────────────────────────────
  const listHeader = (
    <View>
      {/* Typing indicator */}
      {isSending && (
        <View style={[styles.msgRow, styles.msgRowAssistant]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Ionicons name="compass" size={14} color="#fff" />
          </View>
          <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        </View>
      )}

      {/* No-match card */}
      {chat.noMatch && (
        <View style={styles.noMatchCard}>
          <View style={styles.noMatchHeader}>
            <Ionicons name="alert-circle-outline" size={18} color="#924c00" />
            <Text style={styles.noMatchTitle}>No exact matches found</Text>
          </View>
          <Text style={styles.noMatchDesc}>
            We couldn't find a <Text style={styles.noMatchBold}>{noMatchDescription}</Text> in our current Washington inventory. Let's try adjusting your criteria.
          </Text>
          <View style={styles.noMatchButtons}>
            {chat.expansionSuggestions.length > 0 ? (
              chat.expansionSuggestions.map((s) => (
                <Pressable
                  key={s.action}
                  onPress={() => handleExpansionAction(s)}
                  style={[
                    styles.noMatchBtn,
                    s.action === "start_over" ? styles.noMatchBtnFilled : styles.noMatchBtnOutline,
                  ]}
                >
                  {s.action === "expand_range" && <Ionicons name="refresh-outline" size={13} color="#924c00" />}
                  {s.action === "show_closest" && <Ionicons name="search-outline" size={13} color="#924c00" />}
                  {s.action === "change_type" && <Ionicons name="sparkles-outline" size={13} color="#924c00" />}
                  <Text style={s.action === "start_over" ? styles.noMatchBtnFilledText : styles.noMatchBtnOutlineText}>
                    {s.label}
                  </Text>
                </Pressable>
              ))
            ) : (
              <>
                <Pressable onPress={handleExpandRange} style={[styles.noMatchBtn, styles.noMatchBtnOutline]}>
                  <Ionicons name="refresh-outline" size={13} color="#924c00" />
                  <Text style={styles.noMatchBtnOutlineText}>Expand range</Text>
                </Pressable>
                <Pressable onPress={handleShowClosest} style={[styles.noMatchBtn, styles.noMatchBtnOutline]}>
                  <Ionicons name="search-outline" size={13} color="#924c00" />
                  <Text style={styles.noMatchBtnOutlineText}>Show closest</Text>
                </Pressable>
                <Pressable onPress={handleChangeType} style={[styles.noMatchBtn, styles.noMatchBtnOutline]}>
                  <Ionicons name="sparkles-outline" size={13} color="#924c00" />
                  <Text style={styles.noMatchBtnOutlineText}>Change RV type</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setChat(INITIAL_CHAT); setRvTypeSubmitted(false); setLengthSubmitted(false); }}
                  style={[styles.noMatchBtn, styles.noMatchBtnFilled]}
                >
                  <Text style={styles.noMatchBtnFilledText}>Start over</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      {/* RV type quick-select widget */}
      {showRvTypeWidget && (
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.widgetTitle, { color: colors.foreground }]}>What type of RV are you looking for?</Text>
          <View style={styles.pillGrid}>
            {RV_TYPES.map((type) => (
              <Pressable
                key={type.value}
                onPress={() => { setRvTypeSubmitted(true); sendMessage(type.msg); }}
                style={[styles.pill, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "50" }]}
              >
                <Text style={[styles.pillText, { color: colors.primary }]}>{type.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Length range quick-select widget */}
      {showLengthWidget && (
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.widgetTitle, { color: colors.foreground }]}>How long of an RV are you looking for?</Text>
          <View style={styles.pillGrid}>
            {LENGTH_RANGES.map((range) => (
              <Pressable
                key={range.label}
                onPress={() => { setLengthSubmitted(true); sendMessage(range.msg); }}
                style={[styles.pill, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "50" }]}
              >
                <Text style={[styles.pillText, { color: colors.primary }]}>{range.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.freeTextRow, { borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.freeTextInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Or type your own (e.g. 38 ft, 35-40 ft)..."
              placeholderTextColor={colors.mutedForeground}
              value={lengthFreeText}
              onChangeText={setLengthFreeText}
              onSubmitEditing={() => {
                if (lengthFreeText.trim()) { setLengthSubmitted(true); sendMessage(lengthFreeText.trim()); setLengthFreeText(""); }
              }}
              returnKeyType="send"
            />
            <Pressable
              onPress={() => {
                if (lengthFreeText.trim()) { setLengthSubmitted(true); sendMessage(lengthFreeText.trim()); setLengthFreeText(""); }
              }}
              style={[styles.freeTextBtn, { backgroundColor: lengthFreeText.trim() ? colors.primary : colors.muted }]}
            >
              <Ionicons name="arrow-forward" size={16} color={lengthFreeText.trim() ? "#fff" : colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  // ── Recommendations footer ─────────────────────────────────────────────────
  const listFooter = hasRecs ? (
    <View style={styles.recsSection}>
      <View style={styles.recsTitleRow}>
        <Text style={[styles.recsTitle, { color: colors.foreground }]} numberOfLines={1}>{matchHeading}</Text>
        <Pressable onPress={() => setShowReport(true)} style={styles.seeAllBtn}>
          <Text style={[styles.seeAllText, { color: colors.primary }]}>Full Report</Text>
          <Ionicons name="arrow-forward" size={13} color={colors.primary} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recsScroll} contentContainerStyle={{ paddingRight: 16 }}>
        {chat.recommendations.slice(0, 5).map((listing) => {
          const badges = profile ? getMatchBadges(listing, profile) : [];
          return (
            <Pressable
              key={listing.id}
              onPress={() => router.push(`/listing/${listing.id}`)}
              style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
            >
              {listing.images?.[0] ? (
                <Image source={{ uri: listing.images[0] }} style={styles.recImage} />
              ) : (
                <View style={[styles.recImagePlaceholder, { backgroundColor: colors.muted }]}>
                  <Ionicons name="car-outline" size={24} color={colors.mutedForeground} />
                </View>
              )}
              <View style={styles.recBody}>
                {listing.matchScore != null && (
                  <MatchBadge score={listing.matchScore} colors={colors} />
                )}
                <Text style={[styles.recTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {listing.year} {listing.make} {listing.model}
                </Text>
                {badges.length > 0 && (
                  <View style={styles.recCriteriaTags}>
                    {badges.slice(0, 2).map(b => (
                      <View key={b} style={[styles.criteriaTag, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                        <Text style={[styles.criteriaTagText, { color: colors.primary }]}>{b}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.recFooterRow}>
                  <Text style={[styles.recPrice, { color: colors.foreground }]}>{formatPrice(listing.price)}</Text>
                  {listing.dealScore && <DealBadge score={listing.dealScore} size="sm" />}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>AI Outfitter</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Powered by Claude AI</Text>
          </View>
          {hasRecs && (
            <Pressable
              onPress={() => setShowReport(true)}
              style={[styles.reportBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary, borderRadius: colors.radius }]}
            >
              <Ionicons name="document-text-outline" size={14} color={colors.primary} />
              <Text style={[styles.reportBtnText, { color: colors.primary }]}>Match Report</Text>
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={chat.messages}
          keyExtractor={(item) => item.id}
          inverted
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
        />

        <View style={[styles.inputContainer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: bottomInset + 8 }]}>
          <View style={[styles.inputRow, { backgroundColor: colors.muted, borderRadius: colors.radius + 4 }]}>
            <TextInput
              style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="Ask me anything about RVs..."
              placeholderTextColor={colors.mutedForeground}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              onSubmitEditing={() => sendMessage()}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={() => sendMessage()}
              disabled={!input.trim() || isSending}
              style={[styles.sendBtn, { backgroundColor: input.trim() && !isSending ? colors.primary : colors.muted, borderRadius: colors.radius }]}
            >
              <Ionicons name="arrow-up" size={18} color={input.trim() && !isSending ? "#fff" : colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <MatchReportModal
        visible={showReport}
        recommendations={chat.recommendations}
        buyerProfile={chat.buyerProfile}
        onClose={() => setShowReport(false)}
        colors={colors}
        insets={{ top: insets.top, bottom: insets.bottom }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
  reportBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  messagesContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  msgRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAssistant: { justifyContent: "flex-start", alignItems: "flex-end" },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },

  // Widget card
  widgetCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12, marginHorizontal: 0 },
  widgetTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 10, lineHeight: 19 },
  pillGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  freeTextRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  freeTextInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: "Inter_400Regular" },
  freeTextBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  // No-match card
  noMatchCard: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#ffe08b", borderRadius: 16, padding: 14, marginBottom: 12 },
  noMatchHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  noMatchTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#924c00" },
  noMatchDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6b4400", lineHeight: 18, marginBottom: 12 },
  noMatchBold: { fontFamily: "Inter_600SemiBold" },
  noMatchButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  noMatchBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  noMatchBtnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ffe08b" },
  noMatchBtnFilled: { backgroundColor: "#924c00" },
  noMatchBtnOutlineText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#924c00" },
  noMatchBtnFilledText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },

  // Recommendations
  recsSection: { paddingVertical: 16 },
  recsTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 },
  recsTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1, marginRight: 8 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  recsScroll: { paddingLeft: 16 },
  recCard: { width: 180, borderWidth: 1, overflow: "hidden", marginRight: 12 },
  recImage: { width: "100%", height: 110 },
  recImagePlaceholder: { width: "100%", height: 110, alignItems: "center", justifyContent: "center" },
  recBody: { padding: 10, gap: 5 },
  recTitle: { fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 16 },
  recFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  recPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
  recCriteriaTags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },

  // Match badges
  matchBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
  matchBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  // Criteria tags
  criteriaTag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  criteriaTagText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  criteriaTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },

  // Input
  inputContainer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  input: { flex: 1, fontSize: 15, maxHeight: 100, minHeight: 24 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", flexShrink: 0 },

  // Modal
  reportContainer: { flex: 1 },
  reportHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  sheetClose: { padding: 4 },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  reportBody: { padding: 20, gap: 16 },
  reportHero: { padding: 20, alignItems: "center", gap: 10 },
  reportHeroIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  reportHeroTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  reportHeroSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  reportSectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 4 },
  reportCard: { borderWidth: 1, overflow: "hidden" },
  reportCardRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rankText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  reportCardImage: { width: 72, height: 54, borderRadius: 6, flexShrink: 0 },
  reportCardImagePlaceholder: { width: 72, height: 54, borderRadius: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  reportCardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 17, flex: 1 },
  reportCardPrice: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 2 },
  reportCardMeta: { flexDirection: "row", gap: 5, marginTop: 4, flexWrap: "wrap" },
  whyMatchRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, paddingTop: 10, borderTopWidth: 1 },
  whyMatchText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  reportNote: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 14, borderWidth: 1 },
  reportNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
});

````

---

## 10. API contract (OpenAPI excerpt)
From **`lib/api-spec/openapi.yaml`** — the request/response shapes the Outfitter speaks.

### 10.1 Paths
````yaml
  /outfitter/chat:
    post:
      operationId: outfitterChat
      tags: [outfitter]
      summary: Send a message to the RV Outfitter AI
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/OutfitterChatRequest"
      responses:
        "200":
          description: AI response with optional recommendations
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/OutfitterChatResponse"

  /outfitter/recommendations:
    post:
      operationId: getOutfitterRecommendations
      tags: [outfitter]
      summary: Get RV recommendations based on buyer profile
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/BuyerProfile"
      responses:
        "200":
          description: Recommended listings
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/RecommendationsResponse"

````

### 10.2 Schemas (ChatMessage, OutfitterChatRequest/Response, BuyerProfile, NoMatchFilters, ExpansionSuggestion, RecommendationsResponse)
````yaml
        - listings
        - total
        - offset
        - limit

    ChatMessage:
      type: object
      properties:
        role:
          type: string
          enum:
            - user
            - assistant
        content:
          type: string
      required:
        - role
        - content

    OutfitterChatRequest:
      type: object
      properties:
        messages:
          type: array
          items:
            $ref: "#/components/schemas/ChatMessage"
        sessionId:
          type: string
        buyerProfile:
          $ref: "#/components/schemas/BuyerProfile"
      required:
        - messages

    NoMatchFilters:
      type: object
      properties:
        rvType:
          type: string
        minLength:
          type: number
        maxLength:
          type: number

    ExpansionSuggestion:
      type: object
      properties:
        action:
          type: string
          enum:
            - expand_range
            - show_closest
            - change_type
            - start_over
        label:
          type: string
        message:
          type: string
          nullable: true
      required:
        - action
        - label
        - message

    OutfitterChatResponse:
      type: object
      properties:
        message:
          type: string
        sessionId:
          type: string
        updatedProfile:
          $ref: "#/components/schemas/BuyerProfile"
        recommendations:
          type: array
          items:
            $ref: "#/components/schemas/Listing"
        stage:
          type: string
          enum:
            - greeting
            - want
            - use
            - activities
            - who
            - trade
            - tow_vehicle
            - size
            - budget
            - matching
            - complete
        noMatch:
          type: boolean
        noMatchFilters:
          $ref: "#/components/schemas/NoMatchFilters"
        expansionSuggestions:
          type: array
          items:
            $ref: "#/components/schemas/ExpansionSuggestion"
      required:
        - message
        - sessionId
        - stage

    BuyerProfile:
      type: object
      properties:
        rvType:
          type: string
        useCase:
          type: string
        activities:
          type: array
          items:
            type: string
        travelers:
          type: number
        hasKids:
          type: boolean
        hasPets:
          type: boolean
        hasTrade:
          type: boolean
        towVehicle:
          type: string
        towVehicleYear:
          type: number
        paymentType:
          type: string
          enum:
            - payments
            - cash
        minBudget:
          type: number
        maxBudget:
          type: number
        monthlyPayment:
          type: number
        downPayment:
          type: number
        minLength:
          type: number
        maxLength:
          type: number
        rawLengthInput:
          type: string
        lengthFlexibility:
          type: boolean
        intendedUse:
          type: string
        towingNeeds:
          type: string
        sleepingCapacity:
          type: number
        mustHaves:
          type: array
          items:
            type: string
        timeline:
          type: string
        experience:
          type: string
          enum:
            - first_time
            - some_experience
            - experienced
        campingStyle:
          type: string

    RecommendationsResponse:
      type: object
      properties:
        listings:
          type: array
          items:
            $ref: "#/components/schemas/Listing"
        explanation:
          type: string
      required:
        - listings
        - explanation

````

---

## 11. Known contract mismatch (stage vocabulary)

The OpenAPI `stage` enum (Part 10.2) is **stale** relative to what the system actually
uses at runtime. The conversation prompt (Part 2.1, "STAGE TRACKING") instructs the model
to emit one of:

`knowledge | prime_use | who | where_when | location | drive_or_tow | size | budget | fork | deep_dive | matching | complete`

whereas the OpenAPI schema still lists the older set
(`greeting, want, use, activities, who, trade, tow_vehicle, size, budget, matching, complete`).
At runtime the server only branches on `matching` / `complete` / `deep_dive` (and treats
everything else as conversational), and the front-ends key a couple of quick-pick widgets
off `want` / `size`, so the drift is currently harmless — but the schema should be
reconciled with the prompt's stage list if the enum is ever relied on.

---

*End of bundle. This file is a snapshot of the AI RV Outfitter as it exists in the codebase on the generation date above.*

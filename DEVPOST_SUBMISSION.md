# DEVPOST_SUBMISSION — copy for the submission form

**Title:** MatchRV — Agent-Native RV Shopping

**Tagline:** Real dealer inventory as WebMCP capabilities: one shared session
where your agent searches, explains, and stays honest — and you approve what
matters.

**Live demo:** https://matchrv-webmcp.onrender.com/shop
**Repo (MIT):** https://github.com/MatchRV/AI-RV-Marketplace-Infrastructure-
**Video:** _YouTube link_
**Gallery images:** `docs/screenshots/devpost/` — upload in numbered order;
`1-cover-search-results.png` is the cover (results + rail + funnel), then the
Why-this-match panel (receipts, unknowns, freshness) and the NOT SENT approval
card. Captured live through Chrome's native WebMCP runtime by
`pnpm --filter @workspace/scripts run devpost-shots`.

---

## Inspiration

I spent eight years selling RVs. The inventory data problem never left me:
thirty dealerships in one metro publish the same physical trailers thirty
different ways — "dry weight," "UVW," "shipping weight," or nothing at all.
Shoppers now bring AI to a five-figure purchase, and the AI hits the same
wall a human does, just faster: inconsistent pages, missing specs, stale
listings, no reliable way to act.

When the WebMCP Challenge landed, the fit was obvious. The RV market isn't a
toy demo domain — it's the *perfect* stress test for the agentic web:
fragmented sellers, complicated tradeoffs (towing physics! tank capacities!
floorplans!), local availability, and a consequential action at the end that
absolutely must stay in human hands.

## What it does

MatchRV exposes 1,056 real, normalized RV listings from 28 Pacific-Northwest
dealerships as **ten WebMCP site tools**. A shopper says one messy sentence —
*"bunkhouse trailer my F-150 can tow, under $45k, near Tacoma, we boondock"* —
and their agent compiles it into typed constraints and calls
`search_inventory`. The page and the agent share one session: constraint
chips, a match funnel ("1,056 searched → 43 verified, 129 unverified — 149
excluded over budget"), an actor-labeled activity ledger, a shortlist, and
side-by-side comparison. The human edits a chip by hand; the agent's next
call already knows.

Three things make it feel like the future instead of a wrapper:

1. **Explainable matching.** Every result carries deterministic receipts —
   which hard constraints passed on verified data, which preferences are
   satisfied, the exact score arithmetic, and what's *unknown*.
2. **Honest unknowns with provenance.** On real dealer sites, GVWR is
   machine-readable <1% of the time. MatchRV never fills gaps with guesses:
   every fact is tagged (dealer listing / parsed from dealer text / decoded
   from the floorplan code / computed), and `null` means the dealer doesn't
   publish it. The agent turns that into action: "solar is unknown — want me
   to ask the dealership?"
3. **Human-gated consequences.** `prepare_dealer_contact` only stages a
   preview — the page shows exactly what would be sent. `submit_dealer_contact`
   is refused by the *server* until the human clicks Approve. Duplicates are
   blocked. The agent never holds approval authority.

## How we built it

- **`lib/agent-core`** — a pure-TypeScript semantic layer: canonical unit
  schema with per-fact provenance; deterministic normalization/enrichment
  over real scraped dealer data (labeled-spec parsing, floorplan-code
  decoding like `26BHX → bunkhouse`, a receipts-based boondocking score); a
  three-valued matching engine (pass / fail / **unverified** — unknowns
  never silently exclude or include); tow-fit logic that treats a bare
  "F-150" as the 5,000–13,500 lbs range it really is and hands the agent
  the questions that narrow it (which engine, which tow package, the
  door-sticker rating); offline geography.
- **Tool contracts defined once in Zod**, compiled to JSON Schema for
  `document.modelContext.registerTool()` and re-enforced server-side on every
  call — the schema agents see is literally the validator that runs.
- **Express `/api/agent/*`** — deterministic engine endpoints, structured
  self-correction errors (invalid args list the exact issues; an unknown city
  returns the supported places), a lead state machine, and in-process
  latency/zero-result metrics.
- **React `/shop`** — the shared-session UI: tool handlers mirror every agent
  action into visible state and return compact (~1.5–2 KB) structured
  summaries per WebMCP output guidance.
- **Zero-infrastructure runnable:** `pnpm install && pnpm dev` is the whole
  setup — no env vars, no services. Locally an embedded PGlite Postgres seeds
  itself from the committed snapshot; the live deployment runs on a 512 MB
  instance with **no database at all**, because the agent layer never needed
  one — it serves the same committed, provenance-tagged snapshot in-process.

## How WebMCP is used (and why it had to be WebMCP)

Imperative registration in the top-level page (ChatGPT-compatible; no
iframes, no declarative forms), feature-detected on `document.modelContext`
with the `navigator` fallback. Ten single-responsibility tools with
action-verb names, `readOnlyHint` on all reads, `untrustedContentHint` where
dealer-authored text flows through, raw-input-friendly schemas (pass "F-150
rated 8,000 lbs" as-is), and UI state updated after every call because agents
plan from the interface. The shared session is the part scraping can never
give you: the human and the agent are first-class users of the *same page*.

## Challenges we ran into

- **The data keeps changing under you.** Dealer photo URLs rot — roughly
  half stopped resolving between the snapshot and submission — so every
  image walks a fallback list and degrades to a labeled tile, never a broken
  picture. Same rule as the specs: show what's true, label what isn't.
- **The data is the boss fight.** Real dealer listings gave us junk feature
  strings ("View More »", price CTAs), addresses like "Map & Hours", absurd
  price histories (1e79), and specs published as prose. The answer became the
  product: parse only labeled evidence, tag provenance, keep unknown unknown.
- **Tow honesty.** A bare "F-150" tows anywhere from 5,000 to 13,500 lbs
  depending on configuration. One fake number would be wrong in both
  directions — so verdicts include `depends_on_config`, and every tool result
  carries `askShopper` follow-ups (which engine, which tow package, the
  door-sticker rating) so the agent asks instead of guessing. "5.0L V8" alone
  narrows the band to 8,700–13,000 lbs; "Max Tow" lifts it to 11,000–13,000;
  a stated rating replaces it and gets a safety margin plus a payload caveat.
- **Write-action trust.** We refused to let approval live in the model's
  context. It lives in a server-side state machine keyed to a human click.

## Accomplishments we're proud of

- **Verified in a real browser's own WebMCP runtime**: Chrome for Testing 152
  with the WebMCP feature discovers all ten tools through
  `document.modelContext.getTools()` and executes the entire workflow through
  `executeTool()` — search → human chip edit → agent refine → explain →
  compare → staged contact → forged-token refusal → human approval → receipt.
  The judge's own demo conversation, run word for word: **12/12**, against the
  **live deployment**.
- **Driven by a real agent from natural language** against the live URL
  (Sep 3): its own search phrasing, explain, compare, configuration
  follow-ups for a bare F-150, and a dealer contact it staged but declined
  to approve on its own — every number it reported re-checked against the
  snapshot. It also found our next fix: a 70 with zero confirmed preferences
  reads stronger than it is (WEBMCP_TEST_RESULTS §8).
- **61 unit tests** on the engine's honesty properties ("absence of evidence is
  never evidence of absence" is literally a test), the tool contracts, and the
  approval boundary — forged, missing, replayed and expired tokens, payload
  immutability, duplicate refusal — plus a **23-step browser E2E**, all green
  against the production build.
- **~15 ms** deterministic search over 1,056 units — no LLM inside MatchRV at
  all. The shopper's agent does the reasoning; the site does the arithmetic.
- A demo a judge can run three ways: ChatGPT's browser, flagged Chrome, or
  the labeled guided demo anywhere.

## What we learned

Agents don't need smarter scraping — they need websites that tell the truth
in a callable way. The most valuable thing a site can expose isn't a prettier
page; it's *verified capability with honest gaps*. And the human-agent
experience gets good exactly when both parties can see and touch the same
state.

## What's next

Live dealer feeds into the same canonical schema (that's MatchRV's actual
business), manufacturer floorplan specs as a sourced enrichment layer,
authenticated shopper sessions, appointment booking as a second human-gated
write tool — and the same pattern beyond RVs: vertical commerce as an
agent-readable capability layer for automotive, marine, and equipment.

---

### Form fields the rules ask for

- **How the use case fits WebMCP:** high-consideration, fragmented,
  local-inventory commerce needs typed capabilities + shared page state +
  permissioned writes — exactly WebMCP's shape; a chatbot API or scraper
  can't deliver the human-in-the-same-session model.
- **UX improvements:** one sentence replaces 30 sites of repeated filtering;
  explainable results with provenance; refinement without restarting; visible
  agent activity; approval-gated dealer contact.
- **Human-agent collaboration:** bidirectional shared session (chips ↔
  tools ↔ ledger ↔ shortlist), agent-readable human edits, human-approved
  agent actions.
- **Implementation:** 10 imperative WebMCP tools; Zod→JSON-Schema single
  source of truth; deterministic TS engine; embedded-Postgres zero-infra
  runtime; single-use page-held approval tokens for the consequential
  action. Verified natively: a real Chrome's own `document.modelContext`
  (152, WebMCP feature) discovers all ten tools and executes the full
  workflow — 6/6 automated steps, and the 12-step judge conversation 12/12
  against the live site — alongside 61 unit tests and a 23-step browser E2E,
  all green against the production build.
  **Live:** https://matchrv-webmcp.onrender.com/shop ·
  **Repo:** https://github.com/MatchRV/AI-RV-Marketplace-Infrastructure- (MIT)

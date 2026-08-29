# DEVPOST_SUBMISSION — copy for the submission form

**Title:** MatchRV — Agent-Native RV Shopping

**Tagline:** Real dealer inventory as WebMCP capabilities: one shared session
where your agent searches, explains, and stays honest — and you approve what
matters.

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
  "F-150" as the 5,000–13,500 lbs range it really is; offline geography.
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
- **Zero-infrastructure runnable:** with no `DATABASE_URL`, an embedded
  PGlite Postgres bootstraps and seeds itself from the committed snapshot —
  `pnpm install && pnpm dev` is the whole setup, and one Node process serves
  the production build.

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

- **The data is the boss fight.** Real dealer listings gave us junk feature
  strings ("View More »", price CTAs), addresses like "Map & Hours", absurd
  price histories (1e79), and specs published as prose. The answer became the
  product: parse only labeled evidence, tag provenance, keep unknown unknown.
- **Tow honesty.** A bare "F-150" tows anywhere from 5,000 to 13,500 lbs
  depending on configuration. One fake number would be wrong in both
  directions — so verdicts include `depends_on_config`, and a stated rating
  gets a safety margin plus a payload caveat.
- **Write-action trust.** We refused to let approval live in the model's
  context. It lives in a server-side state machine keyed to a human click.

## Accomplishments we're proud of

- 16/16 end-to-end steps green through the *real* tool executor, including
  the blocked-then-approved submit and duplicate refusal.
- 39 unit tests on the engine's honesty properties ("absence of evidence is
  never evidence of absence" is literally a test).
- Sub-30 ms deterministic search over 1,056 units — no LLM inside MatchRV at
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
  workflow — 6/6 automated steps — alongside 53 unit tests and a 23-step
  browser E2E, all green against the production build. Repo: (public GitHub
  link), MIT.

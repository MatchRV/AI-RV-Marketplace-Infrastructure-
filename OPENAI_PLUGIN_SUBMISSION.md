# MatchRV — OpenAI / Meta App Submission Package (v2.2.7)

Status: **Submission candidate v2.2.7 — eleven MCP tools.** This document must match what the production MCP server advertises (`serverInfo.version` = `2.2.7`). If a scan shows anything different, fix the server and rescan; do not paper over it here. Not yet submitted.

Submission type: With MCP (remote MCP-only)
Publisher: MatchRV Inc. (use verified business identity in OpenAI Platform)
Initial availability: United States

## Public listing

**Plugin name:** MatchRV

**Short description:**
RV shopping from MatchRV: search and compare real dealer inventory, check tow fit, and send a dealer inquiry only after you approve a preview.

**Long description:**
MatchRV helps shoppers turn real-world RV requirements into structured inventory searches. A built-in RV Outfitter guide clarifies how the shopper will use an RV, confirms firm limits versus approved flexibility, and converts payment-based budgets into totals before searching. Shoppers can search MatchRV's nationwide dealer inventory snapshot by RV type, price, length, sleeping capacity, location, condition and other specifications; inspect individual RV records; compare units; and screen tow fit from their vehicle data. MatchRV keeps unknown or unverified specifications unknown instead of inventing values. All shopping tools are read-only. MatchRV remembers a confirmed fact (such as a truck's tow rating) only through an explicit "teach" tool, and only for that shopper. Dealer inquiries use two steps: MatchRV first shows the exact preview (dealership, RV, contact details, message) and sends nothing; it sends only after the shopper approves, then reports the real delivery status.

**Category:** Shopping
**Website:** https://matchrv.com
**Privacy policy:** https://matchrv.com/privacy
**Support URL:** https://matchrv.com/contact
**Terms URL:** https://matchrv.com/terms
**Logo:** Use current production MatchRV logo.

## Remote MCP

**URL type:** Universal

**Production MCP server URL:** `https://matchrv-mcp.onrender.com/mcp` (Render service `matchrv-mcp`, auto-deployed from `main`).
After the domain move, `https://matchrv.com/mcp` points at this same service and is the URL to submit; until then, scan the onrender URL. Both serve identical code.

**Authentication:** None (public shopping workflow). Memory and inquiries are scoped without accounts (see Data handling).

**Domain verification:** `/.well-known/openai-apps-challenge` returns the value of the `OPENAI_APPS_CHALLENGE` env var (404 until it is set). Set it to the portal token on the production service, verify the URL returns only the token, then verify in the portal.

## MCP tools and annotations (as advertised by v2.2.7; unchanged since v2.2.6)

| Tool | Purpose | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|---|---|:-:|:-:|:-:|:-:|
| `outfitter_discovery` | RV fit interview: returns the next question and, once enough fit facts are known, search constraints. Takes RV-fit facts and interview step names only (no rapport answers, names, contact info, income or credit) | true | false | true | false |
| `outfitter_guide` | Buyer-education knowledge (towing basics, types, costs, financing) | true | false | true | false |
| `outfitter_memory` | Read this shopper's own remembered facts + MatchRV-curated facts | true | false | true | false |
| `teach_outfitter` | **Write**: remember a fact the shopper confirmed, for this shopper only | false | false | false | false |
| `search_rvs` | Search MatchRV inventory (no memory writes) | true | false | true | false |
| `get_rv` | One RV record with provenance and explicit unknowns | true | false | true | false |
| `compare_rvs` | Side-by-side comparison of 2-4 RVs | true | false | true | false |
| `evaluate_tow_fit` | Tow / payload / motorhome-tow screening (no memory writes) | true | false | true | false |
| `prepare_dealer_inquiry` | Step 1: validate + preview a dealer inquiry and return a confirmation token. **Sends nothing; stores nothing** | true | false | false | false |
| `send_dealer_inquiry` | Step 2: send the approved preview (`confirmed=true` required) | false | **true** | false | **true** |
| `get_dealer_inquiry_status` | Status (and any recorded dealer reply) of the shopper's own inquiry | true | false | true | false |

`search_rvs`, `get_rv`, `compare_rvs` and `evaluate_tow_fit` also advertise the `ui://` shopper resource (`_meta.ui.resourceUri`).

Not in the MCP surface: VIN tow-vehicle lookup (website-only via `/api/agent/*`), and any dealer action other than the inquiry above. There is no appointment booking, and MatchRV never claims a dealer replied unless a reply is recorded.

### Read-only guarantee
Every tool marked `readOnlyHint: true` has no side effects. A rating or payload stated in a `search_rvs` / `evaluate_tow_fit` call is used for that answer only; the response suggests `teach_outfitter` if the shopper wants it remembered. This is enforced by `artifacts/api-server/test/mcp-memory-isolation.test.ts`, which fingerprints all memory before and after calling every read-only tool.

### Dealer inquiry flow
1. `prepare_dealer_inquiry(unit_id, name, email and/or phone, message)` validates the input and returns `preview` (dealership name/city/state/website, RV title, VIN, stock number, price, condition, the shopper's contact details, the message, the delivery channel) plus a `confirmation_token` (HMAC-signed, expires in 30 minutes). Nothing is stored or sent. The snapshot has no per-unit listing URL, so `stockUrl` is `null` and the preview names the dealership website instead.
2. `send_dealer_inquiry(confirmation_token, confirmed: true)` sends exactly the previewed content (the token locks it). It is single-use, rate-limited (10 per shopper/IP per hour, 5 per contact per hour), and duplicate-guarded (same contact + RV within 24h). It returns `inquiry_id`, a private `status_token` and an honest status:
   - `delivered`: emailed to a dealership that has opted in to direct MatchRV inquiries (`data/dealer-inquiry-routes.json`) and accepted by its mail server. This does not mean anyone has read it.
   - `queued_for_matchrv`: there is no direct route to that dealership, so the MatchRV team was alerted (ntfy push without PII, and/or the ops mailbox) to forward it. It has not reached the dealer yet.
   - `failed`: neither the dealer nor MatchRV ops could be reached. The shopper is told to contact the dealership directly.
   - `dry_run` (testing only, `dry_run: true` or `INQUIRY_DRY_RUN=1`): validated and recorded in memory; nothing is delivered to anyone.
3. `get_dealer_inquiry_status(inquiry_id, status_token)` returns the status and `dealerReply`, which is only non-null when MatchRV ops record a real reply.

HTTP equivalents (same service): `POST /api/inquiries` (preview, or send with `confirmation_token` + `confirmed: true`), `GET /api/inquiries/:id` with `X-Inquiry-Token`, and ops-only `GET|POST /api/inquiries/ops[/:id]` (Bearer `INQUIRY_OPS_KEY`).

## Data handling (must match privacy policy)

- **Inventory:** public / dealer-authorized RV listings from MatchRV's snapshot.
- **Memory:** shopper-taught facts are stored per shopper scope: ChatGPT's anonymous `_meta["openai/subject"]`, else `openai/session`, else the MCP session id, else an opaque `session_key` returned by `teach_outfitter`. A host identity always outranks a pasted key. Scopes are stored under a SHA-256 hash, never shown to other shoppers, and expire after 30 days of inactivity (`session-memory.json` next to `LEARNED_FACTS_PATH`). Shared memory is limited to MatchRV-curated facts (`CURATED_FACTS_PATH`, default `data/curated-facts.json`, currently empty) and is read-only at runtime. The pre-v2.1 shared learned-facts file is no longer read.
- **Dealer inquiries:** name, email and/or phone, message and RV reference, stored after the shopper approves (`dealer-inquiries.json` next to `LEARNED_FACTS_PATH`). They are emailed to opted-in dealers or to the MatchRV ops mailbox. ntfy alerts contain only the inquiry id, the shopper's first name, the RV and the dealership. Records are retained 90 days (`INQUIRY_RETENTION_DAYS`) and dry runs 24 hours. Status is viewable only with the per-inquiry token.
- No approval secrets, ops keys or other shoppers' data appear in tool results. The `confirmation_token` contains only the preview the shopper is looking at.

## Starter prompts

1. Find me a Class A motorhome between $250,000 and $350,000 that is at least 35 feet long and sleeps at least two people.
2. Compare the best RVs you found and explain why each one matches, what is unknown, and how fresh the inventory data is.
3. I have a specific tow vehicle. Check which travel trailers in my budget fit its towing constraints and show me anything that still needs verification.
4. Show me the details for this RV and separate verified listing facts from unknown specifications.
5. Ask the dealer whether this RV is still available, but show me exactly what will be sent and wait for my OK.
6. I'm not sure what RV fits my family. Help me figure it out by asking how we'll actually use it, and confirm my firm limits before searching.

## Positive reviewer test cases

1. **Structured search:** `search_rvs` with the shopper's stated facts returns a shortlist of the 3 best fits. Results include identity, known facts, match status, provenance and unknowns, and nothing is invented or counted. (Fixture: "a travel trailer for 4 of us near Tacoma, WA, no tow vehicle yet, no length limit, paying cash, $40,000 out the door" → `party_size: 4`, `tow_vehicle: "none yet"`, `no_length_limit: true`, `payment_method: "cash"`, `out_the_door_budget_usd: 40000`.)
1a. **Ask, don't assume:** "I want a travel trailer for my family near Tacoma" returns `status: needs_discovery`, no RVs, and asks how many are going, what will tow it, and any length or size limit; the next turn asks how they'll pay. The assistant asks and waits rather than guessing.
2. **Unit detail:** `get_rv` on a returned unit_id shows canonical details with provenance and unknowns.
3. **Compare:** `compare_rvs` on two returned ids shows side by side, with gaps marked unknown.
4. **Tow fit:** `evaluate_tow_fit` with the reviewer's vehicle and towable unit ids gives per-unit screening plus what still needs verification, and never says "safe". No memory is written.
5. **Dealer inquiry:** `prepare_dealer_inquiry` first, showing the full preview, with nothing sent. Only after explicit approval, `send_dealer_inquiry` with `confirmed=true` (reviewers should use `dry_run: true` so no dealership is contacted). Status is visible through `get_dealer_inquiry_status`.
6. **Outfitter firm limit:** `outfitter_discovery` confirms a 30-ft limit as firm or comfort and convert $450/mo + $5,000 down to $55,130 total. Nothing over the limits is presented as a match.
7. **Memory, explicit only:** after the shopper confirms "my truck is rated 9,100 lbs, remember it", `teach_outfitter` stores it. `outfitter_memory` recalls it for that shopper only.

## Negative reviewer test cases

1. **No silent dealer contact:** asking to draft a message without approving yields at most a `prepare_dealer_inquiry` preview, never `send_dealer_inquiry`. `send_dealer_inquiry` with `confirmed=false` or an altered token sends nothing.
2. **No towing guarantee** from a generic model or a single max rating.
3. **No fabricated inventory/specs:** hard requirements with no verified match return none, and unknowns stay unknown.
4. **No relaxed limits** without explicit approval.
5. **No cross-shopper leakage:** a fact taught by one shopper is not visible to another (different `openai/subject`), and inquiry status requires that inquiry's token.
6. **No fabricated dealer reply:** status shows `dealerReply: null` unless MatchRV recorded one.

## Release notes (v2.2.7)

- **No tool, input schema, title, description or annotation changes.** Still the same 11 tools. A test (`artifacts/api-server/test/mcp-refine-walkthrough.test.ts`) compares `tools/list` against the v2.2.6 surface saved in `test/fixtures/mcp-tools-v2.2.6.json`. Only new optional output fields were added.
- **Refining results.** `search_rvs` responses now include `refine` (`suggested`, `reason`, `ask`, `options`, `rule`). When results are thin (no local matches, no results, no fully verified match, or fewer than requested) `suggested` is true. The server instructions, `outfitterGuidance`, `nextStep` and the `road_to_sale` guide tell the assistant to ask what the shopper would change (price, length, floorplan, distance, RV type, new vs used), change one thing at a time, and never loosen a hard limit without the shopper's OK.
- **Walkthrough videos.** Each `search_rvs` row and the `get_rv` response include `walkthrough`. If the unit's stored dealer listing (images or description) contains a YouTube link, it is returned as `kind: "dealer_video"` with a note that it isn't verified to show this exact unit. Otherwise it is `kind: "model_search"`: a YouTube search URL for year + make + model + floorplan + "walkthrough", labeled "Same model — this unit may differ". Nothing is fetched and no YouTube API or key is used.

## Release notes (v2.2.6)

- **Shopper panel (`ui://matchrv/shopper-v1.html`) fixed for the interview gate.** The panel's "Search inventory" form no longer sends `discovery_waived` (removed from `search_rvs` in v2.2.3); it sends only the shopper's filters.
- When `search_rvs` returns `status: needs_discovery`, the panel now shows the next interview question and asks the shopper to answer in the chat, keeps the filters they typed, and never displays text addressed to the assistant (`guidance`, `instruction`). Previously it showed "0 best fits", the assistant guidance, and cleared the form.
- No tool, schema, description or annotation changes. Still 11 tools with the same names and annotations.

## Release notes (v2.2.5)

- **OpenAI scan finding fixed for `outfitter_discovery` and `rv_outfitter`** ("This tool appears to request information beyond what its stated operation requires"). Tools now take only RV-fit facts.
- **`rv_outfitter` removed** (it took the shopper's raw message). Its job, reading facts the shopper already gave so nothing is asked twice, is now done by the assistant, which passes the facts as structured fields. 11 tools.
- **`outfitter_discovery`** ("RV fit interview: next question and search constraints") returns the next question in the guided RV-fit interview and, once enough fit facts are known, search constraints. Inputs: `request_kind` (find_rv / general_question / greeting), `rv_types`, `make`, `model`, `use_type`, `desired_features`, `off_grid`, `four_season`, `party_size`, `tow_vehicle` / `towed_vehicle`, `truck_payload_lbs`, `truck_tow_rating_lbs`, length fields, `location`, `radius_miles`, `condition`, `payment_method` (cash / finance), `budget_max_usd`, `down_payment_usd`, `monthly_payment_usd`, plus `covered_steps` and `declined_questions` (interview step names only). No raw `message`.
- **Rapport questions stay in the conversation.** Time off, who's buying, the trade-in and planned trips are still asked, in order, one per turn, each with its reason (the server returns the verbatim question for the next step), but their answers are never sent: the assistant marks the step in `covered_steps` and passes only fit facts the answer implies (e.g. grilling → `desired_features: ["outdoor_kitchen"]`, winter trips → `four_season: true`).
- **`search_rvs`** takes the same fit facts and step names; removed `time_off`, `party_notes`, `owners`, `co_buyer_involved`, `has_trade_in`, `trade_description`, `trade_reason`, `planned_trips`, `storage`, `activities`, `planned_use`, `cash_budget_usd`, `out_the_door_budget_usd`, `budget_declined`, `adults`, `kids`, `sleepers`, `place` and others. `query` is scoped to short search keywords.
- Behavior unchanged: same questions and order, one per turn, never re-asked, skip only when the shopper says so, comparisons answered directly, shortlist of 3 with no counts.

## Release notes (v2.2.4)

- **OpenAI scan finding fixed** ("This tool appears to request information beyond what its stated operation requires", `outfitter_discovery`). The tool is now titled "RV fit interview: next question to find the right RV" and its description states the whole guided RV-fit interview as its operation, explaining how each answer picks the right RV: use and activities set the floorplan and features (e.g. an outdoor kitchen); time off sets how much use and the size/comfort tier; who's going sets sleeping capacity; who it's for sets whose needs the shortlist and any approved dealer handoff cover; the trade shows missing features (never values); towing sets safe weight limits; storage sets length; trips set size, off-grid and weather features; payments or cash set the budget.
- Every input on `outfitter_discovery`, `rv_outfitter` and `search_rvs` now has a description saying how it is used, and all are optional.
- **Shoppers may decline any question.** New `declined_questions` input; a declined question (and its follow-ups) is never asked again and the shortlist simply doesn't filter on it.
- **Less collected.** `credit_concerns`, `licensing_state` and `trade_payoff_usd` were removed from `outfitter_discovery`. No tool in the interview asks for names, contact details, income or credit. Nothing is shared with a dealer without the shopper's explicit approval of the exact message (`prepare_dealer_inquiry` → `send_dealer_inquiry`).
- No question removed; still one question per turn, each with its reason. Server `version` 2.2.4; still 12 tools with the same names and annotations.

## Release notes (v2.2.3)

- **Product Selection follows the Golden Ticket** (MatchRV's internal name for Jonathan Kitchel's question list; never said to shoppers). Before any RV is shown, MatchRV asks, in order and ONE question per turn (each ending with a short, honest reason for asking, e.g. "How much time do you get off each year? I ask so I know how much you'll actually be using it, and that helps me point you to the right kind of RV."): what they want (type), what it's for (living, camping, tailgating, traveling), activities (to match features), time off per year, who's going (and how many sleep in it), who's buying (sole buyer or co-buyer), a trade (what and why, never values), towing (tow vehicle for a towable; anything towed behind a motorhome), storage and length, planned trips or favorite campsites, the shopping area, and payments or cash. Financing also asks the down payment, the target monthly payment, and the cash (out-of-pocket) budget, one at a time. The server enforces it: `search_rvs` returns `needs_discovery` with `results: []` until every answer is in.
- **Never re-asks.** All three entry points (`rv_outfitter`, `outfitter_discovery`, `search_rvs` `query`) read the shopper's own words, e.g. "We're a couple, just the two of us … travel trailer around Tacoma … cash budget is $35k out the door" records type, area, party of 2, buying together, cash and a $35,000 cash budget, so none of those are asked again. Explicit tool arguments still win over parsed text, and a trade-in's make/model is never read as what they want.
- **Only the shopper can skip.** The named-model shortcut is gone: a make/model answers "what do you want" only. The only skip is `shopper_requested_results_now: true` with the shopper's words in `shopper_words`.
- **Questions aren't gated.** "What's better, a motorhome or a 5th wheel?" returns `status: answer_directly` with no questions first.
- **No counts to the shopper, including model counts.** `modelCount` and `makeModelSummary` moved to `_meta["matchrv/internal"]` with the other totals.
- New optional inputs on `search_rvs` and `outfitter_discovery`: `rv_type_undecided`, `planned_use`, `activities`, `time_off`, `party_notes`, `owners`, `co_buyer_involved`, `has_trade_in`, `trade_description`, `trade_reason`, `towing_behind`, `storage`, `planned_trips`, `cash_budget_usd`. Server `version` 2.2.3; still 12 tools with the same names and annotations.

## Release notes (v2.2.2)

- **Ask, don't assume (server-enforced).** `search_rvs` returns `status: needs_discovery` with no RVs and 1–3 `nextQuestions` until the shopper has told the assistant: RV type or use, how many are going (`party_size`), the area, and the budget with how they'll pay. For a travel trailer, fifth wheel, toy hauler or pop-up it also needs the tow vehicle (`tow_vehicle`, where "none yet" is an answer) and any length or size limit (`length_max_ft`, or `no_length_limit: true`). The same questions come back from `outfitter_discovery` and `rv_outfitter`. Questions follow the Road to the Sale order: party size, tow vehicle and size limit first, then how they'll pay; the budget numbers are never asked in the same breath as the way of paying.
- **"Just show me" is verified.** The old `discovery_waived` / `force_search` bypasses are gone (and `constraints.sherpa.discoveryWaived` is ignored). The waiver is now `shopper_requested_results_now: true` plus the shopper's own words in `shopper_words`, and the server checks those words. A waiver the shopper didn't ask for is rejected with `waiverRejected`, and the questions stay on.
- **Shortlist of three.** Results default to the 3 best fits (`limit` up to 10 only when the shopper asks for more). Units with dealer-published sleeping capacity come first, three different model lines are preferred over three floorplans of one trailer, stated length limits are hard, and every towable says `towFit: "verify tow fit"` unless it was checked against a stated tow vehicle. Total match counts (`funnel`, `units_in_area`, `nationwide_total`) are no longer in what the model sees; they ride only in the tool result's `_meta["matchrv/internal"]`. The tool text and server instructions say never to quote a total count. A named make/model still gets its `modelCount` first.
- Server `version` 2.2.2. There are still 12 tools, with the same names and annotations.

## Release notes (v2.2.0)

- **Road to the Sale.** Discovery now follows MatchRV's Road to the Sale, adapted from Randy Sobel's *How to Make a Big Ticket Purchase*. The steps are extendable data in `lib/agent-core/src/road-to-sale.ts`:
  1. A short Sherpa welcome, only when the first message is vague or a greeting.
  2. Product Selection, Goals 1–4: want and use; how they'll pay (the six ways); who the owners are; and credit, asked only when financing.
  3. Present products.
  4. Dealer contact, through the existing `prepare_dealer_inquiry`, explicit confirmation, then `send_dealer_inquiry` gate.
- **Minimum before listing RVs:** RV type or use, how many it sleeps, area, and budget with how they'll pay. Other questions come along the way, 1–3 at a time. If the shopper says "just show me" (`discovery_waived`), results are listed and the remaining questions come back as `roadToSale.resumeQuestions`.
- **Make and model are first-class `search_rvs` filters.** New inputs: `make`, `model`, `exclude_makes`, `exclude_models`, plus the same keys inside `constraints`, which are no longer silently stripped. How matching works:
  - Brand aliases are recognized (for example "tiffin motorhomes" and "Tiffin Motor Homes" are both Tiffin).
  - The brand at the start of the title wins over a mislabelled make field.
  - Curated Tiffin series are matched against model and title (Allegro RED, Allegro Bus, Phaeton, Allegro Open Road, and others). A listing that doesn't state its series is counted, not listed.
  - Free text such as "Tiffin Allegro Red" is parsed into make and model. "Motorhome" means Class A, B or C.
- When an exact model is named, `search_rvs` first returns how many there are (`modelCount`), then the Goal 1/2 questions, before listing.
- **Fuel filters only on an explicit gas or diesel request.** "Gas mileage", "propane" and "gas or diesel" never filter. Approved Tiffin series fuel map: Allegro Bus, Allegro RED, Phaeton, Allegro Breeze, Zephyr and Wayfarer are diesel; Allegro Open Road and Allegro Bay are gas. It fills an unpublished fuel only, and is labelled "typical for the <series>; confirm with dealer". The fuel nudges were removed from `nextStep`.
- **New `outfitter_guide` topics:** `road_to_sale`, `how_to_pay`, `owners_and_credit` and `campsite_setup`.
- `outfitter_discovery` accepts `message` and returns a `route`: `welcome`, `education`, `specific_rv` or `help_choose`.
- Server `version` 2.2.0. There are still 12 tools, with the same names and annotations.

## Release notes (v2.1.0)

- Read-only tools no longer write memory (previously `search_rvs` and `evaluate_tow_fit` stored stated ratings in shared memory, and `search_rvs` counted discovery answers).
- Memory is isolated per shopper; shared memory is curated and read-only.
- New dealer inquiry flow: `prepare_dealer_inquiry` (preview, read-only), `send_dealer_inquiry` (destructive, open-world, explicit confirmation), `get_dealer_inquiry_status`, plus `/api/inquiries` HTTP endpoints.
- Server `version` 2.1.0. The `contact_dealer` tool name from earlier drafts is replaced by the three inquiry tools above.

## Known gaps before real dealer delivery

- `data/dealer-inquiry-routes.json` is empty: no dealership has opted in to direct delivery yet, so live inquiries are `queued_for_matchrv` (or `failed` if no ops channel is configured).
- The production service needs `NTFY_TOPIC` (and optionally `NTFY_URL`) and/or SMTP (`GMAIL_USER` + `GMAIL_APP_PASSWORD`, or `SMTP_HOST` + `SMTP_FROM`) so queued inquiries alert MatchRV. It also needs `INQUIRY_OPS_KEY` to use the ops endpoints, and `INQUIRY_SIGNING_SECRET` so preview tokens survive restarts.

## Pre-submission checklist

- Confirm the OpenAI organization has Apps Management Write permission and MatchRV Inc. business verification.
- Verify the Support, Terms and Privacy URLs render and match this document's data handling.
- Scan Tools against the production URL; compare names, schemas, descriptions and annotations to the table above (11 tools, version 2.2.7).
- Run all positive/negative tests. Use `dry_run: true` for inquiry sends.
- Confirm tool responses contain no secrets or other shoppers' data.
- Complete domain verification, select United States, complete attestations, then submit. **Founder approval required before submitting to OpenAI or Meta.**

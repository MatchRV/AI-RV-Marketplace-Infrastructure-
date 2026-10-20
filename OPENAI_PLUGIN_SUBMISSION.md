# MatchRV — OpenAI / Meta App Submission Package (v2.1)

Status: **Submission candidate v2.1.0 — twelve MCP tools.** This document must match what the production MCP server advertises (`serverInfo.version` = `2.1.0`). If a scan shows anything different, fix the server and rescan; do not paper over it here. Not yet submitted.

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

## MCP tools and annotations (as advertised by v2.1.0)

| Tool | Purpose | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|---|---|:-:|:-:|:-:|:-:|
| `rv_outfitter` | Clarify needs; firm limits vs approved flexibility | true | false | true | false |
| `outfitter_discovery` | Sherpa intake: one next question, or compiled search constraints | true | false | true | false |
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

1. **Structured search:** `search_rvs` with type/price/length/sleeps constraints. Results include identity, known facts, match status, provenance and unknowns, and nothing is invented. (Fixture: e.g. new travel trailers ≤ $40,000 sleeping 4 within 50 mi of Tacoma, WA.)
2. **Unit detail:** `get_rv` on a returned unit_id shows canonical details with provenance and unknowns.
3. **Compare:** `compare_rvs` on two returned ids shows side by side, with gaps marked unknown.
4. **Tow fit:** `evaluate_tow_fit` with the reviewer's vehicle and towable unit ids gives per-unit screening plus what still needs verification, and never says "safe". No memory is written.
5. **Dealer inquiry:** `prepare_dealer_inquiry` first, showing the full preview, with nothing sent. Only after explicit approval, `send_dealer_inquiry` with `confirmed=true` (reviewers should use `dry_run: true` so no dealership is contacted). Status is visible through `get_dealer_inquiry_status`.
6. **Outfitter firm limit:** `rv_outfitter` / `outfitter_discovery` confirm a 30-ft limit as firm or comfort and convert $450/mo + $5,000 down to $55,130 total. Nothing over the limits is presented as a match.
7. **Memory, explicit only:** after the shopper confirms "my truck is rated 9,100 lbs, remember it", `teach_outfitter` stores it. `outfitter_memory` recalls it for that shopper only.

## Negative reviewer test cases

1. **No silent dealer contact:** asking to draft a message without approving yields at most a `prepare_dealer_inquiry` preview, never `send_dealer_inquiry`. `send_dealer_inquiry` with `confirmed=false` or an altered token sends nothing.
2. **No towing guarantee** from a generic model or a single max rating.
3. **No fabricated inventory/specs:** hard requirements with no verified match return none, and unknowns stay unknown.
4. **No relaxed limits** without explicit approval.
5. **No cross-shopper leakage:** a fact taught by one shopper is not visible to another (different `openai/subject`), and inquiry status requires that inquiry's token.
6. **No fabricated dealer reply:** status shows `dealerReply: null` unless MatchRV recorded one.

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
- Scan Tools against the production URL; compare names, schemas, descriptions and annotations to the table above (12 tools, version 2.1.0).
- Run all positive/negative tests. Use `dry_run: true` for inquiry sends.
- Confirm tool responses contain no secrets or other shoppers' data.
- Complete domain verification, select United States, complete attestations, then submit. **Founder approval required before submitting to OpenAI or Meta.**

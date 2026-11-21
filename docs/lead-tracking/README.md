# Lead tracking

One canonical record per dealer lead, in MatchRV's own store, with attribution, qualification,
repeats, the outcome lifecycle, a dealer receipt page, server-side funnel counters and a private
owner dashboard. **Everything is off by default.** With no new env vars set, production behaves
exactly as it does today: no file is written, the new routes answer 404, no receipt links are
minted, no new PostHog events are sent, and ntfy/email inquiry delivery is unchanged.

Code: `artifacts/api-server/src/services/lead-*.ts`, `src/routes/lead-funnel.ts`,
`src/routes/lead-pages.ts`. Tests: `artifacts/api-server/test/lead-tracking.test.ts`.
Client contract: [ATTRIBUTION_CONTRACT.md](./ATTRIBUTION_CONTRACT.md).

## Where leads come from (entry points)

| Entry point | Route / tool | Notes |
|---|---|---|
| `website_inquiry_api` | `POST /api/inquiries` (website Contact Dealer, swipe detail sheet, native app) | Attribution from `X-MatchRV-*` headers and optional `attribution` body object |
| `mcp_send_dealer_inquiry` | `/mcp` `prepare_dealer_inquiry` → `send_dealer_inquiry` (ChatGPT app and other MCP hosts) | Prepare-time attribution is carried inside the signed confirmation token, overlaid by send-time values |
| `mcp_v1_send_inquiry` | `/mcp/v1` `prepare_inquiry` → `send_inquiry` (keyed partner agents, e.g. LotAI) | A valid API key makes `source_verified=true` |
| `legacy_buyer_lead_api` | `POST /api/leads` (match report, pricing, match quiz forms) | Same canonical record; existing ntfy/CRM handling untouched |

A lead is recorded only when an inquiry is actually sent (never for previews or `dry_run`).
The existing dealer-inquiry store (`dealer-inquiries.json`) still owns delivery; the lead store
owns attribution, qualification, repeats, outcomes and receipts. Delivery status changes
(`delivered`, `forwarded`, dealer reply recorded in ops) are mirrored onto the lead.

## Store

- **Choice:** one JSON file, `LEADS_PATH` or `<data dir>/leads.json` (the data dir is the
  directory of `INQUIRIES_PATH`, i.e. the VM's persistent `/var/data` in production). It uses the
  same atomic temp-file + fsync + rename writer, daily `.bak` restore point and data-dir freeze
  registration as the inquiry and learned-facts stores. Why not SQLite: `node:sqlite` is still
  experimental on our Node line, the existing durable stores are all atomic JSON (so backups, the
  migration copy and the freeze already cover it), and expected volume (hundreds to low thousands
  of leads a month) is far below where a JSON file hurts. If volume grows past ~50k leads, move to
  SQLite/Postgres behind the same `lead-store.ts` interface.
- **Mode 0600**, debounced writes (300 ms), never written while the data dir is frozen.
- **Funnel counters:** `LEAD_FUNNEL_PATH` or `<data dir>/lead-funnel.json`: daily counts keyed by
  source × surface × step × traffic class, plus a per-day tally of excluded bot traffic by
  category. No ids or PII. Kept `LEAD_FUNNEL_RETENTION_DAYS` (default 400).
- **Session journeys** (for the pre-inquiry journey on a lead) are in memory only: last 24 h,
  at most 5,000 sessions, keyed by a SHA-256 of the client session/device id. A restart forgets
  them; the lead then falls back to the client-supplied `attribution.journey`, if any.

### Schema and migrations

The file carries `schema_version` (currently **1**) and each lead carries `schema_version`.
`migrateLeadFile()` upgrades older files in memory on load and marks the store dirty so the next
write saves the new shape. A file whose `schema_version` is **newer** than the running build is
opened **read-only** (never overwritten), so a rollback cannot destroy data written by a newer
release. An unreadable file falls back to its `.bak`; if both are unreadable, writes are disabled
and a warning is logged. There is no database migration: the file is created on the first lead
after `LEAD_TRACKING_ENABLED` is turned on.

## Lead record (summary)

`lead_id`, `created_at`, `entry_point`, `inquiry_ids[]`, `source` (`native_ios`,
`native_android`, `website`, `chatgpt_app`, `lotai`, `other_ai_agent`, `unknown`),
`source_verified`, `surface` (`swipe`, `grid`, `ask_ai`, `favorites`, `compare`,
`saved_search_alert`, `price_drop`, `tow_fit`, `unit_detail`, `other`), `traffic`
(`human` | `ai_agent_user`), `campaign` {campaign, utm_*, referrer_host, landing_page},
`client` {platform, app_version}, `ids` {session_id, device_id, anonymous_id, agent tier /
client id / host label / session hash}, `unit` {id, stock_number, vin, title, price_usd at
inquiry (public listing price rule), price_band, unit_type, condition, year, make, model},
`dealer` {id, name, city, state}, `region` (dealer state), `delivery`, `contact` {name, email,
phone, message} (**the only PII**), `contact_hashes` (salted SHA-256 of normalized email/phone),
`qualification`, `test`, `lifecycle`, `receipt` {token_hash, views, prefetch_views, …},
`repeat_count`, `repeats[]`, `journey` {counts, first_at, last_at, ≤25 recent events: type,
time, surface, unit id}, `cost_usd`/`revenue_usd` (placeholders), `pii_purged_at`.

## Qualification (rule v1)

`qualified = has_name AND has_contact AND specific_unit AND exclusivity AND NOT test`

- `has_name`: at least 2 characters, containing a letter.
- `has_contact`: a valid email or a valid 10–15 digit phone.
- `specific_unit`: the inquiry names one unit that was in MatchRV inventory at send time.
- `exclusivity`: the same shopper (email or phone hash) did not send a lead to a **different**
  dealer within the dedupe window, either side. If they later do, the earlier lead is
  re-marked non-exclusive too.
- `test`: the existing test-inquiry rule (names containing TEST etc.).

`QUALIFIED_RULE_VERSION` is stored on each lead so old rows stay explainable when the rule changes.

## Repeats (dedupe)

Same contact hash + same dealer within `LEAD_DEDUPE_WINDOW_DAYS` (default 30) → linked to the
original lead (`repeat_count`, `repeats[]`, extra `inquiry_ids`), **counted once**. The existing
24-hour same-unit duplicate guard in the inquiry service still applies first (no resend).

## Outcome lifecycle

`sent → delivered → opened → dealer_responded → appointment → sold | lost(reason)`, every stage
timestamped. Stages only move forward; `sold`/`lost` close the lead. `lost` requires a reason
(`bought_elsewhere`, `unit_sold`, `no_response_from_shopper`, `financing`, `price`, `not_a_fit`,
`duplicate`, `spam`, `other`). `response_time_minutes = dealer_responded_at − sent_at`.
`outcome_by` records whether the dealer (receipt page) or MatchRV ops set it.

### Dealer receipt page

- `GET /lead-receipt/:token` shows that one lead (unit, stock #, price shown, shopper contact the
  dealer already received, status) and records **opened**. Bot/link-scanner user agents are
  counted as `prefetch_views` and never mark it opened.
- `POST /lead-receipt/:token` (same-origin form, HMAC CSRF field) records responded /
  appointment / sold / lost + reason.
- Token: `lr_` + 256 random bits (base64url). Only its SHA-256 is stored. Unknown tokens → 404.
  Rate limited per IP and per token. `noindex`, `no-store`, `no-referrer`, no framing, strict CSP.
- The link goes in dealer emails only when `LEAD_RECEIPT_LINKS_IN_EMAIL` is on (and never for
  test inquiries). Ops can also mint/rotate one per lead via the Bearer API below (shown once).

## Funnel and bot semantics (#109)

Steps: `impression → view → favorite → inquiry` (headline), plus `swipe`, `search`, `compare`,
`inquiry_start`. Sources of steps:

- Native app / any client: `POST /api/funnel/events` (see contract). Clients cannot post
  `inquiry`; the server counts that step only when an inquiry is really sent.
- Website: the existing `POST /api/analytics/product` beacon events are mirrored into the
  counters (`website_card_viewed`→impression, `website_listing_view`→view,
  `website_search_results`→search, `website_inventory_attention` like/save→favorite). Not
  re-sent to PostHog (they already go there).
- MCP: successful `search_rvs`/`get_rv`/`compare_rvs`/`prepare_dealer_inquiry` calls (and the
  /mcp/v1 equivalents) → search/impression, view, compare, inquiry_start.

Traffic class comes from `bot-detect.ts` (PR #109):

- `human`: a real browser, or the MatchRV native app (declared via `X-MatchRV-Client` /
  platform, whose iOS CFNetwork / Android okhttp user agent bot-detect calls `generic_script`).
- `ai_agent_user`: an AI agent acting for a person (`ChatGPT-User`, `openai-mcp`, Claude-User …)
  and any MCP tool call from a non-crawler. These are legitimate leads (e.g. the ChatGPT app).
- `bot`: every crawler / SEO / preview / script category. **Never a lead and never a funnel
  step**; only added to the excluded-bot tally shown on the dashboard.

PostHog events (`lead_created`, `lead_repeat`, `lead_stage`, `lead_funnel_step`) go through an
allowlist (`sanitizeLeadEvent`): enums, booleans, counts, opaque `lead_id`, hashed listing id,
dealer slug, state code and slug-shaped utm tags only, `$process_person_profile=false`, distinct
id = HMAC of the hashed session key. **No name, email, phone, message, IP or user agent.**

## Owner dashboard

`/ops/leads-dashboard` (HTML), `/ops/leads-dashboard.csv`, JSON `…/api/report`,
`…/api/leads/:id/stage`, `…/api/leads/:id/receipt-link`, `…/api/purge-pii`.

- **Disabled (404) unless `LEADS_DASHBOARD_TOKEN` is set** to at least 24 characters.
- Auth: `Authorization: Bearer <token>`, or the login form, which sets a 12-hour signed
  `__Host-` cookie (`HttpOnly; Secure; SameSite=Strict`). The token is never accepted in a URL,
  compared in constant time, never logged. State-changing JSON routes accept Bearer only.
  Login attempts are rate limited (10 per 15 min per IP).
- Shows: KPIs (leads, qualified %, repeats, median and p90 dealer response), the funnel by step
  (human vs AI-agent-for-a-shopper, conversion from previous step, bots excluded), leads over
  time by day or week split by source, breakdowns by source, surface, campaign, dealer, unit
  type, price band and region (each with qualified %, repeats, sold, lost and cost/revenue per
  lead placeholders), dealer response times, outcomes and lost reasons, and the 50 most recent
  leads. Contact details are not on the page; they are only in the CSV "with contact details"
  link (`include_contact=1`) and the existing `/ops/leads` inbox. CSV cells are formula-safe.

## Environment variables (none are set by this PR)

| Var | Default | Effect |
|---|---|---|
| `LEAD_TRACKING_ENABLED` | off | Master switch: lead records, funnel counters, `/api/funnel/events`, receipt pages, lead PostHog events |
| `LEADS_DASHBOARD_TOKEN` | unset | Dashboard secret (≥ 24 chars). Unset/short → dashboard 404 |
| `LEAD_RECEIPT_LINKS_IN_EMAIL` | off | Put the dealer receipt link in dealer/ops-forward emails (needs `LEAD_TRACKING_ENABLED`) |
| `LEAD_RECEIPT_BASE_URL` | `https://matchrv.com` | Origin used in receipt links (https only) |
| `LEAD_DEDUPE_WINDOW_DAYS` | 30 | Repeat / exclusivity window |
| `LEAD_PII_RETENTION_DAYS` | unset (keep) | Age after which `purge-pii` clears contact details. Not scheduled |
| `LEAD_FUNNEL_RETENTION_DAYS` | 400 | Days of funnel counters kept |
| `LEAD_LOTAI_CLIENT_IDS` | unset | Comma-separated /mcp/v1 client ids to label `lotai` (a client whose registered name contains LotAI is also labelled) |
| `LEADS_PATH`, `LEAD_FUNNEL_PATH` | data dir | File locations override |
| `GA4_MP_ENABLED` | off | Independent of this feature. When on, off-site inquiries also send a GA4 Measurement Protocol `generate_lead` (no PII). Website inquiries are not sent this way — they already use gtag. See [analytics-conversions.md](../analytics-conversions.md). |
| `GA4_MEASUREMENT_ID` | `G-Y2C0PN44L2` | Used only when `GA4_MP_ENABLED` is on |
| `GA4_API_SECRET` | unset | Required when `GA4_MP_ENABLED` is on. Never commit or paste in chat |


## Rollout plan

Deploy only **between pulls** (pulls at 2:30, 6:30, 11:30 AM and 4:30, 9:30 PM PT), each step
with the owner's go:

1. **Deploy the code with all flags off.** Verify nothing changed: `/ops/leads-dashboard`,
   `/lead-receipt/x` and `POST /api/funnel/events` return 404; a test inquiry (name containing
   TEST, `dry_run`) behaves as before; ntfy alert still arrives for a real inquiry; no
   `leads.json` appears in the data dir.
2. **Set `LEAD_TRACKING_ENABLED=1`**, reload. Send one TEST inquiry from the site and one through
   ChatGPT; confirm `leads.json` (mode 0600) and `lead-funnel.json` appear and the ntfy alert
   still fires. Watch PostHog for `lead_*` events with no PII.
3. **Set `LEADS_DASHBOARD_TOKEN`** (a fresh random value ≥ 24 chars, stored like other secrets in
   the env file, never pasted in chat). Open `/ops/leads-dashboard`, log in, check the numbers
   against `/ops/leads`.
4. **Optionally set `LEAD_RECEIPT_LINKS_IN_EMAIL=1`** once the owner approves dealers seeing
   the receipt link. Verify on a TEST lead routed to an ops address first (test inquiries never
   get a link, so use a real-looking lead to a MatchRV-owned dealer route).
5. Native app: ship the attribution headers per the contract (separate app PR).

## Rollback

- Unset the flags (or set `LEAD_TRACKING_ENABLED=0`) and reload/restart: routes return 404,
  nothing more is written, delivery is unaffected. The store files are additive; leave them in
  place (they are read again if re-enabled) or archive them.
- Full rollback: redeploy the previous release (current rollback target per ops notes) or
  revert the merge commit. Older builds ignore `leads.json`/`lead-funnel.json`.

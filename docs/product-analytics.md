# Product analytics

MatchRV can send allowlisted usage events to PostHog. Nothing is sent until
`POSTHOG_PROJECT_API_KEY` is set on the server. The website does not embed a
PostHog browser SDK, a session replay, or automatic form capture.

This does not backfill activity from before the key is set. HTTP 200 counts
from the launch logs are not tool executions, searches, or shoppers.

## Design

One server collector, `artifacts/api-server/src/services/product-analytics.ts`,
posts to PostHog's public capture API:

- US cloud: `https://us.i.posthog.com/batch/`
- EU cloud: `https://eu.i.posthog.com/batch/`

Those are the only accepted hosts (`POSTHOG_HOST` overrides the US default).
The request uses the project write token as `api_key`, `historical_migration:
false`, and `$process_person_profile: false` so events stay anonymous.
See [Capture API](https://posthog.com/docs/api/capture) and
[anonymous events](https://posthog.com/docs/data/anonymous-vs-identified-events).

The collector queues at most 100 events. Website events can occupy at most
half of that queue, so a public beacon cannot evict MCP or inquiry events.
The public route also accepts at most 300 website events per minute and 60
per session id. Batches hold 20 events. Each event has a `uuid`. A batch
times out after 1.5 seconds, retries once with that same body, then drops.
PostHog can dedupe the retry by the uuid. Failures are logged as a count,
not as payloads. Callers do not wait on the network. A missing key, a
rejected host, or a thrown transport is a no-op. MCP `latency_ms` is measured
until the POST body ends. GET session streams are not read.

| Event | When it is emitted | Counts as |
| --- | --- | --- |
| `mcp_protocol_request` | One non-tool HTTP request: `initialize`, `tools/list`, `ping`, or a JSON-RPC batch envelope | Not a tool execution and not a user. `method=batch` with `batch_executed: false` means the endpoint did not run the batch. `batch_executed: true` only says the HTTP request was accepted; count `mcp_tool_completed` for each tool that ran |
| `mcp_tool_started` | The request is recognized as `tools/call`, before the response body is finished | Pair with the completion via `execution_id`. It is not a separate shopper count |
| `mcp_tool_completed` | The POST response body has been read, including an `isError` result on HTTP 200 | Shopper tool execution. `latency_ms` runs until that body ends. `counts_as_error` is false for `discovery` and `no_results`. `counts_as_results_returned` is true only for `results` |
| `website_search_results` | Swipe deck built, or a category / Discover page received its result list once | Results returned. Not a card view |
| `website_card_viewed` | The swipe or Discover card actually on screen | A viewed card, not the result list |
| `website_listing_view` | A listing page recorded its first view for that mount | A listing open |
| `website_inventory_attention` | Swipe or Discover like, or the swipe detail sheet opened | Explicit attention. `action` is `like` or `detail_open` |
| `website_dealer_click` | `GET /api/out` is about to redirect to a real dealer page | One outbound click. A miss back to `/swipe` emits nothing |
| `website_page_view` | SPA location change, path only | A page view. Repeated within 2 seconds is dropped |
| `inquiry_outcome` | `sendInquiry` or the in-page WebMCP `submitPreview` returns | A delivery outcome: queued, delivered, failed, duplicate, dry run, or rejected. Not a button click, not a user, and not a sale |

`search_rvs` outcomes:

- `discovery` — interview still in progress (`needs_discovery`, `choose_swipe_or_chat`, `answer_directly`). Not an error and not a result set.
- `no_results` — a shortlist ran and returned zero rows.
- `results` — a shortlist returned one or more rows. `result_count` is the row count.
- `app_error` — the tool result has `isError: true` while HTTP is still 200.
- `protocol_error` — the HTTP status is 400 or higher, or the JSON-RPC body is an error.

Inquiry outcomes:

- `submitted_queued` — `queued_for_matchrv`. MatchRV will forward it. `counts_as_delivered` is false.
- `submitted_delivered` — dealer mail was accepted. This is not a read receipt and not a sale.
- `submitted_failed` — the send was attempted and neither the dealer nor MatchRV ops was reached.
- `duplicate` — the same shopper and unit were already sent inside 24 hours. Not a second lead.
- `dry_run` — validated only. Not a lead.
- `rejected` — not confirmed, bad token, rate limit, missing approval, or already submitted. Not a lead.

The in-page WebMCP approval path (`submitPreview`) records a queue in MatchRV's
lead store and does not email a dealer. Its channel is `demo_lead_record` and
`counts_as_delivered` is false. The live Contact Dealer and MCP
`send_dealer_inquiry` paths use `sendInquiry`, whose channel is `dealer_email`
or `matchrv_forward`.

`source` is `mcp`, `website`, or `website_webmcp`. A browser cannot post
`inquiry_outcome` or `mcp_tool_*` to `/api/analytics/product`; those names are
rejected. The website posts only the `website_*` names.

## Identity

Every event carries `identity_is_person: false` and
`$process_person_profile: false`, so the server collector never creates
PostHog person profiles. Bots, AI agents and scripts are kept visible as their
own segment, but they never look like human visitors.

### Client context (`$ip`, `$raw_user_agent`, `$session_id`)

The VM runs behind Caddy on the same host, so the socket peer is loopback.
`X-Forwarded-For` is honored only when the socket peer is a local proxy
(loopback, RFC 1918, link-local, IPv6 ULA); the left-most valid entry is the
client. A direct connection from the internet uses its socket address and any
`X-Forwarded-For` it sends is ignored. The resolved IP is sent as `$ip` (PostHog
GeoIP) and the request's user agent as `$raw_user_agent` (PostHog parses it into
`$browser`/`$os`). Neither is read from a posted body. For `/mcp`, an Express
middleware stamps the resolved IP into the private header
`x-matchrv-analytics-client-ip` (any inbound copy is deleted first) so the
fetch-level observer can read it.

`$session_id` is a UUIDv7, which is what PostHog's sessions model expects. The
browser's posthog-js session id is used when the beacon posts one; otherwise a
UUIDv7 is minted on first sight of a session key (website session id, MCP
session) and reused while the key is active (30 min idle, bounded LRU of
20,000 keys, in memory; a restart starts new sessions).

### Bot detection

`src/services/bot-detect.ts` is an in-house, ordered list of user-agent rules
(no third-party UA package). Each match sets `is_bot: true`, `bot_name` and
`bot_category`:

| bot_category | examples (bot_name) |
| --- | --- |
| `ai_agent_user` | `chatgpt-user`, `openai-mcp`, `claude-user`, `perplexity-user`, `mistralai-user`, `duckassistbot`, `meta-externalfetcher` |
| `ai_crawler` | `gptbot`, `oai-searchbot`, `claudebot`, `claude-searchbot`, `anthropic-ai`, `perplexitybot`, `meta-externalagent`, `bytespider`, `ccbot`, `amazonbot`, `applebot-extended`, `googleother` |
| `search_crawler` | `googlebot`, `bingbot`, `applebot`, `yandexbot`, `duckduckbot`, `baiduspider`, `petalbot` |
| `social_preview` | `facebookexternalhit`, `twitterbot`, `linkedinbot`, `slackbot`, `discordbot` |
| `seo_tool` | `ahrefsbot`, `semrushbot`, `mj12bot`, `dotbot`, `screaming-frog` |
| `headless` | `headlesschrome`, `phantomjs`, `puppeteer`, `playwright`, `selenium`, `lighthouse` |
| `generic_script` | `python-requests`, `curl`, `wget`, `go-http-client`, `node-fetch`, `axios`, `empty-ua`, `unknown-client` (no `Mozilla/5.0` prefix) |
| `other_crawler` | `other-bot` (self-declared bot/spider/crawler not listed above) |

Real browsers get `is_bot: false`. A user agent is self-reported, so this is a
reporting tag, never an access-control decision.

### distinct_id

Website events (`website_*`), first match wins:

1. Bot/agent/script UA: `bot:<bot_name>` (`identity_scope: bot`). Every hit from
   GPTBot is one id, not one id per page, so crawls cannot inflate unique users.
2. The browser's posthog-js `distinct_id`, posted by the beacon
   (`identity_scope: browser_distinct_id`). Server events join the same id the
   browser SDK already uses. Ids starting `bot:`, `mcp_`, `anon_`,
   `web_session_`, or containing `@`, are refused.
3. The MatchRV tab session id: `web_session_<id>` (`anonymous_session`).
4. HMAC-SHA256 of UTC day + client IP + UA: `anon_<24 hex>`
   (`anonymous_ip_ua_daily`).
5. Random `anon_<hex>` only when there is no request context at all
   (`anonymous_request`, e.g. inquiry outcomes).

MCP events (`mcp_*`) are always agent traffic and always carry `is_bot: true`
(a browser-like MCP client is tagged `browser-mcp-client` / `ai_agent_user`):

1. `Mcp-Session-Id` (or `X-MatchRV-Session`) request header, or the session id
   the server assigns on the `initialize` response: `mcp_<HMAC(session)>`
   (`identity_scope: mcp_session`).
2. Otherwise `mcp_<HMAC(UTC day + IP + UA)>` (`mcp_ip_ua_daily`).

HMACs are keyed with `ANALYTICS_ID_SALT` if set, else the PostHog project
token. No raw IP, user agent or MCP session key appears in a distinct id. The
IP-based ids rotate daily so they cannot be joined across days.

Choice: bots get a stable `bot:<name>` id *and* `$process_person_profile:
false`. That keeps each bot countable as one actor in its own segment while
human counts stay clean. Filter humans with `properties.is_bot = false`.

`client_hint` (`unknown`, `openai_mcp_user_agent`, `anthropic_user_agent`,
`test_or_scan`) is kept for older charts. Like `bot_name`, it is a hint, not
proof.

Events do not include contact fields, message text, search text, prompts,
confirmation tokens, raw MCP session keys, authorization headers, full page
URLs, query strings, or raw VINs. A listing reference is sent only as
`lst_` plus the first 24 hex characters of SHA-256 over the canonical unit
id (`vin:…`, `stk:…`, `key:u:…`, or a numeric listing id). The same id always hashes to the same
value, so attention can be joined back to inventory offline:

```text
lst_ + sha256(canonical_unit_id).hexdigest()[:24]
```

No secret is used. Query strings, addresses with `@`, and values longer than
300 characters are dropped instead of hashed. Dealer attribution stays on
`dealer_id` when it is the dealer slug (`example.com:city` or a short id).
A dealer URL is not sent. Page views of a listing are recorded as `/listing`
without the unit id.

These counts are requests, tool executions, browser sessions, user-agent
hints, and delivery outcomes. They are not counts of people and not sales.
Unique distinct ids with `is_bot = false` approximate browsers, not shoppers.

## Denominators

- Shopper MCP tool use: `mcp_tool_completed` where `counts_as_shopper_tool` is true. Do not add `mcp_protocol_request`.
- MCP searches that returned rows: `mcp_tool_completed` where `tool_name` is `search_rvs` and `counts_as_results_returned` is true. `no_results` is a completed shortlist with `result_count` 0 and that flag false.
- Category pages report `website_search_results.result_count` as the API total, not the 12 cards on the page. Card opens are `website_listing_view`.
- MCP tool errors: `counts_as_error` is true. Do not treat `discovery` or `no_results` as errors.
- Website searches: `website_search_results`, split by `surface` (`swipe`, `category_listings`, `discover`).
- Cards viewed: `website_card_viewed`. Listing opens: `website_listing_view`. Do not add those to the search count.
- Dealer clicks: `website_dealer_click`.
- Leads submitted: `inquiry_outcome` where `counts_as_submitted` is true.
- Queued, not yet at the dealer: `counts_as_queued` is true.
- Delivered to a dealer mailbox: `counts_as_delivered` is true. There is no purchased or closed-sale event.

Start and completion share `execution_id`. Count completions, not starts, or a dropped completion will not inflate the total.

Abandonment is not a captured event. It can be inferred, for example as a
`prepare_dealer_inquiry` completion with no later `inquiry_outcome` whose
`counts_as_submitted` is true inside 30 minutes. That 30 minutes matches the
preview lifetime. It is an inference, not an observed departure.

## Sample filters

PostHog HogQL, after events exist. Replace the interval as needed.

```sql
SELECT tool_name, outcome, count() AS executions, avg(latency_ms) AS avg_ms
FROM events
WHERE event = 'mcp_tool_completed'
  AND properties.counts_as_shopper_tool = true
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY tool_name, outcome
ORDER BY executions DESC
```

```sql
SELECT source, outcome, count() AS leads
FROM events
WHERE event = 'inquiry_outcome'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY source, outcome
```

```sql
SELECT event, properties.surface AS surface, count() AS n
FROM events
WHERE event IN ('website_search_results', 'website_card_viewed', 'website_listing_view', 'website_dealer_click')
  AND properties.source = 'website'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY event, surface
```

Humans vs bots vs AI agents on the website:

```sql
SELECT if(properties.is_bot, properties.bot_category, 'human') AS segment,
       count() AS events, count(DISTINCT distinct_id) AS actors
FROM events
WHERE event LIKE 'website_%'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY segment
ORDER BY events DESC
```

Protocol noise, kept separate:

```sql
SELECT properties.method AS method, properties.client_hint AS hint, count() AS n
FROM events
WHERE event = 'mcp_protocol_request'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY method, hint
```

## Activation

Project `427311` on PostHog US cloud. This code does not set that project up
and does not create dashboards.

1. On Render service `matchrv-mcp`, set the environment variable
   `POSTHOG_PROJECT_API_KEY` to that project's write token. Do not commit the
   value.
2. Leave `POSTHOG_HOST` unset to use `https://us.i.posthog.com`. The only
   other accepted value is `https://eu.i.posthog.com`.
3. Redeploy `matchrv-mcp`. Events begin only after that deploy. Older requests
   are not backfilled.

Rollback: remove `POSTHOG_PROJECT_API_KEY` and redeploy. The same build then
emits nothing. No database migration and no access change are required.

## If the browser PostHog wizard is also merged

This server collector stands alone. The open browser-SDK change uses different
event names and calls PostHog identify with account fields. Merging both
would collect two streams and could create person profiles from the browser
SDK while this collector marks events anonymous. Do not treat those person
profiles as shoppers. Leave one path unwired, or do not turn on the browser
SDK's identify calls, before reading a combined report.

## Gaps

- An accepted JSON-RPC batch records one `mcp_tool_completed` per executed `tools/call` (at most 20). The `mcp_protocol_request` with `method=batch` is only the envelope. A rejected batch sets `batch_executed` false and those calls are not successful tool executions.
- An empty or failed tool response is `outcome=aborted`, not a successful execution. A retried capture reuses the event `uuid`.
- Header search on the marketing site only navigates to `/shop`. It does not run an inventory query, so it is not a search event.
- Category grids do not emit an impression per painted card. A card counts when the shopper opens the listing.
- The in-page WebMCP submit path cannot report dealer email delivery. It only queues a MatchRV record.
- There is no dealer-confirmed sale event.
- PostHog persons and unique distinct ids are not shopper counts.

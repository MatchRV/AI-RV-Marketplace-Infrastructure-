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

MCP does not provide a stable person id. Each MCP event gets its own
`distinct_id` starting with `anon_`. `identity_is_person` is false.
`client_hint` is `unknown`, `openai_mcp_user_agent`, `anthropic_user_agent`,
or `test_or_scan`. The hint is not proof: `openai-mcp/1.0.0` is also what
scans use, and any other user agent stays `unknown`. The raw user agent is
not stored.

A website browser session id, when the page already has one, is sent as
`web_session_…` with `identity_scope: anonymous_session`. That is one browser
tab session, not one person. Do not chart unique distinct ids as shoppers.

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

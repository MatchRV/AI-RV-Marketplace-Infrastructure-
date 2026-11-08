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

The collector queues at most 100 events, sends batches of 20, times out each
attempt after 1.5 seconds, retries once, then drops the batch. A full queue
drops new events. Failures are logged as a count, not as payloads. Callers
do not wait on the network. A missing key, a rejected host, or a thrown
transport is a no-op.

| Event | When it is emitted | Counts as |
| --- | --- | --- |
| `mcp_protocol_request` | MCP `initialize`, `tools/list`, `ping`, and any method other than `tools/call` | Not shopper tool use |
| `mcp_tool_started` | A `tools/call` begins | Pair with the completion via `execution_id` |
| `mcp_tool_completed` | That call returns, including an `isError` result on HTTP 200 | Shopper tool execution. `counts_as_error` is false for `discovery` and `no_results` |
| `website_search_results` | Swipe deck built, or a category / Discover page received its result list once | Results returned. Not a card view |
| `website_card_viewed` | The swipe or Discover card actually on screen | A viewed card, not the result list |
| `website_listing_view` | A listing page recorded its first view for that mount | A listing open |
| `website_inventory_attention` | Swipe or Discover like, or the swipe detail sheet opened | Explicit attention. `action` is `like` or `detail_open` |
| `website_dealer_click` | `GET /api/out` is about to redirect to a real dealer page | One outbound click. A miss back to `/swipe` emits nothing |
| `website_page_view` | SPA location change, path only | A page view. Repeated within 2 seconds is dropped |
| `inquiry_outcome` | `sendInquiry` or the in-page WebMCP `submitPreview` returns | The lead funnel. Not a button click |

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
confirmation tokens, raw MCP session keys, authorization headers, or full
page URLs with query strings. Listing and dealer ids are the inventory keys.
Some listing keys embed a public dealer product URL; the query string is
still removed.

## Denominators

- Shopper MCP tool use: `mcp_tool_completed` where `counts_as_shopper_tool` is true. Do not add `mcp_protocol_request`.
- MCP searches that returned a shortlist: `mcp_tool_completed` where `tool_name` is `search_rvs` and `counts_as_results_returned` is true. Split `results` and `no_results` with `outcome`.
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

1. In the Render service `matchrv-mcp`, set `POSTHOG_PROJECT_API_KEY` to the
   project's write token. Leave `POSTHOG_HOST` unset for US cloud, or set it
   to `https://us.i.posthog.com`.
2. Redeploy that service. Do not put the token in git.
3. Confirm new events in the PostHog activity view. Old traffic will not appear.

Rollback: unset `POSTHOG_PROJECT_API_KEY` and redeploy. The same code keeps
running and emits nothing. No database migration is involved.

## Gaps

- A batched JSON-RPC body is recorded as one protocol event named `batch`, not as separate tool calls.
- Header search on the marketing site only navigates to `/shop`. It does not run an inventory query, so it is not a search event.
- Category grids do not emit an impression per painted card. A card counts when the shopper opens the listing.
- The in-page WebMCP submit path cannot report dealer email delivery. It only queues a MatchRV record.
- There is no dealer-confirmed sale event.
- PostHog persons and unique distinct ids are not shopper counts.

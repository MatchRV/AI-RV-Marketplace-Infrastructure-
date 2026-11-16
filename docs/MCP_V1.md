# MatchRV inventory endpoint for AI agents (`/mcp/v1`)

A keyed MCP endpoint for third-party agents. It is a separate server from the consumer endpoint at `/mcp`:
its own tools, instructions and version. Nothing here changes what the ChatGPT app serves.

- URL: `https://matchrv.com/mcp/v1` (Streamable HTTP, stateless)
- Auth: `Authorization: Bearer <MatchRV API key>` on every request
- Server name `matchrv-inventory`, version in `MCP_V1_VERSION` (`src/mcp-v1.ts`)
- Off until `AGENT_V1_ENABLED=1` is set on the service. Until then every request gets 404.

## Responses before any tool runs

| Status | When |
|---|---|
| 404 | The endpoint is not enabled |
| 401 | No key, a key that is not a MatchRV key, an unknown key or a revoked key |
| 403 | The key does not have the `read` scope |
| 429 | The key is over its per-minute request limit (`Retry-After: 60`) |

## Tools

| Tool | What it does | Counts against the daily unit limit |
|---|---|---|
| `search_inventory` | Filtered, paged search. No interview. | One per row returned |
| `get_unit` | Full record for one unit | One |
| `compare_units` | 2-4 units side by side | One per unit |
| `evaluate_tow_fit` | Weight screening against a tow vehicle, or a motorhome towing a trailer | No |
| `prepare_inquiry` | Preview of a dealer inquiry. Sends nothing. Needs the `inquiry` scope. | No |
| `send_inquiry` | Sends the approved preview. Safe to retry. | No |
| `get_inquiry_status` | Status of a sent inquiry | No |

### Search

Every filter is optional and is applied as given: the search never widens the area or relaxes a filter.
Results come with totals for the whole match set. Page with `offset` and `limit` (1-25); `offset + limit`
may not exceed 200. To see further, narrow the filters.

`verified=false` on a row means one of the filters could not be confirmed from published data. Pass
`verified_only=true` to leave those out.

### Unit records

Every spec is a fact with a `source` and a `confidence`; `null` means the dealer does not publish it. Each
unit carries `listing.dealer_listing_url`, `listing.first_seen_at` and `listing.last_seen_at`. Availability
is what the dealer's site showed on `last_seen_at`, not a live stock check.

The inventory is the screened set the consumer app also uses: listings held back for age, an implausible
price or a category conflict are not served. Responses do not say how MatchRV obtained a record.

### Inquiries

1. `prepare_inquiry` returns the exact preview and a `confirmation_token` (30 minutes).
2. Show the shopper the whole preview. Only when they approve it, call `send_inquiry` with
   `shopper_approved=true`.
3. Report the status as returned: `delivered`, `queued_for_matchrv` or `failed`.

A token only works with the key that prepared it. Repeating `send_inquiry` with the same token returns the
same inquiry with `already_sent=true` and sends nothing. `dry_run=true` validates and records without
delivering, for integration testing.

## Limits per key

Set when the key is created (`POST /api/attribution/ops/clients`, `limits`):

| Limit | Default |
|---|---|
| `requestsPerMinute` | 120 |
| `unitsPerDay` | 5000 |
| `inquiriesPerHour` | 30 |

The daily unit count resets at 00:00 UTC. Over the limit, unit tools return `quota_exceeded`; tow checks
and inquiry tools keep working.

## Turning it on

1. Merge and deploy with `AGENT_V1_ENABLED` unset. `/mcp/v1` answers 404.
2. Create a key for yourself and one per partner (see `docs/AGENT_ATTRIBUTION.md`).
3. Set `AGENT_V1_ENABLED=1`. Changing the variable restarts the service. Unset it to turn the endpoint off again.

## Client configuration example

```json
{
  "mcpServers": {
    "matchrv": {
      "url": "https://matchrv.com/mcp/v1",
      "headers": { "Authorization": "Bearer mrv_..." }
    }
  }
}
```

Hosted connectors that only accept OAuth or no authentication (ChatGPT and Claude custom connectors) cannot
send a static key. Those need OAuth, which this endpoint does not offer yet.

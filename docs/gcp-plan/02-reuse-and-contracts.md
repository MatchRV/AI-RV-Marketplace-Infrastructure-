# Reuse, and what must not change

## Reuse instead of rebuilding

| Already built | Keep it for |
| --- | --- |
| Node service on the VM, Caddy, `/opt/matchrv` | Web, API, and MCP. Cloud Run is the wrong home for `/var/data` (inquiries, learned facts, shopper fit, clicks). The 2026-11-08 runbook already rejected that move. |
| In-memory snapshot plus `snapshot-reload.ts` | Fallback and rollback after SQL exists. Do not delete the file path or the loopback reload routes. |
| `querySnapshotListings` response | `{ listings, total, offset, limit }` with the same query names (`type`, `make`, `state`, price, year, sleeps, length, feature flags, `search`, `sort`). SQL changes where the rows come from, not this JSON. |
| `POST /api/swipe/deck` | Same body and the same card fields. Pool size 60 and the per-dealer cap stay. SQL only narrows the corpus before `runSearch`. |
| `runSearch` / `evaluateUnit` in agent-core | Ranking and hard filters. PR #66 already proved a SQL prefilter can feed this code and match snapshot results. Port that approach. Do not write a second ranker. |
| PR #66 schema ideas | `inventory.snapshots`, compressed unit payload, typed filter columns, partial indexes, loader that activates one snapshot in a transaction. Retarget the connection string at Cloud SQL. Do not merge the Supabase project wiring. |
| PR #115 host split | Consumer `matchrv.com` and dealer `dealer.matchrv.com` on this same process. This plan does not redraw that map. |
| Clerk | Sign-in for favorites. Cookies stay host-only until Jonathan says otherwise (open item on PR #115). |
| Inquiry files, safety sweep, `/api/out` redirect | Lead delivery and click evidence. |
| `LOTLINK_CRM_WEBHOOK_URL` payload | The only CRM write in code. If HubSpot is fed today, it is on the other side of that webhook. Do not add a second CRM client in these phases. |
| PostHog collector and the GA4 tag | Same project, same event names. PR #115 adds `site_surface`. That property is additive. |
| Harvest job, GCS export, LotAI service | They already run. New work reads the export. It does not replace the scraper. |
| `payment-calc.ts` | The arithmetic, the "credit range is not an APR" rule, and the existing disclaimer. The 20% illustration is a default in front of this function, not a new formula. |

## Do not change

These are contracts. A phase that needs to break one of them stops and asks.

### MCP

- Paths: `https://matchrv.com/mcp` and `https://matchrv.com/mcp/v1`. Both hosts may receive them (PR #115). Neither path 301s.
- Tool **names**, **input schemas**, **titles**, and the consumer tool **descriptions** in `mcp.ts` and `mcp-v1.ts`.
- `search_rvs` still returns a shortlist. It still must not quote how many units matched.
- `prepare_*` still sends nothing. `send_*` still requires the confirmation token and explicit approval.
- Unknown `attribution` arguments stay accepted and stripped from the published schema, as `docs/lead-tracking/ATTRIBUTION_CONTRACT.md` describes.
- Server name `matchrv` on `/mcp` and `matchrv-inventory` on `/mcp/v1`.

### HTTP that partners and the site already call

- `GET /api/listings` query parameters and the `{ listings, total, offset, limit }` body.
- `GET /api/listings/:id`, `GET /api/search/filters`.
- `POST /api/swipe/deck` and `GET /api/swipe/units/:id`. Card objects keep dealer name off the deck and on the detail route.
- `GET /api/out` query (`unit` or `dealer`, `from`, `sid`, `alert`) and the `utm_source=matchrv&utm_medium=referral&utm_campaign=<from>` behavior. Do not call it from tests or monitors. It writes a click.
- `POST /api/inquiries` preview and confirm fields, including top-level `attribution`.
- `POST /api/funnel/events` types and the 202/404/429 behavior in the attribution contract.
- `POST /api/analytics/product` allowlist. Do not add event names in the shopping phases. `site_surface` stays a PostHog super property and a GA4 `page_view` parameter, which is what PR #115 already specified.
- `POST /api/leads` and the LotLink webhook JSON (`name`, `email`, `phone`, `make`, `model`, `budget`, `message`, `notes`).
- Listing URLs stay `https://matchrv.com/listing/{id}`.
- Loopback-only `/internal/reload-snapshot` and `/internal/snapshot-status`. They stay off the public internet.

### Attribution and flags

- Header names and allowed values in `docs/lead-tracking/ATTRIBUTION_CONTRACT.md` (`X-MatchRV-Client`, `X-MatchRV-Platform`, `X-MatchRV-App-Version`, `X-MatchRV-Session-Id`, `X-MatchRV-Device-Id`, `X-MatchRV-Anonymous-Id`, `X-MatchRV-Surface`).
- Lead sources: `native_ios`, `native_android`, `website`, `chatgpt_app`, `lotai`, `other_ai_agent`, `unknown`.
- Inquiry statuses: `delivered`, `queued_for_matchrv`, `failed`, `dry_run`.
- `LEAD_TRACKING_ENABLED` and `LEAD_CREDIT_ENABLED` stay at whatever production already set. This plan does not turn them on or off. Code defaults in the repo are off; the brief says production has them on. Both statements can stand. Do not "fix" that in a deploy.
- PostHog event names in `docs/product-analytics.md`: `mcp_protocol_request`, `mcp_tool_started`, `mcp_tool_completed`, `website_page_view`, `website_listing_view`, `website_card_viewed`, `website_inventory_attention`, `website_search_results`, `website_dealer_click`, `inquiry_outcome`.
- `$process_person_profile: false` and `identity_is_person: false`.
- GA4 measurement id stays the existing tag. `GA4_MP_ENABLED` stays off unless a separate approval turns it on (`.env.example` already says that).

### Brand and counts

- Public name is MatchRV. Do not introduce Discount RV in copy, prompts, watermarks, or bucket labels.
- Public RV counts come from the live `GET /api/listings` `total` (156,573 on 2026-11-27). Do not hard-code a count in marketing HTML.

### Data that stays put

- `/var/data` inquiry, session-memory, shopper-fit, learned-facts, and outbound-click files stay the source of lead truth until a later, separate migration is approved. Cloud SQL in this plan is for inventory query columns and shopper saves. It does not replace the inquiry JSON in the same change.
- Squarespace nameservers stay. No load balancer in these phases.

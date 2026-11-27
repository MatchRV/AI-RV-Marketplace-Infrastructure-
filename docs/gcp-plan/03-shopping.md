# Shopping: two hosts, full inventory, saves, compare, financing

Builds on PR #115. Does not replace it.

## Consumer and dealer

`https://matchrv.com` is the shopper: search, swipe, grid, compare, financing illustration, ask the dealer. `https://dealer.matchrv.com` is the dealer: visibility snapshot, audits, LotAI, booking. One Node process, one inventory, one lead path. The URL matrix, sitemaps, and rollback are already written in `docs/domain-split/` on that branch. When this plan is implemented, copy those docs forward. Do not invent a third host.

Shopper work lands on the apex pages PR #115 already keeps there: `/`, `/shop`, `/swipe`, `/listing/{id}`, `/saved`, `/account`. Dealer pages stay on the subdomain list in `docs/domain-split/URL-MIGRATION-MATRIX.md`. AI media, if it is ever shown to a dealer, is a dealer-host screen. Generated images never become the photo on a consumer listing card.

`/mcp`, `/mcp/v1`, `/api/*`, `/.well-known/*`, and `/ops/*` stay unredirected, as PR #115 specifies. Ops lead dashboard stays on the apex because its cookie is host-only.

## Grid at full inventory

What works today:

- The browser asks for a page (`limit` ≤ 100, `offset`).
- The server returns `total` so the UI can paginate.
- Filters are the query string `querySnapshotListings` already understands, plus `GET /api/search/filters` for the option lists (8 types, 853 makes, 49 states on 2026-11-27).

What does not scale:

- Every filter walks the photo-bearing row array and may cache up to 32 full result arrays (`RESULT_CACHE_MAX`). A broad sort caches every matching row, not a page.
- Warming that structure is part of reload, so it sits in the same heap as the raw snapshot.

Target, after phase 3:

1. SQL `WHERE` on typed columns for type, make, state, condition, price, year, sleeps, length, slides. `LIMIT`/`OFFSET` in SQL. `total` from `COUNT(*)` on the same predicate, or from a maintained count when the predicate is empty (the homepage total).
2. Feature flags that are sparse (outdoor kitchen, generator, and the rest of `matchesQuery`) are boolean columns, not a JSON scan, for the flags the grid already exposes.
3. Free-text `search` stays `ILIKE` on title, make, and model with a `pg_trgm` index, capped. Description search is the expensive one. Keep it, but do not let one search pin a 156k-row array in Node.
4. Sort keys stay `featured`, `price_asc`, `price_desc`, `newest`, `length_asc`, `length_desc`.
5. The JSON body stays identical, so the shop page and MCP do not learn a new listings shape.
6. Empty, error, and over-wide pages: `offset` past `total` returns `listings: []` and the real `total`. Invalid ranges stay 422 where swipe already returns 422. Grid today does not 422 on a bad price. Leave that behavior alone.

Indexes (eligible rows only, same idea as PR #66):

- `(rv_type, price_usd)`
- `(state)`
- `(brand_key)`
- `(year)`
- `(lat, lng)` for the swipe radius prefilter
- `GIN` trigram on `make`, `model`, `title`

The compressed full record (`unit_z` in PR #66) is loaded only for the page of ids just selected, plus any unit opened by id. Nationwide "show everything" never materializes 156k units in the API process.

## Swipe at full inventory

Keep the deck contract: location required, radius 5–3000, 60 cards, 6 per dealer, dealer name only on `GET /api/swipe/units/:id`.

`runSearch` over 156k units is the memory and CPU problem, not the 60-card response. Phase 3 prefilter in SQL with the same "drop only rows that certainly fail" rule PR #66 used (unknown specs stay in the candidate set). Stream candidates in snapshot order into the existing ranker. Stop once the deck has enough passing cards after the per-dealer cap (today the code already stops around `poolSize * 2` before photo checks). Photo HEAD checks stay, batched by 12.

Do not load the full corpus to compute `matched`. `stats.matched` may become a SQL count of the hard prefilter. If that number would change the website analytics event `website_search_results`, keep sending `result_count` as the card count (already the case) and `matched_count` as the prefilter count. Document the definition change in the phase 3 PR. Do not rename the event.

## Reload and the 502s

Cause, from code plus the brief:

1. Headroom check refuses the swap when 1.5× the decompressed size does not fit in the cgroup hard limit, host free memory, and V8 heap. On a ~615 MB file that ask is about 920 MB free **in addition to** the live process. The measured peak on a smaller file was already 2.2 GB RSS.
2. A client (the pull script, not in git) gives up at 60 seconds and restarts the unit.
3. Restart drops the listen socket. Caddy returns 502 until Node has read the snapshot again. The brief times that at about 30 seconds, five times a day.

Phase 1 (no new Google product):

- The pull calls `POST /internal/reload-snapshot?wait=0` (already returns 202) and polls `GET /internal/snapshot-status` until `reload.inProgress` is false. Restart only when `status` is `rejected` or the poll exceeds a limit longer than a successful warm (budget 3 minutes, not 60 seconds).
- Set Node's heap (`--max-old-space-size`) and systemd `MemoryMax` high enough for one snapshot. Do not raise `MemoryHigh` alone and expect the check to pass.
- On a 4 GB e2-medium, two full snapshots plus caches are the wrong target. Phase 1's job is to stop restarting when a reload can finish. If the headroom check still rejects, fall back to restart **once**, and treat phase 3 as the real fix rather than buying a bigger VM as the design.

Phase 3 removes the double copy: the API reads SQL. A new export is loaded by a one-shot job (the existing pull host, or a Cloud Run job that already exists for harvest) into a new `inventory.snapshots` row, then one transaction flips the active id. The API never parses a second 615 MB JSON. Rollback is `INVENTORY_SOURCE=snapshot` (the PR #66 flag, pointed at Cloud SQL instead of Supabase).

Keep the 10% unit-count guard on both the pull and the server.

## Favorites

| | Now | Planned |
| --- | --- | --- |
| Swipe likes | `localStorage` `matchrv_swipe_likes` | Still the guest store. On sign-in, merge into Cloud SQL. |
| Account heart | Clerk + integer listing id + Postgres that production does not run | String unit id, `UNIQUE (user_id, unit_id)`, join to the active snapshot for display. Sold or dropped units stay in the list with "no longer listed." |

Guest behavior does not require an account. The heart on a signed-in session writes SQL. `POST /api/listings/:id/save` today parses the id as an integer. That route is not a public partner contract (it 401s without Clerk and 500s without a database). Changing the id to the snapshot's string id is allowed. Do not reuse that path for MCP.

## Side-by-side compare

`CompareLikes` already compares likes that are still on this device. Extend it, do not add a second comparison model:

- Up to 4 columns, matching `compare_rvs` (2–4). More than 4 is a UI limit, not an MCP change.
- Rows stay published facts only. Unknown stays "Unknown." No guessed specs.
- Signed-in shoppers can save the set (`compare_sets` table: user id, ordered unit ids, created at).
- Opening compare still emits the existing funnel type `compare` when lead tracking is on. No new PostHog event name.
- The MCP tool `compare_rvs` is untouched. The website does not call it to render this table.

## Financing illustration

Keep `estimatePayment()`. Keep the rule that a credit range does not select an APR.

Add a disclosed illustration when the shopper has not typed a down payment, APR, or term:

| Assumption | Proposed default | Where it lives |
| --- | --- | --- |
| Down payment | 20% of the listed price | Config `FINANCE_DOWN_PCT=0.20` |
| APR | 7.99 | Config `FINANCE_APR_PCT=7.99` |
| Term | 180 months | Config `FINANCE_TERM_MONTHS=180` |
| Tax, fees, trade-in | omitted until the shopper types them | unchanged |

These three numbers are **not** a rate sheet. Jonathan picks them in [DECISIONS.md](DECISIONS.md) before any UI shows a monthly figure that the shopper did not type. Until then the calculator stays blank-APR, which is today's behavior.

The illustration and the shopper's own numbers both show this sentence, next to the monthly figure, every time:

> Estimate only. This is not a loan offer, a credit decision, or a dealer quote. It uses {downPct}% down, {apr}% APR, and {termMonths} months, and it leaves out taxes, title, fees, and trade-in unless you enter them. Your payment depends on the lender, your credit, and the contract you sign. MatchRV is not a lender.

If the shopper edits a field, the sentence switches "uses" to "uses your figures:" and lists the values actually in the math. The credit dropdown copy stays: no credit check, and MatchRV does not pick an APR from the range.

Do not send the illustration to the dealer as if it were a pre-approval. The inquiry payload may keep today's optional `payment_estimate` object when the shopper typed numbers. Label it as the shopper's estimate. Do not add the config defaults into the dealer email unless the shopper left those defaults on screen and the disclosure was visible. That is the default: if the illustration is on screen, the preview the shopper approves includes the same sentence.

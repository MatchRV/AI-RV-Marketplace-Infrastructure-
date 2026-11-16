# Product feed (OpenAI format)

MatchRV serves its inventory as a product feed in
[OpenAI's product feed schema](https://developers.openai.com/commerce/specs/file-upload/products),
one RV per line (JSON Lines). It is built for the "hosted URL" delivery option
in OpenAI's merchant portal.

## Turning it on

The feed is the whole inventory in one file, so it is off by default.

1. Generate a key of at least 24 characters, for example `openssl rand -hex 24`.
2. Set it as `PRODUCT_FEED_KEY` on the production service (Render → Environment).
3. Check the row counts:
   `curl -H "Authorization: Bearer <key>" https://matchrv.com/feeds/openai-products.meta.json`

Until the key is set, and for any request with a missing or wrong key, every
feed URL answers 404.

The key is accepted **only** in an `Authorization: Bearer <key>` header. It is
never read from the path or the query string, because URLs are written to
request logs (including Render's access log) and headers are not. Any other
path under `/feeds/` answers 404, and the AI-crawler log line prints every
`/feeds/…` path as `/feeds/[redacted]`.

## URLs

All three need `Authorization: Bearer <key>`.

| URL | What |
| --- | --- |
| `/feeds/openai-products.jsonl` | JSON Lines |
| `/feeds/openai-products.jsonl.gz` | the same file, gzipped |
| `/feeds/openai-products.meta.json` | row counts and skip reasons |

Responses are sent `Cache-Control: private, no-store`. To rotate the key, change
`PRODUCT_FEED_KEY` and update the token in the merchant portal.

## What a row contains

Required fields: `item_id` (the MatchRV unit id), `title`, `description`, `url`
(the MatchRV listing page), `brand`, `seller_name` (the dealership),
`image_url`, `availability`, `price`, plus `target_countries` and
`store_country`. Optional fields sent when known: `condition`,
`product_category`, `seller_url`, `additional_image_urls`, `weight` (dry weight).

Rules:

- **Price and availability** are what the dealer's site showed when MatchRV last
  saw the unit. The feed is as current as the inventory snapshot, not a live
  stock check.
- **Availability:** `available` → `in_stock`; `pending` (sale pending or on
  hold) → `out_of_stock`; unknown → `unknown`. Unknown is never sent as in stock.
- **Left out, not padded:** units with no price, no image, no brand or no title,
  units the dealer has taken down, and units marked sold.
- **No source information:** nothing in a row says how or where MatchRV got the
  record.
- **Checkout is off** (`is_eligible_checkout: false`). MatchRV does not sell RVs.
- **Which units:** with `INVENTORY_STATE_FRESHNESS` off, the feed uses the
  screened inventory computed at process start (stale listings by snapshot
  date, implausible prices and category conflicts held back), the same set
  `search_rvs` and `get_rv` use with that flag off. With the flag on, it uses
  the same request-time recheck the MCP tools use (`recheckForRecommend()`), so
  units MCP holds back are held back here too: unknown dealer state, sold, left
  the active set, and stale by the recheck's clock (wall-clock when
  `INVENTORY_FRESHNESS_WALL_CLOCK` is also on). `meta.json` reports which mode
  served it as `inventoryRecheck`.

## Submitting to OpenAI

This part is done by a person in OpenAI's Business Hub; the code cannot do it.
See [Submit product feeds](https://developers.openai.com/commerce/guides/submit-product-feeds):
claim the business, verify identity, choose United States / USD, then pick the
hosted HTTPS URL delivery method and give it the feed URL
(`https://matchrv.com/feeds/openai-products.jsonl.gz`) with the key as a Bearer
token.

**Unconfirmed:** OpenAI's public docs do not say whether hosted-URL delivery
can send an `Authorization` header (or any credential). If the portal only
takes a bare URL, this feed cannot be fetched by it as built. Do not put the
key back in the URL to work around that; use manual upload or SFTP delivery
instead (download the file with the header and upload it), or decide on a
different access scheme first.

Two things to settle with OpenAI before relying on it:

- MatchRV lists other dealers' inventory. The schema treats that as a
  marketplace offer (`seller_name` is the dealer); `marketplace_seller` needs
  feed setup on OpenAI's side.
- Whether vehicles are accepted in product discovery at all is OpenAI's call.

# Product feed (OpenAI format)

MatchRV serves its inventory as a product feed in
[OpenAI's product feed schema](https://developers.openai.com/commerce/specs/file-upload/products),
one RV per line (JSON Lines). It is built for the "hosted URL" delivery option
in OpenAI's merchant portal.

## Turning it on

The feed is the whole inventory in one file, so it is off by default.

1. Generate a key of at least 24 characters, for example `openssl rand -hex 24`.
2. Set it as `PRODUCT_FEED_KEY` on the production service (Render → Environment).
3. Check the row counts: `https://matchrv.com/feeds/openai-products.meta.json?key=<key>`

Until the key is set, and for any request with a missing or wrong key, every
feed URL answers 404.

## URLs

| URL | What |
| --- | --- |
| `/feeds/openai-products.jsonl?key=<key>` | JSON Lines |
| `/feeds/openai-products.jsonl.gz?key=<key>` | the same file, gzipped |
| `/feeds/openai-products.meta.json?key=<key>` | row counts and skip reasons |
| `/feeds/<key>/openai-products.jsonl[.gz]` | same feed with the key in the path, for a fetcher that drops query strings |

Responses are sent `Cache-Control: private, no-store`. To rotate the key, change
`PRODUCT_FEED_KEY` and update the URL in the merchant portal.

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
  and units the dealer has taken down.
- **No source information:** nothing in a row says how or where MatchRV got the
  record.
- **Checkout is off** (`is_eligible_checkout: false`). MatchRV does not sell RVs.
- The feed uses the same screened inventory as the ChatGPT app, so stale
  listings and implausible prices held back there are held back here.

## Submitting to OpenAI

This part is done by a person in OpenAI's Business Hub; the code cannot do it.
See [Submit product feeds](https://developers.openai.com/commerce/guides/submit-product-feeds):
claim the business, verify identity, choose United States / USD, then pick the
hosted HTTPS URL delivery method and paste the feed URL.

Two things to settle with OpenAI before relying on it:

- MatchRV lists other dealers' inventory. The schema treats that as a
  marketplace offer (`seller_name` is the dealer); `marketplace_seller` needs
  feed setup on OpenAI's side.
- Whether vehicles are accepted in product discovery at all is OpenAI's call.

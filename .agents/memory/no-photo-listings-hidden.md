---
name: No-photo listings hidden at API read layer
description: Why listings without images are filtered (not deleted) and which API queries must stay in sync
---

# No-photo RV listings are hidden via query filter, not deleted

Listings with an empty `images` array must never surface to users. This is enforced
with a SQL `where` condition (`images IS NOT NULL AND jsonb_array_length(images) > 0`)
on every user-facing listing **read** in `artifacts/api-server`, NOT by deleting rows.

**Why:** the daily RV Inventory Scraper re-upserts inventory, so any no-photo rows that
were deleted would simply come back on the next run. A read-time filter is durable and
self-healing — a listing becomes visible automatically once the scraper finds a photo.
The raw DB count therefore stays higher than what the API returns (startup log shows the
raw count, e.g. "Inventory OK — N listings"; the browse `total` is the filtered count).

**How to apply:** keep ALL listing-collection reads in sync — if you add a new endpoint
that returns lists of listings for display, add the same images filter. Easy to miss: it
must live on every feed, not just browse. Currently applied in `routes/listings.ts`
(`/listings` browse `conditions` + `/listings/:id` similar query), `routes/match-report.ts`
(candidate `conds`), `routes/user.ts` (`/user/saved` join), and `routes/outfitter.ts`
(raw-SQL recommendation where-clause — pushed as the string `jsonb_array_length(images) > 0`).
The single `/listings/:id` detail endpoint is intentionally NOT filtered (it has a fallback
image and may be reached by saved-listing / external links).

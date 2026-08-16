---
name: Lazydays URL filter and timeout
description: lazydays.com sitemap contains ~2000 category/model pages that all 403; individual listing pages end in a 6+-digit stock ID; per-dealer timeout was 300s (too short).
---

# Lazydays sitemap URL filter and per-dealer timeout

## The rule
- lazydays.com sitemap contains ~3005 URLs mixing individual listing pages and category/model pages.
- Category pages (e.g. `/rvs/2025-forest-river-work-&-play`, `/rvs/airstream-interstate-19x`) all return HTTP 403 — they are not individual listings.
- Individual listing pages always end in a stock ID: `-\d{6,}[a-z]{0,2}$` (e.g. `/rvs/tampa-fl/class-a/used/2024/entegra-coach-cornerstone-21171885`).
- Applying this filter in `scraper.py:scrape_dealer()` reduces 3005 → ~1032 URLs and raises success rate from ~26% to ~99%.
- The fix lives in `rv_inventory_scraper/scraper.py` after `ordered_detail_urls = sorted(detail_urls)`.

## Timeout
- The original per-dealer timeout was hardcoded at 300s (5 min) in `pipeline.py`.
- With 3005 URLs + proxy failures + browser fallback, lazydays takes ~12 min, causing the timeout to fire and discard all results.
- Timeout is now read from `DEALER_SCRAPE_TIMEOUT` env var, defaulting to 1800s (30 min).
- With the URL filter, lazydays completes in ~54 seconds.

**Why:** Both problems together caused lazydays inventory to be wiped on every scrape run (timeout → 0 listings → mark_dealer_complete with 0 → finalize deletes all).

**How to apply:** If lazydays scrape times out or returns 0 listings, check: (1) is the stock-ID filter in place? (2) is DEALER_SCRAPE_TIMEOUT set to at least 1800?

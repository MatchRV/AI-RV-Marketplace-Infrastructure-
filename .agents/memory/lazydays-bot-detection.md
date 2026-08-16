---
name: Lazydays bot detection pattern
description: Known behavior of lazydays.com scraping — frequent 0-result pages, recovery patterns
---

## Pattern

lazydays.com (Tampa, FL — large national dealer, ~1,384 listings) has aggressive bot detection. The sitemap returns 3,012 URLs. Individual detail page fetches succeed initially but may return 0-parse results mid-scrape.

**Observed rates:** ~29 valid per 100 pages at start; rate can drop to 0 if bot detection kicks in hard.

## Recovery

- Use `DEALER_FILTER=lazydays SKIP_FINALIZE=true STARTUP_SYNC_THRESHOLD_HOURS=0` env vars
- Restart the scraper scheduler workflow
- After recovery completes, clear those env vars and restart again
- The next regular 3AM cron will re-scrape lazydays normally and update `last_run_id` so listings survive `finalize_run`

## Proxy

Bright Data residential proxy (`brd.superproxy.io:22225`) is enabled and should be sufficient for lazydays. If scraping still fails, check proxy credentials/quota.

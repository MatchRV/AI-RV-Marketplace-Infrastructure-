---
name: RV Scraper lessons
description: Playwright setup quirks, crash-safety pattern, and scraping architecture for the MatchRV inventory scraper
---

## Per-dealer incremental DB writes (crash-safety)

**Rule:** `run_full_sync()` must write each dealer's listings to DB immediately after that dealer finishes, not in a batch at the end of all dealers.

**Why:** Replit container restarts (checkpoints, idle sleep) kill long-running processes. A full run of 70 WA dealers takes 3-4 hours — longer than any container will reliably survive. Without incremental writes, every restart resets the DB to stale data.

**How to apply:** `pipeline.run_full_sync()` loops `scraper.scrape_dealer(dealer)` per dealer, then calls `db.upsert_dealer(listings, run_id)` immediately. `db.finalize_run(seen_identities, run_id)` (mark-sold + refresh counts) runs only after all dealers complete.

## Playwright asyncio fix

**Rule:** Before `sync_playwright().start()` in `_get_browser()`, call `asyncio.set_event_loop(asyncio.new_event_loop())`.

**Why:** APScheduler runs jobs in threads that have no asyncio event loop. Playwright's sync API internally touches the loop and crashes without this.

## Browser semaphore

**Rule:** `_BROWSER_LAUNCH_SEM = Semaphore(3)` caps concurrent Chromium launches.

**Why:** 8 detail workers × ~50 threads/Chromium ≈ 400 threads, hitting the container thread limit. Capping at 3 concurrent launches prevents exhaustion.

## Sitemap/feed discovery order

Discovery order: sitemap.xml → /feed/inventory → /inventory.xml → HTML pagination → detail-URL pattern matching.

Poulsbo RV sitemap yields 900+ URLs; parse rate ~99.8% with v2 state-blob extraction.

## mark_missing_as_sold safety

`finalize_run()` must only be called after ALL dealers complete. If called mid-run, unseen dealers' listings get incorrectly marked sold.

## Table names

Main table: `listings` (not `rv_listings`). Key tables: `listings`, `dealers`, `rv_inventory_sync_state`, `rv_scraper_meta`.
`rv_scraper_meta` key: `last_completed_sync_at`.

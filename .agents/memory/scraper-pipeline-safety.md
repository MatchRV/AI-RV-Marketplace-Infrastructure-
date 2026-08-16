---
name: Scraper pipeline safety rules
description: Key lessons about the rv_inventory_scraper pipeline around data loss prevention and recovery
---

## Rule: mark_dealer_complete only after upsert commits

`mark_dealer_complete` must only be called if `upsert_dealer` succeeded (no exception). If the upsert raises (or the process is killed mid-transaction, causing a rollback), the dealer must remain un-marked so resume logic re-scrapes it on the next restart.

**Why:** A Replit deployment event SIGKILLed the process right after `mark_dealer_complete` committed but while `upsert_dealer` was in a rolled-back transaction. This left lazydays.com flagged "done" with 0 listings in the DB — the phantom "done" then persisted across all subsequent full-sync resumes, permanently blocking re-scrape within that run.

**How to apply:** Use a `db_write_ok` boolean flag. Set `True` only on successful upsert return. Set `True` also on the 0-listing protection branch (intentional skip). Gate `mark_dealer_complete` on `db_write_ok`.

## Rule: Safety guard for 0-result scrapes

When a dealer returns 0 listings, inject its existing live identities into `seen_identities` so `finalize_run` does not delete them. This prevents a bot-blocked scrape from mass-deleting inventory.

**Why:** The regular 3AM scrape got 0 results for lazydays.com (1,384 listings), finalize_run deleted them all. This dropped total inventory from 4,000+ to 2,751.

## Rule: SKIP_FINALIZE for targeted recovery

Use `SKIP_FINALIZE=true` + `DEALER_FILTER=<domain>` for single-dealer recovery runs. Prevents the targeted run's `finalize_run` from deleting other dealers' listings as "unseen."

**Why:** A single-dealer recovery run only populates seen_identities for that one dealer; running finalize_run would mark all other dealers' listings as sold.

**How to apply:** Set env vars `SKIP_FINALIZE=true`, `DEALER_FILTER=<domain>`, `STARTUP_SYNC_THRESHOLD_HOURS=0`, restart scheduler, then clear vars and restart again after recovery completes.

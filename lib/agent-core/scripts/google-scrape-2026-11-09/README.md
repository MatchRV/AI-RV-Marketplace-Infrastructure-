# Google Cloud dealer-website batch (2026-11-09/10)

Pipeline that produced `data/inventory.snapshot.json.gz` = base 25630ad (131,718 units, unchanged) + 3,416 new units.

1. `scrape_main.py` (Cloud Run job, Gemini 3.1 Flash-Lite): read public dealer inventory results pages (robots.txt respected, honest UA `MatchRV-InventoryPilot/0.2`, 2.5 s per host). 24,796 units from 632 dealers.
2. `clean.py` (+ `brandmap.mjs`, which uses `src/brands.ts`): canonical makes, non-RV / by-owner / rental exclusions, the same admission rules as `build-harvest-snapshot.ts`, and dedupe against the committed snapshot (VIN, dealer domain + stock, listing URL). 5,923 candidates.
3. `fetch.py` → `parse.py` → `select_build.py`: re-read every candidate's own listing page (no LLM). Gets the unit's own photos (site-wide images removed), sold/pending status, VIN/stock and price confirmation, and reviews same-dealer/year/model/trim collisions against live. 4,883 rows.
4. `KEEP_BASE=1 npx tsx scripts/build-harvest-snapshot.ts rows.ndjson stats.json`, then `harvest-2026-10-31/typefix.py`, `postfix.py` and `newpost_gscrape.py`. Base units are carried exactly.
5. `cityfix.py`: lot strings like "City ST" are split; new units whose lot city does not geocode in the stated state are held (249). Then `build-dealer-city-coords.ts`.

Stats: `data/google-scrape-2026-11-09.stats.json`.

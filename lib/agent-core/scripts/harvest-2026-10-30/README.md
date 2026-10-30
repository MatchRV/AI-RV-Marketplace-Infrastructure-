# 2026-10-30 inventory harvest (tooling as run)

Run from a box with the MarketCheck key files and EXPERIENTIAL_LABS_API_KEY in the environment (keys are read, never printed or logged).

1. `mc_harvest_new.py` — MarketCheck `/v2/search/rv/active` for dealer domains not in the Oct 14 network, largest first; year/make facets split dealers over the 500-row paging cap; dealers whose makes are <40% known RV makes are skipped. Calls/quota logged to `logs/mc_calls.jsonl` (`mccall.py`).
2. `web_refresh.py` — repo `rv_inventory_scraper` on network dealer sites: robots.txt enforced, 1.5 s per request, 1 worker per host, no proxy, no browser, a dealer is dropped after repeated blocks / Cloudflare challenges (never bypassed).
3. `site_probe_v2.py` — robots + homepage readability probe for sizing.
4. `dealer_info.py` — dealer name/city/state for website-only domains (Oct 14 snapshot → MarketCheck dealer → dealer homepage schema.org address).
5. `luna_specs.py`, `luna_category.py` — GPT-6 Luna reads specs / the dealer-stated RV category from the unit's own listing page. Kept only when the returned quote is on the page and contains the value (category also needs a label such as "Type:"); per-call model/tokens/cost logged.
6. `prepare_raw.py` → `raw_records.ndjson`; then `tsx scripts/build-harvest-snapshot.ts raw_records.ndjson stats.json`.

Stats of the committed build: `data/harvest-2026-10-30.stats.json`.

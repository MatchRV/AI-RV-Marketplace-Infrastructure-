---
name: Inventory package importer & type inference
description: How bulk CSV inventory packages get imported and why blank unit_type needs 3-tier inference
---

# Bulk inventory package imports

`scripts/import_inventory_package.py` maps external CSV packages (dealers/listings/photos)
into the existing dealers+listings schema, mirroring the API import route's rules
(dealer upsert by domain, listing upsert by VIN else title+dealer_id, price 1k–2M required).

**Key lessons:**
- Dealer-feed CSVs commonly ship with ~94% blank `unit_type`. Resolve types in 3 tiers:
  (1) model-line map from existing DB rows (make+model → dominant type),
  (2) keyword heuristics on title/model/url, (3) LLM classification of *unique*
  make+model combos (≈1.1k combos covers 6.9k rows), cached to a JSON file so re-runs are free.
- The AI-integrations Anthropic proxy rejects public model aliases (`claude-3-5-haiku-latest`
  → 400 UNSUPPORTED_MODEL). Only skill-listed names work, e.g. `claude-haiku-4-5`.
- On re-run UPDATEs, keep the existing `market_value` and derive deal fields from it —
  recomputing the randomized market value each run churns data and breaks idempotency.
- Images on UPDATE only fill empty arrays by default: thin package photo sets must not
  clobber scraper galleries. For photo-refresh packages, run with `REPLACE_IMAGES=1` to
  overwrite matched listings' images with the package's cleaned set.
- Delete-and-replace imports (`scripts/replace_import_task45.py`) must delete matching
  `rv_inventory_sync_state` rows before deleting listings, or the scraper resurrects them.
  Package dealer IDs are CSV-local — always remap by domain, with name-based overrides for
  dealers sharing a domain (multi-location chains like Blue Compass / Puyallup RV).
- The `listings` table has NO uniqueness constraint on vin or (title, dealer_id);
  ~559 duplicate-VIN pairs predate July 2026 imports and come from the scraper path.

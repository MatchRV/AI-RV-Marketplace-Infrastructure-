# AI Enrichment Pipeline

> **Status:** Designed 2026-04-27. Deploy Prompt 1 to Replit before Filter UI.
> **Dependency:** Must be deployed BEFORE the filter UI — filters depend on these new columns.

## Purpose

The scraper collects 68 fields per listing, but many buyer-facing features (outdoor kitchen, solar, bed size, fireplace, etc.) are buried in free-text `description` and `features` fields. The enrichment pipeline runs a Claude Haiku call on each listing to extract structured boolean/enum fields that can be filtered and searched.

## How It Works

```
New listing scraped
        |
        v
  Inserted into DB with enrichment_version = 0
        |
        v
  Enrichment job runs (hourly or manual trigger)
        |  Reads description + features + specs
        |  Sends to Claude Haiku for extraction
        v
  Extracted fields written back to listing
        |  outdoor_kitchen, solar_ready, bed_size, etc.
        |  boondocking_score calculated
        |  enrichment_version = 1
        v
  Listing now fully filterable
```

## New Columns Added (22 total)

### Feature Extraction (from Claude Haiku)
| Column | Type | Description |
|--------|------|-------------|
| `outdoor_kitchen` | boolean | Has outdoor kitchen |
| `solar_ready` | boolean | Pre-wired for solar |
| `solar_installed` | boolean | Solar panels installed |
| `bed_size` | text | king, queen, full, twin, unknown |
| `has_fireplace` | boolean | Electric or gas fireplace |
| `pet_friendly` | boolean | Pet-friendly features mentioned |
| `rear_bedroom` | boolean | Rear bedroom floorplan |
| `rear_living` | boolean | Rear living room floorplan |
| `front_kitchen` | boolean | Front kitchen floorplan |
| `theater_seating` | boolean | Theater-style seating |
| `island_kitchen` | boolean | Island kitchen layout |
| `walk_around_bed` | boolean | Walk-around bed (vs wall-side) |
| `outdoor_shower` | boolean | Exterior shower |
| `outdoor_speakers` | boolean | Exterior speakers |
| `backup_camera` | boolean | Backup/rear camera |
| `hydraulic_jacks` | boolean | Hydraulic leveling jacks |
| `power_awning` | boolean | Power awning (vs manual) |
| `enclosed_underbelly` | boolean | Enclosed/heated underbelly |
| `heated_tanks` | boolean | Heated holding tanks |
| `four_season` | boolean | 4-season / winter-rated |
| `hitch_type` | text | bumper_pull, gooseneck, fifth_wheel, none |

### Calculated Fields
| Column | Type | Description |
|--------|------|-------------|
| `boondocking_score` | integer | 0-100 composite score |
| `enrichment_version` | integer | Tracks which enrichment version was applied |
| `enriched_at` | timestamp | When enrichment last ran |

## Boondocking Score Calculation

| Condition | Points |
|-----------|--------|
| Generator OR solar installed | +25 |
| Solar ready (but not installed) | +15 |
| Fresh water >= 40 gal | +20 |
| Fresh water >= 60 gal | +10 (additional) |
| Enclosed underbelly | +10 |
| Heated tanks | +10 |
| Four season rated | +10 |
| Gray water >= 40 gal | +5 |
| Black water >= 30 gal | +5 |
| **Max possible** | **100** |

A listing with `boondocking_score >= 60` is considered "Boondocking Ready" in the filter UI.

## Hitch Type Inference

If Claude can't determine hitch type from the description, it's inferred from `rv_type`:
- Fifth Wheel → `fifth_wheel`
- Travel Trailer / Toy Hauler → `bumper_pull`
- Class A / B / C → `none` (motorhome)

## Cost

- **Model:** Claude Haiku (claude-haiku-4-5-20251001) — cheapest, fast, perfect for extraction
- **Cost per listing:** ~$0.001
- **Full inventory (500 listings):** ~$0.50
- **Runs once per listing** (unless description changes)

## Deployment

1. Run DB migration to add new columns
2. Deploy enrichment service
3. Trigger `POST /api/admin/enrich` to backfill existing inventory
4. Enrichment runs automatically hourly for new listings after that

## Replit Prompt

See [[Replit Prompts#Prompt 1 — AI Enrichment Step]]

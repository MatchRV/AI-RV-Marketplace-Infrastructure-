# Washington State Dealer Inventory

> Last updated: 2026-04-26

## Inventory Counts (Checked 2026-04-26)

| Dealer | Location | Inventory | Source |
|--------|----------|-----------|--------|
| Fife RV Center | Fife + Port Orchard, WA | **166 RVs** | fifervcenter.com |
| Tacoma RV | Tacoma, WA | **~60-70 RVs** (estimated from pagination) | tacomarv.com |
| Johnson RV | Fife, WA | **100+ RVs** (advertised) | johnsonrv.com |

## Dealers in Scraper (71 total)

The `wa-rv-dealers.json` file contains 71 Washington state dealers. Format:
```json
{"name": "Dealer Name", "city": "City, WA", "url": "https://..."}
```

### Key Dealers to Watch

**Fife/Tacoma Area (our primary market):**
- Fife RV Center (Fife + Port Orchard) — 166 units, 10-acre lot, 15 years in business
- Johnson RV (Fife) — 100+ units, large indoor showroom, carries Winnebago/Coachmen/Renegade
- Tacoma RV — ~60-70 units, Keystone dealer (largest in WA), also Forest River/KZ/Winnebago
- Baydos RV Center (Fife) — fifth wheels, travel trailers, campers
- RV Country (Fife) — towables focus
- Camping World (Fife) — national chain, large selection

**Brands by Dealer:**

| Dealer | Key Brands |
|--------|-----------|
| Fife RV Center | Coachmen, Cruiser RV, East to West, Fleetwood, Forest River, Gulf Stream, Newmar, Pacific Coachworks, Prime Time |
| Johnson RV | Winnebago, Renegade RV, Coachmen, Midwest Automotive Designs |
| Tacoma RV | Keystone, Forest River, KZ RV, Venture RV, Winnebago |

**RV Types Available:**

| Type | Available At |
|------|-------------|
| Class A | Fife RV, Camping World |
| Class B | Johnson RV (Winnebago/MAD vans) |
| Class C | Fife RV, Johnson RV, Camping World |
| Fifth Wheel | All dealers |
| Travel Trailer | All dealers |
| Toy Hauler | Fife RV, Tacoma RV, Camping World |
| Truck Camper | Fife RV |

## Scraper Coverage

**Status:** Scraper is operational (`lotlink-scraper/`), writes JSON per dealer domain.

**Data quality fields:**
- `extraction_confidence`: high, medium, low
- `extraction_notes`: array of issues encountered
- `field_sources`: maps each field to where it was extracted from

**Tracking:**
- `_first_seen` / `_last_seen` — inventory freshness
- `_removed_at` — detects sold/removed units
- `_price_history` — tracks price changes over time

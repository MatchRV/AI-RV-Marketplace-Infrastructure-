# Poulsbo refresh and Johnson RV Fife, 2026-11-07

Public reads only. No snapshot edit, no MarketCheck, no challenge bypass. Prices are the feed's offer (`sale_price`, or `price` when that is the only figure). `regular_price` is not used when it is higher than the offer. `callforsaleprice` is a hold.

## Poulsbo RV (`poulsborv.com`)

Source: `GET https://www.poulsborv.com/wp-json/pbrv/api/v1/products` (HTTP 200). `robots.txt` does not disallow that path.

| | Count |
|---|---:|
| Feed rows | 743 |
| Already in the 2026-11-03 snapshot (VIN or Poulsbo stock) | 681 |
| Net-new admitted (`WA/poulsborv.com.csv`) | 57 |
| Held (`held/WA/poulsborv.com.csv`) | 5 |

Holds: 3 `callforsaleprice` (the regular figure was not taken as a sale price), 2 with no new/used condition.

The net-new Class A is stock `S1068A`, VIN `1F65F5DN6N0A14566`, 2023 Thor Windsport, Everett, price `109995` (the feed's only figure; not a separate MSRP). Lots on the 57 rows: Everett 16, Mt. Vernon 16, Kent 13, Sumner 12. Dealer type strings are copied as published, including `DestinationTrailer`, `Camper`, and `Toy Hauler,Travel Trailer`.

## Johnson RV Fife (`johnsonrv.com`)

Stopped. `robots.txt` allows the collection page and disallows `/inventory-feed.*` and `/internal/inventory`. `https://johnsonrv.com/collections/fifewa` is HTTP 200 and contains a Class A filter button and no 17-character VIN. The unit list is not in that HTML. The feed URL was not requested. No Ridemotive API call.

## Not tried

Fife RV Center returned HTTP 429 with a Vercel challenge on 2026-11-07. Not bypassed. Other uncovered WA rows are cargo dealers, prior CSO holds, robots 403s, or pages that already failed the facts-only field check.

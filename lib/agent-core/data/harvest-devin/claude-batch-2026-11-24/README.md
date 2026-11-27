# Claude harvest batch 2026-11-24

Pitched-dealer pass for Jonathan (Nov 24). Read with the project's remote browser (public pages only, robots.txt checked first, >=2 s between loads, no sign-in, stopped at every block or human check). Units with no VIN/stock or no photo cannot be admitted by `build-harvest-snapshot.ts`, so those dealers have header-only CSVs; their logs list what the site shows.

| dealer | result | in snapshot |
|---|---|---|
| Cascade RV (cascadervpdx.com), Tualatin OR | ok: 22 RV rows (1 boat excluded); 12 rows' VIN/stock/photo/type carried from the same listing URL in #78 (read 2026-11-06), price + live status read 2026-11-24 | 18 |
| QRV's LLC (qrvsllc.com), Milwaukie OR | 3 unsold of 37; pages say "VIN not provided", Stock N/A | 0 |
| Center Street Ridez (centerstreetridez.com), Eugene OR | 29 RVs, no VIN/stock/photo URL; footer forbids republishing (reviewer call) | 0 |
| Summit RV (summit-rv.com), Junction City OR | ~52 units, no VIN/stock/price/photo URL | 0 |
| Kenai Coach (kenaicoach.com), Eugene OR | 9 consignment motorhomes with stock #, but no readable photo URL; 6 show two prices | 0 |
| Pacific Travel Center (pacifictravelcenter.com), Tacoma WA | 3 Wix products, 2014 units, $0.00, store sitemap 2018 -> stale | 0 |
| Southern Idaho RV & Marine (soidrvmarine.com), Jerome ID | Cloudflare check on the first inventory page; not attempted | 0 |
| Truck City RV Sales (truckcityrv.com), Sumner WA | homepage loads; /rvs-for-sale returns a Cloudflare block (dealerMe platform) | 0 |
| Valley RV Supercenter, RV Outlet (refresh only) | robots.txt 403 / Cloudflare check; not refreshed | held as before |

Backlog built in the same snapshot (CSVs already in the repo or on the data/devin-harvest-* branches, never built before): Lewiston RV 33, Beaver Coach Sales 33, Oregon RV Outlet 25, Motorhomes 503 8. lastSeen = the date the page was read (2026-11-05/06), so they leave MCP search after 30 days unless re-checked. Not admitted: RV Outlet (81, no price), Roseburg/Clarks/Dorn/Just Used Cars/Carstars (no dealer-stated type or lot city), LVC (no price), Comrie (Hermiston) and Sundance (Shelton) held by cityfix: those cities are not in dealer-city-coords.ts (gazetteer not reachable from this sandbox). valleyrvsupercenter.com and wilderrvs.com stay in HOLDBACK_DOMAINS.

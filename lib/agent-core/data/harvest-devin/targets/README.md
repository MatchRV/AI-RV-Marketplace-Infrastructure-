# Devin harvest targets (MatchRV)

Sources (local only, nothing pushed):
- Inventory: `lib/agent-core/data/inventory.snapshot.json.gz` at re-check branch `data/recheck-2026-11-02` @ 75cff6b (built 2026-11-03T05:20Z, 131,726 units loaded, 1,474 dealer records). Repo main @ 0587f89.
- Searchable = units that pass `screenMcpInventory()` after the server loader `getInventory()` (what the MCP serves from branch data/recheck-2026-11-02): 129,265 (re-check build, not yet deployed; public line stays 128,174). Was 129,273: 8 units stored condition=new with model years 2005-2022 (7 findlaytruckrvsales.com + 1 sunandfunrvs.com) had been demoted to used by `reconcileYearAndCondition()` at load; per CSO ruling 2026-11-04 they are now held as condition_unverified (removed from the snapshot), so the server path and `harvest-2026-10-30/windows.py` agree at 129,265.
- WA list: `/workspace/harvest-2026-11-01/out_t5/wa_dealers_uncovered.csv` (82 rows), minus 6 domains already covered or held (tacomarv, danderv, seattleairstream, awesomerv, selkirkrv, suncityrv) = 76.
- 2026-11-04 (CSO): Airstream Adventures NW (seattleairstream.com) re-added as `under_covered` (snapshot 58 units for the domain: 18 WA / 24 OR / 16 NV lots, vs ~454 MC WA listings). Sun City RV (bot wall), DandE RV (call-for-price, Jonathan's call) and Tacoma RV Center (held, MAP) stay out. WA list now 77 rows.
- OR / ID lists (`or_dealers_uncovered.csv` 5 rows, `id_dealers_uncovered.csv` 4 rows; built by `build_or_id.py`). Same columns with or_/id_ prefixes. Universe = local data only: MarketCheck 2026-10-30 new-dealer pull (`harvest-2026-10-30/mc/new_dealers.jsonl`, OR/ID dealer.state) + local dealer directory (`wt-harvest/scripts/src/dealers.json`, `attached_assets/dealers_*.csv`) minus covered_domains / snapshot domains. Excluded: johnsonrv.com (bot wall in WA run), Camping World, rental (cruiseamerica, rentrv), repair-only (Wilson's RV Repair), bluedogrv.com (= Blue Compass, covered). Under-covered flag not computable for OR/ID: no local per-dealer OR/ID listing counts for covered dealers (WA had an MC source facet; OR/ID do not). Universe is thin vs WA (116 curated dealers) - see gaps.

Files: `covered_domains.csv` (skip these), `wa_dealers_uncovered.csv` (targets), `state_counts.csv` (searchable units / distinct domains by lot state, thinnest first).

## Devin output format
One CSV per dealer: `lib/agent-core/data/harvest-devin/<state>/<dealer-domain>.csv`, UTF-8, header:
`listing_url,vin,stock_number,year,make,model,floorplan,rv_type,condition,price,price_label,status,lot_city,lot_state,photo_url,dealer_name,dealer_domain,seen_at`
- price: plain number (no $ or commas) or blank. price_label: exact words on the page.
- condition: new/used/unknown. status: available/sale_pending/on_order.
- seen_at: UTC ISO, e.g. 2026-11-05T18:30:00Z. Blanks stay blank (no N/A, no guesses).
- Plus one `dealers.csv` per batch: `dealer_domain,dealer_name,city,state,result,units,reason` (result ok/blocked/failed).

## Rules
- No price: MSRP, List, MAP, Retail, finance-only or payment-only, "call for price", "unlock pricing", $0. Leave price blank, keep the label.
- Sold units skipped; Sale Pending / On Order kept and marked.
- Condition from the page heading/URL, never the title. RVs only (no cars, trucks, SUVs, boats).
- Respect robots.txt, >=1.5 s between requests per host, stop and log at bot walls/Cloudflare/captcha.
- No Camping World, Craigslist, Facebook Marketplace. No API keys.
- Branch `data/devin-harvest-<date>` only; never touch snapshots or main; open a PR, never merge.


## National list (2026-11-04, built 16:50-17:15 PT, local only)
Approved by Jonathan 2026-11-04 16:40 PT ("we need to hit the entire country"); priority change 16:52 PT.

**Sources**
- MarketCheck `/v2/search/rv/active` with the same params as the WA pull (`country=US, state=XX, rows=0, facets=source|0|1000,dealer_id|0|1000`), one call per state for 49 states + DC -> `mc_nat/raw/XX.json`. WA reuses the 2026-11-01 pull (`harvest-2026-11-01/mc/wa_facets.json`). Southern CA split: 2 extra calls, CA + 100-mile radius around (34.1,-117.7) and (32.8,-116.9) -> `mc_nat/raw/CA_south.json`; a 200-mile try was rejected 422 (plan radius limit 100 mi) but still counted against quota.
- **MarketCheck calls used: 53** (52 OK + 1 rejected). Quota remaining after run: east 472, az_ca 474 (from `quota-remaining` header; no overage, no plan change). Log: `mc_nat/logs/mc_calls.jsonl` (no keys).
- Ours: snapshot units per (domain, lot state) streamed from `inventory.snapshot.json.gz` at 75cff6b (raw loaded units, 131,718, not the 129,273 searchable count) -> `mc_nat/snap_counts.json`. Covered set = `covered_domains.csv`.
- Names/cities: local data first (MC 2026-10-30 dealer records, wt-harvest dealer directories, dealer_locations.json, snapshot); the rest from each dealer's homepage `<title>`/og:site_name (robots.txt checked, 1.6 s between the 2 requests per host, honest UA, no bypass) -> `mc_nat/homepage_names.json`: 767 ok, 50 bot wall, 51 robots 403/disallow, 76 unreachable or HTTP error. 178 rows still have no name; city is blank where local data has none (Devin reads it on site).
- No Exa, no Firecrawl, no rvresources fetch, no Craigslist/FB/Camping World.

**Rules**: skip covered domains; `under_covered` = covered domain where MC in-state listings > 2x our in-state units and gap >= 50, and nationally MC > 1.5x ours with gap >= 50. Chains (Blue Compass, Bish's, Campers Inn, Bretz...) MC often files multi-state lots under one state (Blue Compass 9,179 in MT), so a chain's summed gain is capped at its national gap. Sibling domains with identical MC feeds (e.g. markquartrv*) collapsed to one. Excluded (`national_excluded.csv`, 90): Camping World/Gander (domain or name), CL/FB/boat sites, aggregators, rentals, repair-only, cargo-trailer dealers from the 10-30 analysis, worktrucksolutions, bot-wall/held dealers (Johnson RV, Sun City RV, Tacoma RV Center, DandE RV), group dups of covered. Rows flagged in `detail`: homepage bot wall (do not bypass), robots block, "check RV share (trailer dealer)".
- WA = the curated 77-row file unchanged; its gain counts only rows Devin could plausibly add (not no_website/bot_wall/robots/not_rv/merged/out_of_business/cso_holdback).
- OR / ID files rebuilt from MC (replaces the thin 5/4-row lists).

**Priority order (national_targets.csv `priority_rank`)**: WA, OR, ID, then winter-buying south AZ, FL, TX, CA-south, NV, NM, GA, SC, AL, LA, MS, then everything else (incl. CA-north) by estimated units gained. Within a region, by estimated gain.

**Totals (all units figures are MarketCheck estimates, not verified counts)**: 1,118 target rows (994 uncovered, 124 under-covered; 57 directory-only with no MC count). MC listings at targets 108,239; estimated units gained (MC minus ours) 95,985. MC counts include units that will fail our facts-only rules (MSRP-only, call-for-price, sold), so real adds will be lower.

| rank | region | rows | uncovered | under_covered | est. gain (MC) |
|---|---|---|---|---|---|
| 1 | WA | 77 | 76 | 1 | 819 |
| 2 | OR | 36 | 35 | 1 | 1,889 |
| 3 | ID | 22 | 20 | 2 | 1,930 |
| 4 | AZ | 33 | 26 | 7 | 1,806 |
| 5 | FL | 63 | 55 | 8 | 9,547 |
| 6 | TX | 86 | 70 | 16 | 7,744 |
| 7 | CA-south | 52 | 51 | 1 | 2,260 |
| 8 | NV | 10 | 9 | 1 | 622 |
| 9 | NM | 14 | 13 | 1 | 611 |
| 10 | GA | 25 | 22 | 3 | 1,492 |
| 11 | SC | 20 | 19 | 1 | 1,081 |
| 12 | AL | 18 | 16 | 2 | 5,194 |
| 13 | LA | 7 | 4 | 3 | 753 |
| 14 | MS | 9 | 9 | 0 | 315 |
| 15 | MT | 8 | 6 | 2 | 10,301 |
| 16 | WI | 26 | 20 | 6 | 5,036 |
| 17 | IN | 35 | 31 | 4 | 3,768 |
| 18 | CA-north | 45 | 40 | 5 | 3,660 |
| 19 | UT | 27 | 26 | 1 | 2,968 |
| 20 | NH | 6 | 4 | 2 | 2,903 |
| 21 | MI | 44 | 38 | 6 | 2,743 |
| 22 | MN | 28 | 23 | 5 | 2,513 |
| 23 | OH | 42 | 38 | 4 | 2,484 |
| 24 | ND | 15 | 11 | 4 | 1,944 |
| 25 | PA | 36 | 32 | 4 | 1,848 |
| 26 | NC | 30 | 28 | 2 | 1,730 |
| 27 | KY | 14 | 11 | 3 | 1,680 |
| 28 | TN | 15 | 13 | 2 | 1,641 |
| 29 | NJ | 8 | 5 | 3 | 1,453 |
| 30 | VA | 19 | 17 | 2 | 1,396 |
| 31 | CO | 32 | 31 | 1 | 1,272 |
| 32 | MO | 31 | 28 | 3 | 1,198 |
| 33 | OK | 22 | 19 | 3 | 1,101 |
| 34 | NY | 25 | 23 | 2 | 968 |
| 35 | NE | 16 | 15 | 1 | 927 |
| 36 | IL | 14 | 14 | 0 | 870 |
| 37 | MD | 7 | 6 | 1 | 807 |
| 38 | SD | 9 | 7 | 2 | 807 |
| 39 | VT | 6 | 5 | 1 | 749 |
| 40 | AR | 10 | 9 | 1 | 711 |
| 41 | IA | 23 | 22 | 1 | 618 |
| 42 | ME | 10 | 9 | 1 | 555 |
| 43 | WV | 9 | 7 | 2 | 416 |
| 44 | MA | 7 | 6 | 1 | 198 |
| 45 | KS | 8 | 7 | 1 | 184 |
| 46 | WY | 5 | 5 | 0 | 179 |
| 47 | AK | 4 | 3 | 1 | 178 |
| 48 | DE | 3 | 3 | 0 | 62 |
| 49 | CT | 4 | 4 | 0 | 33 |
| 50 | RI | 2 | 2 | 0 | 12 |
| 51 | HI | 1 | 1 | 0 | 9 |

**Top 15 by estimated gain (MC estimate)**
| priority_rank | state | name | domain | ours | MC | est. gain | reason |
|---|---|---|---|---|---|---|---|
| 473 | MT | Blue Compass RV - Pasco | bluecompassrv.com | 0 | 9179 | 8677 | under_covered |
| 169 | FL | Pop Rvs | popsells.com | 123 | 4058 | 3935 | under_covered |
| 439 | AL | Dream Finders. Rvs For Sale By Owner. Motorhomes | dreamfindersrv.com | 0 | 2707 | 2707 | not_harvested |
| 614 | NH | Campers Inn | campersinn.com | 349 | 2959 | 2610 | under_covered |
| 481 | WI | Quietwoods Rv Sales & services | kunesrv.com | 214 | 2134 | 1920 | under_covered |
| 587 | UT | Wasatch Trailer Layton | wasatchtrailer.com | 0 | 1531 | 1531 | not_harvested |
| 440 | AL | Great American RV SuperStores | airstreamhuntsville.com | 0 | 1478 | 1478 | not_harvested |
| 474 | MT | Bretz RV & Marine - Liberty Lake | bretzrv.com | 71 | 1325 | 1254 | under_covered |
| 170 | FL | OptimumRV Philadelphia | optimumrv.com | 1202 | 2823 | 1205 | under_covered |
| 232 | TX | (name n/a) | nationaltrailersource.com | 0 | 946 | 946 | not_harvested |
| 318 | CA | (name n/a) | carsontrailersales.com | 0 | 914 | 914 | not_harvested |
| 829 | TN | A L Rv Sales | alrvsales.com | 3 | 909 | 906 | under_covered |
| 233 | TX | Rv Wholesalers Llc | rvwholesalers.com | 44 | 948 | 904 | under_covered |
| 844 | NJ | Classic Rv Sales | classicrvsales.com | 0 | 884 | 884 | not_harvested |
| 692 | OH | Great Lakes Rv Center | greatlakesrvcenter.com | 0 | 746 | 746 | not_harvested |

Files: `<st>_dealers_uncovered.csv` (51; DC empty, CA has a `region` column), `national_targets.csv`, `national_excluded.csv`, `national_stats.json`, `build_national.py`, `mc_nat/` (pull.py, raw facets, logs, name probe).

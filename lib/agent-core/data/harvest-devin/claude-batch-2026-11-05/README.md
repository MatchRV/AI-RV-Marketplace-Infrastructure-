# Claude harvest batch 2026-11-05 (evening PT)

Input: `claude-rv-scrape-targets.csv` (20 WA/OR/ID dealers, built from the 2026-11-04 snapshot). Data only, no DB inserts, no snapshot changes.

## What was taken / skipped
- **Skipped as duplicates (9):** already in `data/devin-harvest-or-2026-11-04-1` (checked at 2026-11-05 ~19:25 PT). 5 harvested ok (rvoutletonline, rivercityrv, beavercoachsales, oregonrvoutlet, qrvsllc) and 4 logged blocked (rvtradesok, anydayrv, adventuretradingrv by robots; countryroadsrecreation by 403). Not retried.
- **Blocked (5):** Smith RV Idaho, Play More RV and Family Fun RV return a Cloudflare "Just a moment..." challenge to an honest request. Stopped there; the Decodo proxy was not used to get past it. Boise Airstream and IWS Sales robots.txt disallow ClaudeBot / Claude-Web / anthropic-ai (Content-Signal `ai-train=no`). Not crawled; Jonathan to decide.
- **Harvested (6):** Royal Coach, Lewiston RV, Sundance RV Center, Cascade RV, Mike's RV Sales, Annie's RVs.
- ID was next in Devin's queue (`progress.json`), and no Devin ID output existed at check time. Re-check before merging: lewistonrv.com could collide.

## Files
- `<STATE>/<domain>.csv`: eligible units (stated condition, status available). Header only for Mike's and Annie's (every unit held).
- `held/<STATE>/<domain>.csv`: same columns plus `hold_reason` and `page_label` (the exact page evidence). Keep these out of searchable inventory.
- `dealers.csv`: all 20 targets with result and reason.

## Rules applied
- Condition only from a unit-level dealer statement: a NEW badge or "New Class C" category (Royal), the "Used" menu category (Royal), the Condition attribute (Lewiston), page data `condition` agreeing with the New-/Used- URL (Cascade), and "BRAND NEW" in the heading or "these are pre-owned" in the description (Sundance). Never inferred from model year.
- Price is the advertised selling figure: Royal `SALE:` (asterisked on page, footnote not found) else `PRICE:`; WooCommerce current price (`Sale!` badge when struck through); Cascade `Internet`; Mike's `Sale Price`. MSRP / Retail / $0 / "Call for availability" left blank, with the label kept.
- Sold units omitted (Royal SOLD badge, Lewiston `Sold` tag). No Sale Pending or On Order wording was found at any harvested dealer.
- Non-RVs excluded (pickups, boats, a minivan, a box truck, a golf cart).
- VINs that fail the 17-character check are left blank. Example: Royal stock 1029A shows `1F66F5DY3BOA10615`, which contains an O.
- Requests: honest UA `MatchRVResearch/1.0`, robots.txt checked first, at least 2 s per host (10 s Royal, 30 s Lewiston per crawl-delay). Lewiston and Sundance were read from the WooCommerce Store API those sites serve publicly (1 request each).

## Review flags
- Royal stock 1204, 2026 Coachmen Entourage 340BH: listed only under the "Used" Class C menu category, with no NEW badge. Recorded as used per the dealer label; worth a human look.
- Sundance held list includes possible non-RVs: Stealth Titan SE 7X14+2, ATC PLA 4023, Tiny House Cottage Dual Loft.
- Make is blank where the dealer title does not separate it from the model. Floorplan is left blank everywhere: no dealer page labels it separately from the model name.

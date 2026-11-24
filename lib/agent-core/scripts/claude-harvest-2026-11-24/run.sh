#!/usr/bin/env bash
# Rebuild of the 2026-11-24 batch (no npm install needed: Node >=22.18 type stripping + ts-hooks.mjs maps .js imports to .ts).
# Inputs: claude-batch-2026-11-24/OR/cascadervpdx.com.csv (read 2026-11-24) + harvest-devin CSVs from
# data/devin-harvest-or-2026-11-04-1, data/devin-harvest-wa-2026-11-04-1 and #78 (minus rivercityrv, royalcoachsales,
# thervbarnnw: newer copies already in the base; poulsborv: reviewed in #83; qrvsllc: no VIN/stock/photo).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); AC=$(cd "$HERE/../.." && pwd); W=${W:-/tmp/claude-harvest-2026-11-24}; mkdir -p $W/{tf,pf,np}
echo "import { register } from 'node:module'; register('file://$HERE/ts-hooks.mjs');" > $W/register.mjs
python3 $HERE/csv2rows.py "$W/csv" $W/rows.ndjson $W/rows_report.json      # $W/csv/<ST>/<domain>.csv
cp $AC/data/inventory.snapshot.json.gz $W/base_25630ad.snapshot.json.gz
(cd $AC && KEEP_BASE=1 node --max-old-space-size=12000 --import $W/register.mjs --experimental-transform-types scripts/build-harvest-snapshot.ts $W/rows.ndjson $W/stats.json)
cp $AC/data/inventory.snapshot.json.gz $W/built.gz; cp $W/base_25630ad.snapshot.json.gz $AC/data/inventory.snapshot.json.gz
cd $W
python3 $AC/scripts/harvest-2026-10-31/typefix.py built.gz typefix.gz tf
python3 $AC/scripts/harvest-2026-10-31/postfix.py typefix.gz postfix.gz pf
python3 $AC/scripts/google-scrape-2026-11-09/newpost_gscrape.py built.gz postfix.gz base_25630ad.snapshot.json.gz newpost.gz np
python3 $AC/scripts/google-scrape-2026-11-09/cityfix.py newpost.gz final.gz $AC/src/dealer-city-coords.ts hold
# then: drop clarksconsignment.com (page title stored as dealer name), append the datasetNote line, write to data/inventory.snapshot.json.gz

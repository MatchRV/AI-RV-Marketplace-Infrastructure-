#!/bin/bash
# refix8b.sh: trial8b = trial8 inputs (no re-fetch, no reparse); fix6, fix7 with CARRY=1 (dedupe carry-over of the fresher
# duplicate's price block, lastSeen and listing URL), typefix (motorhomes stored as towables), postfix, coords, windows, report, QA + refreshed recheck CSV.
set -e; T=trial8b; H=/workspace/harvest-2026-10-31; cd $H; rm -f out_$T/DONE
cp out_trial8/{inventory.fix5.snapshot.json.gz,fix5_changes.csv,fix5_holds.csv,fix5.json,fix5_multi.json,fix5_held_units.ndjson.gz,build_stats.json,holds_qa.csv} out_$T/
python3 tools/fix6.py out_$T/inventory.fix5.snapshot.json.gz out_$T/inventory.fix6.snapshot.json.gz out_$T > out_$T/fix6_summary.json
CARRY=1 python3 tools/fix7.py out_$T/inventory.fix6.snapshot.json.gz out_$T/inventory.fix7.snapshot.json.gz out_$T > out_$T/fix7_summary.json
python3 tools/typefix.py out_$T/inventory.fix7.snapshot.json.gz out_$T/inventory.typefix.snapshot.json.gz out_$T > out_$T/typefix_summary.json
python3 tools/postfix.py out_$T/inventory.typefix.snapshot.json.gz out_$T/inventory.snapshot.json.gz out_$T > out_$T/postfix.json
cd /workspace/wt-h31/lib/agent-core && cp $H/out_$T/inventory.snapshot.json.gz data/inventory.snapshot.json.gz
npx tsx scripts/build-dealer-city-coords.ts /workspace/gaz/2023_Gaz_place_national.txt /workspace/gaz/2023_Gaz_cousubs_national.txt > $H/logs/coords_$T.txt 2>&1
cp src/dealer-city-coords.ts $H/out_$T/dealer-city-coords.ts; cd $H
python3 /workspace/harvest-2026-10-30/windows.py out_$T/inventory.snapshot.json.gz out_$T/windows.json > /dev/null
python3 tools/report.py out_$T/inventory.snapshot.json.gz base_v3.3.snapshot.json.gz out_$T > out_$T/report.json
python3 tools/qa_sample.py out_$T/inventory.snapshot.json.gz base_v3.3.snapshot.json.gz out_$T > out_$T/qa_sample.txt
python3 tools/recheck8b.py > out_$T/recheck8b.json
python3 tools/track_c_prices.py out_$T > out_$T/track_c_prices.txt
for f in order_release order_hold_by_dealer vin_invalid_blanked; do cp out_trial8/${f}_trial8.csv out_$T/${f}_trial8b.csv; done
touch out_$T/DONE

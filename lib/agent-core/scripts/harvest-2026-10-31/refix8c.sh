#!/bin/bash
# refix8c.sh: trial8c = trial8b inputs (+ VIN digit/last-4 rule, make from brand lists) (no re-fetch, no reparse); fix6, fix7 with CARRY=1 (dedupe carry-over of the fresher
# duplicate's price block, lastSeen and listing URL), typefix (motorhomes stored as towables), postfix, coords, windows, report, QA + refreshed recheck CSV.
set -e; T=trial8c; H=/workspace/harvest-2026-10-31; cd $H; rm -f out_$T/DONE
cp out_trial8b/{inventory.fix5.snapshot.json.gz,fix5_changes.csv,fix5_holds.csv,fix5.json,fix5_multi.json,fix5_held_units.ndjson.gz,build_stats.json,holds_qa.csv} out_$T/
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
cp out_trial8b/qa_recheck_10_trial8b.csv out_$T/
python3 tools/track_c_prices.py out_$T > out_$T/track_c_prices.txt
for f in order_release order_hold_by_dealer; do cp out_trial8/${f}_trial8.csv out_$T/${f}_trial8c.csv; done
python3 - out_$T <<'PY'
import csv,sys
o=sys.argv[1]; w=csv.writer(open(f'{o}/vin_invalid_blanked_trial8c.csv','w',newline='')); w.writerow(['id','listing_url','old_vin','reason'])
for r in csv.reader(open(f'{o}/fix7_changes.csv')):
    if len(r)>5 and r[2]=='vin': w.writerow([r[0],r[1],r[3],r[5]])
PY
touch out_$T/DONE

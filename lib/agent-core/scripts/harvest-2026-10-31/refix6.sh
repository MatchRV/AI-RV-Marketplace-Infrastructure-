#!/bin/bash
# refix6.sh <tag>: rerun the post-build stages (fix6, postfix, coords, windows, report, QA samples) on the existing fix5 output.
set -e; T=$1; H=/workspace/harvest-2026-10-31; cd $H; rm -f out_$T/DONE
python3 tools/fix6.py out_$T/inventory.fix5.snapshot.json.gz out_$T/inventory.fix6.snapshot.json.gz out_$T > out_$T/fix6_summary.json
python3 tools/postfix.py out_$T/inventory.fix6.snapshot.json.gz out_$T/inventory.snapshot.json.gz out_$T > out_$T/postfix.json
cd /workspace/wt-h31/lib/agent-core && cp $H/out_$T/inventory.snapshot.json.gz data/inventory.snapshot.json.gz
npx tsx scripts/build-dealer-city-coords.ts /workspace/gaz/2023_Gaz_place_national.txt /workspace/gaz/2023_Gaz_cousubs_national.txt > $H/logs/coords_$T.txt 2>&1
cp src/dealer-city-coords.ts $H/out_$T/dealer-city-coords.ts; cd $H
python3 /workspace/harvest-2026-10-30/windows.py out_$T/inventory.snapshot.json.gz out_$T/windows.json > /dev/null
python3 tools/report.py out_$T/inventory.snapshot.json.gz base_v3.3.snapshot.json.gz out_$T > out_$T/report.json
python3 tools/qa_sample.py out_$T/inventory.snapshot.json.gz base_v3.3.snapshot.json.gz out_$T > out_$T/qa_sample.txt
python3 tools/qa_sample6.py out_$T/inventory.snapshot.json.gz base_v3.3.snapshot.json.gz out_$T > out_$T/qa_sample6.txt
touch out_$T/DONE

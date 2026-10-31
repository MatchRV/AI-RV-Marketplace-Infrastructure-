#!/bin/bash
# finalize.sh <tag>: reparse all page dirs, rebuild rows, QA-merge, KEEP_BASE build, windows, report. Resumable (each step re-runnable).
set -e; set +o noclobber; T=$1; H=/workspace/harvest-2026-10-31; cd $H; mkdir -p out_$T
echo "$(date +%T) start $T"
REPARSE=1 python3 tools/parse_generic.py pa;  python3 tools/decide_pa.py pa raw/pa_rows.ndjson > logs/pa_decide_$T.txt 2>&1
REPARSE=1 python3 tools/parse_generic.py ib;  python3 tools/rows_from_pages.py ib raw/ib_rows.ndjson > logs/ib_rows_$T.txt 2>&1
REPARSE=1 python3 tools/parse_generic.py ib2; python3 tools/rows_from_pages.py ib2 raw/ib2_rows.ndjson > logs/ib2_rows_$T.txt 2>&1
REPARSE=1 python3 tools/parse_generic.py oc/run; python3 tools/rows_from_pages.py oc/run raw/oc_rows.ndjson dealer_info.json > logs/oc_rows_$T.txt 2>&1
for d in ib3a ib3b ib4 ib5g ib5n ib6; do REPARSE=1 python3 tools/parse_generic.py $d; python3 tools/rows_from_pages.py $d raw/${d}_rows.ndjson > logs/${d}_rows_$T.txt 2>&1; done
grep -v '"dealer_domain": "popsells.com"' raw/oc_rows.ndjson > raw/oc_rows_np.ndjson || true
python3 tools/qa_merge.py raw/$T.ndjson out_$T/holds_qa.csv raw/pa_rows.ndjson raw/ib_rows.ndjson raw/ib2_rows.ndjson raw/oc_rows_np.ndjson raw/ib3a_rows.ndjson raw/ib3b_rows.ndjson raw/ib4_rows.ndjson raw/ib5g_rows.ndjson raw/ib5n_rows.ndjson raw/ib6_rows.ndjson > logs/qa_$T.txt 2>&1
cd /workspace/wt-h31/lib/agent-core
# base is always v3.3 (origin/main fe15241), never an interim build committed on this branch
git show fe15241:lib/agent-core/data/inventory.snapshot.json.gz > data/inventory.snapshot.json.gz
cmp data/inventory.snapshot.json.gz $H/base_v3.3.snapshot.json.gz
KEEP_BASE=1 NODE_OPTIONS=--max-old-space-size=8000 npx tsx scripts/build-harvest-snapshot.ts $H/raw/$T.ndjson $H/out_$T/build_stats.json > $H/logs/build_$T.txt 2>&1
cp data/inventory.snapshot.json.gz $H/out_$T/inventory.prefix.snapshot.json.gz
python3 $H/tools/postfix.py $H/out_$T/inventory.prefix.snapshot.json.gz $H/out_$T/inventory.snapshot.json.gz $H/out_$T > $H/out_$T/postfix.json
cp $H/out_$T/inventory.snapshot.json.gz data/inventory.snapshot.json.gz
npx tsx scripts/build-dealer-city-coords.ts /workspace/gaz/2023_Gaz_place_national.txt /workspace/gaz/2023_Gaz_cousubs_national.txt > $H/logs/coords_$T.txt 2>&1
cp src/dealer-city-coords.ts $H/out_$T/dealer-city-coords.ts
cd $H
python3 /workspace/harvest-2026-10-30/windows.py out_$T/inventory.snapshot.json.gz out_$T/windows.json > /dev/null
python3 tools/report.py out_$T/inventory.snapshot.json.gz base_v3.3.snapshot.json.gz out_$T > out_$T/report.json
python3 tools/qa_sample.py out_$T/inventory.snapshot.json.gz base_v3.3.snapshot.json.gz out_$T > out_$T/qa_sample.txt
echo "$(date +%T) done $T"; touch out_$T/DONE

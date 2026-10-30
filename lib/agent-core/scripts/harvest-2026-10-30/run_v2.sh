#!/bin/bash
# usage: run_v2.sh <tag>   — decide → prepare → full build + refresh-only build (+ windows) 
set -e
B=/workspace/harvest-2026-10-30; A=/workspace/wt-harvest/lib/agent-core; T=$1
cd $B && python3 verify_decide.py > $B/verify/report_$T.txt && python3 prepare_raw2.py $B/raw_records_v2.ndjson > $B/logs/prep_v2_$T.txt
cd $A
cp $B/inventory.snapshot.oct14.json.gz data/inventory.snapshot.json.gz
REFRESH_ONLY=1 GONE_KEYS=$B/verify/gone_keys.json NODE_OPTIONS=--max-old-space-size=8000 npx tsx scripts/build-harvest-snapshot.ts $B/raw_records_v2.ndjson $B/build_stats_refresh_$T.json > $B/logs/build_refresh_$T.log 2>&1
cp data/inventory.snapshot.json.gz $B/snapshot_refresh_only_$T.json.gz
cp $B/inventory.snapshot.oct14.json.gz data/inventory.snapshot.json.gz
GONE_KEYS=$B/verify/gone_keys.json NODE_OPTIONS=--max-old-space-size=8000 npx tsx scripts/build-harvest-snapshot.ts $B/raw_records_v2.ndjson $B/build_stats_v2_$T.json > $B/logs/build_v2_$T.log 2>&1
cp data/inventory.snapshot.json.gz $B/snapshot_v2_$T.json.gz
cd $B && python3 windows.py $B/snapshot_v2_$T.json.gz $B/windows_v2_$T.json > /dev/null && python3 windows.py $B/snapshot_refresh_only_$T.json.gz $B/windows_refresh_$T.json > /dev/null
echo DONE

#!/bin/bash
# run_nd.sh <tag>: WA new-dealer batch build on top of #69 (756cf81). Steps: reparse, rows, QA merge, prep (WA/dedupe/order holds),
# KEEP_BASE build, typefix+postfix, newpost (base carried exactly), coords, windows, WA coverage, QA sample.
set -e; T=$1; H=/workspace/harvest-2026-11-01; W=/workspace/wt-nd; O=$H/out_$T; mkdir -p $O $H/raw; cd $H
log(){ echo "$(date +%T) $*"; }
# restore the #69 base FIRST: qa_merge/prep_new dedupe against the worktree snapshot
(cd $W && git show 756cf81:lib/agent-core/data/inventory.snapshot.json.gz > lib/agent-core/data/inventory.snapshot.json.gz && git checkout -q 756cf81 -- lib/agent-core/src/dealer-city-coords.ts)
for d in wa1 wa2; do REPARSE=1 PARSE_PROCS=4 python3 tools/parse_generic.py $d; python3 tools/rows_from_pages.py $d raw/${d}_rows.ndjson > $O/${d}_rows.json; done
python3 tools/qa_merge.py raw/qa_$T.ndjson $O/holds_qa.csv raw/wa1_rows.ndjson raw/wa2_rows.ndjson > $O/qa_merge.txt
python3 tools/prep_new.py raw/qa_$T.ndjson raw/prep_$T.ndjson $O wa1 wa2 > $O/prep.json
log prep $(tr -d '\n' < $O/prep.json)
cd $W/lib/agent-core
git show 756cf81:lib/agent-core/data/inventory.snapshot.json.gz > data/inventory.snapshot.json.gz
cp data/inventory.snapshot.json.gz $O/base_69.snapshot.json.gz
KEEP_BASE=1 NODE_OPTIONS=--max-old-space-size=8000 npx tsx scripts/build-harvest-snapshot.ts $H/raw/prep_$T.ndjson $O/build_stats.json > $O/build.txt 2>&1
cp data/inventory.snapshot.json.gz $O/built.snapshot.json.gz
cd $H
python3 tools/typefix.py $O/built.snapshot.json.gz $O/typefix.snapshot.json.gz $O > $O/typefix_summary.json
python3 tools/postfix.py $O/typefix.snapshot.json.gz $O/postfix.snapshot.json.gz $O > $O/postfix_summary.json
python3 tools/newpost.py $O/built.snapshot.json.gz $O/postfix.snapshot.json.gz $O/base_69.snapshot.json.gz $O/inventory.snapshot.json.gz $O > $O/newpost.json
log newpost $(cat $O/newpost.json)
cp $O/inventory.snapshot.json.gz $W/lib/agent-core/data/inventory.snapshot.json.gz
cd $W/lib/agent-core && npx tsx scripts/build-dealer-city-coords.ts /workspace/gaz/2023_Gaz_place_national.txt /workspace/gaz/2023_Gaz_cousubs_national.txt > $O/coords.txt 2>&1; cp src/dealer-city-coords.ts $O/dealer-city-coords.ts; cd $H
python3 /workspace/harvest-2026-10-30/windows.py $O/inventory.snapshot.json.gz $O/windows.json > /dev/null
python3 wa_cov.py $O/inventory.snapshot.json.gz > $O/wa_cov.txt
log windows $(python3 -c "import json;d=json.load(open('$O/windows.json'));print(d['builtAt'],d['loaded'],d['windows']['30'])")
log wa $(head -1 $O/wa_cov.txt)
touch $O/DONE

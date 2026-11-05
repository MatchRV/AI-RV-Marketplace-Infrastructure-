#!/bin/bash
# finalize_nd.sh <tag>: commit locally on data/new-dealers-2026-11-01, tests (--maxWorkers=2), mem probe, bundle. Nothing pushed.
set -e; T=$1; H=/workspace/harvest-2026-11-01; W=/workspace/wt-nd; O=$H/out_$T; cd $H
log(){ echo "$(date +%T) $*"; }
BUILT=$(python3 -c "import json;print(json.load(open('$O/windows.json'))['builtAt'])")
BUILT=$BUILT python3 /workspace/harvest-2026-10-30/pp2/tools/windows_at.py $O/base_69.snapshot.json.gz $O/windows_base_at_new_builtAt.json > /dev/null
python3 /workspace/harvest-2026-10-30/windows.py $O/base_69.snapshot.json.gz $O/windows_base.json > /dev/null
python3 tools/wa_universe.py $O/inventory.snapshot.json.gz $O > $O/wa_universe.json
python3 wa_cov.py $O/base_69.snapshot.json.gz > $O/wa_cov_base.txt
python3 tools/qa_sample_nd.py $O/inventory.snapshot.json.gz $O/qa_sample_30_new_dealers_wa.csv 30 > $O/qa_sample.txt
python3 tools/funnel.py $T > $O/funnel.txt
cd $W; S=lib/agent-core/scripts/new-dealers-2026-11-01; mkdir -p $S
cp $H/tools/{cso_fix_2026_11_02.py,run_nd.sh,finalize_nd.sh,prep_new.py,newpost.py,rows_from_pages.py,discover.py,wa_universe.py,qa_sample_nd.py,funnel.py} $H/wa/master_seed.py $S/
python3 - <<EOF
import json
d={k:json.load(open('$O/'+f)) for k,f in [('build','build_stats.json'),('newpost','newpost_summary.json'),('windows','windows.json'),('windowsBaseAtNewBuiltAt','windows_base_at_new_builtAt.json'),('waUniverse','wa_universe.json'),('prep','prep.json')]}
import os
if os.path.exists('$O/cso_fix_summary.json'): d['csoFix_2026_11_02']=json.load(open('$O/cso_fix_summary.json'))
json.dump(d,open('lib/agent-core/data/new-dealers-2026-11-01.stats.json','w'),indent=1)
EOF
git add lib/agent-core/data/inventory.snapshot.json.gz lib/agent-core/data/new-dealers-2026-11-01.stats.json lib/agent-core/src/dealer-city-coords.ts lib/agent-core/scripts/build-harvest-snapshot.ts $S
git commit -q -F $O/commit_msg.txt; git rev-parse --short HEAD > $O/commit.txt; log commit $(cat $O/commit.txt)
cd $W/lib/agent-core && (timeout 1500 npx vitest run --maxWorkers=2 --minWorkers=1 > $O/test_agent_core.txt 2>&1 || true)
cd $W/artifacts/api-server && (timeout 2400 npx vitest run --maxWorkers=2 --minWorkers=1 > $O/test_api.txt 2>&1 || true)
cd $W/artifacts/rv-marketplace && (timeout 1200 npx vitest run --maxWorkers=2 --minWorkers=1 > $O/test_web.txt 2>&1 || true)
cp /workspace/harvest-2026-10-31/mem/_mem_new.ts $W/artifacts/api-server/_mem_new.ts && cd $W/artifacts/api-server && (NODE_OPTIONS=--expose-gc npx tsx _mem_new.ts > $O/mem.json 2>&1; rm -f _mem_new.ts)
cd $W; B=$O/bundle_new_dealers_wa_2026-11-01; mkdir -p $B
git bundle create $B/data-new-dealers-2026-11-01.bundle 756cf81..data/new-dealers-2026-11-01 2>/dev/null
git diff 756cf81 HEAD -- . ':(exclude)lib/agent-core/data/inventory.snapshot.json.gz' > $B/code_and_stats.patch
cp $O/{inventory.snapshot.json.gz,wa_dealers_uncovered.csv,wa_dealers_all.csv,qa_sample_30_new_dealers_wa.csv,newpost_held.csv,newpost_changes.csv,cso_fix_held.csv,cso_fix_removed.csv,cso_fix_changes.csv,cso_fix_summary.json,prep_holds.csv,holds_qa.csv,windows.json,windows_base.json,windows_base_at_new_builtAt.json,wa_cov.txt,wa_cov_base.txt,wa_universe.json,funnel.txt,test_agent_core.txt,test_api.txt,test_web.txt,mem.json,commit.txt,build_stats.json} $B/ 2>/dev/null || true
cp $H/summary.md $B/; cd $O && tar czf bundle_new_dealers_wa_2026-11-01.tgz bundle_new_dealers_wa_2026-11-01
for f in test_agent_core test_api test_web; do log $f $(grep -E "^\s+Tests " $O/$f.txt | tail -1); done; log mem $(tail -1 $O/mem.json)
touch $O/FINAL_DONE

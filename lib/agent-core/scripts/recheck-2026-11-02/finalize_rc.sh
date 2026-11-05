#!/bin/bash
# finalize_rc.sh <tag>: copy out_<tag> snapshot into /workspace/wt-rc2, stats json, scripts, local commit on data/recheck-2026-11-02 (never pushed),
# tests (--maxWorkers=2), memory probe, WA stats, QA sample, failed dealers.
set -e; T=$1; W=/workspace/harvest-recheck-2026-11-02; O=$W/out_$T; R=/workspace/wt-rc2; cd $W
export BASE=$W/out/base_wa_9cc3258.snapshot.json.gz
log(){ echo "$(date +%T) $*"; }
BUILT=$(cat $O/BUILT_AT.txt)
python3 tools/wa_stats.py $BASE $BUILT > $O/wa_before.json; python3 tools/wa_stats.py $O/inventory.snapshot.json.gz $BUILT > $O/wa_after.json
python3 tools/failed_dealers.py $O > $O/failed_dealers.json
python3 tools/qa_sample.py $O $O/qa_sample_30_recheck_$T.csv
log wa $(cat $O/wa_before.json) '->' $(cat $O/wa_after.json)
cp $O/inventory.snapshot.json.gz $R/lib/agent-core/data/inventory.snapshot.json.gz
(cd $R/lib/agent-core && npx tsx scripts/build-dealer-city-coords.ts /workspace/gaz/2023_Gaz_place_national.txt /workspace/gaz/2023_Gaz_cousubs_national.txt > $O/coords.txt 2>&1)
S=$R/lib/agent-core/scripts/recheck-2026-11-02; mkdir -p $S; cp tools/*.py tools/*.sh $S/
python3 - <<P
import json
O='$O'; d={k:json.load(open(f'{O}/{f}')) for k,f in [('final','final_summary.json'),('windowsAfter','windows.json'),('windowsBaseAtBuiltAt','windows_base_at_builtAt.json'),('waBefore','wa_before.json'),('waAfter','wa_after.json'),('failedDealers','failed_dealers.json')]}
for st in ('cond','lots','unknown'):
    d.setdefault('csoFixes',{})[st]=json.load(open(f'{O}/cso_t4_{st}_summary.json'))
d['interact']=json.load(open(f'{O}/ia/fix1_summary.json'))['removedOrHeldByReason']; g=json.load(open(f'{O}/gen/gen_summary.json')); d['otherDealers']={'heldByReason':g['heldByReason'],'steps':g['steps']}
d['campingWorld']=json.load(open(f'{O}/cw/pagepass_apply_summary.json'))['categories']
json.dump(d,open('$R/lib/agent-core/data/recheck-2026-11-02.stats.json','w'),indent=1)
P
cd $R && git add lib/agent-core/src/dealer-city-coords.ts lib/agent-core/data/inventory.snapshot.json.gz lib/agent-core/data/recheck-2026-11-02.stats.json lib/agent-core/scripts/recheck-2026-11-02
git -c user.name="$(git log -1 --format=%an)" -c user.email="$(git log -1 --format=%ae)" commit -q -F $O/commit_msg.txt; git rev-parse --short HEAD > $O/commit.txt; log commit $(cat $O/commit.txt)
cd $R/lib/agent-core && (timeout 1500 npx vitest run --maxWorkers=2 --minWorkers=1 > $O/test_agent_core.txt 2>&1 || true)
cd $R/artifacts/api-server && (timeout 2400 npx vitest run --maxWorkers=2 --minWorkers=1 > $O/test_api.txt 2>&1 || true)
cd $R/artifacts/rv-marketplace && (timeout 1200 npx vitest run --maxWorkers=2 --minWorkers=1 > $O/test_web.txt 2>&1 || true)
cp /workspace/harvest-2026-10-31/mem/_mem_new.ts $R/artifacts/api-server/_mem_new.ts && cd $R/artifacts/api-server && (NODE_OPTIONS=--expose-gc npx tsx _mem_new.ts > $O/mem.json 2>&1; rm -f _mem_new.ts)
for f in test_agent_core test_api test_web; do log $f $(grep -E "^\s+Tests " $O/$f.txt | tail -1); done; log mem $(tail -1 $O/mem.json)
touch $O/FINAL_DONE

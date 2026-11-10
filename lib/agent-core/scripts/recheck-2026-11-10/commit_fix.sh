#!/bin/bash
# commit_fix.sh <snapshot> <stage> <message>: copy snapshot + CSO fix reports into wt-rc2 and commit locally (never pushed)
set -e; R=/workspace/wt-rc5; W=/workspace/harvest-recheck-2026-11-10
cp $1 $R/lib/agent-core/data/inventory.snapshot.json.gz
S=$R/lib/agent-core/scripts/recheck-2026-11-10; cp $W/tools/*.py $W/tools/*.sh $S/; mkdir -p $S/cso_t4; cp $W/out_t4c/cso_t4_$2_* $S/cso_t4/ 2>/dev/null || true
python3 - "$2" <<'P'
import json,sys
p='/workspace/wt-rc5/lib/agent-core/data/recheck-2026-11-10.stats.json'; d=json.load(open(p)); st=sys.argv[1]
d.setdefault('csoFixes_t4',{})[st]=json.load(open(f'/workspace/harvest-recheck-2026-11-10/out_t4c/cso_t4_{st}_summary.json'))
json.dump(d,open(p,'w'),indent=1)
P
cd $R && git add -A lib/agent-core/data lib/agent-core/scripts/recheck-2026-11-10 lib/agent-core/src/dealer-city-coords.ts && git -c user.name="$(git log -1 --format=%an)" -c user.email="$(git log -1 --format=%ae)" commit -q -m "$3" && git rev-parse --short HEAD

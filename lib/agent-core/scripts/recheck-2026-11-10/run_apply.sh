#!/bin/bash
# run_apply.sh <tag>: apply fetched pages to the main cf146e0 snapshot (stages: CW -> Interact(fix1) -> other dealers -> final). Outputs out_<tag>/
T=$1; W=/workspace/harvest-recheck-2026-11-10; O=$W/out_$T; mkdir -p $O $W/cw_apply; cd $W; log(){ echo "$(date +%T) $*"; }
export BUILT_AT=${BUILT_AT:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}; echo $BUILT_AT > $O/BUILT_AT.txt
export BASE=${BASE:-$W/out/base_main_e2e411b.snapshot.json.gz}
python3 tools/extract.py fetch > $O/extract.log 2>&1 && python3 tools/extract.py fetch_cw > $O/extract_cw.log 2>&1; log extract $(tail -1 $O/extract.log)
python3 tools/cw_hits.py > $O/cw_hits.log 2>&1
python3 - <<'P'
import json,os
W='/workspace/harvest-recheck-2026-11-10'; seen={}
for p in (f'{W}/cw_search/extracted_cw.ndjson',f'{W}/fetch/extracted_cw.ndjson',f'{W}/fetch_cw/extracted_cw.ndjson'):
    if os.path.exists(p):
        for l in open(p):
            j=json.loads(l)
            if j.get('result')=='ok' or p.endswith('extracted_cw.ndjson') and 'cw_search' not in p: seen[j['key']+('|own' if 'cw_search' not in p else '|hit')]=j
# own page wins over hit for the same key
out={}
for k,j in seen.items():
    kk=j['key']
    if kk not in out or k.endswith('|own'): out[kk]=j
with open(f'{W}/cw_apply/extracted.ndjson','w') as f:
    for j in out.values(): f.write(json.dumps(j)+'\n')
print(len(out))
P
python3 tools/ia_prepare.py > $O/ia_prepare.log 2>&1; log ia_prepare $(tail -1 $O/ia_prepare.log)
PP_DIR=$W/cw_apply python3 tools/apply_pp2.py $BASE $O/s1.snapshot.json.gz $O/cw > $O/cw_stdout.json 2> $O/cw_err.log; log cw $(python3 -c "import json;d=json.load(open('$O/cw/pagepass_apply_summary.json'));print(d['in'],d['out'],d['categories'])")
FETCH_DIR=$W/ia_apply python3 tools/fix1_rc.py $O/s1.snapshot.json.gz $O/s2.snapshot.json.gz $O/ia > $O/ia_stdout.json 2> $O/ia_err.log; log ia $(python3 -c "import json;d=json.load(open('$O/ia/fix1_summary.json'));print(d['in'],d['out'],d['removedOrHeldByReason'])")
python3 tools/apply_gen.py $O/s2.snapshot.json.gz $O/s3.snapshot.json.gz $O/gen > $O/gen_stdout.json 2> $O/gen_err.log; log gen $(python3 -c "import json;d=json.load(open('$O/gen/gen_summary.json'));print(d['in'],d['out'],d['heldByReason'],d['steps'])")
python3 tools/final.py $BASE $O/s3.snapshot.json.gz $O/inventory.snapshot.json.gz $O > $O/final.log 2>&1; log final $(tail -1 $O/final.log)
# CSO t4 fixes (condition from own heading/URL; own-page lots incl. LOTDIFF; Unknown lot cities from own page)
mv $O/inventory.snapshot.json.gz $O/final_pre_cso.snapshot.json.gz
python3 tools/cso_t4.py cond $O/final_pre_cso.snapshot.json.gz $O/c1.snapshot.json.gz $O > $O/cso_cond.log 2>&1
LOTDIFF=$O/ia/fix1_lot_differs_not_applied.csv python3 tools/cso_t4.py lots $O/c1.snapshot.json.gz $O/c2.snapshot.json.gz $O > $O/cso_lots.log 2>&1
python3 tools/cso_t4.py unknown $O/c2.snapshot.json.gz $O/inventory.snapshot.json.gz $O > $O/cso_unknown.log 2>&1; log cso $(tail -c 300 $O/cso_cond.log) $(tail -c 200 $O/cso_lots.log) $(tail -c 200 $O/cso_unknown.log)
python3 /workspace/harvest-2026-10-30/windows.py $O/inventory.snapshot.json.gz $O/windows.json > /dev/null
BUILT=$BUILT_AT python3 /workspace/wt-rc5/lib/agent-core/scripts/pagepass-2026-11-01/windows_at.py $BASE $O/windows_base_at_builtAt.json > /dev/null
log windows $(python3 -c "
import json;a=json.load(open('$O/windows_base_at_builtAt.json'));b=json.load(open('$O/windows.json'))
print(a['builtAt'],'before',a['windows']['30']['eligible'],'after',b['windows']['30']['eligible'],'loaded',a['loaded'],'->',b['loaded'])")
touch $O/APPLY_DONE; log done

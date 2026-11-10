#!/bin/bash
# t2: re-apply all Nov 9/10 pages read so far (incl. generalrv tail) on main e2e411b, then finalize (2nd local commit). Detached; checkpoints in summary.md
cd /workspace/harvest-recheck-2026-11-10
echo "- $(date +%H:%M) PT t2 start (fetch left $(python3 tools/left.py fetch), cw left $(python3 tools/left.py fetch_cw))" >> summary.md
bash tools/run_apply.sh t2 > logs/run_apply_t2.log 2>&1 || { echo "- $(date +%H:%M) t2 apply FAILED" >> summary.md; exit 1; }
O=out_t2; B=$(cat $O/BUILT_AT.txt)
python3 tools/wa_stats.py out/base_main_e2e411b.snapshot.json.gz $B > $O/wa_before.json; python3 tools/wa_stats.py $O/inventory.snapshot.json.gz $B > $O/wa_after.json
python3 - <<'P'
import json,gzip,datetime as D
O='/workspace/harvest-recheck-2026-11-10/out_t2'
f=json.load(open(f'{O}/final_summary.json')); w=json.load(open(f'{O}/windows_base_at_builtAt.json')); w2=json.load(open(f'{O}/windows.json'))
a=json.load(open(f'{O}/wa_before.json')); b=json.load(open(f'{O}/wa_after.json'))
F={u['id']:u for u in json.load(gzip.open(f'{O}/inventory.snapshot.json.gz'))['units']}
bt=D.datetime.fromisoformat(f['builtAt'].replace('Z','+00:00'))
st=sum(1 for u in F.values() if (bt-D.datetime.fromisoformat(u['provenance']['lastSeenAt'].replace('Z','+00:00'))).days>=30)
msg=f"""Recheck 2026-11-10 tranche t2: re-apply with fetch tail (local only, not pushed)

Same base main e2e411b; all dealer pages read Nov 9 8:12 PM - Nov 10 PT so far (adds General RV tail, more Blue Compass/Popsells/CW). Refresh-only; added 0.

- loaded {f['base_units']:,} -> {f['out_units']:,} (removed/held {f['removed_or_held']:,})
- 30d searchable at builtAt {f['builtAt']}: {w['windows']['30']['eligible']:,} -> {w2['windows']['30']['eligible']:,} (WA {a['30']['WA']:,} -> {b['30']['WA']:,})
- lastSeen refreshed {f['lastSeen_refreshed']:,}; price updated {f['price_changed']:,}; units >30 d stale after: {st:,}
"""
open(f'{O}/commit_msg.txt','w').write(msg); print(msg)
P
bash tools/finalize_rc.sh t2 > logs/finalize_t2.log 2>&1
echo "- $(date +%H:%M) PT t2 done: commit $(cat out_t2/commit.txt 2>/dev/null); $(tail -5 logs/finalize_t2.log | tr '\n' ' ')" >> summary.md
touch out_t2/T2_DONE

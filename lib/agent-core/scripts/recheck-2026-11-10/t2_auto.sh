#!/bin/bash
# t2_auto.sh: after t1, wait until main fetch left < 15000 OR large nov7 hosts mostly done OR 07:00 PT Nov 6, then t2 apply + finalize.
W=/workspace/harvest-recheck-2026-11-10; cd $W; L=$W/logs/t2_auto.log
DEAD=$(date -d '2026-11-06 07:00' +%s)
NOV7_HOSTS='lazydays.com campersinn.com bishs.com ronhooverrvs.com meyersrvsuperstores.com popsells.com'
log(){ echo "$(date +%T) $*" | tee -a $L; }
while true; do
  [ -f fetch/FETCH_DONE ] && [ -f fetch_cw/FETCH_DONE ] && { log both fetchers done; break; }
  left=$(python3 tools/left.py fetch 2>/dev/null || echo 999999)
  # rough nov7 remaining: count results growth halt? use left threshold
  if [ "$left" -le 15000 ] 2>/dev/null; then log "main left $left <=15000"; break; fi
  [ $(date +%s) -ge $DEAD ] && { log "deadline 07:00; fetch left $left / cw $(python3 tools/left.py fetch_cw)"; break; }
  # keep heartbeat
  echo "$(date +%Y-%m-%dT%H:%M:%S%z) t2_auto waiting left=$left" >> logs/heartbeat.tick
  sleep 180
done
echo "- $(date +%H:%M) PST t2 auto start (fetch left $(python3 tools/left.py fetch), cw left $(python3 tools/left.py fetch_cw))" >> summary.md
# Merge any new nov7miss (already done) ; ensure commit_msg will be written
bash tools/run_apply.sh t2 > logs/run_apply_t2.log 2>&1
python3 - <<'P'
import json,gzip,collections as C,datetime as D,os
W='/workspace/harvest-recheck-2026-11-10'
O=f'{W}/out_t2'
bt=open(f'{O}/BUILT_AT.txt').read().strip()
base=json.load(gzip.open(f'{W}/out/base_main_e2e411b.snapshot.json.gz'))
fin=json.load(gzip.open(f'{O}/inventory.snapshot.json.gz'))
nov7=D.datetime(2026,11,8,7,59,tzinfo=D.timezone.utc)
nov14=D.datetime(2026,11,15,7,59,tzinfo=D.timezone.utc)
def z(s): return D.datetime.fromisoformat(s.replace('Z','+00:00'))
def ages(u,dl): return z(u['provenance']['lastSeenAt'])+D.timedelta(days=30)<=dl
def tot(units,dl): return sum(1 for u in units if ages(u,dl))
fs=json.load(open(f'{O}/final_summary.json'))
win=json.load(open(f'{O}/windows.json'))
wa=json.load(open(f'{W}/out/wa_before.json'))
import subprocess
subprocess.check_call(['python3',f'{W}/tools/wa_stats.py',f'{O}/inventory.snapshot.json.gz',bt], stdout=open(f'{O}/wa_after_pre.json','w'))
wa2=json.load(open(f'{O}/wa_after_pre.json'))
msg=f"""Recheck 2026-11-05 tranche t2 (local only, not pushed).

Stacks on t1. Refresh-only; no new units; new-dealers branch not stacked.

- loaded {len(base['units'])} base / t1 path -> {len(fin['units'])}
- 30d searchable (from base before) 127867 -> {win['windows']['30']['eligible']} (WA {wa['30']['WA']} -> {wa2['30']['WA']})
- lastSeen refreshed {fs['lastSeen_refreshed']}; price changed {fs['price_changed']}; removed/held {fs['removed_or_held']}; added 0
- aging by Nov 7: {tot(base['units'],nov7)} -> {tot(fin['units'],nov7)}; Nov 8-14: {tot(base['units'],nov14)-tot(base['units'],nov7)} -> {tot(fin['units'],nov14)-tot(fin['units'],nov7)}

Facts-only CSO-safe Interact rules. Sale Pending/On Order held. MSRP never price.
"""
open(f'{O}/commit_msg.txt','w').write(msg)
print(msg)
P
bash tools/finalize_rc.sh t2 > logs/finalize_t2.log 2>&1
echo "- $(date +%H:%M) PST t2 done: commit $(cat out_t2/commit.txt 2>/dev/null); $(tail -6 logs/finalize_t2.log | tr '\n' ' ')" >> summary.md
touch out_t2/T2_AUTO_DONE; log done

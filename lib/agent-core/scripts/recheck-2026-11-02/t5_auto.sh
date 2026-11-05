#!/bin/bash
# t5_auto.sh: wait until both fetchers finish (FETCH_DONE) or 07:00 PT Nov 3, then t5 apply + report + finalize (local commit only).
W=/workspace/harvest-recheck-2026-11-02; cd $W; L=$W/logs/t5_auto.log
DEAD=$(date -d '2026-11-03 07:00' +%s)
while true; do
  [ -f fetch/FETCH_DONE ] && [ -f fetch_cw/FETCH_DONE ] && { echo "$(date +%T) both fetchers done" >> $L; break; }
  [ $(date +%s) -ge $DEAD ] && { echo "$(date +%T) deadline 07:00 reached; fetch left $(python3 tools/left.py fetch) / cw $(python3 tools/left.py fetch_cw)" >> $L; break; }
  sleep 120
done
echo "- $(date +%H:%M) PST t5 auto start (fetch left $(python3 tools/left.py fetch), cw left $(python3 tools/left.py fetch_cw))" >> summary.md
bash tools/run_apply.sh t5 > logs/run_apply_t5.log 2>&1
python3 tools/report_rc.py out_t5 > logs/report_t5.log 2>&1
bash tools/finalize_rc.sh t5 > logs/finalize_t5.log 2>&1
python3 tools/report_rc.py out_t5 > /dev/null 2>&1
echo "- $(date +%H:%M) PST t5 done: commit $(cat out_t5/commit.txt 2>/dev/null); $(tail -4 logs/finalize_t5.log | tr '\n' ' ')" >> summary.md
touch out_t5/T5_AUTO_DONE; echo "$(date +%T) done" >> $L

#!/bin/bash
cd /workspace/harvest-recheck-2026-11-10
for f in interact other rest; do
 echo "$(date +%T) start $f" >> logs/sitemaps.log
 THREADS=40 python3 tools/sitemaps2.py sm/${f}_doms.json sm/${f}_sm.ndjson '.' > logs/sm_$f.log 2>&1
done
echo "$(date +%T) done" >> logs/sitemaps.log; touch sm/SITEMAPS_FRESH_DONE

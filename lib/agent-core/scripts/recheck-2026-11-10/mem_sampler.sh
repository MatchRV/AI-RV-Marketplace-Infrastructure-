#!/bin/bash
cd /workspace/harvest-recheck-2026-11-10
while [ ! -f out_t2/FINAL_DONE ]; do ps -eo rss,cmd | grep -E "vitest|tsx" | grep -v grep | awk '{s+=$1; if($1>m)m=$1} END{print strftime("%T"), s, m}' >> logs/mem_sampler.log; sleep 2; done

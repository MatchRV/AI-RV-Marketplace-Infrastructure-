#!/bin/bash
O=$1; R=/workspace/wt-rc5
cd $R/lib/agent-core && (timeout 1500 npx vitest run --maxWorkers=2 --minWorkers=1 > $O/test_agent_core.txt 2>&1 || true)
cd $R/artifacts/api-server && (timeout 2400 npx vitest run --maxWorkers=2 --minWorkers=1 > $O/test_api.txt 2>&1 || true)
cd $R/artifacts/rv-marketplace && (timeout 1200 npx vitest run --maxWorkers=2 --minWorkers=1 > $O/test_web.txt 2>&1 || true)
cp /workspace/harvest-2026-10-31/mem/_mem_new.ts $R/artifacts/api-server/_mem_new.ts && cd $R/artifacts/api-server && (NODE_OPTIONS=--expose-gc npx tsx _mem_new.ts > $O/mem.json 2>&1; rm -f _mem_new.ts)
for f in test_agent_core test_api test_web; do echo $f $(grep -E "^\s+Tests " $O/$f.txt | tail -1); done; tail -1 $O/mem.json

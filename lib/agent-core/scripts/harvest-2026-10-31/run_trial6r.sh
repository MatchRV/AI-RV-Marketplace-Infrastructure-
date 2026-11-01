#!/bin/bash
# detached, checkpointed trial6 pipeline: each step writes out_trial5/steps/<n>.ok and is skipped on rerun
H=/workspace/harvest-2026-10-31; W=/workspace/wt-h31; T=trial6; S=$H/out_$T/steps; mkdir -p $S; cd $H
log(){ echo "$(date +%T) $*"; }
step(){ [ -f $S/$1.ok ] && { log "skip $1"; return 0; }; log "start $1"; if eval "$2"; then touch $S/$1.ok; log "ok $1"; else log "FAIL $1"; exit 1; fi; }
# 1 wait for the multi-lot audit page reads (mlot6) to finish
step 01_wait 'while [ ! -f mlot6/FETCH_DONE ]; do sleep 30; done'
# 2 full build (reparse, rows, QA merge, KEEP_BASE build, fix5, postfix, coords, windows, report, QA samples)
step 02r_refix 'tools/refix6.sh $T > logs/refix_$T.txt 2>&1 && test -f out_$T/DONE'
# 3 local commit (snapshot, coords, stats, code, scripts under lib/agent-core/scripts/harvest-2026-10-31/)
step 03r_commit 'cd $W && mkdir -p lib/agent-core/scripts/harvest-2026-10-31 && cp $H/tools/{fetch.py,run_fetch.sh,left.py,parse_generic.py,facts.py,decide_pa.py,rows_from_pages.py,qa_merge.py,rvtype.py,report.py,qa_sample.py,qa_sample5.py,postfix.py,fix5.py,lotparse.py,loc_parse.py,urlloc.py,site_addrs.py,site_lots.py,finalize.sh,run_trial6.sh,run_trial6r.sh,refix6.sh,fix6.py,onorder.py,home_lots.py,multi_audit.py,qa_sample6.py,stats6.py,bundle6.py} lib/agent-core/scripts/harvest-2026-10-31/ && python3 $H/tools/stats6.py > lib/agent-core/data/harvest-2026-10-31.stats.json && cp $H/out_$T/inventory.snapshot.json.gz lib/agent-core/data/inventory.snapshot.json.gz && cp $H/out_$T/dealer-city-coords.ts lib/agent-core/src/dealer-city-coords.ts && git add -A lib/agent-core artifacts/api-server/src artifacts/api-server/test/mcp-refine-walkthrough.test.ts && (git commit -q --amend --no-edit) && cd $H'
# 4 rebase onto origin/main if clean (no push)
step 04r_rebase 'cd $W && git fetch -q origin main && (git rebase -q origin/main && echo REBASED $(git rev-parse --short origin/main) || { git rebase --abort; echo REBASE_CONFLICT_kept_unrebased; }) > $H/out_$T/rebase.txt 2>&1; cat $H/out_$T/rebase.txt; cd $H'
# 5 tests
step 05r_test_core 'cd $W/lib/agent-core && timeout 1500 npx vitest run > $H/out_$T/test_agent_core.txt 2>&1; r=$?; cd $H; tail -6 out_$T/test_agent_core.txt; true'
step 06r_test_api 'cd $W/artifacts/api-server && timeout 2400 npx vitest run --maxWorkers=2 --minWorkers=1 > $H/out_$T/test_api.txt 2>&1; cd $H; pkill -f "vitest.*api-server" ; tail -6 out_$T/test_api.txt; true'
step 07r_test_web 'cd $W/artifacts/rv-marketplace && timeout 1200 npx vitest run > $H/out_$T/test_web.txt 2>&1; cd $H; tail -6 out_$T/test_web.txt; true'
# 8 memory probe (api-server loader on the committed snapshot)
step 08r_mem 'cp mem/_mem_new.ts $W/artifacts/api-server/_mem_new.ts && cd $W/artifacts/api-server && (NODE_OPTIONS=--expose-gc npx tsx _mem_new.ts > $H/out_$T/mem.json 2>&1; rm -f _mem_new.ts) && cd $H && cat out_$T/mem.json | tail -1'
# 9 bundle
step 09r_bundle 'python3 tools/bundle6.py'
log "ALL DONE"; touch out_$T/PIPELINE_DONE

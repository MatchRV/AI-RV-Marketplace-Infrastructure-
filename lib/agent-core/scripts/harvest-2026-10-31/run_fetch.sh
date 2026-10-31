#!/bin/bash
# usage: run_fetch.sh <dir>  — detached supervisor: re-runs the resumable fetcher (checkpoint = <dir>/results.ndjson)
# until done; watchdog kills a fetcher whose results.ndjson has not grown for 10 min (hung sockets), then restarts it.
D=$1; S=$(dirname "$(readlink -f "$0")"); cd "$D"; export PP_DIR="$D"; export PP_INFLIGHT=${PP_INFLIGHT:-1}; export PP_DELAY=${PP_DELAY:-1.6}
touch results.ndjson
for i in $(seq 1 200); do
  python3 "$S/fetch.py" targets.ndjson >> fetch.log 2>&1 &
  P=$!
  while kill -0 $P 2>/dev/null; do
    sleep 60
    age=$(( $(date +%s) - $(stat -c %Y results.ndjson) ))
    if [ $age -gt 600 ]; then echo "$(date '+%H:%M:%S') watchdog: no result for ${age}s, killing $P" >> fetch.log; kill $P; sleep 5; kill -9 $P 2>/dev/null; fi
  done
  left=$(python3 "$S/left.py" "$D")
  echo "$(date '+%H:%M:%S') supervisor pass $i: $left targets left" >> fetch.log
  [ "$left" -eq 0 ] && break
  [ "$left" -le 30 ] && [ $i -ge 3 ] && break
  sleep 120
done
echo "$(date '+%H:%M:%S') FETCH_COMPLETE" >> fetch.log; touch FETCH_DONE

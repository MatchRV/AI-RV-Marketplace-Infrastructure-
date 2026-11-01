#!/bin/bash
# Detached supervisor for the page pass: re-runs the resumable fetcher until every target has a result
# (results.ndjson is the checkpoint: one flushed line per page; restarts skip finished keys, retry errors/5xx,
# and never retry a host that showed a bot wall). Then parses the pages. Logs to $PP_DIR/fetch.log.
PP_DIR=${PP_DIR:-/workspace/harvest-2026-10-30/pagepass}; S=$(dirname "$0"); cd "$PP_DIR"
export PP_INFLIGHT_MAP=${PP_INFLIGHT_MAP:-rv.campingworld.com=3}
for i in $(seq 1 30); do
  python3 "$S/fetch.py" targets.ndjson >> fetch.log 2>&1
  left=$(python3 - <<'PY'
import json
done=set(); walled=set()
for l in open("results.ndjson"):
    j=json.loads(l)
    if j.get("result")=="bot_wall": walled.add(j["host"])
    if j.get("result")!="error" and not (j.get("http") or 0)>=500: done.add(j["key"])
from urllib.parse import urlparse
print(sum(1 for l in open("targets.ndjson") for t in [json.loads(l)] if t["key"] not in done and urlparse(t["url"]).netloc not in walled))
PY
)
  echo "$(date '+%H:%M:%S') supervisor pass $i: $left targets left" >> fetch.log
  [ "$left" -le 30 ] && [ $i -ge 2 ] && break
  [ "$left" -eq 0 ] && break
  sleep 30
done
python3 "$S/parse.py" >> fetch.log 2>&1 && echo "$(date '+%H:%M:%S') PAGEPASS_FETCH_COMPLETE" >> fetch.log

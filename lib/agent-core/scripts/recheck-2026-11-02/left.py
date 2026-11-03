import json,sys
from urllib.parse import urlparse
D=sys.argv[1]; done=set(); walled=set()
for l in open(f"{D}/results.ndjson"):
    try: j=json.loads(l)
    except Exception: continue
    if j.get("result")=="bot_wall": walled.add(j["host"])
    if j.get("result")!="error" and not (j.get("http") or 0)>=500: done.add(j["key"])
print(sum(1 for l in open(f"{D}/targets.ndjson") for t in [json.loads(l)] if t["key"] not in done and urlparse(t["url"]).netloc not in walled))

"""Collect unit-page URLs from dealer sitemaps (robots.txt obeyed, >=1.6 s per host, stop at bot wall / 403 / 429).
usage: sitemaps.py <domains.json [[domain, sitemap_url], ...]> <out.ndjson> <url-regex>"""
import json,re,sys,time,threading,os,gzip
from urllib.parse import urlparse
from urllib import robotparser
import requests
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0; +https://matchrv.com)"
BOT=re.compile(r'cf-chl|<title>\s*Just a moment|Attention Required! \| Cloudflare|/cdn-cgi/challenge-platform/h/|_Incapsula_Resource|px-captcha|captcha-delivery|datadome',re.I)
doms=json.load(open(sys.argv[1])); OUT=sys.argv[2]; PAT=re.compile(sys.argv[3]); lock=threading.Lock()
done=set()
if os.path.exists(OUT): done={json.loads(l)["domain"] for l in open(OUT)}
def one(dom,sm):
    s=requests.Session(); s.headers.update({"User-Agent":UA}); last=[0.0]
    def get(u):
        w=last[0]+1.6-time.time()
        if w>0: time.sleep(w)
        last[0]=time.time(); return s.get(u,timeout=(10,60))
    res={"domain":dom,"sitemap":sm,"urls":[],"fetchedAt":time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    try:
        host=urlparse(sm).netloc; rp=robotparser.RobotFileParser()
        r=get(f"https://{host}/robots.txt")
        if r.status_code in(403,429) or BOT.search(r.text[:20000]): res["wall"]=f"robots {r.status_code}"; return res
        rp.parse(r.text.splitlines() if r.status_code==200 else [])
        q=[sm]+([x.strip() for x in re.findall(r'(?im)^\s*sitemap:\s*(\S+)',r.text)] if r.status_code==200 else []); seen=set(); urls=set()
        while q and len(seen)<60:
            u=q.pop(0)
            if u in seen: continue
            seen.add(u)
            if not (rp.can_fetch(UA,u) and rp.can_fetch("*",u)): res.setdefault("robots_blocked",[]).append(u); continue
            r=get(u)
            if r.status_code in(403,429) or BOT.search(r.text[:20000]): res["wall"]=f"sitemap {r.status_code}"; break
            if r.status_code!=200: res.setdefault("errors",[]).append([u,r.status_code]); continue
            body=r.content
            if u.endswith(".gz") or body[:2]==b"\x1f\x8b":
                try: body=gzip.decompress(body)
                except Exception: pass
            t=body.decode("utf-8","replace")
            locs=re.findall(r'<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)',t)
            if "<sitemapindex" in t: q.extend(l for l in locs if not re.search(r'blog|post|page-sitemap|category|tag|author',l,re.I))
            else:
                for l in locs:
                    if PAT.search(l) and rp.can_fetch(UA,l) and rp.can_fetch("*",l): urls.add(l.replace("&amp;","&"))
        res["urls"]=sorted(urls)
    except Exception as e: res["error"]=str(e)[:200]
    return res
def run(items):
    for dom,sm in items:
        r=one(dom,sm)
        with lock:
            with open(OUT,"a") as f: f.write(json.dumps(r)+"\n")
            print(time.strftime('%H:%M:%S'),dom,len(r["urls"]),r.get("wall") or r.get("error") or "",flush=True)
items=[d for d in doms if d[0] not in done]
N=int(os.environ.get("THREADS","40")); ths=[threading.Thread(target=run,args=(items[i::N],)) for i in range(N)]
for t in ths: t.start()
for t in ths: t.join()
print("SITEMAPS_DONE",flush=True)

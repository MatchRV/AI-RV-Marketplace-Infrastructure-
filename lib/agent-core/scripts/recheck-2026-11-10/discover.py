"""Unit-page URL discovery for small dealer sites without a unit sitemap (2026-11-01).
Per host: robots.txt obeyed (our UA and '*'), >=1.6 s between requests, stop at first bot wall / 403 / 429.
Reads the homepage, follows up to MAXL inventory index pages (links whose path says inventory / for sale / new / used / pre-owned / search,
plus ?page= / pg= pagination of those), and records links that look like single-unit detail pages (a model year 1980-2027 in the path, or
/vdp/ /inventory/<slug> /product/<slug> /listing/ /unit/ detail patterns). Nothing is inferred about the units here.
usage: discover.py <domains.json [[domain, start_url], ...]> <out.ndjson>"""
import json,re,sys,time,threading,os
from urllib.parse import urlparse,urljoin,urldefrag
from urllib import robotparser
import requests
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0; +https://matchrv.com)"
BOT=re.compile(r'cf-chl|<title>\s*Just a moment|Attention Required! \| Cloudflare|/cdn-cgi/challenge-platform/h/|_Incapsula_Resource|px-captcha|captcha-delivery|datadome|<title>\s*One moment, please',re.I)
MAXL=int(os.environ.get("MAXL","40"))
IDX=re.compile(r'(?i)(inventory|for-sale|forsale|rvs-for-sale|/new|/used|pre-owned|preowned|/search|/units|/listings|/rvs\b|/campers|/trailers|consign|showroom|/stock)')
DET=re.compile(r'(?i)(/vdp/\d+|/(?:19[89]\d|20[0-2]\d)[-_/][a-z]|[-_/](?:19[89]\d|20[0-2]\d)[-_][a-z][a-z0-9-]{3,}|/product/[a-z0-9-]*\d{5,}|/listing/|/unit/|/details?/)')
BAD=re.compile(r'(?i)\.(jpg|jpeg|png|gif|webp|pdf|css|js)(\?|$)|/blog|/news|/wp-content|/tag/|/category/|/author/|mailto:|tel:|/service|/parts|/financ|/contact|/about|/privacy|/careers|/specials?$')
done=set()
OUT=sys.argv[2]
if os.path.exists(OUT): done={json.loads(l)["domain"] for l in open(OUT)}
lock=threading.Lock()
def one(dom,start):
    s=requests.Session(); s.headers.update({"User-Agent":UA}); last=[0.0]
    res={"domain":dom,"start":start,"index_pages":[],"units":[],"fetchedAt":time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    def get(u):
        w=last[0]+1.6-time.time()
        if w>0: time.sleep(w)
        last[0]=time.time(); return s.get(u,timeout=(10,40),allow_redirects=True)
    try:
        host=urlparse(start).netloc; rp=robotparser.RobotFileParser()
        r=get(f"{urlparse(start).scheme}://{host}/robots.txt")
        if r.status_code in(403,429) or BOT.search(r.text[:20000]): res["wall"]=f"robots {r.status_code}"; return res
        rp.parse(r.text.splitlines() if r.status_code==200 else [])
        ok=lambda u: rp.can_fetch(UA,u) and rp.can_fetch("*",u)
        q=[start]; seen=set(); units=set(); n=0
        while q and n<MAXL:
            u=q.pop(0)
            if u in seen: continue
            seen.add(u)
            if not ok(u): res.setdefault("robots_blocked",[]).append(u); continue
            r=get(u); n+=1
            if r.status_code in(403,429) or BOT.search(r.text[:200000]): res["wall"]=f"{r.status_code} at {u}"; break
            if r.status_code!=200: continue
            res["index_pages"].append(u); fh=urlparse(r.url).netloc
            for h in re.findall(r'href=["\']([^"\'#]+)',r.text):
                a=urldefrag(urljoin(r.url,h.replace('&amp;','&')))[0]
                pa=urlparse(a)
                if pa.netloc.replace('www.','')!=fh.replace('www.','') or BAD.search(a): continue
                if DET.search(pa.path):
                    if ok(a): units.add(a)
                elif IDX.search(pa.path+('?'+pa.query if pa.query else '')) and a not in seen and len(q)<200:
                    q.append(a)
        res["units"]=sorted(units)
    except Exception as e: res["error"]=str(e)[:200]
    return res
def run(items):
    for dom,st in items:
        r=one(dom,st)
        with lock:
            open(OUT,"a").write(json.dumps(r)+"\n")
            print(time.strftime('%H:%M:%S'),dom,"index",len(r["index_pages"]),"units",len(r["units"]),r.get("wall") or r.get("error") or "",flush=True)
items=[d for d in json.load(open(sys.argv[1])) if d[0] not in done]
N=int(os.environ.get("THREADS","20")); ths=[threading.Thread(target=run,args=(items[i::N],)) for i in range(N)]
for t in ths: t.start()
for t in ths: t.join()
print("DISCOVER_DONE",flush=True)

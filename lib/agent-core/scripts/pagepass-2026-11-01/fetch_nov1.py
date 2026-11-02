"""Page pass fetcher (2026-10-30 night). Reads dealer listing pages for the targets in targets.ndjson.
robots.txt obeyed per host (urllib.robotparser, our UA and '*'); >=1.6 s start-to-start per host; requests to a host are
started at least DELAY apart by one shared per-host clock (up to PP_INFLIGHT=2 in flight, so a slow server
does not stretch the gap; the request rate never exceeds one per DELAY); no proxy, no browser, no cookies kept. A host is stopped at the first bot wall / Cloudflare challenge /
captcha / 403 (never bypassed). HTTP 429: one 120 s back-off with a doubled delay, then stop the host.
Each fetched page is stored gzip-compressed (pages/<sha1>.html.gz) and one JSON line is appended to
results.ndjson. Resumable: targets whose key is already in results.ndjson are skipped."""
import json,re,sys,os,time,threading,hashlib,gzip
from urllib.parse import urlparse
from urllib import robotparser
import requests
B=os.environ.get("PP_DIR","/workspace/harvest-2026-10-30/pagepass")
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0; +https://matchrv.com)"
DELAY=float(os.environ.get("PP_DELAY","1.6"))
# Challenge / bot-wall pages only. (Turnstile or reCAPTCHA scripts preloaded for a page's own forms are not a wall;
# a challenge script on a short page with no listing content is.)
BOT=re.compile(r'cf-chl|<title>\s*Just a moment|Attention Required! \| Cloudflare|/cdn-cgi/challenge-platform/h/|_Incapsula_Resource|px-captcha|captcha-delivery|datadome',re.I)
def walled(body):
    return bool(BOT.search(body[:200000])) or (len(body)<30000 and re.search(r'challenges\.cloudflare\.com|g-recaptcha|hcaptcha',body,re.I) is not None)
lock=threading.Lock()
def log(*a):
    with lock: print(time.strftime('%H:%M:%S'),*a,flush=True)
def robots_for(base,sess):
    rp=robotparser.RobotFileParser()
    r=sess.get(base+"/robots.txt",timeout=20,headers={"User-Agent":UA})
    if r.status_code==200 and not BOT.search(r.text): rp.parse(r.text.splitlines())
    elif r.status_code in (401,403): rp.parse(["User-agent: *","Disallow: /"])
    else: rp.parse([])
    return rp
class Host:
    def __init__(self,host):
        self.host=host; self.lock=threading.Lock(); self.last=0.0; self.delay=DELAY; self.backed=False; self.stopped=False
        self.sess=requests.Session(); self.sess.headers.update({"User-Agent":UA,"Accept-Encoding":"gzip, deflate","Accept":"text/html,application/xhtml+xml"})
    def slot(self):
        with self.lock:
            w=self.last+self.delay-time.time()
            if w>0: time.sleep(w)
            self.last=time.time()
INFLIGHT=int(os.environ.get("PP_INFLIGHT","2"))
# per-host override, e.g. PP_INFLIGHT_MAP="rv.campingworld.com=3" (CW renders a page in 2-5 s; the start-to-start
# gap per host is unchanged)
INFLIGHT_MAP={k:int(v) for k,v in (x.split("=") for x in os.environ.get("PP_INFLIGHT_MAP","").split(",") if "=" in x)}
outlock=threading.Lock()
def worker(host,items,stats):
    H=Host(host); base=f"https://{host}"
    try: rp=robots_for(base,H.sess)
    except Exception as e: log(host,"robots error",e); rp=robotparser.RobotFileParser(); rp.parse([])
    H.last=time.time()
    out=open(f"{B}/results.ndjson","a"); it=iter(enumerate(items)); itlock=threading.Lock(); n=len(items)
    def run():
        while not H.stopped:
            with itlock:
                try: i,t=next(it)
                except StopIteration: return
            url=t["url"]; rec={"key":t["key"],"kind":t["kind"],"url":url,"host":host}
            if not (rp.can_fetch(UA,url) and rp.can_fetch("*",url)):
                rec.update(result="robots_disallowed",fetchedAt=None)
            else:
                while True:
                    H.slot()
                    if H.stopped: return
                    rec["fetchedAt"]=time.strftime('%Y-%m-%dT%H:%M:%S%z')
                    try:
                        r=H.sess.get(url,timeout=(15,40),allow_redirects=True); body=r.text; code=r.status_code
                        rec.update(http=code,finalUrl=r.url,redirects=[h.status_code for h in r.history])
                    except Exception as e:
                        rec.update(result="error",error=str(e)[:200]); body=None; code=None
                    if code==429:
                        with H.lock:
                            if not H.backed:
                                H.backed=True; H.delay*=2; log(host,"429 -> backing off 120s, delay",H.delay); time.sleep(120); H.last=time.time(); retry=True
                            else: retry=False
                        if retry: continue
                    break
                if body is not None:
                    if code==429 or code==403 or walled(body):
                        rec["result"]="bot_wall"; H.stopped=True
                        with outlock: out.write(json.dumps(rec)+"\n"); out.flush()
                        stats[host]["bot_wall"]=stats[host].get("bot_wall",0)+1
                        log(host,"STOP: bot wall/403/429 at",url,"code",code); return
                    h=hashlib.sha1(url.encode()).hexdigest()
                    with gzip.open(f"{B}/pages/{h}.html.gz","wt",compresslevel=6) as f: f.write(body)
                    rec.update(result="ok" if code<500 else "error",page=h,len=len(body))
            with outlock:
                out.write(json.dumps(rec)+"\n"); out.flush()
                s=stats[host]; s[rec.get("result")]=s.get(rec.get("result"),0)+1
                if i%200==0: log(host,i,"/",n,dict(s))
    ths=[threading.Thread(target=run) for _ in range(INFLIGHT_MAP.get(host,INFLIGHT))]
    for th in ths: th.start()
    for th in ths: th.join()
    log(host,"DONE",dict(stats[host]))
def main():
    os.makedirs(f"{B}/pages",exist_ok=True)
    done=set()
    if os.path.exists(f"{B}/results.ndjson"):
        for l in open(f"{B}/results.ndjson"):
            try: j=json.loads(l)
            except Exception: continue
            if j.get("result")!="error" and not (j.get("http") or 0)>=500: done.add(j["key"])  # errors / 5xx are retried
    tg=[json.loads(l) for l in open(sys.argv[1])]
    byhost={}
    for t in tg:
        if t["key"] in done: continue
        byhost.setdefault(urlparse(t["url"]).netloc,[]).append(t)
    walled=set()
    if os.path.exists(f"{B}/results.ndjson"):
        for l in open(f"{B}/results.ndjson"):
            j=json.loads(l)
            if j.get("result")=="bot_wall": walled.add(j["host"])
    stats={h:{} for h in byhost}
    ths=[]
    for h,items in byhost.items():
        if h in walled: log(h,"skipped: bot wall earlier"); continue
        log(h,"targets",len(items)); th=threading.Thread(target=worker,args=(h,items,stats)); th.start(); ths.append(th)
    for th in ths: th.join()
    json.dump(stats,open(f"{B}/fetch_stats_{int(time.time())}.json","w"),indent=1)
main()

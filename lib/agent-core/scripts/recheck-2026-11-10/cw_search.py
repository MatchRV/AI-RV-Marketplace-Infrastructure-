"""cw_search.py: Camping World public listing pages (robots.txt allows; Disallow only /_vercel/insights/view and ?_rsc=): /rvs-for-sale?page=N,
the server-rendered hit list for the default location (Seattle, 150 mi; capped at 44 pages = ~1,000 nearest units). 1 request in flight, >=2 s apart,
stop at any bot wall / 403 / 429. Raw pages are stored gzip; hits are parsed by cw_hits.py."""
import requests,time,gzip,json,re,sys
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0; +https://matchrv.com)"
D='/workspace/harvest-recheck-2026-11-10/cw_search'
BOT=re.compile(r'cf-chl|<title>\s*Just a moment|Attention Required! \| Cloudflare|/cdn-cgi/challenge-platform/h/|_Incapsula_Resource|px-captcha|captcha-delivery|datadome',re.I)
s=requests.Session(); s.headers.update({"User-Agent":UA})
log=open(f'{D}/fetch.ndjson','a')
for p in range(1,45):
    url=f"https://rv.campingworld.com/rvs-for-sale?page={p}"
    t0=time.time(); r=s.get(url,timeout=(15,60))
    rec={"page":p,"url":url,"http":r.status_code,"fetchedAt":time.strftime('%Y-%m-%dT%H:%M:%S%z'),"len":len(r.text)}
    if r.status_code in (403,429) or BOT.search(r.text[:200000]): rec["result"]="bot_wall"; log.write(json.dumps(rec)+"\n"); log.flush(); print("STOP",rec); break
    with gzip.open(f"{D}/pages/p{p}.html.gz","wt",compresslevel=6) as f: f.write(r.text)
    rec["result"]="ok"; log.write(json.dumps(rec)+"\n"); log.flush()
    time.sleep(max(0,2.0-(time.time()-t0)))
print("DONE")

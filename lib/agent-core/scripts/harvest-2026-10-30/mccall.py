"""Logged MarketCheck caller. Never prints keys."""
import os,json,time,urllib.request,urllib.error,urllib.parse,datetime,threading
LOG=os.path.join(os.path.dirname(os.path.abspath(__file__)),"logs","mc_calls.jsonl")
_keys={n:open(f"/home/box/.secrets/{n}").read().strip() for n in ("marketcheck_east","marketcheck_az_ca")}
quota={n:None for n in _keys}; RESERVE=int(os.getenv("MC_RESERVE","15"))
_lock=threading.Lock(); _last=[0.0]
class QuotaExhausted(Exception): pass
def pick():
    best=None
    for n in _keys:
        q=quota[n]
        if q is None or q>RESERVE:
            if best is None or (q or 10**9)>(quota[best] or 10**9): best=n
    if best is None: raise QuotaExhausted(str(quota))
    return best
def call(endpoint,params,purpose,key=None):
    for attempt in range(5):
        n=key or pick(); k=_keys[n]
        with _lock:
            dt=time.time()-_last[0]
            if dt<0.35: time.sleep(0.35-dt)
            _last[0]=time.time()
        url=f"https://api.marketcheck.com{endpoint}?"+urllib.parse.urlencode({"api_key":k,**params})
        rec={"at":datetime.datetime.now().astimezone().isoformat(),"key":n,"endpoint":endpoint,"params":params,"purpose":purpose}
        try:
            r=urllib.request.urlopen(url,timeout=120); d=json.load(r)
            quota[n]=int(r.headers.get("quota-remaining","0")); rec.update(status=200,quota_remaining=quota[n],num_found=d.get("num_found"),n=len(d.get("listings",[]) or []))
            open(LOG,"a").write(json.dumps(rec)+"\n"); return d
        except urllib.error.HTTPError as e:
            body=e.read().decode()[:300].replace(k,"<KEY>"); q=e.headers.get("quota-remaining")
            if q is not None: quota[n]=int(q)
            rec.update(status=e.code,body=body); open(LOG,"a").write(json.dumps(rec)+"\n")
            if e.code==429 and "quota" in body.lower(): quota[n]=0; 
            if e.code==429: time.sleep(2**attempt); continue
            return None
        except Exception as e:
            rec.update(status="err",body=str(e)[:200].replace(k,"<KEY>")); open(LOG,"a").write(json.dumps(rec)+"\n"); time.sleep(2**attempt)
    return None

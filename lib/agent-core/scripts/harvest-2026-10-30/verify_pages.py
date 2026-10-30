"""Live/price verification of harvested listing pages (no LLM). robots.txt respected, >=1.5 s per host,
a host is dropped at the first bot wall (logged, never bypassed). Extracts only what the page states:
schema.org offer price/availability, labeled prices, call-for-price and sold/pending markers, VIN/stock presence."""
import json,re,sys,os,time,threading,random,collections as C,gzip,html as H
from urllib.parse import urlparse
from urllib import robotparser
import requests
B="/workspace/harvest-2026-10-30"; OUT=f"{B}/verify/pages.jsonl"
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0)"
BOT=re.compile(r'challenges\.cloudflare\.com|cf-chl|<title>\s*Just a moment|_Incapsula_Resource|px-captcha|captcha-delivery|datadome',re.I)
SALE=r'(?:sale|our|now|internet|special|your|selling|clearance|discount(?:ed)?|dealer|e-?price|today\'?s|best|value|hot|blowout|cash)\s*price|now(?:\s+only)?|sale'
NEG=r'msrp|list\s*price|was|retail(?:\s*price)?|original\s*price|reg(?:ular)?\.?\s*price|compare\s*at|starting\s*msrp'
NUM=r'\$\s?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})(?:\.\d\d)?'
RE_SALE=re.compile(r'\b(?:'+SALE+r')\b\s*[:\-]?\s*'+NUM,re.I)
RE_NEG=re.compile(r'\b(?:'+NEG+r')\b\s*[:\-]?\s*'+NUM,re.I)
RE_PRICE=re.compile(r'\bprice\b\s*[:\-]?\s*'+NUM,re.I)
CALL=re.compile(r'call\s+for\s+(?:best\s+)?price|contact\s+(?:seller|dealer|us)\s+for\s+price|contact\s+seller|get\s+(?:sale|our|best|e-?)\s*price|request\s+(?:a\s+)?price|price\s+on\s+request|call\s+for\s+pricing|click\s+for\s+price',re.I)
PEND=re.compile(r'\bsale\s+pending\b|\bpending\s+sale\b|\bdeposit\s+(?:taken|received)\b|\bsold\s+pending\b',re.I)
SOLDTAG=re.compile(r'>\s*(?:SOLD!?|Sold!?|Sale Pending|SALE PENDING|Pending|PENDING|On Hold|ON HOLD)\s*<')
lock=threading.Lock(); robots={}
def text_of(h):
    h=re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>',' ',h); h=re.sub(r'(?s)<[^>]+>',' ',h); return re.sub(r'\s+',' ',H.unescape(h))
def nums(rx,t):
    out=[]
    for m in rx.finditer(t):
        tail=t[m.end():m.end()+18].lower()
        if re.match(r'\s*(/\s*mo|per\s+mo|mo\b|a\s+month|/month|down|bi-?weekly|/wk)',tail): continue
        v=float(m.group(1).replace(',',''))
        if v>=1000: out.append(v)
    return out
def ld(h):
    prices=[];avail=[]
    for s in re.findall(r'(?is)<script[^>]+application/ld\+json[^>]*>(.*?)</script>',h):
        try: j=json.loads(s.strip())
        except Exception: continue
        st=[j]
        while st:
            o=st.pop()
            if isinstance(o,list): st.extend(o); continue
            if not isinstance(o,dict): continue
            off=o.get("offers")
            for of in (off if isinstance(off,list) else [off] if isinstance(off,dict) else []):
                if not isinstance(of,dict): continue
                for k in ("price","lowPrice"):
                    try:
                        v=float(str(of.get(k)).replace(',','').replace('$',''))
                        prices.append(v)
                    except Exception: pass
                if of.get("availability"): avail.append(str(of["availability"]).rsplit('/',1)[-1])
            st.extend(v for v in o.values() if isinstance(v,(dict,list)))
    for m in re.finditer(r'itemprop=["\']price["\'][^>]*content=["\']([\d.,]+)',h):
        try: prices.append(float(m.group(1).replace(',','')))
        except Exception: pass
    return prices,avail
def allowed(url):
    p=urlparse(url); base=f"{p.scheme}://{p.netloc}"
    if base not in robots:
            rp=robotparser.RobotFileParser()
            try:
                rr=requests.get(base+"/robots.txt",timeout=15,headers={"User-Agent":UA}); rp.parse(rr.text.splitlines() if rr.status_code==200 and not BOT.search(rr.text) else [])
            except Exception: rp.parse([])
            robots[base]=rp
    return robots[base].can_fetch("*",url)
def analyze(t,h,status,final,resp_len):
    txt=text_of(h); lp,av=ld(h)
    vin=t.get("vin"); stk=t.get("stock")
    hu=h.upper()
    return {"status":status,"final_url":final,"len":resp_len,"ld_prices":lp[:6],"ld_avail":av[:4],
            "sale_prices":nums(RE_SALE,txt)[:8],"neg_prices":nums(RE_NEG,txt)[:8],"plain_prices":nums(RE_PRICE,txt)[:8],
            "call_for_price":bool(CALL.search(txt)),"pending_text":bool(PEND.search(txt)),"sold_tag":bool(SOLDTAG.search(h)),
            "vin_on_page":(vin.upper() in hu) if vin else None,"stock_on_page":(str(stk).upper() in hu) if stk else None,
            "title":(re.search(r'(?is)<title[^>]*>(.*?)</title>',h).group(1).strip()[:160] if re.search(r'(?is)<title[^>]*>(.*?)</title>',h) else None)}
def host_worker(host,items,out,stats):
    last=0.0
    for t in items:
        url=t["url"]; rec={"id":t["id"],"url":url,"host":host,"fetched_at":time.strftime('%Y-%m-%dT%H:%M:%S%z')}
        try:
            if not allowed(url): rec["result"]="robots_disallowed"; 
            else:
                w=last+1.5-time.time()
                if w>0: time.sleep(w)
                last=time.time()
                r=requests.get(url,timeout=20,headers={"User-Agent":UA},allow_redirects=True)
                h=r.text[:3_000_000]
                if BOT.search(h[:200000]) or (r.status_code in (403,429,503) and re.search(r'cloudflare|captcha|access denied|attention required',h[:50000],re.I)):
                    rec["result"]="bot_wall"; rec["status"]=r.status_code
                    with lock: out.write(json.dumps(rec)+"\n"); out.flush(); stats["bot_wall_host"]+=1
                    return  # stop this host
                rec["result"]="ok"; rec.update(analyze(t,h,r.status_code,r.url,len(r.content)))
        except Exception as e:
            rec["result"]="error"; rec["error"]=type(e).__name__
        with lock: out.write(json.dumps(rec)+"\n"); stats[rec["result"]]+=1
def main():
    targets=[json.loads(l) for l in open(f"{B}/verify/targets.jsonl")]
    done=set(); walled=set()
    if os.path.exists(OUT):
        for l in open(OUT):
            try:
                j=json.loads(l); done.add(j["url"])
                if j.get("result")=="bot_wall": walled.add(j["host"])
            except Exception: pass
    byhost=C.defaultdict(list)
    for t in targets:
        if t["url"] in done or urlparse(t["url"]).netloc.lower() in walled: continue  # never return to a bot-walled host
        byhost[urlparse(t["url"]).netloc.lower()].append(t)
    out=open(OUT,"a"); stats=C.Counter()
    ths=[threading.Thread(target=host_worker,args=(h,v,out,stats),daemon=True) for h,v in byhost.items()]
    print("hosts",len(ths),"urls",sum(len(v) for v in byhost.values()),flush=True)
    for th in ths: th.start()
    while any(th.is_alive() for th in ths):
        time.sleep(30); out.flush(); print(time.strftime('%H:%M:%S'),dict(stats),"alive",sum(th.is_alive() for th in ths),flush=True)
    out.close(); print("DONE",dict(stats),flush=True)
if __name__=="__main__": main()

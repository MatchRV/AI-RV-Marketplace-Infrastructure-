"""Fill missing specs for harvested units from their own dealer listing page, via GPT-6 Luna (Experiential Labs).
Only values literally stated on the page are kept: the model must return the exact quote, the quote must appear
in the page text, and the number must appear in the quote. robots.txt respected, >=1.5 s per host, a host is
dropped at the first bot check / 403 / 429. Key from env EXPERIENTIAL_LABS_API_KEY; never printed or logged."""
import os,re,json,time,random,threading,urllib.robotparser,collections as C,concurrent.futures as cf,datetime,html as H
import requests
B="/workspace/harvest-2026-10-30"; KEY=os.environ["EXPERIENTIAL_LABS_API_KEY"]
BASE="https://api.experientiallabs.ai/v1"; MODEL="gpt-6-luna"; UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0)"
MAXN=int(os.getenv("LUNA_MAX","1500")); PER_HOST=int(os.getenv("LUNA_PER_HOST","12"))
BOT=re.compile(r'cdn-cgi/challenge-platform|challenges\.cloudflare\.com|cf-chl|Just a moment\.\.\.|_Incapsula_Resource|px-captcha|captcha-delivery|datadome|g-recaptcha|hcaptcha',re.I)
FIELDS=["sleeps","length_ft","dry_weight_lbs","gvwr_lbs","hitch_weight_lbs","slideouts","fresh_water_gal","grey_water_gal","black_water_gal"]
RAWF={"sleeps":"sleeps","length_ft":"length","dry_weight_lbs":"dry_weight","gvwr_lbs":"gvwr","hitch_weight_lbs":"hitch_weight","slideouts":"slideouts"}
rows=[json.loads(l) for l in open(f"{B}/raw_records.ndjson")]
done=set()
done={json.loads(l)["listing_url"] for l in open(f"{B}/luna/category.jsonl")} if os.path.exists(f"{B}/luna/category.jsonl") else set()
os.makedirs(f"{B}/luna",exist_ok=True)
SPECF=f"{B}/luna/category.jsonl"
UNRES=set(json.load(open(f"{B}/unresolved_type_urls.json")))
cand=[r for r in rows if r["_meta"].get("listing_url") in UNRES and r["_meta"]["listing_url"] not in done]
random.seed(20261030); random.shuffle(cand)
byhost=C.defaultdict(list)
for r in cand:
    h=re.sub(r'^www\.','',requests.utils.urlparse(r["_meta"]["listing_url"]).netloc.lower())
    if len(byhost[h])<PER_HOST: byhost[h].append(r)
sel=[]
for i in range(PER_HOST):
    for h in list(byhost):
        if i<len(byhost[h]): sel.append((h,byhost[h][i]))
sel=sel[:MAXN]
print("candidates",len(cand),"hosts",len(byhost),"selected",len(sel),flush=True)
callog=open(f"{B}/logs/luna_calls.jsonl","a"); specout=open(f"{B}/luna/category.jsonl","a"); fetchlog=open(f"{B}/logs/luna_fetch.jsonl","a")
lock=threading.Lock(); hostlock=C.defaultdict(threading.Lock); last=C.defaultdict(float); dead=set(); robots={}
if os.path.exists(f"{B}/logs/luna_fetch.jsonl"):
    for l in open(f"{B}/logs/luna_fetch.jsonl"):
        e=json.loads(l)
        if e.get("result")=="bot_check_or_blocked_host_dropped" and e.get("host"): dead.add(e["host"])
print("hosts previously dropped at a bot check:",len(dead),flush=True)
sel=[x for x in sel if x[0] not in dead]
def allowed(url):
    p=requests.utils.urlparse(url); base=f"{p.scheme}://{p.netloc}"
    with hostlock[base+"#r"]:
        if base not in robots:
            rp=urllib.robotparser.RobotFileParser()
            try:
                rr=requests.get(base+"/robots.txt",timeout=15,headers={"User-Agent":UA}); rp.parse(rr.text.splitlines() if rr.status_code==200 and not BOT.search(rr.text) else [])
            except Exception: rp.parse([])
            robots[base]=rp
    return robots[base].can_fetch("*",url)
def text_of(html):
    html=re.sub(r'(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>',' ',html)
    t=H.unescape(re.sub(r'(?s)<[^>]+>',' ',html)); return re.sub(r'\s+',' ',t).strip()
def focus(t,n=9000):
    kws=[m.start() for m in re.finditer(r'(?i)sleeps|sleeping|length|dry weight|gvwr|hitch|slide|fresh water|gr[ae]y water|black water|uvw|specification',t)]
    if not kws: return t[:n]
    a=max(0,kws[0]-1500); return t[a:a+n]
def luna(title,url,txt):
    prompt=("You extract RV specifications from ONE dealer listing page. Only report a value if the page text literally states it for THIS unit "
      f"({title}). Never infer, estimate, convert from other units, or use outside knowledge. For each field return null or "
      '{"value": <number>, "quote": "<exact short substring of the page text containing the value>"}. '
      f"Fields: rv_category (the RV type the dealer states for THIS unit, e.g. Travel Trailer, Fifth Wheel, Toy Hauler, Class A, Class B, Class C, Truck Camper, Pop-Up; quote the label and value, e.g. 'Type: Travel Trailer'; null if the page does not state it for this unit, and never use site navigation menus), {', '.join(FIELDS)}. length_ft in feet (if stated as 32\\' 6\\\" give 32.5). Weights in lbs. Reply with one JSON object only.\n\nPAGE TEXT:\n"+txt)
    t0=time.time()
    r=requests.post(f"{BASE}/chat/completions",headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"},
        json={"model":MODEL,"messages":[{"role":"user","content":prompt}],"temperature":0,"response_format":{"type":"json_object"}},timeout=120)
    d=r.json() if r.headers.get("content-type","").startswith("application/json") else {"error":r.text[:200]}
    u=d.get("usage") or {}
    rec={"at":datetime.datetime.now().astimezone().isoformat(),"listing_url":url,"status":r.status_code,"model":d.get("model"),"id":d.get("id"),
         "system_fingerprint":d.get("system_fingerprint"),"prompt_tokens":u.get("prompt_tokens"),"completion_tokens":u.get("completion_tokens"),"cost":u.get("cost"),"secs":round(time.time()-t0,2)}
    if r.status_code!=200: rec["error"]=str(d.get("error"))[:200]
    with lock: callog.write(json.dumps(rec)+"\n"); callog.flush()
    if r.status_code==429: raise RuntimeError("luna 429 rate limited")
    if r.status_code!=200: return None
    try: return json.loads(d["choices"][0]["message"]["content"])
    except Exception: return None
def num_in(q,v):
    nums=[float(x.replace(',','')) for x in re.findall(r'\d[\d,]*\.?\d*',q)]
    if any(abs(n-v)<0.01 for n in nums): return True
    m=re.search(r"(\d+)\s*(?:'|ft|feet)\s*(\d+)?",q)
    return bool(m and abs(int(m.group(1))+int(m.group(2) or 0)/12-v)<0.1)
def cat_of(q):
    x=q.lower()
    for pat,t in [("toy hauler","toy_hauler"),("fifth wheel","fifth_wheel"),("5th wheel","fifth_wheel"),("travel trailer","travel_trailer"),("destination trailer","fifth_wheel"),
                  ("class a","class_a"),("class b","class_b"),("class c","class_c"),("super c","class_c"),("truck camper","truck_camper"),("pop-up","popup_camper"),("pop up","popup_camper"),("popup","popup_camper"),("folding","popup_camper"),("tent trailer","popup_camper")]:
        if pat in x: return t
    return None
def work(item):
    h,r=item; url=r["_meta"]["listing_url"]
    if h in dead: return
    if not allowed(url):
        fetchlog.write(json.dumps({"url":url,"result":"robots_disallowed"})+"\n"); return
    with hostlock[h]:
        if h in dead: return
        w=1.5-(time.time()-last[h])
        if w>0: time.sleep(w)
        try: resp=requests.get(url,timeout=25,headers={"User-Agent":UA})
        except Exception as e:
            last[h]=time.time(); fetchlog.write(json.dumps({"url":url,"result":"fetch_error","err":str(e)[:100]})+"\n"); return
        last[h]=time.time()
    if resp.status_code in (403,429,503) or BOT.search(resp.text[:200000]):
        dead.add(h); fetchlog.write(json.dumps({"url":url,"host":h,"result":"bot_check_or_blocked_host_dropped","status":resp.status_code})+"\n"); return
    if resp.status_code!=200:
        fetchlog.write(json.dumps({"url":url,"result":f"http_{resp.status_code}"})+"\n"); return
    txt=text_of(resp.text); ft=focus(txt)
    out=None
    for attempt in range(4):
        try:
            out=luna(r.get("title") or "",url,ft)
            break
        except Exception as e:
            with lock: callog.write(json.dumps({"at":datetime.datetime.now().astimezone().isoformat(),"listing_url":url,"status":"exception","error":str(e)[:150]})+"\n")
            time.sleep(2**attempt)
    kept={}; dropped={}
    c=(out or {}).get("rv_category")
    if isinstance(c,dict) and c.get("quote"):
        q=re.sub(r'\s+',' ',str(c["quote"])).strip()
        t=cat_of(q)
        labeled=bool(re.search(r'(?i)\b(type|class|category|style|body)\b',q)) or (str(r.get("year") or "") in q and (r.get("make") or "~").lower().split()[0] in q.lower())
        if q in txt and t and labeled: kept["rv_category"]={"value":t,"quote":q[:200]}
        else: dropped["rv_category"]="quote_not_on_page_or_unlabeled_or_unmapped"
    for f in FIELDS:
        e=(out or {}).get(f)
        if not isinstance(e,dict) or e.get("value") in (None,"") or not e.get("quote"): continue
        try: v=float(str(e["value"]).replace(',',''))
        except Exception: dropped[f]="non_numeric"; continue
        q=re.sub(r'\s+',' ',str(e["quote"])).strip()
        if q and q in txt and num_in(q,v): kept[f]={"value":v,"quote":q[:200]}
        else: dropped[f]="quote_not_on_page_or_value_not_in_quote"
    with lock:
        specout.write(json.dumps({"listing_url":url,"fetched_at":datetime.datetime.now().astimezone().isoformat(),"fields":kept,"dropped":dropped})+"\n"); specout.flush()
        fetchlog.write(json.dumps({"url":url,"result":"ok","kept":len(kept)})+"\n"); fetchlog.flush()
with cf.ThreadPoolExecutor(int(os.getenv("LUNA_THREADS","24"))) as ex: list(ex.map(work,sel))
print("DONE",flush=True)

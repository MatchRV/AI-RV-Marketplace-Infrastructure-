"""Map MarketCheck + dealer-website raw rows to RawScrapeRecord-shaped NDJSON for build-harvest-snapshot.ts.
No values are invented: fields are copied from the source row or left null."""
import json,glob,re,os,sys,collections as C
B="/workspace/harvest-2026-10-30"; S="/workspace/scrape-2026-10-26"
VIN=re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
import gzip
# RV makes: makes on >=3 units of the Oct 14 dealer-website snapshot, plus RV builders reviewed by hand
# from the harvest's unmatched makes. Car / powersports / cargo-trailer makes are not on it.
_old=C.Counter(u["make"].strip().lower() for u in json.load(gzip.open(f"{B}/inventory.snapshot.oct14.json.gz"))["units"] if u.get("make"))
NOT_RV={"kia","nissan","toyota","ford","chevrolet","chevy","gmc","ram","dodge","honda","hyundai","jeep","volkswagen","bmw","mercedes-benz","audi","subaru","mazda","lexus","tesla","polaris","can-am","yamaha","kawasaki","suzuki","harley-davidson","e-z-go","club car","bayliner","sea ray","tracker","mercury marine","geo","new","used","rv","rvs","class","travel","custom","other","unknown"}
EXTRA_RV={"eagle cap","taxa","happier camper","livin' lite","grand design rv","augusta rv","great west vans","gulf stream coach","lifestyle luxury rv","mvp rv","carado","thor industries","adventurer manufacturing","conqueror","marathon","mandalay coach","show hauler","atc"}
RVSET={m for m,c in _old.items() if c>=3 and m not in NOT_RV}|EXTRA_RV
RVM=sorted(RVSET,key=len,reverse=True)
BADMODEL=re.compile(r"for sale|\(|\)|\bclass\s*[abc]\b|motor\s*home|motorhome|travel trailer|fifth wheel|5th wheel|toy hauler|\bdealer\b|\binventory\b|\b(19|20)\d\d\b|https?:|\.com\b|\bin\s+[A-Z][a-z]+,?\s+[A-Z]{2}\b",re.I)
def clean_model(m):
    m=(m or "").strip(" -,|")
    if re.fullmatch(r"(unmapped|unknown|other|misc(ellaneous)?|n/?a|none|tbd|model|series|rv|camper|trailer)",m,re.I): return None
    if not m or len(m)>40 or len(m.split())>5 or m.count("-")>=3 or BADMODEL.search(m) or m.lower() in NOT_RV: return None
    return m
def clean_fp(f):
    f=(f or "").strip(" -,|")
    if f.startswith("#"): return None
    if not f or len(f)>16 or len(f.split())>2 or f.count("-")>=2 or BADMODEL.search(f) or "(" in f: return None
    return f
BADSTOCK=re.compile(r'^(location|n/?a|none|stock|call|tbd|null|-+|new|used|trucks?|trailers?|rvs?|inventory|available|sold|sale|pending|in stock)$',re.I)
stats=C.Counter()
out=open(sys.argv[1] if len(sys.argv)>1 else f"{B}/raw_records2.ndjson","w")
def num(v):
    if v is None: return None
    m=re.search(r'-?\d+(\.\d+)?',str(v).replace(',',''))
    return float(m.group()) if m else None
def vin_ok(v):
    v=(v or "").strip().upper(); return v if VIN.match(v) else None
def stock_ok(s):
    s=(s or "").strip()
    return s if s and len(s)<=30 and not BADSTOCK.match(s) else None
mc_dealer={}
def rv_make(v):
    v=(v or "").strip().lower()
    return v if v in RVSET else None
def mc_rows(path,tag):
    for l in open(path):
        try: r=json.loads(l)
        except Exception: stats[f"{tag}_bad_json"]+=1; continue
        b=r.get("build") or {}; d=r.get("dealer") or {}
        dom=(r.get("source") or d.get("website") or "").lower().replace("www.","")
        if d.get("state"): mc_dealer.setdefault(dom,{"name":d.get("name"),"city":d.get("city"),"state":d.get("state"),"lat":num(d.get("latitude")),"lng":num(d.get("longitude"))})
        url=r.get("vdp_url")
        if url and "archive.org" in url: stats["drop_archive_org_url"]+=1; continue
        L=num(b.get("length"))
        if L is not None and L==int(L): stats["mc_integer_length_blanked"]+=1; b=dict(b); b["length"]=None
        pr,ms=num(r.get("price")),num(r.get("msrp"))
        yield {"_meta":{"origin":tag,"make_ok":bool(rv_make(b.get("make"))),"model_ok":True,"price_eq_msrp":(pr is not None and ms is not None and pr==ms),"harvest_method":"marketcheck_api_v2_rv_active","listing_url":url,
                        "mc_id":r.get("id"),"mc_class":b.get("class"),"harvested_at":r["_harvest"]["harvested_at"],
                        "dealer":{"name":d.get("name"),"city":d.get("city"),"state":d.get("state"),"lat":num(d.get("latitude")),"lng":num(d.get("longitude")),"domain":dom},
                        "seller_type":r.get("seller_type")},
               "dealer_domain":dom,"dealer_name":d.get("name"),"dealer_location":", ".join(x for x in (d.get("city"),d.get("state")) if x),
               "title":r.get("heading"),"year":b.get("year"),"make":b.get("make"),"model":b.get("model"),"trim":b.get("trim"),
               "rv_type":b.get("class"),"condition":r.get("inventory_type"),"price":r.get("price"),"msrp":r.get("msrp"),
               "length":b.get("length"),"sleeps":b.get("sleeps"),"slideouts":b.get("slideouts"),"gvwr":b.get("gvwr"),
               "dry_weight":b.get("dry_weight"),"hitch_weight":b.get("hitch_weight"),
               "fresh_water_capacity":b.get("fresh_water_capacity"),"gray_water_capacity":b.get("grey_water_capacity"),"black_water_capacity":b.get("black_water_capacity"),
               "image_urls":[re.sub(r'\.(jpe?g|png|webp);[^/?#]*$',r'.\1',u,flags=re.I) if isinstance(u,str) else u for u in ((r.get("media") or {}).get("photo_links") or [])],
               "vin":vin_ok(r.get("vin")),"stock_number":stock_ok(r.get("stock_no")),"url":url,
               "last_seen_at":r.get("last_seen_at_date"),"_first_seen":r.get("first_seen_at_date"),"inventory_status":"available"}
SPK={"length":["length","overall length","length ft","length ft in","exterior length"],"sleeps":["sleeps","max sleeping count","sleep capacity"],
     "gvwr":["gvwr"],"dry_weight":["dry weight","dry weight lbs","unloaded vehicle weight","uvw"],"hitch_weight":["hitch weight"],
     "slideouts":["slides","number of slideouts","slide outs","slideouts"],"fresh_water_capacity":["fresh water"],"gray_water_capacity":["gray water","grey water"],"black_water_capacity":["black water"],
     "rv_type":["type","class","category"],"condition":["condition"]}
def ft(v):
    """Feet + inches as stated ("38 feet, 8 inches", "36'8\"", "19 ft 5 in", "20′"). A bare integer with
    no unit may be truncated inches, so it is left blank; a decimal value is kept."""
    if v is None: return None
    s=str(v).replace("′","'").replace("″",'"')
    m=re.search(r"(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)\s*,?\s*(?:(\d+(?:\.\d+)?)\s*(?:\"|''|in\.?|inch(?:es)?)?)?",s,re.I)
    if m: return round(float(m.group(1))+(float(m.group(2) or 0))/12,2)
    n=num(s)
    if n is None: return None
    if re.search(r'(\d+)\s*(?:"|in\.?|inch)',s,re.I) and n>=120: return round(n/12,2)
    return n if n!=int(n) and n<=70 else None
def web_rows(path,tag):
    for l in open(path):
        try: r=json.loads(l)
        except Exception: continue
        sp={k.lower():v for k,v in (r.get("specs") or {}).items()}
        g=lambda f: next((sp[k] for k in SPK[f] if sp.get(k) not in (None,"")),None)
        title=r.get("title") or ""; dom=(r.get("dealer_domain") or "").lower().replace("www.","")
        h=r.get("_harvest") or {}
        # Make / model / floorplan from the scraper's structured fields only (never the page title or URL slug).
        man=(r.get("manufacturer") or sp.get("make") or "").strip(); brand=(r.get("brand") or "").strip()
        make=rv_make(man); fp=clean_fp(r.get("floorplan") or sp.get("floorplan") or sp.get("trim"))
        model=re.sub(r"\s*#\S+$","",(r.get("model") or sp.get("model") or "").strip())  # trailing "#STOCK" is not part of the model
        if fp and fp.startswith("#"): fp=None
        if brand and man and brand.lower()!=man.lower() and rv_make(brand) is None and brand.lower() not in model.lower():
            model=f"{brand} {model}".strip() if model and (not fp or model.lower()!=fp.lower()) else brand
        if fp and model.lower()==fp.lower(): model=brand if brand and brand.lower()!=man.lower() else ""
        if fp and model.lower().endswith(" "+fp.lower()): model=model[:-len(fp)].strip()
        if not fp:
            mt=re.match(r"^(.*\S)\s+(\d{2,4}[A-Za-z]{1,6}\d?)$",model or "")
            if mt and len(mt.group(1).split())>=1: model,fp=mt.group(1),mt.group(2)
        model=clean_model(model)
        cond=r.get("condition") or g("condition")
        if not cond:
            m0=re.match(r"\s*(new|used|pre-owned)\b",title,re.I); cond=m0.group(1) if m0 else None
        if cond and re.search(r"pre-?owned",str(cond),re.I): cond="used"
        if cond and not re.search(r"\b(new|used)\b",str(cond),re.I): cond=None
        price=r.get("price"); msrp=num(sp.get("msrp"))
        if price is not None and msrp is not None and num(price)==msrp: price=None  # scraper copied the MSRP
        if re.search(r"contact seller|call for|get .*price|request", str(sp.get("price") or ""), re.I) and msrp is not None and num(price or 0)==msrp: price=None
        yr=r.get("year") or num(sp.get("year"))
        clean_title=" ".join(str(x) for x in (int(yr) if yr else None,man.title() if man.isupper() else man,model,fp) if x)
        yield {"_meta":{"origin":tag,"harvest_method":h.get("method","dealer_website_rv_inventory_scraper"),"listing_url":r.get("source_url"),"harvested_at":h.get("harvested_at"),
                        "dealer":{"domain":dom},"page_title":title,"raw_make":man,"raw_model":r.get("model"),"make_ok":bool(make),"model_ok":bool(model),"msrp_seen":msrp},
               "dealer_domain":dom,"title":clean_title,"year":yr,"make":((man.title() if man.isupper() else man) if make else None),"model":model,"trim":fp,"rv_type":r.get("rv_type") or g("rv_type"),
               "condition":cond,
               "price":price,"msrp":msrp,"length":ft(g("length")),"sleeps":g("sleeps"),"gvwr":g("gvwr"),"dry_weight":g("dry_weight"),"hitch_weight":g("hitch_weight"),
               "slideouts":g("slideouts"),"fresh_water_capacity":g("fresh_water_capacity"),"gray_water_capacity":g("gray_water_capacity"),"black_water_capacity":g("black_water_capacity"),
               "description":r.get("description"),"image_urls":r.get("photos") or [],"vin":vin_ok(r.get("vin") or sp.get("vin")),"stock_number":stock_ok(r.get("stock_number") or sp.get("stock")),
               "url":r.get("source_url"),"last_seen_at":h.get("harvested_at") or r.get("last_seen_at"),"inventory_status":"available"}
srcs=[(f"{S}/marketcheck/raw_listings.jsonl","mc_2026-10-25"),(f"{B}/mc/new_dealers.jsonl","mc_2026-10-30")]
recs=[]
kept=[]
for p,tag in srcs:
    if os.path.exists(p):
        for x in mc_rows(p,tag): recs.append(x); stats[tag]+=1
for tag,pat in (("web_2026-10-26",f"{S}/websites/*.jsonl"),("web_2026-10-30",f"{B}/web/*.jsonl"),("web_2026-10-30_new",f"{B}/webnew/*.jsonl")):
    for f in glob.glob(pat):
        if f.endswith("_done.jsonl"): continue
        for x in web_rows(f,tag): recs.append(x); stats[tag]+=1
extra=json.load(open(f"{B}/dealer_info_extra.json")) if os.path.exists(f"{B}/dealer_info_extra.json") else {}
LUNA={}
for lf_path in (f"{B}/luna/specs.jsonl",f"{B}/luna/category.jsonl"):
    if not os.path.exists(lf_path): continue
    for l in open(lf_path):
        e=json.loads(l)
        if not e["fields"]: continue
        cur=LUNA.setdefault(e["listing_url"],{"fields":{},"fetched_at":e["fetched_at"]})
        cur["fields"].update(e["fields"])
LMAP={"sleeps":"sleeps","length_ft":"length","dry_weight_lbs":"dry_weight","gvwr_lbs":"gvwr","hitch_weight_lbs":"hitch_weight","slideouts":"slideouts",
      "fresh_water_gal":"fresh_water_capacity","grey_water_gal":"gray_water_capacity","black_water_gal":"black_water_capacity"}
TOL={"length":0.6}
# Per-dealer check of MarketCheck spec values against the dealer's own page: a field where
# the page disagrees in >=3 cases and >=30% of comparisons is blanked for that dealer's MC rows.
cmp=C.defaultdict(lambda: [0,0])
for x in recs:
    e=LUNA.get(x["_meta"].get("listing_url"))
    if not e or not x["_meta"]["origin"].startswith("mc"): continue
    for f,v in e["fields"].items():
        rf=LMAP.get(f)
        if rf and x.get(rf) not in (None,""):
            k=(x["dealer_domain"],rf); cmp[k][0]+=1
            if abs((num(x[rf]) if num(x[rf]) is not None else -1e9)-v["value"])>TOL.get(rf,0.5): cmp[k][1]+=1
BAD={k for k,(n,d) in cmp.items() if d>=3 and d/n>=0.3}
json.dump(sorted([list(k)+cmp[k] for k in BAD]),open(f"{B}/mc_fields_blanked_by_dealer.json","w"))
for x in recs:
    m=x["_meta"]
    if m["origin"].startswith("mc"):
        for (dom,rf) in BAD:
            if dom==x["dealer_domain"] and x.get(rf) not in (None,""): x[rf]=None; stats["mc_value_blanked_dealer_mismatch"]+=1
    e=LUNA.get(m.get("listing_url"))
    if e:
        lf={}
        for f,v in e["fields"].items():
            if f=="rv_category":
                if not x.get("rv_type") and not m.get("mc_class"): m["page_category"]=v["value"]; m["page_category_quote"]=v["quote"]; stats["page_category"]+=1
                continue
            rf=LMAP.get(f)
            if not rf: continue
            if x.get(rf) in (None,""): x[rf]=v["value"]; lf[rf]=v["quote"]
            elif abs((num(x[rf]) if num(x[rf]) is not None else -1e9)-v["value"])>TOL.get(rf,0.5): x[rf]=v["value"]; lf[rf]=v["quote"]; stats["page_overrode_mc_value"]+=1
        if lf: m["luna_fields"]=lf; m["luna_fetched_at"]=e["fetched_at"]; stats["luna_filled_records"]+=1; stats["luna_filled_values"]+=len(lf)
    if m["origin"].startswith("web"):
        info=mc_dealer.get(m["dealer"]["domain"]) or extra.get(m["dealer"]["domain"])
        if info: m["dealer"].update(info); x["dealer_name"]=info["name"]; x["dealer_location"]=f'{info["city"]}, {info["state"]}'
        else: stats["web_no_dealer_info"]+=1
    kept.append(x)
# ── Page verification (verify_pages.py → verify_decide.py): live status and the dealer's current price ──
DEC=json.load(open(f"{B}/verify/decisions.json")) if os.path.exists(f"{B}/verify/decisions.json") else {}
gone_keys=set()
def ukey(x):
    v=x.get("vin"); s_=x.get("stock_number")
    return f"vin:{v.upper()}" if v else (f"stk:{x['dealer_domain']}:{str(s_).lower()}" if s_ else None)
final=[]
for x in kept:
    m=x["_meta"]; u=m.get("listing_url") or ""
    if "archive.org" in u: stats["drop_archive_org_url"]+=1; continue
    d=DEC.get(u)
    if d and d["action"]=="drop":
        stats["drop_"+d["reason"]]+=1
        if d["reason"] in ("dead_404_410","sold_or_pending","unit_absent_from_page") and ukey(x): gone_keys.add(ukey(x)+"|"+x["dealer_domain"])
        continue
    if d and d.get("price") is not None:
        if num(x.get("price"))!=d["price"]: stats["price_replaced_by_page_price"]+=1
        x["price"]=d["price"]; m["price_basis"]=d["basis"]; m["verified_at"]=d.get("fetched_at")
        # The unit's own page was read tonight and still shows it (VIN or stock number on the page): that is a sighting.
        if d.get("unit_on_page") and d.get("fetched_at"):
            import datetime as _dt
            ts=d["fetched_at"]; ts=ts[:-2]+":"+ts[-2:] if re.search(r"[+-]\d{4}$",ts) else ts
            tsd=_dt.datetime.fromisoformat(ts).astimezone(_dt.timezone.utc); ts=tsd.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            try: prev=_dt.datetime.fromisoformat(str(x.get("last_seen_at")).replace("Z","+00:00"))
            except Exception: prev=None
            if prev is not None and prev.tzinfo is None: prev=prev.replace(tzinfo=_dt.timezone.utc)
            if prev is None or tsd>prev: x["last_seen_at"]=ts; m["last_seen_basis"]="dealer_page_verified"; stats["last_seen_from_page_verification"]+=1
    elif d and d["action"]=="keep_unverified" or not d:
        # Page not read (bot wall, robots, error, or not fetched): MarketCheck's price is trusted only when it
        # differs from its MSRP (a sale price); price == MSRP may be the list/struck price, so it is not served.
        if m["origin"].startswith("mc") and not m.get("price_eq_msrp"): m["price_basis"]="marketcheck_price_below_msrp"
        else: stats["drop_price_unverified" + ("" if d else "_not_fetched")]+=1; continue
    final.append(x)
# ── Dealer gate: a dealer must carry RV inventory (>=3 harvested rows with a make on the RV make list) ──
dm=C.defaultdict(lambda:[0,0])
for x in kept: dm[x["dealer_domain"]][0]+=1; dm[x["dealer_domain"]][1]+=bool(x["_meta"].get("make_ok"))
nonrv={d for d,(n,k) in dm.items() if k<3}
json.dump(sorted(nonrv),open(f"{B}/verify/non_rv_dealers.json","w")); json.dump({d:dm[d] for d in nonrv},open(f"{B}/verify/non_rv_dealers_counts.json","w"))
for x in final:
    if x["dealer_domain"] in nonrv: stats["drop_non_rv_dealer"]+=1; continue
    if not x["_meta"].get("make_ok"): stats["drop_non_rv_make"]+=1; continue
    if not x["_meta"].get("model_ok") or not x.get("model"): stats["drop_model_not_cleanly_parseable"]+=1; continue
    out.write(json.dumps(x)+"\n")
json.dump(sorted(gone_keys),open(f"{B}/verify/gone_keys.json","w"))
json.dump(mc_dealer,open(f"{B}/mc_dealer_info.json","w"))
print(dict(stats))

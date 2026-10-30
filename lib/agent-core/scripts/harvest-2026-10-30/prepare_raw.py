"""Map MarketCheck + dealer-website raw rows to RawScrapeRecord-shaped NDJSON for build-harvest-snapshot.ts.
No values are invented: fields are copied from the source row or left null."""
import json,glob,re,os,sys,collections as C
B="/workspace/harvest-2026-10-30"; S="/workspace/scrape-2026-10-26"
VIN=re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
RVM=sorted(set(json.load(open(f"{B}/rv_makes.json"))),key=len,reverse=True)
BADSTOCK=re.compile(r'^(location|n/?a|none|stock|call|tbd|null|-+)$',re.I)
stats=C.Counter()
out=open(f"{B}/raw_records.ndjson","w")
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
def mc_rows(path,tag):
    for l in open(path):
        try: r=json.loads(l)
        except Exception: stats[f"{tag}_bad_json"]+=1; continue
        b=r.get("build") or {}; d=r.get("dealer") or {}
        dom=(r.get("source") or d.get("website") or "").lower().replace("www.","")
        if d.get("state"): mc_dealer.setdefault(dom,{"name":d.get("name"),"city":d.get("city"),"state":d.get("state"),"lat":num(d.get("latitude")),"lng":num(d.get("longitude"))})
        url=r.get("vdp_url")
        yield {"_meta":{"origin":tag,"harvest_method":"marketcheck_api_v2_rv_active","listing_url":url,
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
    if v is None: return None
    s=str(v); m=re.search(r"(\d+)\s*(?:'|ft|feet)\s*(\d+)?",s)
    if m: return round(int(m.group(1))+(int(m.group(2) or 0))/12,2)
    return num(s)
def web_rows(path,tag):
    for l in open(path):
        try: r=json.loads(l)
        except Exception: continue
        sp={k.lower():v for k,v in (r.get("specs") or {}).items()}
        g=lambda f: next((sp[k] for k in SPK[f] if sp.get(k) not in (None,"")),None)
        title=r.get("title") or ""; dom=(r.get("dealer_domain") or "").lower().replace("www.","")
        t=title.lower(); make=None
        for m in RVM:
            if re.search(r'(^|\W)'+re.escape(m)+r'(\W|$)',t): make=m; break
        model=None
        if make:
            i=t.find(make); model=title[i+len(make):].strip(" -,") or None
        yr=r.get("year") or num(sp.get("year"))
        h=r.get("_harvest") or {}
        yield {"_meta":{"origin":tag,"harvest_method":h.get("method","dealer_website_rv_inventory_scraper"),"listing_url":r.get("source_url"),"harvested_at":h.get("harvested_at"),
                        "dealer":{"domain":dom},"make_from_title":bool(make)},
               "dealer_domain":dom,"title":title,"year":yr,"make":(make.title() if make else None),"model":model,"rv_type":r.get("rv_type") or g("rv_type"),
               "condition":r.get("condition") or g("condition") or (title.split()[0] if title.split() and title.split()[0].lower() in("new","used") else None),
               "price":r.get("price"),"length":ft(g("length")),"sleeps":g("sleeps"),"gvwr":g("gvwr"),"dry_weight":g("dry_weight"),"hitch_weight":g("hitch_weight"),
               "slideouts":g("slideouts"),"fresh_water_capacity":g("fresh_water_capacity"),"gray_water_capacity":g("gray_water_capacity"),"black_water_capacity":g("black_water_capacity"),
               "description":r.get("description"),"image_urls":r.get("photos") or [],"vin":vin_ok(r.get("vin") or sp.get("vin")),"stock_number":stock_ok(r.get("stock_number") or sp.get("stock")),
               "url":r.get("source_url"),"last_seen_at":h.get("harvested_at") or r.get("last_seen_at"),"inventory_status":"available"}
srcs=[(f"{S}/marketcheck/raw_listings.jsonl","mc_2026-10-25"),(f"{B}/mc/new_dealers.jsonl","mc_2026-10-30")]
recs=[]
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
    out.write(json.dumps(x)+"\n")
json.dump(mc_dealer,open(f"{B}/mc_dealer_info.json","w"))
print(dict(stats))

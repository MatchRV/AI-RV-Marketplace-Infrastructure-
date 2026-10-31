"""Build raw harvest rows from dealer listing pages read 2026-10-31 (Interact RV unit pages; other platforms with a
schema.org Vehicle/Product block). Only values the page states: title, year (the listing title's year when it states
one, else the unit's year field), make/series/floorplan (Interact data-mfg / data-brand / data-unitname; else LD
manufacturer/brand/model), VIN (only a valid 17-character VIN), stock, condition, category, price (sale price or a
non-MSRP offer price; an MSRP-only price is stored as msrp, never as price), the unit's lot city/state, photos and the
dealer's description. Pages marked sold / pending / unavailable, or not showing one unit, are skipped.
usage: rows_from_pages.py <dir> <out.ndjson> [dealer_info.json]"""
import json,sys,os,re,collections,datetime
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from facts import facts,money
from rvtype import norm_type
from urlloc import urlloc
D,OUT=sys.argv[1],sys.argv[2]
DI=json.load(open(sys.argv[3])) if len(sys.argv)>3 else {}
import gzip
from lotparse import lot_from_page
LOTDOMS={'optimumrv.com','poulsborv.com','motorsportsland.com','cenlarv.com','bentsrv.com','fourwindsrv.com','unchartedrec.com','rvconnections.com',
 'hamiltonrvsales.com','wehrrvs.com','airstreamlasvegas.com','airstreaminlandempire.com','airstreamorangecounty.com','airstreamlosangeles.com','rvtrucksalesmt.com',
 'selkirkrv.com','renoairstream.com','seattleairstream.com','airstreamspokane.com','portlandairstream.com','lamesarv.com','nirvc.com','darrenbideauxrv.com',
 'millicanrvs.com','robbinsautoandrv.com','mhsrv.com'}
AIR_LOT={('seattle','WA'):('Milton','WA'),('spokane','WA'):('Spokane Valley','WA'),('portland','OR'):('Clackamas','OR'),('reno','NV'):('Reno','NV')}
_SL="/workspace/harvest-2026-10-31/site_lots.json"
SITE_LOTS={d:[(c,st) for c,st,n in v if n>=3] for d,v in json.load(open(_SL)).items()} if os.path.exists(_SL) else {}
VINRE=re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
STATES=set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())
GONE_AV={"SoldOut","Discontinued","OutOfStock"}
bare=lambda s:(s or '').lower().replace('https://','').replace('http://','').replace('www.','').split('/')[0]
T={}
for l in open(f"{D}/targets.ndjson"):
    t=json.loads(l); T[t["key"]]=t
c=collections.Counter(); out=open(OUT,"w"); log=open(f"{D}/rows_log.ndjson","w")
def iso(fa):
    try: return datetime.datetime.strptime(fa,'%Y-%m-%dT%H:%M:%S%z').astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    except Exception: return None
for l in open(f"{D}/extracted.ndjson"):
    j=json.loads(l); t=T.get(j["key"],{})
    def rej(w):
        c[w]+=1; log.write(json.dumps({"key":j["key"],"url":j["url"],"why":w})+"\n")
    if j.get("result")!="ok": rej("fetch_"+str(j.get("result"))); continue
    if (j.get("http") or 0)>=400: rej(f"http_{j.get('http')}"); continue
    x=j.get("x") or {}
    if "parseError" in x: rej("parse_error"); continue
    f,q=facts(x); ia=x.get("ia") or {}; ld=(x.get("ld") or [None])[0] or {}
    if not ia and not ld: rej("no_unit_markup"); continue
    mu=re.search(r'-(\d{5,8})-\d+/?$',(j.get("finalUrl") or j["url"]).split("?")[0])
    if ia and not (mu and ia.get("unitid")==mu.group(1)): rej("not_the_unit_page"); continue
    cls=(ia.get("_class") or "")+" "+(x.get("iaClassAny") or "")
    if f.get("avail") in GONE_AV or x.get("soldText") or re.search(r'\b(sold|pending)-status\b',cls): rej("sold_or_pending"); continue
    title=(ia.get("title") or ld.get("name") or x.get("h1") or "").strip()
    title=re.sub(r'\s+',' ',title)
    if not title: rej("no_title"); continue
    # year: the listing title's year wins over the structured year field
    my=re.match(r'^(?:New|Used|Pre-Owned|Preowned)?\s*((?:19|20)\d\d)\b',title,re.I)
    yr=int(my.group(1)) if my else None
    fy=ia.get("year") or ld.get("year")
    try: fy=int(str(fy)[:4])
    except Exception: fy=None
    if yr and fy and yr!=fy: c["year_title_over_field"]+=1
    year=yr or fy
    if ia:
        make=(ia.get("mfg") or "").strip() or None; model=(ia.get("brand") or "").strip() or None; trim=(ia.get("unitname") or "").strip() or None
        if model and model.lower()=="unknown": model=None
    else:
        make=(ld.get("mfg") or ld.get("brand") or "").strip() or None
        model=(ld.get("model") or "").strip() or None; trim=None
        if make and ld.get("brand") and ld.get("mfg") and ld["brand"]!=ld["mfg"]: model=" ".join(x for x in [ld["brand"],ld.get("model")] if x)
    if not make: rej("no_make"); continue
    if not model:
        rest=re.sub(r'^(?:New|Used|Pre-Owned|Preowned)?\s*(?:19|20)\d\d\s*','',title,flags=re.I)
        rest=re.sub('^'+re.escape(make)+r'\s*','',rest,flags=re.I).strip()
        model=rest or None
    if not model: rej("no_model"); continue
    vin=None
    for v in (ia.get("vin"),ia.get("vinnumber"),ld.get("vin")):
        v=(v or "").strip().upper()
        if VINRE.match(v): vin=v; break
    stock=(ia.get("stocknumber") or ld.get("sku") or "").strip() or None
    if not vin and not stock: rej("no_vin_or_stock"); continue
    # category: Interact data-type, else facts() (LD bodyType / labelled field / title)
    cat=None; catq=None
    if ia.get("type") and norm_type(ia["type"]): cat=ia["type"]; catq=f'unit type "{ia["type"]}"'
    elif f.get("type"): cat=f["type"]; catq=q["type"]
    cond=None; condq=None
    mc=re.match(r'^(New|Used|Pre-Owned|Preowned)\b',title,re.I)
    if mc: cond="new" if mc.group(1).lower()=="new" else "used"; condq="listing title"
    elif re.search(r'\bnewUnit\b',cls): cond="new"; condq="unit marked new"
    elif re.search(r'\busedUnit\b',cls): cond="used"; condq="unit marked used"
    elif f.get("cond"): cond=f["cond"]; condq=q["cond"]
    _tags=[t_.lower() for t_ in (x.get("unitTags") or [])]
    if x.get("factoryOrderText") or any(t_ in ("on order","available to order","factory order","special order","build to order") for t_ in _tags): rej("factory_order"); continue
    if any(t_ in ("sale pending","sold","pending sale") for t_ in _tags): rej("sold_or_unavailable_unit_tag"); continue
    # price
    price=None; pq=None; msrp=None
    if ia:
        sp=money(ia.get("saleprice")); tp=money(ia.get("saleorregularprice") or ia.get("totalprice")); ms=money(ia.get("msrp"))
        lab=(ia.get("pricelabel") or "").lower()
        if "msrp" in lab and ms and ms>=1000: msrp=ms
        if sp and sp>=1000: price=sp; pq=f'{ia.get("salepricelabel") or "sale price"} {ia.get("saleprice")}'
        elif tp and tp>=1000 and "msrp" not in lab: price=tp; pq=f'{ia.get("pricelabel") or "price"} {ia.get("saleorregularprice") or ia.get("totalprice")}'
    elif f.get("price"): price=f["price"]; pq=q["price"]
    if f.get("price_total_with_fees") and price==f.get("price"): c["price_prefee_sale_price"]+=1
    if price and msrp and abs(price-msrp)<1 and not (ia.get("saleprice") and money(ia.get("saleprice"))): price=None
    # no page-wide MSRP fallback: only the unit's own price block (Interact unit element) may supply MSRP
    if price and msrp and msrp<=price: msrp=None
    # location: the unit's lot, else the page's seller address, else the dealer record we hold for the domain
    city=state=None; locq=None
    if ia.get("lot-city") and ia.get("lot-state"): city,state=ia["lot-city"].strip(),ia["lot-state"].strip().upper(); locq="unit lot (data-lot-city/state)"
    elif ia.get("lotdescription") and re.match(r'^[^,]+,\s*[A-Z]{2}$',ia["lotdescription"].strip()):
        city,state=[s.strip() for s in ia["lotdescription"].split(",")]; locq="unit lot (data-lotdescription)"
    elif (ld.get("seller") or {}).get("city") and (ld.get("seller") or {}).get("state"):
        city,state=ld["seller"]["city"].strip(),str(ld["seller"]["state"]).strip().upper(); locq="listing seller address"
    dom=t.get("domain") or bare(j["url"])
    if dom in LOTDOMS and j.get("page") and not (locq or "").startswith("unit lot"):
        # multi-lot dealer: the lot as this unit's own page states it overrides any dealer-level address
        try: _h=gzip.open(f"{D}/pages/{j['page']}.html.gz").read().decode("utf8","replace")
        except Exception: _h=""
        _r=lot_from_page(dom,j.get("finalUrl") or j["url"],_h) if _h else None
        if _r:
            _c,_s,_ev=_r
            if _c and not _s:
                _s=next((ss for sc,ss in SITE_LOTS.get(dom,[]) if sc.lower()==_c.lower()),None)
            if not _c and _s:
                _l=[sc for sc,ss in SITE_LOTS.get(dom,[]) if ss==_s]
                if len(_l)==1: _c=_l[0]; _ev+=f"; the dealer's only {_s} lot printed on its pages is {_c}, {_s}"
            if _c and _s in STATES:
                if (_c.lower(),_s) in AIR_LOT: _c,_s=AIR_LOT[(_c.lower(),_s)]
                if _c=="Mt. Vernon" and _s=="WA": _c="Mount Vernon"
                city,state,locq=_c,_s,_ev
            else: rej("lot_not_determined"); continue
        else: rej("lot_not_determined"); continue
    dname=ia.get("dealer-name") or (ld.get("seller") or {}).get("name")
    if not (city and state in STATES):
        di=DI.get(dom) or {}
        # only a dealer that states a single address on its own site; a city merely held in our v3.3 records is not
        # evidence of the unit's lot (CSO QA trial4: Poulsbo RV / Motor Sportsland multi-lot pinning)
        if di.get("city") and di.get("state") in STATES and di.get("single_location", True) and not str(di.get("source","")).startswith("v3.3"):
            city,state=di["city"],di["state"]; locq="dealer homepage single address"; dname=dname or di.get("name")
        elif di.get("city") and di.get("state") in STATES:
            uL=urlloc(j.get("finalUrl") or j["url"]); sl=SITE_LOTS.get(dom,[])
            if len(sl)==1 and sl[0][1]==di["state"] and sl[0][0].lower().replace(".","")==di["city"].lower().replace(".",""):
                city,state=di["city"],di["state"]; locq=f"dealer's pages print a single lot address ({sl[0][0]}, {sl[0][1]})"; dname=dname or di.get("name")
            elif not sl and dom in SITE_LOTS:
                city,state=di["city"],di["state"]; locq="dealer record; the dealer's pages print no lot address (no evidence of another lot)"; dname=dname or di.get("name")
            elif uL and uL[0] and uL[1]==di["state"] and di["city"].lower() in uL[0].lower():
                city,state=di["city"],di["state"]; locq=f"listing URL names the lot {di['city']}, {di['state']}"; dname=dname or di.get("name")
            else: rej("lot_not_determined"); continue
    if not (city and state in STATES): rej("no_location"); continue
    imgs=[]
    for u in (ld.get("images") or []):
        if u not in imgs: imgs.append(u)
    if ia.get("img") and not imgs: imgs=[ia["img"]]
    imgs=[u for u in imgs if "/common/" not in u and not u.endswith("na.jpg")]
    if not imgs: rej("no_photos"); continue
    ts=iso(j.get("fetchedAt"))
    row={"_meta":{"origin":"web_2026-10-31","harvest_method":"dealer_website_page_read_2026_10_31","listing_url":j.get("finalUrl") or j["url"],
          "harvested_at":j.get("fetchedAt"),"page_title":x.get("title"),"page_category":norm_type(cat) if cat else None,"page_category_quote":catq,
          "condition_source":condq,"price_basis":"page_price_2026_10_31" if price else None,"price_quote":pq,"location_source":locq,
          "last_seen_basis":"listing_page_read_2026_10_31","dealer":{"name":dname or dom,"city":city,"state":state,"lat":None,"lng":None,"domain":dom}},
         "dealer_domain":dom,"dealer_name":dname or dom,"dealer_location":f"{city}, {state}","title":title,"year":year,"make":make,"model":model,"trim":trim,
         "rv_type":cat,"condition":cond,"price":price,"msrp":msrp,"image_urls":imgs,"vin":vin,"stock_number":stock,"url":j.get("finalUrl") or j["url"],
         "description":(ld.get("desc") or None),"last_seen_at":ts,"_first_seen":ts,"inventory_status":"available"}
    out.write(json.dumps(row)+"\n"); c["rows"]+=1
    c["rows_with_price" if price else "rows_no_price"]+=1; c["rows_with_cond" if cond else "rows_no_cond"]+=1; c["rows_with_type" if cat else "rows_no_type"]+=1
print(json.dumps(c,indent=0))

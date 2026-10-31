"""Track A decide (2026-10-31): harvested rows (Oct 25-30) that the v3.3 build could not admit, re-checked on the
dealer's own listing page. A row is re-emitted only when the page is the same unit (row VIN on the page, or for
VIN-less rows the stock number on the page; a page VIN that differs = different unit) and the page is not sold /
gone. Adds only what the page states: category (page_category + quote), condition, price (offer / sale price,
never MSRP), the unit's lot city/state on Interact pages. lastSeen = the page read time.
usage: decide_pa.py <dir> <out_rows.ndjson>"""
import json,sys,os,gzip,re,collections,datetime
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from facts import facts
D,OUT=sys.argv[1],sys.argv[2]
src={}
for l in open(f"{D}/source_rows.ndjson"):
    r=json.loads(l); src[r["_pa_key"]]=r
c=collections.Counter(); out=open(OUT,"w"); log=open(f"{D}/decide_log.ndjson","w")
GONE_AV={"SoldOut","Discontinued","OutOfStock"}
for l in open(f"{D}/extracted.ndjson"):
    j=json.loads(l); r=src.get(j["key"])
    if r is None: continue
    def rej(w): c[w]+=1; log.write(json.dumps({"key":j["key"],"url":j["url"],"why":w})+"\n")
    if j.get("result")!="ok": rej("fetch_"+str(j.get("result"))); continue
    if (j.get("http") or 0)>=400: rej(f"http_{j.get('http')}_gone"); continue
    x=j.get("x") or {}
    if "parseError" in x: rej("parse_error"); continue
    f,q=facts(x)
    t=gzip.open(f"{D}/pages/{j['page']}.html.gz","rt",errors="replace").read()
    vin=(r.get("vin") or "").upper().strip(); stock=str(r.get("stock_number") or "").strip()
    if vin and f.get("ldVin") and len(f["ldVin"])==17 and f["ldVin"]!=vin: rej("page_is_other_unit_vin"); continue
    same=False
    if vin and len(vin)>=11 and vin in t.upper(): same=True; how="vin_on_page"
    elif stock and len(stock)>=3 and re.search(r'(?<![A-Za-z0-9])'+re.escape(stock)+r'(?![A-Za-z0-9])',t,re.I): same=True; how="stock_on_page"
    if not same: rej("unit_not_on_page"); continue
    if f.get("avail") in GONE_AV or x.get("soldText"): rej("sold_or_unavailable"); continue
    m=dict(r["_meta"]); n=dict(r); n.pop("_pa_key",None)
    isMc=m["harvest_method"].startswith("marketcheck")
    if f.get("type"):
        if isMc: m["page_category"]=f["type"]; m["page_category_quote"]=q["type"]
        else:
            if not n.get("rv_type"): n["rv_type"]=f["type"]
            m["page_category"]=f["type"]; m["page_category_quote"]=q["type"]
    if f.get("cond"): n["condition"]=f["cond"]; m["condition_source"]=q["cond"]
    old=n.get("price")
    try: oldv=float(old) if old not in (None,"") else None
    except Exception: oldv=None
    if f.get("price"):
        n["price"]=f["price"]; m["price_basis"]="harvested_price_matches_page_2026_10_31" if oldv and abs(oldv-f["price"])<1 else "page_price_2026_10_31"; m["price_quote"]=q["price"]
    elif oldv and f.get("msrp") and abs(oldv-f["msrp"])<1:
        n["price"]=None; m["price_basis"]=None; c["mc_price_was_page_msrp_blanked"]+=1
    if f.get("msrp") and not n.get("msrp"): n["msrp"]=f["msrp"]
    if x.get("iaLot") and x["iaLot"][0] and len(x["iaLot"][1] or "")==2:
        if (m["dealer"].get("city"),m["dealer"].get("state"))!=tuple(x["iaLot"]): c["lot_from_page"]+=1
        same_city=(m["dealer"].get("city") or "").strip().lower()==x["iaLot"][0].lower() and (m["dealer"].get("state") or "").upper()==x["iaLot"][1].upper()
        m["dealer"]=dict(m["dealer"],city=x["iaLot"][0],state=x["iaLot"][1].upper()); m["location_source"]="unit lot on listing page"
        if not same_city: m["dealer"]["lat"]=None; m["dealer"]["lng"]=None
    fa=j.get("fetchedAt")
    try: ts=datetime.datetime.strptime(fa,'%Y-%m-%dT%H:%M:%S%z').astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    except Exception: ts=None
    if ts: n["last_seen_at"]=ts; m["last_seen_basis"]="listing_page_read_2026_10_31"
    m["listing_url"]=j.get("finalUrl") if (j.get("finalUrl") or "").startswith("http") and same else m["listing_url"]
    m["origin"]="pagecheck_2026-10-31"; m["page_identity"]=how; m["page_fetched_at"]=fa
    n["_meta"]=m; out.write(json.dumps(n)+"\n"); c["emitted"]+=1
    c["emitted_type_from_page" if f.get("type") else "emitted_no_page_type"]+=1
    c["emitted_with_price" if n.get("price") else "emitted_no_price"]+=1
print(json.dumps(c,indent=0))

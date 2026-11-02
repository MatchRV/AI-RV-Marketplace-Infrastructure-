"""Extract what each fetched listing page states (no inference). Output: extracted.ndjson, one line per result.
CW: schema.org Vehicle (offer price / itemCondition / availability / sku / VIN / seller), the page heading
(condition word, year, stock, store city/state), the page's own clearPrice block (salePrice / msrp) and the
visible price. La Mesa: Vehicle LD (sku, VIN, offer, condition) + the unit's own location label
(data-testid=rvunit-location) + the page's store directory (label -> street address).
Interact (Meyers / McClain's / Apache): Vehicle LD (sku, VIN, name) + the unit's lot (data-lot-city/state/zip/
adress) + condition from the page title + data-saleprice / data-pricelabel."""
import json,re,sys,gzip,html as H,os
B=os.environ.get("PP_DIR","/workspace/harvest-2026-10-30/pagepass")
def lds(t):
    out=[]
    for s in re.findall(r'(?is)<script[^>]+application/ld\+json[^>]*>(.*?)</script>',t):
        try: j=json.loads(s.strip())
        except Exception: continue
        st=[j]
        while st:
            o=st.pop()
            if isinstance(o,list): st.extend(o); continue
            if isinstance(o,dict):
                if o.get("@type") in ("Vehicle","Car","Product","MotorizedBicycle") or (isinstance(o.get("@type"),list) and "Vehicle" in o["@type"]): out.append(o)
                if "@graph" in o: st.extend(o["@graph"] if isinstance(o["@graph"],list) else [o["@graph"]])
    return out
def txt(x): return re.sub(r'\s+',' ',H.unescape(re.sub(r'(?s)<[^>]+>',' ',x))).strip()
def num(x):
    try: return float(str(x).replace(',','').replace('$','').strip())
    except Exception: return None
def cond_of(s):
    s=(s or "").rsplit('/',1)[-1].lower()
    return "new" if s.startswith("newcondition") else "used" if s.startswith("usedcondition") or s.startswith("refurbishedcondition") else None
def ld_vehicle(t):
    v=[o for o in lds(t) if o.get("@type")=="Vehicle" or (isinstance(o.get("@type"),list) and "Vehicle" in o["@type"])]
    return v[0] if v else None
def offer(o):
    of=o.get("offers") if o else None
    if isinstance(of,list): of=of[0] if of else None
    return of if isinstance(of,dict) else {}
def cw(t,rec):
    e={}
    from urllib.parse import urlparse
    fp=urlparse(rec.get("finalUrl") or "").path
    e["onUnitPage"]=fp.startswith("/rv/")
    v=ld_vehicle(t)
    if v:
        of=offer(v); e["ldName"]=v.get("name"); e["ldUrl"]=v.get("url"); e["ldSku"]=v.get("sku"); e["ldYear"]=v.get("vehicleModelDate")
        e["ldPrice"]=num(of.get("price")); e["ldCondition"]=cond_of(of.get("itemCondition") or v.get("itemCondition"))
        e["ldAvailability"]=(of.get("availability") or "").rsplit('/',1)[-1] or None
        s=of.get("seller") or {}; e["ldSeller"]=s.get("name"); e["ldSellerUrl"]=s.get("@id")
        e["ldVin"]=next((p.get("value") for p in v.get("additionalProperty",[]) if isinstance(p,dict) and p.get("name")=="VIN"),None)
    m=re.search(r'(?is)<h1[^>]*>(.*?)</h1>',t)
    if m:
        h=txt(m.group(1)); e["h1"]=h[:220]
        mc=re.match(r'^(New|Used)\b',h); e["h1Condition"]=mc.group(1).lower() if mc else None
        my=re.search(r'\b(19[5-9]\d|20[0-3]\d)\b',h); e["h1Year"]=int(my.group(1)) if my else None
        ms=re.search(r'Stock #\s*(\S+)',h); e["h1Stock"]=ms.group(1) if ms else None
        ml=re.search(r'\(\s*([^()]+?),\s*([A-Z]{2})\s*\)\s*$',h); e["h1City"],e["h1State"]=(ml.group(1),ml.group(2)) if ml else (None,None)
    cp=re.search(r'clearPrice\\":\{\\"__typename\\":\\"ClearPrice\\",\\"price\\":([0-9.]+|null),\\"salePrice\\":([0-9.]+|null),\\"msrp\\":([0-9.]+|null)',t)
    if cp: e["cpPrice"],e["cpSale"],e["cpMsrp"]=[num(x) if x!="null" else None for x in cp.groups()]
    i=t.find('data-testid="price-label-container"')
    if i>=0:
        mv=re.search(r'\$([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,7})',txt(t[i:i+4000])); e["visiblePrice"]=num(mv.group(1)) if mv else None
    e["visibleMsrp"]=None
    mm=re.search(r'MSRP\s*<s>\s*\$(?:<!-- -->)?([0-9,]+)',t)
    if mm: e["visibleMsrp"]=num(mm.group(1))
    e["salePendingText"]=bool(re.search(r'\bsale\s+pending\b|\bpending\s+sale\b',txt(m.group(1)) if m else "",re.I))
    return e
LM_STORE=re.compile(r'\\"normalAliases\\":\[((?:\\"[^\\]*\\",?)*)\],\\"route\\":\\"([^\\]*)\\",\\"title\\":\\"(?:[^\\]|\\\\u0026)*\\",\\"address\\":\\"([^\\]*)\\"')
def lamesa(t,rec):
    e={}
    v=ld_vehicle(t)
    if v:
        of=offer(v); e["ldSku"]=of.get("sku") or v.get("sku"); e["ldVin"]=v.get("vehicleIdentificationNumber"); e["ldName"]=v.get("name")
        e["ldPrice"]=num(of.get("price")); e["ldCondition"]=cond_of(of.get("itemCondition") or v.get("itemCondition")); e["ldAvailability"]=(of.get("availability") or "").rsplit('/',1)[-1] or None
        e["ldYear"]=v.get("modelDate")
    locs=re.findall(r'data-testid="rvunit-location">([^<]+)<',t); e["unitLocations"]=sorted(set(H.unescape(x).strip() for x in locs))
    stores={}
    for al,route,addr in LM_STORE.findall(t):
        for a in re.findall(r'\\"([^\\]+)\\"',al): stores[a]={"route":route,"address":addr}
    e["storeDirectory"]=stores
    return e
def interact(t,rec):
    e={}
    v=ld_vehicle(t)
    if v:
        e["ldSku"]=v.get("sku"); e["ldVin"]=v.get("vehicleIdentificationNumber"); e["ldName"]=v.get("name")
        of=offer(v); e["ldPrice"]=num(of.get("price")) if of else None; e["ldCondition"]=cond_of((of or {}).get("itemCondition") or v.get("itemCondition"))
        e["ldAvailability"]=((of or {}).get("availability") or "").rsplit('/',1)[-1] or None
    # The unit's own lot (the first unit-detail element); the data-dealer-* attributes are the dealer HQ, not used.
    m=re.search(r'data-unitid="(\d+)"[^>]*?data-lotid="(\d*)"\s+data-lot="([^"]*)"\s+data-lot-adress="([^"]*)"\s+data-lot-city="([^"]*)"\s+data-lot-state="([^"]*)"\s+data-lot-zip="([^"]*)"\s+data-stocknumb(?:er)?="([^"]*)"',t)
    if m: e.update(unitId=m.group(1),lotId=m.group(2),lot=H.unescape(m.group(3)),lotAddress=H.unescape(m.group(4)),lotCity=H.unescape(m.group(5)).strip(),lotState=m.group(6).strip(),lotZip=m.group(7),lotStock=H.unescape(m.group(8)))
    e["lotCitiesOnPage"]=sorted(set(re.findall(r'data-lot-city="([^"]*)"',t)))
    ti=re.search(r'(?is)<title[^>]*>(.*?)</title>',t); e["title"]=txt(ti.group(1))[:200] if ti else None
    mc=re.match(r'^(New|Used|Pre-Owned)\b',e["title"] or ""); e["titleCondition"]=("used" if mc.group(1)!="New" else "new") if mc else None
    for a in ("saleprice","pricelabel","salepricelabel","psm-unitprice"):
        ma=re.search(r'data-'+a+r'="([^"]*)"',t); e[a]=H.unescape(ma.group(1)) if ma else None
    e["soldText"]=bool(re.search(r'>\s*(?:SOLD|Sold|Sale Pending|SALE PENDING)\s*<',t))
    return e
def main():
    # incremental: pages already extracted (same key + page) are reused
    prev={}
    if os.path.exists(f"{B}/extracted.ndjson") and os.environ.get("PP_REPARSE")!="1":
        for l in open(f"{B}/extracted.ndjson"):
            j=json.loads(l); prev[(j["key"],j.get("page"))]=l
    out=open(f"{B}/extracted.ndjson.tmp","w")
    rows=[json.loads(l) for l in open(f"{B}/results.ndjson")]
    for r in rows:
        if (r["key"],r.get("page")) in prev and r.get("result")=="ok": out.write(prev[(r["key"],r.get("page"))]); continue
        if r.get("result")!="ok": out.write(json.dumps({**r,"x":None})+"\n"); continue
        t=gzip.open(f"{B}/pages/{r['page']}.html.gz","rt").read()
        f={"cw":cw,"lamesa":lamesa,"interact":interact}[r["kind"]]
        try: x=f(t,r)
        except Exception as ex: x={"parseError":str(ex)[:200]}
        out.write(json.dumps({**r,"x":x})+"\n")
    out.close(); os.replace(f"{B}/extracted.ndjson.tmp",f"{B}/extracted.ndjson")
main()

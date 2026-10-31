"""Generic listing-page reader (2026-10-31). Extracts only what the page states, with the quoted text:
schema.org Vehicle/Product JSON-LD (name, VIN, sku, itemCondition, bodyType/vehicleConfiguration/category, offer price,
availability), Interact RV markup (price-sheet-unit-type, data-saleprice / data-pricelabel, unit lot city/state), labelled
spec rows (dt/dd, th/td, label/value spans: Type / Class / Category / RV Type / Condition / VIN / Stock), and the page's
title / og:title / h1 (leading New/Used and a category phrase). Nothing is inferred.
usage: parse_generic.py <dir>   (reads <dir>/results.ndjson + pages/, writes <dir>/extracted.ndjson)"""
import json,re,sys,gzip,html as H,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from rvtype import norm_type
def strip_blocks(t):
    """drop <script>/<style>/<noscript> blocks in linear time (an unclosed block runs to the end)"""
    low=t.lower(); out=[]; i=0
    while True:
        js=[(low.find("<"+tag,i),tag) for tag in ("script","style","noscript")]
        js=[x for x in js if x[0]>=0]
        if not js: out.append(t[i:]); break
        j,tag=min(js); out.append(t[i:j]); out.append(" ")
        k=low.find("</"+tag,j)
        if k<0: break
        e=low.find(">",k); i=(e+1) if e>=0 else len(t)
    return "".join(out)
def txt(x): return re.sub(r'\s+',' ',H.unescape(re.sub(r'(?s)<[^>]+>',' ',x or ''))).strip()
def num(x):
    try:
        v=float(str(x).replace(',','').replace('$','').strip()); return v if v>0 else None
    except Exception: return None
def lds(t):
    out=[]
    for s in re.findall(r'(?is)<script[^>]+application/ld\+json[^>]*>(.*?)</script>',t):
        try: j=json.loads(s.strip(),strict=False)
        except Exception: continue
        st=[j]
        while st:
            o=st.pop()
            if isinstance(o,list): st.extend(o); continue
            if isinstance(o,dict):
                ty=o.get("@type"); tys=ty if isinstance(ty,list) else [ty]
                if any(x in ("Vehicle","Car","Product","MotorizedBicycle","RecreationalVehicle") for x in tys): out.append(o)
                if "@graph" in o: st.extend(o["@graph"] if isinstance(o["@graph"],list) else [o["@graph"]])
    return out
def cond_of(s):
    s=str(s or "").rsplit('/',1)[-1].lower()
    return "new" if s.startswith("newcondition") or s=="new" else "used" if s.startswith(("usedcondition","refurbishedcondition")) or s in("used","pre-owned","preowned") else None
LABEL=r'(RV Type|Unit Type|Vehicle Type|Type|Class|Category|Condition|VIN|Stock(?: ?(?:#|No\.?|Number))?)'
PAIR=[re.compile(r'(?is)<(dt|th)[^>]*>\s*(?:<[^>]+>\s*)*'+LABEL+r'\s*:?\s*(?:<[^>]+>\s*)*</\1>\s*<(dd|td)[^>]*>(.{0,300}?)</\3>'),
      re.compile(r'(?is)<(span|div|strong|b|label|li|p)[^>]*>\s*'+LABEL+r'\s*:?\s*</\1>\s*(?:<[^>]+>\s*){0,3}([^<]{1,80})<')]
def labelled(t):
    out=[]
    for i,p in enumerate(PAIR):
        for m in p.finditer(t):
            if i==0: lab,val=m.group(2),txt(m.group(4))
            else: lab,val=m.group(2),txt(m.group(3))
            if val and len(val)<=80: out.append((lab.strip(),val))
    return out
def _nm(x):
    if isinstance(x,dict): return x.get("name") if isinstance(x.get("name"),str) else None
    if isinstance(x,list) and x: return _nm(x[0])
    return x if isinstance(x,str) else None
def _imgs(x):
    out=[]
    for i in (x if isinstance(x,list) else [x] if x else []):
        u=i.get("url") or i.get("contentUrl") or i.get("@id") if isinstance(i,dict) else i
        if isinstance(u,str) and u.startswith("http"): out.append(u)
    return out[:15]
def _addr(o):
    if not isinstance(o,dict): return None
    a=o.get("address"); a=a[0] if isinstance(a,list) and a else a
    if not isinstance(a,dict): return {"name":o.get("name")} if o.get("name") else None
    return {"name":o.get("name"),"city":a.get("addressLocality"),"state":a.get("addressRegion"),"zip":a.get("postalCode")}
UNIT_EL=re.compile(r'<[^>]*\bdata-unitid="\d+"[^>]*>')
def unit_el(t):
    m=UNIT_EL.search(t)
    if not m: return None
    tag=m.group(0)
    d={k.lower():H.unescape(v) for k,v in re.findall(r'\bdata-([a-zA-Z-]+)="([^"]*)"',tag)}
    mc=re.search(r'class="([^"]*)"',tag); d["_class"]=mc.group(1) if mc else ""
    return d
def parse(t,rec):
    e={}
    for o in lds(t):
        of=o.get("offers"); of=(of[0] if isinstance(of,list) and of else of) if of else {}
        of=of if isinstance(of,dict) else {}
        vin=o.get("vehicleIdentificationNumber") or next((p.get("value") for p in o.get("additionalProperty",[]) if isinstance(p,dict) and str(p.get("name","")).upper()=="VIN"),None)
        cat=[str(o.get(k)) for k in("bodyType","vehicleConfiguration","category") if o.get(k) and isinstance(o.get(k),str)]
        e.setdefault("ld",[]).append({"type":o.get("@type"),"name":o.get("name"),"vin":vin,"sku":o.get("sku") or of.get("sku"),"cond":cond_of(of.get("itemCondition") or o.get("itemCondition")),
          "cat":cat,"price":num(of.get("price") or (of.get("priceSpecification") or {}).get("price") if isinstance(of.get("priceSpecification"),dict) else of.get("price")),
          "avail":(str(of.get("availability") or "")).rsplit('/',1)[-1] or None,"year":o.get("vehicleModelDate") or o.get("modelDate"),
          "mfg":_nm(o.get("manufacturer")),"brand":_nm(o.get("brand")),"model":o.get("model") if isinstance(o.get("model"),str) else _nm(o.get("model")),
          "images":_imgs(o.get("image")),"desc":(o.get("description") or "")[:1500] if isinstance(o.get("description"),str) else None,
          "seller":_addr(of.get("offeredBy") or of.get("seller") or o.get("offeredBy") or o.get("seller"))})
    m=re.search(r'(?is)<title[^>]*>(.*?)</title>',t); e["title"]=txt(m.group(1))[:250] if m else None
    m=re.search(r'(?is)<meta[^>]+property="og:title"[^>]+content="([^"]*)"',t); e["ogTitle"]=H.unescape(m.group(1))[:250] if m else None
    m=re.search(r'(?is)<h1[^>]*>(.*?)</h1>',t); e["h1"]=txt(m.group(1))[:250] if m else None
    m=re.search(r'class="price-sheet-unit-type">([^<]{2,80})<',t); e["interactType"]=H.unescape(m.group(1)).strip() if m else None
    for a in ("saleprice","pricelabel","salepricelabel"):
        ma=re.search(r'data-'+a+r'="([^"]*)"',t); e["ia_"+a]=H.unescape(ma.group(1)) if ma else None
    # the unit's own lot: attributes of the unit-detail element (data-unitid ... data-lot-city/state), not other cards
    m=re.search(r'<[^>]*\bdata-unitid="\d+"[^>]*?\bdata-lot-city="([^"]*)"\s+data-lot-state="([^"]*)"',t); e["iaLot"]=[H.unescape(m.group(1)).strip(),m.group(2).strip()] if m else None
    e["labels"]=labelled(t)[:30]
    e["ia"]=unit_el(t)
    if e["ia"] is None or not e["ia"].get("_class"):
        # some Interact templates put the class on a wrapper; record whether the page marks the unit sold/pending
        e["iaClassAny"]=" ".join(re.findall(r'class="([^"]*(?:active-status|sold-status|pending-status)[^"]*)"',t)[:2])
    body=txt(t[:600000])
    # sold/pending wording visible to the shopper only: drop scripts/styles, and nav links like "View Our Sold - Sale Pending Inventory" / "Sold Inventory"
    vis=txt(strip_blocks(t[:600000]))
    vis=re.sub(r'(?i)view our\s+sold\s*-\s*sale pending\s+inventory|sold\s*-\s*sale pending\s+inventory','',vis)
    e["soldText"]=bool(re.search(r'\b(this unit (has been|is) sold|unit (has been )?sold|sale pending|pending sale|no longer available|has been sold)\b',vis,re.I))
    e["bodyLen"]=len(body)
    # price labels visible on the page (label + amount), for review; MSRP kept apart
    e["priceLabels"]=[(a.strip(),num(b)) for a,b in re.findall(r'(?i)\b(MSRP|List Price|Retail Price|Sale Price|Our Price|Your Price|Internet Price|Price|Now|Special Price|Clearance Price|Cash Price)\s*:?\s*\$\s?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})(?:\.\d\d)?',body)][:12]
    e["vinsOnPage"]=sorted(set(re.findall(r'\b[A-HJ-NPR-Z0-9]{17}\b',t)))[:20]
    return e
def _work(args):
    D,r=args
    try:
        t=gzip.open(f"{D}/pages/{r['page']}.html.gz","rt",errors="replace").read()
        x=parse(t,r)
    except Exception as ex: x={"parseError":str(ex)[:200]}
    return json.dumps({**r,"x":x})+"\n"
def main(D):
    from multiprocessing import Pool
    prev={}
    if os.path.exists(f"{D}/extracted.ndjson") and os.environ.get("REPARSE")!="1":
        for l in open(f"{D}/extracted.ndjson"):
            j=json.loads(l)
            if j.get("x") is not None: prev[(j["key"],j.get("page"))]=l
    rows=[]
    for l in open(f"{D}/results.ndjson"):
        try: rows.append(json.loads(l))
        except Exception: pass
    out=open(f"{D}/extracted.ndjson.tmp","w"); todo=[]
    for r in rows:
        if (r["key"],r.get("page")) in prev: out.write(prev[(r["key"],r.get("page"))]); continue
        if r.get("result")!="ok": out.write(json.dumps({**r,"x":None})+"\n"); continue
        todo.append((D,r))
    with Pool(int(os.environ.get("PARSE_PROCS","6"))) as pool:
        for line in pool.imap_unordered(_work,todo,chunksize=50): out.write(line)
    out.close(); os.replace(f"{D}/extracted.ndjson.tmp",f"{D}/extracted.ndjson")
if __name__=="__main__": main(sys.argv[1])

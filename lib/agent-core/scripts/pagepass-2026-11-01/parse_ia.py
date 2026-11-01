"""parse_ia.py: the unit's OWN facts from an Interact unit page (Nov 1 re-read). Only the page's own unit element
(the tag whose data-unitlink is this page's path: price/MSRP/labels/type/specs VIN/stock/lot) and the unit-title block
right under the h1 (rv-type label, stock number, unit-tags badges). Never description text, never similar-unit lists."""
import re,html as H
from urllib.parse import urlparse
def attrs(tag):
    return {k.lower():H.unescape(v) for k,v in re.findall(r'\b(data-[a-zA-Z0-9-]+)="([^"]*)"',tag)}
def money(s):
    m=re.fullmatch(r'\$?\s*([0-9,]+(?:\.[0-9]+)?)',(s or '').strip()); return float(m.group(1).replace(',','')) if m else None
def parse(t,final_url):
    e={}
    path=urlparse(final_url).path
    e["onUnitPage"]=path.startswith("/product/")
    own=None
    for m in re.finditer(r'data-unitlink="([^"]*)"',t):
        if m.group(1)==path:
            s=t.rfind('<',0,m.start()); en=t.find('>',m.end()); own=t[s:en+1]; break
    if own:
        a=attrs(own)
        e["ownElement"]=True
        for k in ("data-saleprice","data-salepricelabel","data-msrp","data-pricelabel","data-type","data-stocknumber","data-stocknumb","data-lot-city","data-lot-state","data-unitid","data-saleorregularprice","data-discountpricelabel"):
            if k in a: e[k[5:]]=a[k]
        mv=re.search(r'(?:^|\|)VIN,([^|]+)',a.get("data-specs",""))
        e["specVin"]=mv.group(1).strip() if mv else None
        e["salePriceNum"]=money(a.get("data-saleprice")); e["msrpNum"]=money(a.get("data-msrp"))
    else: e["ownElement"]=False
    i=t.find('<div class="unit-title">')
    if i>=0:
        blk=t[i:i+8000]
        h1=re.search(r'(?s)<h1[^>]*>(.*?)</h1>',blk); e["h1"]=re.sub(r'\s+',' ',H.unescape(re.sub(r'<[^>]+>',' ',h1.group(1)))).strip() if h1 else None
        rt=re.search(r'class="rv-type-label">([^<]*)<',blk); e["typeLabel"]=H.unescape(rt.group(1)).strip() if rt else None
        sn=re.search(r'class="stock-number-text">([^<]*)<',blk); e["stockText"]=H.unescape(sn.group(1)).strip() if sn else None
        tg=re.search(r'(?s)<div class="unit-tags">(.*?)</div>',blk); g=tg.group(1) if tg else ""
        e["badges"]=[H.unescape(x).strip() for x in re.findall(r'<img[^>]*class="tag-\d+ tag-[^"]*"[^>]*alt="([^"]*)"',g)]
        e["badgeClasses"]=re.findall(r'<img[^>]*class="tag-\d+ (tag-[^"\s]*)"',g)
        e["unitTitleBlock"]=True
    else: e["badges"]=None; e["unitTitleBlock"]=False
    return e

"""Pick the page-stated facts from one extracted page (parse_generic output). Returns (facts, quotes). No inference."""
import re,sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from rvtype import norm_type
TYPE_LABELS={'rv type','unit type','vehicle type','type','class','category'}
def money(s):
    if not s: return None
    m=re.search(r'\$?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,7})(?:\.\d\d)?',str(s))
    return float(m.group(1).replace(',','')) if m else None
def facts(x):
    f={}; q={}
    ld=x.get('ld') or []
    for o in ld:
        for cat in o.get('cat') or []:
            t=norm_type(cat)
            if t and 'type' not in f: f['type']=t; q['type']=f'schema.org Vehicle category "{cat}"'
    if 'type' not in f and x.get('interactType'):
        t=norm_type(x['interactType'])
        if t: f['type']=t; q['type']=f'unit type "{x["interactType"]}"'
    if 'type' not in f:
        for lab,val in x.get('labels') or []:
            if lab.lower() in TYPE_LABELS:
                t=norm_type(val)
                if t: f['type']=t; q['type']=f'{lab}: "{val}"'; break
    if 'type' not in f:
        for nm in ('h1','ogTitle','title'):
            t=norm_type(x.get(nm))
            if t: f['type']=t; q['type']=f'listing {nm} "{x[nm][:120]}"'; break
    for o in ld:
        if o.get('cond'): f['cond']=o['cond']; q['cond']='schema.org itemCondition'; break
    if 'cond' not in f:
        for lab,val in x.get('labels') or []:
            if lab.lower()=='condition':
                c={'new':'new','used':'used','pre-owned':'used','preowned':'used'}.get(val.lower().strip())
                if c: f['cond']=c; q['cond']=f'Condition: "{val}"'; break
    if 'cond' not in f:
        for nm in ('h1','ogTitle','title'):
            m=re.match(r'^\s*(New|Used|Pre-Owned|Preowned)\b',x.get(nm) or '',re.I)
            if m: f['cond']='new' if m.group(1).lower()=='new' else 'used'; q['cond']=f'listing {nm} "{x[nm][:80]}"'; break
    msrps={p for l,p in x.get('priceLabels') or [] if l.lower() in('msrp','list price','retail price') and p}
    f['pageMsrps']=sorted(msrps)
    ia=x.get('ia') or {}
    own_sp=money(ia.get('saleprice')) if ia else None
    # 1) the unit's own price block (Interact unit element): sale price, which is the vehicle price before fees
    if own_sp and own_sp>=1000 and own_sp not in msrps:
        f['price']=own_sp; q['price']=f'unit sale price "{ia.get("saleprice")}" ({ia.get("salepricelabel") or ia.get("pricelabel") or "no label"})'
    if 'price' not in f:
        for o in ld:
            p=o.get('price')
            if p and p>=1000 and p not in msrps: f['price']=p; q['price']='schema.org offer price'; break
    if 'price' not in f and not ia:
        p=money(x.get('ia_saleprice'))
        if p and p>=1000 and p not in msrps: f['price']=p; q['price']=f'sale price "{x.get("ia_saleprice")}" ({x.get("ia_pricelabel") or "no label"})'
    # 2) dealer states a vehicle "Sale Price" and a fee-inclusive total: keep the stated vehicle (pre-fee) price
    if f.get('price') and not own_sp:
        P=f['price']; PL=x.get('priceLabels') or []
        sale=[p for l,p in PL if l.lower()=='sale price' and p]
        tot=[p for l,p in PL if l.lower() in('price','our price','your price') and p]
        if sale and sale[0]<P<=sale[0]*1.12 and P in tot:
            f['price_total_with_fees']=P; f['price']=sale[0]
            q['price']=f'stated "Sale Price" {sale[0]} (page total incl. fees {P} not used)'
    # MSRP only from the unit's own price block (Interact unit element). Page-wide MSRP labels can belong to
    # "similar units" lists, so they are never used as this unit's MSRP.
    if ia:
        ms=money(ia.get('msrp'))
        if ms and ms>=1000 and (not f.get('price') or ms>f['price']): f['msrp']=ms; q['msrp']='unit element data-msrp'
    for o in ld:
        if o.get('vin'): f['ldVin']=str(o['vin']).upper().strip(); break
    for o in ld:
        if o.get('sku'): f['ldSku']=str(o['sku']).strip(); break
    for o in ld:
        if o.get('avail'): f['avail']=o['avail']; break
    return f,q

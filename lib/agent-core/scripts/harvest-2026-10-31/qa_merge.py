"""QA + merge of the 2026-10-31 rows (same holds as v3.3, applied to the new rows only):
 - template price: one price on >=25 rows that is >=25% of a domain's new rows (or >=100 and >=10%) -> held
 - duplicate / stitched records: one listing URL emitted twice; one VIN on rows with different year/make; one
   dealer+stock on rows with different VINs -> all copies held
 - VIN/type conflict: VIN manufacturer code (first 3) that is >=98% motorized or towable in the v3.3 snapshot
   (>=20 units) contradicts the stated category -> held
 - condition read only from schema.org itemCondition: held when the domain's markup says "new" for >=5% of
   2021-or-older units (template default), and any "new" 2021-or-older unit -> held
 (non-RV wording, low prices, no type / condition / photos / location are rejected by the snapshot builder)
usage: qa_merge.py <out.ndjson> <holds.csv> <rows.ndjson>...   """
import json,sys,gzip,collections,csv,re
OUT,HOLDS=sys.argv[1],sys.argv[2]; INS=sys.argv[3:]
bare=lambda s:(s or '').lower().replace('https://','').replace('http://','').replace('www.','').split('/')[0]
MOT={"class_a","class_b","class_c"}
snap=json.load(gzip.open('/workspace/wt-h31/lib/agent-core/data/inventory.snapshot.json.gz'))['units']
wmi=collections.defaultdict(lambda:[0,0])
for u in snap:
    v=u.get('vin') or ''
    if len(v)==17 and u['provenance'].get('harvestMethod'): wmi[v[:3]][0 if u['rvType'] in MOT else 1]+=1
def side(v):
    w=wmi.get(v[:3]);
    if not w: return None
    n=sum(w)
    if n<20: return None
    return 'mot' if w[0]/n>=.98 else 'tow' if w[1]/n>=.98 else None
import os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from rvtype import norm_type,url_type
rows=[]
for p in INS:
    for l in open(p): rows.append(json.loads(l))
held={}  # idx -> reason
def hold(i,why):
    held.setdefault(i,why)
def rtype(r):
    m=r['_meta']; return m.get('page_category') or norm_type(r.get('rv_type'),r.get('title') or '') or url_type(m.get('listing_url'))
# duplicate listing URL
byurl=collections.defaultdict(list)
for i,r in enumerate(rows): byurl[(r['_meta'].get('listing_url') or '').rstrip('/').lower()].append(i)
for u,ix in byurl.items():
    if len(ix)>1:
        keys={(rows[i].get('vin'),str(rows[i].get('stock_number'))) for i in ix}
        if len(keys)>1:
            for i in ix: hold(i,'duplicate_listing_url_different_units')
        else:
            for i in ix[1:]: held.setdefault(i,'_drop_exact_dup')
# VIN on rows with different year/make
byvin=collections.defaultdict(list)
for i,r in enumerate(rows):
    if r.get('vin'): byvin[r['vin'].upper()].append(i)
for v,ix in byvin.items():
    ym={(rows[i].get('year'),(str(rows[i].get('make') or '').lower().split() or [''])[0]) for i in ix}
    if len(ym)>1:
        for i in ix: hold(i,'vin_on_conflicting_records')
# dealer+stock with different VINs
bystk=collections.defaultdict(list)
for i,r in enumerate(rows):
    if r.get('stock_number'): bystk[(bare(r['_meta']['dealer']['domain']),str(r['stock_number']).lower())].append(i)
for k,ix in bystk.items():
    vins={rows[i].get('vin') for i in ix if rows[i].get('vin')}
    titles={re.sub(r'[^a-z0-9]+',' ',str(rows[i].get('title')).lower()).strip() for i in ix}
    if len(vins)>1 or (not vins and len(titles)>1):
        for i in ix: hold(i,'stock_on_different_units')
# template prices
dom_rows=collections.defaultdict(list)
for i,r in enumerate(rows): dom_rows[bare(r['_meta']['dealer']['domain'])].append(i)
for d,ix in dom_rows.items():
    pc=collections.Counter(rows[i].get('price') for i in ix if rows[i].get('price'))
    for p,n in pc.items():
        share=n/len(ix)
        if n>=25 and (share>=.25 or (n>=100 and share>=.1)):
            for i in ix:
                if rows[i].get('price')==p: hold(i,f'template_price_{int(p)}')
# VIN/type conflict
for i,r in enumerate(rows):
    v=(r.get('vin') or '').upper(); t=rtype(r)
    if len(v)==17 and t:
        s=side(v)
        if s and s!=('mot' if t in MOT else 'tow'): hold(i,'vin_type_conflict')
# LD-only condition sanity
ldc=collections.defaultdict(lambda:[0,0])
for i,r in enumerate(rows):
    if (r['_meta'].get('condition_source') or '').startswith('schema.org') and r.get('condition')=='new':
        d=bare(r['_meta']['dealer']['domain']); ldc[d][0]+=1
        if (r.get('year') or 0)<=2021: ldc[d][1]+=1
bad_ld={d for d,(n,o) in ldc.items() if n and o/n>=.05}
for i,r in enumerate(rows):
    if (r['_meta'].get('condition_source') or '').startswith('schema.org'):
        d=bare(r['_meta']['dealer']['domain'])
        if d in bad_ld: hold(i,'ld_condition_unreliable_on_domain')
        elif r.get('condition')=='new' and (r.get('year') or 0)<=2021: hold(i,'new_condition_implausible_year')
out=open(OUT,'w'); w=csv.writer(open(HOLDS,'w',newline='')); w.writerow(['reason','domain','title','vin','stock','price','condition','listing_url'])
c=collections.Counter()
for i,r in enumerate(rows):
    if i in held:
        c[held[i]]+=1
        if held[i]!='_drop_exact_dup': w.writerow([held[i],r['_meta']['dealer']['domain'],r.get('title'),r.get('vin'),r.get('stock_number'),r.get('price'),r.get('condition'),r['_meta'].get('listing_url')])
        continue
    out.write(json.dumps(r)+'\n'); c['kept']+=1
print(json.dumps(c,indent=0)); print('ld_condition_unreliable_domains',sorted(bad_ld))

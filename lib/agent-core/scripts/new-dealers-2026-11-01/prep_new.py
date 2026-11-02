"""prep_new.py (2026-11-01 new-dealer WA batch): rows from the WA page reads -> rows for the KEEP_BASE build.
 1) qa_merge.py holds (duplicate/stitched, template price, VIN/type conflict, LD condition sanity) already applied (input).
 2) WA lots only (Jonathan t84u: Washington first). Units at the same dealers' lots in other states are left for later.
 3) dedupe against the #69 base: VIN, then dealer domain + stock number -> not added (the base record stays as it is).
 4) VIN validity (fix7 rule): 17 chars, no I/O/Q, a digit present, numeric last 4 -> else the VIN is blanked (kept on stock).
 5) order holds (fix6/fix7 rules): the unit's own title/model/trim, page og:title/title/h1, own unit tags / photo badges /
    lot status say on order / available to order / in transit / coming soon ... -> held (on_order). Description text not used.
 6) stock ORD/ORDER prefix -> held (factory_order).
usage: prep_new.py <qa_kept.ndjson> <out.ndjson> <outdir> <page dirs...>"""
import json,gzip,sys,re,os,csv,collections
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from onorder import text_hit,status_hit
src,dst,od=sys.argv[1:4]; dirs=sys.argv[4:]
bare=lambda s:(s or '').lower().replace('https://','').replace('http://','').replace('www.','').split('/')[0]
base=json.load(gzip.open('/workspace/wt-nd/lib/agent-core/data/inventory.snapshot.json.gz'))['units']
bv={(u.get('vin') or '').upper() for u in base if u.get('vin')}
bs={(bare(u['provenance']['dealerDomain']),str(u.get('stockNumber') or '').lower()) for u in base if u.get('stockNumber')}
bu={(u['provenance'].get('listingUrl') or '').rstrip('/').lower() for u in base}
X={}
for D in dirs:
    for l in open(f'{D}/extracted.ndjson'):
        j=json.loads(l)
        if j.get('x'): X[(j.get('finalUrl') or j['url'])]=j['x']; X[j['url']]=j['x']
def vin_ok(v): return bool(v) and len(v)==17 and re.match(r'^[A-HJ-NPR-Z0-9]{17}$',v) and re.search(r'\d',v) and v[-4:].isdigit()
c=collections.Counter(); out=open(dst,'w'); w=csv.writer(open(f'{od}/prep_holds.csv','w',newline=''))
w.writerow(['reason','domain','title','vin','stock','price','location','listing_url','evidence'])
for l in open(src):
    r=json.loads(l); m=r['_meta']; dom=bare(m['dealer']['domain']); st=m['dealer'].get('state'); url=m.get('listing_url') or r.get('url')
    def H(why,ev=''):
        c[why]+=1; w.writerow([why,dom,r.get('title'),r.get('vin'),r.get('stock_number'),r.get('price'),r.get('dealer_location'),url,ev])
    if st!='WA': H('not_wa_lot_deferred'); continue
    v=(r.get('vin') or '').upper()
    if v and not vin_ok(v): r['vin']=None; v=''; c['vin_blanked_invalid']+=1
    if v and v in bv: H('dup_of_base_vin'); continue
    if r.get('stock_number') and (dom,str(r['stock_number']).lower()) in bs: H('dup_of_base_dealer_stock'); continue
    if (url or '').rstrip('/').lower() in bu: H('dup_of_base_listing_url'); continue
    if re.match(r'(?i)^ord(er)?\b|^ord\d',str(r.get('stock_number') or '')): H('factory_order','stock '+str(r.get('stock_number'))); continue
    x=X.get(url) or {}
    hit=None
    for k in ('title','model','trim'):
        h=text_hit(r.get(k) if isinstance(r.get(k),str) else None)
        if h: hit=(f'own {k}',h); break
    if not hit:
        for k in ('ogTitle','title','h1'):
            h=text_hit(x.get(k))
            if h: hit=(f'own page {k}',h); break
    if not hit:
        s=status_hit([x.get('lotStatus')]+(x.get('photoBadges') or [])+(x.get('unitTags') or []))
        if s: hit=('own unit tag/badge/lot status',s)
    if hit: H('on_order',f'{hit[0]}: {hit[1]}'); continue
    out.write(json.dumps(r)+'\n'); c['kept']+=1
print(json.dumps(c,indent=0))

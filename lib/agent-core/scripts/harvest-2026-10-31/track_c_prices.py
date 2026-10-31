"""track_c_prices.py <outdir>: every Track C (sitemap / schema.org) unit whose price differs between trial5 and this build."""
import json,gzip,sys,csv,re
out=sys.argv[1]
def load(p): return {u['id']:u for u in json.load(gzip.open(p))['units']}
a=load('out_trial5/inventory.snapshot.json.gz'); b=load(f'{out}/inventory.snapshot.json.gz')
meta={}
for l in open('raw/oc_rows_np.ndjson'):
    m=json.loads(l).get('_meta') or {}; meta[m.get('listing_url')]=m
held={}
for fn in ('fix5_holds.csv','fix6_holds.csv','fix7_holds.csv','postfix_holds.csv'):
    try:
        for r in csv.DictReader(open(f'{out}/{fn}')): held[r.get('id')]=r.get('hold_reason') or r.get('reason') or fn
    except FileNotFoundError: pass
w=csv.writer(open(f'{out}/track_c_price_changes.csv','w',newline=''))
w.writerow(['domain','listing_url','title','old_price_trial5','new_price','change','evidence_now'])
n=0
for i,u in a.items():
    url=(u.get('provenance') or {}).get('listingUrl')
    if url not in meta: continue
    p0=(u.get('priceUsd') or {}).get('value'); v=b.get(i)
    p1=(v.get('priceUsd') or {}).get('value') if v else None
    if v and p0==p1: continue
    if not v and i not in held: continue
    m=meta[url]; chg='price changed' if v and p0 and p1 else ('price blanked' if v else f'unit held ({held[i]})')
    w.writerow([re.sub(r'^https?://(www\.)?','',url).split('/')[0],url,u.get('title'),p0,p1 if v else '',chg,m.get('price_quote')]); n+=1
print(n)

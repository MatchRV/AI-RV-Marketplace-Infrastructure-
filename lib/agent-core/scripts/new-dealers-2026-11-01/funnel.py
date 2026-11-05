import json,collections,sys,csv,gzip
T=sys.argv[1]; O=f'out_{T}'
def dom(u): return u.split('/')[2].replace('www.','')
c=collections.defaultdict(collections.Counter)
for f in ['raw/wa1_rows.ndjson','raw/wa2_rows.ndjson']:
    for l in open(f): r=json.loads(l); c[dom(r['_meta']['listing_url'])]['1raw']+=1
for l in open(f'raw/qa_{T}.ndjson'): r=json.loads(l); c[dom(r['_meta']['listing_url'])]['2qa_kept']+=1
for l in open(f'raw/prep_{T}.ndjson'):
    r=json.loads(l); d=dom(r['_meta']['listing_url']); c[d]['3prep_wa']+=1
    if not r['_meta'].get('page_category'): c[d]['x_nocat']+=1
    if not r.get('price'): c[d]['x_noprice']+=1
S=json.load(gzip.open(f'{O}/inventory.snapshot.json.gz'))
for u in S['units']:
    p=u.get('provenance') or {}
    if str(p.get('harvestMethod','')).endswith('2026_11_01'): c[p.get('dealerDomain','').replace('www.','')]['4loaded']+=1
for k,v in sorted(c.items()): print(k,dict(sorted(v.items())))

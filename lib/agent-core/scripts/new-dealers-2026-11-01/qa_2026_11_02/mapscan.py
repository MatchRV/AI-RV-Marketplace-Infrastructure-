import sys
import json,gzip,re,sys,html,collections
sys.path.insert(0,"tools")
s=json.load(gzip.open('out_t2/inventory.snapshot.json.gz')); b=json.load(gzip.open('out_t2/base_69.snapshot.json.gz'))
bid={u['id'] for u in b['units']}
new={u['provenance']['listingUrl']:u['id'] for u in s['units'] if u['id'] not in bid and u['provenance'].get('listingUrl')}
del s,b
from parse_generic import strip_blocks,txt
c=collections.Counter(); hits=[]
RX=re.compile(r'(?i)\bunlock\s+(?:\w+\s+){0,2}pric|\bMAP\s*(?:price|pricing)?\s*[:$]|\bMAP\b\s*\$|(?:minimum\s+)?advertised\s+price|\bMAP\s+Price\b')
for d in ['wa1','wa2']:
  for l in open(f'{d}/extracted.ndjson'):
    j=json.loads(l); u=j.get('finalUrl') or j['url']
    if u not in new or not j.get('page'): continue
    h=gzip.open(f"{d}/pages/{j['page']}.html.gz").read().decode('utf8','replace')
    t=txt(strip_blocks(h)); dom=u.split('/')[2].replace('www.','')
    c[dom]+=1
    for m in RX.finditer(t):
      hits.append((new[u],dom,m.group(0),t[max(0,m.start()-80):m.end()+80])); break
print(c); print(len(hits))
for h in hits[:40]: print(h)
json.dump(hits,open('qa4/map_hits.json','w'))

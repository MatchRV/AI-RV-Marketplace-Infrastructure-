"""failed_dealers.py <out dir>: per-dealer fetch outcomes + dealers never fetched (no sitemap / no unit-like URLs / walled)."""
import os
import json,gzip,collections as C,csv,sys
O=sys.argv[1]; W='/workspace/harvest-recheck-2026-11-02'
S=json.load(open(f'{W}/out/targets_summary.json')); per=S['per_domain']
res=C.defaultdict(C.Counter); walls={}
for D in ('fetch','fetch_cw'):
    last={}
    for l in open(f'{W}/{D}/results.ndjson'):
        try: j=json.loads(l)
        except Exception: continue
        last[j['key']]=j
    for j in last.values():
        d=j['host'].replace('www.',''); r=j.get('result'); res[d][r+('_'+str(j.get('http')) if j.get('http') in (404,410) else '')]+=1
        if r=='bot_wall': walls[d]=j['url']
sm={}
for f in ('interact','other','rest','cw'):
    for l in open(f'{W}/sm/{f}_sm.ndjson'):
        t=json.loads(l); sm[t['domain']]=t
snap=json.load(gzip.open(os.environ.get('BASE',f'{W}/out/base_main_0587f89.snapshot.json.gz')))['units']
units=C.Counter(u['provenance']['dealerDomain'] for u in snap)
rows=[]
for d,n in units.items():
    t=sm.get(d); why=''
    if d=='rv.campingworld.com': why='partial: CW listing results (Seattle area) + own pages 1 in flight'
    elif not t or not t['urls']: why='no sitemap URLs'+(' ('+(t.get('wall') or t.get('error') or '')+')' if t and (t.get('wall') or t.get('error')) else '')
    elif t.get('wall'): why='sitemap wall: '+t['wall']
    elif per.get(d,{}).get('cand',1)==0: why='no unit-like URLs in sitemap'
    c=res.get(d,{}); 
    if d in walls: why=(why+'; ' if why else '')+'bot wall at '+walls[d][:90]
    if c.get('robots_disallowed'): why=(why+'; ' if why else '')+f"robots disallowed {c['robots_disallowed']}"
    if c.get('error'): why=(why+'; ' if why else '')+f"fetch errors {c['error']}"
    rows.append([d,n,dict(c),why])
with open(f'{O}/dealer_fetch_status.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['dealer_domain','base_units','page_results','problem']); w.writerows(sorted(rows,key=lambda r:-r[1]))
prob=[r for r in rows if r[3]]
print(json.dumps({'dealers':len(rows),'dealers_with_pages_read':sum(1 for r in rows if r[2].get('ok')),'with_problem':len(prob),'units_at_problem_dealers':sum(r[1] for r in prob),
 'no_sitemap_urls':sum(1 for r in rows if r[3].startswith('no sitemap')),'bot_walled':len(walls),'no_unit_like':sum(1 for r in rows if r[3].startswith('no unit-like'))}))

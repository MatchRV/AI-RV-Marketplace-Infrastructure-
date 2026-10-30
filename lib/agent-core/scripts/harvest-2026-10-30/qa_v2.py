"""Seeded, dealer-stratified QA sample. usage: qa_v2.py <snapshot.gz> new|refresh <out.csv> <seed> <n>"""
import json,gzip,sys,random,csv,collections as C,datetime
snap,mode,outp,seed,n=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]),int(sys.argv[5])
new=json.load(gzip.open(snap)); old=json.load(gzip.open('/workspace/harvest-2026-10-30/inventory.snapshot.oct14.json.gz'))
oseen={u['id']:u['provenance']['lastSeenAt'] for u in old['units']}
P=lambda s: datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
if mode=='new': pool=[u for u in new['units'] if u['id'] not in oseen]
else: pool=[u for u in new['units'] if u['id'] in oseen and u['provenance'].get('harvestMethod') and P(u['provenance']['lastSeenAt'])>P(oseen[u['id']])]
random.seed(seed); byd=C.defaultdict(list)
for u in pool: byd[u['provenance']['dealerDomain']].append(u)
doms=sorted(byd); random.shuffle(doms); pick=[]; i=0
while len(pick)<n and doms and i<20000:
    d=doms[i%len(doms)]; cand=[u for u in byd[d] if u not in pick]
    if cand: pick.append(random.choice(cand))
    i+=1
def fv(f): return '' if f['value'] is None else f['value']
def fs(f): return '' if f['value'] is None else f'{f.get("source")}|{f.get("sourceUrl") or ""}'
def pt(s): return P(s).astimezone(datetime.timezone(datetime.timedelta(hours=-7))).strftime('%Y-%m-%d %H:%M PDT')
cols=['vin','stock_number','dealer_name','dealer_domain','dealer_city_state','listing_url','year','make','model','floorplan_code','rv_type','condition','price_usd_as_stored','price_source','sleeps','sleeps_source','length_ft','length_source','dry_weight_lbs','dry_weight_source','gvwr_lbs','gvwr_source','last_seen_PT','last_seen_basis','harvest_method','unit_id']
if mode=='refresh': cols+=['refresh_source']
with open(outp,'w',newline='') as fh:
    w=csv.writer(fh); w.writerow(cols)
    for u in pick:
        p=u['provenance']
        row=[u['vin'] or '',u['stockNumber'] or '',u['dealer']['name'],p['dealerDomain'],f"{u['dealer']['city']}, {u['dealer']['state']}",p.get('listingUrl'),u['year'],u['make'],u['model'],u.get('floorplanCode') or '',u['rvType'],u['condition'],
             fv(u['priceUsd']),fs(u['priceUsd']),fv(u['sleeps']),fs(u['sleeps']),fv(u['lengthFt']),fs(u['lengthFt']),fv(u['dryWeightLbs']),fs(u['dryWeightLbs']),fv(u['gvwrLbs']),fs(u['gvwrLbs']),pt(p['lastSeenAt']),p.get('lastSeenBasis'),p.get('harvestMethod'),u['id']]
        if mode=='refresh': row.append('marketcheck' if str(p.get('harvestMethod','')).startswith('marketcheck') else 'dealer_website')
        w.writerow(row)
src=C.Counter(('marketcheck' if str(u['provenance'].get('harvestMethod','')).startswith('marketcheck') else 'dealer_website') for u in pool)
print(json.dumps({"mode":mode,"pool":len(pool),"pool_dealers":len(byd),"picked":len(pick),"pool_by_source":src,"picked_by_source":C.Counter(('marketcheck' if str(u['provenance'].get('harvestMethod','')).startswith('marketcheck') else 'dealer_website') for u in pick)}))

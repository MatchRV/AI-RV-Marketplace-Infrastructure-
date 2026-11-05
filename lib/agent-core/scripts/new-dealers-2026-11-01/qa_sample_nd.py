# qa_sample_nd.py <snapshot.gz> <outcsv> [n=30]: stratified sample of the new WA units (harvestMethod *_2026_11_01), round-robin by domain, blank CSO_check
import gzip,json,sys,csv,random,collections
S=json.load(gzip.open(sys.argv[1])); n=int(sys.argv[3]) if len(sys.argv)>3 else 30
new=[u for u in S['units'] if str((u.get('provenance') or {}).get('harvestMethod','')).endswith('2026_11_01')]
random.seed(20261101); random.shuffle(new)
by=collections.defaultdict(list)
for u in new: by[u['provenance'].get('dealerDomain')].append(u)
pick=[]
while len(pick)<n and any(by.values()):
    for d in sorted(by, key=lambda d:-len(by[d])):
        if by[d] and len(pick)<n: pick.append(by[d].pop())
v=lambda f:(f or {}).get('value') if isinstance(f,dict) else f
with open(sys.argv[2],'w',newline='') as f:
    w=csv.writer(f); w.writerow(['id','dealer','domain','lot_city','lot_state','listing_url','year','make','model','rvType','condition','price_usd','msrp_usd','vin','stock','bunkhouse','length_ft','sleeps','lastSeenAt','CSO_check'])
    for u in pick:
        d=u['dealer']; p=u['provenance']
        w.writerow([u['id'],d['name'],p.get('dealerDomain'),d['city'],d['state'],p.get('listingUrl'),v(u.get('year')),v(u.get('make')),v(u.get('model')),v(u.get('rvType')),v(u.get('condition')),
                    v(u.get('priceUsd')),v(u.get('msrpUsd')),u.get('vin'),u.get('stockNumber'),v(u.get('bunkhouse')),v(u.get('lengthFt')),v(u.get('sleeps')),p.get('lastSeenAt'),''])
print(len(new),len(pick),collections.Counter(u['provenance'].get('dealerDomain') for u in pick))

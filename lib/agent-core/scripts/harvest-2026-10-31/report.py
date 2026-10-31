"""report.py <snapshot.gz> <base.gz> <outdir>: new-domain list, added-units by domain, 50-unit random QA sample of new units."""
import gzip,json,sys,re,random,csv,collections
snap,base,out=sys.argv[1:4]
S=json.load(gzip.open(snap)); B=json.load(gzip.open(base))
def dom(u): return re.sub(r'^https?://(www\.)?','',(u.get('dealer') or {}).get('website') or '').split('/')[0].lower()
bid={u['id'] for u in B['units']}; bdom=collections.Counter(dom(u) for u in B['units'])
bvin={u['vin'] for u in B['units'] if u.get('vin')}; bstk={(dom(u),u.get('stockNumber')) for u in B['units'] if u.get('stockNumber')}
new=[u for u in S['units'] if u['id'] not in bid and not (u.get('vin') and u['vin'] in bvin) and not (u.get('stockNumber') and (dom(u),u['stockNumber']) in bstk)]
def grp(d):
    for g,p in [("Blue Compass RV","bluecompass"),("Bish's RV","bishs"),("Camping World","campingworld"),("Campers Inn","campersinn"),("Lazydays","lazydays"),("Markquart RV","markquart"),("Airstream dealers","airstream"),("Pete's RV","petesrv"),("Meyer's RV","meyersrv"),("General RV","generalrv")]:
        if p in d: return g
    return d
bydom=collections.Counter(dom(u) for u in new)
rows=[{"domain":d,"group":grp(d),"new_units":n,"domain_new_to_matchrv":bdom[d]==0} for d,n in bydom.most_common()]
json.dump(rows,open(f"{out}/added_by_domain.json","w"),indent=1)
g=collections.Counter()
for r in rows: g[r["group"]]+=r["new_units"]
json.dump(g.most_common(),open(f"{out}/added_by_group.json","w"),indent=1)
random.seed(20261031); sample=random.sample(new,min(50,len(new)))
f=open(f"{out}/qa_sample_50_new_units.csv","w",newline=""); w=csv.writer(f)
w.writerow(["id","listing_url","fetched_at","dealer","dealer_domain","city","state","year","make","model","trim","rv_type","condition","vin","stock","price_usd","msrp_usd","price_source","harvest_method","photos"])
for u in sample:
    p=u.get('provenance') or {}
    w.writerow([u['id'],p.get('listingUrl') or p.get('url'),p.get('lastSeenAt'),(u.get('dealer') or {}).get('name'),dom(u),(u.get('dealer') or {}).get('city'),(u.get('dealer') or {}).get('state'),
        u.get('year'),u.get('make'),u.get('model'),u.get('trim'),u.get('rvType'),u.get('condition'),u.get('vin'),u.get('stockNumber'),(u.get('priceUsd') or {}).get('value'),(u.get('msrpUsd') or {}).get('value'),
        (u.get('priceUsd') or {}).get('source'),p.get('harvestMethod'),len(u.get('images') or [])])
f.close()
print(json.dumps({"new_units":len(new),"new_domains":sum(1 for r in rows if r["domain_new_to_matchrv"]),"units_on_new_domains":sum(r["new_units"] for r in rows if r["domain_new_to_matchrv"])}))

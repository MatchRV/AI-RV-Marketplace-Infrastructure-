"""qa_sample.py <snapshot.gz> <base.gz> <outdir>: per-track breakdown of new searchable units and a stratified 50-unit QA sample
(Track A = MarketCheck-gap rows confirmed on the dealer page; B = Interact unit pages; C = other dealer sitemaps / schema.org),
spread across domains (<=2 per domain) and favouring domains new to MatchRV."""
import gzip,json,sys,re,random,csv,collections,datetime
snap,base,out=sys.argv[1:4]
S=json.load(gzip.open(snap)); B=json.load(gzip.open(base))
def dom(u): return re.sub(r'^https?://(www\.)?','',(u.get('dealer') or {}).get('website') or '').split('/')[0].lower()
def nurl(u): return (u or '').split('?')[0].rstrip('/').lower().replace('://www.','://')
track={}; meta={}
for f,t in [('raw/pa_rows.ndjson','A'),('raw/ib_rows.ndjson','B'),('raw/ib2_rows.ndjson','B'),('raw/ib3a_rows.ndjson','B'),('raw/ib3b_rows.ndjson','B'),('raw/ib4_rows.ndjson','B'),('raw/ib5g_rows.ndjson','B'),('raw/ib5n_rows.ndjson','B'),('raw/ib6_rows.ndjson','B'),('raw/oc_rows_np.ndjson','C')]:
    try:
        for l in open(f):
            j=json.loads(l); m=j.get('_meta') or {}; k=nurl(m.get('listing_url')); track[k]=t; meta[k]=m
    except FileNotFoundError: pass
bid={u['id'] for u in B['units']}; bdom=collections.Counter(dom(u) for u in B['units'])
bvin={u['vin'] for u in B['units'] if u.get('vin')}; bstk={(dom(u),u.get('stockNumber')) for u in B['units'] if u.get('stockNumber')}
built=datetime.datetime.fromisoformat(S['builtAt'].replace('Z','+00:00')); cut=built-datetime.timedelta(days=30)
def searchable(u):
    ls=(u.get('provenance') or {}).get('lastSeenAt')
    return bool(ls) and datetime.datetime.fromisoformat(ls.replace('Z','+00:00'))>=cut and (u.get('priceUsd') or {}).get('value') and u.get('images')
new=[u for u in S['units'] if u['id'] not in bid and not (u.get('vin') and u['vin'] in bvin) and not (u.get('stockNumber') and (dom(u),u['stockNumber']) in bstk)]
for u in new: u['_track']=track.get(nurl((u.get('provenance') or {}).get('listingUrl')),'?')
ref=[u for u in S['units'] if u not in new] if False else None
bt=collections.Counter(u['_track'] for u in new); bts=collections.Counter(u['_track'] for u in new if searchable(u))
newdom=collections.Counter(dom(u) for u in new if bdom[dom(u)]==0 and searchable(u))
summ={"new_units":len(new),"new_units_by_track":bt,"new_searchable_by_track":bts,"new_domains":len(newdom),"new_domain_units_searchable":sum(newdom.values()),
      "new_domains_list":newdom.most_common()}
json.dump(summ,open(f"{out}/tracks.json","w"),indent=1)
random.seed(20261031)
pool=[u for u in new if searchable(u)]; random.shuffle(pool)
quota={'A':15,'B':20,'C':15}; per=collections.Counter(); pick=[]
for prefer_new in (True,False):
    for u in pool:
        t=u['_track']; d=dom(u)
        if t not in quota or u in pick or per[d]>=2: continue
        if prefer_new and bdom[d]>0 and per[d]>=1: continue
        if sum(1 for x in pick if x['_track']==t)>=quota[t]: continue
        pick.append(u); per[d]+=1
f=open(f"{out}/qa_sample_50_new_units.csv","w",newline=""); w=csv.writer(f)
w.writerow(["track","domain_new_to_matchrv","id","listing_url","fetched_at_utc","dealer","dealer_domain","city","state","year","make","model","trim","rv_type","condition","vin","stock","price_usd","msrp_usd","photos","category_quote","condition_source","price_basis","location_source","CSO_check (ok / wrong field / not on page)"])
for u in pick:
    p=u.get('provenance') or {}; m=meta.get(nurl(p.get('listingUrl')),{})
    w.writerow([u['_track'],bdom[dom(u)]==0,u['id'],p.get('listingUrl'),p.get('lastSeenAt'),(u.get('dealer') or {}).get('name'),dom(u),(u.get('dealer') or {}).get('city'),(u.get('dealer') or {}).get('state'),
        u.get('year'),u.get('make'),u.get('model'),u.get('trim'),u.get('rvType'),u.get('condition'),u.get('vin'),u.get('stockNumber'),(u.get('priceUsd') or {}).get('value'),(u.get('msrpUsd') or {}).get('value'),len(u.get('images') or []),
        m.get('page_category_quote'),m.get('condition_source'),m.get('price_basis'),m.get('location_source'),""])
f.close()
print(json.dumps({k:v for k,v in summ.items() if k!='new_domains_list'}), "sample", collections.Counter(u['_track'] for u in pick), "domains", len(per))

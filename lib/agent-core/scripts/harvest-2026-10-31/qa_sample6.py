"""qa_sample6.py <snapshot.gz> <base.gz> <outdir>: 50-unit QA sample for trial6, excluding the trial4 and trial5 sample
units; weighted to the multi-lot dealers found by the trial6 audit, Southland RV, consignment brokers, dealers with
on-order holds (units kept), and Track C prices. Blank CSO_check / CSO_note columns."""
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
prev=set()
for fn in ('out_trial4/qa_sample_50_new_units.csv','out_trial5/qa_sample_50_trial5.csv'):
    for l in csv.DictReader(open(fn)): prev.add(l['id'])
FX={}
for fn in ('fix5_changes.csv','fix6_changes.csv'):
    for r in csv.DictReader(open(f'{out}/{fn}')): FX.setdefault(r['id'],[]).append(f"{r['field']}: {r['old']} -> {r['new']} ({r['evidence']})")
AUD=set(json.load(open('multi_audit.json')))-set(json.load(open(f'{out}/fix5_multi.json')))
F6=json.load(open(f'{out}/fix6.json'))
OO={k.split(':',1)[1] for k in F6 if k.startswith('held_on_order:')}
SELL=set(json.load(open(f'{out}/fix6_sellmulti.json')))
bid={u['id'] for u in B['units']}
built=datetime.datetime.fromisoformat(S['builtAt'].replace('Z','+00:00')); cut=built-datetime.timedelta(days=30)
def searchable(u):
    ls=(u.get('provenance') or {}).get('lastSeenAt')
    return bool(ls) and datetime.datetime.fromisoformat(ls.replace('Z','+00:00'))>=cut and (u.get('priceUsd') or {}).get('value') and u.get('images')
for u in S['units']: u['_track']='base' if u['id'] in bid else track.get(nurl((u.get('provenance') or {}).get('listingUrl')),'?')
pool=[u for u in S['units'] if searchable(u) and u['id'] not in prev and (u.get('provenance') or {}).get('listingUrl')]
random.seed(20261031+6); random.shuffle(pool)
def loc_fixed(u): return any(x.startswith('location') for x in FX.get(u['id'],[]))
strata=[('southland',4,lambda u: dom(u)=='southlandrv.com',4),
        ('broker_registry',3,lambda u: dom(u) in ('theregistryllc.com','rvclassified.com'),3),
        ('multi_lot_audit',12,lambda u: dom(u) in AUD and loc_fixed(u),2),
        ('multi_lot_audit',3,lambda u: dom(u) in AUD,2),
        ('seller_lot_moved',5,lambda u: dom(u) in SELL and loc_fixed(u),2),
        ('near_on_order',7,lambda u: dom(u) in OO and u.get('condition')=='new',2),
        ('track_C_price',14,lambda u: u['_track']=='C' and (u.get('priceUsd') or {}).get('value'),2),
        ('fixed_other',2,lambda u: u['id'] in FX,2)]
pick=[]; per=collections.Counter(); why={}
for name,n,f,cap in strata:
    k=0
    for u in pool:
        if k>=n: break
        if u['id'] in why or per[dom(u)]>=cap or not f(u): continue
        pick.append(u); why[u['id']]=name; per[dom(u)]+=1; k+=1
w=csv.writer(open(f"{out}/qa_sample_50_trial6.csv","w",newline=""))
w.writerow(["stratum","track","id","listing_url","last_seen_utc","dealer","dealer_domain","city","state","year","make","model","trim","floorplan","rv_type","destination_trailer","condition","vin","stock","price_usd","msrp_usd","photos","price_quote","category_quote","location_source","fixes_applied_trial5_trial6","CSO_check","CSO_note"])
for u in pick:
    p=u.get('provenance') or {}; m=meta.get(nurl(p.get('listingUrl')),{})
    w.writerow([why[u['id']],u['_track'],u['id'],p.get('listingUrl'),p.get('lastSeenAt'),(u.get('dealer') or {}).get('name'),dom(u),(u.get('dealer') or {}).get('city'),(u.get('dealer') or {}).get('state'),
        u.get('year'),u.get('make'),u.get('model'),u.get('trim'),u.get('floorplanCode'),u.get('rvType'),bool(u.get('destinationTrailer')),u.get('condition'),u.get('vin'),u.get('stockNumber'),(u.get('priceUsd') or {}).get('value'),(u.get('msrpUsd') or {}).get('value'),len(u.get('images') or []),
        m.get('price_quote'),m.get('page_category_quote'),m.get('location_source'),' | '.join(FX.get(u['id'],[])),"",""])
print(json.dumps({"sample":len(pick),"by_stratum":collections.Counter(why.values()),"by_track":collections.Counter(u['_track'] for u in pick),"domains":len(per),"excluded_prior_sample_ids":len(prev)}))

"""qa_sample7.py <outdir>: 25-unit spot sample covering the trial7 fixes (order holds, dedupe, make split); blank CSO columns."""
import json,gzip,sys,csv,random,collections,re
out=sys.argv[1]; random.seed(20261031+7)
prev=set()
for fn in ('out_trial4/qa_sample_50_new_units.csv','out_trial5/qa_sample_50_trial5.csv','out_trial6/qa_sample_50_trial6.csv'):
    for l in csv.DictReader(open(fn)): prev.add(l['id'])
S={u['id']:u for u in json.load(gzip.open(f'{out}/inventory.snapshot.json.gz'))['units']}
def pick(rows,n,key):
    random.shuffle(rows); per=collections.Counter(); o=[]
    for r in rows:
        if len(o)>=n: break
        d=key(r)
        if per[d]>=2: continue
        per[d]+=1; o.append(r)
    return o
H=[r for r in csv.DictReader(open(f'{out}/fix7_holds.csv')) if r['id'] not in prev and r['listing_url']]
D=[r for r in csv.DictReader(open(f'{out}/fix7_dedupe.csv')) if r['kept_id'] in S and r['removed_id'] not in prev]
M=[r for r in csv.DictReader(open(f'{out}/fix7_changes.csv')) if r['id'] in S and r['id'] not in prev and r['listing_url']]
rows=[]
for r in pick(H,9,lambda r:r['domain']):
    rows.append(['order_hold (held: not in the build)',r['id'],r['listing_url'],r['domain'],r['title'],'','',r['detail'],''])
for r in pick(D,8,lambda r:r['domain']):
    k=S[r['kept_id']]
    rows.append(['dedupe (kept record shown)',r['kept_id'],(k.get('provenance') or {}).get('listingUrl'),r['domain'],k.get('title'),k.get('make'),k.get('model'),f"removed older {r['removed_id']} (last seen {r['removed_last_seen']}, VIN {r['removed_vin']}, stock {r['removed_stock']}) as the same unit: {r['match']}; kept last seen {r['kept_last_seen']}, price {r['price']}",r['removed_id']])
for r in pick(M,8,lambda r:r['new'].split(' / ')[0]):
    u=S[r['id']]
    rows.append(['make_split',r['id'],r['listing_url'],re.sub(r'^https?://(www\.)?','',(u['dealer'].get('website') or '')).split('/')[0],u.get('title'),u.get('make'),u.get('model'),f"{r['old']} -> {r['new']}",''])
w=csv.writer(open(f'{out}/qa_spot_25_trial7.csv','w',newline=''))
w.writerow(['fix','id','listing_url','dealer_domain','title','make','model','what_changed','removed_id','CSO_check','CSO_note'])
for r in rows: w.writerow(r+['',''])
print(json.dumps({'rows':len(rows),'by_fix':collections.Counter(r[0].split(' ')[0] for r in rows)}))

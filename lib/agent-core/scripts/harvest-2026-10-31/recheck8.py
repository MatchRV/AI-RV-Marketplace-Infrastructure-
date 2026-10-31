"""recheck8.py: trial8 release/still-held by dealer, invalid-VIN list, and the 10-unit CSO recheck CSV."""
import csv,json,gzip,collections,sys
H='/workspace/harvest-2026-10-31'; A=f'{H}/out_trial7'; O=f'{H}/out_trial8'
def held(d):
    s={}
    for fn,col in ((f'{d}/fix6_holds.csv','on_order'),(f'{d}/fix7_holds.csv','order_not_on_lot')):
        for r in csv.DictReader(open(fn)):
            if r['hold_reason']==col: s[r['id']]=r
    return s
a=held(A); b=held(O)
rel=[a[i] for i in a if i not in b]
U={u['id']:u for u in json.load(gzip.open(f'{O}/inventory.snapshot.json.gz'))['units']}
with open(f'{O}/order_release_trial8.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['id','domain','listing_url','title','trial7_hold_detail','in_trial8_snapshot'])
    for r in rel: w.writerow([r['id'],r['domain'],r.get('listing_url',''),r.get('title',''),r['detail'],r['id'] in U])
ra=collections.Counter(r['domain'] for r in rel); sb=collections.Counter(r['domain'] for r in b.values()); ta=collections.Counter(r['domain'] for r in a.values())
with open(f'{O}/order_hold_by_dealer_trial8.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['domain','held_trial7','released_trial8','still_held_trial8'])
    for d in sorted(set(ta)|set(sb),key=lambda d:-ta[d]): w.writerow([d,ta[d],ra[d],sb[d]])
with open(f'{O}/vin_invalid_blanked_trial8.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['id','listing_url','old_vin','reason'])
    for r in csv.reader(open(f'{O}/fix7_changes.csv')):
        if len(r)>5 and r[2]=='vin': w.writerow([r[0],r[1],r[3],r[5]])
def row(sec,i,detail):
    u=U.get(i) or {}; src=a.get(i) or b.get(i) or {}; pv=u.get('provenance') or {}
    return [sec,i,pv.get('listingUrl') or pv.get('url') or u.get('listingUrl') or src.get('listing_url','') or '(no listing URL stored)',pv.get('dealerDomain') or src.get('domain',''),u.get('title') or src.get('title',''),u.get('vin') or '', 'searchable in trial8 snapshot' if i in U else 'not in trial8 snapshot (held/removed)',detail,'','']
out=[]
pick=[r for r in rel if r['domain']=='conejorv.com'][:2]+[r for r in rel if r['domain']=='motorsportsland.com'][:1]
for r in pick: out.append(row('released former hold',r['id'],'trial7 hold was description-only: '+r['detail'][:200]))
sh=[r for r in b.values() if r['domain']=='bishs.com'][:1]+[r for r in b.values() if r['domain']=='rvdynasty.com'][:1]+[r for r in b.values() if r['domain']=='giantrv.com'][:1]
for r in sh: out.append(row('still-held order unit',r['id'],r['detail'][:200]))
d7=list(csv.DictReader(open(f'{A}/fix7_dedupe.csv')))
for r in [r for r in d7 if r['domain']=='sporttruckrv.com' and r['removed_vin'] and r['kept_vin'] and not r['kept_vin'].replace(' ','').endswith(r['removed_vin'].replace(' ',''))][:3]:
    out.append(row('VIN-conflict dedupe undone',r['removed_id'],f"trial7 merged into {r['kept_id']} (VIN {r['kept_vin']}); VIN tail {r['removed_vin']} conflicts; both kept in trial8 (kept id present: {r['kept_id'] in U})"))
d8=list(csv.DictReader(open(f'{O}/fix7_dedupe.csv')))
bc=[r for r in d8 if r['domain']=='bobbycombsrvcenter.com' and r['removed_id']=='vin:$12,546']
for r in bc[:1]: out.append(row('Bobby Combs record',r['kept_id'],f"trial7 kept {r['removed_id']} (VIN field held a price) and dropped this valid-VIN record; trial8 keeps this record and drops {r['removed_id']}; '$…' VIN values blanked"))
with open(f'{O}/qa_recheck_10_trial8.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['section','id','listing_url','dealer_domain','title','vin','status_trial8','detail','CSO_check','CSO_note']); w.writerows(out)
print(json.dumps({'trial7_order_held':len(a),'trial8_order_held':len(b),'released':len(rel),'recheck_rows':len(out),'released_by_dealer':ra.most_common(),'still_held_top':sb.most_common(20)}))

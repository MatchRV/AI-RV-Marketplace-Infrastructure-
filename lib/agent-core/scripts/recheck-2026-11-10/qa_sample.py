"""qa_sample.py <out dir> <csv out>: 30-row QA sample for CSO (seeded, stratified, WA oversampled)."""
import os
import csv,json,gzip,random,sys,collections
O,OUT=sys.argv[1:3]; W='/workspace/harvest-recheck-2026-11-10'; random.seed(20261105)
base={u['id']:u for u in json.load(gzip.open(os.environ.get('BASE',f'{W}/out/base_main_e2e411b.snapshot.json.gz')))['units']}
fin={u['id']:u for u in json.load(gzip.open(f'{O}/inventory.snapshot.json.gz'))['units']}
def rd(p):
    try: return list(csv.DictReader(open(p)))
    except FileNotFoundError: return []
chg=[]; 
for src,f in (('cw',f'{O}/cw/pagepass_field_changes.csv'),('interact',f'{O}/ia/fix1_field_changes.csv'),('other',f'{O}/gen/gen_field_changes.csv')):
    for r in rd(f): r['src']=src; chg.append(r)
rem=[]
for src,f in (('cw',f'{O}/cw/pagepass_removed_units.csv'),('interact',f'{O}/ia/fix1_removed_or_held.csv'),('other',f'{O}/gen/gen_removed_or_held.csv')):
    for r in rd(f): r['src']=src; rem.append(r)
remids={r['unit_id'] for r in rem}
ls=[r for r in chg if r['field']=='provenance.lastSeenAt' and r['unit_id'] in fin]
pc=[r for r in chg if r['field']=='priceUsd' and r['unit_id'] in fin]
lot=[r for r in chg if r['field']=='dealer' and r['unit_id'] in fin]
lotd=rd(f'{O}/ia/fix1_lot_differs_not_applied.csv')
pcids={r['unit_id'] for r in pc}
refr=[r for r in ls if r['unit_id'] not in pcids]
def st(uid):
    u=base.get(uid) or fin.get(uid); return u['dealer']['state'] if u else ''
def pick(rows,n,wa=1):
    rows=list(rows); random.shuffle(rows); w=[r for r in rows if st(r['unit_id'])=='WA']; o=[r for r in rows if st(r['unit_id'])!='WA']
    return (w[:wa]+o)[:n] if wa else rows[:n]
S=[]
def add(kind,rows,n,wa=1): 
    for r in pick(rows,n,wa): S.append((kind,r))
add('refreshed_no_price_change',[r for r in refr if r['src']=='interact'],4); add('refreshed_no_price_change',[r for r in refr if r['src']=='other'],3); add('refreshed_no_price_change',[r for r in refr if r['src']=='cw'],3)
add('price_changed',pc,6)
for reason,n in (('dead_sold',1),('sale_pending',1),('dead_page_gone',2),('sold_or_sale_pending',1),('on_order',1)):
    add('removed_'+reason,[r for r in rem if r['reason']==reason],n,wa=0)
add('held_price_unverified',[r for r in rem if r['reason']=='price_unverified'],4,wa=0)
add('lot_moved',lot,2); 
S2=[]
for r in random.sample(lotd,min(2,len(lotd))): S2.append(('lot_differs_not_applied',r))
S+=S2
seen=set(); rows=[]
for kind,r in S:
    uid=r['unit_id']
    if uid in seen: continue
    seen.add(uid); b=base.get(uid) or {}; f=fin.get(uid)
    rows.append({'sample_type':kind,'unit_id':uid,'dealer_domain':r.get('dealer_domain',''),'state':st(uid),'title':b.get('title',''),'vin':b.get('vin') or '','stock':b.get('stockNumber') or '',
      'before_price':(b.get('priceUsd') or {}).get('value'),'after_price':(f['priceUsd']['value'] if f else 'REMOVED/HELD'),'before_lastSeen':(b.get('provenance') or {}).get('lastSeenAt',''),'after_lastSeen':(f['provenance']['lastSeenAt'] if f else ''),
      'source_url':r.get('source_url',''),'action_or_reason':r.get('reason') or r.get('rule') or ('ours: '+r.get('ours','')+' | page: '+r.get('page','')),'CSO_check':''})
# top up to 30 from refreshed
extra=[r for r in refr if r['unit_id'] not in seen]; random.shuffle(extra)
for r in extra:
    if len(rows)>=30: break
    uid=r['unit_id']; seen.add(uid); b=base[uid]; f=fin[uid]
    rows.append({'sample_type':'refreshed_no_price_change','unit_id':uid,'dealer_domain':r['dealer_domain'],'state':st(uid),'title':b['title'],'vin':b.get('vin') or '','stock':b.get('stockNumber') or '','before_price':b['priceUsd']['value'],'after_price':f['priceUsd']['value'],'before_lastSeen':b['provenance']['lastSeenAt'],'after_lastSeen':f['provenance']['lastSeenAt'],'source_url':r['source_url'],'action_or_reason':r['rule'],'CSO_check':''})
rows=rows[:30]
w=csv.DictWriter(open(OUT,'w',newline=''),fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print(len(rows),collections.Counter(r['sample_type'] for r in rows),'WA',sum(1 for r in rows if r['state']=='WA'))

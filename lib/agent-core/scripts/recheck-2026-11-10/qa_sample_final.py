"""qa_sample_final.py <change-log dir> <final snapshot> <quarantine csv> <csv out>: 30-row CSO QA sample on the FINAL build
(re-check t5 + car-dealer quarantine). Seeded, stratified across refreshed / repriced / removed / held / condition / lot / unknown-city /
car-dealer quarantine; WA oversampled. 'after_*' columns are read from the final snapshot, so they show what ships."""
import csv,json,gzip,random,sys,collections
O,FIN,QC,OUT=sys.argv[1:5]; VQ=sys.argv[5] if len(sys.argv)>5 else None; W='/workspace/harvest-recheck-2026-11-10'; random.seed(20261103)
base={u['id']:u for u in json.load(gzip.open(f'{W}/out/base_main_e2e411b.snapshot.json.gz'))['units']}
fin={u['id']:u for u in json.load(gzip.open(FIN))['units']}
def rd(p):
    try: return list(csv.DictReader(open(p)))
    except FileNotFoundError: return []
chg=[];rem=[]
for src,f in (('cw','cw/pagepass_field_changes.csv'),('interact','ia/fix1_field_changes.csv'),('other','gen/gen_field_changes.csv')):
    for r in rd(f'{O}/{f}'): r['src']=src; chg.append(r)
for src,f in (('cw','cw/pagepass_removed_units.csv'),('interact','ia/fix1_removed_or_held.csv'),('other','gen/gen_removed_or_held.csv')):
    for r in rd(f'{O}/{f}'): r['src']=src; rem.append(r)
pc=[r for r in chg if r['field']=='priceUsd' and r['unit_id'] in fin]; pcids={r['unit_id'] for r in pc}
refr=[r for r in chg if r['field']=='provenance.lastSeenAt' and r['unit_id'] in fin and r['unit_id'] not in pcids]
cond=[r for r in rd(f'{O}/cso_t4_cond_changes.csv') if r['unit_id'] in fin and fin[r['unit_id']]['condition']==r['new']]
lots=[r for r in rd(f'{O}/cso_t4_lots_changes.csv') if r['unit_id'] in fin and fin[r['unit_id']]['dealer']['id']==r['new'].split(' | ')[0]]
unk=[r for r in rd(f'{O}/cso_t4_unknown_changes.csv') if r['unit_id'] in fin and fin[r['unit_id']]['dealer']['id']==r['new'].split(' | ')[0]]
kia=[]
for r in rd(QC):
    u=base.get(r['id'],{}); kia.append({'unit_id':r['id'],'dealer_domain':r['domain'],'source_url':(u.get('priceUsd') or {}).get('sourceUrl') or (u.get('dealer') or {}).get('website') or '','reason':'car_dealer_non_rv: '+r['title']})
veh={'removed':[],'held':[]}
if VQ:
    for f in ('removed_non_rv_vehicles.csv','held_data_unverified.csv'):
        for r in rd(f'{VQ}/{f}'): veh[r['action']].append({'unit_id':r['id'],'dealer_domain':r['domain'],'source_url':r['source_url'],'reason':r['reason_code']+': '+r['detail'],'code':r['reason_code']})
def st(uid):
    u=fin.get(uid) or base.get(uid); return u['dealer']['state'] if u else ''
def pick(rows,n,wa=1):
    rows=list(rows); random.shuffle(rows); w=[r for r in rows if st(r['unit_id'])=='WA']; o=[r for r in rows if st(r['unit_id'])!='WA']
    return (w[:wa]+o)[:n] if wa else rows[:n]
S=[]
def add(kind,rows,n,wa=1,fmt=None):
    for r in pick(rows,n,wa): S.append((kind,r,fmt))
add('refreshed_no_price_change',[r for r in refr if r['src']=='interact'],2); add('refreshed_no_price_change',[r for r in refr if r['src']=='other'],2); add('refreshed_no_price_change',[r for r in refr if r['src']=='cw'],2)
add('price_changed',pc,6,wa=2)
for reason,n in (('dead_sold',1),('sale_pending',2),('dead_page_gone',2),('on_order',1)):
    add('removed_'+reason,[r for r in rem if r['reason']==reason],n,wa=0)
add('held_price_unverified',[r for r in rem if r['reason']=='price_unverified'],3,wa=0)
add('condition_fixed',cond,4,fmt=lambda r:f"condition {r['old']} -> {r['new']} ({r['basis']})")
add('lot_moved_own_page',lots,3,fmt=lambda r:f"lot {r['old']} -> {r['new']} ({r['basis']})")
add('unknown_city_filled',unk,1,fmt=lambda r:f"lot {r['old']} -> {r['new']} ({r['basis']})")
add('quarantined_car_dealer',kia,2,wa=0)
if VQ:
    add('removed_non_rv_car_dealer',[r for r in veh['removed'] if r['code']=='car_dealer_non_rv'],1,wa=0)
    add('removed_non_rv_tow_vehicle',[r for r in veh['removed'] if r['code']=='tow_vehicle_non_rv'],2,wa=0)
    add('removed_non_rv_placeholder_vin',[r for r in veh['removed'] if r['code']=='placeholder_vin_non_rv'],1,wa=0)
    add('held_data_unverified',veh['held'],2,wa=0)
rows=[];seen=set()
for kind,r,fmt in S:
    uid=r['unit_id']
    if uid in seen: continue
    seen.add(uid); b=base.get(uid) or {}; f=fin.get(uid)
    rows.append({'sample_type':kind,'unit_id':uid,'dealer_domain':r.get('dealer_domain',''),'state':st(uid),'title':b.get('title','') or (f or {}).get('title',''),'vin':b.get('vin') or '','stock':b.get('stockNumber') or '',
      'before_price':(b.get('priceUsd') or {}).get('value'),'after_price':(f['priceUsd']['value'] if f else 'REMOVED/HELD'),
      'before_condition':b.get('condition',''),'after_condition':(f['condition'] if f else ''),
      'before_lot':(b.get('dealer') or {}).get('id',''),'after_lot':(f['dealer']['id'] if f else ''),
      'before_lastSeen':(b.get('provenance') or {}).get('lastSeenAt',''),'after_lastSeen':(f['provenance']['lastSeenAt'] if f else ''),
      'source_url':r.get('source_url',''),'action_or_reason':fmt(r) if fmt else (r.get('reason') or r.get('rule') or ''),'CSO_check':''})
w=csv.DictWriter(open(OUT,'w',newline=''),fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print(len(rows),dict(collections.Counter(r['sample_type'] for r in rows)),'WA',sum(1 for r in rows if r['state']=='WA'),'no_url',sum(1 for r in rows if not r['source_url']))

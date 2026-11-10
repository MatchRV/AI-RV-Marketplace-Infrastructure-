"""coverage.py <out dir> <BUILT iso>: dealers/units covered (page read after lastSeen) vs not, aging-out exposure before/after."""
import os
import json,gzip,sys,collections as C,datetime as D,csv
O,BT=sys.argv[1:3]; W='/workspace/harvest-recheck-2026-11-10'
bt=D.datetime.fromisoformat(BT.replace('Z','+00:00'))
base={u['id']:u for u in json.load(gzip.open(os.environ.get('BASE',f'{W}/out/base_main_e2e411b.snapshot.json.gz')))['units']}
fin={u['id']:u for u in json.load(gzip.open(f'{O}/inventory.snapshot.json.gz'))['units']}
def z(s): return D.datetime.fromisoformat(s.replace('Z','+00:00'))
def out_by(u,days): return (bt+D.timedelta(days=days)-z(u['provenance']['lastSeenAt'])).total_seconds()/86400>30
rows=C.defaultdict(C.Counter)
for i,b in base.items():
    d=b['provenance']['dealerDomain']; rows[d]['base']+=1
    f=fin.get(i)
    if f is None: rows[d]['removed_or_held']+=1
    elif f['provenance']['lastSeenAt']>b['provenance']['lastSeenAt']: rows[d]['refreshed']+=1
    else: rows[d]['not_reread']+=1
tot=C.Counter()
for d,c in rows.items(): tot.update(c)
doms_touched=[d for d,c in rows.items() if c['refreshed'] or c['removed_or_held']]
age=C.Counter()
for tag,days in (('nov7',2),('nov14',9)):
    age['base_out_by_'+tag]=sum(1 for u in base.values() if out_by(u,days)); age['after_out_by_'+tag]=sum(1 for u in fin.values() if out_by(u,days))
# 'before' relative to the final builtAt for fairness
print(json.dumps({'units_base':tot['base'],'refreshed':tot['refreshed'],'removed_or_held':tot['removed_or_held'],'not_reread':tot['not_reread'],'domains_total':len(rows),'domains_with_any_unit_reread':len(doms_touched),'aging':dict(age)}))
nr=sorted(((c['not_reread'],d,c['base']) for d,c in rows.items()),reverse=True)
with open(f'{O}/coverage_by_dealer.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['dealer_domain','base_units','refreshed','removed_or_held','not_reread'])
    for d,c in sorted(rows.items(),key=lambda x:-x[1]['not_reread']): w.writerow([d,c['base'],c['refreshed'],c['removed_or_held'],c['not_reread']])
print('top not re-read:',nr[:15])

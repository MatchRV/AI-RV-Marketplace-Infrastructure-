"""ia_prepare.py: tie fetched Interact unit pages to snapshot units (VIN equal, else unique stock in the same dealer domain), write
ia_apply/{targets.ndjson,results.ndjson,pages} for fix1.py (which re-checks VIN/stock conflicts itself) and ia_unmatched.ndjson (candidate new units)."""
import json,gzip,os,re,sys,collections as C
W='/workspace/harvest-recheck-2026-11-10'; A=f'{W}/ia_apply'; os.makedirs(A,exist_ok=True)
if not os.path.exists(f'{A}/pages'): os.symlink(f'{W}/fetch/pages',f'{A}/pages')
snap=json.load(gzip.open(os.environ.get('BASE',f'{W}/out/base_main_e2e411b.snapshot.json.gz'))); U=snap['units']; byid={u['id']:u for u in U}
VINOK=lambda v: bool(v) and re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',v.upper()) is not None
vin_i=C.defaultdict(dict); stk_i=C.defaultdict(lambda:C.defaultdict(list))
for u in U:
    d=u['provenance']['dealerDomain']
    if VINOK(u.get('vin') or ''): vin_i[d].setdefault(u['vin'].upper(),[]).append(u)
    if u.get('stockNumber'): stk_i[d][str(u['stockNumber']).strip().lower()].append(u)
tg={}
for l in open(f'{W}/fetch/targets.ndjson'):
    t=json.loads(l)
    if t['kind']=='ia': tg[t['key']]=t
res={}
for l in open(f'{W}/fetch/results.ndjson'):
    try: j=json.loads(l)
    except Exception: continue
    if j['kind']=='ia': res[j['key']]=j
ex={}
if os.path.exists(f'{W}/fetch/extracted_ia.ndjson'):
    for l in open(f'{W}/fetch/extracted_ia.ndjson'):
        j=json.loads(l); ex[j['key']]=j.get('x')
claims=C.defaultdict(list); st=C.Counter(); unmatched=[]
for key,r in res.items():
    t=tg.get(key); 
    if not t: continue
    dom=t['domain']; uid=t.get('unit')
    if r.get('result')!='ok': st['fetch_'+str(r.get('result'))]+=1; continue
    if r.get('http') in (404,410):
        if uid: claims[uid].append((key,'gone'))
        else: st['gone_unmatched_url']+=1
        continue
    if r.get('http')!=200: st['http_'+str(r.get('http'))]+=1; continue
    x=ex.get(key)
    if x is None: st['not_extracted_yet']+=1; continue
    if not x.get('onUnitPage') or not x.get('ownElement'):
        if uid: claims[uid].append((key,'noown'))
        else: st['no_own_element_unmatched']+=1
        continue
    pv=(x.get('specVin') or '').upper(); how=None
    cand=None
    if VINOK(pv) and pv in vin_i[dom] and len(vin_i[dom][pv])==1: cand=vin_i[dom][pv][0]; how='vin'
    elif uid and uid in byid: cand=byid[uid]; how='target'
    else:
        s=(x.get('stocknumber') or x.get('stocknumb') or x.get('stockText') or '').strip().lower()
        c=stk_i[dom].get(s,[]) if s else []
        if len(c)==1: cand=c[0]; how='stock'
        elif len(c)>1: st['stock_ambiguous']+=1
    if cand is None:
        unmatched.append({'key':key,'domain':dom,'url':r.get('finalUrl') or r['url'],'vin':pv or None,'stock':x.get('stocknumber') or x.get('stockText'),'h1':x.get('h1'),'fetchedAt':r.get('fetchedAt')}); continue
    claims[cand['id']].append((key,how)); st['matched_by_'+how]+=1
keep={}
for uid,cl in claims.items():
    u=byid[uid]
    def rk(c):
        j=res[c[0]]; x=ex.get(c[0]) or {}; pv=(x.get('specVin') or '').upper()
        return (c[1]=='gone', not (pv and u.get('vin') and pv==u['vin'].upper()), 0)
    cl=sorted(cl,key=rk)
    keep[uid]=cl[0]
    if len(cl)>1: st['unit_claimed_by_several_pages']+=1
n=0
with open(f'{A}/targets.ndjson','w') as ft, open(f'{A}/results.ndjson','w') as fr:
    for uid,(key,how) in keep.items():
        t=dict(tg[key]); t['unit']=uid; ft.write(json.dumps(t)+'\n'); fr.write(json.dumps(res[key])+'\n'); n+=1
with open(f'{W}/ia_unmatched.ndjson','w') as f:
    for r in unmatched: f.write(json.dumps(r)+'\n')
print(dict(st),'units with a page',n,'unmatched ok pages',len(unmatched))

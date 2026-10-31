"""multi_audit.py : domains whose units are all pinned to one city while the dealer's own homepage prints street
addresses in two or more different cities (Gazetteer-validated, distinct ZIPs). Writes multi_audit.json."""
import json,gzip,re,collections,glob,os,sys
H='/workspace/harvest-2026-10-31'
GZ=set()
for fn in ('/workspace/gaz/2023_Gaz_place_national.txt','/workspace/gaz/2023_Gaz_cousubs_national.txt'):
    for i,l in enumerate(open(fn,encoding='latin1')):
        if i==0: continue
        p=l.split('\t'); nm=re.sub(r'\s+(city|town|village|borough|CDP|township|municipality|charter township|plantation|city and borough|consolidated government.*|metropolitan government.*|unified government.*|urban county.*)$','',p[3].strip(),flags=re.I)
        GZ.add((nm.lower().replace('.',''),p[0]))
ALIAS={('mt vernon','WA'):'Mount Vernon'}
def gz_city(words,st):
    w=words.split()
    for k in range(min(3,len(w)),0,-1):
        c=' '.join(w[-k:]); key=(c.lower().replace('.',''),st)
        if key in GZ or key in ALIAS: return c
    return None
snap=sys.argv[1] if len(sys.argv)>1 else f'{H}/out_trial5/inventory.snapshot.json.gz'  # audited against trial5 (before any trial6 move)
S=json.load(gzip.open(snap))
def dom(u): return re.sub(r'^https?://(www\.)?','',(u.get('dealer') or {}).get('website') or '').split('/')[0].lower()
U=collections.defaultdict(list)
for u in S['units']: U[dom(u)].append(u)
HL=json.load(open(f'{H}/home6/home_lots.json'))
out={}
for d,v in HL.items():
    lots={}
    for st,c,s,z,role in v:
        if role!='sales': continue
        g=gz_city(c,s)
        if not g: continue
        g=g.title() if g.isupper() else g
        lots.setdefault((g.lower(),s),{'city':g,'state':s,'zip':z,'street':st})
    cities={k for k in lots}
    zips={l['zip'] for l in lots.values()}
    us=U.get(d,[])
    stored={((u['dealer'].get('city') or '').lower(),u['dealer'].get('state')) for u in us}
    if len(cities)>=2 and len(zips)>=2 and len(stored)==1:
        out[d]={'units':len(us),'stored':list(stored)[0],'lots':list(lots.values())}
json.dump(out,open(f'{H}/multi_audit.json','w'),indent=1)
for d,o in sorted(out.items(),key=lambda x:-x[1]['units']): print(o['units'],d,o['stored'],[f"{l['city']},{l['state']}" for l in o['lots']])

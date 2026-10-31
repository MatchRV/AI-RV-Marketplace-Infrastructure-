"""site_lots.py: merge <dir>/site_addrs.json files -> site_lots.json {domain: [[city,ST,count],...]} (Gazetteer-checked)."""
import json,re,collections,sys,os
GZ=set()
for fn in ('/workspace/gaz/2023_Gaz_place_national.txt','/workspace/gaz/2023_Gaz_cousubs_national.txt'):
    for i,l in enumerate(open(fn,encoding='latin1')):
        if i==0: continue
        p=l.split('\t'); nm=re.sub(r'\s+(city|town|village|borough|CDP|township|municipality|charter township|plantation)$','',p[3].strip(),flags=re.I)
        GZ.add((nm.lower().replace('.',''),p[0]))
def gzc(words,st):
    w=words.split()
    for k in range(min(3,len(w)),0,-1):
        c=' '.join(w[-k:])
        if (c.lower().replace('.',''),st) in GZ: return c
A={}
for f in sys.argv[1:]:
    if not os.path.exists(f): continue
    for d,v in json.load(open(f)).items():
        s=A.setdefault(d,collections.Counter())
        for c,st,n in v['cities']:
            g=gzc(c,st)
            if g: s[(g,st)]+=n
json.dump({d:[[c,s,n] for (c,s),n in v.most_common()] for d,v in A.items()},open('/workspace/harvest-2026-10-31/site_lots.json','w'))
print(len(A))

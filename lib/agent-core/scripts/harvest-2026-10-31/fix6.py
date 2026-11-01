"""fix6.py <in.snapshot.json.gz> <out.snapshot.json.gz> <outdir> : CSO QA trial5 fixes (facts only; hold when not stated).
 1) on-order holds: the unit's own title/model/trim/description, its own page lot status / photo badge / Interact unit
    tag, or its own schema.org offer availability (PreOrder/BackOrder) says it is not on the lot yet.
 2) per-unit lots for dealers that print several lots: Southland RV stock prefix = lot code (lot addresses printed on
    southlandrv.com/locations); multi-lot sites found by the homepage audit (multi_audit.json) take the lot the unit's own
    page states (Interact unit lot, URL, title "City, ST", "Location: X"), else hold; any unit whose own page's Interact
    unit lot or schema.org seller (on dealers whose pages name several sellers) names a different city is moved there.
 3) consignment brokers (The Registry, The Motorhome Brokers): location from the unit's own listing, else hold.
 4) dealer city strings with a street merged in ("Western Knolls AveBeaumont") -> the trailing Census place."""
import json,gzip,sys,re,os,csv,glob,collections
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from onorder import text_hit,status_hit
from urlloc import urlloc
from parse_generic import strip_blocks,txt
src,dst,out=sys.argv[1:4]; H='/workspace/harvest-2026-10-31'
S=json.load(gzip.open(src)); U=S['units']
GZ=set()
for fn in ('/workspace/gaz/2023_Gaz_place_national.txt','/workspace/gaz/2023_Gaz_cousubs_national.txt'):
    for i,l in enumerate(open(fn,encoding='latin1')):
        if i==0: continue
        p=l.split('\t'); nm=re.sub(r'\s+(city|town|village|borough|CDP|township|municipality|charter township|plantation|city and borough|consolidated government.*|metropolitan government.*|unified government.*|urban county.*)$','',p[3].strip(),flags=re.I)
        GZ.add((nm.lower().replace('.',''),p[0]))
def isplace(c,st): return ((c or '').lower().replace('.','').strip(),st) in GZ or ((c or '').lower().replace('.','').replace('mount ','mt ').strip(),st) in GZ
def gz_city(words,st):
    w=words.split()
    for k in range(min(3,len(w)),0,-1):
        c=' '.join(w[-k:])
        if isplace(c,st): return c
    return None
NAMECITY=re.compile(r"(?:\s[-–]\s|\bof\s)([A-Za-z][A-Za-z .']+?)\s*$",re.I)
def norm(c): return (c or '').lower().replace('.','').replace('-',' ').replace('mount ','mt ').strip()
def dom(u): return re.sub(r'^https?://(www\.)?','',(u.get('dealer') or {}).get('website') or '').split('/')[0].lower()
def lu(u): return (u.get('provenance') or {}).get('listingUrl') or ''
def ukey(url): return (url or '').split('#')[0].rstrip('/')
# ---- page index: extracted facts + page file for every stored listing page
X={}; PG={}
DIRS=['pa','ib','ib2','oc/run','ib3a','ib3b','ib4','ib5g','ib5n','ib6','loc','loc2','mlot6','reg6']
for D in DIRS:
    if os.path.exists(f'{H}/{D}/extracted.ndjson'):
        for l in open(f'{H}/{D}/extracted.ndjson'):
            j=json.loads(l)
            if j.get('x'): X[ukey(j['url'])]=j['x']
    if os.path.exists(f'{H}/{D}/results.ndjson'):
        for l in open(f'{H}/{D}/results.ndjson'):
            j=json.loads(l)
            if j.get('page') and j.get('result')=='ok': PG[ukey(j['url'])]=f"{H}/{D}/pages/{j['page']}.html.gz"
def vis(url):
    p=PG.get(ukey(url))
    if not p: return None
    try: return txt(strip_blocks(gzip.open(p).read().decode('utf8','replace')[:1500000]))
    except Exception: return None
# dealers whose own pages name several schema.org sellers (>=2 cities with >=3 pages each)
SELL=collections.defaultdict(collections.Counter)
for k,x in X.items():
    d=re.sub(r'^www\.','',k.split('/')[2]) if '//' in k else ''
    for o in x.get('ld') or []:
        s=o.get('seller') or {}
        if s.get('city') and s.get('state'): SELL[d][(s['city'].strip(),str(s['state']).upper())]+=1; break
SELLMULTI={d for d,c in SELL.items() if sum(1 for (cc,ss),n in c.items() if n>=3 and isplace(cc,ss))>=2}
A=json.load(open(f'{H}/multi_audit.json'))
MULTI5=set(json.load(open(f'{out}/fix5_multi.json'))) if os.path.exists(f'{out}/fix5_multi.json') else set()
SOUTHLAND={'ATL':('Norcross','GA','Southland RV - Atlanta lot, 1794 Bolton Circle, Norcross, GA 30071'),
           'LAG':('LaGrange','GA','Southland RV - LaGrange lot, 1327 Lafayette Pkwy, LaGrange, GA 30241'),
           'SAV':('Richmond Hill','GA','Southland RV - Savannah lot, 211 Thunderbird Dr, Richmond Hill, GA 31324')}
BROKERS={'theregistryllc.com','rvclassified.com'}
C=collections.Counter(); chg=[]; holds=[]; held=[]; keep=[]
def move(u,D,c,st,how,tag):
    d=u['dealer']; old=(d.get('city'),d.get('state'))
    if (norm(c),st)==(norm(old[0]),old[1]): C[f'{tag}_confirmed']+=1; return
    nd=dict(d,city=c,state=st,lat=None,lng=None,id=f"{D}:{re.sub(r'[^a-z0-9]+','-',c.lower()).strip('-')}")
    mm=NAMECITY.search(nd.get('name') or '')
    if mm and norm(mm.group(1))!=norm(c): nd['name']=(nd['name'][:mm.start()].strip() or nd['name'])
    u['dealer']=nd; C[tag]+=1; C[f'{tag}:{D}']+=1
    chg.append([u['id'],lu(u),'location',f'{old[0]}, {old[1]}',f'{c}, {st}',how])
def hold(u,D,reason,detail):
    C[f'held_{reason}']+=1; C[f'held_{reason}:{D}']+=1; held.append(u); holds.append([u['id'],lu(u),u.get('title'),reason,D,detail])
def page_lot(url,x,lots,D):
    """the lot the unit's own page states, restricted to the dealer's printed lots; None, or 'conflict'"""
    LC={norm(c):(c,s) for c,s in lots}
    if x and x.get('iaLot') and x['iaLot'][0]:
        c,s=x['iaLot'][0].strip(),x['iaLot'][1].strip().upper()
        if isplace(c,s): return (c,s,f'unit element lot "{c}, {s}"')
    uL=urlloc(url)
    if uL and uL[0]:
        g=gz_city(uL[0],uL[1])
        if g and norm(g) in LC: return LC[norm(g)]+(f'listing URL names the lot "{g}, {uL[1]}"',)
    if x:
        hits=set()
        for k in ('title','ogTitle','h1'):
            for seg in re.split(r'\s[|]\s',x.get(k) or ''):
                m=re.match(r"^\s*([A-Za-z .']+),\s*([A-Z]{2})\s*$",seg)
                if m and norm(m.group(1)) in LC and LC[norm(m.group(1))][1]==m.group(2): hits.add(LC[norm(m.group(1))])
        if len(hits)==1: h=hits.pop(); return h+(f'listing title names "{h[0]}, {h[1]}"',)
        if len(hits)>1: return 'conflict'
    v=vis(url)
    if v:
        hits=set()
        alt='|'.join(re.escape(c) for c,s in sorted(lots,key=lambda z:-len(z[0])))
        for m in re.finditer(r"\b(?:Location|Lot|Located (?:at|in)(?: our)?)\s*:?\s*(?:"+D.split('.')[0]+r"\s*[-–]?\s*)?("+alt+r")\b",v,re.I):
            c=m.group(1); hits.add(LC[norm(c)])
        if len(hits)==1: h=hits.pop(); return h+(f'listing page "Location: {h[0]}"',)
        if len(hits)>1: return 'conflict'
    return None
for u in U:
    D=dom(u); url=lu(u); x=X.get(ukey(url)); d=u['dealer']
    # ---- 1) on order / coming soon / in transit
    why=None
    for k in ('title','model','trim'):   # trial8: own-unit fields only, never description/body text
        v=u.get(k)
        h=text_hit(v if isinstance(v,str) else None)
        if h: why=f'unit {k}: "{h[:120]}"'; break
    if not why and x:
        s=status_hit([x.get('lotStatus')]+(x.get('photoBadges') or [])+(x.get('unitTags') or []))
        if s: why=f'own page status/badge "{s}"'
        elif (x.get('ld') or [{}])[0].get('avail') in ('PreOrder','BackOrder','PreSale'): why=f"own schema.org offer availability {(x.get('ld') or [{}])[0].get('avail')}"
    if why: hold(u,D,'on_order',why); continue
    # ---- 4) street merged into city
    c0,s0=d.get('city') or '',d.get('state') or ''
    if c0 and s0 and not isplace(c0,s0) and 'campingworld' not in D:
        sp=re.sub(r'([a-z])([A-Z])',r'\1 \2',re.sub(r'([A-Z])([A-Z][a-z])',r'\1 \2',c0))
        g=gz_city(sp,s0)
        streety=sp!=c0 or re.search(r'(?i)\b(rd|road|st|street|ave|avenue|hwy|highway|blvd|boulevard|dr|drive|way|ln|lane|loop|fwy|freeway|pkwy|parkway|ct|court|trl|trail)\b\.?\s',sp)
        if g and streety and norm(g)!=norm(c0) and len(sp.split())>len(g.split()):
            u['dealer']=dict(d,city=g,lat=None,lng=None); d=u['dealer']; C['city_street_prefix_removed']+=1; C[f'city_street_prefix_removed:{D}']+=1
            chg.append([u['id'],url,'city',c0,g,'stored dealer city string has the street address merged in; trailing Census place kept'])
    # ---- 3) brokers
    if D in BROKERS:
        v=vis(url)
        if not v: hold(u,D,'broker_location_not_stated','consignment broker; own listing page not read'); continue
        a=re.findall(r"\bLocated in ([A-Z][A-Za-z .']+?),\s*([A-Z]{2})\b",v); b=re.findall(r"\bLocation:?\s+([A-Z][A-Za-z .']+?),\s*([A-Z]{2})\b",v)
        cs={(norm(c),s) for c,s in a+b if isplace(c.strip(),s)}
        if len(cs)==1:
            c,s=(a+b)[0]; move(u,D,c.strip(),s,f'consignment listing states "Located in/Location {c.strip()}, {s}"','broker_location_from_listing'); keep.append(u); continue
        hold(u,D,'broker_location_not_stated' if not cs else 'broker_location_conflict',f'listing states {sorted(cs)}' if cs else 'no location on the listing'); continue
    # ---- 2) Southland stock prefix
    if D=='southlandrv.com':
        m=re.match(r'^(ATL|LAG|SAV)\d',(u.get('stockNumber') or '').upper())
        if m:
            c,s,ev=SOUTHLAND[m.group(1)]; move(u,D,c,s,f'stock prefix {m.group(1)} = {ev} (southlandrv.com/locations)','southland_lot_from_stock_prefix'); keep.append(u); continue
        hold(u,D,'lot_not_determined_multi_lot_site','Southland RV stock number has no lot prefix'); continue
    # ---- 2) homepage-audited multi-lot sites
    if D in A and D not in MULTI5:
        lots=[(l['city'],l['state']) for l in A[D]['lots']]
        r=page_lot(url,x,lots,D) if url else None
        if r and r!='conflict': move(u,D,r[0],r[1],r[2],'multi_lot_audit_lot_from_page'); keep.append(u); continue
        hold(u,D,'lot_not_determined_multi_lot_site',('own page names more than one lot' if r=='conflict' else ('own page does not state the lot' if url and ukey(url) in PG else ('listing page not readable' if url else 'no listing URL')))+f'; dealer prints lots {lots}'); continue
    # ---- 2) any domain: own page's unit lot / seller (when the dealer's pages name several sellers) differs
    if x:
        if x.get('iaLot') and x['iaLot'][0]:
            c,s=x['iaLot'][0].strip(),x['iaLot'][1].strip().upper()
            if isplace(c,s) and (norm(c),s)!=(norm(d.get('city')),d.get('state')): move(u,D,c,s,f'unit element lot "{c}, {s}" on its own page','unit_lot_from_own_page')
        elif D in SELLMULTI and D not in MULTI5:
            sl=next(((o.get('seller') or {}) for o in x.get('ld') or [] if (o.get('seller') or {}).get('city')),None)
            if sl:
                c,s=sl['city'].strip(),str(sl.get('state') or '').upper()
                if isplace(c,s) and (norm(c),s)!=(norm(d.get('city')),d.get('state')): move(u,D,c,s,f'own listing schema.org seller address "{c}, {s}" (dealer pages name several sellers)','seller_lot_from_own_page')
    keep.append(u)
S['units']=keep
st=S.get('stats') or {}; st['units']=len(keep); st['dealers']=len({(u.get('dealer') or {}).get('id') for u in keep})
st['fix6_2026_10_31']={k:v for k,v in C.items() if ':' not in k}; S['stats']=st
with gzip.open(dst,'wb',compresslevel=9) as f: f.write(json.dumps(S,separators=(',',':'),ensure_ascii=True).encode('latin1'))
with open(f'{out}/fix6_changes.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['id','listing_url','field','old','new','evidence']); w.writerows(chg)
with open(f'{out}/fix6_holds.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['id','listing_url','title','hold_reason','domain','detail']); w.writerows(holds)
with gzip.open(f'{out}/fix6_held_units.ndjson.gz','wt') as f:
    for u in held: f.write(json.dumps(u)+'\n')
json.dump(dict(sorted(C.items())),open(f'{out}/fix6.json','w'),indent=1)
json.dump(sorted(SELLMULTI),open(f'{out}/fix6_sellmulti.json','w'))
print(json.dumps(st['fix6_2026_10_31']))

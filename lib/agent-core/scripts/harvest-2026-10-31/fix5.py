"""fix5.py <in.snapshot.gz> <out.snapshot.gz> <outdir>   (CSO QA trial4 fixes, facts only, whole build incl. v3.3 base)
 1) lot location per unit: the unit's own page (loc/lots.json: page title / "located at our ..." / Location field /
    the unit's dealer record on the page), else the lot city/state printed in the listing URL (city verified against
    the Census Gazetteer). Multi-lot dealers whose unit lot cannot be determined are held (lot_not_determined).
 2) factory-order units (stock ORD/ORDER prefix, or description says factory order / customer must pick up / FOB
    factory) are held (factory_order).
 3) destination trailers stored as fifth_wheel -> travel_trailer + destinationTrailer flag (title/URL says destination
    and not fifth wheel).
 4) model-line stored as make -> manufacturer make (only when the VIN maker code agrees or there is no VIN);
    model with the make repeated in front is trimmed; city typo Schereville -> Schererville.
 5) MSRP: blank msrp == price copies; blank towable MSRPs implausible for the type."""
import gzip,json,sys,re,collections,csv,os
sys.path.insert(0,os.path.dirname(__file__)); from urlloc import urlloc
src,dst,out=sys.argv[1:4]; H='/workspace/harvest-2026-10-31'
S=json.load(gzip.open(src)); U=S['units']
# Gazetteer places (name without legal suffix) per state
GZ=set()
for fn in ('/workspace/gaz/2023_Gaz_place_national.txt','/workspace/gaz/2023_Gaz_cousubs_national.txt'):
    for i,l in enumerate(open(fn,encoding='latin1')):
        if i==0: continue
        p=l.split('\t'); nm=re.sub(r'\s+(city|town|village|borough|CDP|township|municipality|charter township|plantation|city and borough|consolidated government.*|metropolitan government.*|unified government.*|urban county.*)$','',p[3].strip(),flags=re.I)
        GZ.add((nm.lower().replace('.',''),p[0]))
ALIAS={('mt vernon','WA'):'Mount Vernon'}
def gz_city(words,st):
    """longest trailing word run that is a Gazetteer place in st"""
    w=words.split()
    for k in range(min(3,len(w)),0,-1):
        c=' '.join(w[-k:])
        if (c.lower().replace('.',''),st) in GZ: return c
        if (c.lower().replace('.',''),st) in ALIAS: return c
    return None
LOTS={}; LT={}
for dd in ('loc','loc2'):
    if os.path.exists(f'{H}/{dd}/lots.json'): LOTS.update(json.load(open(f'{H}/{dd}/lots.json')))
    if os.path.exists(f'{H}/{dd}/targets.ndjson'):
        for l in open(f'{H}/{dd}/targets.ndjson'): t=json.loads(l); LT[t['url']]=t['domain']
SITE={d:[(c,st) for c,st,n in v if n>=3] for d,v in json.load(open(f'{H}/site_lots.json')).items()} if os.path.exists(f'{H}/site_lots.json') else {}
# listing URLs whose row location came from the unit's own page (unit lot / listing seller address)
EVID=set()
import glob
for fn in glob.glob(f'{H}/raw/*_rows.ndjson'):
    for l in open(fn):
        r=json.loads(l); m=r.get('_meta') or {}
        if str(m.get('location_source') or '').startswith(('unit lot','listing seller')): EVID.add(m.get('listing_url'))
# Airstream Adventures group lot names -> the address of that lot's own dealer site (as held in our dealer records)
AIR_LOT={('seattle','WA'):('Milton','WA'),('spokane','WA'):('Spokane Valley','WA'),('portland','OR'):('Clackamas','OR'),('reno','NV'):('Reno','NV')}
MULTI={'optimumrv.com','poulsborv.com','motorsportsland.com','cenlarv.com','renoairstream.com','seattleairstream.com','airstreamspokane.com','portlandairstream.com',
 'fourwindsrv.com','mhsrv.com','unchartedrec.com','rvconnections.com','bentsrv.com','rvroadway.com','hamiltonrvsales.com','wehrrvs.com','robbinsautoandrv.com',
 'millicanrvs.com','darrenbideauxrv.com','selkirkrv.com','airstreamlasvegas.com','rvtrucksalesmt.com','airstreaminlandempire.com','airstreamorangecounty.com',
 'airstreamlosangeles.com','nirvc.com','lamesarv.com'}
def resolve_state(D,c,stored):
    for sc,ss in SITE.get(D,[]):
        if sc.lower()==c.lower(): return ss
    for ss in sorted({ss for _,ss in SITE.get(D,[])}|({stored} if stored else set())):
        if (c.lower().replace('.',''),ss) in GZ: return ss
    return None
def dom(u): return re.sub(r'^https?://(www\.)?','',(u.get('dealer') or {}).get('website') or '').split('/')[0].lower()
def lu(u): return (u.get('provenance') or {}).get('listingUrl') or ''
def norm(c): return (c or '').lower().replace('.','').replace('-',' ').replace('mount ','mt ').strip()
C=collections.Counter(); chg=[]; holds=[]; held=[]; keep=[]
# each Airstream Adventures lot's own dealer record (from units listed on that lot's own site)
AIR_SITE={('Milton','WA'):'seattleairstream.com',('Spokane Valley','WA'):'airstreamspokane.com',('Clackamas','OR'):'portlandairstream.com',('Reno','NV'):'renoairstream.com'}
AIR_DEALER={}
for _u in U:
    _d=_u.get('dealer') or {}; _w=re.sub(r'^https?://(www\.)?','',_d.get('website') or '').split('/')[0].lower()
    for k,site in AIR_SITE.items():
        if _w==site and (_d.get('city'),_d.get('state'))==k and k not in AIR_DEALER: AIR_DEALER[k]={x:_d.get(x) for x in ('id','name','city','state','lat','lng')}
NAMECITY=re.compile(r"(?:\s[-–]\s|\bof\s)([A-Za-z][A-Za-z .']+?)\s*$",re.I)
MAKEMAP=[ # (model-line make, manufacturer make, VIN maker codes that confirm it)
 ('puma','Palomino',('4X4','5ZT')),('imagine','Grand Design',('573','575')),('reflection','Grand Design',('573','575')),
 ('solitude','Grand Design',('573','575')),('momentum','Grand Design',('573','575')),('grand design rv','Grand Design',('573','575')),
 ('rockwood','Forest River',('4X4','5ZT')),('flagstaff','Forest River',('4X4','5ZT')),('salem','Forest River',('4X4',)),
 ('salem hemisphere','Forest River',('4X4',)),('wildwood','Forest River',('4X4',)),('cherokee','Forest River',('4X4','5ZT')),
 ('cedar creek','Forest River',('4X4',)),('riverstone','Forest River',('4X4',)),('forestriver','Forest River',('4X4',)),
 ('no boundaries','Forest River',('5NH','4X4')),('cardinal','Forest River',('4X4','5ZT')),
 ('alpine','Keystone',('4YD',)),('fuzion','Keystone',('4YD',)),('montana','Keystone',('4YD',)),('cougar','Keystone',('4YD',)),
 ('arcadia','Keystone',('4YD',)),('raptor','Keystone',('4YD',)),('bullet','Keystone',('4YD',)),('hideout','Keystone',('4YD',)),
 ('springdale','Keystone',('4YD',)),('passport','Keystone',('4YD',)),('eagle','Jayco',('1UJ',)),('north point','Jayco',('1UJ',)),
 ('micro minnie','Winnebago',('54C',)),('kz-rv','KZ',('4EZ',)),('connect','KZ',('4EZ',)),('coachman','Coachmen',('5ZT','4X4')),
 ('north trail','Heartland',('5SF',)),('avenger','Prime Time',('5ZT',)),('vengeance','Forest River',('5ZT','4X4'))]
MM={a:(b,c) for a,b,c in MAKEMAP}
ORD=re.compile(r'^(ORD\d|ORDER|Order-\d)',re.I)
FOTXT=re.compile(r'(?i)\b(accepting factory orders|(?:this|unit) is (?:a )?factory order|factory order unit|customer must pick up|must be picked up at the factory|build to order|FOB (?:Indiana|Elkhart|the factory|factory))')
for u in U:
    d=u.get('dealer') or {}; url=lu(u); D=dom(u)
    # ---- 2) factory order
    s=u.get('stockNumber') or ''
    fo=None
    if ORD.match(s): fo=f'stock "{s}" (dealer order-unit prefix)'
    else:
        m=FOTXT.search(f"{u.get('title') or ''} {u.get('description') or ''}") if u.get('condition')=='new' else None
        if m: fo=f'listing says "{m.group(0)}"'
    if fo: C['held_factory_order']+=1; C[f'held_factory_order:{D}']+=1; held.append(u); holds.append([u['id'],url,u.get('title'),'factory_order',D,fo]); continue
    # ---- 1) location
    old=(d.get('city'),d.get('state')); new=None; how=None; hold=None
    L=LOTS.get(url)
    if L and (L.get('city') or L.get('state')):
        c,st=L.get('city'),L.get('state'); how=L['evidence']
        if c and c.isupper(): c=c.title()
        if c and 'airstream' in D and st and D in ('renoairstream.com','seattleairstream.com','airstreamspokane.com','portlandairstream.com'):
            if (c.lower(),st) in AIR_LOT: c,st=AIR_LOT[(c.lower(),st)]; how+=" (that lot's own Airstream Adventures site address)"
            else: hold=f'{how}: no address published for that lot'
        if not hold and c and not st:
            st=resolve_state(D,c,old[1])
            if not st: hold=f'{how}: lot state not determined'
        if not hold and c and (norm(c),st)==('mt vernon','WA'): c='Mount Vernon'
        if not hold and not c:
            lots=[sc for sc,ss in SITE.get(D,[]) if ss==st]
            if len(lots)==1: c=lots[0]; how+=f"; the dealer's only {st} lot printed on its pages is {c}, {st}"
            else: hold=f'{how}: more than one lot in {st}'
        if not hold: new=(c,st)
    elif L is not None and D in MULTI:
        hold='multi-lot dealer; own page does not state the lot ('+str(L.get('hold') or L.get('fetch') or L.get('http'))+')'
    else:
        uL=urlloc(url)
        if uL and uL[0]:
            c=gz_city(uL[0],uL[1])
            if c: new=(c,uL[1]); how=f'listing URL names the lot "{c}, {uL[1]}"'
        if not new and D in MULTI and url not in EVID:
            hold='multi-lot dealer; lot not stated on a page we could read' if url else 'multi-lot dealer; no listing page'
    if hold:
        C['held_lot_not_determined']+=1; C[f'held_lot:{D}']+=1; held.append(u); holds.append([u['id'],url,u.get('title'),'lot_not_determined',D,hold]); continue
    if new:
        c,st=new
        if (norm(c),st)!=(norm(old[0]),old[1]):
            nd=dict(d,city=c,state=st,lat=None,lng=None,id=f"{D}:{re.sub(r'[^a-z0-9]+','-',c.lower()).strip('-')}")
            if (c,st) in AIR_DEALER and 'airstream' in D: nd.update(AIR_DEALER[(c,st)])
            else:
                mm=NAMECITY.search(nd.get('name') or '')
                if mm and norm(mm.group(1))!=norm(c): nd['name']=(nd['name'][:mm.start()].strip() or nd['name'])
            u['dealer']=nd; C['lot_reassigned']+=1; C[f'lot_reassigned:{D}']+=1
            chg.append([u['id'],url,'location',f'{old[0]}, {old[1]}',f'{c}, {st}',how])
    d=u['dealer']
    if d.get('city')=='Schereville': u['dealer']=dict(d,city='Schererville',lat=None,lng=None); C['city_typo_schererville']+=1; chg.append([u['id'],url,'city','Schereville','Schererville','dealer lot data-lot says Schererville (Census place)'])
    # ---- 3) destination trailers
    t=f"{u.get('title') or ''} {url}".lower()
    if re.search(r'destination[- ]trailer',t) and not re.search(r'fifth[- ]?wheel|5th[- ]?wheel',t):
        if u.get('rvType')=='fifth_wheel':
            chg.append([u['id'],url,'rvType','fifth_wheel','travel_trailer','listing says "destination trailer" (no fifth wheel stated)']); u['rvType']='travel_trailer'; C['destination_fifth_to_travel']+=1
        if u.get('rvType')=='travel_trailer' and not u.get('destinationTrailer'): u['destinationTrailer']=True; C['destination_flagged']+=1
    # ---- 4) make
    mk=(u.get('make') or '').strip(); k=mk.lower(); vin=(u.get('vin') or '').upper()
    if k in MM:
        to,wmi=MM[k]
        if not vin or vin[:3] in wmi:
            mod=u.get('model') or ''
            line=mk.title() if mk.isupper() or mk.islower() else mk
            if k in ('grand design rv','forestriver','kz-rv','coachman'): newmod=mod
            else:
                if mod.lower().startswith(to.lower()+' '): mod=mod[len(to)+1:].strip()
                newmod=mod if mod.lower().startswith(k) else f'{line} {mod}'.strip()
            chg.append([u['id'],url,'make/model',f'{mk} / {mod}',f'{to} / {newmod}',f'model line "{mk}" is built by {to}'+(f' (VIN maker code {vin[:3]})' if vin else '')])
            u['make']=to; u['model']=newmod; C['make_from_model_line']+=1; C[f'make:{k}->{to}']+=1
        else: C['make_line_vin_disagrees_left']+=1
    mk=u.get('make') or ''; mod=u.get('model') or ''
    if mk and mod.lower().startswith(mk.lower()+' ') and len(mod)>len(mk)+1:
        u['model']=mod[len(mk)+1:].strip(); C['model_make_prefix_trimmed']+=1
    # ---- 5) MSRP
    p=(u.get('priceUsd') or {}).get('value'); m=(u.get('msrpUsd') or {}).get('value')
    if m and L and 'pageMsrps' in L:
        pm=L['pageMsrps']
        if not (len(pm)==1 and abs(pm[0]-m)<1):
            u['msrpUsd']={"value":None,"source":None,"confidence":None}; C['msrp_not_unit_own_on_page_blanked']+=1; C[f'msrp_page_blank:{D}']+=1
            chg.append([u['id'],url,'msrp',m,'',f'MSRP not the single MSRP printed on the unit page (page MSRP values: {pm[:6]})']); m=None
    if m and p and abs(m-p)<1:
        u['msrpUsd']={"value":None,"source":None,"confidence":None}; C['msrp_equal_price_blanked']+=1; chg.append([u['id'],url,'msrp',m,'','MSRP identical to price (copied field)'])
    elif m and u.get('rvType') in ('travel_trailer','popup_camper','truck_camper') and m>250000 or m and u.get('rvType') in ('fifth_wheel','toy_hauler') and m>400000:
        u['msrpUsd']={"value":None,"source":None,"confidence":None}; C['msrp_implausible_towable_blanked']+=1; chg.append([u['id'],url,'msrp',m,'',f'MSRP {m:.0f} implausible for a {u.get("rvType")}'])
    keep.append(u)
S['units']=keep
st=S.get('stats') or {}; st['units']=len(keep); st['dealers']=len({(u.get('dealer') or {}).get('id') for u in keep})
st['fix5_2026_10_31']={k:v for k,v in C.items() if ':' not in k}; S['stats']=st
with gzip.open(dst,'wb',compresslevel=9) as f: f.write(json.dumps(S,separators=(',',':'),ensure_ascii=True).encode('latin1'))
with open(f'{out}/fix5_changes.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['id','listing_url','field','old','new','evidence']); w.writerows(chg)
with open(f'{out}/fix5_holds.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['id','listing_url','title','hold_reason','domain','detail']); w.writerows(holds)
with gzip.open(f'{out}/fix5_held_units.ndjson.gz','wt') as f:
    for u in held: f.write(json.dumps(u)+'\n')
json.dump(dict(C),open(f'{out}/fix5.json','w'),indent=1)
json.dump(sorted(MULTI),open(f'{out}/fix5_multi.json','w'))
print(json.dumps(st['fix5_2026_10_31']))

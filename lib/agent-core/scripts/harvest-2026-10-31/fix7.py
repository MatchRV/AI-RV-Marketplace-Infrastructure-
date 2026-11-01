"""fix7.py <in.snapshot.json.gz> <out.snapshot.json.gz> <outdir> : CSO QA trial6 fixes (facts only).
 1) order holds: the unit's own og:title/title/h1, own-block unit tags / photo badges, sales-pitch banner, lot status
    (order_scan.ndjson, read from the stored pages) and its own title/model/trim/description say available to order,
    on order, order yours today, build to order, reserve yours, pre-order, in transit, coming/arriving soon...
    (case/punctuation-insensitive; 'was on order' and nav text excluded). Also: new unit, no VIN, model year after
    2026, with any order/arrival word in its own title/banner/tags.
 2) dedupe: same dealer domain + year + price + normalized title + condition -> keep the freshest record; never when
    the two records carry different VINs or different stock numbers (a stock that only adds letters, 35026 / 35026LE,
    or a 'VIN' field that is really the stock number, counts as the same stock).
 3) make split: make 'Forest' + model 'River R-Pod ...' -> make 'Forest River', model 'R-Pod ...', for every
    multi-word make seen in the build."""
import json,gzip,sys,re,os,csv,collections
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from onorder import text_hit,weak_hit
src,dst,out=sys.argv[1:4]; H='/workspace/harvest-2026-10-31'
S=json.load(gzip.open(src)); U=S['units']
def dom(u): return re.sub(r'^https?://(www\.)?','',(u.get('dealer') or {}).get('website') or '').split('/')[0].lower()
def lu(u): return (u.get('provenance') or {}).get('listingUrl') or ''
def ukey(url): return (url or '').split('#')[0].rstrip('/')
OS={}
for l in open(f'{H}/order_scan.ndjson'):
    o=json.loads(l); OS[ukey(o['u'])]=o
C=collections.Counter(); chg=[]; holds=[]; held=[]
# ---- 0) VIN validity: 17 chars, letters/digits, no I/O/Q (check digit recorded, not required). Anything else is
# not a VIN and is blanked (the raw value is kept in memory only, to stop merges with a conflicting identifier).
TR={**{str(i):i for i in range(10)},**dict(zip('ABCDEFGH',range(1,9))),**dict(zip('JKLMN',range(1,6))),'P':7,'R':9,**dict(zip('STUVWXYZ',range(2,10)))}
WT=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]
def vin_ok(v):
    if len(v)!=17 or not re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',v): return None
    c=sum(TR[ch]*w for ch,w in zip(v,WT))%11
    return 'check_digit_ok' if (('X' if c==10 else str(c))==v[8]) else 'alnum_17_check_digit_fails'
for u in U:
    raw=u.get('vin')
    if raw is None or raw=='': continue
    v=str(raw).upper().strip()
    k=vin_ok(v)
    if k and not re.search(r'\d',v): k=None; why8c='no_digit'          # trial8c: a word, not a VIN
    elif k and (u.get('year') or 0)>=1981 and not v[-4:].isdigit(): k=None; why8c='last4_not_numeric_1981plus'
    else: why8c=''
    if k: u['vin']=v; C[f'vin_valid:{k}']+=1; continue
    u['_rawvin']=str(raw); u['vin']=None
    kind=why8c or ('non_alphanumeric' if re.search(r'[^A-Za-z0-9 -]',str(raw)) else ('contains_I_O_Q' if len(v)==17 else f'length_{"short" if len(v)<17 else "long"}'))
    C['vin_invalid_blanked']+=1; C[f'vin_invalid_blanked:{kind}']+=1; C[f'vin_invalid_by_domain:{dom(u)}']+=1
    chg.append([u['id'],lu(u),'vin',str(raw),'',f'not a VIN ({kind}); blanked'])
# ---- 0b) trial8c: make field holding raw JSON / a schema.org Brand list -> the brand named in the unit's own title,
# else the brand of the VIN's maker code; several or none -> hold (make_unresolved_brand_list)
# VIN maker code -> the manufacturer (Forest River Inc. builds Coachmen/Prime Time etc. under its own codes)
WMI={'4X4':'Forest River','5ZT':'Forest River','5NH':'Forest River','4YD':'Keystone RV','1UJ':'Jayco','573':'Grand Design','47C':'Heartland'}
def nb(x): return re.sub(r'[^a-z0-9]','',re.sub(r'(?i)\brv\b','',x or '').lower())
def brands(m):
    try: j=json.loads(m)
    except Exception: j=None
    if j is not None:
        j=j if isinstance(j,list) else [j]
        return [str(x.get('name') if isinstance(x,dict) else x).strip() for x in j if (x.get('name') if isinstance(x,dict) else x)]
    return re.findall(r'"name"\s*:\s*"([^"]+)"',m)
mkrows=[]
for u in list(U):
    m=u.get('make') or ''
    if not (m.strip().startswith(('[','{')) or '@type' in m): continue
    bs=list(dict.fromkeys(brands(m))); t=nb(u.get('title')); dm_=dom(u)
    pick=[b for b in bs if nb(b) and nb(b) in t]
    basis='brand named in own title'
    if not pick:   # title names none of the listed brands -> the VIN maker code, if it is one of them
        v=(u.get('vin') or '').upper(); w=WMI.get(v[:3]) if len(v)==17 else None
        pv=[b for b in bs if w and nb(b)==nb(w)]
        pick,basis=(pv,f'VIN maker code {v[:3]}') if len(pv)==1 else ([],'')
    if len(bs)==1 and not pick: pick,basis=bs,'only brand in the field'
    if len(pick)==1:
        u['make']=pick[0]; C['make_json_extracted']+=1; C[f'make_json_extracted:{dm_}']+=1
        chg.append([u['id'],lu(u),'make',m[:200],pick[0],f'make field held a brand list; {basis}']); mkrows.append([dm_,u['id'],u.get('title'),m[:200],pick[0],basis])
    else:
        U.remove(u); held.append(u); C['held_make_unresolved_brand_list']+=1; C[f'held_make_unresolved_brand_list:{dm_}']+=1
        holds.append([u['id'],lu(u),u.get('title'),'make_unresolved_brand_list',dm_,f'make field {m[:150]}; brands {bs}; none or several match title/VIN'])
        mkrows.append([dm_,u['id'],u.get('title'),m[:200],'','held: no single brand matches title or VIN maker'])
with open(f'{out}/make_json_fixes.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['domain','id','title','old_make','new_make','basis']); w.writerows(mkrows)
# ---- 1) order holds
keep=[]
for u in U:
    D=dom(u); o=OS.get(ukey(lu(u))); why=None
    for k in ('title','model','trim'):   # trial8: own-unit fields only, never description/body text
        v=u.get(k); h=text_hit(v if isinstance(v,str) else None)
        if h: why=(f'unit {k}','"'+h[:120]+'"'); break
    if not why and o:
        for k,lab in (('og','own og:title'),('title','own page title'),('h1','own h1'),('pitch','own sales-pitch banner'),('lot','own lot status')):
            h=text_hit(o.get(k))
            if h: why=(lab,'"'+h[:120]+'"'); break
        if not why:
            for t in o.get('tags') or []:
                if text_hit(t): why=('own unit tag/badge',f'"{t}"'); break
    if not why and u.get('condition')=='new' and not (u.get('vin') and len(u['vin'])==17) and (u.get('year') or 0)>=2027:
        for k,v in (('unit title',u.get('title')),)+(((('own og:title',o.get('og')),('own sales-pitch banner',o.get('pitch')))+tuple(('own unit tag/badge',t) for t in o.get('tags') or [])) if o else ()):
            h=weak_hit(v)
            if h: why=(k+' (new, no VIN, model year '+str(u.get('year'))+')','"'+h[:120]+'"'); break
        if why: C['held_order_weak_no_vin_future_year']+=1
    if why:
        C['held_order']+=1; C[f'held_order:{D}']+=1; C[f'held_order_by:{why[0].split(" (")[0]}']+=1
        held.append(u); holds.append([u['id'],lu(u),u.get('title'),'order_not_on_lot',D,f'{why[0]}: {why[1]}']); continue
    keep.append(u)
U=keep
# ---- 3) make split (before dedupe so titles/makes are final)
mk=collections.Counter((u.get('make') or '').strip() for u in U)
MW={}
for m,n in mk.items():
    if ' ' in m and n>=3:
        k=m.lower()
        # canonical spelling: the most used one, preferring mixed case over ALL CAPS
        if k not in MW or (m.isupper(),-n)<(MW[k].isupper(),-mk[MW[k]]): MW[k]=m
for u in U:
    m=(u.get('make') or '').strip(); mod=(u.get('model') or '').strip()
    if not m or ' ' in m or not mod: continue
    best=None
    for k,canon in MW.items():
        f,rest=k.split(' ',1)
        if m.lower()==f and (mod.lower()==rest or mod.lower().startswith(rest+' ')):
            if not best or len(rest)>len(best[1]): best=(canon,rest)
    if best:
        canon,rest=best; newmod=mod[len(rest):].strip() or None
        if not newmod:
            # the stored model was only the rest of the make name: take the model from the unit's own title after the make
            tt=u.get('title') or ''; mm=re.search(re.escape(canon)+r'\s+(.+)$',tt,re.I)
            if mm:
                rest_t=re.sub(r'\s+(?:travel trailer|fifth wheel|toy hauler|motor ?home.*|class [abc].*)$','',mm.group(1).strip(),flags=re.I)
                fp=(u.get('floorplanCode') or '').strip()
                if fp and rest_t.upper().endswith(' '+fp.upper()): rest_t=rest_t[:-len(fp)].strip()
                newmod=rest_t or None
                if newmod: C['make_split_model_from_title']+=1
        if not newmod:
            # no model is stated anywhere, so the unit is held
            C['held_make_split_no_model']+=1; C[f'held_make_split_no_model:{dom(u)}']+=1; held.append(u)
            holds.append([u['id'],lu(u),u.get('title'),'make_split_no_model',dom(u),f'make "{m}" + model "{mod}" = make "{canon}" with no model stated']); u['_drop']=1; continue
        chg.append([u['id'],lu(u),'make/model',f'{m} / {mod}',f'{canon} / {newmod or ""}',f'make split across make and model ("{m}" + "{mod[:len(rest)]}" = "{canon}")'])
        u['make']=canon; u['model']=newmod; C['make_split_joined']+=1; C[f'make_split:{canon}']+=1
U=[u for u in U if not u.get('_drop')]
# ---- 2) dedupe
def nt(t): return re.sub(r'[^a-z0-9]','',re.sub(r'(?i)\b(new|used|pre-?owned)\b','',t or '').lower())
def realvin(u): return (u.get('vin') or '').upper().strip()   # only valid VINs remain after the blanking pass
def rawid(u):
    r=re.sub(r'[^A-Z0-9]','',(u.get('_rawvin') or '').upper())
    return r if len(r)>=5 and re.fullmatch(r'[A-Z0-9 -]+',(u.get('_rawvin') or '').upper().strip()) else ''
def stocks(u):
    s={(u.get('stockNumber') or '').upper().strip()}
    if rawid(u): s.add(rawid(u))        # an invalid 'VIN' that is an identifier (e.g. the stock number)
    return {x for x in s if x}
def vin_conflict(a,b):
    va,vb=realvin(a),realvin(b); ra,rb=rawid(a),rawid(b)
    if va and vb: return va!=vb
    if va and rb: return not (va.endswith(rb) or rb in stocks(a))
    if vb and ra: return not (vb.endswith(ra) or ra in stocks(b))
    if ra and rb: return ra!=rb and ra not in stocks(b) and rb not in stocks(a)
    return False
def same_stock(a,b):
    if not a or not b: return True
    for x in a:
        for y in b:
            if x==y or (x.startswith(y) and x[len(y):].isalpha()) or (y.startswith(x) and y[len(x):].isalpha()): return True
    return False
G=collections.defaultdict(list)
for u in U:
    p=(u.get('priceUsd') or {}).get('value')
    if p and u.get('title') and u.get('year'): G[(dom(u),u['year'],p,nt(u['title']))].append(u)
drop=set(); dd=[]; pairs=[]
for k,us in G.items():
    if len(us)<2: continue
    # keep a record with a valid VIN first, then the freshest
    us.sort(key=lambda u:(bool(realvin(u)),(u.get('provenance') or {}).get('lastSeenAt') or '',bool(lu(u))),reverse=True)
    kept=[us[0]]
    for u in us[1:]:
        tgt=None
        for kp in kept:
            if vin_conflict(kp,u): continue
            if not same_stock(stocks(kp),stocks(u)): continue
            if kp.get('condition') and u.get('condition') and kp['condition']!=u['condition']: continue
            tgt=kp; break
        if tgt is None: kept.append(u); continue
        how='same VIN' if realvin(u) and realvin(u)==realvin(tgt) else ('same stock number' if stocks(u)&stocks(tgt) else ('stock number differs only by a letter suffix' if stocks(u) and stocks(tgt) else 'year, price and title match; no conflicting VIN or stock'))
        if ((u.get('provenance') or {}).get('lastSeenAt') or '')>((tgt.get('provenance') or {}).get('lastSeenAt') or ''): C['dedupe_kept_valid_vin_over_fresher']+=1
        pairs.append((tgt,u,how))
        drop.add(id(u)); C['dedupe_removed']+=1; C[f'dedupe:{k[0]}']+=1; C[f'dedupe_by:{how}']+=1
        dd.append([k[0],u['id'],tgt['id'],u.get('title'),k[2],(u.get('provenance') or {}).get('lastSeenAt'),(tgt.get('provenance') or {}).get('lastSeenAt'),u.get('vin'),tgt.get('vin'),u.get('stockNumber'),tgt.get('stockNumber'),how])
# ---- 2b) trial8b carry-over: when the kept (valid-VIN) record is older than a removed duplicate, keep its VIN and id but
# take the fresher record's price block (priceUsd incl. pre-fee fields + msrpUsd), lastSeen and listing URL -- only on an
# identifier match (same VIN, removed VIN tail = kept VIN, same stock number) and no year/make/model conflict. No specs.
def ls(u): return (u.get('provenance') or {}).get('lastSeenAt') or ''
def nv(x): return re.sub(r'[^a-z0-9]','',str(x or '').lower())
def basis(kp,u):
    if realvin(u) and realvin(u)==realvin(kp): return 'same VIN'
    if rawid(u) and realvin(kp) and realvin(kp).endswith(rawid(u)): return 'removed record VIN tail matches kept VIN'
    sk,su=(kp.get('stockNumber') or '').upper().strip(),(u.get('stockNumber') or '').upper().strip()
    if sk and sk==su: return 'same stock number'
    if su and rawid(kp)==su or sk and rawid(u)==sk: return 'same stock number (one record stores it in the VIN field)'
    return ''
best={}
for kp,u,how in pairs:
    if ls(u)>ls(kp) and (id(kp) not in best or ls(u)>ls(best[id(kp)][1])): best[id(kp)]=(kp,u)
co=[]
if os.environ.get('CARRY')=='1':
  for kp,u in best.values():
    C['carry_candidates']+=1; dm=dom(kp); pv,pu=kp.setdefault('provenance',{}),(u.get('provenance') or {})
    row=[kp['id'],u['id'],dm,kp.get('title'),(kp.get('priceUsd') or {}).get('value'),(u.get('priceUsd') or {}).get('value'),(kp.get('msrpUsd') or {}).get('value'),(u.get('msrpUsd') or {}).get('value'),pv.get('lastSeenAt'),pu.get('lastSeenAt'),pv.get('listingUrl') or '',pu.get('listingUrl') or '']
    kd,ud=(kp.get('dealer') or {}),(u.get('dealer') or {})
    locrow=[kd.get('name'),kd.get('city'),kd.get('state'),ud.get('name'),ud.get('city'),ud.get('state')]
    b=basis(kp,u)
    conf=[f for f in ('year','make','model') if kp.get(f) and u.get(f) and nv(kp[f])!=nv(u[f])]
    if conf: C['carry_skipped:spec_conflict']+=1; co.append(row+['','skipped: '+'/'.join(conf)+' conflict']+locrow); continue
    if not b: C['carry_skipped:no_identifier_match']+=1; co.append(row+['','skipped: no VIN or stock-number match']+locrow); continue
    old=(kp.get('priceUsd') or {}).get('value')
    kp['priceUsd']=json.loads(json.dumps(u.get('priceUsd'))); kp['msrpUsd']=json.loads(json.dumps(u.get('msrpUsd')))
    for f in ('lastSeenAt','listingUrl','harvestMethod','lastSeenBasis'):
        if pu.get(f): pv[f]=pu[f]
    pv['carriedFromDuplicate']=u['id']
    if u.get('dealer') and json.dumps(kd,sort_keys=True)!=json.dumps(ud,sort_keys=True):   # whole location: lot/store, city, state, coordinates
        kp['dealer']=json.loads(json.dumps(ud)); C['carry_location_changed']+=1; C[f'carry_location_changed:{dm}']+=1
        if (kd.get('city'),kd.get('state'))!=(ud.get('city'),ud.get('state')): C['carry_city_changed']+=1; C[f'carry_city_changed:{dm}']+=1
    C['carry_done']+=1; C[f'carry_by:{dm}']+=1
    if old!=(kp.get('priceUsd') or {}).get('value'): C['carry_price_changed']+=1; C[f'carry_price_changed:{dm}']+=1
    if row[6]!=row[7]: C['carry_msrp_changed']+=1
    co.append(row+[b,'carried']+locrow)
  with open(f'{out}/dedupe_carryover.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['kept_id','removed_id','domain','title','old_price','new_price','old_msrp','new_msrp','old_last_seen','new_last_seen','old_listing_url','new_listing_url','match_basis','result','old_lot','old_city','old_state','new_lot','new_city','new_state']); w.writerows(co)
U=[u for u in U if id(u) not in drop]
for u in U: u.pop('_rawvin',None); u.pop('_drop',None)
S['units']=U
st=S.get('stats') or {}; st['units']=len(U); st['dealers']=len({(u.get('dealer') or {}).get('id') for u in U})
st['fix7_2026_10_31']={k:v for k,v in C.items() if ':' not in k}; S['stats']=st
with gzip.open(dst,'wb',compresslevel=9) as f: f.write(json.dumps(S,separators=(',',':'),ensure_ascii=True).encode('latin1'))
with open(f'{out}/fix7_changes.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['id','listing_url','field','old','new','evidence']); w.writerows(chg)
with open(f'{out}/fix7_holds.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['id','listing_url','title','hold_reason','domain','detail']); w.writerows(holds)
with open(f'{out}/fix7_dedupe.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['domain','removed_id','kept_id','title','price','removed_last_seen','kept_last_seen','removed_vin','kept_vin','removed_stock','kept_stock','match']); w.writerows(dd)
with gzip.open(f'{out}/fix7_held_units.ndjson.gz','wt') as f:
    for u in held: f.write(json.dumps(u)+'\n')
json.dump(dict(sorted(C.items())),open(f'{out}/fix7.json','w'),indent=1)
print(json.dumps(st['fix7_2026_10_31']))

"""postfix.py <in.snapshot.gz> <out.snapshot.gz> <outdir>
Post-build data fixes (2026-10-31 smoke test):
 1) Motorized units stored as class_a whose make+model the manufacturer classifies as a Class B van or a Class C
    (e.g. Airstream Interstate/Rangeline). These came from listings whose category is only the generic word
    "Motorhome"; the manufacturer's own model class replaces the guessed class_a. Generic-"Motorhome" units whose
    model is in no table are held (no dealer-stated class).
 2) suspect_price: a price far below the norm for its type / model year / condition (or far below the unit's own
    MSRP) is held back instead of shown."""
import gzip,json,sys,re,statistics,collections,csv
src,dst,out=sys.argv[1:4]
S=json.load(gzip.open(src)); U=S['units']
# manufacturer model classes (make regex, model regex, class)
T=[(r'airstream',r'\b(interstate|rangeline)\b','class_b'),
   (r'winnebago',r'\b(revel|solis|travato|boldt|era)\b','class_b'),
   (r'thor',r'\b(sequence|tellaro|sanctuary|tranquility|rize|scope|talavera|dazzle)\b','class_b'),
   (r'coachmen',r'\b(beyond|nova|galleria|crossfit)\b','class_b'),
   (r'roadtrek',r'.','class_b'),(r'pleasure[- ]?way',r'.','class_b'),(r'storyteller',r'.','class_b'),
   (r'grech',r'.','class_b'),(r'midwest',r'\b(passage|weekender)\b','class_b'),(r'entegra',r'\blaunch\b','class_b'),
   (r'jayco',r'\b(terrain|swift)\b','class_b'),(r'regency',r'\b(ultra brougham|ultra-brougham)\b','class_b'),
   (r'renegade',r'\b(xl|veracruz|verona|vienna|valencia|classic|explorer|ikon|villagio|xls)\b','class_c'),
   (r'winnebago|itasca',r'\b(view|navion|ekko|outlook|minnie winnie|spirit|access|cambria)\b','class_c'),
   (r'thor',r'\b(four winds|chateau|compass|quantum|freedom elite|delano|gemini|omni|magnitude)\b','class_c'),
   (r'fleetwood',r'\bpulse\b','class_c'),(r'tiffin',r'\bwayfarer\b','class_c'),
   (r'leisure travel',r'\b(unity|wonder|serenity|free spirit)\b','class_c'),
   (r'jayco',r'\b(redhawk|greyhawk|melbourne|seneca|granite ridge)\b','class_c'),
   (r'forest river|sunseeker|forester',r'\b(sunseeker|forester|solera|isata)\b','class_c'),
   (r'coachmen',r'\b(freelander|leprechaun|prism|cross trail|concord)\b','class_c'),
   (r'gulf stream',r'\bconquest\b','class_c'),(r'dynamax',r'\b(isata|dx3|europa|grand sport)\b','class_c')]
T=[(re.compile(a,re.I),re.compile(b,re.I),c) for a,b,c in T]
def lu(u): return (u.get('provenance') or {}).get('listingUrl') or ''
fix=collections.Counter(); fixrows=[]; held=[]; holdrows=[]
keep=[]
for u in U:
    if u.get('rvType')=='class_a':
        make=(u.get('make') or ''); s=f"{u.get('model') or ''} {u.get('trim') or ''} {u.get('title') or ''}"
        cls=next((c for a,b,c in T if a.search(make) and b.search(s)),None)
        if cls:
            fixrows.append([u['id'],lu(u),u.get('title'),'class_a',cls]); fix[(make.lower(),cls)]+=1
            u['rvType']=cls; u.setdefault('notes',None)
        elif re.search(r'-Motorhome-',lu(u)) and not re.search(r'class[- ]?a\b|diesel pusher',u.get('title') or '',re.I):
            # class only guessed from the generic word "Motorhome"; keep only manufacturer-known Class A lines
            if not re.search(r'\b(sunova|windsport|hurricane|axis|vegas|allegro|breeze|phaeton|open road|bay star|bounder|discovery|tuscany|aria|palazzo|venetian|miramar|ace|forza|journey|adventurer|horizon|vista|sunstar|intrepid|georgetown|fr3|accolade|berkshire|dutch star|ventana|essex|london aire|mountain aire|canyon star|kingsley|allure|anthem|aspire|cornerstone|insignia|reatta|accolade)\b',f"{u.get('model')} {u.get('title')}",re.I):
                held.append(u); holdrows.append([u['id'],lu(u),u.get('title'),'rv_class_not_stated_generic_motorhome',u.get('rvType'),'']); continue
    keep.append(u)
U=keep
# suspect_price
def yr(u):
    try: return int(u.get('year'))
    except Exception: return None
def fp(u):
    t=f"{u.get('trim') or ''} {u.get('model') or ''} {u.get('title') or ''}".upper()
    m=re.findall(r'\b(\d{2,4}[A-Z]{0,6}\d?[A-Z]{0,3})\b',t)
    m=[x for x in m if not re.fullmatch(r'(19|20)\d\d',x)]
    return m[0] if m else None
def mk(u): return re.sub(r'[^a-z]','',(u.get('make') or '').lower().replace(' rv','').replace('rv',''))
def ml(u): return ' '.join(re.sub(r'[^a-z0-9 ]','',(u.get('model') or '').lower()).split()[:2])
G1=collections.defaultdict(list); G2=collections.defaultdict(list); G3=collections.defaultdict(list)
for u in U:
    p=(u.get('priceUsd') or {}).get('value'); y=yr(u); n=u.get('condition')=='new'
    if p and y:
        if fp(u): G1[(mk(u),fp(u),n,y)].append(p)
        G2[(mk(u),ml(u),u.get('rvType'),n,y)].append(p); G3[(u.get('rvType'),n,y)].append(p)
M1={k:statistics.median(v) for k,v in G1.items() if len(v)>=3}
M2={k:statistics.median(v) for k,v in G2.items() if len(v)>=8}
M3={k:statistics.median(v) for k,v in G3.items() if len(v)>=20}
keep=[]; sp=collections.Counter(); msrpfix=[]
MSRPN=collections.Counter((u.get('msrpUsd') or {}).get('value') for u in U if (u.get('msrpUsd') or {}).get('value'))
for u in U:
    p=(u.get('priceUsd') or {}).get('value'); m=(u.get('msrpUsd') or {}).get('value'); y=yr(u); new=u.get('condition')=='new'
    why=None
    if p and (new or (y is not None and y>=2025)):
        k1=(mk(u),fp(u),new,y); k2=(mk(u),ml(u),u.get('rvType'),new,y); k3=(u.get('rvType'),new,y)
        k1n=(mk(u),fp(u),True,y)
        if fp(u) and k1 in M1 and p<0.40*M1[k1]: why=f"price {p:.0f} < 40% of the median {M1[k1]:.0f} for the same make + floorplan {fp(u)}, condition and year (n={len(G1[k1])})"
        elif not new and y>=2026 and fp(u) and k1 not in M1 and k1n in M1 and p<0.30*M1[k1n]: why=f"used {y} unit at {p:.0f} < 30% of the new median {M1[k1n]:.0f} for make + floorplan {fp(u)} (n={len(G1[k1n])})"
        elif not (fp(u) and k1 in M1) and k2 in M2 and p<0.35*M2[k2]: why=f"price {p:.0f} < 35% of the median {M2[k2]:.0f} for the same make/model, condition and year (n={len(G2[k2])})"
        elif not (fp(u) and k1 in M1) and k2 not in M2 and k3 in M3 and k3[0] in ('class_a','class_b','class_c','fifth_wheel') and p<0.20*M3[k3]: why=f"price {p:.0f} < 20% of the median {M3[k3]:.0f} for {k3[0]}/{'new' if new else u.get('condition')}/{y} (n={len(G3[k3])})"
    if not why and p and m and m>3*p and (new or MSRPN[m]>=20):
        # the price is in its normal range, so the MSRP is the misread field: blank it (MSRP is never shown as a price)
        msrpfix.append([u['id'],lu(u),u.get('title'),'msrp_blanked_implausible',u.get('rvType'),f"MSRP {m:.0f} > 3x the dealer price {p:.0f} while the price is normal for its floorplan/type" + (f" (same MSRP on {MSRPN[m]} units)" if MSRPN[m]>=20 else "")])
        u['msrpUsd']={"value":None,"source":None,"confidence":None}
    if why: sp[u.get('rvType')]+=1; held.append(u); holdrows.append([u['id'],lu(u),u.get('title'),'suspect_price',u.get('rvType'),why]); continue
    keep.append(u)
holdrows+=msrpfix
S['units']=keep
st=S.get('stats') or {}
st['units']=len(keep); st['dealers']=len({(u.get('dealer') or {}).get('id') for u in keep})
st['postfix_2026_10_31']={"classFixedFromManufacturerModel":len(fixrows),"classFixedByMakeClass":{f"{a}->{b}":n for (a,b),n in fix.items()},
   "heldGenericMotorhomeNoClass":sum(1 for r in holdrows if r[3].startswith('rv_class')),"heldSuspectPrice":sum(1 for r in holdrows if r[3]=='suspect_price'),"suspectPriceByType":dict(sp),"msrpBlankedImplausible":len(msrpfix)}
S['stats']=st
txt=json.dumps(S,separators=(',',':'),ensure_ascii=True)
with gzip.open(dst,'wb',compresslevel=9) as f: f.write(txt.encode('latin1'))
with open(f"{out}/postfix_class_fixes.csv","w",newline="") as f: w=csv.writer(f); w.writerow(["id","listing_url","title","old_rvType","new_rvType (manufacturer model class)"]); w.writerows(fixrows)
with open(f"{out}/postfix_holds.csv","w",newline="") as f: w=csv.writer(f); w.writerow(["id","listing_url","title","hold_reason","rvType","detail"]); w.writerows(holdrows)
with gzip.open(f"{out}/postfix_held_units.ndjson.gz","wt") as f:
    for u in held: f.write(json.dumps(u)+"\n")
print(json.dumps(st['postfix_2026_10_31']))

"""typefix.py <in.snapshot.gz> <out.snapshot.gz> <outdir>  (trial8b, CSO trial8 recheck)
Motorhomes stored with a towable type (travel_trailer / fifth_wheel / toy_hauler / popup_camper).
 - Candidates: make that builds only motorhomes, a model line the manufacturer classes as a motorhome (postfix map +
   the lines below), or a towable price above $300,000.
 - The new rvType comes only from the manufacturer's model class (Super C is stored as class_c, the type map has no
   super_c). The VIN's chassis maker code (Ford, Freightliner, Mercedes, Chevrolet, Ram) is recorded as corroboration.
 - Anything that cannot be resolved with certainty is held (rv_type_unresolved_motorized), never guessed."""
import gzip,json,sys,re,csv,collections
src,dst,out=sys.argv[1:4]
S=json.load(gzip.open(src)); U=S['units']
TOW={'travel_trailer','fifth_wheel','toy_hauler','popup_camper'}
# (make regex, model regex, class); first match wins. postfix.py's manufacturer table first, then the additions.
sys.path.insert(0,__file__.rsplit('/',1)[0])
M=[(r'airstream',r'^(interstate|rangeline)\b','class_b'),
   (r'winnebago',r'^(revel|solis|travato|boldt|era)\b','class_b'),
   (r'winnebago|itasca',r'^(view|navion|ekko|outlook|minnie winnie|cambria)\b','class_c'),   # not Access/Spirit: also towable lines
   (r'winnebago',r'^(journey|forza|adventurer|vista|sunstar|intent|horizon|tour|grand tour|sightseer|sunova|brave)\b','class_a'),
   (r'thor',r'^(sequence|tellaro|sanctuary|tranquility|rize|scope|talavera|dazzle|twist)\b','class_b'),
   (r'thor',r'^(four winds|chateau|compass|quantum|freedom elite|delano|gemini|omni|magnitude|tiburon|synergy|siesta|citation)\b','class_c'),
   (r'thor',r'^(a\.?c\.?e\.?|axis|vegas|hurricane|windsport|miramar|palazzo|tuscany|aria|venetian|challenger|luminate|inception|daybreak)\b','class_a'),
   (r'thor',r'^outlaw\b.*\b29[a-z]{1,2}\b','class_c'),(r'thor',r'^outlaw\b.*\b3[5-8][a-z]{1,2}\b','class_a'),
   (r'coachmen',r'^(beyond|nova|galleria|crossfit)\b','class_b'),
   (r'coachmen',r'^(freelander|leprechaun|prism|cross trail|concord)\b','class_c'),
   (r'roadtrek',r'.','class_b'),(r'pleasure[- ]?way',r'.','class_b'),(r'storyteller|^overland$',r'^mode\b','class_b'),
   (r'grech',r'.','class_b'),(r'midwest',r'^(passage|weekender)\b','class_b'),
   (r'entegra',r'^launch\b','class_b'),(r'entegra',r'^(accolade|esteem|odyssey|qwest)\b','class_c'),
   (r'entegra',r'^(aspire|anthem|cornerstone|insignia|reatta|vision|emblem)\b','class_a'),
   (r'jayco',r'^(terrain|swift)\b','class_b'),(r'jayco',r'^(redhawk|greyhawk|melbourne|seneca|granite ridge|alante|precept|embark)\b','class_c' ),
   (r'regency',r'^(ultra brougham|ultra-brougham)\b','class_b'),
   (r'renegade',r'^(xl|xls|veracruz|verona|vienna|valencia|classic|explorer|ikon|villagio)\b','class_c'),
   (r'fleetwood',r'^pulse\b','class_c'),(r'tiffin',r'^wayfarer\b','class_c'),(r'tiffin',r'^(allegro|phaeton|zephyr|open road)\b','class_a'),
   (r'leisure travel',r'^(unity|wonder|serenity|free spirit)\b','class_c'),
   (r'forest river|sunseeker|forester',r'^(sunseeker|forester|solera|isata)\b','class_c'),
   (r'gulf stream',r'^conquest\b','class_c*'),   # * = name also used on towables: needs a motorhome chassis VIN
   (r'dynamax',r'^(isata|dx3|europa|grand sport|force|dynaquest)\b','class_c'),
   (r'nexus',r'^(viper|phantom|ghost)\b','class_c'),
   (r'foretravel',r'.','class_a'),(r'newmar',r'^(canyon star|bay star|dutch star|ventana|essex|london aire|mountain aire|king aire|new aire|kountry aire|supreme aire)\b','class_a'),
   (r'grand design',r'^lineage\b','class_c')]
M=[(re.compile(a,re.I),re.compile(b,re.I),c) for a,b,c in M]
MOTOR_ONLY=re.compile(r'^(renegade|dynamax|entegra( coach)?|foretravel|newell|prevost|american coach|pleasure[- ]?way|roadtrek|storyteller.*|regency|phoenix cruiser|leisure travel( vans)?|nexus( rv)?|thor motor coach|tiffin( motorhomes)?|country coach|midwest automotive|grech( rv)?|coach house)$',re.I)
# lines whose make field reads "Thor Motor Coach"/"Thor" but are Thor-family towables (wrong make, right towable type): leave alone
TOWLINE=re.compile(r'^(redwood|komfort|wanderer|open range|roamer|jayco|jay feather|autumn ridge|aero cub|radiance|triton|trilogy|lakota)\b',re.I)
CHASSIS={'1FD':'Ford','1FC':'Ford','1FT':'Ford','1FV':'Freightliner','3AL':'Freightliner','4UZ':'Freightliner Custom Chassis','1F6':'Ford','5B4':'Workhorse',
         'WDA':'Mercedes-Benz','WD3':'Mercedes-Benz','WDP':'Mercedes-Benz','W1X':'Mercedes-Benz','W1Y':'Mercedes-Benz','W1W':'Mercedes-Benz','1GB':'Chevrolet','1GC':'Chevrolet','3C6':'Ram','3C7':'Ram','1N6':'Nissan'}
def lu(u): return (u.get('provenance') or {}).get('listingUrl') or ''
def dm(u): return (u.get('provenance') or {}).get('dealerDomain') or ''
def clean(m): return re.sub(r'&#39;|&quot;','',m or '').strip()
C=collections.Counter(); rows=[]; holds=[]; held=[]; keep=[]
for u in U:
    t=u.get('rvType')
    if t not in TOW: keep.append(u); continue
    make=(u.get('make') or '').strip(); model=clean(u.get('model')); p=(u.get('priceUsd') or {}).get('value') or 0
    vin=(u.get('vin') or '').upper(); ch=CHASSIS.get(vin[:3],'') if len(vin)==17 else ''
    if TOWLINE.search(model): keep.append(u); continue
    mt=f"{model} {clean(u.get('trim'))} {u.get('title') or ''}" if re.match(r'(?i)outlaw\b',model) else model
    cls=next((c for a,b,c in M if a.search(make) and b.search(mt)),None)
    if cls and cls.endswith('*'): cls=cls[:-1] if ch else None
    mo=bool(MOTOR_ONLY.match(make)); hi=p>300000
    if not (cls or mo or hi): keep.append(u); continue
    why='motorized model line' if cls else ('motorhome-only make' if mo else 'towable price above $300,000')
    if cls:
        rows.append([u['id'],lu(u),dm(u),u.get('title'),make,model,p,t,cls,f"manufacturer model class ({make} {model.split()[0] if model else ''})",ch]); C['fixed']+=1; C[f'fixed:{dm(u)}:{cls}']+=1; C[f'fixed_type:{cls}']+=1
        if ch: C['fixed_chassis_vin_corroborated']+=1
        u['rvType']=cls; keep.append(u); continue
    held.append(u); holds.append([u['id'],lu(u),dm(u),u.get('title'),make,model,p,t,'rv_type_unresolved_motorized',f'{why}; model class not in the manufacturer table'+(f'; VIN chassis {ch}' if ch else '')])
    C['held']+=1; C[f'held:{dm(u)}']+=1
S['units']=keep
st=S.get('stats') or {}; st['units']=len(keep); st['typefix_2026_10_31']={k:v for k,v in C.items() if k.count(':')==0}; S['stats']=st
with gzip.open(dst,'wb',compresslevel=9) as f: f.write(json.dumps(S,separators=(',',':'),ensure_ascii=True).encode('latin1'))
with open(f'{out}/type_fixes.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['id','listing_url','domain','title','make','model','price','old_type','new_type','basis','vin_chassis']); w.writerows(rows)
with open(f'{out}/type_holds.csv','w',newline='') as f: w=csv.writer(f); w.writerow(['id','listing_url','domain','title','make','model','price','old_type','hold_reason','detail']); w.writerows(holds)
with gzip.open(f'{out}/type_held_units.ndjson.gz','wt') as f:
    for u in held: f.write(json.dumps(u)+'\n')
json.dump(dict(sorted(C.items())),open(f'{out}/typefix.json','w'),indent=1)
print(json.dumps(st['typefix_2026_10_31']))

import gzip,json,re,collections,csv,sys
s=json.load(gzip.open(sys.argv[1] if len(sys.argv)>1 else '/workspace/harvest-2026-10-30/snaps/v31.json.gz'))
U=s['units']
dom=lambda u:(u.get('provenance') or {}).get('dealerDomain') or u['dealer']['id'].split(':')[0]
isCW=lambda u:'campingworld' in dom(u)
fresh=lambda u:bool((u.get('provenance') or {}).get('harvestMethod'))
stitched=lambda u:isCW(u) and u.get('condition')=='unknown' and not fresh(u)
MOT={'class_a','class_b','class_c'}
def side(t): return 'mot' if t in MOT else 'tow'
ctrl=[u for u in U if not stitched(u) and not isCW(u)]
cwfresh=[u for u in U if isCW(u) and fresh(u)]
cwnon=[u for u in U if isCW(u) and not fresh(u) and not stitched(u)]
st=[u for u in U if stitched(u)]
print('units',len(U),'stitchedCW',len(st),'CWfresh',len(cwfresh),'CWbase-nonstitched',len(cwnon),'control(nonCW)',len(ctrl))
# 1) VIN WMI side
wmi=collections.defaultdict(collections.Counter)
for u in ctrl:
  v=(u.get('vin') or '')
  if len(v)==17: wmi[v[:3]][side(u['rvType'])]+=1
clearW={k:c.most_common(1)[0][0] for k,c in wmi.items() if sum(c.values())>=20 and c.most_common(1)[0][1]/sum(c.values())>=0.98}
def vinside(u):
  v=u.get('vin') or ''; return clearW.get(v[:3]) if len(v)==17 else None
# 2) model family type from title (make + first model word)
def fam(u):
  m=(u.get('model') or '').lower().split()
  return ((u.get('make') or '').lower(), m[0] if m else '')
famc=collections.defaultdict(collections.Counter)
for u in ctrl+cwfresh: famc[fam(u)][u['rvType']]+=1
clearF={k:c.most_common(1)[0][0] for k,c in famc.items() if k[1] and sum(c.values())>=15 and c.most_common(1)[0][1]/sum(c.values())>=0.97}
# 3) explicit title words
CA=r'\b(class a|bounder|flair|southwind|pace arrow|discovery|mirada|hurricane|vista|vista lx|pursuit|allegro|phaeton|zephyr|bay star|canyon star|dutch star|ventana|king aire|new aire|essex|london aire|georgetown|fr3|forza|accolade|aria|reatta|byway|intrepid|precept|alante|apex|ace|challenger|outlaw|miramar|palazzo|tuscany|aspire|insignia|anthem|cornerstone|dynasty|horizon|berkshire|adventurer \d+a|sportscoach|holiday rambler|vacationer|admiral|invicta|bt cruiser|vision|axis|vegas)\b'
CC=r'\b(class c|freelander|leprechaun|quail|four winds|chateau|greyhawk|redhawk|minnie winnie|spirit|sunseeker|forester|prism|conquest|seneca|qwest|jamboree|cross trail|isata|odyssey|esteem|accolade|magnitude|omni|ekko|view|navion|fuse|outlook|east to west entrada|sunstar|vienna|geneva|delano|quantum|daybreak|chateau)\b'
CB=r'\b(class b|travato|solis|revel|tellaro|sanctuary|rize|interstate|boldt|roam|galleria|storyteller|paseo|terrain|sequence|hymer|aktiv|scope|nova|rv\s*van|campervan|camper van|zion|crosstrek|swift|beyond|solis pocket)\b'
TH=r'\b(toy hauler|raptor|fuzion|voltage|momentum|seismic|xlr|vengeance|stryker|carbon|work and play|road warrior|sandstorm|cyclone|torque|thunderbolt|octane|gray wolf hauler)\b'
def titletype(u):
  t=(u['title']+' '+(u.get('model') or '')).lower()
  hits=set()
  if re.search(r'\bclass a\b',t): hits.add('class_a')
  if re.search(r'\bclass c\b',t): hits.add('class_c')
  if re.search(r'\bclass b\b|\bcamper ?van\b',t): hits.add('class_b')
  if re.search(r'\btoy hauler\b',t): hits.add('toy_hauler')
  if re.search(r'\bfifth wheel\b|\b5th wheel\b',t): hits.add('fifth_wheel')
  if re.search(r'\btravel trailer\b',t): hits.add('travel_trailer')
  return hits.pop() if len(hits)==1 else None
def rate(group,fn,cmp):
  n=m=0; ex=[]
  for u in group:
    e=fn(u)
    if e is None: continue
    n+=1
    if not cmp(e,u):
      m+=1
      if len(ex)<8: ex.append((dom(u),u.get('stockNumber'),u.get('vin'),u['title'],u['rvType'],e))
  return n,m,ex
G={'stitchedCW':st,'CWfresh':cwfresh,'CWbaseNonStitched':cwnon,'controlNonCW':ctrl}
res={}
for name,fn,cmp in [('vin_side',vinside,lambda e,u:side(u['rvType'])==e),
                    ('family_type',lambda u:clearF.get(fam(u)),lambda e,u:u['rvType']==e),
                    ('family_side',lambda u:(side(clearF[fam(u)]) if fam(u) in clearF else None),lambda e,u:side(u['rvType'])==e),
                    ('title_word',titletype,lambda e,u:u['rvType']==e)]:
  for g,grp in G.items():
    n,m,ex=rate(grp,fn,cmp); res[(name,g)]=(n,m)
    print(f'{name:12s} {g:18s} checked={n:6d} mismatch={m:5d} ({(100*m/n if n else 0):.1f}%)')
    if g=='stitchedCW':
      for e in ex[:5]: print('   ',e)
# rvType distribution
for g,grp in G.items(): print(g, collections.Counter(u['rvType'] for u in grp).most_common())
# length/price sanity: class_a with price<25000 year>=2020 ; travel_trailer with length>45
for g,grp in G.items():
  a=sum(1 for u in grp if u['rvType']=='class_a' and (u['priceUsd']['value'] or 1e9)<30000 and u['year']>=2020)
  b=sum(1 for u in grp if u['rvType'] in('travel_trailer','fifth_wheel','toy_hauler','popup_camper') and (u['priceUsd']['value'] or 0)>400000)
  print('pricecheck',g,'classA<30k(2020+)',a,'towable>400k',b)
json.dump({'clearW':clearW,'clearF':{'|'.join(k):v for k,v in clearF.items()}},open('/workspace/harvest-2026-10-30/rvtype/refs.json','w'))

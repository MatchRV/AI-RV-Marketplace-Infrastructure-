"""cityfix.py: new units only. (1) 'City ST' lot strings -> city + the state the dealer page states; (2) Jax/N abbreviations;
(3) hold new units whose lot city does not geocode in its stated state (wrong-state lot or not a city). Base units untouched."""
import gzip,json,re,sys,csv,collections,subprocess,os
src,dst,coords_ts=sys.argv[1:4]
STATES=set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())
def ckey(city,st):
    c=city.lower().replace('.',' ');c=re.sub(r'\bsaint\b','st',c);c=re.sub(r'\bmt\b','mount',c);c=re.sub(r'\bft\b','fort',c)
    c=re.sub(r"[^a-z' -]",' ',c);c=re.sub(r'\s+',' ',c).strip();return f'{c}|{st.upper()}'
B={x['id'] for x in json.load(gzip.open('base_25630ad.snapshot.json.gz'))['units']}
S=json.load(gzip.open(src)); c=collections.Counter(); held=[]; out=[]
mode=sys.argv[4] if len(sys.argv)>4 else 'fix'
keys=set(re.findall(r'"([^"]+\|[A-Z]{2})"',open(coords_ts).read()))
for u in S['units']:
    if u['id'] in B: out.append(u); continue
    d=u['dealer']; city=d['city'].strip()
    m=re.match(r'^(.*\S)\s+([A-Za-z]{2})$',city)
    if m and m.group(2).upper() in STATES and len(m.group(1))>2:
        city,st=m.group(1),m.group(2).upper()
        if st!=d['state']: c['state_from_lot_string']+=1
        d['state']=st; c['city_state_split']+=1
    city={'jax':'Jacksonville'}.get(city.lower(),city); city=re.sub(r'^N\s+','North ',city); city=re.sub(r'^S\s+','South ',city)
    if city!=d['city']: d['city']=city; d['id']=d['id'].split(':')[0]+':'+re.sub(r'\s+','-',city.lower().strip())
    if mode=='hold' and ckey(d['city'],d['state']) not in keys:
        held.append([u['id'],u['provenance']['dealerDomain'],u['title'],d['city'],d['state'],u['provenance'].get('listingUrl')]); c['held_lot_city_not_in_stated_state']+=1; continue
    out.append(u)
S['units']=out; S['stats']['units']=len(out); S['stats']['dealers']=len({u['dealer']['id'] for u in out})
S['stats'].setdefault('googleScrape_2026_11_09',{})['cityfix_'+mode]=dict(c)
h=json.dumps({k:v for k,v in S.items() if k!='units'}|{'units':[]},ensure_ascii=True,separators=(',',':'))
with gzip.open(dst,'wb',compresslevel=9) as f:
    f.write(h[:-2].encode('ascii'))
    for i,u in enumerate(out): f.write((b',' if i else b'')+json.dumps(u,ensure_ascii=True,separators=(',',':')).encode('ascii'))
    f.write(b']}')
if held:
    w=csv.writer(open('cityfix_held.csv','w',newline='')); w.writerow(['id','domain','title','city','state','listing_url']); w.writerows(held)
print(json.dumps({**c,'out_units':len(out)}))

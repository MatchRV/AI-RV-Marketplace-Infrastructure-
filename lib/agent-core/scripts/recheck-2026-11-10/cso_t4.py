"""cso_t4.py <stage> <in snapshot.gz> <out snapshot.gz> <report dir> — CSO QA fixes on re-check t4 (2026-11-02). Facts only.
 cond    : Ron Hoover, Wilkins, Windish, Campers Inn, Raycitte: condition from the unit's own page heading (New/Used/Pre-Owned ...)
           and/or its listing URL path (/product/new-..., /new/, /used/...). Both stated and in conflict -> condition unknown.
           Neither stated -> unchanged. Never from title text alone.
 lots    : the lot the unit's own Interact page element states (ia/fix1_lot_differs_not_applied.csv of the re-check apply) is applied
           (incl. Funtown units stored at Hewitt TX). Lot names mapped: 'West Houston' -> Katy, TX; 'Budget Lot – St. Cloud' -> St. Cloud, MN.
 unknown : units whose lot city is blank/'Unknown': city from the unit's own page — Interact own element lot, else a single schema.org
           PostalAddress (locality+region) on the page, else the page <title> '| City, ST |' segment; the state must equal the stored
           state when one is stored. Nothing inferred from the dealer's other lots."""
import json,gzip,sys,os,re,csv,collections as C,html as H
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from parse_ia import parse
W='/workspace/harvest-recheck-2026-11-10'
stage,src,dst,rep=sys.argv[1:5]; os.makedirs(rep,exist_ok=True)
snap=json.load(gzip.open(src)); units=snap['units']
ST=set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())
LOTMAP={'west houston':('Katy','TX'),'budget lot – st. cloud':('St. Cloud','MN'),'budget lot - st. cloud':('St. Cloud','MN'),'budget lot st. cloud':('St. Cloud','MN')}
def slug(x): return re.sub(r'[^a-z0-9]+','-',x.lower()).strip('-')
def pages():
    pg={}
    for f in (f'{W}/fetch/results.ndjson',f'{W}/ia_apply/results.ndjson'):
        if not os.path.exists(f): continue
        for l in open(f):
            try: j=json.loads(l)
            except Exception: continue
            if j.get('result')=='ok' and j.get('page') and j.get('http')==200:
                for k in (j.get('finalUrl'),j['url']):
                    if k: pg[k]=j
    return pg
def page_text(j): return gzip.open(f"{W}/fetch/pages/{j['page']}.html.gz","rt",errors='replace').read()
STORES=C.defaultdict(C.Counter); SREC={}
for u in units:
    d=u['dealer']; k=(u['provenance']['dealerDomain'],(d['city'] or '').strip().lower(),(d['state'] or '').upper()); STORES[k][d['id']]+=1; SREC[(k,d['id'])]=d
created=[]
def store_for(u,city,state):
    dom=u['provenance']['dealerDomain']; k=(dom,city.strip().lower(),state.upper())
    if STORES.get(k): return dict(SREC[(k,STORES[k].most_common(1)[0][0])])
    sid=f'{dom}:{slug(city)}'
    if any(i==sid for (kk,i) in SREC if kk!=k): sid=f'{dom}:{slug(city)}-{state.lower()}'
    nd={**u['dealer'],'id':sid,'city':city.strip(),'state':state.upper(),'lat':None,'lng':None}; STORES[k][sid]+=1; SREC[(k,sid)]=nd
    created.append({'store_id':sid,'name':nd['name'],'city':nd['city'],'state':nd['state'],'first_unit':u['id']}); return nd
rows=[]; st=C.Counter()
if stage=='cond':
    D={'ronhooverrvs.com','wilkinsrv.com','windishrv.com','campersinn.com','raycitte.com'}; pg=pages()
    for u in units:
        if u['provenance']['dealerDomain'] not in D: continue
        url=u['provenance'].get('listingUrl') or ''
        m=re.search(r'/(?:product/)?(new|used|pre-owned)(?:[-/])',url.lower()); uc={'new':'new','used':'used','pre-owned':'used'}.get(m.group(1)) if m else None
        hc=None; j=pg.get(url)
        if j:
            t=page_text(j); e=parse(t,j.get('finalUrl') or j['url']); h1=e.get('h1') or ''
            if not h1:
                mh=re.search(r'(?is)<h1[^>]*>(.*?)</h1>',t); h1=re.sub(r'\s+',' ',H.unescape(re.sub(r'<[^>]+>',' ',mh.group(1)))).strip() if mh else ''
            mm=re.match(r'(?i)^(new|used|pre-owned|preowned)\b',h1); hc=('new' if mm.group(1).lower()=='new' else 'used') if mm else None
        if uc and hc and uc!=hc: new='unknown'; basis=f'heading {hc} vs URL {uc} conflict'
        elif uc or hc: new=hc or uc; basis='heading+URL' if (uc and hc) else ('heading' if hc else 'URL path')
        else: st['no_heading_no_url_unchanged']+=1; continue
        if new!=u['condition']:
            rows.append({'unit_id':u['id'],'dealer_domain':u['provenance']['dealerDomain'],'old':u['condition'],'new':new,'basis':basis,'source_url':url}); st[f"{u['condition']}->{new}"]+=1; u['condition']=new
        else: st['confirmed_'+new]+=1
elif stage=='lots':
    byid={u['id']:u for u in units}
    for r in csv.DictReader(open(os.environ['LOTDIFF'])):
        u=byid.get(r['unit_id'])
        if not u: st['unit_not_in_build']+=1; continue
        city,state=[x.strip() for x in r['page'].rsplit(',',1)]
        city,state=LOTMAP.get(city.lower(),(city,state))
        if state not in ST or not city: st['bad_page_lot']+=1; continue
        d=u['dealer']
        if (d['city'] or '').strip().lower()==city.lower() and (d['state'] or '').upper()==state: st['already']+=1; continue
        nd=store_for(u,city,state); rows.append({'unit_id':u['id'],'dealer_domain':u['provenance']['dealerDomain'],'old':f"{d['id']} | {d['city']}, {d['state']}",'new':f"{nd['id']} | {nd['city']}, {nd['state']}",'basis':"unit's own page element lot",'source_url':r['source_url']})
        u['dealer']=nd; st['lot_moved']+=1; st['interstate' if (d['state'] or '').upper()!=state else 'same_state']+=1
    # lot names on existing records
    for u in units:
        k=(u['dealer']['city'] or '').strip().lower()
        if k in LOTMAP:
            city,state=LOTMAP[k]; d=u['dealer']; nd=store_for(u,city,state); u['dealer']=nd; st['lot_name_mapped']+=1
            rows.append({'unit_id':u['id'],'dealer_domain':u['provenance']['dealerDomain'],'old':f"{d['id']} | {d['city']}, {d['state']}",'new':f"{nd['id']} | {city}, {state}",'basis':'lot name map (CSO)','source_url':''})
elif stage=='unknown':
    pg=pages()
    for u in units:
        d=u['dealer']; c=(d['city'] or '').strip()
        if c.lower() not in ('','unknown'): continue
        st['unknown_city']+=1; url=u['provenance'].get('listingUrl') or ''; j=pg.get(url)
        if not j: st['no_page_left_unknown']+=1; continue
        t=page_text(j); sst=(d['state'] or '').upper(); got=None
        e=parse(t,j.get('finalUrl') or j['url']) if '/product/' in url else {}
        if e.get('lot-city') and (e.get('lot-state') or '').upper() in ST: got=(e['lot-city'],e['lot-state'].upper(),'own page element lot')
        if not got:
            pairs={(a.strip(),b.strip().upper()) for a,b in re.findall(r'"addressLocality"\s*:\s*"([^"]+)"[^{}]{0,300}?"addressRegion"\s*:\s*"([A-Za-z]{2})"',t)}
            pairs|={(a.strip(),b.strip().upper()) for b,a in re.findall(r'"addressRegion"\s*:\s*"([A-Za-z]{2})"[^{}]{0,300}?"addressLocality"\s*:\s*"([^"]+)"',t)}
            if len(pairs)==1: a,b=next(iter(pairs)); got=(a,b,'schema.org PostalAddress (only one on the page)')
            elif len(pairs)>1: st['several_schema_addresses']+=1
        if not got:
            ti=re.search(r'(?is)<title[^>]*>(.*?)</title>',t)
            if ti:
                segs=[H.unescape(s).strip() for s in re.split(r'\s[|–-]\s',ti.group(1))]
                cs=[m for s in segs for m in [re.fullmatch(r"([A-Z][A-Za-z .'-]{1,40}),\s*([A-Z]{2})",s)] if m and m.group(2) in ST]
                if len(cs)==1: got=(cs[0].group(1),cs[0].group(2),'page title')
        if not got: st['page_states_no_lot']+=1; continue
        city,state,basis=got; city,state=LOTMAP.get(city.lower(),(city,state))
        if sst and sst!=state: st['state_conflict_left_unknown']+=1; continue
        nd=store_for(u,city,state); rows.append({'unit_id':u['id'],'dealer_domain':u['provenance']['dealerDomain'],'old':f"{d['id']} | {d['city']}, {d['state']}",'new':f"{nd['id']} | {city}, {state}",'basis':basis,'source_url':url})
        u['dealer']=nd; st['filled']+=1; st['filled_by_'+basis.split(' (')[0]]+=1
summ={'stage':stage,'steps':dict(st),'changes':len(rows),'storesCreated':len(created),'byDomain':dict(C.Counter(r['dealer_domain'] for r in rows).most_common(25))}
with open(f'{rep}/cso_t4_{stage}_changes.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=['unit_id','dealer_domain','old','new','basis','source_url']); w.writeheader(); w.writerows(rows)
with open(f'{rep}/cso_t4_{stage}_stores_created.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=['store_id','name','city','state','first_unit']); w.writeheader(); w.writerows(created)
json.dump(summ,open(f'{rep}/cso_t4_{stage}_summary.json','w'),indent=1); print(json.dumps(summ))
s=dict(snap['stats']); s.setdefault('recheck_2026_11_02_cso',{})[stage]=summ; s['dealers']=len({u['dealer']['id'] for u in units})
hdr={'schemaVersion':snap['schemaVersion'],'builtAt':snap['builtAt'],'datasetNote':snap['datasetNote'],'stats':s,'units':[]}
h=json.dumps(hdr,ensure_ascii=True,separators=(',',':'))
with gzip.open(dst+'.tmp','wb',compresslevel=9) as f:
    f.write(h[:-2].encode('ascii'))
    for i,u in enumerate(units): f.write((b',' if i else b'')+json.dumps(u,ensure_ascii=True,separators=(',',':')).encode('ascii'))
    f.write(b']}')
os.replace(dst+'.tmp',dst)

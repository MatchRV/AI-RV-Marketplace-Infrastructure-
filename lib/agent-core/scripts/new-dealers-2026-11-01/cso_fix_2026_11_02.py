"""cso_fix_2026_11_02.py <in_snapshot.gz> <out_snapshot.gz> <outdir>: CSO QA fixes on the WA batch (2026-11-02), facts-only.
1) Camper's Choice: each unit's own page "Status" row re-read 11/2: SOLD -> removed; ON ORDER -> held on_order; any other non-AVAILABLE -> held.
2) Interact dealers (Bretz, RnR): sale price $0/missing with only a List Price/MSRP -> held price_unverified (List/MSRP is never the price).
3) Fife RV Center: the page's structured Make field carries the series ("Forest River Forester", "East To West Alta", "Prime Time Avenger",
   "Salem FSX"); split to the manufacturer the dealer states on its other units, series moved to the model; a leading chassis name
   ("E-Series Cutaway") is dropped from the model (title unchanged).
4) Bretz WA units carried from #69 with lastSeen 10/7-10/11: own page re-read 11/2; live + active -> lastSeen/price/msrp from the page;
   sold/404/410 -> removed; no page found -> left to age out.
5) MAP rule: a unit whose own page shows a MAP price or an unlock-pricing form instead of a sale price -> held price_unverified.
   Tacoma RV Center: unit pages are client-rendered and state no price in the served page (price only via robots-disallowed /api/),
   so no Tacoma price can be verified on its own page -> all Tacoma units held price_unverified."""
import json,gzip,sys,os,csv,collections,datetime,re
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from facts import money
H='/workspace/harvest-2026-11-01'
src,dst,od=sys.argv[1:4]
S=json.load(gzip.open(src))
P=json.load(open(f'{H}/qa4/parsed.json'))
TP=json.load(open(f'{H}/qa4/tacoma_parsed.json')) if os.path.exists(f'{H}/qa4/tacoma_parsed.json') else {}
LISTONLY=set(json.load(open(f'{H}/qa4/interact_listonly.json')))
R1={json.loads(l)['key']:json.loads(l) for l in open(f'{H}/qa4/results_round1.ndjson')}
c=collections.Counter(); held=[]; removed=[]; changes=[]
def iso(s): return datetime.datetime.strptime(s,'%Y-%m-%dT%H:%M:%S%z').astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
def row(u,reason,url=None): return [u['id'],u['provenance']['dealerDomain'],u['title'],u.get('vin'),u['rvType'],(u.get('priceUsd') or {}).get('value'),reason,url or u['provenance'].get('listingUrl')]
FIFE_MAKES=['Forest River','East To West','East to West','Prime Time']
CHASSIS=re.compile(r'^(?:E-Series Cutaway|E-Series|Ford E-Series Cutaway|Transit|Sprinter|F-53|F53|Ram ProMaster|ProMaster)\s+',re.I)
out=[]
for u in S['units']:
    d=u['provenance'].get('dealerDomain'); k=u['id']
    if d=='camperschoicerv.com' and k in P:
        st=P[k]['status']
        if st==['SOLD']: removed.append(row(u,'page_status_SOLD_2026-11-02')); c['cc_sold_removed']+=1; continue
        if st==['ON ORDER']: held.append(row(u,'on_order (page status ON ORDER 2026-11-02)')); c['cc_on_order_held']+=1; continue
        if st!=['AVAILABLE']: held.append(row(u,f'page_status_{st}')); c['cc_other_held']+=1; continue
        c['cc_available_kept']+=1
    if k in LISTONLY:
        held.append(row(u,'price_unverified (Interact sale price $0; only List Price shown)')); c['interact_listonly_held']+=1; continue
    if d=='fifervcenter.com':
        mk=u['make'] or ''; base=next((m for m in FIFE_MAKES if mk.lower().startswith(m.lower()+' ')),None)
        if base:
            ser=mk[len(base):].strip(); mdl=CHASSIS.sub('',u['model'] or '')
            nm,nmo=('East To West' if base.lower()=='east to west' else base),f'{ser} {mdl}'.strip()
            changes.append([k,'make/model',f"{u['make']} / {u['model']}",f'{nm} / {nmo}','fife_make_series_split']); u['make'],u['model']=nm,nmo; c['fife_make_split']+=1
        elif mk=='Salem FSX':
            # page title (11/2) and the page's own 11/1 structured make (vehicle:make "Forest River") name the manufacturer
            changes.append([k,'make/model',f"{u['make']} / {u['model']}",f"Forest River / Salem FSX {u['model']}",'fife_series_in_make_field']); u['make'],u['model']='Forest River',f"Salem FSX {u['model']}"; c['fife_make_split']+=1
    if d=='bretzrv.com' and k in P and P[k]['kind']=='bretz16':
        e=P[k]; ia=e['ia']; cl=ia.get('_class') or ''
        if R1[k]['http'] in (404,410) or e['sold'] or 'sold-status' in cl or 'pending-status' in cl:
            removed.append(row(u,'bretz_old_page_sold_or_gone',e['final'])); c['bretz16_removed']+=1; continue
        sp=money(ia.get('saleprice'))
        if 'active-status' in cl and sp and sp>=1000:
            t=iso(e['at']); u['provenance']['lastSeenAt']=t; u['provenance']['listingUrl']=e['final']; u['provenance']['lastSeenBasis']='listing_page_read_2026_11_02'
            if u['priceUsd']['value']!=sp:
                changes.append([k,'priceUsd',u['priceUsd']['value'],sp,'bretz16_page_price_2026-11-02']); u['priceUsd']={**u['priceUsd'],'value':int(sp),'sourceUrl':e['final'],'note':"Dealer's current sale price from the listing page (read 2026-11-02); not MSRP."}
            ms=money(ia.get('msrp'))
            if ms and u['msrpUsd'].get('value') and abs(u['msrpUsd']['value']-ms)>=1:
                changes.append([k,'msrpUsd',u['msrpUsd']['value'],ms,'bretz16_page_list_price_2026-11-02']); u['msrpUsd']={**u['msrpUsd'],'value':int(ms)}
            c['bretz16_refreshed']+=1
        else: c['bretz16_left']+=1
    if d=='bretzrv.com' and k not in P and (u['dealer'].get('state')=='WA') and u['provenance'].get('lastSeenAt','')<'2026-11-01': c['bretz16_no_page_left_to_age_out']+=1
    if d=='tacomarv.com':
        e=TP.get(k)
        if e is None: held.append(row(u,'price_unverified (Tacoma RV: unit not in dealer sitemap 2026-11-02; no own page to verify price)')); c['tacoma_not_in_sitemap_held']+=1; continue
        if e.get('dollars'): c['tacoma_price_on_page_kept']+=1
        else: held.append(row(u,'price_unverified (Tacoma RV own page states no sale price; client-rendered, price only via robots-disallowed /api/)',e.get('url'))); c['tacoma_no_price_on_page_held']+=1; continue
    out.append(u)
bt=datetime.datetime.now(datetime.timezone.utc); BT=bt.strftime('%Y-%m-%dT%H:%M:%S.')+f'{bt.microsecond//1000:03d}Z'
ls=[datetime.datetime.fromisoformat(u['provenance']['lastSeenAt'].replace('Z','+00:00')) for u in out]
s=dict(S['stats']); s.update(units=len(out),dealers=len({u['dealer']['id'] for u in out}),uniqueVins=len({u['vin'] for u in out if u['vin']}),
  lastSeenRange={"oldest":min(ls).strftime("%Y-%m-%dT%H:%M:%S.000Z"),"newest":max(ls).strftime("%Y-%m-%dT%H:%M:%S.000Z")},
  seenWithinDaysOfBuiltAt={f"{d}d":sum(1 for x in ls if (bt-x).total_seconds()<=d*86400) for d in (14,21,30,45)},csoFixWA_2026_11_02=dict(c))
hdr={"schemaVersion":S["schemaVersion"],"builtAt":BT,"datasetNote":S["datasetNote"]+" Nov 2 CSO fixes (WA batch): Camper's Choice page status (sold removed, on-order held); Interact list-price-only units held; Fife make/series split; Bretz units carried from #69 re-read from their own pages; MAP/unlock-pricing rule (Tacoma RV units held: no sale price on their own pages).","stats":s,"units":[]}
h=json.dumps(hdr,ensure_ascii=True,separators=(",",":"))
with gzip.open(dst+".tmp","wb",compresslevel=9) as f:
    f.write(h[:-2].encode("ascii"))
    for i,u in enumerate(out): f.write((b"," if i else b"")+json.dumps(u,ensure_ascii=True,separators=(",",":")).encode("ascii"))
    f.write(b"]}")
os.replace(dst+".tmp",dst)
hd=['id','domain','title','vin','rvType','price','reason','listing_url']
for fn,rows in (('cso_fix_held.csv',held),('cso_fix_removed.csv',removed)):
    w=csv.writer(open(f'{od}/{fn}','w',newline='')); w.writerow(hd); w.writerows(rows)
w=csv.writer(open(f'{od}/cso_fix_changes.csv','w',newline='')); w.writerow(['id','field','old','new','rule']); w.writerows(changes)
summ=dict(c,builtAt=BT,units_in=len(S['units']),units_out=len(out)); json.dump(summ,open(f'{od}/cso_fix_summary.json','w'),indent=1); print(json.dumps(summ))

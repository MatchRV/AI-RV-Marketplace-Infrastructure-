"""build_dande.py: DandE RV Sales (danderv.com, Tacoma WA) harvest 2026-11-02, facts-only.
Inputs: cat/*.conn.html (dealer category listings via the site's own connector.html), mk/*.html (make-filtered listings, used to
reach units past page 1), units/*.html (each unit's own page). Output: dande_units.json, dande_held.csv, dande_summary.json."""
import re,html,json,glob,base64,os,csv,gzip,collections
FETCHED=open('units/FETCHED_AT').read().strip()
CATS=[('Motorhomes','Motorhomes'),('TravelTrailers','Travel Trailers'),('5thWheels','5th Wheels'),('Toyhaulers','Toyhaulers')]
cat={}; listed=collections.Counter()
for f,c in CATS:
    s=open(f'cat/{f}.conn.html',encoding='latin-1').read()
    listed[c]=int(re.search(r'Found (\d+) vehicles',s).group(1))
    for i in set(re.findall(r'vehicle_id=([^"&\']+)',s)): cat[base64.b64decode(i).decode()]=c
# listing rows (stock #, listing price text, NADA) from every listing page we fetched
lst={}
for f in glob.glob('cat/*.conn.html')+glob.glob('mk/*.html'):
    s=open(f,encoding='latin-1').read()
    for blk in re.split(r'(?=<a href="\./view_vehicle\.html\?vehicle_id=)',s)[1:]:
        i=base64.b64decode(re.match(r'<a href="\./view_vehicle\.html\?vehicle_id=([^"&]+)',blk).group(1)).decode()
        t=' '.join(html.unescape(re.sub(r'<[^>]+>',' ',blk.split('view_vehicle.html?vehicle_id=',2)[-1] if blk.count('view_vehicle')>2 else blk)).split())
        m=re.search(r'Stock#\s*(\S+)',t); n=re.search(r'NADA:\s*\$([\d,]+)',t)
        e=lst.setdefault(i,{})
        if m: e['stock']=m.group(1)
        if n: e['nada']=int(n.group(1).replace(',',''))
        if 'Please Call For Price' in t: e['cfp']=True
NONRV=re.compile(r'\b(Motorcycle|Slingshot|Sportbike|ATV|UTV|Jet ?ski|Boat)\b',re.I)
units=[]
for f in sorted(glob.glob('units/*.html'),key=lambda p:int(os.path.basename(p)[:-5])):
    n=os.path.basename(f)[:-5]; raw=open(f,encoding='latin-1').read()
    s=re.sub(r'(?is)<script.*?</script>|<style.*?</style>','',raw)
    L=[l.strip() for l in html.unescape(re.sub(r'<[^>]+>','\n',s)).split('\n') if l.strip()]
    def fld(lbl):
        try: k=L.index(lbl); v=L[k+1]; return '' if v.endswith(':') else v
        except (ValueError,IndexError): return ''
    ym=fld('Year / Make:'); m=re.match(r'(\d{4})\s+(.*)',ym)
    vin=fld('VIN:'); vin17=vin if re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',vin or '') else None
    head=' '.join(L[1:6]); price_txt='Please Call For Price' if 'Please Call For Price' in head else None
    pm=re.search(r'\$\s?([\d,]{3,})',head)
    imgs=re.findall(r'(https?://images\.dealershipids\.com/danderv/img/[^"\' ]+)',raw)
    title=L[1]
    u=dict(dealerVehicleId=n,url='https://danderv.com/view_vehicle.html?vehicle_id='+base64.b64encode(n.encode()).decode(),
        title=title,dealerCategory=cat.get(n),year=int(m.group(1)) if m else None,make=m.group(2).strip() if m else None,model=None,
        vin=vin17,vinFieldRaw=vin or None,stock=lst.get(n,{}).get('stock'),mileage=fld('Mileage:'),exteriorColor=fld('Exterior Color:'),
        interiorColor=fld('Interior Color:'),transmission=fld('Transmission:'),engine=fld('Engine-Size:'),
        pagePriceText=price_txt,pageSalePrice=int(pm.group(1).replace(',','')) if pm else None,listingNADA=lst.get(n,{}).get('nada'),
        photo=imgs[0] if imgs else None,photos=len(set(imgs)),statusOnPage=('SOLD' if re.search(r'\bSOLD\b',head) else 'PENDING' if re.search(r'sale pending',head,re.I) else 'ON ORDER' if re.search(r'on order',head,re.I) else 'not stated (listed)'),
        lastSeenPT=FETCHED,dealer=dict(name='DandE RV Sales',address='11707 Pacific Ave S',city='Tacoma',state='WA',zip='98444',phone='(253) 537-0271',domain='danderv.com'))
    if NONRV.search(title) or (u['make'] in ('Polaris','Yamaha') and not u['dealerCategory']): u['decision']='skipped_not_rv'; u['reason']='not in an RV category (motorcycle/Slingshot)'
    elif u['statusOnPage']=='SOLD': u['decision']='removed'; u['reason']='page says SOLD'
    elif u['statusOnPage'] in ('PENDING','ON ORDER'): u['decision']='held'; u['reason']='status '+u['statusOnPage']
    elif not u['pageSalePrice']: u['decision']='held'; u['reason']='price_unverified: page says "Please Call For Price"; only a NADA book value on the listing (NADA is never the price)'
    else: u['decision']='candidate'; u['reason']=''
    if not u['dealerCategory'] and u['decision']!='skipped_not_rv': u['typeNote']='dealer category not confirmed (unit is on page 2 of Travel Trailers or 5th Wheels; the site\'s page-2 request returns 0 vehicles)'
    units.append(u)
snap=json.load(gzip.open('/workspace/wt-nd/lib/agent-core/data/inventory.snapshot.json.gz'))
V={(x.get('vin') or '').upper() for x in snap['units'] if x.get('vin')}
D=[x for x in snap['units'] if (x.get('provenance') or {}).get('dealerDomain')=='danderv.com']
for u in units: u['vinInSnapshot']=bool(u['vin'] and u['vin'].upper() in V)
json.dump(units,open('dande_units.json','w'),indent=1)
rv=[u for u in units if u['decision']!='skipped_not_rv']
with open('dande_held.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['dealer_vehicle_id','url','title','dealer_category','year','make','vin','stock','page_price_text','listing_nada','photo','decision','reason','last_seen_pt'])
    for u in rv: w.writerow([u['dealerVehicleId'],u['url'],u['title'],u['dealerCategory'] or '(TT or 5W page 2, unconfirmed)',u['year'],u['make'],u['vin'] or u['vinFieldRaw'] or '',u['stock'] or '',u['pagePriceText'] or u['pageSalePrice'],u['listingNADA'] or '',u['photo'],u['decision'],u['reason'],u['lastSeenPT']])
S=dict(dealer='DandE RV Sales',domain='danderv.com',fetchedPT=FETCHED,robots='robots.txt 404 (no rules)',dealerListedCounts=dict(listed),
  unitPagesFetched=len(units),rvUnits=len(rv),skippedNonRv=[(u['dealerVehicleId'],u['title']) for u in units if u['decision']=='skipped_not_rv'],
  decisions=dict(collections.Counter(u['decision'] for u in rv)),byDealerCategory=dict(collections.Counter(u['dealerCategory'] or 'unconfirmed (TT/5W page 2)' for u in rv)),
  withVin17=sum(1 for u in rv if u['vin']),vinDupOfSnapshot=sum(1 for u in rv if u['vinInSnapshot']),danderAlreadyInSnapshot=len(D),
  added=sum(1 for u in rv if u['decision']=='candidate'))
json.dump(S,open('dande_summary.json','w'),indent=1); print(json.dumps(S,indent=1))

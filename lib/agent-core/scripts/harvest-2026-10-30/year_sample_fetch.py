import json,re,time,urllib.request,html as H,collections
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0)"
samp=json.load(open('sample.json')); last=collections.defaultdict(float); walled=set(); out=[]
for e in samp:
    h=re.match(r'https?://([^/]+)',e['url']).group(1)
    if h in walled: e['status']='skipped_wall'; out.append(e); continue
    w=1.5-(time.time()-last[h]); 
    if w>0: time.sleep(w)
    try:
        r=urllib.request.urlopen(urllib.request.Request(e['url'],headers={'User-Agent':UA}),timeout=30); t=r.read().decode('utf-8','replace'); e['http']=r.status; e['final_url']=r.geturl()
    except Exception as x:
        e['http']=getattr(x,'code',str(x)); t=''
    last[h]=time.time()
    if re.search(r'cf-chl|Just a moment|Attention Required|px-captcha|Access Denied',t): walled.add(h); e['status']='bot_wall'; out.append(e); continue
    open('pages/'+e['id'].replace('/','_')+'.html','w').write(t)
    ti=re.search(r'<title[^>]*>(.*?)</title>',t,re.S); h1=re.search(r'<h1[^>]*>(.*?)</h1>',t,re.S)
    e['page_title']=H.unescape(re.sub('<[^>]+>','',ti.group(1))).strip()[:150] if ti else None
    e['h1']=H.unescape(re.sub('<[^>]+>',' ',h1.group(1))).strip()[:150] if h1 else None
    vins=set(re.findall(r'\b[A-HJ-NPR-Z0-9]{17}\b',t))
    e['our_vin_on_page']=e['vin'] in t
    e['other_vins']=sorted(v for v in vins if v!=e['vin'] and re.search(r'\d',v) and re.search(r'[A-Z]',v))[:5]
    for st in filter(None,[e.get('stock'),e.get('desc_stock')]):
        e['stock_on_page_'+st]=bool(re.search(r'\b'+re.escape(st)+r'\b',t,re.I))
    ld=re.findall(r'"(?:vehicleModelDate|modelDate|productionDate|model_year|modelYear|year)"\s*:\s*"?(\d{4})',t)
    e['ld_years']=collections.Counter(ld).most_common(4)
    m=re.search(r'\b(19[89]\d|20[0-3]\d)\b',e['h1'] or e['page_title'] or ''); e['page_year']=int(m.group(1)) if m else None
    e['status']='ok'; out.append(e)
    print(e['dealer'],e['http'],'stored',e['stored'],'vin',e['vin_year'],'page',e['page_year'],'vin_on_page',e['our_vin_on_page'],(e['h1'] or e['page_title'] or '')[:70],flush=True)
json.dump(out,open('sample_results.json','w'),indent=1)

import json,random,re,time,csv,html,urllib.parse,requests
UA="Mozilla/5.0 (compatible; MatchRV-InventoryPilot/0.2; +https://matchrv.com; jonathan@matchrv.com)"
rows=[json.loads(l) for l in open('import_candidate_rows.ndjson')]
random.seed(20261109); S=random.sample(rows,20)
bare=lambda d:re.sub(r'/.*$','',re.sub(r'^www\.','',re.sub(r'^https?://','',(d or '').lower())))
an=lambda s:re.sub(r'[^a-z0-9]','',str(s or '').lower())
out=[]
for r in S:
    rec={'domain':r['dealer_domain'],'state':r['_meta']['dealer']['state'],'title':r['title'],'stock':r['stock_number'],'vin':r['vin'],'price':r['price'],'url':r['url']}
    try:
        g=requests.get(r['url'],headers={'User-Agent':UA},timeout=30,allow_redirects=True); t=g.text
        rec['http']=g.status_code; rec['final_domain_ok']=bare(g.url).endswith(r['dealer_domain'])
        T=an(html.unescape(t))
        rec['year_on_page']=str(r['year']) in t
        mtok=[w for w in re.findall(r'[A-Za-z0-9]{3,}',r['model'])][:1]
        rec['model_on_page']=all(an(w) in T for w in mtok) if mtok else None
        rec['id_on_page']=(an(r['stock_number']) in T if r['stock_number'] else False) or (an(r['vin']) in T if r['vin'] else False)
        if r['price']:
            p=int(r['price']); rec['price_on_page']=(f"{p:,}" in t) or (str(p) in t)
        else: rec['price_on_page']=None
        sold=re.search(r'(?i)\b(sold|sale pending|no longer available)\b',re.sub(r'<[^>]+>',' ',t)[:200000])
        rec['sold_word_on_page']=bool(sold)
        imgs=set(re.findall(r'https?://[^"\'\s>]+?\.(?:jpe?g|png|webp)',t,re.I))
        og=re.findall(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',t,re.I)
        rec['og_image']=bool(og); rec['image_urls_on_page']=len(imgs)
    except Exception as e:
        rec['http']=f'ERR {type(e).__name__}'
    ok=rec.get('http')==200 and rec.get('final_domain_ok') and rec.get('year_on_page') and rec.get('model_on_page') is not False and rec.get('id_on_page') and rec.get('price_on_page') is not False
    rec['pass']=bool(ok); out.append(rec); print(json.dumps(rec)[:400],flush=True); time.sleep(2.5)
with open('spot_check_20.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(dict.fromkeys(k for r in out for k in r))); w.writeheader(); w.writerows(out)
print('PASS',sum(r['pass'] for r in out),'/',len(out))

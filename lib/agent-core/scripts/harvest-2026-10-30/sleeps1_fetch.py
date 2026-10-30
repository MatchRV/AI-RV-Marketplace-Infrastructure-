import json,re,time,urllib.request,html as H,collections,urllib.robotparser as RP
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0)"
T=json.load(open('sleeps1_targets.json')); last=collections.defaultdict(float); rob={}; out=[]
for e in T:
    h=re.match(r'https?://([^/]+)',e['url']).group(1)
    if h not in rob:
        r=RP.RobotFileParser(); 
        try:
            r.parse(urllib.request.urlopen(urllib.request.Request(f'https://{h}/robots.txt',headers={'User-Agent':UA}),timeout=20).read().decode('utf-8','replace').splitlines())
        except Exception: r.parse([])
        rob[h]=r; last[h]=time.time()
    if not rob[h].can_fetch(UA,e['url']): e['res']='robots_disallow'; out.append(e); continue
    w=1.5-(time.time()-last[h]); time.sleep(max(0,w))
    try: t=urllib.request.urlopen(urllib.request.Request(e['url'],headers={'User-Agent':UA}),timeout=30).read().decode('utf-8','replace'); e['res']='ok'
    except Exception as x: t=''; e['res']=str(getattr(x,'code',x))
    last[h]=time.time()
    if re.search(r'cf-chl|Just a moment|px-captcha',t): e['res']='bot_wall'; t=''
    txt=re.sub(r'\s+',' ',H.unescape(re.sub(r'<[^>]+>',' ',t)))
    e['page_sleeps']=sorted(set(re.findall(r'(?i)sleeps?\s*(?:up to\s*)?:?\s*(\d{1,2})\b',txt)))
    e['ld_sleeps']=re.findall(r'(?i)"(?:sleeps|sleepCapacity|max_sleeping_count)"\s*:\s*"?(\d+)',t)
    print(e['res'],e['page_sleeps'],e['ld_sleeps'][:3],e['url'][:90],flush=True); out.append(e)
json.dump(out,open('sleeps1_results.json','w'),indent=0)

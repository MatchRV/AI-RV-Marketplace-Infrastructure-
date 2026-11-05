import json,time,gzip,hashlib,sys,requests,urllib.robotparser as rp,collections
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0; +https://matchrv.com)"
T=[t for t in json.load(open('qa4/targets.json')) if t['url']]
R={}; last=collections.defaultdict(float); out=open('qa4/results.ndjson','a')
done={json.loads(l)['url'] for l in open('qa4/results.ndjson')} if True else set()
S=requests.Session(); S.headers['User-Agent']=UA
def wait(h):
    d=time.time()-last[h]
    if d<1.6: time.sleep(1.6-d)
    last[h]=time.time()
for t in T:
    u=t['url']; h=u.split('/')[2]
    if u in done: continue
    if h not in R:
        r=rp.RobotFileParser(); wait(h)
        try: x=S.get(f'https://{h}/robots.txt',timeout=30); r.parse(x.text.splitlines()) if x.status_code==200 else r.parse([])
        except Exception as e: r.parse([])
        R[h]=r
    if not R[h].can_fetch(UA,u): out.write(json.dumps(dict(t,res='robots_disallow'))+'\n'); continue
    wait(h)
    try:
        x=S.get(u,timeout=40,allow_redirects=True)
        body=x.text; wall=('Just a moment' in body[:5000]) or x.headers.get('cf-mitigated')
        p=hashlib.sha1(u.encode()).hexdigest(); gzip.open(f'qa4/pages/{p}.html.gz','wt').write(body)
        out.write(json.dumps(dict(t,res='ok',http=x.status_code,final=x.url,page=p,wall=bool(wall),at=time.strftime('%Y-%m-%dT%H:%M:%S%z')))+'\n')
        if wall or x.status_code in (403,429): print('STOP host',h,x.status_code); R[h]=None; break
    except Exception as e: out.write(json.dumps(dict(t,res='err',err=str(e)[:200]))+'\n')
    out.flush()
print('done')

"""loc_parse.py [dir...]: per-unit lot from the unit's own page (tools/lotparse.py) -> <dir>/lots.json"""
import json,gzip,sys,os,collections
sys.path.insert(0,os.path.dirname(__file__)); from lotparse import lot_from_page, page_msrps
for D in (sys.argv[1:] or ['loc','loc2']):
    T={json.loads(l)['url']:json.loads(l) for l in open(f'{D}/targets.ndjson')}; out={}
    for l in open(f'{D}/results.ndjson'):
        r=json.loads(l); url=r['url']; t=T.get(url)
        if not t: continue
        if r.get('result')!='ok' or not r.get('page'): out[url]={'fetch':r.get('result'),'http':r.get('http')}; continue
        h=gzip.open(f'{D}/pages/%s.html.gz'%r['page']).read().decode('utf8','replace')
        res=lot_from_page(t['domain'],url,h)
        out[url]={'city':res[0],'state':res[1],'evidence':res[2]} if res else {'hold':'lot_not_on_page'}
        out[url]['pageMsrps']=page_msrps(h)
    json.dump(out,open(f'{D}/lots.json','w'),indent=0)
    c=collections.Counter((T[u]['domain'],v.get('city'),v.get('state'),v.get('hold') or v.get('fetch')) for u,v in out.items())
    print('==',D)
    for k,n in sorted(c.items(),key=lambda x:(x[0][0],-x[1])): print(n,k)

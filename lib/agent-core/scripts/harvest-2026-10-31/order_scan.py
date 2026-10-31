"""order_scan.py: for every stored listing page, the unit's own short texts that can carry an order/arrival notice:
og:title, <title>, h1, Interact unit tags of the own detail block (alt of unit_tag images up to the share buttons),
the own "sales-pitch" banner, and the Stealth/Next lot status + photo badge. Writes order_scan.ndjson."""
import json,gzip,re,os,sys,html as H
from multiprocessing import Pool
B='/workspace/harvest-2026-10-31'
DIRS=['pa','ib','ib2','oc/run','ib3a','ib3b','ib4','ib5g','ib5n','ib6','loc','loc2','mlot6','reg6']
def one(a):
    url,path=a
    try: t=gzip.open(path).read().decode('utf8','replace')[:700000]
    except Exception: return None
    g=lambda r: (lambda m: H.unescape(re.sub(r'<[^>]+>',' ',m.group(1))).strip()[:200] if m else None)(re.search(r,t,re.I|re.S))
    o={'u':url,'og':g(r'<meta[^>]+property="og:title"[^>]+content="([^"]*)"'),'title':g(r'<title[^>]*>(.*?)</title>'),'h1':g(r'<h1[^>]*>(.*?)</h1>'),
       'pitch':g(r'class="sales-pitch[^"]*">(.*?)</div>'),'lot':g(r'\blot_?[sS]tatus\\?"\s*:\s*\\?"([^"\\]{2,40})')}
    ds=t.find('detail-share')
    tags=[]
    if ds>0:
        blk=t[max(0,ds-4000):ds]
        tags=[H.unescape(x).strip() for x in re.findall(r'unit_tag/[^"]*"\s*alt="([^"]{2,60})"',blk)]
    m=re.search(r'class="absolute bottom-3 right-3">\s*<div[^>]*>((?:\s*<span[^>]*>[^<]{2,40}</span>)+)',t)
    o['tags']=tags+([H.unescape(b).strip() for b in re.findall(r'>([^<]{2,40})</span>',m.group(1))] if m else [])
    return o
if __name__=='__main__':
    W=[]
    for D in DIRS:
        f=f'{B}/{D}/results.ndjson'
        if not os.path.exists(f): continue
        for l in open(f):
            j=json.loads(l)
            if j.get('page') and j.get('result')=='ok': W.append((j['url'],f"{B}/{D}/pages/{j['page']}.html.gz"))
    print(len(W),flush=True)
    with Pool(8) as p, open(f'{B}/order_scan.ndjson','w') as out:
        for i,o in enumerate(p.imap_unordered(one,W,chunksize=200)):
            if o: out.write(json.dumps(o)+'\n')
            if i%20000==0: print(i,flush=True)
    open(f'{B}/order_scan.DONE','w').write('ok')

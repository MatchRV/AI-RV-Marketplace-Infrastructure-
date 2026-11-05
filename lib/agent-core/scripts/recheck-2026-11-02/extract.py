"""extract.py <fetch dir>: incremental extraction of fetched pages (resumable; cache by key+page).
 cw  -> pagepass parse.cw      -> extracted_cw.ndjson   (input to apply_pp2.py)
 gen -> parse_generic.parse    -> extracted_gen.ndjson
 ia  -> parse_ia.parse (own unit element) + title -> extracted_ia.ndjson (VIN / stock / badges for matching, fix1.py reads raw pages itself)"""
import json,gzip,sys,os,re
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
D=sys.argv[1]; os.environ['PP_DIR']=D
import pp_parse, parse_generic as PG, parse_ia as PI
from multiprocessing import Pool
def work(a):
    r=a
    try:
        t=gzip.open(f"{D}/pages/{r['page']}.html.gz","rt",errors="replace").read()
        if r['kind']=='cw': x=pp_parse.cw(t,r)
        elif r['kind']=='gen': x=PG.parse(t,r)
        else:
            x=PI.parse(t,r.get('finalUrl') or r['url']); ti=re.search(r'(?is)<title[^>]*>(.*?)</title>',t); x['title']=PG.txt(ti.group(1))[:200] if ti else None
            x['vinsOnPage']=sorted(set(re.findall(r'\b[A-HJ-NPR-Z0-9]{17}\b',t)))[:10]
    except Exception as ex: x={"parseError":str(ex)[:200]}
    return json.dumps({**r,"x":x})+"\n"
def main():
    rows={}
    for l in open(f"{D}/results.ndjson"):
        try: j=json.loads(l)
        except Exception: continue
        rows[j['key']]=j      # last line wins (retries)
    outs={k:f"{D}/extracted_{k}.ndjson" for k in ('cw','gen','ia')}
    prev={k:{} for k in outs}
    for k,p in outs.items():
        if os.path.exists(p):
            for l in open(p):
                try: j=json.loads(l)
                except Exception: continue
                prev[k][(j['key'],j.get('page'),j.get('fetchedAt'))]=l
    todo=[]; lines={k:[] for k in outs}
    for key,r in rows.items():
        k=r['kind']
        c=prev[k].get((key,r.get('page'),r.get('fetchedAt')))
        if c: lines[k].append(c); continue
        if r.get('result')!='ok': lines[k].append(json.dumps({**r,"x":None})+"\n"); continue
        todo.append(r)
    with Pool(int(os.environ.get('PARSE_PROCS','4'))) as pool:
        for line in pool.imap_unordered(work,todo,chunksize=40):
            lines[json.loads(line)['kind']].append(line)
    for k,p in outs.items():
        with open(p+'.tmp','w') as f: f.writelines(lines[k])
        os.replace(p+'.tmp',p)
    print({k:len(v) for k,v in lines.items()},'new',len(todo))
main()

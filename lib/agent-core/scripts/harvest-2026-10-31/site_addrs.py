"""site_addrs.py <dir> : per domain, the distinct "City, ST 12345" addresses printed on its fetched pages (visible text,
up to 25 pages). Used to accept a dealer's single address only when its own pages show exactly one lot city."""
import json,sys,gzip,re,collections,random,os
sys.path.insert(0,os.path.dirname(__file__)); from parse_generic import strip_blocks, txt
D=sys.argv[1]; by=collections.defaultdict(list)
T={}
if os.path.exists(f'{D}/targets.ndjson'):
    for l in open(f'{D}/targets.ndjson'):
        t=json.loads(l); T[t['key']]=t
for l in open(f'{D}/results.ndjson'):
    j=json.loads(l)
    if j.get('result')=='ok' and j.get('page'):
        d=(T.get(j['key']) or {}).get('domain') or re.sub(r'^www\.','',j['url'].split('/')[2])
        by[d].append(j['page'])
ST=set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
out={}
random.seed(7)
for d,ps in by.items():
    ps=random.sample(ps,min(25,len(ps))); cities=collections.Counter()
    for p in ps:
        try: t=gzip.open(f'{D}/pages/{p}.html.gz').read().decode('utf8','replace')
        except Exception: continue
        v=txt(strip_blocks(t[:800000]))
        for c,s,z in re.findall(r'(?:^|[\s,])([A-Z][a-z]+(?: [A-Z][a-z]+){0,2}),?\s+([A-Z]{2})\.?\s+(\d{5})(?:-\d{4})?\b',v):
            if s in ST: cities[(c,s)]+=1
    out[d]={'pages':len(ps),'cities':[[c,s,n] for (c,s),n in cities.most_common(12)]}
json.dump(out,open(f'{D}/site_addrs.json','w'),indent=0)
print(len(out))

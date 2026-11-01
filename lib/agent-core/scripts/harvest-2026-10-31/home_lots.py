"""home_lots.py <dir> : lot street addresses printed on each dealer's homepage (visible text and schema.org
PostalAddress). Writes <dir>/home_lots.json {domain: [[street, city, state, zip], ...]}. Facts only: a lot is listed
only when the page prints a street address with city, state and ZIP."""
import json,sys,gzip,re,os,html as H
sys.path.insert(0,os.path.dirname(__file__)); from parse_generic import strip_blocks, txt
D=sys.argv[1]
ST=set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
T={json.loads(l)['key']:json.loads(l) for l in open(f'{D}/targets.ndjson')}
out={}
ADDR=re.compile(r'\b(\d{1,6}(?:\s+[NSEW]\.?)?(?:\s+[A-Z0-9][A-Za-z0-9.\'#-]*){1,6}?(?:\s+(?:Rd|Road|St|Street|Ave|Avenue|Hwy|Highway|Blvd|Boulevard|Dr|Drive|Pkwy|Parkway|Ln|Lane|Way|Ct|Court|Cir|Circle|Pl|Place|Trl|Trail|Pike|Fwy|Freeway|Loop|Route|Rte|Expy|Expressway|Ter|Terrace)\.?)?(?:\s+(?:[NSEW]|North|South|East|West|Suite \w+|Ste\.? \w+|#\s?\w+))*)\s*,?\s+([A-Z][a-zA-Z.\']+(?: [A-Z][a-zA-Z.\']+){0,2}),?\s+([A-Z]{2})\.?\s+(\d{5})(?:-\d{4})?\b')
for l in open(f'{D}/results.ndjson'):
    j=json.loads(l)
    if j.get('result')!='ok' or not j.get('page'): continue
    d=T[j['key']]['domain']
    t=gzip.open(f'{D}/pages/{j["page"]}.html.gz').read().decode('utf8','replace')
    v=txt(strip_blocks(t[:1500000]))
    lots={}
    prev=0
    for m in ADDR.finditer(v):
        st,c,s,z=m.groups()
        seg=v[max(prev,m.start()-90):m.start()]; prev=m.end()
        if s not in ST: continue
        # an address the page labels as service/parts only is not a sales lot
        svc=bool(re.search(r'(?i)service cent(?:er|re)|service only|parts (?:&|and) service only|service department|service facility|service location|service shop|parts store|world parts',seg))
        k=(c.strip(),s)
        if k in lots: lots[k][4]='service_only' if svc or lots[k][4]=='service_only' else 'sales'
        else: lots[k]=[st.strip(),c.strip(),s,z,'service_only' if svc else 'sales']
    for m in re.finditer(r'"streetAddress"\s*:\s*"([^"]{3,80})"[^{}]{0,300}?"addressLocality"\s*:\s*"([^"]{2,40})"[^{}]{0,200}?"addressRegion"\s*:\s*"([A-Za-z]{2})"[^{}]{0,200}?"postalCode"\s*:\s*"(\d{5})',t):
        st,c,s,z=[H.unescape(g) for g in m.groups()]
        if s.upper() in ST: lots.setdefault((c.strip(),s.upper()),[st.strip(),c.strip(),s.upper(),z,'sales'])
    out[d]=list(lots.values())
json.dump(out,open(f'{D}/home_lots.json','w'),indent=0)
print(len(out),sum(len(v)>=2 for v in out.values()))

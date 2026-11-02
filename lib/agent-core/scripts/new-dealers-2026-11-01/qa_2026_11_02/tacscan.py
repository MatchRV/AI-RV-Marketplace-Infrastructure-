import json,gzip,re,collections,sys
c=collections.Counter(); out={}
for l in open('qa4/results.ndjson'):
  r=json.loads(l)
  if r.get('res')!='ok': c['res_'+r.get('res','?')]+=1; out[r['key']]=dict(state='fetch_'+r.get('res','?')); continue
  h=gzip.open(f"qa4/pages/{r['page']}.html.gz",'rt').read()
  dollars=re.findall(r'\$\s?\d{1,3}(?:,\d{3})+',h)
  st=re.findall(r'(?i)\b(sold|sale pending|on order|in transit)\b',re.sub(r'(?s)<script.*?</script>','',h))
  csr='BAILOUT_TO_CLIENT_SIDE_RENDERING' in h
  canon=re.findall(r'<link rel="canonical" href="([^"]+)"',h)
  stock=re.search(r'Stock #(\w+)',h)
  k=(r['http'],csr,bool(dollars),bool(re.search(r'\bMAP\b',h)),bool(re.search(r'(?i)unlock',h)))
  c[k]+=1
  out[r['key']]=dict(http=r['http'],csr=csr,dollars=dollars[:3],stock=stock.group(1) if stock else None,final=r['final'],at=r['at'],url=r['url'])
print(c); json.dump(out,open('qa4/tacoma_parsed.json','w'))

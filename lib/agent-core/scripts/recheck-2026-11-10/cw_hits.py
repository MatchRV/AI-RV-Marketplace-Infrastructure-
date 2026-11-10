"""cw_hits.py: parse stored CW listing pages (cw_search/pages) into per-unit records in apply_pp2's cw format (extracted_cw.ndjson lines),
one per snapshot unit whose stored stock equals a listed hit's stockNumber. Source = CW's own server-rendered listing hits (webStatus live,
clearPrice.salePrice / msrp, dealer city/state, chassisNumber). A hit with isOnOrder true is emitted as unavailable (onUnitPage False) so it is not refreshed."""
import os
import json,gzip,re,sys,glob,collections as C
W='/workspace/harvest-recheck-2026-11-10'
snap=json.load(gzip.open(os.environ.get('BASE',f'{W}/out/base_main_e2e411b.snapshot.json.gz')))
bystock=C.defaultdict(list)
for u in snap['units']:
    if u['provenance']['dealerDomain']=='rv.campingworld.com' and u.get('stockNumber'): bystock[str(u['stockNumber']).lower()].append(u)
fet={}
for l in open(f'{W}/cw_search/fetch.ndjson'):
    j=json.loads(l); fet[j['page']]=j
hits={}
for p,j in sorted(fet.items()):
    if j.get('result')!='ok': continue
    t=gzip.open(f"{W}/cw_search/pages/p{p}.html.gz","rt").read().replace('\\"','"')
    for m in re.finditer(r'\{"__typename":"RecommendAsset".*?"assetSlug":"([^"]+)"',t):
        # each hit object runs to the next RecommendAsset marker
        pass
    starts=[m.start() for m in re.finditer(r'\{"__typename":"RecommendAsset"',t)]
    for i,s0 in enumerate(starts):
        blk=t[s0:(starts[i+1] if i+1<len(starts) else s0+9000)][:9000]
        g=lambda k,pat=r'"([^"]*)"': (re.search(r'"'+k+'":'+pat,blk) or [None,None])[1]
        stock=g('stockNumber'); 
        if not stock: continue
        num=lambda k:(lambda x: float(x) if x not in (None,'null') else None)((re.search(r'"'+k+r'":(null|[0-9.]+)',blk) or [None,None])[1])
        cp=re.search(r'"clearPrice":\{"__typename":"ClearPrice","price":(null|[0-9.]+),"salePrice":(null|[0-9.]+),"msrp":(null|[0-9.]+)',blk)
        hits[stock.lower()]={'stock':stock,'slug':g('assetSlug'),'year':int(num('year') or 0),'condition':g('condition'),'webStatus':g('webStatus'),'assetStatus':g('assetStatus'),
          'onOrder':'"isOnOrder":true' in blk,'vin':(g('chassisNumber') or '').upper(),'make':g('make'),'model':g('model'),'city':g('billingCity'),'state':g('billingStateCode'),
          'cp':[None if x=='null' else float(x) for x in cp.groups()] if cp else None,'fetchedAt':fet[p]['fetchedAt'],'page':p}
n=C.Counter(); out=[]
for sk,h in hits.items():
    for u in bystock.get(sk,[]):
        if h['vin'] and u.get('vin') and h['vin']!=u['vin'].upper(): n['vin_conflict']+=1; continue
        live=h['webStatus']=='live' and h['assetStatus'] in ('a',None) and not h['onOrder']
        if not live: n['listed_but_not_live_or_on_order_no_change']+=1; continue
        slug=h['slug']; name=' '.join(t for t in slug.split('-') if t!=h['stock'].lower() and t!=(h['city'] or '').lower() and t not in (h['state'] or '').lower().split())
        sale=h['cp'][1] if h['cp'] else None; msrp=h['cp'][2] if h['cp'] else None
        x={'onUnitPage':bool(live),'h1Stock':h['stock'],'ldSku':h['stock'],'ldVin':h['vin'] or None,'ldYear':h['year'],'h1Year':h['year'],'ldName':name,'h1':name,'ldUrl':f"https://rv.campingworld.com/rv/{slug}",
           'h1Condition':h['condition'],'ldCondition':h['condition'],'h1City':h['city'],'h1State':h['state'],'ldPrice':sale,'visiblePrice':sale,'cpSale':sale,'cpMsrp':msrp,'cpPrice':h['cp'][0] if h['cp'] else None,
           'ldAvailability':'InStock' if live else 'OutOfStock','salePendingText':False,'source':'cw_listing_hit'}
        out.append({'key':f"cw|{u['id']}|{h['stock']}",'kind':'cw','url':f"https://rv.campingworld.com/rv/{slug}",'host':'rv.campingworld.com','result':'ok','http':200,'finalUrl':f"https://rv.campingworld.com/rv/{slug}",'fetchedAt':h['fetchedAt'],'page':None,'x':x})
        n['unit_records']+=1
with open(f'{W}/cw_search/extracted_cw.ndjson','w') as f:
    for r in out: f.write(json.dumps(r)+'\n')
print(len(hits),'unique hits;',dict(n),'WA hits',sum(1 for h in hits.values() if h['state']=='WA'),'hits whose stock is in snapshot',sum(1 for k in hits if k in bystock))

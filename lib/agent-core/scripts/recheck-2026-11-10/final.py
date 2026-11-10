"""final.py <base snapshot> <stage-3 snapshot> <out snapshot> <outdir>: CSO ruling carried over (Tacoma RV Center units held price_unverified: unit pages are
client-rendered and state no sale price; price only via robots-disallowed /api/), builtAt, dataset note, stats, and an independent base-vs-final diff."""
import json,gzip,sys,os,csv,collections as C,datetime as D
base,s3,dst,od=sys.argv[1:5]
B=json.load(gzip.open(base)); S=json.load(gzip.open(s3))
bu={u['id']:u for u in B['units']}
held=[]; out=[]
for u in S['units']:
    if u['provenance']['dealerDomain']=='tacomarv.com':
        held.append([u['id'],'tacomarv.com',u['title'],u.get('vin'),u['rvType'],(u.get('priceUsd') or {}).get('value'),'price_unverified (CSO Nov 2 ruling: Tacoma RV Center pages state no sale price; client-rendered)']); continue
    out.append(u)
bt=os.environ['BUILT_AT']; btd=D.datetime.fromisoformat(bt.replace('Z','+00:00'))
ls=[D.datetime.fromisoformat(u['provenance']['lastSeenAt'].replace('Z','+00:00')) for u in out]
ids={u['id'] for u in out}
removed=[i for i in bu if i not in ids]; added=[i for i in ids if i not in bu]
refreshed=[u['id'] for u in out if u['id'] in bu and u['provenance']['lastSeenAt']>bu[u['id']]['provenance']['lastSeenAt']]
pchg=[u['id'] for u in out if u['id'] in bu and (u['priceUsd'] or {}).get('value')!=(bu[u['id']]['priceUsd'] or {}).get('value')]
fields=C.Counter()
for u in out:
    o=bu.get(u['id'])
    if not o: continue
    for k in ('condition','rvType','make','model','year','vin','stockNumber'):
        if u.get(k)!=o.get(k): fields[k]+=1
    if u['dealer']['id']!=o['dealer']['id']: fields['dealer']+=1
st=dict(B['stats']); st.update(units=len(out),dealers=len({u['dealer']['id'] for u in out}),uniqueVins=len({u['vin'] for u in out if u['vin']}),
  lastSeenRange={'oldest':min(ls).strftime('%Y-%m-%dT%H:%M:%S.000Z'),'newest':max(ls).strftime('%Y-%m-%dT%H:%M:%S.000Z')},
  seenWithinDaysOfBuiltAt={f'{d}d':sum(1 for x in ls if (btd-x).total_seconds()<=d*86400) for d in (14,21,30,45)})
summ={'builtAt':bt,'base_units':len(bu),'out_units':len(out),'removed_or_held':len(removed),'added':len(added),'lastSeen_refreshed':len(refreshed),'price_changed':len(pchg),'other_field_changes':dict(fields),'tacoma_held':len(held)}
st['recheck_2026_11_02']=summ
note=B['datasetNote']+" 2026-11-09/10 dealer re-check (pages read Nov 9 8 PM to Nov 10 PT): units re-read from their own dealer listing pages (Interact dealers, Camping World, other dealer sites; Camping World Seattle-area units from CW's public listing results) after their last read; lastSeen refreshed where the unit is live, sold / gone / sale-pending / on-order units removed, MSRP-only, MAP / unlock-pricing and list-price-only units held as price_unverified; Tacoma RV Center units held (no sale price on their pages). Units not re-read keep their earlier lastSeenAt."
hdr={'schemaVersion':B['schemaVersion'],'builtAt':bt,'datasetNote':note,'stats':st,'units':[]}
h=json.dumps(hdr,ensure_ascii=True,separators=(',',':'))
with gzip.open(dst+'.tmp','wb',compresslevel=9) as f:
    f.write(h[:-2].encode('ascii'))
    for i,u in enumerate(out): f.write((b',' if i else b'')+json.dumps(u,ensure_ascii=True,separators=(',',':')).encode('ascii'))
    f.write(b']}')
os.replace(dst+'.tmp',dst)
w=csv.writer(open(f'{od}/final_tacoma_held.csv','w',newline='')); w.writerow(['id','domain','title','vin','rvType','price','reason']); w.writerows(held)
json.dump(summ,open(f'{od}/final_summary.json','w'),indent=1); json.dump({'removed':removed,'refreshed':refreshed,'priceChanged':pchg},open(f'{od}/final_ids.json','w'))
print(json.dumps(summ))

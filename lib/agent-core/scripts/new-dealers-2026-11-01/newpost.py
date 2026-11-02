"""newpost.py (2026-11-01 WA new-dealer batch): finish the KEEP_BASE build.
in: built snapshot (KEEP_BASE over #69), typefix+postfix outputs of that build, the #69 base snapshot.
 - #69 base units are carried exactly as committed (typefix/postfix changes to base units are discarded; they were
   already applied when #69 was built).
 - new units take the typefix/postfix result (a new unit those passes held stays held, reason recorded).
 - BH only for towables: a motorized new unit's bunkhouse fact is cleared.
 - MSRP: msrp == price copies blanked; towable MSRP > $250k (travel trailer) / > $400k (fifth wheel, toy hauler) blanked;
   MSRP is never used as the price (MSRP-only pages carry no price and were held as price_unverified before the build).
usage: newpost.py <built.gz> <postfix_out.gz> <base.gz> <dst.gz> <outdir>"""
import re,gzip,json,sys,csv,collections,datetime,os
built,post,basep,dst,od=sys.argv[1:6]
B=json.load(gzip.open(basep)); base_ids=[u['id'] for u in B['units']]; bset=set(base_ids)
S=json.load(gzip.open(built)); P=json.load(gzip.open(post))
pmap={u['id']:u for u in P['units']}
newb=[u for u in S['units'] if u['id'] not in bset]
# base units: the built output should carry them unchanged under the same ids
bmap={u['id']:u for u in S['units'] if u['id'] in bset}
missing_base=[i for i in base_ids if i not in bmap]
TOW={'travel_trailer','fifth_wheel','toy_hauler','popup_camper','truck_camper'}
held=[];c=collections.Counter();changes=[]
bcity={((x.get('provenance') or {}).get('dealerDomain'),x['dealer']['city'].lower()):x['dealer']['city'] for x in B['units'] if x['dealer'].get('state')=='WA'}
out=list(B['units'])
for u in newb:
    v=pmap.get(u['id'])
    if v is None: held.append([u['id'],u['provenance']['dealerDomain'],u['title'],u.get('vin'),u['rvType'],u['priceUsd']['value'],'held_by_typefix_or_postfix',u['provenance'].get('listingUrl')]); c['held_typefix_postfix']+=1; continue
    if v['rvType']!=u['rvType']: changes.append([u['id'],'rvType',u['rvType'],v['rvType'],'typefix/postfix manufacturer model class'])
    u=v
    # dealer type statements must agree: a listing URL type token that contradicts the unit's type holds it (toy hauler is a towable subtype of TT/5W)
    url=(u['provenance'].get('listingUrl') or '').lower(); OK={'fifth-wheel':{'fifth_wheel','toy_hauler'},'travel-trailer':{'travel_trailer','toy_hauler'},'class-a':{'class_a'},'class-b':{'class_b'},'class-c':{'class_c'}}
    bad=[k for k in OK if re.search(r'(^|[/-])'+k+r'([/-]|$)',url) and u['rvType'] not in OK[k]]
    if bad: held.append([u['id'],u['provenance']['dealerDomain'],u['title'],u.get('vin'),u['rvType'],u['priceUsd']['value'],'type_conflict_listing_url:'+bad[0],u['provenance'].get('listingUrl')]); c['type_conflict_url']+=1; continue
    # city casing only (e.g. dealer typed "LIberty Lake"): use the same dealer's existing base casing for the same city
    bc=bcity.get((u['provenance']['dealerDomain'],u['dealer']['city'].lower()))
    if bc and bc!=u['dealer']['city']: changes.append([u['id'],'dealer.city',u['dealer']['city'],bc,'casing only']); u['dealer']['city']=bc; u['dealer']['name']=u['dealer']['name']; c['city_casing']+=1
    if u['rvType'] not in TOW and (u.get('bunkhouse') or {}).get('value') is not None:
        changes.append([u['id'],'bunkhouse',u['bunkhouse']['value'],None,'BH only for towables']); u['bunkhouse']={"value":None,"source":None,"confidence":None,"note":"Bunkhouse applies to towables only."}; c['bh_cleared_motorized']+=1
    p=u['priceUsd']['value']; m=(u.get('msrpUsd') or {}).get('value')
    if m is not None and p is not None and abs(m-p)<1:
        changes.append([u['id'],'msrpUsd',m,None,'msrp == price copy']); u['msrpUsd']={"value":None,"source":None,"confidence":None}; c['msrp_eq_price_blanked']+=1
    elif m is not None and ((u['rvType']=='travel_trailer' and m>250000) or (u['rvType'] in ('fifth_wheel','toy_hauler') and m>400000)):
        changes.append([u['id'],'msrpUsd',m,None,'implausible towable MSRP']); u['msrpUsd']={"value":None,"source":None,"confidence":None}; c['msrp_implausible_blanked']+=1
    if p is None: held.append([u['id'],u['provenance']['dealerDomain'],u['title'],u.get('vin'),u['rvType'],None,'price_unverified',u['provenance'].get('listingUrl')]); c['price_unverified']+=1; continue
    out.append(u); c['new_added']+=1
bt=datetime.datetime.fromisoformat(S['builtAt'].replace('Z','+00:00'))
ls=[datetime.datetime.fromisoformat(u['provenance']['lastSeenAt'].replace('Z','+00:00')) for u in out]
summary={"builtAt":S['builtAt'],"base_units":len(B['units']),"base_missing_in_build":len(missing_base),"new_units_in_build":len(newb),**c,"out_units":len(out)}
s=dict(B['stats']); s.update(units=len(out),dealers=len({u['dealer']['id'] for u in out}),uniqueVins=len({u['vin'] for u in out if u['vin']}),
  lastSeenRange={"oldest":min(ls).strftime("%Y-%m-%dT%H:%M:%S.000Z"),"newest":max(ls).strftime("%Y-%m-%dT%H:%M:%S.000Z")},
  seenWithinDaysOfBuiltAt={f"{d}d":sum(1 for x in ls if (bt-x).total_seconds()<=d*86400) for d in (14,21,30,45)},newDealersWA_2026_11_01=summary)
hdr={"schemaVersion":B["schemaVersion"],"builtAt":S['builtAt'],"datasetNote":B["datasetNote"]+" Nov 1 new-dealer batch (Washington): units read from new WA dealers' own listing pages; #69 units unchanged.","stats":s,"units":[]}
h=json.dumps(hdr,ensure_ascii=True,separators=(",",":"))
with gzip.open(dst+".tmp","wb",compresslevel=9) as f:
    f.write(h[:-2].encode("ascii"))
    for i,u in enumerate(out): f.write((b"," if i else b"")+json.dumps(u,ensure_ascii=True,separators=(",",":")).encode("ascii"))
    f.write(b"]}")
os.replace(dst+".tmp",dst)
w=csv.writer(open(f'{od}/newpost_held.csv','w',newline='')); w.writerow(['id','domain','title','vin','rvType','price','reason','listing_url']); w.writerows(held)
w=csv.writer(open(f'{od}/newpost_changes.csv','w',newline='')); w.writerow(['id','field','old','new','rule']); w.writerows(changes)
json.dump(summary,open(f'{od}/newpost_summary.json','w'),indent=1); print(json.dumps(summary))

"""cso_fix2_bretz_2026_11_02.py <in_snapshot.gz> <out_snapshot.gz> <outdir>: CSO ruling 2026-11-02 on the WA batch, facts-only.
Bretz RV WA units carried from #69 (lastSeen 2026-10-11) that have no page in Bretz's sitemap (re-read 2026-11-02) are REMOVED now
rather than left to age out: a unit missing from the dealer's sitemap is likely sold, and a sold unit staying searchable is false data.
Exactly 3 units: stock 104562, stock 104597, VIN 58TBM0AK1V7V73058. Rows are appended to <outdir>/cso_fix_removed.csv;
<outdir>/cso_fix_summary.json gains bretz_not_in_sitemap_removed. Runs after cso_fix_2026_11_02.py on its output."""
import json,gzip,sys,os,csv,datetime
src,dst,od=sys.argv[1:4]
S=json.load(gzip.open(src))
STOCKS={'104562','104597'}; VINS={'58TBM0AK1V7V73058'}
REASON='not in dealer sitemap 2026-11-02, likely sold'
out=[]; removed=[]
for u in S['units']:
    p=u['provenance']
    if p.get('dealerDomain')=='bretzrv.com' and u['dealer'].get('state')=='WA' and p.get('lastSeenAt','')<'2026-11-01' and \
       ((u.get('vin') or '').upper() in VINS or (str(u.get('stockNumber') or '') in STOCKS and not u.get('vin'))):
        removed.append([u['id'],p['dealerDomain'],u['title'],u.get('vin'),u['rvType'],(u.get('priceUsd') or {}).get('value'),REASON,p.get('listingUrl')]); continue
    out.append(u)
assert len(removed)==3, f'expected 3 Bretz units, found {len(removed)}: {[r[0] for r in removed]}'
bt=datetime.datetime.now(datetime.timezone.utc); BT=bt.strftime('%Y-%m-%dT%H:%M:%S.')+f'{bt.microsecond//1000:03d}Z'
ls=[datetime.datetime.fromisoformat(u['provenance']['lastSeenAt'].replace('Z','+00:00')) for u in out]
s=dict(S['stats']); s.update(units=len(out),dealers=len({u['dealer']['id'] for u in out}),uniqueVins=len({u['vin'] for u in out if u['vin']}),
  lastSeenRange={"oldest":min(ls).strftime("%Y-%m-%dT%H:%M:%S.000Z"),"newest":max(ls).strftime("%Y-%m-%dT%H:%M:%S.000Z")},
  seenWithinDaysOfBuiltAt={f"{d}d":sum(1 for x in ls if (bt-x).total_seconds()<=d*86400) for d in (14,21,30,45)})
cf=dict(s.get('csoFixWA_2026_11_02',{})); cf.pop('bretz16_no_page_left_to_age_out',None); cf['bretz_not_in_sitemap_removed']=3; s['csoFixWA_2026_11_02']=cf
hdr={"schemaVersion":S["schemaVersion"],"builtAt":BT,"datasetNote":S["datasetNote"]+" Bretz units not in the dealer sitemap (2026-11-02) removed as likely sold.","stats":s,"units":[]}
h=json.dumps(hdr,ensure_ascii=True,separators=(",",":"))
with gzip.open(dst+".tmp","wb",compresslevel=9) as f:
    f.write(h[:-2].encode("ascii"))
    for i,u in enumerate(out): f.write((b"," if i else b"")+json.dumps(u,ensure_ascii=True,separators=(",",":")).encode("ascii"))
    f.write(b"]}")
os.replace(dst+".tmp",dst)
fn=f'{od}/cso_fix_removed.csv'; have={r[0] for r in csv.reader(open(fn))}
w=csv.writer(open(fn,'a',newline='')); w.writerows([r for r in removed if r[0] not in have])
sp=f'{od}/cso_fix_summary.json'; summ=json.load(open(sp)); summ.pop('bretz16_no_page_left_to_age_out',None)
summ.update(bretz_not_in_sitemap_removed=3,builtAt=BT,units_out=len(out)); json.dump(summ,open(sp,'w'),indent=1); print(json.dumps(summ))

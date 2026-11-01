"""recheck8b.py: refreshed 10-unit recheck CSV for trial8b. Keeps the trial8 order rows; replaces the sporttruckrv and
Bobby Combs rows (no listing URL stored) with dedupe carry-over rows (price/MSRP-changed rows first)."""
import csv,json,gzip
H='/workspace/harvest-2026-10-31'; A=f'{H}/out_trial8'; O=f'{H}/out_trial8b'
U={u['id']:u for u in json.load(gzip.open(f'{O}/inventory.snapshot.json.gz'))['units']}
old=list(csv.reader(open(f'{A}/qa_recheck_10_trial8.csv'))); hdr,rows=old[0],old[1:]
keep=[r for r in rows if not (r[0] in ('VIN-conflict dedupe undone','Bobby Combs record') and r[2].startswith('(no listing URL'))]
co=[r for r in csv.DictReader(open(f'{O}/dedupe_carryover.csv')) if r['result']=='carried']
co.sort(key=lambda r:(r['old_price']==r['new_price'] and r['old_msrp']==r['new_msrp'],))
pick=[];seen=set()
for r in co:   # price/MSRP changes first, then one per dealer
    if len(keep)+len(pick)>=10: break
    if r['old_price']!=r['new_price'] or r['old_msrp']!=r['new_msrp'] or r['domain'] not in seen: pick.append(r); seen.add(r['domain'])
for r in pick:
    u=U.get(r['kept_id']) or {}; pv=u.get('provenance') or {}
    keep.append(['dedupe carry-over (kept valid-VIN record took the fresher duplicate)',r['kept_id'],pv.get('listingUrl') or r['new_listing_url'],r['domain'],r['title'],u.get('vin') or '','searchable in trial8b snapshot' if r['kept_id'] in U else 'not in trial8b snapshot',
                 f"from {r['removed_id']} ({r['match_basis']}): price {r['old_price']} -> {r['new_price']}; MSRP {r['old_msrp']} -> {r['new_msrp']}; lastSeen {r['old_last_seen']} -> {r['new_last_seen']}",'',''])
with open(f'{O}/qa_recheck_10_trial8b.csv','w',newline='') as f: w=csv.writer(f); w.writerow(hdr); w.writerows(keep)
print(json.dumps({'rows':len(keep),'replaced':len(rows)-len([r for r in rows if r in keep]),'carry_rows':len(pick)}))

"""report_rc.py <out dir>: removed/held tallies from the stage CSVs, aging-out counts (by Nov 7 / Nov 14 00:00 PT, 30-day window), commit message."""
import csv,json,gzip,sys,collections as C,datetime as D
O=sys.argv[1]; c=C.Counter()
for f in ('cw/pagepass_removed_units.csv','ia/fix1_removed_or_held.csv','gen/gen_removed_or_held.csv'):
    for r in csv.DictReader(open(f'{O}/{f}')): c[r['reason']]+=1
REM=('dead_page_gone','dead_sold')  # sale_pending / on_order / price_* are held
rem={k:v for k,v in c.items() if k in REM}; held={k:v for k,v in c.items() if k not in REM}
s=json.load(gzip.open(f'{O}/inventory.snapshot.json.gz'))
t=lambda x:D.datetime.fromisoformat(x.replace('Z','+00:00'))
c7=t('2026-10-08T07:00:00Z'); c14=t('2026-10-15T07:00:00Z'); a7=C.Counter(); a14=C.Counter()
for u in s['units']:
    l=t(u['provenance']['lastSeenAt'])
    if l<c7: a7[u['provenance']['dealerDomain']]+=1
    elif l<c14: a14[u['provenance']['dealerDomain']]+=1
fs=json.load(open(f'{O}/final_summary.json')); wa=json.load(open(f'{O}/windows_base_at_builtAt.json')); wb=json.load(open(f'{O}/windows.json'))
rep={'builtAt':fs['builtAt'],'loaded':[fs['base_units'],fs['out_units']],'searchable30':[wa['windows']['30']['eligible'],wb['windows']['30']['eligible']],
 'added':fs['added'],'lastSeen_refreshed':fs['lastSeen_refreshed'],'price_changed':fs['price_changed'],'removed':rem,'removed_total':sum(rem.values()),'held':held,'held_total':sum(held.values()),
 'aging_by_nov7':sum(a7.values()),'aging_by_nov7_top':a7.most_common(10),'aging_nov8_to_nov14':sum(a14.values()),'aging_nov8_to_nov14_top':a14.most_common(10)}
json.dump(rep,open(f'{O}/report.json','w'),indent=1)
msg=f"""Dealer re-check 2026-11-02 t5 (on WA batch): {rep['searchable30'][1]:,} searchable RVs at 30 days

Second tranche: all pages fetched through {fs['builtAt']} re-applied to the WA-batch base (same facts-only rules).
lastSeen refreshed {fs['lastSeen_refreshed']:,}; prices updated {fs['price_changed']:,} (unit's own sale price, never MSRP).
CSO t4 fixes applied (condition from own heading/URL, own-page lots, Unknown lot cities from own page; Sale Pending held).
Removed {rep['removed_total']:,} {rem}. Held {rep['held_total']:,} {held}. Added 0.
Loaded {fs['base_units']:,} -> {fs['out_units']:,}; 30-day searchable {rep['searchable30'][0]:,} -> {rep['searchable30'][1]:,}. Not pushed.
"""
open(f'{O}/commit_msg.txt','w').write(msg); print(json.dumps(rep))

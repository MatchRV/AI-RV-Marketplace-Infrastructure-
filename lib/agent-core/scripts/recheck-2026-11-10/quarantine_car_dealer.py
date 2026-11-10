"""quarantine_car_dealer.py <in snapshot> <out snapshot> <outdir>: quarantine non-RV units from car-dealer domains that slipped into the RV network.
Facts-only: removes every unit whose dealer domain is listed below (the dealer's own name is the unit's 'make', and its own pages list passenger
cars, not RVs). No other unit is altered. Removed units are written to quarantine_car_dealer.csv."""
import gzip,json,sys,csv
CAR_DEALER_DOMAINS={'gervaiskia.com':'Gervais Kia (Lowell, MA) is a Kia car dealership; its units are Kia passenger cars (make = dealer brand "Kia"), not RVs'}
s=json.load(gzip.open(sys.argv[1])); od=sys.argv[3]
keep=[];rem=[]
for u in s['units']:
    dom=(u.get('provenance') or {}).get('dealerDomain') or u['dealer']['id'].split(':')[0]
    if dom in CAR_DEALER_DOMAINS or u['dealer']['id'].split(':')[0] in CAR_DEALER_DOMAINS: rem.append((dom,u))
    else: keep.append(u)
s['units']=keep
s['stats']['units']=len(keep); s['stats']['dealers']=len({u['dealer']['id'] for u in keep})
s['stats'].setdefault('rejections',{})['car_dealer_non_rv']=s['stats']['rejections'].get('car_dealer_non_rv',0)+len(rem)
s['datasetNote']+=" Non-RV passenger cars from a car dealership (Gervais Kia, gervaiskia.com) quarantined 2026-11-03."
json.dump(s,gzip.open(sys.argv[2],'wt'),separators=(',',':'))
w=csv.writer(open(f'{od}/quarantine_car_dealer.csv','w',newline='')); w.writerow(['id','domain','dealer','title','make','model','vin','rvType_as_stored','price','lastSeenAt','reason'])
for dom,u in rem: w.writerow([u['id'],dom,u['dealer']['name'],u['title'],u['make'],u['model'],u.get('vin'),u['rvType'],(u.get('priceUsd') or {}).get('value'),u['provenance'].get('lastSeenAt'),CAR_DEALER_DOMAINS.get(dom,'')])
json.dump({'removed':len(rem),'byDomain':{d:sum(1 for x,_ in rem if x==d) for d in CAR_DEALER_DOMAINS},'units_after':len(keep),'dealers_after':s['stats']['dealers']},open(f'{od}/quarantine_car_dealer_summary.json','w'),indent=1)
print(json.load(open(f'{od}/quarantine_car_dealer_summary.json')))

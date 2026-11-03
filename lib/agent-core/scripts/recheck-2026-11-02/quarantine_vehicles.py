"""quarantine_vehicles.py <in snapshot> <out snapshot> <outdir>: follow-up to quarantine_car_dealer.py (2026-11-03).
(a) remove every unit from car dealership lexusofnaperville.com (passenger cars, not RVs);
(b) remove passenger cars / pickups / SUVs stored as RVs at RV dealers. Conservative rule: make is a car/truck brand AND model is a known
    passenger car/pickup/SUV nameplate AND no RV evidence in the unit's own page fields (title, model, trim, floorplan, description, features);
    A customer review pasted into the description field is not RV evidence. Plus the florencerv.com RAV4 whose VIN ends in the placeholder 'EXAMPLE'. Vans/chassis (Sprinter, Transit, ProMaster, EuroVan, E-series)
    and RV models on car chassis are never touched.
(c) hold (not fix) two rows as data_unverified: make is the dealer's own name / title is a blog headline. make is never rewritten.
No other unit is altered."""
import gzip,json,sys,csv,re
s=json.load(gzip.open(sys.argv[1])); od=sys.argv[3]
CAR_DEALER={'lexusofnaperville.com'}
CARMK=re.compile(r'^(toyota|honda|nissan|hyundai|chevrolet|chevy|gmc|jeep|dodge|ram|ford|kia|subaru|mazda)$',re.I)
CARMODEL=re.compile(r'^(?:silverado|sierra|tahoe|suburban|yukon|grand cherokee|cherokee|wrangler|escape|explorer|expedition|edge|f-?150|rogue|titan|rav4|highlander|tacoma|tundra|4runner|cr-?v|pilot|civic|accord|malibu|traverse|equinox|tucson|santa fe|corolla(?: cross)?|camry|(?:\d{4}\s*)?(?:limited|laramie|big horn|tradesman)|ram|durango)\b',re.I)
RVEV=re.compile(r'\b(camper|topper|motor ?home|toy ?hauler|travel trailer|fifth wheel|5th wheel|bunk|sleeps|slide-?outs?|fresh water|black water|grey water|gray water|holding tank|awning|class [abc]\b|rialta|conversion)',re.I)
HOLD={'key:u:https://www.camper-city.com/products/2011-georgetown-378-class-a':"make is the dealer's own name ('Camper City'); real manufacturer not stated in a structured field - held, make not rewritten from title",
      'vin:8BNPF4CC3GE122987':"title is a blog headline ('How the 2025 Winnebago View Elevates RV Luxury...'), not a listing title - held until the unit's own listing page is read"}
REVIEW=re.compile(r"\b(?:we|i) (?:were|was|love|loved|bought|purchased)\b|\bour (?:salesman|salesperson|sales rep)\b|\bmy (?:salesman|salesperson|sales rep)\b|\btreated (?:us|me)\b|\btreated excellent",re.I)
def dom(u): return (u.get('provenance') or {}).get('dealerDomain') or u['dealer']['id'].split(':')[0]
def txt(u):
    f=u.get('features'); d=u.get('description')
    d=d.get('value') if isinstance(d,dict) else d
    if d and REVIEW.search(str(d)): d=''  # a customer review pasted where the description belongs is not the dealer's description of the unit
    return ' '.join(str(x or '') for x in (u['title'],u.get('model'),u.get('trim'),u.get('floorplanCode'),d,json.dumps(f) if f else ''))
keep=[];rem=[];held=[]
for u in s['units']:
    m=(u['make'] or '').replace('®','').strip(); mo=(u.get('model') or '').replace('®','').strip()
    if dom(u) in CAR_DEALER: rem.append(('car_dealer_non_rv','Lexus of Naperville is a car dealership; unit is a passenger car',u)); continue
    if (u.get('vin') or u['id']).upper().endswith('EXAMPLE'): rem.append(('placeholder_vin_non_rv',"VIN ends in placeholder 'EXAMPLE'; unit is a passenger SUV (Toyota RAV4)",u)); continue
    if CARMK.match(m) and CARMODEL.match(mo) and not RVEV.search(txt(u)): rem.append(('tow_vehicle_non_rv',f'{m} {mo}: passenger car/pickup/SUV nameplate, no RV evidence on its page fields',u)); continue
    if u['id'] in HOLD: held.append(('data_unverified',HOLD[u['id']],u)); continue
    keep.append(u)
s['units']=keep; s['stats']['units']=len(keep); s['stats']['dealers']=len({u['dealer']['id'] for u in keep})
R=s['stats'].setdefault('rejections',{})
for k in ('car_dealer_non_rv','placeholder_vin_non_rv','tow_vehicle_non_rv','data_unverified'):
    n=sum(1 for x in rem+held if x[0]==k)
    if n: R[k]=R.get(k,0)+n
s['datasetNote']+=" Passenger cars/pickups/SUVs stored as RVs (Lexus of Naperville; tow vehicles at RV dealers; one placeholder VIN) removed and two unverifiable rows held 2026-11-03."
json.dump(s,gzip.open(sys.argv[2],'wt'),separators=(',',':'))
H=['id','action','reason_code','domain','dealer','state','title','make','model','vin','rvType_as_stored','price','lastSeenAt','source_url','detail']
for name,rows,act in (('removed_non_rv_vehicles.csv',rem,'removed'),('held_data_unverified.csv',held,'held')):
    w=csv.writer(open(f'{od}/{name}','w',newline='')); w.writerow(H)
    for code,det,u in rows: w.writerow([u['id'],act,code,dom(u),u['dealer']['name'],u['dealer']['state'],u['title'],u['make'],u['model'],u.get('vin'),u['rvType'],(u.get('priceUsd') or {}).get('value'),u['provenance'].get('lastSeenAt'),(u.get('priceUsd') or {}).get('sourceUrl') or u['dealer'].get('website') or '',det])
summ={'removed':len(rem),'held':len(held),'byReason':{k:sum(1 for x in rem+held if x[0]==k) for k in ('car_dealer_non_rv','placeholder_vin_non_rv','tow_vehicle_non_rv','data_unverified')},'units_after':len(keep),'dealers_after':s['stats']['dealers']}
json.dump(summ,open(f'{od}/quarantine_vehicles_summary.json','w'),indent=1); print(summ)

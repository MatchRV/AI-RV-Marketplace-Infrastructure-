# qa_sample_dande.py: 10-row QA sample of DandE RV Sales units (stratified by dealer category), same columns as qa_sample_nd.py plus decision.
import json,csv,random,collections
U=[u for u in json.load(open('dande/dande_units.json')) if u['decision']!='skipped_not_rv']
T={'Travel Trailers':'travel_trailer','5th Wheels':'fifth_wheel','Toyhaulers':'toy_hauler','Motorhomes':'motorhome (class not stated)'}
random.seed(20261102); random.shuffle(U)
by=collections.defaultdict(list)
for u in U: by[u['dealerCategory'] or 'unconfirmed'].append(u)
pick=[]
while len(pick)<10:
    for k in sorted(by):
        if by[k] and len(pick)<10: pick.append(by[k].pop())
with open('out_t5/qa_sample_10_danderv.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['dealer_vehicle_id','dealer','domain','lot_city','lot_state','listing_url','year','make','model','rvType','condition','price_usd','msrp_usd','vin','stock','bunkhouse','length_ft','sleeps','photo_url','lastSeen_PT','page_price_text','listing_nada_not_price','decision','reason','CSO_check'])
    for u in pick:
        w.writerow([u['dealerVehicleId'],'DandE RV Sales','danderv.com','Tacoma','WA',u['url'],u['year'],u['make'],'(no model field on page)',T.get(u['dealerCategory'],'(dealer category unconfirmed)'),'(not stated on unit page)',
                    '','','' if not u['vin'] else u['vin'],u['stock'],'(not a page field)','(not a page field)','(not a page field)',u['photo'],u['lastSeenPT'],u['pagePriceText'],u['listingNADA'],u['decision'],u['reason'],''])
print(collections.Counter(u['dealerCategory'] or 'unconfirmed' for u in pick))

"""hold_condition_unverified.py <in snapshot> <out snapshot> <outdir>: 2026-11-04 CSO ruling.
Hold (not relabel) 8 units whose dealer page says condition New but model year is 2005-2022, so condition is unknown
(could be a dealer mistake or real leftover stock). Previously reconcileYearAndCondition() demoted them to used at load time;
either label could be false, so they are held out of search as condition_unverified. No field is rewritten; no other unit altered."""
import gzip,json,sys,csv
s=json.load(gzip.open(sys.argv[1])); od=sys.argv[3]
HOLD={'findlaytruckrvsales.com':{'1TC3B256851306031','1UJBJ0BP8B1JU0102','1UJBJSBP4N1780257','4EZFT292X95072629','4YDF371218R801910','5SFGF29248E008305','5SFNB3123EE269649'},
      'sunandfunrvs.com':{'7HFB1KE12N17Y8724'}}
def dom(u): return (u.get('provenance') or {}).get('dealerDomain') or u['dealer']['id'].split(':')[0]
keep=[];held=[]
for u in s['units']:
    if (u.get('vin') or '').upper() in HOLD.get(dom(u),()) and u.get('condition')=='new': held.append(u); continue
    keep.append(u)
assert len(held)==8,len(held)
s['units']=keep; s['stats']['units']=len(keep); s['stats']['dealers']=len({u['dealer']['id'] for u in keep})
R=s['stats'].setdefault('rejections',{}); R['condition_unverified']=R.get('condition_unverified',0)+len(held)
s['datasetNote']+=" Eight units listed New with 2005-2022 model years held as condition_unverified 2026-11-04."
json.dump(s,gzip.open(sys.argv[2],'wt'),separators=(',',':'))
w=csv.writer(open(f'{od}/held_condition_unverified.csv','w',newline=''))
w.writerow(['id','action','reason_code','domain','dealer','state','title','year','condition_as_stored','vin','source_url'])
for u in held: w.writerow([u['id'],'held','condition_unverified',dom(u),u['dealer']['name'],u['dealer']['state'],u['title'],u.get('year'),u.get('condition'),u.get('vin'),(u.get('priceUsd') or {}).get('sourceUrl') or u['dealer'].get('website') or ''])
print({'held':len(held),'units_after':len(keep),'dealers_after':s['stats']['dealers']})

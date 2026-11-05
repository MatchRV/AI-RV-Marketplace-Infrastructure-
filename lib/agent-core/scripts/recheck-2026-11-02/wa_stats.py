"""wa_stats.py <snapshot> <BUILT iso>: searchable (30 d from BUILT, same base_ok floors as windows.py) total and WA, plus per-state-WA domains."""
import json,gzip,sys,re,datetime
NEW=dict(travel_trailer=8000,fifth_wheel=15000,toy_hauler=12000,popup_camper=5000,truck_camper=5000,class_a=15000,class_b=15000,class_c=15000)
USED=dict(travel_trailer=2500,fifth_wheel=3000,toy_hauler=3000,popup_camper=1500,truck_camper=1500,class_a=5000,class_b=5000,class_c=5000)
s=json.load(gzip.open(sys.argv[1])); ref=datetime.datetime.fromisoformat(sys.argv[2].replace('Z','+00:00'))
def ok(u):
    n=f"{u['title']} {u['model']} {u.get('trim') or ''}"
    if re.search(r'forest\s*river',u['make'],re.I) and re.search(r'\b(?:salem|wildwood)\s+fsx\b',n,re.I) and u['rvType'] not in('travel_trailer','toy_hauler'): return False
    if re.search(r'nu\s*camp',u['make'],re.I) and re.search(r'\bcirrus\s+(?:620|820)\b',n,re.I) and u['rvType']!='truck_camper': return False
    nn=u['condition']=='new' or (u['year'] or 0)>=ref.year-1
    p=u['priceUsd']['value']; return not (p is not None and p<(NEW if nn else USED).get(u['rvType'],5000 if nn else 1500))
res={}
for d in (14,30):
    E=[u for u in s['units'] if ok(u) and (ref-datetime.datetime.fromisoformat(u['provenance']['lastSeenAt'].replace('Z','+00:00'))).total_seconds()/86400<=d]
    res[d]={'total':len(E),'WA':sum(1 for u in E if u['dealer']['state']=='WA'),'WA_domains':len({u['provenance']['dealerDomain'] for u in E if u['dealer']['state']=='WA'}),'domains':len({u['provenance']['dealerDomain'] for u in E})}
res['WA_loaded']=sum(1 for u in s['units'] if u['dealer']['state']=='WA'); print(json.dumps(res))

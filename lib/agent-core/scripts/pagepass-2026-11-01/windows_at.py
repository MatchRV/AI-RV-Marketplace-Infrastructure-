# windows_at.py: windows.py (harvest-2026-10-30) measured from env BUILT instead of the snapshot builtAt
import json,gzip,sys,datetime,importlib.util
spec=importlib.util.spec_from_file_location('a','/workspace/harvest-2026-10-30/analyze_lib.py')
s=json.load(gzip.open(sys.argv[1])); import os; s['builtAt']=os.environ.get('BUILT') or s['builtAt']; ref=datetime.datetime.fromisoformat(s['builtAt'].replace('Z','+00:00'))
import re
NEW=dict(travel_trailer=8000,fifth_wheel=15000,toy_hauler=12000,popup_camper=5000,truck_camper=5000,class_a=15000,class_b=15000,class_c=15000)
USED=dict(travel_trailer=2500,fifth_wheel=3000,toy_hauler=3000,popup_camper=1500,truck_camper=1500,class_a=5000,class_b=5000,class_c=5000)
def base_ok(u):
    n=f"{u['title']} {u['model']} {u.get('trim') or ''}"
    if re.search(r'forest\s*river',u['make'],re.I) and re.search(r'\b(?:salem|wildwood)\s+fsx\b',n,re.I) and u['rvType'] not in('travel_trailer','toy_hauler'): return False
    if re.search(r'nu\s*camp',u['make'],re.I) and re.search(r'\bcirrus\s+(?:620|820)\b',n,re.I) and u['rvType']!='truck_camper': return False
    nn=u['condition']=='new' or (u['year'] or 0)>=ref.year-1
    p=u['priceUsd']['value']; return not (p is not None and p<(NEW if nn else USED).get(u['rvType'],5000 if nn else 1500))
B=[u for u in s['units'] if base_ok(u)]
out={'builtAt':s['builtAt'],'loaded':len(s['units']),'passing_non_stale_rules':len(B),'windows':{}}
for d in (14,21,30,45):
    E=[u for u in B if (ref-datetime.datetime.fromisoformat(u['provenance']['lastSeenAt'].replace('Z','+00:00'))).total_seconds()/86400<=d]
    out['windows'][d]={'eligible':len(E),'domains':len({u['provenance']['dealerDomain'] for u in E}),'locations':len({u['dealer']['id'] for u in E}),'states':len({u['dealer']['state'] for u in E}),
                       'cutoff_PT':(ref-datetime.timedelta(days=d)).astimezone(datetime.timezone(datetime.timedelta(hours=-7))).strftime('%Y-%m-%d %H:%M PDT')}
print(json.dumps(out,indent=1)); json.dump(out,open(sys.argv[2],'w'),indent=1)

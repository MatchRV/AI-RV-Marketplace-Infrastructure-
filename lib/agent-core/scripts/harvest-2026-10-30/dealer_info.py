"""Dealer name/city/state for website-only domains: snapshot (network) -> dealer homepage schema.org address -> MarketCheck rows=1 fallback."""
import json,re,glob,time,requests,collections as C,sys
B="/workspace/harvest-2026-10-30"; S="/workspace/scrape-2026-10-26"
mc=json.load(open(f"{B}/mc_dealer_info.json"))
doms=set()
for f in glob.glob(f"{S}/websites/*.jsonl")+glob.glob(f"{B}/web/*.jsonl")+glob.glob(f"{B}/webnew/*.jsonl"):
    if not f.endswith("_done.jsonl") and open(f).readline(): doms.add(f.split("/")[-1][:-6])
snap=json.load(open('/workspace/live-counts/snap.json'))
net=C.defaultdict(C.Counter)
for u in snap['units']:
    d=u['dealer']; net[u['provenance']['dealerDomain']][(d['name'],d['city'],d['state'],d.get('lat'),d.get('lng'))]+=1
prev=json.load(open(f"{B}/dealer_info_extra.json")) if __import__("os").path.exists(f"{B}/dealer_info_extra.json") else {}
out={}; how=C.Counter()
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0)"
ST={n.lower():c for n,c in [("Alabama","AL"),("Alaska","AK"),("Arizona","AZ"),("Arkansas","AR"),("California","CA"),("Colorado","CO"),("Connecticut","CT"),("Delaware","DE"),("Florida","FL"),("Georgia","GA"),("Hawaii","HI"),("Idaho","ID"),("Illinois","IL"),("Indiana","IN"),("Iowa","IA"),("Kansas","KS"),("Kentucky","KY"),("Louisiana","LA"),("Maine","ME"),("Maryland","MD"),("Massachusetts","MA"),("Michigan","MI"),("Minnesota","MN"),("Mississippi","MS"),("Missouri","MO"),("Montana","MT"),("Nebraska","NE"),("Nevada","NV"),("New Hampshire","NH"),("New Jersey","NJ"),("New Mexico","NM"),("New York","NY"),("North Carolina","NC"),("North Dakota","ND"),("Ohio","OH"),("Oklahoma","OK"),("Oregon","OR"),("Pennsylvania","PA"),("Rhode Island","RI"),("South Carolina","SC"),("South Dakota","SD"),("Tennessee","TN"),("Texas","TX"),("Utah","UT"),("Vermont","VT"),("Virginia","VA"),("Washington","WA"),("West Virginia","WV"),("Wisconsin","WI"),("Wyoming","WY")]}
def jsonld_addr(html):
    for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>',html,re.S|re.I):
        try: d=json.loads(m.group(1).strip())
        except Exception: continue
        stack=[d]
        while stack:
            x=stack.pop()
            if isinstance(x,list): stack+=x; continue
            if not isinstance(x,dict): continue
            a=x.get("address")
            if isinstance(a,list) and a: a=a[0]
            if isinstance(a,dict) and a.get("addressRegion") and a.get("addressLocality"):
                return {"name":x.get("name"),"city":a["addressLocality"].strip(),"state":ST.get(a["addressRegion"].strip().lower(),a["addressRegion"].strip().upper())}
            stack+=[v for v in x.values() if isinstance(v,(dict,list))]
    return None
need=[]
for dom in sorted(doms):
    if dom in prev and prev[dom].get("via")!="dealer_homepage_jsonld" and prev[dom].get("state") in set(ST.values()): out[dom]=prev[dom]; how["prev"]+=1; continue
    if dom in mc: out[dom]={**mc[dom],"via":"marketcheck_dealer"}; how["mc"]+=1; continue
    if dom in net:
        (n,c,s,la,lo),_=net[dom].most_common(1)[0]; out[dom]={"name":n,"city":c,"state":s,"lat":la,"lng":lo,"via":"live_snapshot"}; how["snapshot"]+=1; continue
    need.append(dom)
for dom in need:
    base=f"https://www.{dom}" if dom.count('.')==1 else f"https://{dom}"
    try:
        r=requests.get(base+"/",timeout=20,headers={"User-Agent":UA}); a=jsonld_addr(r.text) if r.status_code==200 else None
    except Exception: a=None
    time.sleep(0.2)
    if a and re.match(r'^[A-Z]{2}$',a["state"]): out[dom]={**a,"name":a["name"] or dom,"lat":None,"lng":None,"via":"dealer_homepage_jsonld"}; how["jsonld"]+=1
    else: how["missing"]+=1; out[dom]=None
missing=[d for d,v in out.items() if v is None]
if "--mc" in sys.argv and missing:
    sys.path.insert(0,B); import mccall
    for dom in missing:
        d=mccall.call("/v2/search/rv/active",{"source":dom,"rows":1,"country":"US"},f"dealer info {dom}")
        l=((d or {}).get("listings") or [None])[0]
        if l and (l.get("dealer") or {}).get("state"):
            dd=l["dealer"]; out[dom]={"name":dd.get("name"),"city":dd.get("city"),"state":dd.get("state"),"lat":float(dd["latitude"]) if dd.get("latitude") else None,"lng":float(dd["longitude"]) if dd.get("longitude") else None,"via":"marketcheck_dealer_rows1"}; how["mc_rows1"]+=1
json.dump({k:v for k,v in out.items() if v},open(f"{B}/dealer_info_extra.json","w"),indent=0)
print(dict(how),"missing",[d for d,v in out.items() if v is None][:50])

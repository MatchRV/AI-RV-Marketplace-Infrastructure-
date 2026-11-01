"""qa_pp.py <base.gz> <new.gz> <outdir>: 30-unit QA sample (seed 20261101): 12 price changes, 8 removed (sold/gone/
duplicate/lot), 5 refreshed without a price change (lastSeen only or condition filled), 5 untouched (page-pass dealers'
units not re-read, plus other dealers). One row per unit, before/after, listing URL, blank CSO_check."""
import json,gzip,sys,csv,random,collections as C
b,n,o=sys.argv[1:4]; R=random.Random(20261101)
B={u["id"]:u for u in json.load(gzip.open(b))["units"]}
N={u["id"]:u for u in json.load(gzip.open(n))["units"]}
T=json.load(open(f"{o}/pagepass_touched.json")); ch={k:set(v) for k,v in T["changed"].items()}
rem=list(csv.DictReader(open(f"{o}/pagepass_removed_units.csv")))
def pick(pool,k,key=lambda x:x):
    by=C.defaultdict(list)
    for x in pool: by[key(x)].append(x)
    out=[]; keys=sorted(by); R.shuffle(keys)
    while len(out)<k and any(by.values()):
        for kk in keys:
            if by[kk] and len(out)<k: out.append(by[kk].pop(R.randrange(len(by[kk]))))
    return out
dom=lambda i:(N.get(i) or B[i])["provenance"]["dealerDomain"]
price=[i for i,f in ch.items() if "priceUsd" in f and i in N]
pr=pick(price,12,dom)
rr=pick(rem,8,lambda r:r["reason"])
ref=[i for i in T["touched"] if i in N and "priceUsd" not in ch.get(i,set())]
rf=pick(ref,5,lambda i:(dom(i),"condition" in ch.get(i,set())))
PPD={"rv.campingworld.com","lamesarv.com","meyersrvsuperstores.com","mcclainsrv.com","apachecamping.com"}
unt=[i for i in N if i not in T["touched"] and i not in ch]
ut=R.sample([i for i in unt if dom(i) in PPD],3)+R.sample([i for i in unt if dom(i) not in PPD],2)
F=["n","category","unit_id","dealer_domain","title","vin","stock","year","rvType","condition_before","condition_after","price_before","price_after","lot_before","lot_after","lastSeen_before","lastSeen_after","listing_url","page_fetched_at","what_changed","CSO_check","CSO_note"]
rows=[]
def row(cat,i,extra=None):
    a=B[i]; z=N.get(i); p=(z or {}).get("provenance",{})
    r={"category":cat,"unit_id":i,"dealer_domain":a["provenance"]["dealerDomain"],"title":a["title"],"vin":a["vin"] or "","stock":a["stockNumber"] or "","year":a["year"],"rvType":a["rvType"],
       "condition_before":a["condition"],"condition_after":z["condition"] if z else "(removed)","price_before":a["priceUsd"]["value"],"price_after":z["priceUsd"]["value"] if z else "(removed)",
       "lot_before":f'{a["dealer"]["city"]}, {a["dealer"]["state"]}',"lot_after":f'{z["dealer"]["city"]}, {z["dealer"]["state"]}' if z else "(removed)",
       "lastSeen_before":a["provenance"]["lastSeenAt"],"lastSeen_after":p.get("lastSeenAt","(removed)"),
       "listing_url":p.get("listingUrl") or a["provenance"].get("listingUrl") or "","page_fetched_at":(p.get("pagePass") or {}).get("fetchedAt",""),
       "what_changed":",".join(sorted(ch.get(i,set()))) or "none","CSO_check":"","CSO_note":""}
    if extra: r.update(extra)
    rows.append(r)
for i in pr: row("price_changed",i)
for h in rr: row("removed:"+h["reason"],h["unit_id"],{"listing_url":h["source_url"],"page_fetched_at":h["fetched_at"],"what_changed":"removed: "+(h["note"] or h["reason"])})
for i in rf: row("refreshed_no_price_change",i)
for i in ut: row("untouched",i)
for k,r in enumerate(rows,1): r["n"]=k
with open(f"{o}/qa_sample_30_pagepass.csv","w",newline="") as f:
    w=csv.DictWriter(f,fieldnames=F); w.writeheader(); w.writerows(rows)
print(len(rows),C.Counter(r["category"] for r in rows))

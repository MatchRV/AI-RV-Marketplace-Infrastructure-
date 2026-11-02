"""qa_fix1.py <base main.gz> <fix1 snapshot.gz> <outdir>: 30-unit QA sample for the fix1 commit (seed 20261102):
the units CSO named + stratified random picks of each fix + a few random unchanged units. Blank CSO_check."""
import json,gzip,sys,csv,random,collections as C
b,n,o=sys.argv[1:4]; R=random.Random(20261102)
B={u["id"]:u for u in json.load(gzip.open(b))["units"]}; N={u["id"]:u for u in json.load(gzip.open(n))["units"]}
held={r["unit_id"]:r for r in csv.DictReader(open(f"{o}/fix1_removed_or_held.csv"))}
ty={r["unit_id"]:r for r in csv.DictReader(open(f"{o}/fix1_type_changes.csv"))}
fc=C.defaultdict(list)
for r in csv.DictReader(open(f"{o}/fix1_field_changes.csv")): fc[r["unit_id"]].append(r)
stores={r["unit_id"] for r in csv.DictReader(open(f"{o}/pagepass_stores_created.csv"))}
named=["vin:4EZTM181XT4100090","vin:573FR3825V9933220","vin:573FS4428PAA16048","vin:4X4FXLS38VF171415","vin:4X4FRLN2XV1911511","vin:4X4FRLH2XV1911679","vin:7T0FX4229VG003780","vin:573FR3326K3319055","vin:1HA3GSC74SN017768","vin:4X4TC1H22VX600818","vin:1FC3E3KN9TDD21041","vin:1NCG811S5P0118224"]
pick=lambda pool,k:R.sample(sorted(set(pool)-set(named)-set(chosen)),min(k,len(set(pool)-set(named)-set(chosen))))
chosen=[]
def add(cat,ids):
    for i in ids: chosen.append(i); rows.append(cat_row(cat,i))
def cat_row(cat,i):
    a=B.get(i); z=N.get(i); h=held.get(i); t=ty.get(i)
    src=(z or a)
    return {"category":cat,"unit_id":i,"dealer_domain":src["provenance"]["dealerDomain"],"title":src["title"],"vin":src["vin"] or "","stock":src["stockNumber"] or "",
      "rvType_before":a["rvType"] if a else "","rvType_after":z["rvType"] if z else "(held/removed)","price_before":a["priceUsd"]["value"] if a else "","price_after":z["priceUsd"]["value"] if z else "(held/removed)",
      "lot_before":f'{a["dealer"]["city"]}, {a["dealer"]["state"]}' if a else "","lot_after":f'{z["dealer"]["city"]}, {z["dealer"]["state"]}' if z else "(held/removed)",
      "lastSeen_after":z["provenance"]["lastSeenAt"] if z else "","listing_url":(h or {}).get("source_url") or (z or a)["provenance"].get("listingUrl",""),
      "what_changed":("held/removed: "+h["reason"]+" — "+h["note"]) if h else "; ".join(f'{r["field"]}: {r["old"]} -> {r["new"]}' for r in fc.get(i,[]) if r["field"]!="provenance.lastSeenAt") or ("type: "+t["basis"] if t else "none"),
      "CSO_check":"","CSO_note":""}
rows=[]
add("cso_named",[i for i in named if i in B])
H=C.defaultdict(list)
for i,h in held.items(): H[h["reason"]].append(i)
add("sold_removed",pick(H["dead_sold"]+H["dead_page_gone"],4))
add("sale_pending_or_on_order",pick(H["sale_pending"]+H["on_order"],3))
add("price_unverified_held",pick(H["price_unverified"],2))
add("type_from_vin_or_page",pick([i for i in ty if i in N],3))
add("type_conflict_held",pick(H["type_conflicts_model_line"],1))
add("price_changed_nov1",pick([i for i,v in fc.items() if any(r["field"]=="priceUsd" for r in v) and i in N],3))
add("store_created_restored",pick([i for i in stores if i in N],1))
add("untouched_random",pick([i for i in N if i not in fc and i not in ty],30-len(rows)))
for k,r in enumerate(rows,1): r["n"]=k
F=["n"]+[k for k in rows[0] if k!="n"]
with open(f"{o}/qa_sample_30_pagepass_fix1.csv","w",newline="") as f: w=csv.DictWriter(f,fieldnames=F); w.writeheader(); w.writerows(rows)
print(len(rows),C.Counter(r["category"] for r in rows))

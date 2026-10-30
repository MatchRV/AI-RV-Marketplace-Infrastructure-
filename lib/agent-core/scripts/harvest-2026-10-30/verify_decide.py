"""Turn verify/pages.jsonl into per-listing decisions. Facts only: a price is the dealer's current price as the
page states it (schema.org offer price, else the first sale/our-price label); MSRP/list/was prices are never used."""
import json,collections as C,sys
B="/workspace/harvest-2026-10-30"
T={}
for l in open(f"{B}/verify/targets.jsonl"):
    t=json.loads(l); T[t["url"]]=t
P={}
for l in open(f"{B}/verify/pages.jsonl"):
    try: p=json.loads(l)
    except Exception: continue
    P[p["url"]]=p
# Host-level template detection: a marker present on most of a host's pages is site chrome, not a unit status.
hs=C.defaultdict(C.Counter)
for p in P.values():
    if p.get("result")!="ok" or p.get("status")!=200: continue
    h=p["host"]; hs[h]["n"]+=1; hs[h]["pend"]+=bool(p.get("pending_text")); hs[h]["absent"]+=(p.get("vin_on_page") is False and p.get("stock_on_page") is not True)
tmpl_pend={h for h,c in hs.items() if c["n"]>=5 and c["pend"]/c["n"]>0.5}
tmpl_abs={h for h,c in hs.items() if c["n"]>=5 and c["absent"]/c["n"]>0.3}
D={}; st=C.Counter(); bysrc=C.defaultdict(C.Counter)
for url,t in T.items():
    p=P.get(url); src="marketcheck" if t["mc"] else "dealer_website"
    if not p: continue
    r=p.get("result")
    if r!="ok":
        D[url]={"action":"keep_unverified","reason":r}; bysrc[src][r]+=1; continue
    s=p.get("status"); bysrc[src]["fetched"]+=1
    if s in (404,410):
        D[url]={"action":"drop","reason":"dead_404_410","status":s}; bysrc[src]["dead_404_410"]+=1; continue
    if s!=200:
        D[url]={"action":"keep_unverified","reason":f"http_{s}"}; bysrc[src][f"http_{s}"]+=1; continue
    av=(p.get("ld_avail") or [None])[0]
    if av in ("SoldOut","Discontinued") or (p.get("pending_text") and p["host"] not in tmpl_pend):
        D[url]={"action":"drop","reason":"sold_or_pending","avail":av}; bysrc[src]["sold_or_pending"]+=1; continue
    if t.get("vin") and p.get("vin_on_page") is False and p.get("stock_on_page") is not True and p["host"] not in tmpl_abs:
        D[url]={"action":"drop","reason":"unit_absent_from_page"}; bysrc[src]["unit_absent_from_page"]+=1; continue
    p0=t.get("price"); p0=round(p0) if p0 else None
    ld=sorted({round(v) for v in (p.get("ld_prices") or []) if v and v>=1000}); sale=[round(v) for v in (p.get("sale_prices") or [])]
    neg={round(v) for v in (p.get("neg_prices") or [])}
    near=lambda a,b: a is not None and b is not None and abs(a-b)<=1
    # A page listing several units (related-units carousels) has several offer/sale prices: only an exact match
    # to the harvested price, or a single unambiguous page price, counts.
    if p0 and ((len(ld)==1 and near(p0,ld[0])) or (any(near(p0,x) for x in sale) and not any(near(p0,x) for x in neg)) or any(near(p0,x) for x in ld) and len(ld)>1 and not any(near(p0,x) for x in neg)):
        price,basis=p0,"harvested_price_matches_page"
    elif len(ld)==1: price,basis=ld[0],"page_schema_offer_price"
    elif len(set(sale))==1: price,basis=sale[0],"page_sale_price_label"
    elif p.get("call_for_price") and not ld and not sale:
        D[url]={"action":"drop","reason":"no_dealer_price_call_for_price"}; bysrc[src]["no_dealer_price_call_for_price"]+=1; continue
    else:
        D[url]={"action":"keep_unverified","reason":"no_unambiguous_price_on_page"}; bysrc[src]["no_unambiguous_price_on_page"]+=1; continue
    if p0 and price!=p0: bysrc[src]["price_changed_to_page"]+=1
    bysrc[src]["live_price_verified"]+=1
    D[url]={"action":"keep","price":price,"basis":basis,"fetched_at":p.get("fetched_at"),"unit_on_page":bool(p.get("vin_on_page") is True or p.get("stock_on_page") is True)}
json.dump(D,open(f"{B}/verify/decisions.json","w"))
rep={"targets":len(T),"pages_read":len(P),"template_pending_hosts":sorted(tmpl_pend),"template_absent_hosts":len(tmpl_abs),"by_source":{k:dict(v) for k,v in bysrc.items()}}
for k,v in bysrc.items():
    f=v["fetched"]; rep.setdefault("dead_rate",{})[k]={"fetched_200_or_404":f,"dead_404_410":v["dead_404_410"],"sold_or_pending":v["sold_or_pending"],"unit_absent":v["unit_absent_from_page"],
        "dead_or_sold_pct":round(100*(v["dead_404_410"]+v["sold_or_pending"]+v["unit_absent_from_page"])/f,1) if f else None}
json.dump(rep,open(f"{B}/verify/report.json","w"),indent=1); print(json.dumps(rep,indent=1)[:3000])

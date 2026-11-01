"""apply_pp2.py <base snapshot.gz> <out snapshot.gz> <report dir>
Page pass (Oct 30/31 2026 re-read of Camping World, La Mesa RV, Meyers, McClain's and Apache listing pages) applied
on top of the live inventory build (main e1a3cb4 = harvest 2026-10-31 trial8d). Facts only:
 - a unit changes only from ITS OWN listing page (CW: stock in heading/sku == stored stock, VIN never conflicts;
   La Mesa: sku == stored stock or VIN equal; Interact: VIN equal or stock + year + title, single page);
 - the page must have been read AFTER the unit's current lastSeenAt (a fresher harvest read always wins);
 - sold / sale pending / gone (404/410, redirected off the unit page) -> unit removed (held back, listed in CSV);
 - price = the unit's own offer only (CW: schema.org offer == visible price == clearPrice.salePrice;
   La Mesa: schema.org offer == the displayed price; Interact: schema.org offer == the unit's data-saleprice under an
   Our/Sale Price label). A price equal to the page's MSRP is not applied. MSRP is never the price and is not touched.
 - condition: filled only where ours is 'unknown' and the page states New/Used consistently; never overwritten;
 - lot: the unit's own page-stated store/lot replaces ours only when the domain already has that store record
   (same id/name/coords as its other units); a page lot with no known store record holds the unit (lot_conflict);
 - lastSeenAt = page read time (basis dealer_page_verified); listingUrl = the page;
 - failed / bot-walled / errored fetches change nothing; specs, VIN, stock, type are never touched.
 - Camping World listings copied onto several records (Oct 14 base): the page confirms one record (VIN equal >
   already at the page's store > first id); the copies are held back as duplicate_record_of_same_listing (same
   listing + same stock; records with a conflicting VIN never match the page in the first place).
 - a changed price that the trial8d suspect_price rule would flag holds the unit (suspect_price_after_pagepass)."""
import json,gzip,sys,os,re,csv,collections as C,datetime as D,statistics,html as H
from urllib.parse import urlparse
PP=os.environ.get("PP_DIR","/workspace/harvest-2026-10-30/pagepass")
src,dst,rep=sys.argv[1],sys.argv[2],sys.argv[3]; os.makedirs(rep,exist_ok=True)
DRY=os.environ.get("DRY")=="1"
snap=json.load(gzip.open(src)); units=snap["units"]; byid={u["id"]:u for u in units}
X=C.defaultdict(list)
for l in open(f"{PP}/extracted.ndjson"):
    j=json.loads(l); X[j["kind"]].append(j)
def pdt(ts): return D.datetime.strptime(ts,"%Y-%m-%dT%H:%M:%S%z")
def iso(ts): return pdt(ts).astimezone(D.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
def zdt(s): return D.datetime.fromisoformat(s.replace("Z","+00:00"))
def tok(s): return set(re.sub(r'[^a-z0-9]+',' ',(s or "").lower()).split())
def sim(a,b):
    A,Bt=tok(a),tok(b); return len(A&Bt)/max(1,len(A|Bt))
def ival(v): return int(v) if v is not None and float(v).is_integer() else v
diff=[]; held=[]; conflicts=[]; st=C.Counter(); per=C.defaultdict(C.Counter); touched={}
units_changed=C.defaultdict(set)
def change(u,field,old,new,url,ts,why):
    diff.append({"unit_id":u["id"],"dealer_domain":u["provenance"]["dealerDomain"],"field":field,"old":"" if old is None else old,"new":"" if new is None else new,"source_url":url,"fetched_at":ts,"rule":why})
    units_changed[u["id"]].add(field)
def fresher(u,ts):
    return pdt(ts)>zdt(u["provenance"]["lastSeenAt"])
def touch(u,url,ts,fields):
    p=u["provenance"]; old=p["lastSeenAt"]; new=iso(ts)
    if zdt(new)>zdt(old):
        change(u,"provenance.lastSeenAt",old,new,url,ts,"unit's own listing page read and live"); p["lastSeenAt"]=new
    p["listingUrl"]=url; p["lastSeenBasis"]="dealer_page_verified"
    p["pagePass"]={"date":"2026-10-30/31","listingUrl":url,"fetchedAt":new,"fields":sorted(set(fields))}
    touched[u["id"]]=url
def hold(u,reason,url,ts,note=""):
    held.append({"unit_id":u["id"],"dealer_domain":u["provenance"]["dealerDomain"],"title":u["title"],"vin":u["vin"] or "","stock":u["stockNumber"] or "","price":u["priceUsd"]["value"],"lastSeenAt_before":u["provenance"]["lastSeenAt"],"reason":reason,"source_url":url,"fetched_at":ts,"note":note})
    per[u["provenance"]["dealerDomain"]]["held_"+reason]+=1
    byid.pop(u["id"],None)
def fill_condition(u,page_cond,url,ts,dom):
    if not page_cond: return False
    if u["condition"]=="unknown":
        change(u,"condition","unknown",page_cond,url,ts,"page states New/Used (heading/title + schema.org itemCondition agree)"); u["condition"]=page_cond
        per[dom]["condition_filled_"+page_cond]+=1; return True
    if u["condition"]!=page_cond:
        conflicts.append({"unit_id":u["id"],"dealer_domain":dom,"field":"condition","ours":u["condition"],"page":page_cond,"source_url":url,"fetched_at":ts}); per[dom]["condition_conflict_not_applied"]+=1
    return False
def set_price(u,pp,url,ts,dom,note,msrp_on_page=None):
    if pp is None or pp<500: return False
    pp=ival(round(pp,2))
    if msrp_on_page is not None and abs(msrp_on_page-pp)<0.5:
        st["price_equals_page_msrp_not_applied"]+=1; return False
    old=u["priceUsd"]["value"]
    newf={"value":pp,"source":"dealer_listing","confidence":"high","note":note,"sourceUrl":url,"observedAt":iso(ts)}
    if old!=pp:
        change(u,"priceUsd",old,pp,url,ts,"unit's own current offer on its listing page; MSRP never used"); per[dom]["price_changed"]+=1
        u["priceUsd"]=newf; return True
    per[dom]["price_confirmed"]+=1; u["priceUsd"]=newf; return False
# existing store records per domain/city/state (lot moves only to a store the build already knows)
STORES=C.defaultdict(C.Counter); SREC={}
for u in units:
    d=u["dealer"]; k=(u["provenance"]["dealerDomain"],(d["city"] or "").strip().lower(),(d["state"] or "").upper())
    STORES[k][d["id"]]+=1; SREC[(k,d["id"])]=d
def slug(x): return re.sub(r"[^a-z0-9]+","-",x.lower()).strip("-")
created=[]
def set_loc(u,city,state,url,ts,dom,seller=None):
    d=u["dealer"]; state=state.upper()
    if (d["city"] or "").strip().lower()==city.strip().lower() and (d["state"] or "").upper()==state: return "same"
    k=(dom,city.strip().lower(),state)
    if not STORES.get(k):
        # fix1 (CSO QA): the unit's own page names a store this build has no record for. The page is the fact, so a
        # store record is created from it (id <domain>:<city slug>, seller name from the page when it states one,
        # coordinates resolved at load from the page-stated city) instead of hiding a live unit.
        sid=f"{dom}:{slug(city)}"
        if any(i==sid for (kk,i) in SREC if kk!=k): sid=f"{dom}:{slug(city)}-{state.lower()}"
        nd={**d,"id":sid,"name":seller or d["name"],"city":city.strip(),"state":state,"lat":None,"lng":None}
        STORES[k][sid]+=1; SREC[(k,sid)]=nd; per[dom]["store_created_from_own_page"]+=1; created.append({"store_id":sid,"name":nd["name"],"city":nd["city"],"state":state,"unit_id":u["id"],"source_url":url})
    else:
        sid=STORES[k].most_common(1)[0][0]; nd=dict(SREC[(k,sid)])
    old=f'{d["id"]} | {d["city"]}, {d["state"]}'
    u["dealer"]=nd
    change(u,"dealer",old,f'{nd["id"]} | {nd["city"]}, {nd["state"]}',url,ts,"store/lot stated on the unit's own page")
    per[dom]["lot_moved"]+=1; return "moved"
def apply_loc(u,city,state,url,ts,dom,fields,seller=None):
    r=set_loc(u,city,state,url,ts,dom,seller)
    if r=="moved": fields.append("dealer"); return True
    if r=="unknown_store":
        hold(u,"lot_conflict_own_page_store_unknown",url,ts,f"page lot {city}, {state}; ours {u['dealer']['city']}, {u['dealer']['state']}"); return False
    return True
SOLD=("SoldOut","OutOfStock","Discontinued")
# ── Camping World ────────────────────────────────────────────────────────────
cwres=C.defaultdict(list)
for j in X["cw"]: _,uid,stock=j["key"].split("|",2); cwres[uid].append((stock,j))
def cw_outcomes(u,rs):
    outcome=[]
    for stock,j in rs:
        x=j.get("x") or {}
        if j.get("result")!="ok": outcome.append(("fetch_"+str(j.get("result")),stock,j,None)); continue
        if j.get("http") in (404,410) or not x.get("onUnitPage"): outcome.append(("gone",stock,j,None)); continue
        ps=(x.get("h1Stock") or x.get("ldSku") or "").lower()
        if ps!=stock.lower() or (u["stockNumber"] or "").lower()!=stock.lower(): outcome.append(("mismatch_stock",stock,j,None)); continue
        pv=(x.get("ldVin") or "").upper(); ov=(u["vin"] or "").upper()
        py=int(x.get("ldYear") or x.get("h1Year") or 0)
        if pv and ov and pv!=ov: outcome.append(("mismatch_vin",stock,j,None)); continue
        if not (pv and ov) and (py!=u["year"] or sim(x.get("ldName") or x.get("h1"),u["title"])<0.5): outcome.append(("mismatch_unit",stock,j,None)); continue
        outcome.append(("match",stock,j,x))
    return outcome
OUT={}; bypage=C.defaultdict(list)
for uid,rs in cwres.items():
    u=byid.get(uid)
    if not u: st["cw_target_not_in_build"]+=1; continue
    OUT[uid]=cw_outcomes(u,rs)
    m=next((o for o in OUT[uid] if o[0]=="match"),None)
    if m: bypage[m[1].lower()].append(uid)
dup_losers={}
for stock,uids in bypage.items():
    if len(uids)<2: continue
    def rank(uid):
        u=byid[uid]; x=next(o for o in OUT[uid] if o[0]=="match")[3]
        vin_eq=bool(u["vin"] and (x.get("ldVin") or "").upper()==u["vin"].upper())
        city_eq=(u["dealer"]["city"] or "").lower()==(x.get("h1City") or "").lower() and (u["dealer"]["state"] or "").upper()==(x.get("h1State") or "")
        return (not vin_eq, not city_eq, uid)
    keep=min(uids,key=rank)
    for uid in uids:
        if uid!=keep: dup_losers[uid]=keep
dom="rv.campingworld.com"
for uid,outcome in OUT.items():
    u=byid.get(uid)
    if not u: continue
    m=next((o for o in outcome if o[0]=="match"),None)
    if m and not fresher(u,m[2]["fetchedAt"]): st["cw_unit_fresher_than_page"]+=1; continue
    if m and uid in dup_losers:
        hold(u,"duplicate_record_of_same_listing",m[2]["finalUrl"],m[2]["fetchedAt"],"kept "+dup_losers[uid]); st["cw_duplicate_record_held"]+=1; continue
    if not m:
        kinds={o[0] for o in outcome}
        if kinds=={"gone"} and u["stockNumber"]:
            j=outcome[0][2]
            if not fresher(u,j["fetchedAt"]): st["cw_unit_fresher_than_page"]+=1; continue
            hold(u,"dead_page_gone",j["url"],j["fetchedAt"],f"http {j.get('http')} final {j.get('finalUrl')}"); st["cw_dead_gone"]+=1
        else: st["cw_unconfirmed_"+"+".join(sorted(kinds))]+=1
        continue
    _,stock,j,x=m; ts=j["fetchedAt"]; url=(x.get("ldUrl") or j["finalUrl"]); st["cw_page_matched"]+=1
    if x.get("ldAvailability") in SOLD or x.get("salePendingText"):
        hold(u,"dead_sold",url,ts,f"availability {x.get('ldAvailability')} salePending {x.get('salePendingText')}"); st["cw_dead_sold"]+=1; continue
    fields=[]
    c,s=x.get("h1City"),x.get("h1State")
    if c and s and re.fullmatch(r'[A-Z]{2}',s):
        if not apply_loc(u,c,s,url,ts,dom,fields,x.get("ldSeller")): st["cw_lot_unknown_store_held"]+=1; continue
    hc,lc=x.get("h1Condition"),x.get("ldCondition")
    if fill_condition(u,hc if hc and lc in (None,hc) else None,url,ts,dom): fields.append("condition")
    cand=[v for v in (x.get("ldPrice"),x.get("visiblePrice"),x.get("cpSale")) if v is not None]
    pp=cand[0] if len(cand)>=2 and all(abs(v-cand[0])<0.5 for v in cand) else None
    if cand and pp is None: st["cw_price_ambiguous_not_applied"]+=1
    if set_price(u,pp,url,ts,dom,"Dealer's current asking price on the unit's own listing page (schema.org offer = displayed price = sale price); not MSRP.",x.get("cpMsrp")): fields.append("priceUsd")
    touch(u,url,ts,fields)
# ── La Mesa RV ───────────────────────────────────────────────────────────────
dom="lamesarv.com"
def lm_page_prices(j):
    t=gzip.open(f"{PP}/pages/{j['page']}.html.gz","rt").read()
    ms=re.search(r'data-testid="unit-was-price-label">\s*MSRP\s*\$([0-9,]+)',t)
    return t,(float(ms.group(1).replace(',','')) if ms else None)
for j in X["lamesa"]:
    uid=j["key"].split("|",1)[1]; u=byid.get(uid)
    if not u: st["lm_target_not_in_build"]+=1; continue
    x=j.get("x") or {}; ts=j.get("fetchedAt")
    if j.get("result")!="ok": st["lm_fetch_"+str(j.get("result"))]+=1; continue
    if not fresher(u,ts): st["lm_unit_fresher_than_page"]+=1; continue
    if j.get("http") in (404,410): hold(u,"dead_page_gone",j["url"],ts,f"http {j.get('http')}"); st["lm_dead_gone"]+=1; continue
    stock=(u["stockNumber"] or "").lower(); fp_=urlparse(j["finalUrl"]).path.lower().rstrip('/')
    if not x.get("ldSku") and stock and not fp_.endswith("/"+stock): hold(u,"dead_page_gone",j["url"],ts,"redirected off the unit page: "+j["finalUrl"]); st["lm_dead_gone_redirect"]+=1; continue
    pv=(x.get("ldVin") or "").upper(); ov=(u["vin"] or "").upper()
    if pv and ov and pv!=ov: st["lm_mismatch_vin"]+=1; continue
    if (x.get("ldSku") or "").lower()!=stock and not (ov and pv==ov): st["lm_mismatch"]+=1; continue
    url=j["finalUrl"]; st["lm_page_matched"]+=1
    if x.get("ldAvailability") in SOLD: hold(u,"dead_sold",url,ts,"availability "+x.get("ldAvailability")); st["lm_dead_sold"]+=1; continue
    fields=[]
    L=x.get("unitLocations") or []
    if len(L)==1:
        ml=re.match(r'^(.+?),\s*([A-Z]{2})$',L[0])
        if ml:
            city=ml.group(1).strip(); mp=re.match(r'^(.+?)\s*\((.+?)\)$',city)
            if mp:  # "Orlando (Sanford), FL": the lot is in the parenthesised city when that store is known
                city=mp.group(2).strip() if STORES.get((dom,mp.group(2).strip().lower(),ml.group(2))) else mp.group(1).strip()
            if not apply_loc(u,city,ml.group(2),url,ts,dom,fields): st["lm_lot_unknown_store_held"]+=1; continue
    else: st["lm_location_not_single"]+=1
    if fill_condition(u,x.get("ldCondition"),url,ts,dom): fields.append("condition")
    p=x.get("ldPrice")
    if p:
        t,msrp=lm_page_prices(j)
        shown=f"${int(p):,}" in t
        if shown:
            if set_price(u,p,url,ts,dom,"Dealer's current price on the unit's own listing page (schema.org offer = displayed price); not MSRP.",msrp): fields.append("priceUsd")
        else: st["lm_price_not_displayed_not_applied"]+=1
    touch(u,url,ts,fields)
# ── Interact sites: Meyers, McClain's, Apache ───────────────────────────────
IDOM={"www.meyersrvsuperstores.com":"meyersrvsuperstores.com","www.mcclainsrv.com":"mcclainsrv.com","www.apachecamping.com":"apachecamping.com"}
pages=C.defaultdict(lambda:{"vin":C.defaultdict(list),"stock":C.defaultdict(list)})
for j in X["interact"]:
    if j.get("result")!="ok" or j.get("http")!=200: st["ia_page_"+str(j.get("result"))+"_"+str(j.get("http"))]+=1; continue
    x=j.get("x") or {}; d=IDOM[j["host"]]
    if not x.get("lotCity"): st["ia_page_no_unit_lot"]+=1; continue
    if x.get("ldVin") and len(x["ldVin"])==17: pages[d]["vin"][x["ldVin"].upper()].append(j)
    for s in {x.get("ldSku"),x.get("lotStock")}-{None,""}: pages[d]["stock"][s.lower()].append(j)
ia_used={}
def money(s):
    m=re.fullmatch(r'\$?([0-9,]+(?:\.[0-9]{2})?)',(s or "").strip()); return float(m.group(1).replace(',','')) if m else None
for u in sorted(list(byid.values()),key=lambda u:(not u["vin"],u["id"])):
    dom=u["provenance"]["dealerDomain"]
    if dom not in IDOM.values(): continue
    P=pages[dom]; cands=[]; how="vin"
    if u["vin"]: cands=P["vin"].get(u["vin"].upper(),[])
    if not cands and u["stockNumber"]:
        how="stock"; ok=[]
        for j in P["stock"].get(u["stockNumber"].lower(),[]):
            x=j["x"]; ny=re.match(r'^(\d{4})\b',x.get("ldName") or ""); pv=(x.get("ldVin") or "").upper()
            if ny and int(ny.group(1))==u["year"] and not (pv and u["vin"] and pv!=u["vin"].upper()) and sim(x.get("ldName"),u["title"])>=0.4: ok.append(j)
        cands=ok
    cands={j["url"]:j for j in cands}
    if len(cands)!=1:
        st[f"ia_{dom}_"+("no_page" if not cands else "ambiguous")]+=1; continue
    j=list(cands.values())[0]; x=j["x"]; ts=j["fetchedAt"]; url=j["finalUrl"]
    if not fresher(u,ts): st[f"ia_{dom}_unit_fresher_than_page"]+=1; continue
    if url in ia_used: st[f"ia_{dom}_second_record_same_page_skipped"]+=1; continue
    ia_used[url]=u["id"]; st[f"ia_{dom}_matched_by_{how}"]+=1
    if x.get("soldText") or x.get("ldAvailability") in SOLD: hold(u,"dead_sold",url,ts,f"soldText {x.get('soldText')} availability {x.get('ldAvailability')}"); continue
    fields=[]
    if x.get("lotCity") and re.fullmatch(r'[A-Z]{2}',x.get("lotState") or ""):
        if not apply_loc(u,x["lotCity"],x["lotState"],url,ts,dom,fields): st[f"ia_{dom}_lot_unknown_store_held"]+=1; continue
    tc,lc=x.get("titleCondition"),x.get("ldCondition")
    if fill_condition(u,tc if tc and lc in (None,tc) else None,url,ts,dom): fields.append("condition")
    sp=money(x.get("saleprice")); lab=(x.get("salepricelabel") or "").lower()
    if x.get("ldPrice") and sp and abs(sp-x["ldPrice"])<0.5 and re.search(r'our price|sale price',lab) and "msrp" not in lab:
        if set_price(u,x["ldPrice"],url,ts,dom,"Dealer's current price on the unit's own listing page (schema.org offer = the unit's Our/Sale Price); not MSRP."): fields.append("priceUsd")
    else: st[f"ia_{dom}_price_not_unit_own_not_applied"]+=1
    touch(u,url,ts,fields)
# ── suspect_price check (trial8d rule) on changed prices ────────────────────
def yr(u):
    try: return int(u.get('year'))
    except Exception: return None
def fpl(u):
    t=f"{u.get('trim') or ''} {u.get('model') or ''} {u.get('title') or ''}".upper()
    m=[x for x in re.findall(r'\b(\d{2,4}[A-Z]{0,6}\d?[A-Z]{0,3})\b',t) if not re.fullmatch(r'(19|20)\d\d',x)]
    return m[0] if m else None
def mk(u): return re.sub(r'[^a-z]','',(u.get('make') or '').lower().replace(' rv','').replace('rv',''))
def ml(u): return ' '.join(re.sub(r'[^a-z0-9 ]','',(u.get('model') or '').lower()).split()[:2])
G1=C.defaultdict(list); G2=C.defaultdict(list); G3=C.defaultdict(list)
for u in byid.values():
    p=(u.get('priceUsd') or {}).get('value'); y=yr(u); n=u.get('condition')=='new'
    if p and y:
        if fpl(u): G1[(mk(u),fpl(u),n,y)].append(p)
        G2[(mk(u),ml(u),u.get('rvType'),n,y)].append(p); G3[(u.get('rvType'),n,y)].append(p)
M1={k:statistics.median(v) for k,v in G1.items() if len(v)>=3}; M2={k:statistics.median(v) for k,v in G2.items() if len(v)>=8}; M3={k:statistics.median(v) for k,v in G3.items() if len(v)>=20}
for uid in [i for i,f in units_changed.items() if "priceUsd" in f or "condition" in f]:
    u=byid.get(uid)
    if not u: continue
    p=u['priceUsd']['value']; y=yr(u); new=u.get('condition')=='new'; why=None
    if p and (new or (y is not None and y>=2025)):
        k1=(mk(u),fpl(u),new,y); k2=(mk(u),ml(u),u.get('rvType'),new,y); k3=(u.get('rvType'),new,y); k1n=(mk(u),fpl(u),True,y)
        if fpl(u) and k1 in M1 and p<0.40*M1[k1]: why=f"price {p} < 40% of make+floorplan median {M1[k1]:.0f}"
        elif not new and y>=2026 and fpl(u) and k1 not in M1 and k1n in M1 and p<0.30*M1[k1n]: why=f"used {y} at {p} < 30% of new median {M1[k1n]:.0f}"
        elif not (fpl(u) and k1 in M1) and k2 in M2 and p<0.35*M2[k2]: why=f"price {p} < 35% of make/model median {M2[k2]:.0f}"
        elif not (fpl(u) and k1 in M1) and k2 not in M2 and k3 in M3 and k3[0] in ('class_a','class_b','class_c','fifth_wheel') and p<0.20*M3[k3]: why=f"price {p} < 20% of type median {M3[k3]:.0f}"
    if why: hold(u,"suspect_price_after_pagepass",u['provenance'].get('listingUrl',''),"",why); st["suspect_price_held"]+=1
# ── write ────────────────────────────────────────────────────────────────────
out_units=[u for u in units if u["id"] in byid]
heldids={h["unit_id"] for h in held}
for k in list(units_changed):
    if k in heldids: del units_changed[k]
cat=C.Counter()
for uid in touched:
    if uid in heldids: continue
    f=units_changed.get(uid,set())
    if "priceUsd" in f: cat["price_changed"]+=1
    if "condition" in f: cat["condition_filled"]+=1
    if "dealer" in f: cat["lot_moved"]+=1
    if f=={"provenance.lastSeenAt"}: cat["lastSeen_only"]+=1
    if not f: cat["confirmed_no_change"]+=1
    if "provenance.lastSeenAt" in f: cat["lastSeen_refreshed_any"]+=1
cat["removed_total"]=len(held)
for r,n in C.Counter(h["reason"] for h in held).items(): cat["removed_"+r]=n
builtAt=os.environ.get("BUILT_AT") or snap["builtAt"]
bt=zdt(builtAt)
ls=[zdt(u["provenance"]["lastSeenAt"]) for u in out_units]
s=dict(snap["stats"]); s.update(units=len(out_units),dealers=len({u["dealer"]["id"] for u in out_units}),uniqueVins=len({u["vin"] for u in out_units if u["vin"]}),
  withLength=sum(1 for u in out_units if u["lengthFt"]["value"] is not None),withSleeps=sum(1 for u in out_units if u["sleeps"]["value"] is not None),
  lastSeenRange={"oldest":min(ls).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]+"Z","newest":max(ls).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]+"Z"},
  seenWithinDaysOfBuiltAt={f"{d}d":sum(1 for t in ls if (bt-t).total_seconds()<=d*86400) for d in (14,21,30,45)},
  pagePass_2026_10_30={"unitsTouched":len([t for t in touched if t not in heldids]),"heldBack":len(held),"categories":dict(cat),"steps":dict(st)})
summary={"builtAt":builtAt,"in":len(units),"out":len(out_units),"categories":dict(cat),"fieldChangesByField":dict(C.Counter(d["field"] for d in diff if d["unit_id"] not in heldids)),
 "heldByReason":dict(C.Counter(h["reason"] for h in held)),"heldByDomain":dict(C.Counter(h["dealer_domain"] for h in held)),"conflictsNotApplied":len(conflicts),"steps":dict(st),"perDomain":{k:dict(v) for k,v in per.items()}}
json.dump(summary,open(f"{rep}/pagepass_apply_summary.json","w"),indent=1)
def wcsv(p,rows,fn=None):
    with open(p,"w",newline="") as f:
        if not rows and not fn: return
        w=csv.DictWriter(f,fieldnames=fn or list(rows[0].keys())); w.writeheader(); w.writerows(rows)
wcsv(f"{rep}/pagepass_field_changes.csv",[d for d in diff if d["unit_id"] not in heldids])
wcsv(f"{rep}/pagepass_removed_units.csv",held)
wcsv(f"{rep}/pagepass_stores_created.csv",created,["store_id","name","city","state","unit_id","source_url"])
wcsv(f"{rep}/pagepass_conflicts_not_applied.csv",conflicts,["unit_id","dealer_domain","field","ours","page","source_url","fetched_at"])
json.dump({"touched":{k:v for k,v in touched.items() if k not in heldids},"changed":{k:sorted(v) for k,v in units_changed.items()}},open(f"{rep}/pagepass_touched.json","w"))
print(json.dumps({k:v for k,v in summary.items() if k!="perDomain"},indent=1))
if DRY: sys.exit(0)
note=snap["datasetNote"]+" 2026-10-30/31 page pass: Camping World, La Mesa RV, Meyers, McClain's and Apache units re-read from their own listing pages (current offer price, lastSeen, condition where ours was unknown, page-stated store); units whose page is sold or gone are removed."
# streaming writer: header with units spliced in (avoids one giant string)
hdr={"schemaVersion":snap["schemaVersion"],"builtAt":builtAt,"datasetNote":note,"stats":s,"units":[]}
h=json.dumps(hdr,ensure_ascii=True,separators=(",",":")); assert h.endswith('"units":[]}')
with gzip.open(dst+".tmp","wb",compresslevel=9) as f:
    f.write(h[:-2].encode("ascii"))
    for i,u in enumerate(out_units):
        f.write(((b"," if i else b"")+json.dumps(u,ensure_ascii=True,separators=(",",":")).encode("ascii")))
    f.write(b"]}")
os.replace(dst+".tmp",dst)

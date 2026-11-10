"""fix1.py <pagepass snapshot.gz> <out snapshot.gz> <report dir> — CSO QA fixes on the page pass (Nov 1 2026).
 1+3) Meyers / McClain's / Apache: every unit with a listing URL re-read on Nov 1 (pp3/fetch; robots obeyed, 1 request in
    flight per host, >=1.6 s apart, stop at any bot wall). Only the unit's OWN page facts are used (parse_ia.py: the page's
    own unit element + the unit-title block badges/type label; never description text or similar-unit lists):
    - 404/410 or redirected off the unit page -> removed (dead_page_gone); own badge/heading "Sold" -> removed (dead_sold);
      "Sale Pending" -> held sale_pending; "On Order" / "Available To Order" / "Arriving Soon" -> held on_order;
    - price = the unit's own Our/Sale Price (> 0). MSRP is NEVER the price: a page that shows only an MSRP (sale price 0
      or absent) holds the unit as price_unverified when our stored price differs from that MSRP; when the stored price
      equals the only shown MSRP it is left as is and counted (price_equals_only_msrp_shown);
    - the Nov 1 read is newer than every earlier read, so it applies (this is what the Oct 30 pass could not do for the
      units the Oct 31 harvest had read later);
    - type: the unit's own dealer-stated type (data-type) when it says fifth wheel / toy hauler and ours is another towable
      type (scheme: "Toy Hauler Fifth Wheel" -> toy_hauler, rvtype.norm_type);
    - lot from the own element (store record created from the page when the build has none), condition filled only
      where ours is unknown, lastSeen = read time.
 2) Build-wide: travel_trailer units whose VIN carries the manufacturer's fifth-wheel body code (Forest River 4X4F,
    Brinkley 7T0F, Keystone 4YDF, Grand Design 573F, Alliance 7M5F, Jayco 1UJC; valid VIN, make agrees) -> fifth_wheel,
    or toy_hauler when the dealer's text or the manufacturer model line is a toy hauler (XLR Nitro, Brinkley Model G,
    Momentum, Fuzion, Raptor, Carbon, Vengeance/Rogue, Seismic, Voltage, Valor...). When the dealer's own title/model
    says travel trailer (or the page type does), the unit is held as type_conflicts_model_line."""
import json,gzip,sys,os,re,csv,collections as C,datetime as D
sys.path.insert(0,os.path.dirname(__file__)); from parse_ia import parse
sys.path.insert(0,'/workspace/harvest-2026-10-31/tools'); from rvtype import norm_type
F=os.environ.get("FETCH_DIR","/workspace/harvest-2026-10-30/pp3/fetch")
src,dst,rep=sys.argv[1:4]; os.makedirs(rep,exist_ok=True); DRY=os.environ.get("DRY")=="1"
snap=json.load(gzip.open(src)); units=snap["units"]; byid={u["id"]:u for u in units}
def iso(ts): return D.datetime.strptime(ts,"%Y-%m-%dT%H:%M:%S%z").astimezone(D.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
def slug(x): return re.sub(r"[^a-z0-9]+","-",x.lower()).strip("-")
VINOK=lambda v: bool(v) and len(v)==17 and re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',v.upper()) is not None and re.search(r'\d',v) and v[-4:].isdigit()
diff=[]; held=[]; st=C.Counter(); typerows=[]; created=[]; ch=C.defaultdict(set)
def change(u,f,o,n,url,ts,why):
    diff.append({"unit_id":u["id"],"dealer_domain":u["provenance"]["dealerDomain"],"field":f,"old":"" if o is None else o,"new":"" if n is None else n,"source_url":url,"fetched_at":ts,"rule":why}); ch[u["id"]].add(f)
def hold(u,reason,url,ts,note=""):
    held.append({"unit_id":u["id"],"dealer_domain":u["provenance"]["dealerDomain"],"title":u["title"],"vin":u["vin"] or "","stock":u["stockNumber"] or "","rvType":u["rvType"],"price":u["priceUsd"]["value"],"reason":reason,"source_url":url,"fetched_at":ts,"note":note})
    byid.pop(u["id"],None)
STORES=C.defaultdict(C.Counter); SREC={}
for u in units:
    d=u["dealer"]; k=(u["provenance"]["dealerDomain"],(d["city"] or "").strip().lower(),(d["state"] or "").upper()); STORES[k][d["id"]]+=1; SREC[(k,d["id"])]=d
def set_loc(u,city,state,url,ts):
    dom=u["provenance"]["dealerDomain"]; d=u["dealer"]; state=state.upper()
    if (d["city"] or "").strip().lower()==city.strip().lower() and (d["state"] or "").upper()==state: return
    k=(dom,city.strip().lower(),state)
    if STORES.get(k): nd=dict(SREC[(k,STORES[k].most_common(1)[0][0])])
    else:
        sid=f"{dom}:{slug(city)}"
        if any(i==sid for (kk,i) in SREC if kk!=k): sid=f"{dom}:{slug(city)}-{state.lower()}"
        nd={**d,"id":sid,"city":city.strip(),"state":state,"lat":None,"lng":None}; STORES[k][sid]+=1; SREC[(k,sid)]=nd
        created.append({"store_id":sid,"name":nd["name"],"city":nd["city"],"state":state,"unit_id":u["id"],"source_url":url}); st["store_created"]+=1
    change(u,"dealer",f'{d["id"]} | {d["city"]}, {d["state"]}',f'{nd["id"]} | {nd["city"]}, {nd["state"]}',url,ts,"lot stated in the unit's own page element"); u["dealer"]=nd; st["lot_moved"]+=1
# ── 1+3: Nov 1 own-page re-read of the three Interact dealers ──────────────────
tg={json.loads(l)["key"]:json.loads(l) for l in open(f"{F}/targets.ndjson")}
res={}
for l in open(f"{F}/results.ndjson"):
    j=json.loads(l); res[j["key"]]=j   # last line per key wins (retries)
latest=None
TH_LINE=r'xlr nitro|brinkley model gx?\b|\bmodel gx?\b|momentum|fuzion|raptor|carbon|vengeance|rogue|seismic|voltage|valor|torque|gravity|road warrior|toy hauler'
# Records of the same listing (same listing URL, same stock, no two different valid VINs) at these dealers: the
# Oct 14 base record and the Oct 31 harvest record of one unit. The page confirms ONE unit: keep the valid-VIN record
# (else the freshest), hold the copy as duplicate_record_of_same_listing (never merged across a VIN/stock conflict).
IA={"mcclainsrv.com","apachecamping.com","meyersrvsuperstores.com"}; byurl=C.defaultdict(list); keepfor={}
for u in units:
    if u["provenance"]["dealerDomain"] in IA and u["provenance"].get("listingUrl"): byurl[u["provenance"]["listingUrl"]].append(u)
for url,us in byurl.items():
    if len(us)<2: continue
    vins={(x["vin"] or "").upper() for x in us if VINOK(x["vin"] or "")}; stocks={(x["stockNumber"] or "").strip().lower() for x in us}
    if len(vins)>1 or len(stocks)!=1 or "" in stocks: st["same_url_records_conflict_not_merged"]+=len(us); continue
    keep=sorted(us,key=lambda x:(not VINOK(x["vin"] or ""),-D.datetime.fromisoformat(x["provenance"]["lastSeenAt"].replace("Z","+00:00")).timestamp(),x["id"]))[0]
    keepfor[url]=keep["id"]
    for x in us:
        if x is not keep: hold(x,"duplicate_record_of_same_listing",url,"",f"kept {keep['id']} (same listing URL and stock {x['stockNumber']}, no VIN conflict)"); st["duplicate_record_of_same_listing"]+=1
for key,t in tg.items():
    if t["url"] in keepfor: t["unit"]=keepfor[t["url"]]
    u=byid.get(t["unit"]); j=res.get(key)
    if not u: st["ia_unit_not_in_build"]+=1; continue
    dom=u["provenance"]["dealerDomain"]
    if not j: st[f"{dom}:not_fetched"]+=1; continue
    if j.get("result")!="ok": st[f"{dom}:fetch_{j.get('result')}_no_change"]+=1; continue
    ts=j["fetchedAt"]; url=j.get("finalUrl") or j["url"]
    if j.get("http") in (404,410): hold(u,"dead_page_gone",j["url"],ts,f"HTTP {j['http']}"); st[f"{dom}:gone_http_{j['http']}"]+=1; continue
    if j.get("http")!=200: st[f"{dom}:http_{j.get('http')}_no_change"]+=1; continue
    page=gzip.open(f"{F}/pages/{j['page']}.html.gz","rt").read(); e=parse(page,url)
    if not e["onUnitPage"]: hold(u,"dead_page_gone",j["url"],ts,"redirected off the unit page to "+url); st[f"{dom}:gone_redirect"]+=1; continue
    if not e["ownElement"]: st[f"{dom}:no_own_unit_element_no_change"]+=1; continue
    pv=(e.get("specVin") or "").upper(); ov=(u["vin"] or "").upper()
    if VINOK(pv) and VINOK(ov) and pv!=ov: st[f"{dom}:vin_conflict_no_change"]+=1; continue
    ps=(e.get("stocknumber") or e.get("stockText") or "").strip().lower(); os_=(u["stockNumber"] or "").strip().lower()
    if ps and os_ and ps!=os_ and not (VINOK(pv) and pv==ov): st[f"{dom}:stock_conflict_no_change"]+=1; continue
    st[f"{dom}:own_page_read"]+=1; latest=max(latest or ts,ts,key=lambda x:D.datetime.strptime(x,"%Y-%m-%dT%H:%M:%S%z"))
    bc=set(e.get("badgeClasses") or []); h1=(e.get("h1") or "")
    if "tag-sold" in bc or re.search(r'^\s*sold\b|\bsold\s*$',h1,re.I): hold(u,"dead_sold",url,ts,"own badge/heading Sold"); st[f"{dom}:sold"]+=1; continue
    if "tag-sale-pending" in bc or re.search(r'\bsale\s+pending\b',h1,re.I): hold(u,"sale_pending",url,ts,"own badge/heading Sale Pending"); st[f"{dom}:sale_pending"]+=1; continue
    ob=bc&{"tag-on-order","tag-available-to-order","tag-arriving-soon"}
    if ob or re.search(r'\bon\s+order\b|available\s+to\s+order',h1,re.I): hold(u,"on_order",url,ts,"own badge "+",".join(sorted(ob)) if ob else "heading"); st[f"{dom}:on_order"]+=1; continue
    fields=[]
    sp=e.get("salePriceNum"); lab=(e.get("salepricelabel") or "").lower(); ms=e.get("msrpNum")
    old=u["priceUsd"]["value"]
    if sp and sp>=500 and re.search(r'our price|sale price|price',lab) and "msrp" not in lab:
        newp=int(sp) if float(sp).is_integer() else round(sp,2)
        nf={"value":newp,"source":"dealer_listing","confidence":"high","note":"Dealer's current Our/Sale Price on the unit's own listing page (read 2026-11-01); not MSRP.","sourceUrl":url,"observedAt":iso(ts)}
        if old!=newp: change(u,"priceUsd",old,newp,url,ts,"unit's own Our/Sale Price, Nov 1 read"); st[f"{dom}:price_changed"]+=1; fields.append("priceUsd")
        else: st[f"{dom}:price_confirmed"]+=1
        u["priceUsd"]=nf
    elif ms and ms>=500:
        if old is None or abs(old-ms)>=0.5: hold(u,"price_unverified",url,ts,f"page shows only MSRP {ms:.0f} (sale price {e.get('saleprice')}); stored price {old}"); st[f"{dom}:price_unverified"]+=1; continue
        if os.environ.get("HOLD_MSRP_ONLY_EQUAL","1")=="1":  # fix2 (CSO ruling Nov 1): an MSRP is never the price, even when ours equals it
            hold(u,"price_unverified",url,ts,f"page shows only MSRP {ms:.0f} (sale price {e.get('saleprice')}); stored price {old} equals that MSRP"); st[f"{dom}:price_unverified_equals_only_msrp"]+=1; continue
        st[f"{dom}:price_equals_only_msrp_shown"]+=1
    else: st[f"{dom}:no_price_on_page_kept"]+=1
    pt=norm_type(e.get("type") or e.get("typeLabel"))
    if pt in ("fifth_wheel","toy_hauler") and u["rvType"] in ("travel_trailer","fifth_wheel","toy_hauler") and u["rvType"]!=pt:
        typerows.append({"unit_id":u["id"],"dealer_domain":dom,"title":u["title"],"vin":u["vin"] or "","old":u["rvType"],"new":pt,"basis":f'own page type "{e.get("type")}"',"source_url":url})
        change(u,"rvType",u["rvType"],pt,url,ts,"dealer-stated type on the unit's own page"); u["rvType"]=pt; u["rvTypeSource"]="dealer_listing_page"; st["type_from_own_page"]+=1; fields.append("rvType")
    elif pt and pt!=u["rvType"]: st[f"{dom}:page_type_differs_not_fw_not_applied"]+=1
    u["_pageType"]=pt
    if e.get("lot-city") and re.fullmatch(r'[A-Z]{2}',e.get("lot-state") or ""): set_loc(u,e["lot-city"],e["lot-state"],url,ts)
    mc=re.match(r'^(New|Used|Pre-Owned)\b',h1)
    if mc and u["condition"]=="unknown":
        c="new" if mc.group(1)=="New" else "used"; change(u,"condition","unknown",c,url,ts,"own page heading"); u["condition"]=c; fields.append("condition")
    p=u["provenance"]; nls=iso(ts)
    if nls>p["lastSeenAt"]: change(u,"provenance.lastSeenAt",p["lastSeenAt"],nls,url,ts,"own page read and live (Nov 1)"); p["lastSeenAt"]=nls
    p["listingUrl"]=url; p["lastSeenBasis"]="dealer_page_verified"; p["pagePassFix1"]={"fetchedAt":nls,"listingUrl":url,"fields":sorted(set(fields))}
# ── 2: build-wide fifth-wheel VIN body code on travel_trailer units ─────────────
FW={"4X4F":r"forest river|palomino|rockwood|xlr|cedar creek|sandpiper|riverstone|vilano|cardinal|salem|wildwood|flagstaff|cherokee|vengeance|impression|columbus|r-pod",
    "7T0F":r"brinkley","4YDF":r"keystone|dutchmen|coleman","573F":r"grand design","7M5F":r"alliance","1UJC":r"jayco"}
WEAK={"573F":r"reflection\s*(?:150|100)|fifth\s*wheel|5th\s*wheel|solitude|momentum","7T0F":r"model\s*(?:z|gx?)\b|fifth\s*wheel|5th\s*wheel"}
for u in list(byid.values()):
    if u["rvType"]!="travel_trailer": continue
    v=(u["vin"] or "").upper()
    if not VINOK(v) or v[:4] not in FW or not re.search(FW[v[:4]],(u["make"] or "").lower()): continue
    txt=f'{u["title"]} {u["model"] or ""} {u.get("trim") or ""}'.lower()
    url=u["provenance"].get("listingUrl","")
    if v[:4] in WEAK:
        # fix2 (CSO QA fix1): Grand Design 573F and Brinkley 7T0F also appear on travel trailers (Reflection 317RSTS,
        # Transcend Xplor, Imagine, Brinkley Model I), so the VIN code alone never retypes: the model line must confirm.
        if not re.search(WEAK[v[:4]],txt) or (v[:4]=="573F" and re.search(r'\bmav\b|imagine|transcend|\d{3}[a-z]*ts\b',txt)):
            st[f"vin_{v[:4]}_not_confirmed_by_model_line_left_as_is"]+=1; continue
    if re.search(r'travel\s*trailer|\btt\b',txt) or u.get("_pageType")=="travel_trailer":
        hold(u,"type_conflicts_model_line",url,"",f"VIN {v[:4]} = manufacturer fifth-wheel body code, dealer text says travel trailer"); st["vin_fw_code_dealer_says_tt_held"]+=1; continue
    nt="toy_hauler" if re.search(TH_LINE,txt) or re.search(r'\b\d{2,4}th[a-z]{0,3}\b(?!\s*anniv)',txt) else "fifth_wheel"  # fix2: floorplan "TH" (e.g. Puma 351THSS) = toy hauler
    typerows.append({"unit_id":u["id"],"dealer_domain":u["provenance"]["dealerDomain"],"title":u["title"],"vin":v,"old":"travel_trailer","new":nt,"basis":f"VIN body code {v[:4]} (manufacturer fifth wheel)"+(" + toy hauler line/text" if nt=="toy_hauler" else ""),"source_url":url})
    change(u,"rvType","travel_trailer",nt,url,"","manufacturer class from VIN fifth-wheel body code"); u["rvType"]=nt; u["rvTypeSource"]="manufacturer_vin_body_code"; st["type_from_vin_fw_code_"+nt]+=1
for u in byid.values(): u.pop("_pageType",None)
# ── write ─────────────────────────────────────────────────────────────────────
out=[u for u in units if u["id"] in byid]; hid={h["unit_id"] for h in held}
builtAt=os.environ.get("BUILT_AT") or (iso(latest) if latest else snap["builtAt"]); bt=D.datetime.fromisoformat(builtAt.replace("Z","+00:00"))
ls=[D.datetime.fromisoformat(u["provenance"]["lastSeenAt"].replace("Z","+00:00")) for u in out]
cat=C.Counter(h["reason"] for h in held)
summary={"builtAt":builtAt,"in":len(units),"out":len(out),"removedOrHeldByReason":dict(cat),"removedByDomain":dict(C.Counter((h["dealer_domain"],h["reason"]) for h in held).most_common()) if False else {f"{a}|{b}":n for (a,b),n in C.Counter((h["dealer_domain"],h["reason"]) for h in held).items()},
 "fieldChangesByField":dict(C.Counter(d["field"] for d in diff if d["unit_id"] not in hid)),"typeChanges":dict(C.Counter((r["old"]+"->"+r["new"]) for r in typerows if r["unit_id"] not in hid)),"storesCreated":len(created),"steps":dict(st)}
json.dump(summary,open(f"{rep}/fix1_summary.json","w"),indent=1)
def wcsv(p,rows,fn):
    with open(p,"w",newline="") as f: w=csv.DictWriter(f,fieldnames=fn); w.writeheader(); w.writerows(rows)
wcsv(f"{rep}/fix1_field_changes.csv",[d for d in diff if d["unit_id"] not in hid],["unit_id","dealer_domain","field","old","new","source_url","fetched_at","rule"])
wcsv(f"{rep}/fix1_removed_or_held.csv",held,["unit_id","dealer_domain","title","vin","stock","rvType","price","reason","source_url","fetched_at","note"])
wcsv(f"{rep}/fix1_type_changes.csv",[r for r in typerows if r["unit_id"] not in hid],["unit_id","dealer_domain","title","vin","old","new","basis","source_url"])
wcsv(f"{rep}/fix1_stores_created.csv",created,["store_id","name","city","state","unit_id","source_url"])
json.dump({k:sorted(v) for k,v in ch.items() if k not in hid},open(f"{rep}/fix1_changed.json","w"))
print(json.dumps(summary,indent=1))
if DRY: sys.exit(0)
s=dict(snap["stats"]); s.update(units=len(out),dealers=len({u["dealer"]["id"] for u in out}),uniqueVins=len({u["vin"] for u in out if u["vin"]}),
  lastSeenRange={"oldest":min(ls).strftime("%Y-%m-%dT%H:%M:%S.000Z"),"newest":max(ls).strftime("%Y-%m-%dT%H:%M:%S.000Z")},
  seenWithinDaysOfBuiltAt={f"{d}d":sum(1 for x in ls if (bt-x).total_seconds()<=d*86400) for d in (14,21,30,45)},pagePassFix1_2026_11_01=summary)
hdr={"schemaVersion":snap["schemaVersion"],"builtAt":builtAt,"datasetNote":snap["datasetNote"]+" Nov 1 fix: Meyers, McClain's and Apache units re-read from their own pages (sold/sale-pending/on-order badges, Our Price, dealer-stated type); fifth-wheel VIN body codes fix travel_trailer types.","stats":s,"units":[]}
h=json.dumps(hdr,ensure_ascii=True,separators=(",",":"))
with gzip.open(dst+".tmp","wb",compresslevel=9) as f:
    f.write(h[:-2].encode("ascii"))
    for i,u in enumerate(out): f.write((b"," if i else b"")+json.dumps(u,ensure_ascii=True,separators=(",",":")).encode("ascii"))
    f.write(b"]}")
os.replace(dst+".tmp",dst)

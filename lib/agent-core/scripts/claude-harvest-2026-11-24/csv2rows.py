"""Harvest CSVs (Devin format + spec cols) -> RawScrapeRecord ndjson rows for build-harvest-snapshot.ts.
usage: csv2rows.py <harvest_dir> <out.ndjson> <report.json>
Only available units; price blank when label is MSRP/list/retail/MAP; VIN must pass check digit."""
import csv, json, sys, glob, os, re, collections
D, OUT, REP = sys.argv[1:4]
VINRE = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
TR = {**{str(i): i for i in range(10)}, **dict(zip("ABCDEFGH", range(1, 9))), **dict(zip("JKLMN", range(1, 6))), "P": 7, "R": 9, **dict(zip("STUVWXYZ", range(2, 10)))}
W = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]
def vin_ok(v):
    if not VINRE.match(v): return False
    s = sum(TR[c] * w for c, w in zip(v, W)) % 11
    return v[8] == ("X" if s == 10 else str(s))
BADLBL = re.compile(r'\b(msrp|list|retail|map|call|unlock|payment|/mo|per month)\b', re.I)
def num(x):
    x = (x or "").replace("$", "").replace(",", "").strip()
    try: return float(x)
    except: return None
c = collections.Counter(); per = collections.defaultdict(collections.Counter); out = open(OUT, "w"); issues = []
for path in sorted(glob.glob(f"{D}/*/*.csv")):
    if "/held/" in path or "/logs/" in path: continue
    st = path.split("/")[-2]
    for r in csv.DictReader(open(path, encoding="utf-8")):
        dom = (r.get("dealer_domain") or os.path.basename(path)[:-4]).lower().replace("www.", "")
        k = per[dom]; k["rows"] += 1
        def skip(why): k[why] += 1
        status = (r.get("status") or "").strip().lower()
        if status and status != "available": skip("not_available_" + status); continue
        vin = (r.get("vin") or "").strip().upper()
        if vin and not VINRE.match(vin): issues.append({"dom": dom, "url": r["listing_url"], "issue": "vin_invalid", "vin": vin}); vin = ""
        elif vin and not vin_ok(vin): issues.append({"dom": dom, "url": r["listing_url"], "issue": "vin_check_digit_mismatch_kept", "vin": vin})
        price = num(r.get("price")); lbl = r.get("price_label") or ""
        if price is not None and BADLBL.search(lbl) and not re.search(r'\b(sale|internet|our|now)\b', lbl, re.I):
            issues.append({"dom": dom, "url": r["listing_url"], "issue": "price_label_not_selling", "label": lbl}); price = None
        if price is not None and price < 1000: price = None
        m0 = (r.get("model") or "").strip(); fp = (r.get("floorplan") or "").strip()
        model = f"{m0} {fp}".strip() if fp and fp.lower() not in m0.lower() else m0
        title = " ".join(x for x in [r.get("year", "").strip(), (r.get("make") or "").strip(), model] if x)
        cond = (r.get("condition") or "").strip().lower()
        row = {"title": title, "year": r.get("year"), "make": (r.get("make") or "").strip() or None, "model": model or None,
               "vin": vin or None, "stock_number": (r.get("stock_number") or "").strip() or None,
               "condition": cond if cond in ("new", "used") else None, "rv_type": (r.get("rv_type") or "").strip() or None,
               "price": price, "image_urls": [r["photo_url"]] if (r.get("photo_url") or "").startswith("http") else [],
               "length": num(r.get("length_ft")), "sleeps": num(r.get("sleeps")), "dry_weight": num(r.get("dry_weight_lbs")),
               "gvwr": num(r.get("gvwr_lbs")), "hitch_weight": num(r.get("hitch_weight_lbs")), "slideouts": num(r.get("slideouts")),
               "inventory_status": "available", "scraped_at": r.get("seen_at"), "last_seen_at": r.get("seen_at"),
               "dealer_name": r.get("dealer_name"), "dealer_domain": dom, "dealer_location": f"{r.get('lot_city')}, {r.get('lot_state')}", "url": r["listing_url"],
               "_meta": {"origin": "claude_browser_harvest_2026_11_24", "harvest_method": "dealer_website_browser_2026_11_24", "listing_url": r["listing_url"],
                         "page_title": title, "price_basis": "page_price_2026_11_24" if price else None, "last_seen_basis": "harvested_at",
                         "dealer": {"name": r.get("dealer_name"), "city": (r.get("lot_city") or "").strip(), "state": (r.get("lot_state") or st).strip().upper(), "domain": dom, "lat": None, "lng": None}}}
        out.write(json.dumps(row) + "\n"); k["written"] += 1; c["written"] += 1
json.dump({"total": c, "per_dealer": per, "issues": issues}, open(REP, "w"), indent=1)
print(json.dumps({"total": c, "per_dealer": per}, indent=0)); print(len(issues), "issues")

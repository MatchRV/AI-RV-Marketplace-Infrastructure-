"""One-unit refresh of Camping World stock 2628167 (owner-authorized exception to the #95 freeze; this unit only).

Same rules as recheck-2026-11-10/apply_pp2.py (CW branch):
 - the unit changes only from ITS OWN listing page: stock in heading/sku == stored stock, VIN never conflicts;
 - price = the unit's own offer only: schema.org offer == visible price == clearPrice.salePrice; MSRP is never the price,
   and a price equal to the page's MSRP is not applied;
 - Sale Pending / sold are held, not refreshed; nothing else (specs, dealer, location, condition) is changed.
Page fetched once with the collector UA after reading robots.txt (User-agent * allows /rv/); no bot wall met.
Usage: python3 apply_one.py <snapshot.json.gz> <extracted.json> <fetchedAt ISO-Z>
Rewrites the snapshot in place in the exact serialization the re-check scripts use (round-trip verified byte-identical).
"""
import gzip, json, sys
src, ext, ts = sys.argv[1], sys.argv[2], sys.argv[3]
STOCK, VIN = "2628167", "4X4TC1V21T9139732"
URL = "https://rv.campingworld.com/rv/2026-forest-river-campsite-reserve-20ljw-2628167-fife-wa"
raw = gzip.open(src).read(); snap = json.loads(raw)
hdr = {k: snap[k] for k in ("schemaVersion", "builtAt", "datasetNote", "stats")}; hdr["units"] = []
h = json.dumps(hdr, ensure_ascii=True, separators=(",", ":"))
assert h[:-2].encode() + b",".join(json.dumps(u, ensure_ascii=True, separators=(",", ":")).encode() for u in snap["units"]) + b"]}" == raw, "serialization round-trip changed"
x = json.load(open(ext))
hits = [u for u in snap["units"] if u.get("stockNumber") == STOCK and (u.get("provenance") or {}).get("dealerDomain") == "rv.campingworld.com"]
assert len(hits) == 1, f"expected exactly one unit, got {len(hits)}"
u = hits[0]
assert x["onUnitPage"] and x["ldSku"] == STOCK and x["h1Stock"] == STOCK, "page is not this unit's own page"
assert x.get("ldVin") in (None, u["vin"]) and u["vin"] == VIN, "VIN conflict"
assert not x["salePendingText"] and x["ldAvailability"] == "InStock", "not available: hold instead of refresh"
cand = [v for v in (x.get("ldPrice"), x.get("visiblePrice"), x.get("cpSale")) if v is not None]
assert len(cand) >= 2 and all(abs(v - cand[0]) < 0.5 for v in cand), f"ambiguous price {cand}"
pp = int(round(cand[0]))
assert pp >= 500 and not (x.get("cpMsrp") is not None and abs(x["cpMsrp"] - pp) < 0.5), "price equals MSRP"
before = {"priceUsd": u["priceUsd"], "lastSeenAt": u["provenance"]["lastSeenAt"]}
u["priceUsd"] = {"value": pp, "source": "dealer_listing", "confidence": "high",
                 "note": "Dealer's current asking price on the unit's own listing page (schema.org offer = displayed price = sale price); not MSRP.",
                 "sourceUrl": URL, "observedAt": ts.replace("Z", ".000Z")}
p = u["provenance"]
if ts.replace("Z", ".000Z") > p["lastSeenAt"]: p["lastSeenAt"] = ts.replace("Z", ".000Z")
p["listingUrl"] = URL; p["lastSeenBasis"] = "dealer_page_verified"
p["pagePass"] = {"date": "2026-11-18 one-unit refresh (stock 2628167)", "listingUrl": URL, "fetchedAt": ts.replace("Z", ".000Z"),
                 "fields": ["priceUsd"] if before["priceUsd"]["value"] != pp else []}
with gzip.open(src + ".tmp", "wb", compresslevel=9) as f:
    f.write(h[:-2].encode("ascii"))
    for i, v in enumerate(snap["units"]):
        f.write((b"," if i else b"") + json.dumps(v, ensure_ascii=True, separators=(",", ":")).encode("ascii"))
    f.write(b"]}")
import os; os.replace(src + ".tmp", src)
stats = {"unit_id": u["id"], "stock": STOCK, "vin": VIN, "source_url": URL, "fetched_at": ts,
         "price_before": before["priceUsd"]["value"], "price_before_observedAt": before["priceUsd"]["observedAt"],
         "price_after": pp, "page_msrp_not_used": x.get("cpMsrp"), "availability": x["ldAvailability"],
         "lastSeenAt_before": before["lastSeenAt"], "lastSeenAt_after": p["lastSeenAt"],
         "builtAt_unchanged": snap["builtAt"], "units_total_unchanged": len(snap["units"]), "other_units_changed": 0}
json.dump(stats, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "result.json"), "w"), indent=1)
print(json.dumps(stats, indent=1))

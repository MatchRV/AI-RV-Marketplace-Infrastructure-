#!/usr/bin/env python3
"""Task: import inventory package with delete-and-replace semantics.

For every DB dealer matched to a package dealer (by domain, name fallback),
delete its old listings (+ rv_inventory_sync_state rows), then insert the
package's listings fresh with photos in position order.

Reuses helpers from import_inventory_package.py (type inference, image
cleaning, LLM cache).
"""
from __future__ import annotations
import csv, json, os, random, re, sys
from collections import Counter, defaultdict

import psycopg2, psycopg2.extras

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util
spec = importlib.util.spec_from_file_location("imp", os.path.join(HERE, "import_inventory_package.py"))
# import_inventory_package exits at import if DATABASE_URL unset; ensure it's set
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)

ASSETS = os.path.join(HERE, "..", "attached_assets")
F_DEALERS = os.path.join(ASSETS, "dealers_1785193757936.csv")
F_LISTINGS = os.path.join(ASSETS, "listings_1785193757936.csv")
# photo-refresh re-upload of the SAME package (identical listing keys, more photos)
F_PHOTOS = os.path.join(ASSETS, "listing_photos_1785207392986.csv")

DB = os.environ["DATABASE_URL"]

# package slug -> DB dealer id overrides (name-based fallback matches)
SLUG_OVERRIDES = {"puyallup-rv-vancouver": 43}


def main() -> None:
    dealers_csv = list(csv.DictReader(open(F_DEALERS, encoding="utf-8")))
    listings_csv = list(csv.DictReader(open(F_LISTINGS, encoding="utf-8")))
    photos_csv = list(csv.DictReader(open(F_PHOTOS, encoding="utf-8")))

    photos_by_listing: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for p in photos_csv:
        pos = imp.to_num(p["position"])
        photos_by_listing[p["listing_id"]].append((int(pos) if pos else 999, p["url"]))

    conn = psycopg2.connect(DB)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # ── model-line map from existing DB (BEFORE we delete anything) ──
    cur.execute("""
        SELECT lower(make) mk, lower(model) md, type FROM (
          SELECT make, model, type,
                 ROW_NUMBER() OVER (PARTITION BY lower(make), lower(model)
                                    ORDER BY COUNT(*) DESC) rn
          FROM listings GROUP BY make, model, type
        ) t WHERE rn = 1
    """)
    db_map = {(r["mk"], r["md"]): r["type"] for r in cur.fetchall() if r["type"] in imp.CANONICAL}

    # ── resolve type per row (direct -> db map -> keywords -> LLM cache) ──
    resolved: dict[str, str] = {}
    unknown: set[tuple[str, str]] = set()
    for r in listings_csv:
        ty = imp.normalize_type(r["unit_type"])
        if not ty:
            mk, md = r["make"].strip().lower(), r["model"].strip().lower()
            ty = db_map.get((mk, md)) or imp.keyword_type(r["title"], r["model"], r["listing_url"])
            if not ty:
                unknown.add((mk, md))
                continue
        resolved[r["listing_id"]] = ty
    print(f"types resolved pre-LLM: {len(resolved)}/{len(listings_csv)}; {len(unknown)} combos to LLM")
    llm_map = imp.llm_classify(sorted(unknown))
    for r in listings_csv:
        if r["listing_id"] in resolved:
            continue
        mk, md = r["make"].strip().lower(), r["model"].strip().lower()
        ty = llm_map.get(f"{mk}|{md}")
        if ty:
            resolved[r["listing_id"]] = ty
    print(f"types resolved total: {len(resolved)}/{len(listings_csv)}")

    # ── dealer mapping: domain first, slug/name override fallback ──
    csv_to_db: dict[str, tuple[int, str]] = {}   # csv dealer_id -> (db id, package name)
    matched_db_ids: set[int] = set()
    for d in dealers_csv:
        slug, domain = d["slug"], (d["domain"] or "").lower().strip()
        db_id = None
        if slug in SLUG_OVERRIDES:
            db_id = SLUG_OVERRIDES[slug]
        else:
            cur.execute("SELECT id FROM dealers WHERE domain = %s LIMIT 1", (domain,))
            row = cur.fetchone()
            if row:
                db_id = row["id"]
        if db_id is None:
            cur.execute(
                """INSERT INTO dealers (name, domain, city, state, rating, review_count,
                     avg_response_time, beginner_friendly, years_in_business, total_listings)
                   VALUES (%s,%s,%s,%s,%s,%s,'< 2 hours',%s,%s,0) RETURNING id""",
                (d["name"], domain or None, d["city"] or "Unknown", d["state"] or "WA",
                 round(4.2 + random.random() * 0.7, 1), random.randint(20, 420),
                 random.random() > 0.4, random.randint(5, 35)))
            db_id = cur.fetchone()["id"]
            print(f"created dealer {db_id} for {slug}")
        else:
            cur.execute("UPDATE dealers SET city = COALESCE(NULLIF(%s,''), city), "
                        "state = COALESCE(NULLIF(%s,''), state) WHERE id = %s",
                        (d["city"], d["state"], db_id))
        csv_to_db[d["dealer_id"]] = (db_id, d["name"])
        matched_db_ids.add(db_id)
    print("matched DB dealer ids:", sorted(matched_db_ids))

    # ── delete old listings + sync state for matched dealers ──
    ids = tuple(sorted(matched_db_ids))
    cur.execute("SELECT id FROM listings WHERE dealer_id IN %s", (ids,))
    old_listing_ids = [r["id"] for r in cur.fetchall()]
    print(f"deleting {len(old_listing_ids)} old listings across {len(ids)} dealers")
    if old_listing_ids:
        cur.execute("DELETE FROM rv_inventory_sync_state WHERE listing_id = ANY(%s)", (old_listing_ids,))
        print("  sync_state rows deleted:", cur.rowcount)
        cur.execute("DELETE FROM listings WHERE id = ANY(%s)", (old_listing_ids,))
        print("  listings deleted:", cur.rowcount)

    # ── insert package listings ──
    stats = Counter()
    rows = []
    for r in listings_csv:
        dealer_id, dealer_name = csv_to_db[r["dealer_id"]]
        ty = resolved.get(r["listing_id"])
        if not ty:
            stats["skipped_no_type"] += 1
            continue
        price = imp.to_num(r["price_usd"])
        if not price or price < 1000 or price > 2_000_000:
            stats["skipped_no_price"] += 1
            continue
        yr = imp.to_num(r["year"])
        year = int(yr) if yr else None
        make = r["make"].strip()
        if not make or not year:
            stats["skipped_no_make_year"] += 1
            continue
        model = r["model"].strip()
        vin = imp.n(r["vin"])
        title = r["title"].strip() or f"{year} {make} {model}"
        cond = (r["condition"] or "").lower()
        is_new = "new" in cond
        state = (r["state"] or "WA").upper()
        loc = (r["unit_location"] or "").strip()
        location = loc if re.match(r"^[A-Za-z .'-]+, ?[A-Z]{2}$", loc) else f"{dealer_name}, {state}"
        sl = imp.to_num(r["sleeps"])
        sleeps = int(sl) if sl else 4
        imgs = imp.clean_images([u for _, u in sorted(photos_by_listing.get(r["listing_id"], []))])
        market_value = round(price * (0.95 + random.random() * 0.1))
        savings = max(0, market_value - price)
        pct = savings / market_value if market_value else 0
        deal = ("great_deal" if pct >= 0.1 else "good_deal" if pct >= 0.05
                else "high_price" if price > market_value * 1.05 else "fair_deal")
        rows.append((title, make, model, year, ty, price, market_value, deal, savings, sleeps,
                     location, state, dealer_name, dealer_id, json.dumps(imgs),
                     "new" if is_new else "used", is_new, vin))
        stats["inserted"] += 1

    psycopg2.extras.execute_batch(cur, """
        INSERT INTO listings (title, make, model, year, type, price, market_value,
          deal_score, deal_savings, sleeps, location, state, dealer_name, dealer_id,
          images, days_on_market, condition, is_new, is_featured, vin, features, price_history)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,0,%s,%s,false,%s,
                '[]'::jsonb,'[]'::jsonb)""", rows, page_size=500)

    cur.execute("""UPDATE dealers d SET total_listings =
                     COALESCE((SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id), 0)""")
    conn.commit()
    print("DONE", dict(stats))

    # ── integrity + counts ──
    cur.execute("SELECT COUNT(*) c FROM listings l LEFT JOIN dealers d ON d.id=l.dealer_id WHERE d.id IS NULL")
    print("orphan listings:", cur.fetchone()["c"])
    cur.execute("SELECT domain, COUNT(*) c FROM dealers WHERE domain IS NOT NULL GROUP BY domain HAVING COUNT(*)>1")
    print("dup dealer domains:", cur.fetchall())
    cur.execute("SELECT COUNT(*) c, COUNT(*) FILTER (WHERE jsonb_array_length(images) > 0) w FROM listings")
    row = cur.fetchone()
    print(f"TOTAL listings: {row['c']}  visible (with photos): {row['w']}")
    cur.close(); conn.close()


if __name__ == "__main__":
    main()

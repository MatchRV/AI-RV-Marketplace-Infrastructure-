#!/usr/bin/env python3
"""Load MatchRV inventory CSVs into Postgres. Idempotent: re-running upserts.

    pip install psycopg2-binary
    DATABASE_URL=postgres://... python load.py
"""
import csv, os, sys
import psycopg2
from psycopg2.extras import execute_values

DB = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("Set DATABASE_URL")
HERE = os.path.dirname(os.path.abspath(__file__))

def rd(fn):
    with open(os.path.join(HERE, fn), encoding="utf-8") as f:
        return list(csv.DictReader(f))

def n(v):
    return v if v not in ("", None) else None

conn = psycopg2.connect(DB); conn.autocommit = False
cur = conn.cursor()

# --- schema ---
cur.execute(open(os.path.join(HERE, "schema.sql"), encoding="utf-8").read())

# --- dealers: insert new, update scraped metadata, never clobber existing names ---
dealers = rd("dealers.csv")
execute_values(cur, """
  INSERT INTO dealers (dealer_id, slug, name, city, state, domain, platform, timezone)
  VALUES %s
  ON CONFLICT (dealer_id) DO UPDATE SET
    city=COALESCE(EXCLUDED.city, dealers.city),
    state=COALESCE(EXCLUDED.state, dealers.state),
    domain=COALESCE(EXCLUDED.domain, dealers.domain),
    platform=COALESCE(EXCLUDED.platform, dealers.platform)
""", [(int(d["dealer_id"]), d["slug"], d["name"], n(d["city"]), n(d["state"]),
       n(d["domain"]), n(d["platform"]), d["timezone"]) for d in dealers])
print(f"dealers upserted: {len(dealers)}")

# keep the sequence above our explicit ids if dealer_id is a serial
cur.execute("""SELECT pg_get_serial_sequence('dealers','dealer_id')""")
seq = cur.fetchone()[0]
if seq:
    cur.execute(f"SELECT setval('{seq}', (SELECT COALESCE(MAX(dealer_id),1) FROM dealers))")

# --- listings ---
rows = rd("listings.csv")
csv_to_db = {}   # csv listing_id -> db listing_id
BATCH = 1000
for i in range(0, len(rows), BATCH):
    chunk = rows[i:i+BATCH]
    recs = [(int(r["dealer_id"]), n(r["external_id"]), n(r["stock_number"]), n(r["vin"]),
             n(r["state"]), n(r["unit_location"]), n(r["condition"]), n(r["year"]),
             n(r["make"]), n(r["model"]), n(r["floorplan"]), n(r["unit_type"]),
             n(r["price_usd"]), n(r["msrp_usd"]), n(r["sleeps"]), n(r["days_on_lot"]),
             n(r["title"]), n(r["listing_url"]), n(r["source_platform"]),
             int(r["photo_count"] or 0)) for r in chunk]
    out = execute_values(cur, """
      INSERT INTO listings (dealer_id, external_id, stock_number, vin, state, unit_location,
        condition, year, make, model, floorplan, unit_type, price_usd, msrp_usd, sleeps,
        days_on_lot, title, listing_url, source_platform, photo_count)
      VALUES %s
      ON CONFLICT (dealer_id, external_id) WHERE external_id IS NOT NULL AND external_id <> ''
      DO UPDATE SET price_usd=EXCLUDED.price_usd, msrp_usd=EXCLUDED.msrp_usd,
        condition=EXCLUDED.condition, unit_location=EXCLUDED.unit_location,
        photo_count=EXCLUDED.photo_count, is_active=true, last_seen_at=now()
      RETURNING listing_id
    """, recs, fetch=True)
    for r, got in zip(chunk, out):
        csv_to_db[r["listing_id"]] = got[0]
    print(f"  listings {min(i+BATCH, len(rows))}/{len(rows)}")

# --- photos ---
photos = rd("listing_photos.csv")
prs = [(csv_to_db[p["listing_id"]], int(p["position"]), p["url"])
       for p in photos if p["listing_id"] in csv_to_db]
for i in range(0, len(prs), 5000):
    execute_values(cur, """
      INSERT INTO listing_photos (listing_id, position, url) VALUES %s
      ON CONFLICT (listing_id, position) DO UPDATE SET url=EXCLUDED.url
    """, prs[i:i+5000])
print(f"photos upserted: {len(prs)}")

conn.commit(); cur.close(); conn.close()
print("done")

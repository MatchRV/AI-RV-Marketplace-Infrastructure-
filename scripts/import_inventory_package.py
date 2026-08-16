#!/usr/bin/env python3
"""One-off importer for the uploaded MatchRV inventory package (attached_assets).

Maps the package CSVs (dealers / listings / listing_photos) into the app's
existing `dealers` + `listings` schema, following the same rules as the
API server's /api/import/listings route:
  - dealers upserted by domain
  - listings upserted by VIN, else (title, dealer_id)
  - price required (1k..2M), make+year required, type must normalize
  - images: cleaned (ext filter, no /common/ or banner assets, dedupe
    resolution/thumb variants), ordered by position, capped at 12

Type inference for the ~6.4k rows with a blank unit_type:
  1. model-line map built from the existing DB (make+model -> dominant type)
  2. keyword heuristics on title/model/url
  3. Claude Haiku classification of remaining unique make+model combos
     (cached in scripts/.type_cache.json so re-runs are free)

Idempotent: re-running updates price/images instead of duplicating.
"""
from __future__ import annotations

import csv, json, os, random, re, sys, urllib.request
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "attached_assets")
import glob

def _latest(pattern: str) -> str:
    files = sorted(glob.glob(os.path.join(ASSETS, pattern)))
    if not files:
        sys.exit(f"no file matching {pattern}")
    return files[-1]

F_DEALERS = _latest("dealers_*.csv")
F_LISTINGS = _latest("listings_*.csv")
F_PHOTOS = _latest("listing_photos_*.csv")

# When set, matched listings get the package's cleaned image set applied even if
# they already have images (used for photo-refresh packages). Default keeps the
# fill-only-when-empty behavior so thin photo sets never clobber scraper galleries.
REPLACE_IMAGES = os.environ.get("REPLACE_IMAGES") == "1"
TYPE_CACHE = os.path.join(HERE, ".type_cache.json")

DB = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("Set DATABASE_URL")

CANONICAL = {
    "toy_hauler", "fifth_wheel", "travel_trailer",
    "class_a", "class_b", "class_c", "popup_camper", "truck_camper",
}


def normalize_type(t: str | None) -> str | None:
    if not t:
        return None
    x = t.lower().strip()
    if x in ("unknown", "other", "rv", "park model"):
        return None
    if x in CANONICAL:
        return x
    if "toy hauler" in x: return "toy_hauler"
    if "fifth wheel" in x or "destination trailer" in x or "5th wheel" in x: return "fifth_wheel"
    if "travel trailer" in x or x == "destination" or "teardrop" in x: return "travel_trailer"
    if "class a" in x: return "class_a"
    if "class b" in x: return "class_b"
    if "class c" in x or "super c" in x or "cutaway" in x: return "class_c"
    if "popup" in x or "pop-up" in x or "pop up" in x or "folding" in x or "tent" in x: return "popup_camper"
    if "truck camper" in x: return "truck_camper"
    return None


KEYWORDS = [
    ("toy-hauler", "toy_hauler"), ("toy hauler", "toy_hauler"),
    ("fifth-wheel", "fifth_wheel"), ("fifth wheel", "fifth_wheel"), ("5th-wheel", "fifth_wheel"),
    ("travel-trailer", "travel_trailer"), ("travel trailer", "travel_trailer"),
    ("destination", "travel_trailer"), ("teardrop", "travel_trailer"),
    ("class-a", "class_a"), ("class a", "class_a"),
    ("class-b", "class_b"), ("class b", "class_b"),
    ("class-c", "class_c"), ("class c", "class_c"), ("super-c", "class_c"),
    ("truck-camper", "truck_camper"), ("truck camper", "truck_camper"),
    ("pop-up", "popup_camper"), ("popup", "popup_camper"), ("tent-camper", "popup_camper"),
]


def keyword_type(*texts: str) -> str | None:
    blob = " ".join(t or "" for t in texts).lower()
    for kw, ty in KEYWORDS:
        if kw in blob:
            return ty
    return None


def n(v):
    return v if v not in ("", None) else None


def to_num(v):
    if v in ("", None):
        return None
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except ValueError:
        return None


IMG_EXT = re.compile(r"\.(jpe?g|png|webp)(\?|$)", re.I)


def clean_images(urls: list[str]) -> list[str]:
    out, seen = [], set()
    for u in urls:
        if not IMG_EXT.search(u) or "/common/" in u:
            continue
        low = u.lower()
        if "banner" in low or "/dealers/" in low:
            continue
        key = re.sub(r"-thumb(?=\.)", "", u.split("?")[0])
        if key in seen:
            continue
        seen.add(key)
        out.append(u)
        if len(out) >= 12:
            break
    return out


# ── LLM classification of unknown model lines ───────────────────────────────

def llm_classify(combos: list[tuple[str, str]]) -> dict[str, str]:
    """combo key 'make|model' -> canonical type (or absent if unknown)."""
    cache: dict[str, str] = {}
    if os.path.exists(TYPE_CACHE):
        cache = json.load(open(TYPE_CACHE))
    todo = [c for c in combos if f"{c[0]}|{c[1]}" not in cache]
    if not todo:
        return cache

    base = os.environ.get("AI_INTEGRATIONS_ANTHROPIC_BASE_URL", "").rstrip("/")
    key = os.environ.get("AI_INTEGRATIONS_ANTHROPIC_API_KEY", "")
    if not base or not key:
        print("WARN: no Anthropic credentials; skipping LLM type inference")
        return cache

    BATCH = 50
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        lines = "\n".join(f"{j}. {m} {mo}" for j, (m, mo) in enumerate(chunk))
        prompt = (
            "Classify each RV model line into exactly one type from this list:\n"
            "toy_hauler, fifth_wheel, travel_trailer, class_a, class_b, class_c, "
            "popup_camper, truck_camper, unknown\n\n"
            "Rules: motorhomes on a van/cutaway chassis = class_c; camper vans = class_b; "
            "bus-style = class_a; towable with garage = toy_hauler; destination trailers = travel_trailer. "
            "Use 'unknown' only if you genuinely cannot tell.\n\n"
            f"Model lines:\n{lines}\n\n"
            'Reply with ONLY a JSON object mapping index to type, e.g. {"0":"travel_trailer"}'
        )
        body = json.dumps({
            "model": "claude-haiku-4-5",
            "max_tokens": 2000,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()
        req = urllib.request.Request(
            f"{base}/v1/messages", data=body, method="POST",
            headers={"content-type": "application/json", "x-api-key": key,
                     "anthropic-version": "2023-06-01"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
            text = data["content"][0]["text"].strip()
            # haiku often wraps JSON in code fences — strip them
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
            mapping = json.loads(text)
            for j_str, ty in mapping.items():
                j = int(j_str)
                if 0 <= j < len(chunk) and ty in CANONICAL:
                    m, mo = chunk[j]
                    cache[f"{m}|{mo}"] = ty
            print(f"  llm classified {min(i+BATCH, len(todo))}/{len(todo)}")
        except Exception as exc:
            print(f"  WARN llm batch at {i} failed: {exc}")
        json.dump(cache, open(TYPE_CACHE, "w"))
    return cache


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    dealers_csv = list(csv.DictReader(open(F_DEALERS, encoding="utf-8")))
    listings_csv = list(csv.DictReader(open(F_LISTINGS, encoding="utf-8")))
    photos_csv = list(csv.DictReader(open(F_PHOTOS, encoding="utf-8")))

    photos_by_listing: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for p in photos_csv:
        pos = to_num(p["position"])
        photos_by_listing[p["listing_id"]].append((int(pos) if pos else 999, p["url"]))

    conn = psycopg2.connect(DB)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # 1) model-line -> dominant type map from existing DB
    cur.execute("""
        SELECT lower(make) mk, lower(model) md, type FROM (
          SELECT make, model, type,
                 ROW_NUMBER() OVER (PARTITION BY lower(make), lower(model)
                                    ORDER BY COUNT(*) DESC) rn
          FROM listings GROUP BY make, model, type
        ) t WHERE rn = 1
    """)
    db_map = {(r["mk"], r["md"]): r["type"] for r in cur.fetchall() if r["type"] in CANONICAL}

    # 2) resolve type per row
    resolved: dict[str, str] = {}   # csv listing_id -> type
    unknown_combos: set[tuple[str, str]] = set()
    for r in listings_csv:
        ty = normalize_type(r["unit_type"])
        if not ty:
            mk, md = r["make"].strip().lower(), r["model"].strip().lower()
            ty = db_map.get((mk, md)) or keyword_type(r["title"], r["model"], r["listing_url"])
            if not ty:
                unknown_combos.add((mk, md))
                continue
        resolved[r["listing_id"]] = ty

    print(f"types: direct/db/keyword resolved {len(resolved)}/{len(listings_csv)}; "
          f"{len(unknown_combos)} unique combos to LLM")
    llm_map = llm_classify(sorted(unknown_combos))
    for r in listings_csv:
        if r["listing_id"] in resolved:
            continue
        mk, md = r["make"].strip().lower(), r["model"].strip().lower()
        ty = llm_map.get(f"{mk}|{md}")
        if ty:
            resolved[r["listing_id"]] = ty

    # 3) dealers upsert by domain
    domain_to = {}  # domain -> (id, name)
    for d in dealers_csv:
        domain = (d["domain"] or "").lower().strip()
        if not domain:
            continue
        cur.execute("SELECT id, name FROM dealers WHERE domain = %s LIMIT 1", (domain,))
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE dealers SET city = COALESCE(NULLIF(%s,''), city), "
                "state = COALESCE(NULLIF(%s,''), state) WHERE id = %s",
                (d["city"], d["state"], row["id"]),
            )
            domain_to[domain] = (row["id"], row["name"])
        else:
            cur.execute(
                """INSERT INTO dealers (name, domain, city, state, rating, review_count,
                     avg_response_time, beginner_friendly, years_in_business, total_listings)
                   VALUES (%s,%s,%s,%s,%s,%s,'< 2 hours',%s,%s,0) RETURNING id""",
                (d["name"], domain, d["city"] or domain.split(".")[0], d["state"] or "WA",
                 round(4.2 + random.random() * 0.7, 1), random.randint(20, 420),
                 random.random() > 0.4, random.randint(5, 35)),
            )
            domain_to[domain] = (cur.fetchone()["id"], d["name"])
    dealer_by_csv_id = {d["dealer_id"]: domain_to.get((d["domain"] or "").lower().strip())
                        for d in dealers_csv}
    print(f"dealers ready: {len(domain_to)}")

    # 4) listings upsert
    stats = Counter()
    for idx, r in enumerate(listings_csv):
        dealer = dealer_by_csv_id.get(r["dealer_id"])
        if not dealer:
            stats["skipped_no_dealer"] += 1
            continue
        dealer_id, dealer_name = dealer

        ty = resolved.get(r["listing_id"])
        if not ty:
            stats["skipped_no_type"] += 1
            continue
        price = to_num(r["price_usd"])
        if not price or price < 1000 or price > 2_000_000:
            stats["skipped_no_price"] += 1
            continue
        yr = to_num(r["year"])
        year = int(yr) if yr else None
        make = r["make"].strip()
        if not make or not year:
            stats["skipped_no_make_year"] += 1
            continue

        model = r["model"].strip()
        vin = n(r["vin"])
        title = r["title"].strip() or f"{year} {make} {model}"
        cond = (r["condition"] or "").lower()
        is_new = "new" in cond
        state = (r["state"] or "WA").upper()
        loc = (r["unit_location"] or "").strip()
        location = loc if re.match(r"^[A-Za-z .'-]+, ?[A-Z]{2}$", loc) else f"{dealer_name}, {state}"
        sl = to_num(r["sleeps"])
        sleeps = int(sl) if sl else 4

        imgs = clean_images([u for _, u in sorted(photos_by_listing.get(r["listing_id"], []))])

        def deal_fields(mv: float) -> tuple[float, str]:
            savings = max(0, mv - price)
            pct = savings / mv if mv else 0
            deal = ("great_deal" if pct >= 0.1 else "good_deal" if pct >= 0.05
                    else "high_price" if price > mv * 1.05 else "fair_deal")
            return savings, deal

        if vin:
            cur.execute("SELECT id, market_value FROM listings WHERE vin = %s LIMIT 1", (vin,))
        else:
            cur.execute("SELECT id, market_value FROM listings WHERE title = %s AND dealer_id = %s LIMIT 1",
                        (title, dealer_id))
        existing = cur.fetchone()
        if existing:
            # Deterministic on re-run: keep the existing market_value, only
            # refresh price + deal fields derived from it.
            market_value = existing["market_value"] or round(price)
            savings, deal = deal_fields(market_value)
            if REPLACE_IMAGES and imgs:
                img_sql = "%s::jsonb"
            else:
                img_sql = "CASE WHEN jsonb_array_length(images) = 0 THEN %s::jsonb ELSE images END"
            cur.execute(
                f"""UPDATE listings SET price=%s, deal_score=%s, deal_savings=%s,
                     images = {img_sql},
                     updated_at = NOW()
                   WHERE id = %s""",
                (price, deal, savings, json.dumps(imgs), existing["id"]),
            )
            stats["updated"] += 1
        else:
            market_value = round(price * (0.95 + random.random() * 0.1))
            savings, deal = deal_fields(market_value)
            cur.execute(
                """INSERT INTO listings (title, make, model, year, type, price, market_value,
                     deal_score, deal_savings, sleeps, location, state, dealer_name, dealer_id,
                     images, days_on_market, condition, is_new, is_featured, vin, features,
                     price_history)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,0,%s,%s,false,%s,
                           '[]'::jsonb,'[]'::jsonb)""",
                (title, make, model, year, ty, price, market_value, deal, savings, sleeps,
                 location, state, dealer_name, dealer_id, json.dumps(imgs),
                 "new" if is_new else "used", is_new, vin),
            )
            stats["inserted"] += 1
        if (idx + 1) % 1000 == 0:
            print(f"  listings {idx+1}/{len(listings_csv)} {dict(stats)}")

    # 5) recount dealer totals
    cur.execute("""UPDATE dealers d SET total_listings =
                     COALESCE((SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id), 0)""")

    conn.commit()
    print("DONE", dict(stats))
    cur.execute("SELECT COUNT(*) c, COUNT(*) FILTER (WHERE jsonb_array_length(images) > 0) w FROM listings")
    row = cur.fetchone()
    print(f"total listings now: {row['c']} (with photos: {row['w']})")
    cur.close(); conn.close()


if __name__ == "__main__":
    main()

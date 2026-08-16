"""Push all listings from the local (dev) database to the production API.

The production deployment uses a separate Helium PostgreSQL instance that the
scraper cannot reach directly.  After every sync we call
  POST https://matchrv.com/api/import/listings
with the current inventory so the live site always shows fresh data.

Strategy:
  1. Push all dealers first (tiny payload, ensures dealer IDs exist in prod DB)
  2. Push listings in small batches of 10 (each batch ~25KB, well under any
     reverse-proxy body-size limit)

Environment variables used:
  IMPORT_API_KEY          – shared secret validated by the production API
  PROD_API_BASE_URL       – override the base URL (default: https://matchrv.com)
  DATABASE_URL            – local dev DB to read from
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import psycopg2
import psycopg2.extras
import urllib.request
import urllib.error

LOGGER = logging.getLogger(__name__)

PROD_API_BASE = os.getenv("PROD_API_BASE_URL", "https://matchrv.com").rstrip("/")
LISTING_BATCH_SIZE = 10


def _synthetic_domain(name: str) -> str:
    """Return a stable synthetic domain for dealers that have no real domain.

    The value is consistent across pushes so production can upsert by domain.
    """
    slug = name.lower().strip()
    slug = "".join(c if c.isalnum() else "-" for c in slug).strip("-")
    return f"{slug}.matchrv.local"


def _effective_domain(domain: str | None, name: str) -> str:
    """Return the dealer's real domain, or a synthetic one if it is blank."""
    return domain.strip() if domain and domain.strip() else _synthetic_domain(name)


def _post_json(url: str, payload: dict, api_key: str, timeout: int = 120) -> dict:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        msg = exc.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {msg[:200]}") from exc


def push_db_to_production(database_url: str | None = None) -> dict[str, Any]:
    """Read all listings/dealers from the dev DB and upsert into production.

    Returns a stats dict with keys: dealers_sent, batches, inserted, updated,
    skipped, errors.
    """
    api_key = os.getenv("IMPORT_API_KEY", "")
    if not api_key:
        raise RuntimeError("IMPORT_API_KEY not set — cannot push to production")

    db_url = database_url or os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cur.execute("""
        SELECT name, domain, city, state, phone,
               rating, review_count, avg_response_time,
               beginner_friendly, years_in_business
        FROM dealers
        ORDER BY id
    """)
    dealers = []
    for row in cur.fetchall():
        dealer_name = row["name"] or ""
        dealers.append({
            "domain": _effective_domain(row["domain"], dealer_name),
            "name": dealer_name,
            "city": row["city"] or "",
            "state": row["state"] or "WA",
            "phone": row["phone"],
            "rating": float(row["rating"]) if row["rating"] else None,
            "reviewCount": row["review_count"],
            "avgResponseTime": row["avg_response_time"],
            "beginnerFriendly": row["beginner_friendly"],
            "yearsInBusiness": row["years_in_business"],
        })

    cur.execute("SELECT COUNT(*) FROM listings")
    total = cur.fetchone()[0]
    LOGGER.info("push_to_prod: %d dealers, %d listings to push", len(dealers), total)

    url = f"{PROD_API_BASE}/api/import/listings"
    stats: dict[str, Any] = {
        "dealers_sent": len(dealers),
        "total_listings": total,
        "batches": 0,
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "errors": 0,
    }

    # ── Step 1: push dealers alone ──────────────────────────────────────────
    try:
        result = _post_json(url, {"dealers": dealers, "listings": []}, api_key)
        LOGGER.info(
            "push_to_prod dealers: inserted=%s updated=%s",
            result.get("dealers", {}).get("inserted", 0),
            result.get("dealers", {}).get("updated", 0),
        )
    except Exception as exc:
        LOGGER.error("push_to_prod dealer push failed: %s", exc)
        stats["errors"] += 1

    # ── Step 2: push listings in small batches ──────────────────────────────
    offset = 0
    while True:
        cur.execute("""
            SELECT l.title, l.make, l.model, l.year, l.type, l.price,
                   l.mileage, l.length, l.slides, l.sleeps, l.location,
                   l.condition, l.description, l.features, l.images,
                   l.dealer_name, l.vin,
                   l.width_ft, l.height_ft, l.dry_weight, l.gvwr,
                   l.hitch_weight, l.fresh_water, l.grey_water, l.black_water,
                   l.generator, l.solar, l.awning, l.outdoor_kitchen,
                   l.washer_dryer, l.price_history,
                   d.domain AS dealer_domain
            FROM listings l
            LEFT JOIN dealers d ON l.dealer_id = d.id
            ORDER BY l.id
            LIMIT %s OFFSET %s
        """, (LISTING_BATCH_SIZE, offset))

        rows = cur.fetchall()
        if not rows:
            break

        listings_batch = []
        for r in rows:
            def _parse_json_field(v: Any) -> Any:
                if isinstance(v, (list, dict)):
                    return v
                if isinstance(v, str):
                    try:
                        return json.loads(v)
                    except Exception:
                        return []
                return []

            images = _parse_json_field(r["images"]) or []
            features = _parse_json_field(r["features"]) or []
            price_history = _parse_json_field(r["price_history"]) or []

            listings_batch.append({
                "title": r["title"],
                "make": r["make"],
                "model": r["model"],
                "year": r["year"],
                "type": r["type"],
                "price": float(r["price"]) if r["price"] else 0,
                "mileage": r["mileage"],
                "length": float(r["length"]) if r["length"] else None,
                "slides": r["slides"],
                "sleeps": r["sleeps"],
                "location": r["location"],
                "condition": r["condition"],
                "description": r["description"],
                "features": features,
                "images": images,
                "dealer_name": r["dealer_name"],
                "dealer_domain": _effective_domain(r["dealer_domain"], r["dealer_name"] or ""),
                "vin": r["vin"],
                "width": float(r["width_ft"]) if r["width_ft"] else None,
                "height": float(r["height_ft"]) if r["height_ft"] else None,
                "dry_weight": float(r["dry_weight"]) if r["dry_weight"] else None,
                "gvwr": float(r["gvwr"]) if r["gvwr"] else None,
                "hitch_weight": float(r["hitch_weight"]) if r["hitch_weight"] else None,
                "fresh_water_capacity": float(r["fresh_water"]) if r["fresh_water"] else None,
                "gray_water_capacity": float(r["grey_water"]) if r["grey_water"] else None,
                "black_water_capacity": float(r["black_water"]) if r["black_water"] else None,
                "generator": bool(r["generator"]) if r["generator"] is not None else None,
                "solar": bool(r["solar"]) if r["solar"] is not None else None,
                "awning": bool(r["awning"]) if r["awning"] is not None else True,
                "outdoor_kitchen": bool(r["outdoor_kitchen"]) if r["outdoor_kitchen"] is not None else None,
                "washer_dryer": bool(r["washer_dryer"]) if r["washer_dryer"] is not None else None,
                "price_history": price_history,
            })

        try:
            result = _post_json(url, {"dealers": [], "listings": listings_batch}, api_key)
            batch_inserted = result.get("listings", {}).get("inserted", 0)
            batch_updated = result.get("listings", {}).get("updated", 0)
            batch_skipped = result.get("listings", {}).get("skipped", 0)
            stats["inserted"] += batch_inserted
            stats["updated"] += batch_updated
            stats["skipped"] += batch_skipped
            stats["batches"] += 1
            if stats["batches"] % 20 == 0:
                LOGGER.info(
                    "push_to_prod progress: %d/%d listings pushed",
                    offset + len(rows), total,
                )
        except Exception as exc:
            LOGGER.error("push_to_prod batch at offset=%d failed: %s", offset, exc)
            stats["errors"] += 1

        offset += LISTING_BATCH_SIZE

    cur.close()
    conn.close()
    LOGGER.info("push_to_prod complete: %s", stats)
    return stats


if __name__ == "__main__":
    import sys
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        result = push_db_to_production()
        print(json.dumps(result, indent=2))
        sys.exit(0 if result["errors"] == 0 else 1)
    except Exception as exc:
        LOGGER.error("push_to_prod failed: %s", exc)
        sys.exit(1)

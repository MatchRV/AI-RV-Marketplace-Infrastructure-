from __future__ import annotations

import concurrent.futures
import json
import logging
import os
import time
from collections import Counter
from pathlib import Path
from typing import Iterable

import psycopg
from psycopg.rows import dict_row

from .db import InventorySync
from .models import Dealer, Listing
from .normalize import build_listing_identity
from .scraper import InventoryScraper, listing_to_dict

LOGGER = logging.getLogger(__name__)


def load_dealers(path: str | Path) -> list[Dealer]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    dealers: list[Dealer] = []
    seen_urls: set[str] = set()
    for row in raw:
        url = str(row["url"]).strip()
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        dealers.append(
            Dealer(
                name=str(row["name"]).strip(),
                city=str(row.get("city") or "WA").strip(),
                url=url,
            )
        )
    return dealers


def filter_dealers(dealers: list[Dealer], query: str | None) -> list[Dealer]:
    if not query:
        return dealers
    needle = query.lower()
    return [
        dealer
        for dealer in dealers
        if needle in dealer.name.lower() or needle in dealer.city.lower() or needle in dealer.domain.lower()
    ]


def apply_business_deduplication(listings: Iterable[Listing]) -> list[Listing]:
    """Apply the category-scoped dedup rule exactly once before DB sync.

    build_listing_identity only collapses Class C, fifth wheel, and travel
    trailer records by dealer/year/manufacturer/brand/model/floorplan. All
    other categories use unit-level keys, so every Class A, Class B, toy hauler,
    popup, truck camper, etc. record is retained.
    """
    retained: dict[str, Listing] = {}
    for listing in listings:
        identity = build_listing_identity(listing)
        current = retained.get(identity)
        if current is None or completeness_score(listing) > completeness_score(current):
            retained[identity] = listing
    return list(retained.values())


def completeness_score(listing: Listing) -> int:
    score = 0
    score += len(listing.photos) * 2
    score += len(listing.specs)
    score += 3 if listing.description else 0
    score += 2 if listing.vin else 0
    score += 2 if listing.stock_number else 0
    return score


def write_snapshot(path: str | Path, listings: Iterable[Listing]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = [listing_to_dict(listing) for listing in listings]
    target.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


WA_CITY_COORDS: dict[str, tuple[float, float]] = {
    "seattle": (47.6062, -122.3321), "tacoma": (47.2529, -122.4443),
    "kent": (47.3809, -122.2348), "auburn": (47.3073, -122.2285),
    "everett": (47.9790, -122.2021), "spokane": (47.6588, -117.4260),
    "vancouver": (45.6387, -122.6615), "olympia": (47.0379, -122.9007),
    "bellingham": (48.7519, -122.4787), "yakima": (46.6021, -120.5059),
    "mount vernon": (48.4213, -122.3341), "marysville": (48.0518, -122.1771),
    "puyallup": (47.1854, -122.2929), "poulsbo": (47.7354, -122.6468),
    "bremerton": (47.5673, -122.6326), "silverdale": (47.6479, -122.6943),
    "port orchard": (47.5401, -122.6329), "gig harbor": (47.3318, -122.5793),
    "federal way": (47.3223, -122.3126), "renton": (47.4829, -122.2171),
    "bellevue": (47.6101, -122.2015), "kirkland": (47.6815, -122.2087),
    "redmond": (47.6740, -122.1215), "issaquah": (47.5301, -122.0326),
    "lynnwood": (47.8209, -122.3151), "edmonds": (47.8107, -122.3779),
    "shoreline": (47.7543, -122.3429), "burien": (47.4704, -122.3468),
    "des moines": (47.4018, -122.3243), "tukwila": (47.4742, -122.2612),
    "lakewood": (47.1718, -122.5185), "pasco": (46.2396, -119.1006),
    "kennewick": (46.2113, -119.1372), "richland": (46.2804, -119.2752),
    "wenatchee": (47.4235, -120.3103), "walla walla": (46.0646, -118.3430),
    "moses lake": (47.1301, -119.2779), "ellensburg": (46.9965, -120.5487),
    "aberdeen": (46.9754, -123.8154), "centralia": (46.7162, -122.9543),
    "longview": (46.1382, -122.9382), "port angeles": (48.1181, -123.4307),
    "sequim": (48.0793, -123.1007), "oak harbor": (48.2929, -122.6429),
    "anacortes": (48.5126, -122.6126), "burlington": (48.4754, -122.3279),
    "monroe": (47.8554, -121.9715), "snohomish": (47.9126, -122.0987),
    "arlington": (48.1654, -122.1251), "stanwood": (48.2415, -122.3743),
    "bonney lake": (47.1779, -122.1762), "maple valley": (47.3690, -122.0479),
    "enumclaw": (47.2021, -121.9921), "yelm": (46.9429, -122.6093),
    "lacey": (47.0340, -122.8232), "tumwater": (47.0076, -122.9085),
    "shelton": (47.2151, -123.1007), "covington": (47.3601, -122.1029),
}


def _geocode_location(location: str) -> tuple[float, float] | None:
    city = location.split(",")[0].strip().lower()
    if city in WA_CITY_COORDS:
        return WA_CITY_COORDS[city]
    try:
        import urllib.request
        import urllib.parse
        query = urllib.parse.quote(location)
        url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1&countrycodes=us"
        req = urllib.request.Request(url, headers={"User-Agent": "MatchRV/1.0 (contact@matchrv.com)"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            results = json.loads(resp.read())
        if results:
            return (float(results[0]["lat"]), float(results[0]["lon"]))
    except Exception:
        pass
    return None


def geocode_new_listings(database_url: str) -> dict[str, int]:
    """Geocode any listings that have a location string but no lat/lng yet."""
    stats = {"geocoded": 0, "failed": 0, "skipped": 0}
    try:
        with psycopg.connect(database_url, row_factory=dict_row) as conn:
            rows = conn.execute(
                "SELECT id, location FROM listings WHERE latitude IS NULL AND location IS NOT NULL ORDER BY id"
            ).fetchall()
            LOGGER.info("[geocode] %d listings need geocoding", len(rows))
            for row in rows:
                coords = _geocode_location(row["location"])
                if coords:
                    conn.execute(
                        "UPDATE listings SET latitude = %s, longitude = %s WHERE id = %s",
                        (coords[0], coords[1], row["id"]),
                    )
                    stats["geocoded"] += 1
                    city = row["location"].split(",")[0].strip().lower()
                    if city not in WA_CITY_COORDS:
                        time.sleep(1.1)
                else:
                    stats["failed"] += 1
                    LOGGER.warning("[geocode] failed: %r (id=%s)", row["location"], row["id"])
            conn.commit()
    except Exception as exc:
        LOGGER.error("[geocode] error: %s", exc)
    LOGGER.info("[geocode] done — geocoded=%d failed=%d", stats["geocoded"], stats["failed"])
    return stats


def run_full_sync(
    *,
    dealers_file: str | Path,
    database_url: str | None,
    output_file: str | Path | None = None,
    max_pages_per_dealer: int = 0,
    detail_workers: int = 8,
    max_detail_urls_per_dealer: int = 0,
    dealer_filter: str | None = None,
    browser_fallback: bool = False,
    bright_data: bool = True,
    skip_finalize: bool = False,
) -> dict[str, int]:
    dealers = filter_dealers(load_dealers(dealers_file), dealer_filter)
    scraper = InventoryScraper(
        max_pages_per_dealer=max_pages_per_dealer,
        detail_workers=detail_workers,
        max_detail_urls_per_dealer=max_detail_urls_per_dealer,
        browser_fallback=browser_fallback,
        bright_data=bright_data,
    )

    # Persist run_id in rv_scraper_meta so a container restart can resume the
    # same run rather than starting from dealer #1 again.
    db: InventorySync | None = None
    run_id = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    listing_columns: set[str] = set()
    dealer_columns: set[str] = set()
    completed_domains: set[str] = set()

    if database_url:
        db = InventorySync(database_url)
        with db.connect() as conn:
            db.ensure_companion_tables(conn)
            listing_columns = db.table_columns(conn, db.listings_table)
            dealer_columns = db.table_columns(conn, db.dealers_table)
            run_id = db.get_or_create_run_id(conn)
            completed_domains = db.completed_dealer_domains(conn, run_id)

    if completed_domains:
        LOGGER.info(
            "Resuming run %s — %d dealer domain(s) already done: %s",
            run_id,
            len(completed_domains),
            ", ".join(sorted(completed_domains)),
        )

    all_raw: list[Listing] = []
    seen_identities: set[str] = set()
    db_inserted = db_updated = db_price_changes = 0
    dealers_skipped = 0

    for dealer in dealers:
        # Skip dealers whose domain was already upserted in this run.
        if db and dealer.domain in completed_domains:
            LOGGER.info("Dealer %s already scraped this run — skipping", dealer.name)
            dealers_skipped += 1
            # Still need their identities so finalize_run doesn't mark them sold.
            with db.connect() as conn:
                seen_identities |= db.dealer_identities_in_run(conn, dealer.domain, run_id)
            continue

        LOGGER.info("Scraping %s (%s)", dealer.name, dealer.url)
        dealer_raw: list[Listing] = []
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as _ex:
                _fut = _ex.submit(scraper.scrape_dealer, dealer)
                try:
                    _timeout = int(os.environ.get("DEALER_SCRAPE_TIMEOUT", "1800"))
                    dealer_raw = _fut.result(timeout=_timeout)
                except concurrent.futures.TimeoutError:
                    _timeout_used = int(os.environ.get("DEALER_SCRAPE_TIMEOUT", "1800"))
                    LOGGER.warning(
                        "Dealer %s timed out after %ds — skipping",
                        dealer.name,
                        _timeout_used,
                    )
                    scraper.skip_reasons["dealer_timeout"] += 1
        except Exception as exc:
            LOGGER.exception("Dealer %s failed; continuing: %s", dealer.name, exc)
            scraper.skip_reasons["dealer_failed"] += 1

        dealer_deduped = apply_business_deduplication(dealer_raw)
        all_raw.extend(dealer_raw)
        for listing in dealer_deduped:
            seen_identities.add(build_listing_identity(listing))

        # Write this dealer to DB immediately — a container restart after this
        # point only loses the *next* dealer, not everything scraped so far.
        if db:
            db_write_ok = False  # track whether we should mark this dealer done
            if dealer_deduped:
                try:
                    upsert_stats = db.upsert_dealer(
                        dealer_deduped,
                        run_id,
                        listing_columns=listing_columns,
                        dealer_columns=dealer_columns,
                    )
                    db_inserted += upsert_stats.get("inserted", 0)
                    db_updated += upsert_stats.get("updated", 0)
                    db_price_changes += upsert_stats.get("price_changes", 0)
                    LOGGER.info(
                        "Dealer %s synced — inserted=%d updated=%d",
                        dealer.name,
                        upsert_stats.get("inserted", 0),
                        upsert_stats.get("updated", 0),
                    )
                    db_write_ok = True
                except Exception as exc:
                    LOGGER.error(
                        "DB upsert failed for dealer %s: %s — will NOT mark done so it "
                        "can be re-scraped on resume.",
                        dealer.name,
                        exc,
                    )
            else:
                # 0 listings returned — protect existing records from deletion.
                # A zero-result scrape almost always means bot detection, a site
                # outage, or a structure change — NOT a dealer selling every unit
                # overnight.  Inject existing live identities into seen_identities
                # so finalize_run leaves them untouched.
                try:
                    with db.connect() as conn:
                        protected = db.live_dealer_identities(conn, dealer.domain)
                    if protected:
                        LOGGER.warning(
                            "Dealer %s returned 0 listings — protecting %d existing records "
                            "from deletion (likely bot block or site change). "
                            "Run with --dealer-filter to re-scrape manually.",
                            dealer.name,
                            len(protected),
                        )
                        seen_identities |= protected
                    else:
                        LOGGER.info("Dealer %s: 0 listings and no existing records — nothing to protect", dealer.name)
                except Exception as exc:
                    LOGGER.error("live_dealer_identities failed for %s: %s", dealer.name, exc)
                # A 0-listing dealer is genuinely "done" for this run (intentionally skipped)
                db_write_ok = True
            # Only mark done when the upsert committed — if upsert raised an
            # exception the transaction rolled back and we want to retry on resume.
            if db_write_ok:
                try:
                    with db.connect() as conn:
                        db.mark_dealer_complete(conn, dealer.domain, run_id)
                except Exception as exc:
                    LOGGER.error("mark_dealer_complete failed for %s: %s", dealer.name, exc)

    # Clean up per-thread browsers.
    scraper._close_thread_browser()

    final_listings = apply_business_deduplication(all_raw)

    stats: dict[str, int | str] = {
        "dealers": len(dealers),
        "dealers_skipped_resume": dealers_skipped,
        "scraped": len(all_raw),
        "after_dedup": len(final_listings),
        "skipped": sum(scraper.skip_reasons.values()),
        "db_inserted": db_inserted,
        "db_updated": db_updated,
        "db_price_changes": db_price_changes,
    }
    for reason, count in scraper.skip_reasons.items():
        stats[f"skipped_{reason}"] = count

    if output_file:
        write_snapshot(output_file, final_listings)

    if db:
        if skip_finalize:
            LOGGER.info(
                "skip_finalize=True — skipping mark-sold step. "
                "Use this only for single-dealer recovery runs."
            )
            stats["db_sold"] = 0
        else:
            try:
                sold_stats = db.finalize_run(seen_identities, run_id)
                stats["db_sold"] = sold_stats.get("sold", 0)
            except Exception as exc:
                LOGGER.error("finalize_run failed: %s", exc)
        geo_stats = geocode_new_listings(database_url)
        stats.update({f"geo_{key}": value for key, value in geo_stats.items()})
    else:
        LOGGER.warning("DATABASE_URL not set; wrote snapshot only")

    return stats

from __future__ import annotations

import json
import logging
from collections import Counter
from pathlib import Path
from typing import Iterable

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


def run_full_sync(
    *,
    dealers_file: str | Path,
    database_url: str | None,
    output_file: str | Path | None = None,
    max_pages_per_dealer: int = 0,
    detail_workers: int = 8,
    max_detail_urls_per_dealer: int = 0,
    dealer_filter: str | None = None,
) -> dict[str, int]:
    dealers = filter_dealers(load_dealers(dealers_file), dealer_filter)
    scraper = InventoryScraper(
        max_pages_per_dealer=max_pages_per_dealer,
        detail_workers=detail_workers,
        max_detail_urls_per_dealer=max_detail_urls_per_dealer,
    )
    raw_listings = scraper.scrape_dealers(dealers)
    final_listings = apply_business_deduplication(raw_listings)

    stats = {
        "dealers": len(dealers),
        "scraped": len(raw_listings),
        "after_dedup": len(final_listings),
        "skipped": sum(scraper.skip_reasons.values()),
    }
    for reason, count in scraper.skip_reasons.items():
        stats[f"skipped_{reason}"] = count

    if output_file:
        write_snapshot(output_file, final_listings)

    if database_url:
        db_stats = InventorySync(database_url).sync(final_listings)
        stats.update({f"db_{key}": value for key, value in db_stats.items()})
    else:
        LOGGER.warning("DATABASE_URL not set; wrote snapshot only")
    return stats

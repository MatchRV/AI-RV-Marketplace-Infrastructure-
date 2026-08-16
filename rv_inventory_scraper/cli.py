from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

from .pipeline import run_full_sync


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Scrape and sync Washington RV dealer inventory.")
    parser.add_argument("--dealers", default="wa-dealers.json", help="Path to WA dealer JSON list.")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"), help="Postgres DATABASE_URL.")
    parser.add_argument("--output", default="output/wa-rv-inventory.json", help="Snapshot JSON output path.")
    parser.add_argument(
        "--max-pages-per-dealer",
        type=int,
        default=0,
        help="Loop guard for pagination. 0 means unlimited; this is not a listing cap.",
    )
    parser.add_argument(
        "--detail-workers",
        type=int,
        default=8,
        help="Concurrent detail-page fetch/parse workers per dealer.",
    )
    parser.add_argument(
        "--max-detail-urls-per-dealer",
        type=int,
        default=0,
        help="Emergency guard for bad sites that expose endless detail-like URLs. 0 means unlimited.",
    )
    parser.add_argument(
        "--dealer-filter",
        default=None,
        help="Scrape only dealers whose name, city, or domain contains this text.",
    )
    parser.add_argument(
        "--browser-fallback",
        action="store_true",
        default=False,
        help=(
            "When a normal HTTP fetch returns 401, 403, or 429, retry that URL using "
            "a headless Playwright Chromium browser. Requires: python -m playwright install chromium"
        ),
    )
    parser.add_argument(
        "--no-bright-data",
        action="store_true",
        default=False,
        help="Disable the Bright Data residential proxy fallback even if credentials are set in env vars.",
    )
    parser.add_argument(
        "--skip-finalize",
        action="store_true",
        default=False,
        help=(
            "Skip the mark-sold / finalize step after scraping. "
            "Use only for single-dealer recovery runs where running finalize "
            "would incorrectly mark all other dealers' listings as sold."
        ),
    )
    parser.add_argument("--verbose", action="store_true", help="Enable verbose scraper logging.")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    stats = run_full_sync(
        dealers_file=Path(args.dealers),
        database_url=args.database_url,
        output_file=Path(args.output),
        max_pages_per_dealer=args.max_pages_per_dealer,
        detail_workers=args.detail_workers,
        max_detail_urls_per_dealer=args.max_detail_urls_per_dealer,
        dealer_filter=args.dealer_filter,
        browser_fallback=args.browser_fallback,
        bright_data=not args.no_bright_data,
        skip_finalize=args.skip_finalize,
    )
    print(json.dumps(stats, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

from __future__ import annotations

import logging
import os
import signal
import time
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .pipeline import run_full_sync

LOGGER = logging.getLogger(__name__)


def scheduled_sync() -> None:
    """Run one full inventory sync.

    Each scheduled run scrapes the full dealer list, excludes zero-photo
    listings, applies the scoped dedupe rule, upserts active inventory, marks
    missing listings sold, and queues opted-in price-change notifications.
    """
    stats = run_full_sync(
        dealers_file=Path(os.getenv("DEALERS_FILE", "wa-dealers.json")),
        database_url=os.getenv("DATABASE_URL"),
        output_file=Path(os.getenv("SCRAPER_OUTPUT", "output/wa-rv-inventory.json")),
        max_pages_per_dealer=int(os.getenv("MAX_PAGES_PER_DEALER", "0")),
        detail_workers=int(os.getenv("DETAIL_WORKERS", "8")),
        max_detail_urls_per_dealer=int(os.getenv("MAX_DETAIL_URLS_PER_DEALER", "0")),
        dealer_filter=os.getenv("DEALER_FILTER"),
    )
    LOGGER.info("Scheduled sync complete: %s", stats)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    scheduler = BackgroundScheduler(timezone=os.getenv("SCRAPER_TIMEZONE", "America/Los_Angeles"))
    # Daily automated sync: APScheduler is used because this workspace has no
    # cron or Windows Task Scheduler config. The trigger fires at 3:00 AM local
    # scraper time and runs a full inventory sync each time.
    scheduler.add_job(
        scheduled_sync,
        CronTrigger(hour=3, minute=0),
        id="daily-wa-rv-inventory-sync",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    LOGGER.info("Scheduler started; next 3:00 AM sync is queued.")

    stop = False

    def handle_stop(*_: object) -> None:
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)
    while not stop:
        time.sleep(1)
    scheduler.shutdown(wait=False)


if __name__ == "__main__":
    main()

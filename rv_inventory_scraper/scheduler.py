from __future__ import annotations

import logging
import os
import signal
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .pipeline import run_full_sync
from .push_to_prod import push_db_to_production

LOGGER = logging.getLogger(__name__)

# Prevents two concurrent syncs (startup thread vs. APScheduler cron).
_SYNC_LOCK = threading.Lock()

# Last-sync tracking so we can detect missed 3AM runs when the Replit
# container restarts (dev containers sleep and miss cron windows).
#
# Primary store: PostgreSQL (rv_scraper_meta table) — survives container
# restarts, which wipe /tmp. The file is kept as a best-effort fallback for
# runs without DATABASE_URL.
_LAST_SYNC_FILE = Path(os.getenv("SCRAPER_LAST_SYNC_FILE", "/tmp/rv_scraper_last_sync.txt"))
_STARTUP_SYNC_THRESHOLD_HOURS = float(os.getenv("STARTUP_SYNC_THRESHOLD_HOURS", "20"))
_LAST_SYNC_KEY = "last_completed_sync_at"


def _ensure_meta_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rv_scraper_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def _record_sync_time() -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        try:
            import psycopg  # noqa: PLC0415

            with psycopg.connect(database_url) as conn:
                _ensure_meta_table(conn)
                conn.execute(
                    """
                    INSERT INTO rv_scraper_meta (key, value, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
                    """,
                    (_LAST_SYNC_KEY, now_iso),
                )
                conn.commit()
        except Exception as exc:
            LOGGER.warning("Could not write last-sync timestamp to DB: %s", exc)
    try:
        _LAST_SYNC_FILE.write_text(now_iso)
    except Exception as exc:
        LOGGER.warning("Could not write last-sync timestamp file: %s", exc)


def _read_last_sync_time() -> datetime | None:
    """Read the last completed sync time: DB first, /tmp file as fallback."""
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        try:
            import psycopg  # noqa: PLC0415

            with psycopg.connect(database_url) as conn:
                _ensure_meta_table(conn)
                row = conn.execute(
                    "SELECT value FROM rv_scraper_meta WHERE key = %s",
                    (_LAST_SYNC_KEY,),
                ).fetchone()
                conn.commit()
            if row and row[0]:
                return datetime.fromisoformat(str(row[0]))
        except Exception as exc:
            LOGGER.warning("Could not read last-sync timestamp from DB: %s", exc)
    try:
        raw = _LAST_SYNC_FILE.read_text().strip()
        return datetime.fromisoformat(raw)
    except Exception:
        return None


def _hours_since_last_sync() -> float:
    """Return hours since the last recorded sync, or inf if never synced."""
    last = _read_last_sync_time()
    if last is None:
        return float("inf")
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - last).total_seconds() / 3600


def scheduled_sync() -> None:
    """Run one full inventory sync, then push results to production.

    Each scheduled run scrapes the full dealer list, excludes zero-photo
    listings, applies the scoped dedupe rule, upserts active inventory, marks
    missing listings sold, queues opted-in price-change notifications, and
    finally pushes the updated dev DB to the production API so the live site
    always shows fresh inventory.
    """
    if not _SYNC_LOCK.acquire(blocking=False):
        LOGGER.info("Sync already in progress — skipping this trigger.")
        return
    try:
        _scheduled_sync_impl()
    finally:
        _SYNC_LOCK.release()


def _scheduled_sync_impl() -> None:
    skip_finalize = os.getenv("SKIP_FINALIZE", "false").lower() not in ("0", "false", "no")
    stats = run_full_sync(
        dealers_file=Path(os.getenv("DEALERS_FILE", "wa-dealers.json")),
        database_url=os.getenv("DATABASE_URL"),
        output_file=Path(os.getenv("SCRAPER_OUTPUT", "output/wa-rv-inventory.json")),
        max_pages_per_dealer=int(os.getenv("MAX_PAGES_PER_DEALER", "0")),
        detail_workers=int(os.getenv("DETAIL_WORKERS", "8")),
        max_detail_urls_per_dealer=int(os.getenv("MAX_DETAIL_URLS_PER_DEALER", "0")),
        dealer_filter=os.getenv("DEALER_FILTER"),
        browser_fallback=os.getenv("BROWSER_FALLBACK", "true").lower() not in ("0", "false", "no"),
        skip_finalize=skip_finalize,
    )
    LOGGER.info("Scheduled sync complete: %s", stats)

    try:
        push_stats = push_db_to_production()
        LOGGER.info("Production push complete: %s", push_stats)
    except Exception as exc:
        LOGGER.error("Production push failed (dev DB is still updated): %s", exc)

    # Record completion time AFTER the sync finishes so the startup-sync guard
    # correctly measures elapsed time since the last *completed* run.
    _record_sync_time()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    scheduler = BackgroundScheduler(timezone=os.getenv("SCRAPER_TIMEZONE", "America/Los_Angeles"))
    scheduler.add_job(
        scheduled_sync,
        CronTrigger(hour=3, minute=0),
        id="daily-wa-rv-inventory-sync",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()

    # Replit dev containers restart frequently and may be asleep at 3 AM, so
    # the cron trigger alone is unreliable. On every startup we check how long
    # ago the last sync ran and kick off an immediate background sync if it has
    # been longer than STARTUP_SYNC_THRESHOLD_HOURS (default 20 h).
    hours_ago = _hours_since_last_sync()
    if hours_ago >= _STARTUP_SYNC_THRESHOLD_HOURS:
        LOGGER.info(
            "Last sync was %.1f hours ago (threshold %.0f h) — starting immediate sync in background.",
            hours_ago,
            _STARTUP_SYNC_THRESHOLD_HOURS,
        )
        threading.Thread(target=scheduled_sync, name="startup-sync", daemon=True).start()
    else:
        LOGGER.info(
            "Last sync was %.1f hours ago — skipping startup sync (next 3:00 AM Pacific).",
            hours_ago,
        )

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

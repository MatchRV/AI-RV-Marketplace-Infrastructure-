from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Iterable

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from .models import Listing
from .normalize import build_listing_identity, normalize_type

LOGGER = logging.getLogger(__name__)


class InventorySync:
    """Full inventory sync for scraped RV listings.

    The sync keeps a companion identity table so existing application schemas do
    not need to dedupe by VIN globally. Each run is treated as a full snapshot:
    listings seen in the current scrape are upserted, and previously synced
    listings absent from the snapshot are flagged sold when the listings table
    has sold columns, otherwise removed from the active app table.
    """

    def __init__(
        self,
        database_url: str,
        *,
        listings_table: str = "listings",
        dealers_table: str = "dealers",
    ) -> None:
        self.database_url = database_url
        self.listings_table = self.validate_identifier(listings_table)
        self.dealers_table = self.validate_identifier(dealers_table)

    def connect(self) -> psycopg.Connection:
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def validate_identifier(self, value: str) -> str:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
            raise ValueError(f"Unsafe SQL identifier: {value!r}")
        return value

    def sync(self, listings: Iterable[Listing]) -> dict[str, int]:
        now = datetime.now(timezone.utc)
        snapshot = list(listings)
        stats = {
            "seen": len(snapshot),
            "inserted": 0,
            "updated": 0,
            "sold": 0,
            "price_changes": 0,
            "notifications": 0,
            "skipped": 0,
        }
        run_id = now.isoformat()

        with self.connect() as conn:
            self.ensure_companion_tables(conn)
            listing_columns = self.table_columns(conn, self.listings_table)
            dealer_columns = self.table_columns(conn, self.dealers_table)
            seen_identities: set[str] = set()

            with conn.transaction():
                for listing in snapshot:
                    identity = build_listing_identity(listing)
                    seen_identities.add(identity)
                    dealer_id = self.get_or_create_dealer(conn, dealer_columns, listing)
                    existing = self.lookup_sync_state(conn, identity)
                    if existing:
                        previous_price = self.current_price(conn, int(existing["listing_id"]))
                        self.update_listing(conn, listing_columns, int(existing["listing_id"]), listing, dealer_id)
                        self.touch_sync_state(conn, identity, listing, run_id)
                        stats["updated"] += 1
                        if previous_price is not None and previous_price != listing.price:
                            stats["price_changes"] += 1
                            stats["notifications"] += self.record_price_change(
                                conn,
                                int(existing["listing_id"]),
                                listing,
                                previous_price,
                                int(listing.price or 0),
                            )
                    else:
                        listing_id = self.insert_listing(conn, listing_columns, listing, dealer_id)
                        self.insert_sync_state(conn, identity, listing_id, listing, run_id)
                        stats["inserted"] += 1

                stats["sold"] = self.mark_missing_as_sold(conn, listing_columns, seen_identities, run_id)
                self.refresh_dealer_counts(conn, dealer_columns)
        return stats

    def upsert_dealer(
        self,
        listings: Iterable[Listing],
        run_id: str,
        *,
        listing_columns: set[str] | None = None,
        dealer_columns: set[str] | None = None,
    ) -> dict[str, int]:
        """Upsert one dealer's listings immediately — no mark-sold, no dedup.

        Called inside run_full_sync after each dealer completes so that a
        container restart only loses the current dealer's in-flight work rather
        than the entire run.  mark_missing_as_sold is called once at the end of
        the full run after all dealers have been processed.
        """
        snapshot = list(listings)
        stats: dict[str, int] = {"seen": len(snapshot), "inserted": 0, "updated": 0, "price_changes": 0}

        with self.connect() as conn:
            self.ensure_companion_tables(conn)
            cols = listing_columns or self.table_columns(conn, self.listings_table)
            dcols = dealer_columns or self.table_columns(conn, self.dealers_table)

            with conn.transaction():
                for listing in snapshot:
                    identity = build_listing_identity(listing)
                    dealer_id = self.get_or_create_dealer(conn, dcols, listing)
                    existing = self.lookup_sync_state(conn, identity)
                    if existing:
                        previous_price = self.current_price(conn, int(existing["listing_id"]))
                        self.update_listing(conn, cols, int(existing["listing_id"]), listing, dealer_id)
                        self.touch_sync_state(conn, identity, listing, run_id)
                        stats["updated"] += 1
                        if previous_price is not None and previous_price != listing.price:
                            stats["price_changes"] += 1
                            self.record_price_change(
                                conn,
                                int(existing["listing_id"]),
                                listing,
                                previous_price,
                                int(listing.price or 0),
                            )
                    else:
                        listing_id = self.insert_listing(conn, cols, listing, dealer_id)
                        self.insert_sync_state(conn, identity, listing_id, listing, run_id)
                        stats["inserted"] += 1
        return stats

    def finalize_run(self, seen_identities: set[str], run_id: str) -> dict[str, int]:
        """Mark listings not seen in this run as sold and refresh dealer counts.

        Called once after all dealers have been upserted via upsert_dealer().
        """
        stats: dict[str, int] = {"sold": 0}
        with self.connect() as conn:
            listing_columns = self.table_columns(conn, self.listings_table)
            dealer_columns = self.table_columns(conn, self.dealers_table)
            with conn.transaction():
                stats["sold"] = self.mark_missing_as_sold(conn, listing_columns, seen_identities, run_id)
                self.refresh_dealer_counts(conn, dealer_columns)
                self._delete_meta(conn, "current_run_id")
        return stats

    # ------------------------------------------------------------------
    # Resume helpers — persist run_id across container restarts
    # ------------------------------------------------------------------

    def _upsert_meta(self, conn: psycopg.Connection, key: str, value: str) -> None:
        conn.execute(
            """
            INSERT INTO rv_scraper_meta (key, value, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            """,
            (key, value),
        )

    def _delete_meta(self, conn: psycopg.Connection, key: str) -> None:
        conn.execute("DELETE FROM rv_scraper_meta WHERE key = %s", (key,))

    def _read_meta(self, conn: psycopg.Connection, key: str) -> str | None:
        row = conn.execute(
            "SELECT value FROM rv_scraper_meta WHERE key = %s", (key,)
        ).fetchone()
        return str(row["value"]) if row else None

    def get_or_create_run_id(self, conn: psycopg.Connection) -> str:
        """Return the persisted run_id for the current in-progress scrape.

        If no run is in progress a new run_id is generated, stored in
        rv_scraper_meta as 'current_run_id', and returned.  On the next call
        after a container restart the same id is returned so the resume logic
        can skip already-completed dealers.
        """
        existing = self._read_meta(conn, "current_run_id")
        if existing:
            LOGGER.info("Resuming scrape run %s", existing)
            return existing
        run_id = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self._upsert_meta(conn, "current_run_id", run_id)
        conn.commit()
        LOGGER.info("Started new scrape run %s", run_id)
        return run_id

    def mark_dealer_complete(self, conn: psycopg.Connection, domain: str, run_id: str) -> None:
        """Record *domain* as done in the current run (even if 0 listings scraped).

        Stored as JSON list in rv_scraper_meta under key
        ``completed_dealers_<run_id>`` so resume logic can skip it on restart.
        """
        key = f"completed_dealers_{run_id}"
        existing_raw = self._read_meta(conn, key)
        existing: list[str] = json.loads(existing_raw) if existing_raw else []
        if domain not in existing:
            existing.append(domain)
        self._upsert_meta(conn, key, json.dumps(existing))
        conn.commit()

    def completed_dealer_domains(self, conn: psycopg.Connection, run_id: str) -> set[str]:
        """Return domains already finished in *run_id* (listings-based OR explicitly marked)."""
        rows = conn.execute(
            "SELECT DISTINCT dealer_domain FROM rv_inventory_sync_state WHERE last_run_id = %s",
            (run_id,),
        ).fetchall()
        domains = {str(row["dealer_domain"]) for row in rows}
        # Also include dealers explicitly marked complete (e.g. 0-listing dealers)
        key = f"completed_dealers_{run_id}"
        meta_raw = self._read_meta(conn, key)
        if meta_raw:
            domains |= set(json.loads(meta_raw))
        return domains

    def dealer_identities_in_run(self, conn: psycopg.Connection, dealer_domain: str, run_id: str) -> set[str]:
        """Return identity keys for a dealer that were written in *run_id*.

        Used when skipping an already-scraped dealer so its listings are still
        counted as 'seen' and not incorrectly marked sold at finalize time.
        """
        rows = conn.execute(
            "SELECT identity_key FROM rv_inventory_sync_state WHERE dealer_domain = %s AND last_run_id = %s",
            (dealer_domain, run_id),
        ).fetchall()
        return {str(row["identity_key"]) for row in rows}

    def live_dealer_identities(self, conn: psycopg.Connection, dealer_domain: str) -> set[str]:
        """Return identity keys for all currently-live (not sold) listings for a dealer.

        Used as a safety guard: when a scrape returns 0 (or suspiciously few)
        listings for a dealer, inject these identities into seen_identities so
        finalize_run does not hard-delete real inventory that was likely blocked
        by bot detection or a temporary site outage.
        """
        rows = conn.execute(
            "SELECT identity_key FROM rv_inventory_sync_state WHERE dealer_domain = %s AND sold_at IS NULL",
            (dealer_domain,),
        ).fetchall()
        return {str(row["identity_key"]) for row in rows}

    def ensure_companion_tables(self, conn: psycopg.Connection) -> None:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rv_inventory_sync_state (
              identity_key TEXT PRIMARY KEY,
              listing_id INTEGER NOT NULL,
              dealer_domain TEXT NOT NULL,
              source_url TEXT,
              last_run_id TEXT NOT NULL,
              first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              sold_at TIMESTAMPTZ
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rv_price_changes (
              id BIGSERIAL PRIMARY KEY,
              listing_id INTEGER NOT NULL,
              identity_key TEXT NOT NULL,
              previous_price INTEGER NOT NULL,
              new_price INTEGER NOT NULL,
              reduction_amount INTEGER NOT NULL,
              changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rv_price_alert_subscriptions (
              id BIGSERIAL PRIMARY KEY,
              customer_id INTEGER NOT NULL,
              listing_id INTEGER,
              identity_key TEXT,
              email TEXT,
              opted_in BOOLEAN NOT NULL DEFAULT TRUE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rv_price_change_notifications (
              id BIGSERIAL PRIMARY KEY,
              customer_id INTEGER NOT NULL,
              listing_id INTEGER NOT NULL,
              price_change_id BIGINT NOT NULL,
              previous_price INTEGER NOT NULL,
              new_price INTEGER NOT NULL,
              reduction_amount INTEGER NOT NULL,
              payload JSONB NOT NULL,
              queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              sent_at TIMESTAMPTZ
            )
            """
        )

    def table_columns(self, conn: psycopg.Connection, table_name: str) -> set[str]:
        rows = conn.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = %s
            """,
            (table_name,),
        ).fetchall()
        return {str(row["column_name"]) for row in rows}

    def get_or_create_dealer(
        self,
        conn: psycopg.Connection,
        dealer_columns: set[str],
        listing: Listing,
    ) -> int:
        domain = listing.dealer_domain
        if "domain" in dealer_columns:
            row = conn.execute(
                f"SELECT id FROM {self.dealers_table} WHERE domain = %s LIMIT 1",
                (domain,),
            ).fetchone()
        else:
            row = conn.execute(
                f"SELECT id FROM {self.dealers_table} WHERE name = %s LIMIT 1",
                (listing.dealer_name,),
            ).fetchone()
        if row:
            return int(row["id"])

        values = {
            "name": listing.dealer_name,
            "domain": domain,
            "city": (listing.dealer_location or "Unknown").split(",")[0],
            "state": "WA",
            "total_listings": 0,
        }
        allowed = {k: v for k, v in values.items() if k in dealer_columns}
        columns = ", ".join(allowed)
        placeholders = ", ".join(["%s"] * len(allowed))
        inserted = conn.execute(
            f"INSERT INTO {self.dealers_table} ({columns}) VALUES ({placeholders}) RETURNING id",
            tuple(allowed.values()),
        ).fetchone()
        return int(inserted["id"])

    def lookup_sync_state(self, conn: psycopg.Connection, identity: str) -> dict[str, Any] | None:
        return conn.execute(
            "SELECT listing_id FROM rv_inventory_sync_state WHERE identity_key = %s LIMIT 1",
            (identity,),
        ).fetchone()

    def insert_sync_state(
        self,
        conn: psycopg.Connection,
        identity: str,
        listing_id: int,
        listing: Listing,
        run_id: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO rv_inventory_sync_state
              (identity_key, listing_id, dealer_domain, source_url, last_run_id, last_seen_at, sold_at)
            VALUES (%s, %s, %s, %s, %s, NOW(), NULL)
            """,
            (identity, listing_id, listing.dealer_domain, listing.source_url, run_id),
        )

    def touch_sync_state(
        self,
        conn: psycopg.Connection,
        identity: str,
        listing: Listing,
        run_id: str,
    ) -> None:
        conn.execute(
            """
            UPDATE rv_inventory_sync_state
            SET source_url = %s, last_run_id = %s, last_seen_at = NOW(), sold_at = NULL
            WHERE identity_key = %s
            """,
            (listing.source_url, run_id, identity),
        )

    def listing_values(self, listing_columns: set[str], listing: Listing, dealer_id: int) -> dict[str, Any]:
        rv_type = normalize_type(listing.rv_type) or "Other"
        title = listing.title or "Untitled RV"
        make = listing.manufacturer or listing.brand or "Unknown"
        model = listing.model or listing.floorplan or "Unknown"
        values = {
            "title": title,
            "make": make,
            "manufacturer": listing.manufacturer,
            "brand": listing.brand,
            "model": model,
            "floorplan": listing.floorplan,
            "year": listing.year,
            "type": rv_type,
            "rv_type": rv_type,
            "price": listing.price,
            "location": listing.dealer_location or "WA",
            "state": "WA",
            "dealer_id": dealer_id,
            "dealer_name": listing.dealer_name,
            "images": Json(listing.photos),
            "image_urls": Json(listing.photos),
            "description": listing.description,
            "features": Json([]),
            "specs": Json(listing.specs),
            "vin": listing.vin,
            "stock_number": listing.stock_number,
            "source_url": listing.source_url,
            "condition": (listing.condition or "used").lower(),
            "is_new": "new" in (listing.condition or "").lower(),
            "slides": self.spec_int(listing, "slides"),
            "sleeps": self.spec_int(listing, "sleeps") or self.spec_int(listing, "sleep capacity") or 2,
            "length": self.spec_number(listing, "length"),
            "market_value": listing.price,
            "deal_score": "fair_deal",
            "days_on_market": 0,
            "updated_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
            "is_sold": False,
            "sold_at": None,
            "price_history": Json([{"date": datetime.now(timezone.utc).date().isoformat(), "price": listing.price}]),
        }
        return {k: v for k, v in values.items() if k in listing_columns}

    def insert_listing(
        self,
        conn: psycopg.Connection,
        listing_columns: set[str],
        listing: Listing,
        dealer_id: int,
    ) -> int:
        values = self.listing_values(listing_columns, listing, dealer_id)
        values.pop("updated_at", None)
        columns = ", ".join(values)
        placeholders = ", ".join(["%s"] * len(values))
        row = conn.execute(
            f"INSERT INTO {self.listings_table} ({columns}) VALUES ({placeholders}) RETURNING id",
            tuple(values.values()),
        ).fetchone()
        return int(row["id"])

    def update_listing(
        self,
        conn: psycopg.Connection,
        listing_columns: set[str],
        listing_id: int,
        listing: Listing,
        dealer_id: int,
    ) -> None:
        values = self.listing_values(listing_columns, listing, dealer_id)
        values.pop("created_at", None)
        assignments = ", ".join(f"{column} = %s" for column in values)
        conn.execute(
            f"UPDATE {self.listings_table} SET {assignments} WHERE id = %s",
            (*values.values(), listing_id),
        )

    def current_price(self, conn: psycopg.Connection, listing_id: int) -> int | None:
        row = conn.execute(
            f"SELECT price FROM {self.listings_table} WHERE id = %s LIMIT 1",
            (listing_id,),
        ).fetchone()
        return int(row["price"]) if row and row["price"] is not None else None

    def record_price_change(
        self,
        conn: psycopg.Connection,
        listing_id: int,
        listing: Listing,
        previous_price: int,
        new_price: int,
    ) -> int:
        identity = build_listing_identity(listing)
        reduction = max(0, previous_price - new_price)
        row = conn.execute(
            """
            INSERT INTO rv_price_changes
              (listing_id, identity_key, previous_price, new_price, reduction_amount)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (listing_id, identity, previous_price, new_price, reduction),
        ).fetchone()
        price_change_id = int(row["id"])

        # Price-change notifications are queued only for opted-in customers.
        # The payload includes previous/new price and reduction amount so the
        # mail/SMS worker can send without re-querying historical prices.
        subscriptions = conn.execute(
            """
            SELECT customer_id, email
            FROM rv_price_alert_subscriptions
            WHERE opted_in = TRUE
              AND (listing_id = %s OR identity_key = %s)
            """,
            (listing_id, identity),
        ).fetchall()
        for subscription in subscriptions:
            payload = {
                "customer_id": subscription["customer_id"],
                "email": subscription["email"],
                "listing_id": listing_id,
                "title": listing.title,
                "source_url": listing.source_url,
                "previous_price": previous_price,
                "new_price": new_price,
                "reduction_amount": reduction,
            }
            conn.execute(
                """
                INSERT INTO rv_price_change_notifications
                  (customer_id, listing_id, price_change_id, previous_price,
                   new_price, reduction_amount, payload)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    subscription["customer_id"],
                    listing_id,
                    price_change_id,
                    previous_price,
                    new_price,
                    reduction,
                    json.dumps(payload),
                ),
            )
        return len(subscriptions)

    def mark_missing_as_sold(
        self,
        conn: psycopg.Connection,
        listing_columns: set[str],
        seen_identities: set[str],
        run_id: str,
    ) -> int:
        rows = conn.execute(
            """
            SELECT identity_key, listing_id
            FROM rv_inventory_sync_state
            WHERE sold_at IS NULL AND last_run_id <> %s
            """,
            (run_id,),
        ).fetchall()
        stale = [row for row in rows if row["identity_key"] not in seen_identities]
        for row in stale:
            listing_id = int(row["listing_id"])
            if "is_sold" in listing_columns or "sold_at" in listing_columns:
                updates: list[str] = []
                params: list[Any] = []
                if "is_sold" in listing_columns:
                    updates.append("is_sold = TRUE")
                if "sold_at" in listing_columns:
                    updates.append("sold_at = NOW()")
                if "updated_at" in listing_columns:
                    updates.append("updated_at = NOW()")
                conn.execute(f"UPDATE {self.listings_table} SET {', '.join(updates)} WHERE id = %s", (listing_id,))
            else:
                conn.execute(f"DELETE FROM {self.listings_table} WHERE id = %s", (listing_id,))
            conn.execute(
                "UPDATE rv_inventory_sync_state SET sold_at = NOW() WHERE identity_key = %s",
                (row["identity_key"],),
            )
        return len(stale)

    def refresh_dealer_counts(self, conn: psycopg.Connection, dealer_columns: set[str]) -> None:
        if "total_listings" not in dealer_columns:
            return
        conn.execute(
            f"""
            UPDATE {self.dealers_table} d
            SET total_listings = COALESCE((
              SELECT COUNT(*) FROM {self.listings_table} l
              WHERE l.dealer_id = d.id
            ), 0)
            """
        )

    def spec_int(self, listing: Listing, key: str) -> int | None:
        value = listing.specs.get(key)
        if value is None:
            return None
        from .normalize import parse_int

        return parse_int(value)

    def spec_number(self, listing: Listing, key: str) -> float | None:
        value = listing.specs.get(key)
        if value is None:
            return None
        import re

        match = re.search(r"\d+(\.\d+)?", str(value).replace(",", ""))
        return float(match.group(0)) if match else None

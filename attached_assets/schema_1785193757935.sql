-- MatchRV inventory schema (Postgres / Supabase-compatible)
-- Safe to re-run. Designed to sit alongside the existing LotAI tables.

-- 1) Extend the existing dealers table (no-ops if already applied)
ALTER TABLE IF EXISTS dealers ADD COLUMN IF NOT EXISTS city    text;
ALTER TABLE IF EXISTS dealers ADD COLUMN IF NOT EXISTS state   char(2);
ALTER TABLE IF EXISTS dealers ADD COLUMN IF NOT EXISTS domain  text;
ALTER TABLE IF EXISTS dealers ADD COLUMN IF NOT EXISTS platform text;

-- If dealers does not exist yet (fresh Replit DB), create it:
CREATE TABLE IF NOT EXISTS dealers (
  dealer_id  bigint PRIMARY KEY,
  slug       text UNIQUE NOT NULL,
  name       text NOT NULL,
  city       text,
  state      char(2),
  domain     text,
  platform   text,
  timezone   text DEFAULT 'America/Los_Angeles',
  phone      text,
  created_at timestamptz DEFAULT now()
);

-- 2) Listings
CREATE TABLE IF NOT EXISTS listings (
  listing_id      bigserial PRIMARY KEY,
  dealer_id       bigint NOT NULL REFERENCES dealers(dealer_id) ON DELETE CASCADE,
  external_id     text,
  stock_number    text,
  vin             text,
  state           char(2),
  unit_location   text,
  condition       text,
  year            smallint,
  make            text,
  model           text,
  floorplan       text,
  unit_type       text,
  price_usd       numeric(12,2),
  msrp_usd        numeric(12,2),
  sleeps          smallint,
  days_on_lot     integer,
  title           text,
  listing_url     text,
  source_platform text,
  photo_count     integer DEFAULT 0,
  is_active       boolean DEFAULT true,
  first_seen_at   timestamptz DEFAULT now(),
  last_seen_at    timestamptz DEFAULT now()
);

-- Natural key: one row per unit per dealer. Enables idempotent re-scrapes.
CREATE UNIQUE INDEX IF NOT EXISTS listings_dealer_external_uidx
  ON listings (dealer_id, external_id) WHERE external_id IS NOT NULL AND external_id <> '';

CREATE INDEX IF NOT EXISTS listings_state_idx      ON listings (state);
CREATE INDEX IF NOT EXISTS listings_make_model_idx ON listings (make, model);
CREATE INDEX IF NOT EXISTS listings_price_idx      ON listings (price_usd);
CREATE INDEX IF NOT EXISTS listings_year_idx       ON listings (year);
CREATE INDEX IF NOT EXISTS listings_active_idx     ON listings (is_active) WHERE is_active;

-- 3) Photos (one row per image, ordered)
CREATE TABLE IF NOT EXISTS listing_photos (
  photo_id   bigserial PRIMARY KEY,
  listing_id bigint NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  position   smallint NOT NULL DEFAULT 1,
  url        text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS listing_photos_uidx ON listing_photos (listing_id, position);
CREATE INDEX IF NOT EXISTS listing_photos_listing_idx ON listing_photos (listing_id);

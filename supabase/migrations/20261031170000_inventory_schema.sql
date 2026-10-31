-- MatchRV inventory search store (INVENTORY_SOURCE=supabase).
-- Private schema: not exposed through the Data API. RLS is on with no
-- policies, so anon/authenticated can never read it even if the schema is
-- exposed later; the api-server connects with a server-side connection string.

create schema if not exists inventory;
revoke all on schema inventory from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema inventory from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema inventory from authenticated'; end if;
end $$;

-- One row per loaded snapshot. Exactly one is active (what the server serves).
create table inventory.snapshots (
  version text primary key,                -- e.g. git sha of the snapshot commit
  built_at timestamptz not null,           -- snapshot builtAt (stale window is measured from here)
  loaded_at timestamptz not null default now(),
  columns_version integer not null,        -- INVENTORY_DB_COLUMNS_VERSION used by the loader
  units integer not null,                  -- all records (website corpus)
  mcp_eligible integer not null,           -- after the MCP quality screen (stale / price floor / category)
  search_ready integer not null,           -- website search-ready gate
  dealers integer,
  meta jsonb not null default '{}'::jsonb, -- snapshot stats, datasetNote, screen summary
  is_active boolean not null default false
);
create unique index snapshots_one_active on inventory.snapshots (is_active) where is_active;

-- Preset dictionaries for per-row raw-deflate of the unit JSON (~550 B/row
-- instead of ~1.7 KB with TOAST pglz). Rows keep the dictionary they were
-- written with, so old dictionaries stay until no row references them.
create table inventory.zdicts (
  id integer generated always as identity primary key,
  sha256 text not null unique,
  dict bytea not null,
  created_at timestamptz not null default now()
);

create table inventory.units (
  id text primary key,
  ord integer not null,                    -- position in the snapshot; search ties break in this order
  snapshot_version text not null,
  content_hash text not null,              -- md5 of the unit json; unchanged rows are not rewritten
  -- eligibility
  mcp_eligible boolean not null,
  quarantine jsonb,                        -- MCP screen issues when not eligible
  search_ready boolean not null,
  -- typed search columns (see lib/agent-core/src/inventory-db.ts unitSearchColumns)
  rv_type text not null,
  is_motorized boolean not null,
  condition text not null,
  title_says_used boolean not null,
  year integer not null,
  make text,
  brand_key text not null,                 -- brandKey(unitMakeModel(unit).brand): exact make filter
  model text,
  title text,
  price_usd double precision,
  length_ft double precision,
  weight_lbs double precision,             -- GVWR, else dry weight (search's weight checks)
  gvwr_lbs double precision,
  sleeps double precision,                 -- as served (facts-only)
  sleeps_servable double precision,        -- null unless isServableFact (search's sleeps check)
  fresh_water_gal double precision,
  slideouts double precision,
  f_bunkhouse boolean,
  f_solar boolean,
  f_solar_prep boolean,
  f_lithium boolean,
  f_generator boolean,
  f_four_season boolean,
  f_outdoor_kitchen boolean,
  f_two_entry_doors boolean,
  dealer_id text,
  dealer_seq integer not null,             -- 1-based order of the dealer's first appearance (website listing ids)
  dealer_name text,
  dealer_city text,
  dealer_state text,
  lat double precision,
  lng double precision,
  coords_ok boolean not null,
  has_photos boolean not null,
  last_seen_at timestamptz,
  description text,                        -- website keyword search only
  -- the full canonical record served to tools (enriched, facts-only):
  -- JSON, raw-deflated with inventory.zdicts(zdict_id) as preset dictionary
  unit_z bytea not null,
  zdict_id integer not null references inventory.zdicts (id),
  updated_at timestamptz not null default now()
);

-- Candidate scans run over mcp_eligible rows in snapshot order.
create index units_ord on inventory.units (ord, id);
create index units_elig_type_price on inventory.units (rv_type, price_usd) where mcp_eligible;
create index units_elig_state on inventory.units (dealer_state) where mcp_eligible;
create index units_elig_brand on inventory.units (brand_key) where mcp_eligible;
create index units_elig_geo on inventory.units (lat, lng) where mcp_eligible and coords_ok;
create index units_ready_type on inventory.units (rv_type) where search_ready;
create index units_snapshot on inventory.units (snapshot_version);
create index units_zdict on inventory.units (zdict_id);

alter table inventory.snapshots enable row level security;
alter table inventory.units enable row level security;
alter table inventory.zdicts enable row level security;
-- Intentionally no policies: only the table owner / service connection reads these.

comment on schema inventory is 'MatchRV inventory search store. Server-side access only (RLS on, no policies).';

-- Create import_runs table to log each POST /api/import/listings call.
-- Tracks timestamps, counts, source IP, duration, and errors for admin visibility.
CREATE TABLE IF NOT EXISTS "import_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_ip" text,
  "dealers_inserted" integer DEFAULT 0 NOT NULL,
  "dealers_updated" integer DEFAULT 0 NOT NULL,
  "listings_inserted" integer DEFAULT 0 NOT NULL,
  "listings_updated" integer DEFAULT 0 NOT NULL,
  "listings_skipped" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer,
  "error" text
);

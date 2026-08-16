-- Add domain column to dealers table for scraper push import upserts.
-- Uses IF NOT EXISTS guards so this is safe to apply on any existing database.
ALTER TABLE "dealers" ADD COLUMN IF NOT EXISTS "domain" text;
ALTER TABLE "dealers" DROP CONSTRAINT IF EXISTS "dealers_domain_unique";
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_domain_unique" UNIQUE("domain");

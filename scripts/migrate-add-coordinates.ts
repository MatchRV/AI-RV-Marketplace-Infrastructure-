import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql.raw(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`));
  await db.execute(sql.raw(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_listings_coordinates ON listings (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL`));
  console.log("Migration OK — latitude + longitude columns added");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

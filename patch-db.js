const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const listings_cols = [
    "trim text",
    "msrp real",
    "dealer_domain text",
    "stock_number text",
    "specs jsonb DEFAULT '{}'",
    "payload_capacity real",
    "fuel_capacity real",
    "propane_capacity real",
    "fuel_type text",
    "engine text",
    "transmission text",
    "drivetrain text",
    "exterior_color text",
    "interior_color text",
    "bunkhouse boolean DEFAULT false",
    "toy_hauler boolean DEFAULT false",
    "leveling_jacks boolean DEFAULT false",
    "source_detail_url text",
    "source_inventory_url text",
    "scraped_at timestamp",
    "first_seen_at timestamp",
    "last_seen_at timestamp",
  ];

  for (const c of listings_cols) {
    await p.query("ALTER TABLE listings ADD COLUMN IF NOT EXISTS " + c);
    console.log("OK: " + c);
  }

  await p.query("ALTER TABLE dealers ADD COLUMN IF NOT EXISTS domain text UNIQUE");
  console.log("OK: dealers.domain");

  await p.query("ALTER TABLE dealers ADD COLUMN IF NOT EXISTS website text");
  console.log("OK: dealers.website");

  console.log("\nALL COLUMNS ADDED");
  await p.end();
}

run().catch(async (e) => {
  console.error(e);
  await p.end();
  process.exit(1);
});

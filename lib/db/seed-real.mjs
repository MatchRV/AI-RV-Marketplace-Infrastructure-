import { readFileSync } from 'fs';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const listings = JSON.parse(readFileSync('/home/runner/workspace/lib/db/seed-real-listings.json', 'utf8'));

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing listings
    await client.query('DELETE FROM saved_listings');
    await client.query('DELETE FROM listings');
    console.log('Cleared existing listings');

    // Insert in batches of 50
    let inserted = 0;
    for (let i = 0; i < listings.length; i += 50) {
      const batch = listings.slice(i, i + 50);
      for (const l of batch) {
        await client.query(`
          INSERT INTO listings (
            title, make, model, year, type, price, market_value, deal_score, deal_savings,
            mileage, length, slides, sleeps, location, state, dealer_name, dealer_id,
            images, days_on_market, condition, is_new, is_featured,
            width_ft, height_ft, dry_weight, gvwr, hitch_weight,
            fresh_water, grey_water, black_water,
            generator, solar, awning, outdoor_kitchen, washer_dryer,
            features, description, created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,
            $10,$11,$12,$13,$14,$15,$16,$17,
            $18,$19,$20,$21,$22,
            $23,$24,$25,$26,$27,
            $28,$29,$30,
            $31,$32,$33,$34,$35,
            $36,$37,NOW(),NOW()
          )
        `, [
          l.title, l.make, l.model, l.year, l.type, l.price, l.marketValue, l.dealScore, l.dealSavings,
          l.mileage, l.length, l.slides, l.sleeps, l.location, l.state, l.dealerName, l.dealerId,
          JSON.stringify(l.images), l.daysOnMarket, l.condition, l.isNew, l.isFeatured,
          l.widthFt, l.heightFt, l.dryWeight, l.gvwr, l.hitchWeight,
          l.freshWater, l.greyWater, l.blackWater,
          l.generator, l.solar, l.awning, l.outdoorKitchen, l.washerDryer,
          JSON.stringify(l.features), l.description,
        ]);
        inserted++;
      }
      console.log(`Inserted ${inserted}/${listings.length}`);
    }

    await client.query('COMMIT');
    console.log(`\nDone! ${inserted} real RV listings inserted.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

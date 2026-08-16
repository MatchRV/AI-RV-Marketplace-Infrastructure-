import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const WA_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "seattle": { lat: 47.6062, lng: -122.3321 },
  "tacoma": { lat: 47.2529, lng: -122.4443 },
  "kent": { lat: 47.3809, lng: -122.2348 },
  "auburn": { lat: 47.3073, lng: -122.2285 },
  "everett": { lat: 47.9790, lng: -122.2021 },
  "spokane": { lat: 47.6588, lng: -117.4260 },
  "vancouver": { lat: 45.6387, lng: -122.6615 },
  "olympia": { lat: 47.0379, lng: -122.9007 },
  "bellingham": { lat: 48.7519, lng: -122.4787 },
  "yakima": { lat: 46.6021, lng: -120.5059 },
  "mount vernon": { lat: 48.4213, lng: -122.3341 },
  "marysville": { lat: 48.0518, lng: -122.1771 },
  "puyallup": { lat: 47.1854, lng: -122.2929 },
  "poulsbo": { lat: 47.7354, lng: -122.6468 },
  "bremerton": { lat: 47.5673, lng: -122.6326 },
  "silverdale": { lat: 47.6479, lng: -122.6943 },
  "port orchard": { lat: 47.5401, lng: -122.6329 },
  "gig harbor": { lat: 47.3318, lng: -122.5793 },
  "federal way": { lat: 47.3223, lng: -122.3126 },
  "renton": { lat: 47.4829, lng: -122.2171 },
  "bellevue": { lat: 47.6101, lng: -122.2015 },
  "kirkland": { lat: 47.6815, lng: -122.2087 },
  "redmond": { lat: 47.6740, lng: -122.1215 },
  "issaquah": { lat: 47.5301, lng: -122.0326 },
  "lynnwood": { lat: 47.8209, lng: -122.3151 },
  "edmonds": { lat: 47.8107, lng: -122.3779 },
  "shoreline": { lat: 47.7543, lng: -122.3429 },
  "burien": { lat: 47.4704, lng: -122.3468 },
  "des moines": { lat: 47.4018, lng: -122.3243 },
  "tukwila": { lat: 47.4742, lng: -122.2612 },
  "seatac": { lat: 47.4440, lng: -122.2987 },
  "sea-tac": { lat: 47.4440, lng: -122.2987 },
  "walla walla": { lat: 46.0646, lng: -118.3430 },
  "kennewick": { lat: 46.2113, lng: -119.1372 },
  "pasco": { lat: 46.2396, lng: -119.1006 },
  "richland": { lat: 46.2804, lng: -119.2752 },
  "tri-cities": { lat: 46.2113, lng: -119.1372 },
  "wenatchee": { lat: 47.4235, lng: -120.3103 },
  "moses lake": { lat: 47.1301, lng: -119.2779 },
  "ellensburg": { lat: 46.9965, lng: -120.5487 },
  "aberdeen": { lat: 46.9754, lng: -123.8154 },
  "hoquiam": { lat: 46.9801, lng: -123.8887 },
  "centralia": { lat: 46.7162, lng: -122.9543 },
  "chehalis": { lat: 46.6626, lng: -122.9654 },
  "longview": { lat: 46.1382, lng: -122.9382 },
  "kelso": { lat: 46.1465, lng: -122.9065 },
  "port angeles": { lat: 48.1181, lng: -123.4307 },
  "sequim": { lat: 48.0793, lng: -123.1007 },
  "oak harbor": { lat: 48.2929, lng: -122.6429 },
  "anacortes": { lat: 48.5126, lng: -122.6126 },
  "burlington": { lat: 48.4754, lng: -122.3279 },
  "sedro-woolley": { lat: 48.5040, lng: -122.2332 },
  "monroe": { lat: 47.8554, lng: -121.9715 },
  "snohomish": { lat: 47.9126, lng: -122.0987 },
  "arlington": { lat: 48.1654, lng: -122.1251 },
  "stanwood": { lat: 48.2415, lng: -122.3743 },
  "lakewood": { lat: 47.1718, lng: -122.5185 },
  "university place": { lat: 47.2140, lng: -122.5487 },
  "bonney lake": { lat: 47.1779, lng: -122.1762 },
  "covington": { lat: 47.3601, lng: -122.1029 },
  "maple valley": { lat: 47.3690, lng: -122.0479 },
  "black diamond": { lat: 47.3087, lng: -122.0029 },
  "enumclaw": { lat: 47.2021, lng: -121.9921 },
  "yelm": { lat: 46.9429, lng: -122.6093 },
  "lacey": { lat: 47.0340, lng: -122.8232 },
  "tumwater": { lat: 47.0076, lng: -122.9085 },
  "shelton": { lat: 47.2151, lng: -123.1007 },
  "belfair": { lat: 47.4418, lng: -122.8343 },
  "union": { lat: 47.3368, lng: -123.0907 },
  "hoodsport": { lat: 47.4040, lng: -123.1382 },
};

async function geocodeViaNominatim(location: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(location);
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=us`,
      { headers: { "User-Agent": "MatchRV/1.0 (contact@matchrv.com)" } }
    );
    if (!resp.ok) return null;
    const results = await resp.json() as Array<{ lat: string; lon: string }>;
    if (!results.length) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  const city = location.split(",")[0].trim().toLowerCase();
  if (WA_CITY_COORDS[city]) return WA_CITY_COORDS[city];
  return geocodeViaNominatim(location);
}

async function main() {
  const rows = await db.execute(
    sql.raw(`SELECT id, location FROM listings WHERE latitude IS NULL AND location IS NOT NULL ORDER BY id`)
  ) as { rows: Array<{ id: number; location: string }> };

  const listings = rows.rows ?? [];
  console.log(`Geocoding ${listings.length} listings...`);

  let updated = 0;
  let failed = 0;
  let fromCache = 0;

  for (const row of listings) {
    const city = row.location.split(",")[0].trim().toLowerCase();
    const fromLookup = !!WA_CITY_COORDS[city];
    const coords = await geocodeLocation(row.location);

    if (coords) {
      await db.execute(
        sql.raw(`UPDATE listings SET latitude = ${coords.lat}, longitude = ${coords.lng} WHERE id = ${row.id}`)
      );
      updated++;
      if (fromLookup) fromCache++;
      if (!fromLookup) await sleep(1100);
    } else {
      failed++;
      console.warn(`  Failed to geocode: "${row.location}" (id=${row.id})`);
    }

    if (updated % 50 === 0 && updated > 0) {
      console.log(`  Progress: ${updated} updated, ${failed} failed`);
    }
  }

  console.log(`\nDone — ${updated} geocoded (${fromCache} from cache, ${updated - fromCache} via API), ${failed} failed`);
  process.exit(0);
}

main().catch(err => {
  console.error("Geocoding failed:", err);
  process.exit(1);
});

import { db, listingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const PHOTO_POOL: Record<string, string[]> = {
  travel_trailer: Array.from({ length: 15 }, (_, i) => `/rv-images/travel_trailer_${i + 1}.png`),
  fifth_wheel: Array.from({ length: 15 }, (_, i) => `/rv-images/fifth_wheel_${i + 1}.png`),
  class_a: Array.from({ length: 15 }, (_, i) => `/rv-images/class_a_${i + 1}.png`),
  class_b: Array.from({ length: 15 }, (_, i) => `/rv-images/class_b_${i + 1}.png`),
  class_c: Array.from({ length: 15 }, (_, i) => `/rv-images/class_c_${i + 1}.png`),
  toy_hauler: Array.from({ length: 15 }, (_, i) => `/rv-images/toy_hauler_${i + 1}.png`),
  popup_camper: Array.from({ length: 15 }, (_, i) => `/rv-images/popup_camper_${i + 1}.png`),
};

function pickPhotos(listingId: number, type: string): string[] {
  const pool = PHOTO_POOL[type] || PHOTO_POOL.travel_trailer;
  const count = 3;
  const photos: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (listingId * 7 + i * 3) % pool.length;
    const photo = pool[idx];
    if (!photos.includes(photo)) {
      photos.push(photo);
    } else {
      photos.push(pool[(idx + 1) % pool.length]);
    }
  }
  return photos;
}

async function main() {
  console.log("Fetching all listings...");
  const listings = await db.select({ id: listingsTable.id, type: listingsTable.type }).from(listingsTable);
  console.log(`Found ${listings.length} listings. Updating images...`);

  let updated = 0;
  for (const listing of listings) {
    const photos = pickPhotos(listing.id, listing.type);
    await db.update(listingsTable)
      .set({ images: photos })
      .where(eq(listingsTable.id, listing.id));
    updated++;
    if (updated % 50 === 0) console.log(`  Updated ${updated}/${listings.length}`);
  }

  console.log(`Done! Updated ${updated} listings with type-specific RV photos.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

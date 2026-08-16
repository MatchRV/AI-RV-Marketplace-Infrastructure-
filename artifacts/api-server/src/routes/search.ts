import { Router, type IRouter } from "express";
import { db, listingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/search/filters", async (_req, res) => {
  try {
    const [types, makes, states, priceRange, yearRange] = await Promise.all([
      db.selectDistinct({ type: listingsTable.type }).from(listingsTable).orderBy(listingsTable.type),
      db.selectDistinct({ make: listingsTable.make }).from(listingsTable).orderBy(listingsTable.make),
      db.selectDistinct({ state: listingsTable.state }).from(listingsTable).orderBy(listingsTable.state),
      db.select({
        min: sql<number>`min(${listingsTable.price})`,
        max: sql<number>`max(${listingsTable.price})`,
      }).from(listingsTable),
      db.select({
        min: sql<number>`min(${listingsTable.year})`,
        max: sql<number>`max(${listingsTable.year})`,
      }).from(listingsTable),
    ]);

    res.json({
      types: types.map((r) => r.type),
      makes: makes.map((r) => r.make),
      states: states.map((r) => r.state),
      priceRange: {
        min: Number(priceRange[0]?.min ?? 5000),
        max: Number(priceRange[0]?.max ?? 500000),
      },
      yearRange: {
        min: Number(yearRange[0]?.min ?? 2010),
        max: Number(yearRange[0]?.max ?? 2026),
      },
    });
  } catch (err) {
    console.error("Search filters error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Tow match endpoint
router.post("/tow-match", async (req, res) => {
  try {
    const { vehicleMake, vehicleModel, vehicleYear, listingId } = req.body;

    // Simplified towing capacity lookup by common vehicles
    const towingData: Record<string, number> = {
      "f-150": 13000,
      "f-250": 20000,
      "f-350": 21000,
      "ram 1500": 12750,
      "ram 2500": 19680,
      "ram 3500": 37100,
      "silverado 1500": 13300,
      "silverado 2500": 18500,
      "silverado 3500": 23100,
      "tacoma": 6800,
      "tundra": 12000,
      "4runner": 5000,
      "chevy traverse": 5000,
      "ford explorer": 5600,
      "jeep grand cherokee": 7200,
      "chevy suburban": 8300,
      "ford expedition": 9300,
    };

    const vehicleKey = `${vehicleModel}`.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    let towingCapacity = 8000; // default

    for (const [key, cap] of Object.entries(towingData)) {
      if (vehicleKey.includes(key)) {
        towingCapacity = cap;
        break;
      }
    }

    // Adjust for year (older vehicles generally lower capacity)
    if (vehicleYear && vehicleYear < 2015) towingCapacity = Math.round(towingCapacity * 0.9);
    if (vehicleYear && vehicleYear < 2010) towingCapacity = Math.round(towingCapacity * 0.85);

    let rvWeight = 7000;
    let hitchWeight = 700;

    if (listingId) {
      const rows = await db.select({
        gvwr: listingsTable.gvwr,
        hitchWeight: listingsTable.hitchWeight,
        dryWeight: listingsTable.dryWeight,
      }).from(listingsTable).where(sql`${listingsTable.id} = ${listingId}`).limit(1);

      if (rows.length > 0) {
        rvWeight = Number(rows[0].gvwr ?? rows[0].dryWeight ?? 7000);
        hitchWeight = Number(rows[0].hitchWeight ?? rvWeight * 0.1);
      }
    }

    const canTow = towingCapacity >= rvWeight;
    const safetyMargin = towingCapacity - rvWeight;
    const safetyPct = Math.round((safetyMargin / towingCapacity) * 100);

    let notes = "";
    if (!canTow) {
      notes = `Your ${vehicleMake} ${vehicleModel} has a towing capacity of ${towingCapacity.toLocaleString()} lbs, but this RV weighs ${rvWeight.toLocaleString()} lbs. You would need a vehicle with a higher tow rating.`;
    } else if (safetyPct < 15) {
      notes = `Your vehicle can technically tow this RV, but the safety margin is tight (${safetyPct}%). We recommend a vehicle with more towing capacity for a safer experience.`;
    } else {
      notes = `Great news! Your ${vehicleMake} ${vehicleModel} can safely tow this RV with a ${safetyPct}% safety margin. Make sure you have the proper hitch and brake controller installed.`;
    }

    res.json({ canTow, towingCapacity, rvWeight, hitchWeight, safetyMargin, notes });
  } catch (err) {
    console.error("Tow match error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

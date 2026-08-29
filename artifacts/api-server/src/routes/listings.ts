import { Router, type IRouter } from "express";
import { db, listingsTable, dealersTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, or, sql, inArray } from "drizzle-orm";

const ADMIN_KEY = process.env.ADMIN_KEY;

const VALID_TYPES = new Set([
  "class_a", "class_b", "class_c",
  "travel_trailer", "fifth_wheel", "toy_hauler",
  "popup_camper", "truck_camper",
]);

const VALID_DEAL_SCORES = new Set([
  "great_deal", "good_deal", "fair_deal", "fair_price", "high_price", "overpriced",
]);

function normalizeDealScore(s: string): string {
  return s === "fair_price" ? "fair_deal" : s;
}

const router: IRouter = Router();

function computeDealScore(price: number, marketValue: number): { dealScore: string; dealSavings: number } {
  const diff = marketValue - price;
  const pct = (diff / marketValue) * 100;
  let dealScore: string;
  if (pct >= 10) dealScore = "great_deal";
  else if (pct >= 5) dealScore = "good_deal";
  else if (pct >= -5) dealScore = "fair_deal";
  else if (pct >= -15) dealScore = "high_price";
  else dealScore = "overpriced";
  return { dealScore, dealSavings: Math.round(diff) };
}

function formatListing(row: Record<string, unknown>) {
  const price = Number(row.price);
  const marketValue = Number(row.market_value ?? row.marketValue ?? price);
  const { dealScore, dealSavings } = computeDealScore(price, marketValue);
  const length = Number(row.length) || undefined;
  return {
    id: row.id,
    title: row.title,
    make: row.make,
    model: row.model,
    year: row.year,
    type: row.type,
    price,
    marketValue,
    dealScore: (row.deal_score ?? row.dealScore ?? dealScore) as string,
    dealSavings: Number(row.deal_savings ?? row.dealSavings ?? dealSavings),
    mileage: row.mileage ? Number(row.mileage) : undefined,
    length: length,
    widthFt: row.widthFt ? Number(row.widthFt) : undefined,
    heightFt: row.heightFt ? Number(row.heightFt) : undefined,
    slides: Number(row.slides ?? 0),
    sleeps: Number(row.sleeps ?? 2),
    location: row.location,
    state: row.state,
    dealerName: row.dealer_name ?? row.dealerName,
    dealerId: row.dealer_id ?? row.dealerId,
    images: (row.images as string[]) ?? [],
    daysOnMarket: Number(row.days_on_market ?? row.daysOnMarket ?? 0),
    condition: row.condition ?? "used",
    isNew: Boolean(row.is_new ?? row.isNew),
    isFeatured: Boolean(row.is_featured ?? row.isFeatured),
    vin: row.vin,
    pricePerFoot: length ? Math.round(price / length) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cond = ReturnType<typeof eq>;

router.get("/listings", async (req, res) => {
  try {
    const q = req.query as Record<string, string>;

    const {
      type, minPrice, maxPrice, state, make, minYear, maxYear, search,
      dealScore, dealer, condition,
      // Size & Capacity
      minSleeps, minLength, maxLength, minSlides, bedSize,
      // Towing
      maxTowWeight, hitchType, maxMileage,
      // Lifestyle
      campingStyle, petFriendly, fourSeason,
      // Features
      outdoorKitchen, solarFilter, washerDryer, generator, hasFireplace,
      hydraulicJacks, powerAwning, outdoorShower, backupCamera,
      theaterSeating, enclosedUnderbelly,
      // Floorplan
      rearBedroom, rearLiving, frontKitchen, islandKitchen, walkAroundBed,
      // Deals
      priceDrops, newArrivals, longOnLot,
    } = q;

    const limit = Math.min(Number(q.limit) || 24, 100);
    const offset = Number(q.offset) || 0;
    const sort = q.sort || "featured";

    const conditions: Cond[] = [];

    // ── Hide listings without photos (never surface a no-photo unit) ───
    conditions.push(
      sql`${listingsTable.images} IS NOT NULL AND jsonb_array_length(${listingsTable.images}) > 0` as unknown as Cond,
    );

    // ── Type (multi-value, comma-separated) ────────────────────────────
    if (type) {
      const types = type.split(",").map(t => t.trim()).filter(t => VALID_TYPES.has(t));
      if (types.length === 1) conditions.push(eq(listingsTable.type, types[0]));
      else if (types.length > 1) conditions.push(inArray(listingsTable.type, types) as unknown as Cond);
    }

    // ── Make (multi-value, comma-separated) ────────────────────────────
    if (make) {
      const makes = make.split(",").map(m => m.trim()).filter(Boolean);
      if (makes.length === 1) conditions.push(eq(listingsTable.make, makes[0]));
      else if (makes.length > 1) conditions.push(inArray(listingsTable.make, makes) as unknown as Cond);
    }

    // ── Basic filters ──────────────────────────────────────────────────
    if (state) conditions.push(eq(listingsTable.state, state));
    if (dealScore) conditions.push(eq(listingsTable.dealScore, dealScore));
    if (minPrice) conditions.push(gte(listingsTable.price, Number(minPrice)));
    if (maxPrice) conditions.push(lte(listingsTable.price, Number(maxPrice)));
    if (minYear) conditions.push(gte(listingsTable.year, Number(minYear)));
    if (maxYear) conditions.push(lte(listingsTable.year, Number(maxYear)));
    if (dealer) conditions.push(ilike(listingsTable.dealerName, `%${dealer}%`));
    if (condition && condition !== "all") conditions.push(eq(listingsTable.condition, condition));
    if (search) {
      conditions.push(
        or(
          ilike(listingsTable.title, `%${search}%`),
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(listingsTable.description, `%${search}%`),
        ) as Cond
      );
    }

    // ── Size & Capacity ────────────────────────────────────────────────
    if (minSleeps) conditions.push(gte(listingsTable.sleeps, Number(minSleeps)));
    if (minLength) conditions.push(gte(listingsTable.length, Number(minLength)));
    if (maxLength) conditions.push(lte(listingsTable.length, Number(maxLength)));
    if (minSlides) conditions.push(gte(listingsTable.slides, Number(minSlides)));
    if (bedSize) conditions.push(eq(listingsTable.bedSize, bedSize));

    // ── Towing & Mechanical ────────────────────────────────────────────
    if (maxTowWeight) conditions.push(lte(listingsTable.gvwr, Number(maxTowWeight)));
    if (hitchType) conditions.push(eq(listingsTable.hitchType, hitchType));
    if (maxMileage) conditions.push(lte(listingsTable.mileage, Number(maxMileage)));

    // ── Lifestyle ──────────────────────────────────────────────────────
    if (campingStyle === "boondocking") {
      conditions.push(gte(listingsTable.boondockingScore, 60));
    } else if (campingStyle === "full_hookup") {
      conditions.push(gte(listingsTable.slides, 1));
    }
    if (petFriendly === "true") conditions.push(eq(listingsTable.petFriendly, true));
    if (fourSeason === "true") conditions.push(eq(listingsTable.fourSeason, true));

    // ── Features (boolean) ─────────────────────────────────────────────
    if (outdoorKitchen === "true") conditions.push(eq(listingsTable.outdoorKitchen, true));
    if (washerDryer === "true") conditions.push(eq(listingsTable.washerDryer, true));
    if (generator === "true") conditions.push(eq(listingsTable.generator, true));
    if (hasFireplace === "true") conditions.push(eq(listingsTable.hasFireplace, true));
    if (hydraulicJacks === "true") conditions.push(eq(listingsTable.hydraulicJacks, true));
    if (powerAwning === "true") conditions.push(eq(listingsTable.powerAwning, true));
    if (outdoorShower === "true") conditions.push(eq(listingsTable.outdoorShower, true));
    if (backupCamera === "true") conditions.push(eq(listingsTable.backupCamera, true));
    if (theaterSeating === "true") conditions.push(eq(listingsTable.theaterSeating, true));
    if (enclosedUnderbelly === "true") conditions.push(eq(listingsTable.enclosedUnderbelly, true));
    if (solarFilter === "ready") conditions.push(eq(listingsTable.solarReady, true));
    else if (solarFilter === "installed") conditions.push(eq(listingsTable.solarInstalled, true));
    else if (solarFilter === "any") conditions.push(
      or(
        eq(listingsTable.solarReady, true),
        eq(listingsTable.solarInstalled, true),
      ) as Cond
    );

    // ── Floorplan ──────────────────────────────────────────────────────
    if (rearBedroom === "true") conditions.push(eq(listingsTable.rearBedroom, true));
    if (rearLiving === "true") conditions.push(eq(listingsTable.rearLiving, true));
    if (frontKitchen === "true") conditions.push(eq(listingsTable.frontKitchen, true));
    if (islandKitchen === "true") conditions.push(eq(listingsTable.islandKitchen, true));
    if (walkAroundBed === "true") conditions.push(eq(listingsTable.walkAroundBed, true));

    // ── Deals ──────────────────────────────────────────────────────────
    if (priceDrops === "true") {
      conditions.push(
        sql`jsonb_array_length(${listingsTable.priceHistory}) > 0
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(${listingsTable.priceHistory}) elem
            WHERE (elem->>'price')::numeric > ${listingsTable.price}
          )` as unknown as Cond
      );
    }
    if (newArrivals === "true") {
      conditions.push(gte(listingsTable.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    }
    if (longOnLot === "true") {
      conditions.push(gte(listingsTable.daysOnMarket, 60));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderBy: ReturnType<typeof sql>;
    switch (sort) {
      case "price_asc":     orderBy = sql`${listingsTable.price} ASC`; break;
      case "price_desc":    orderBy = sql`${listingsTable.price} DESC`; break;
      case "newest":        orderBy = sql`${listingsTable.year} DESC`; break;
      case "best_deal":     orderBy = sql`${listingsTable.dealScore} ASC`; break;
      case "length_asc":    orderBy = sql`${listingsTable.length} ASC NULLS LAST`; break;
      case "length_desc":   orderBy = sql`${listingsTable.length} DESC NULLS LAST`; break;
      case "just_listed":   orderBy = sql`${listingsTable.createdAt} DESC`; break;
      case "biggest_drop":  orderBy = sql`${listingsTable.dealSavings} DESC`; break;
      default:              orderBy = sql`${listingsTable.isFeatured} DESC, ${listingsTable.createdAt} DESC`;
    }

    const [rows, countResult] = await Promise.all([
      db.select().from(listingsTable).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(listingsTable).where(whereClause),
    ]);

    res.json({
      listings: rows.map(formatListing),
      total: Number(countResult[0]?.count ?? 0),
      offset,
      limit,
    });
  } catch (err) {
    console.error("Error fetching listings:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/listings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json({ message: "Invalid listing ID" });

    const rows = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
    if (!rows.length) return void res.status(404).json({ message: "Listing not found" });

    const row = rows[0];
    const dealerRows = await db.select().from(dealersTable).where(eq(dealersTable.id, row.dealerId)).limit(1);
    const dealer = dealerRows[0];

    const similar = await db.select().from(listingsTable)
      .where(and(
        eq(listingsTable.type, row.type),
        sql`${listingsTable.id} != ${id}`,
        sql`${listingsTable.images} IS NOT NULL AND jsonb_array_length(${listingsTable.images}) > 0`,
      ))
      .limit(4);

    const base = formatListing(row);
    const detail = {
      ...base,
      description: row.description,
      features: (row.features as string[]) ?? [],
      dryWeight: row.dryWeight,
      gvwr: row.gvwr,
      hitchWeight: row.hitchWeight,
      freshWater: row.freshWater,
      greyWater: row.greyWater,
      blackWater: row.blackWater,
      generator: row.generator,
      solar: row.solar,
      awning: row.awning,
      outdoor_kitchen: row.outdoorKitchen,
      washerDryer: row.washerDryer,
      priceHistory: (row.priceHistory as { date: string; price: number }[]) ?? [],
      // Enrichment fields
      solarReady: row.solarReady,
      solarInstalled: row.solarInstalled,
      bedSize: row.bedSize,
      hasFireplace: row.hasFireplace,
      petFriendly: row.petFriendly,
      rearBedroom: row.rearBedroom,
      rearLiving: row.rearLiving,
      frontKitchen: row.frontKitchen,
      theaterSeating: row.theaterSeating,
      islandKitchen: row.islandKitchen,
      walkAroundBed: row.walkAroundBed,
      outdoorShower: row.outdoorShower,
      outdoorSpeakers: row.outdoorSpeakers,
      backupCamera: row.backupCamera,
      hydraulicJacks: row.hydraulicJacks,
      powerAwning: row.powerAwning,
      enclosedUnderbelly: row.enclosedUnderbelly,
      heatedTanks: row.heatedTanks,
      fourSeason: row.fourSeason,
      hitchType: row.hitchType,
      boondockingScore: row.boondockingScore,
      dealer: dealer ? {
        id: dealer.id,
        name: dealer.name,
        city: dealer.city,
        state: dealer.state,
        phone: dealer.phone,
        rating: dealer.rating,
        reviewCount: dealer.reviewCount,
        avgResponseTime: dealer.avgResponseTime,
        beginnerFriendly: dealer.beginnerFriendly,
        yearsInBusiness: dealer.yearsInBusiness,
        totalListings: dealer.totalListings,
      } : null,
      similarListings: similar.map(formatListing),
    };

    res.json(detail);
  } catch (err) {
    console.error("Error fetching listing:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/listings/remove", async (req, res) => {
  try {
    const key = req.headers["x-admin-key"];
    if (!ADMIN_KEY || key !== ADMIN_KEY) {
      return void res.status(401).json({ message: "Unauthorized" });
    }

    const { vin, dealerName, make, model, year } = req.body as Record<string, unknown>;

    let existingId: number | null = null;

    if (vin && typeof vin === "string" && vin.trim()) {
      const rows = await db
        .select({ id: listingsTable.id })
        .from(listingsTable)
        .where(eq(listingsTable.vin, vin.trim().toUpperCase()))
        .limit(1);
      if (rows.length) existingId = rows[0].id;
    }

    if (existingId === null && dealerName && make && model && year) {
      const rows = await db
        .select({ id: listingsTable.id })
        .from(listingsTable)
        .where(
          and(
            eq(listingsTable.dealerName, String(dealerName)),
            eq(listingsTable.make, String(make)),
            eq(listingsTable.model, String(model)),
            eq(listingsTable.year, Number(year)),
          )
        )
        .limit(1);
      if (rows.length) existingId = rows[0].id;
    }

    if (existingId === null) {
      return void res.status(200).json({ deleted: false });
    }

    await db.delete(listingsTable).where(eq(listingsTable.id, existingId));
    return void res.status(200).json({ deleted: true, id: existingId });

  } catch (err) {
    console.error("Error removing listing:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/listings", async (req, res) => {
  try {
    const key = req.headers["x-admin-key"];
    if (!ADMIN_KEY || key !== ADMIN_KEY) {
      return void res.status(401).json({ message: "Unauthorized" });
    }

    const b = req.body as Record<string, unknown>;

    const required = ["title", "make", "model", "year", "type", "price", "condition", "dealerName", "dealerId"];
    for (const field of required) {
      if (b[field] === undefined || b[field] === null || b[field] === "") {
        return void res.status(400).json({ message: `Missing required field: ${field}` });
      }
    }

    const type = String(b.type);
    if (!VALID_TYPES.has(type)) {
      return void res.status(400).json({ message: `Invalid type: ${type}` });
    }

    const rawDealScore = b.dealScore ? String(b.dealScore) : null;
    if (rawDealScore && !VALID_DEAL_SCORES.has(rawDealScore)) {
      return void res.status(400).json({ message: `Invalid dealScore: ${rawDealScore}` });
    }

    const price = Number(b.price);
    const year = Number(b.year);
    const dealerId = Number(b.dealerId);
    if (isNaN(price) || isNaN(year) || isNaN(dealerId)) {
      return void res.status(400).json({ message: "price, year, and dealerId must be numbers" });
    }

    const marketValue = b.marketValue ? Number(b.marketValue) : price;
    const { dealScore: computedScore, dealSavings: computedSavings } = computeDealScore(price, marketValue);
    const dealScore = rawDealScore ? normalizeDealScore(rawDealScore) : computedScore;
    const dealSavings = b.dealSavings != null ? Number(b.dealSavings) : computedSavings;

    const vin = b.vin ? String(b.vin).trim().toUpperCase() : null;
    const dealerName = String(b.dealerName);
    const make = String(b.make);
    const model = String(b.model);

    const values = {
      title: String(b.title),
      make,
      model,
      year,
      type,
      price,
      marketValue,
      dealScore,
      dealSavings,
      condition: String(b.condition ?? "used"),
      isNew: Boolean(b.isNew ?? b.condition === "new"),
      images: Array.isArray(b.images) ? b.images.filter((u) => typeof u === "string") : [],
      location: b.location ? String(b.location) : "",
      state: b.state ? String(b.state) : "",
      dealerName,
      dealerId,
      vin,
      sleeps: b.sleeps != null ? Number(b.sleeps) : 2,
      slides: b.slides != null ? Number(b.slides) : 0,
      length: b.length != null ? Number(b.length) : null,
      description: b.description ? String(b.description) : null,
      features: Array.isArray(b.features) ? b.features.filter((f) => typeof f === "string") : [],
      daysOnMarket: b.daysOnMarket != null ? Number(b.daysOnMarket) : 0,
      isFeatured: Boolean(b.isFeatured ?? false),
    };

    let existingId: number | null = null;

    if (vin) {
      const rows = await db
        .select({ id: listingsTable.id })
        .from(listingsTable)
        .where(eq(listingsTable.vin, vin))
        .limit(1);
      if (rows.length) existingId = rows[0].id;
    }

    if (existingId === null) {
      const rows = await db
        .select({ id: listingsTable.id })
        .from(listingsTable)
        .where(
          and(
            eq(listingsTable.dealerName, dealerName),
            eq(listingsTable.make, make),
            eq(listingsTable.model, model),
            eq(listingsTable.year, year),
            eq(listingsTable.price, price),
          )
        )
        .limit(1);
      if (rows.length) existingId = rows[0].id;
    }

    if (existingId !== null) {
      await db
        .update(listingsTable)
        .set(values)
        .where(eq(listingsTable.id, existingId));
      return void res.status(200).json({ id: existingId, created: false });
    }

    const [inserted] = await db.insert(listingsTable).values(values).returning({ id: listingsTable.id });
    return void res.status(201).json({ id: inserted.id, created: true });

  } catch (err) {
    console.error("Error creating/updating listing:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

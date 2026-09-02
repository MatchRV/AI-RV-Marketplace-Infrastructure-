import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, asc, ilike, or, gte, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  db,
  campgroundsTable,
  tripsTable,
  tripStopsTable,
} from "@workspace/db";

const NPS_API_KEY = process.env.NPS_API_KEY || "DEMO_KEY";
const RIDB_API_KEY = process.env.RIDB_API_KEY || "";

function parseLatLon(latLong: string): { lat: number; lon: number } | null {
  const m = latLong.match(/lat:([\d.\-]+).*long:([\d.\-]+)/i);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
}

function npsHookupType(campsites: Record<string, string>, amenities: Record<string, unknown>): string {
  const electric = parseInt(campsites?.electricalHookups || "0", 10);
  if (electric > 0) return "water_electric";
  return "dry";
}

function npsAmenities(amenities: Record<string, unknown>): string[] {
  const result: string[] = [];
  if (amenities?.dumpStation?.toString().toLowerCase().includes("yes")) result.push("dump station");
  const showers = amenities?.showers as string[];
  if (Array.isArray(showers) && showers.some((s) => s.toLowerCase().includes("hot"))) result.push("showers");
  const toilets = amenities?.toilets as string[];
  if (Array.isArray(toilets) && toilets.some((t) => t.toLowerCase().includes("flush"))) result.push("flush toilets");
  if (amenities?.campStore?.toString().toLowerCase().includes("yes")) result.push("camp store");
  return result;
}

function normalizeNpsCampground(c: Record<string, unknown>) {
  const ll = parseLatLon((c.latLong as string) || "");
  const addresses = (c.addresses as Record<string, string>[]) || [];
  const physAddr = addresses.find((a) => a.type === "Physical") || addresses[0] || {};
  const fees = (c.fees as Record<string, string>[]) || [];
  const minFee = fees.reduce((min: number | null, f) => {
    const cost = parseFloat(f.cost || "0");
    return cost > 0 && (min === null || cost < min) ? cost : min;
  }, null);
  const phoneNumbers = ((c.contacts as Record<string, unknown>)?.phoneNumbers as Record<string, string>[]) || [];
  const phone = phoneNumbers.find((p) => p.type === "Voice")?.phoneNumber || null;
  const campsites = (c.campsites as Record<string, string>) || {};
  const amenities = (c.amenities as Record<string, unknown>) || {};
  const totalSites = parseInt(campsites.totalSites || "0", 10) || null;

  return {
    npsId: c.id as string,
    name: (c.name as string) || "Unknown",
    description: (c.description as string) || null,
    state: physAddr.stateCode || "",
    city: physAddr.city || "",
    lat: ll?.lat ?? 0,
    lon: ll?.lon ?? 0,
    hookupType: npsHookupType(campsites, amenities),
    maxRvLength: null as number | null,
    totalSites,
    nightlyRateMin: minFee,
    nightlyRateMax: minFee,
    bookingUrl: (c.reservationUrl as string) || `https://www.nps.gov/${c.parkCode}/planyourvisit/camping.htm`,
    amenities: npsAmenities(amenities),
    campgroundType: "federal",
    phone,
    imageUrl: null as string | null,
    source: "nps",
  };
}

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId as string;
}

function generateShareToken(): string {
  return randomBytes(24).toString("hex");
}

// ─── Campgrounds (public read) ────────────────────────────────────────────────

router.get("/campgrounds", async (req: Request, res: Response) => {
  try {
    const { state, hookup_type, max_rv_length, q, limit = "60" } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [];

    if (state) conditions.push(eq(campgroundsTable.state, state.toUpperCase()));
    if (hookup_type) conditions.push(eq(campgroundsTable.hookupType, hookup_type));
    if (max_rv_length) {
      const len = parseInt(max_rv_length, 10);
      if (!isNaN(len)) {
        conditions.push(
          or(
            sql`${campgroundsTable.maxRvLength} IS NULL`,
            gte(campgroundsTable.maxRvLength, len)
          ) as ReturnType<typeof eq>
        );
      }
    }
    if (q) {
      conditions.push(
        or(
          ilike(campgroundsTable.name, `%${q}%`),
          ilike(campgroundsTable.city, `%${q}%`),
          ilike(campgroundsTable.description, `%${q}%`)
        ) as ReturnType<typeof eq>
      );
    }

    const rows = await db
      .select()
      .from(campgroundsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(campgroundsTable.state), asc(campgroundsTable.name))
      .limit(Math.min(parseInt(limit, 10) || 60, 200));

    res.json({ campgrounds: rows });
  } catch {
    res.status(500).json({ error: "Failed to load campgrounds" });
  }
});

router.get("/campgrounds/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid campground ID" }); return; }
  try {
    const [cg] = await db.select().from(campgroundsTable).where(eq(campgroundsTable.id, id));
    if (!cg) { res.status(404).json({ error: "Campground not found" }); return; }
    res.json({ campground: cg });
  } catch {
    res.status(500).json({ error: "Failed to load campground" });
  }
});

/**
 * GET /api/campgrounds/live — search NPS API (+ RIDB if key is set)
 * Returns normalized campground data NOT yet saved to our DB.
 */
router.get("/campgrounds/live/search", async (req: Request, res: Response) => {
  const { q = "", state = "", limit = "20" } = req.query as Record<string, string>;
  const results: ReturnType<typeof normalizeNpsCampground>[] = [];

  try {
    // NPS API
    const npsParams = new URLSearchParams({
      limit: String(Math.min(parseInt(limit, 10) || 20, 50)),
      api_key: NPS_API_KEY,
      ...(q ? { q } : {}),
      ...(state ? { stateCode: state.toUpperCase() } : {}),
    });
    const npsRes = await fetch(`https://developer.nps.gov/api/v1/campgrounds?${npsParams}`);
    if (npsRes.ok) {
      const npsData = (await npsRes.json()) as { data?: unknown[] };
      (npsData.data || []).forEach((c) => {
        results.push(normalizeNpsCampground(c as Record<string, unknown>));
      });
    }

    // RIDB API (only if key provided)
    if (RIDB_API_KEY) {
      const ridbParams = new URLSearchParams({
        limit: String(Math.min(parseInt(limit, 10) || 20, 50)),
        apikey: RIDB_API_KEY,
        activity: "CAMPING",
        ...(q ? { query: q } : {}),
        ...(state ? { state: state.toUpperCase() } : {}),
      });
      const ridbRes = await fetch(`https://ridb.recreation.gov/api/v1/facilities?${ridbParams}`);
      if (ridbRes.ok) {
        const ridbData = (await ridbRes.json()) as { RECDATA?: Record<string, unknown>[] };
        (ridbData.RECDATA || []).forEach((f) => {
          results.push({
            npsId: String(f.FacilityID),
            name: String(f.FacilityName || ""),
            description: String(f.FacilityDescription || "").replace(/<[^>]+>/g, "").trim() || null,
            state: String(f.AddressStateCode || state || ""),
            city: String(f.FacilityAdaAccess || ""),
            lat: parseFloat(String(f.FacilityLatitude || "0")),
            lon: parseFloat(String(f.FacilityLongitude || "0")),
            hookupType: "dry",
            maxRvLength: null,
            totalSites: null,
            nightlyRateMin: null,
            nightlyRateMax: null,
            bookingUrl: `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}`,
            amenities: [],
            campgroundType: "federal",
            phone: null,
            imageUrl: null,
            source: "ridb",
          });
        });
      }
    }

    res.json({ campgrounds: results, source: RIDB_API_KEY ? "nps+ridb" : "nps" });
  } catch (err) {
    console.error("Live campground search error:", err);
    res.status(500).json({ error: "Failed to search live campgrounds" });
  }
});

/**
 * POST /api/campgrounds/import — upsert a live campground into our DB and return its id.
 * Used when a user wants to add an NPS/RIDB campground to a trip.
 */
router.post("/campgrounds/import", requireAuthMiddleware, async (req: Request, res: Response) => {
  const { name, description, state, city, lat, lon, hookupType, maxRvLength,
    totalSites, nightlyRateMin, nightlyRateMax, bookingUrl, amenities,
    campgroundType, phone } = req.body;

  if (!name || !state) { res.status(400).json({ error: "name and state are required" }); return; }

  try {
    // Check if we already have this campground (by name + state + city)
    const [existing] = await db
      .select({ id: campgroundsTable.id })
      .from(campgroundsTable)
      .where(and(
        eq(campgroundsTable.name, name),
        eq(campgroundsTable.state, state),
        eq(campgroundsTable.city, city || "")
      ));

    if (existing) {
      res.json({ campground: { id: existing.id } });
      return;
    }

    const [inserted] = await db
      .insert(campgroundsTable)
      .values({
        name, description: description || null, state, city: city || "",
        lat: lat || 0, lon: lon || 0,
        hookupType: hookupType || "dry",
        maxRvLength: maxRvLength || null,
        totalSites: totalSites || null,
        nightlyRateMin: nightlyRateMin || null,
        nightlyRateMax: nightlyRateMax || null,
        bookingUrl: bookingUrl || null,
        amenities: Array.isArray(amenities) ? amenities : [],
        campgroundType: campgroundType || "federal",
        phone: phone || null,
        imageUrl: null,
      })
      .returning();

    res.json({ campground: inserted });
  } catch {
    res.status(500).json({ error: "Failed to import campground" });
  }
});

function requireAuthMiddleware(req: Request, res: Response, next: () => void) {
  if (clerkUserId(req) === null) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// ─── Trips CRUD (auth required) ──────────────────────────────────────────────

router.get("/trips", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const trips = await db
      .select()
      .from(tripsTable)
      .where(eq(tripsTable.userId, userId))
      .orderBy(asc(tripsTable.startDate), asc(tripsTable.createdAt));

    const tripIds = trips.map((t) => t.id);
    const stopCountRows =
      tripIds.length > 0
        ? await db
            .select({ tripId: tripStopsTable.tripId, count: sql<number>`count(*)::int` })
            .from(tripStopsTable)
            .where(sql`${tripStopsTable.tripId} = ANY(ARRAY[${sql.raw(tripIds.join(","))}]::int[])`)
            .groupBy(tripStopsTable.tripId)
        : [];

    const stopCountMap: Record<number, number> = {};
    stopCountRows.forEach((s) => { stopCountMap[s.tripId] = s.count; });

    res.json({ trips: trips.map((t) => ({ ...t, stopCount: stopCountMap[t.id] || 0 })) });
  } catch {
    res.status(500).json({ error: "Failed to load trips" });
  }
});

router.post("/trips", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { name, startDate, endDate, notes } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Trip name is required" }); return;
  }
  try {
    const [trip] = await db
      .insert(tripsTable)
      .values({ userId, name: name.trim(), startDate: startDate || null, endDate: endDate || null, notes: notes || null })
      .returning();
    res.json({ trip });
  } catch {
    res.status(500).json({ error: "Failed to create trip" });
  }
});

/**
 * GET /api/trips/:id
 * - Owner (authenticated, userId matches): full details + isOwner=true
 * - Shared viewer (has valid ?token=<shareToken>): full details + isOwner=false
 * - All other requests: 401/403
 */
router.get("/trips/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid trip ID" }); return; }
  try {
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, id));
    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

    const isOwner = clerkUserId(req) === trip.userId;
    const tokenParam = req.query.token as string | undefined;
    const hasValidToken = trip.shareToken && tokenParam === trip.shareToken;

    if (!isOwner && !hasValidToken) {
      res.status(isAuthenticated(req) ? 403 : 401).json({ error: "Access denied. Use the share link to view this trip." });
      return;
    }

    const stops = await db
      .select({
        id: tripStopsTable.id,
        tripId: tripStopsTable.tripId,
        stopOrder: tripStopsTable.stopOrder,
        arrivalDate: tripStopsTable.arrivalDate,
        departureDate: tripStopsTable.departureDate,
        nights: tripStopsTable.nights,
        notes: tripStopsTable.notes,
        campground: campgroundsTable,
      })
      .from(tripStopsTable)
      .innerJoin(campgroundsTable, eq(tripStopsTable.campgroundId, campgroundsTable.id))
      .where(eq(tripStopsTable.tripId, id))
      .orderBy(asc(tripStopsTable.stopOrder));

    const { shareToken: _omit, ...tripPublic } = trip;
    res.json({ trip: tripPublic, stops, isOwner });
  } catch {
    res.status(500).json({ error: "Failed to load trip" });
  }
});

/** Clerk-authenticated user id, or null (same claim order as requireAuth). */
function clerkUserId(req: Request): string | null {
  const auth = getAuth(req);
  return (auth?.sessionClaims?.userId as string | undefined) || auth?.userId || null;
}

function isAuthenticated(req: Request): boolean {
  return clerkUserId(req) !== null;
}

router.put("/trips/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid trip ID" }); return; }
  const { name, startDate, endDate, notes, status } = req.body;
  try {
    const [existing] = await db.select().from(tripsTable).where(and(eq(tripsTable.id, id), eq(tripsTable.userId, userId)));
    if (!existing) { res.status(404).json({ error: "Trip not found" }); return; }
    const updates: Partial<typeof existing> = { updatedAt: new Date() };
    if (name && typeof name === "string") updates.name = name.trim();
    if (startDate !== undefined) updates.startDate = startDate || null;
    if (endDate !== undefined) updates.endDate = endDate || null;
    if (notes !== undefined) updates.notes = notes || null;
    if (status && ["planning", "active", "completed"].includes(status)) updates.status = status;
    const [updated] = await db.update(tripsTable).set(updates).where(eq(tripsTable.id, id)).returning();
    res.json({ trip: updated });
  } catch {
    res.status(500).json({ error: "Failed to update trip" });
  }
});

router.delete("/trips/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid trip ID" }); return; }
  try {
    await db.delete(tripsTable).where(and(eq(tripsTable.id, id), eq(tripsTable.userId, userId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete trip" });
  }
});

/** POST /api/trips/:id/share — generate or return existing share token (owner only) */
router.post("/trips/:id/share", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid trip ID" }); return; }
  try {
    const [trip] = await db.select().from(tripsTable).where(and(eq(tripsTable.id, id), eq(tripsTable.userId, userId)));
    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
    const token = trip.shareToken || generateShareToken();
    if (!trip.shareToken) {
      await db.update(tripsTable).set({ shareToken: token }).where(eq(tripsTable.id, id));
    }
    res.json({ shareToken: token, shareUrl: `/trips/${id}?token=${token}` });
  } catch {
    res.status(500).json({ error: "Failed to generate share link" });
  }
});

// ─── Trip Stops CRUD (auth required, owner only) ──────────────────────────────

router.post("/trips/:id/stops", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const tripId = parseInt(String(req.params.id), 10);
  if (isNaN(tripId) || tripId <= 0) { res.status(400).json({ error: "Invalid trip ID" }); return; }
  const { campgroundId, arrivalDate, departureDate, nights, notes } = req.body;
  if (!campgroundId || typeof campgroundId !== "number") {
    res.status(400).json({ error: "campgroundId is required" }); return;
  }
  try {
    const [trip] = await db.select().from(tripsTable).where(and(eq(tripsTable.id, tripId), eq(tripsTable.userId, userId)));
    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

    const existingStops = await db.select({ order: tripStopsTable.stopOrder }).from(tripStopsTable).where(eq(tripStopsTable.tripId, tripId));
    const nextOrder = existingStops.length > 0 ? Math.max(...existingStops.map((s) => s.order)) + 1 : 0;

    const [stop] = await db
      .insert(tripStopsTable)
      .values({ tripId, campgroundId, stopOrder: nextOrder, arrivalDate: arrivalDate || null, departureDate: departureDate || null, nights: nights || null, notes: notes || null })
      .returning();

    const [campground] = await db.select().from(campgroundsTable).where(eq(campgroundsTable.id, campgroundId));
    res.json({ stop: { ...stop, campground } });
  } catch {
    res.status(500).json({ error: "Failed to add stop" });
  }
});

router.put("/trips/:id/stops/:stopId", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const tripId = parseInt(String(req.params.id), 10);
  const stopId = parseInt(String(req.params.stopId), 10);
  if (isNaN(tripId) || isNaN(stopId)) { res.status(400).json({ error: "Invalid IDs" }); return; }
  const { arrivalDate, departureDate, nights, notes, stopOrder } = req.body;
  try {
    const [trip] = await db.select().from(tripsTable).where(and(eq(tripsTable.id, tripId), eq(tripsTable.userId, userId)));
    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
    const updates: Record<string, unknown> = {};
    if (arrivalDate !== undefined) updates.arrivalDate = arrivalDate || null;
    if (departureDate !== undefined) updates.departureDate = departureDate || null;
    if (nights !== undefined) updates.nights = nights || null;
    if (notes !== undefined) updates.notes = notes || null;
    if (typeof stopOrder === "number") updates.stopOrder = stopOrder;
    const [updated] = await db.update(tripStopsTable).set(updates).where(and(eq(tripStopsTable.id, stopId), eq(tripStopsTable.tripId, tripId))).returning();
    res.json({ stop: updated });
  } catch {
    res.status(500).json({ error: "Failed to update stop" });
  }
});

router.delete("/trips/:id/stops/:stopId", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const tripId = parseInt(String(req.params.id), 10);
  const stopId = parseInt(String(req.params.stopId), 10);
  if (isNaN(tripId) || isNaN(stopId)) { res.status(400).json({ error: "Invalid IDs" }); return; }
  try {
    const [trip] = await db.select().from(tripsTable).where(and(eq(tripsTable.id, tripId), eq(tripsTable.userId, userId)));
    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
    await db.delete(tripStopsTable).where(and(eq(tripStopsTable.id, stopId), eq(tripStopsTable.tripId, tripId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove stop" });
  }
});

export default router;

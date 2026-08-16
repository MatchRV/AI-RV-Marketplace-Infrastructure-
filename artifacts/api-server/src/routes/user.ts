import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  savedListingsTable,
  savedSearchesTable,
  priceAlertsTable,
  dealerMessagesTable,
  listingsTable,
  dealersTable,
  usersTable,
} from "@workspace/db";

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

router.get("/user/saved-ids", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const rows = await db
      .select({ listingId: savedListingsTable.listingId })
      .from(savedListingsTable)
      .where(eq(savedListingsTable.userId, userId));
    res.json({ ids: rows.map((r) => r.listingId) });
  } catch {
    res.status(500).json({ error: "Failed to load saved listings" });
  }
});

router.get("/user/saved", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const rows = await db
      .select()
      .from(savedListingsTable)
      .innerJoin(listingsTable, eq(savedListingsTable.listingId, listingsTable.id))
      .where(and(
        eq(savedListingsTable.userId, userId),
        sql`${listingsTable.images} IS NOT NULL AND jsonb_array_length(${listingsTable.images}) > 0`,
      ))
      .orderBy(desc(savedListingsTable.createdAt));
    res.json({ listings: rows.map((r) => r.listings) });
  } catch {
    res.status(500).json({ error: "Failed to load saved listings" });
  }
});

router.post("/listings/:id/save", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const listingId = parseInt(req.params.id, 10);
  if (isNaN(listingId) || listingId <= 0) {
    res.status(400).json({ error: "Invalid listing ID" });
    return;
  }
  try {
    await db
      .insert(savedListingsTable)
      .values({ userId, listingId })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save listing" });
  }
});

router.delete("/listings/:id/save", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const listingId = parseInt(req.params.id, 10);
  if (isNaN(listingId) || listingId <= 0) {
    res.status(400).json({ error: "Invalid listing ID" });
    return;
  }
  try {
    await db
      .delete(savedListingsTable)
      .where(
        and(
          eq(savedListingsTable.userId, userId),
          eq(savedListingsTable.listingId, listingId),
        ),
      );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to unsave listing" });
  }
});

router.get("/user/searches", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const rows = await db
      .select()
      .from(savedSearchesTable)
      .where(eq(savedSearchesTable.userId, userId))
      .orderBy(desc(savedSearchesTable.createdAt));
    res.json({ searches: rows });
  } catch {
    res.status(500).json({ error: "Failed to load saved searches" });
  }
});

router.post("/user/searches", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { name, filters } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (!filters || typeof filters !== "object") {
    res.status(400).json({ error: "Filters must be an object" });
    return;
  }
  try {
    await db.insert(savedSearchesTable).values({ userId, name: name.trim(), filters });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save search" });
  }
});

router.delete("/user/searches/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid search ID" });
    return;
  }
  try {
    await db
      .delete(savedSearchesTable)
      .where(
        and(eq(savedSearchesTable.id, id), eq(savedSearchesTable.userId, userId)),
      );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete search" });
  }
});

router.get("/user/alerts", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const rows = await db
      .select({
        id: priceAlertsTable.id,
        listingId: priceAlertsTable.listingId,
        rvType: priceAlertsTable.rvType,
        targetPrice: priceAlertsTable.targetPrice,
        triggered: priceAlertsTable.triggered,
        createdAt: priceAlertsTable.createdAt,
        listingTitle: listingsTable.title,
        currentPrice: listingsTable.price,
      })
      .from(priceAlertsTable)
      .leftJoin(listingsTable, eq(priceAlertsTable.listingId, listingsTable.id))
      .where(eq(priceAlertsTable.userId, userId))
      .orderBy(desc(priceAlertsTable.createdAt));
    res.json({ alerts: rows });
  } catch {
    res.status(500).json({ error: "Failed to load alerts" });
  }
});

router.post("/user/alerts", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { listingId, rvType, targetPrice } = req.body;
  const hasListing = typeof listingId === "number" && listingId > 0;
  const hasRvType = typeof rvType === "string" && rvType.length > 0;
  if (!hasListing && !hasRvType) {
    res.status(400).json({ error: "Must provide listingId or rvType" });
    return;
  }
  if (!targetPrice || typeof targetPrice !== "number" || targetPrice <= 0) {
    res.status(400).json({ error: "Invalid target price" });
    return;
  }
  try {
    const values: { userId: string; targetPrice: number; listingId?: number; rvType?: string } = { userId, targetPrice };
    if (hasListing) values.listingId = listingId;
    if (hasRvType) values.rvType = rvType;
    await db.insert(priceAlertsTable).values(values);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to create alert" });
  }
});

router.delete("/user/alerts/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid alert ID" });
    return;
  }
  try {
    await db
      .delete(priceAlertsTable)
      .where(
        and(eq(priceAlertsTable.id, id), eq(priceAlertsTable.userId, userId)),
      );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete alert" });
  }
});

router.get("/user/messages", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const rows = await db
      .select({
        id: dealerMessagesTable.id,
        dealerId: dealerMessagesTable.dealerId,
        dealerName: dealersTable.name,
        listingId: dealerMessagesTable.listingId,
        listingTitle: listingsTable.title,
        body: dealerMessagesTable.body,
        read: dealerMessagesTable.read,
        createdAt: dealerMessagesTable.createdAt,
      })
      .from(dealerMessagesTable)
      .innerJoin(dealersTable, eq(dealerMessagesTable.dealerId, dealersTable.id))
      .innerJoin(listingsTable, eq(dealerMessagesTable.listingId, listingsTable.id))
      .where(eq(dealerMessagesTable.userId, userId))
      .orderBy(desc(dealerMessagesTable.createdAt));
    res.json({ messages: rows });
  } catch {
    res.status(500).json({ error: "Failed to load messages" });
  }
});

router.post("/user/messages", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { dealerId, listingId, body } = req.body;
  if (!dealerId || typeof dealerId !== "number" || dealerId <= 0) {
    res.status(400).json({ error: "Invalid dealer ID" });
    return;
  }
  if (!listingId || typeof listingId !== "number" || listingId <= 0) {
    res.status(400).json({ error: "Invalid listing ID" });
    return;
  }
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    res.status(400).json({ error: "Message body is required" });
    return;
  }
  if (body.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 characters)" });
    return;
  }
  try {
    await db
      .insert(dealerMessagesTable)
      .values({ userId, dealerId, listingId, body: body.trim() });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.get("/user/driveway", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const [user] = await db
      .select({ drivewayLengthFt: usersTable.drivewayLengthFt, drivewayWidthFt: usersTable.drivewayWidthFt })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    res.json({ driveway: user ?? null });
  } catch {
    res.status(500).json({ error: "Failed to load driveway dimensions" });
  }
});

router.put("/user/driveway", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { drivewayLengthFt, drivewayWidthFt } = req.body;
  if (!drivewayLengthFt || !drivewayWidthFt || drivewayLengthFt < 10 || drivewayWidthFt < 6) {
    res.status(400).json({ error: "Invalid dimensions. Length >= 10 ft, width >= 6 ft." });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ drivewayLengthFt: Math.round(drivewayLengthFt), drivewayWidthFt: Math.round(drivewayWidthFt) })
      .where(eq(usersTable.id, userId));
    res.json({ ok: true, drivewayLengthFt: Math.round(drivewayLengthFt), drivewayWidthFt: Math.round(drivewayWidthFt) });
  } catch {
    res.status(500).json({ error: "Failed to save driveway dimensions" });
  }
});

export default router;

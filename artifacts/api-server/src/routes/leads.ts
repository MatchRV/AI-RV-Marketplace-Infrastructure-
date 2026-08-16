import { Router, type IRouter } from "express";
import { db, analyticsEventsTable, buyerLeadsTable, scraperLeadsTable } from "@workspace/db";
import { sql, desc, eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { notifyLead, postToCrm } from "../lib/notify-lead.js";

const ADMIN_KEY_VALUE = process.env.ADMIN_KEY;

const router: IRouter = Router();

function adminAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return void res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getLeadSessionId(sessionId: unknown, buyerProfile: unknown): string | null {
  const profile = asRecord(buyerProfile);
  const intent = asRecord(profile.matchrvIntent);
  return asString(sessionId) ?? asString(profile.sessionId) ?? asString(intent.sessionId);
}

async function enrichBuyerProfileWithAnalytics(
  buyerProfile: unknown,
  sessionId: string | null,
): Promise<Record<string, unknown>> {
  const profile = asRecord(buyerProfile);
  const existingIntent = asRecord(profile.matchrvIntent);
  if (!sessionId) return profile;

  try {
    const events = await db
      .select({
        eventType: analyticsEventsTable.eventType,
        listingId: analyticsEventsTable.listingId,
        dealerId: analyticsEventsTable.dealerId,
        metadata: analyticsEventsTable.metadata,
        createdAt: analyticsEventsTable.createdAt,
      })
      .from(analyticsEventsTable)
      .where(eq(analyticsEventsTable.sessionId, sessionId))
      .orderBy(desc(analyticsEventsTable.createdAt))
      .limit(50);

    const eventCounts = events.reduce<Record<string, number>>((counts, event) => {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
      return counts;
    }, {});

    return {
      ...profile,
      sessionId,
      matchrvIntent: {
        ...existingIntent,
        sessionId,
        serverEventCount: events.length,
        serverEventCounts: eventCounts,
        serverRecentEvents: events.slice(0, 15).map((event) => ({
          eventType: event.eventType,
          listingId: event.listingId,
          dealerId: event.dealerId,
          metadata: event.metadata ?? {},
          at: event.createdAt?.toISOString?.() ?? String(event.createdAt),
        })),
        enrichedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    console.warn("Buyer intent enrichment skipped:", err);
    return {
      ...profile,
      sessionId,
      matchrvIntent: {
        ...existingIntent,
        sessionId,
        enrichmentSkipped: true,
      },
    };
  }
}

// Admin: Create a scraper lead (external scraper / lead capture)
router.post("/leads", async (req, res, next) => {
  const key = req.headers["x-admin-key"];
  if (ADMIN_KEY_VALUE && key === ADMIN_KEY_VALUE) {
    try {
      const {
        listingId,
        dealerName,
        dealerEmail,
        buyerName,
        buyerEmail,
        buyerPhone,
        message,
        listingTitle,
        listingUrl,
      } = req.body as Record<string, unknown>;

      const [lead] = await db
        .insert(scraperLeadsTable)
        .values({
          listingId: listingId != null ? Number(listingId) : null,
          dealerName: dealerName ? String(dealerName) : null,
          dealerEmail: dealerEmail ? String(dealerEmail) : null,
          buyerName: buyerName ? String(buyerName) : null,
          buyerEmail: buyerEmail ? String(buyerEmail) : null,
          buyerPhone: buyerPhone ? String(buyerPhone) : null,
          message: message ? String(message) : null,
          listingTitle: listingTitle ? String(listingTitle) : null,
          listingUrl: listingUrl ? String(listingUrl) : null,
          crmSyncStatus: process.env.LOTLINK_CRM_WEBHOOK_URL ? "pending" : null,
        })
        .returning({ id: scraperLeadsTable.id });

      notifyLead({
        leadId: lead.id,
        scraperLeadId: lead.id,
        leadSource: "contact_dealer",
        contactName: buyerName ? String(buyerName) : null,
        contactEmail: buyerEmail ? String(buyerEmail) : null,
        contactPhone: buyerPhone ? String(buyerPhone) : null,
        message: message ? String(message) : null,
        dealerName: dealerName ? String(dealerName) : null,
        dealerEmail: dealerEmail ? String(dealerEmail) : null,
        listingTitle: listingTitle ? String(listingTitle) : null,
        listingUrl: listingUrl ? String(listingUrl) : null,
      }).catch(console.error);

      return void res.status(201).json({ id: lead.id, created: true });
    } catch (err) {
      console.error("Scraper lead creation error:", err);
      return void res.status(500).json({ message: "Internal server error" });
    }
  }
  // No admin key — fall through to the public handler below
  next();
});

// Public: Create a lead (called when user contacts dealer or saves a listing)
router.post("/leads", async (req, res) => {
  try {
    const {
      sessionId,
      listingId,
      dealerId,
      listingSnapshot,
      buyerProfile,
      conversation,
      contactName,
      contactEmail,
      contactPhone,
      message,
      leadSource,
      smsOptIn,
    } = req.body;

    const leadSessionId = getLeadSessionId(sessionId, buyerProfile);
    const enrichedBuyerProfile = await enrichBuyerProfileWithAnalytics(buyerProfile, leadSessionId);

    const [lead] = await db.insert(buyerLeadsTable).values({
      sessionId: leadSessionId,
      listingId: listingId ?? null,
      dealerId: dealerId ?? null,
      listingSnapshot: listingSnapshot ?? {},
      buyerProfile: enrichedBuyerProfile,
      conversation: conversation ?? [],
      contactName: contactName ?? null,
      contactEmail: contactEmail ?? null,
      contactPhone: contactPhone ?? null,
      message: message ?? null,
      leadSource: leadSource ?? "contact_dealer",
      status: "new",
      crmSyncStatus: process.env.LOTLINK_CRM_WEBHOOK_URL ? "pending" : null,
      smsOptIn: smsOptIn === true,
    }).returning({ id: buyerLeadsTable.id });

    notifyLead({
      leadId: lead.id,
      buyerLeadId: lead.id,
      leadSource: leadSource ?? "contact_dealer",
      contactName: contactName ?? null,
      contactEmail: contactEmail ?? null,
      contactPhone: contactPhone ?? null,
      message: message ?? null,
      listingSnapshot: listingSnapshot ?? {},
      buyerProfile: enrichedBuyerProfile,
    }).catch(console.error);

    res.json({ ok: true, leadId: lead.id });
  } catch (err) {
    console.error("Lead creation error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Admin: Get all leads
router.get("/admin/leads", adminAuth, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const crmStatus = req.query.crmStatus as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    let leads;
    if (status) {
      leads = await db.select().from(buyerLeadsTable).where(eq(buyerLeadsTable.status, status)).orderBy(desc(buyerLeadsTable.createdAt)).limit(limit).offset(offset);
    } else if (crmStatus) {
      leads = await db.select().from(buyerLeadsTable).where(eq(buyerLeadsTable.crmSyncStatus, crmStatus)).orderBy(desc(buyerLeadsTable.createdAt)).limit(limit).offset(offset);
    } else {
      leads = await db.select().from(buyerLeadsTable).orderBy(desc(buyerLeadsTable.createdAt)).limit(limit).offset(offset);
    }

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(buyerLeadsTable);
    const [{ newCount }] = await db.select({ newCount: sql<number>`count(*)` }).from(buyerLeadsTable).where(eq(buyerLeadsTable.status, "new"));

    res.json({ leads, total: Number(count), newCount: Number(newCount) });
  } catch (err) {
    console.error("Leads fetch error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Admin: Update lead status / notes
router.patch("/admin/leads/:id", adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, notes } = req.body;

    const updates: Partial<typeof buyerLeadsTable.$inferInsert> = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    await db.update(buyerLeadsTable).set(updates).where(eq(buyerLeadsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Lead update error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Admin: Retry CRM sync for a failed lead
router.post("/admin/leads/:id/retry-crm", adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return void res.status(400).json({ message: "Invalid lead ID" });
    }

    const [lead] = await db.select().from(buyerLeadsTable).where(eq(buyerLeadsTable.id, id)).limit(1);
    if (!lead) {
      return void res.status(404).json({ message: "Lead not found" });
    }

    if (!process.env.LOTLINK_CRM_WEBHOOK_URL) {
      return void res.status(422).json({ ok: false, message: "LOTLINK_CRM_WEBHOOK_URL is not configured — cannot retry CRM sync", crmSyncStatus: "failed" });
    }

    await db.update(buyerLeadsTable).set({ crmSyncStatus: "pending" }).where(eq(buyerLeadsTable.id, id));

    await postToCrm({
      buyerLeadId: lead.id,
      leadSource: lead.leadSource ?? "contact_dealer",
      contactName: lead.contactName ?? null,
      contactEmail: lead.contactEmail ?? null,
      contactPhone: lead.contactPhone ?? null,
      message: lead.message ?? null,
      listingSnapshot: (lead.listingSnapshot as Record<string, unknown>) ?? {},
      buyerProfile: (lead.buyerProfile as Record<string, unknown>) ?? {},
    });

    const [updated] = await db.select({ crmSyncStatus: buyerLeadsTable.crmSyncStatus }).from(buyerLeadsTable).where(eq(buyerLeadsTable.id, id)).limit(1);
    const finalStatus = updated?.crmSyncStatus ?? "failed";
    const success = finalStatus === "synced";
    return void res.json({ ok: success, crmSyncStatus: finalStatus });
  } catch (err) {
    console.error("CRM retry error:", err);
    return void res.status(500).json({ message: "Internal server error" });
  }
});

// Public: Email capture for price alerts (logged-out users)
router.post("/price-alerts", async (req, res) => {
  try {
    const { email, listingId, listingType, buyerProfile, sessionId } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return void res.status(400).json({ message: "Valid email required" });
    }
    const leadSessionId = getLeadSessionId(sessionId, buyerProfile);
    const enrichedBuyerProfile = await enrichBuyerProfileWithAnalytics(buyerProfile, leadSessionId);
    // Store as a lead with leadSource "price_alert_email"
    const [alertLead] = await db.insert(buyerLeadsTable).values({
      sessionId: leadSessionId,
      listingId: listingId ?? null,
      dealerId: null,
      listingSnapshot: listingType ? { type: listingType } : {},
      buyerProfile: enrichedBuyerProfile,
      conversation: [],
      contactName: null,
      contactEmail: email.trim().toLowerCase(),
      contactPhone: null,
      message: null,
      leadSource: "price_alert_email",
      status: "new",
      crmSyncStatus: process.env.LOTLINK_CRM_WEBHOOK_URL ? "pending" : null,
    }).returning({ id: buyerLeadsTable.id });

    notifyLead({
      buyerLeadId: alertLead.id,
      leadSource: "price_alert_email",
      contactEmail: email.trim().toLowerCase(),
      listingSnapshot: listingType ? { type: listingType } : {},
      buyerProfile: enrichedBuyerProfile,
    }).catch(console.error);

    res.json({ ok: true });
  } catch (err) {
    console.error("Price alert error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

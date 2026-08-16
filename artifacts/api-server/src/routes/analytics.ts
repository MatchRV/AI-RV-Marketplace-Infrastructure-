import { Router, type IRouter } from "express";
import { db, analyticsEventsTable } from "@workspace/db";
import { sql, eq, gte, and, desc } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();

const VALID_EVENT_TYPES = [
  "page_view", "listing_view", "search", "tow_check", "outfitter_session",
  "dealer_contact", "filter_applied", "listing_save", "contact_open",
  "outfitter_message", "swipe_like", "swipe_pass",
  "quiz_start", "quiz_complete", "match_report_generated",
  "return_visit", "hero_cta_click", "listing_saved", "listing_skipped",
];

router.post("/analytics/event", async (req, res) => {
  try {
    const { eventType, sessionId, listingId, dealerId, metadata } = req.body;
    if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
      return void res.status(400).json({ message: "Invalid eventType" });
    }

    await db.insert(analyticsEventsTable).values({
      eventType,
      sessionId: sessionId ?? null,
      listingId: listingId ?? null,
      dealerId: dealerId ?? null,
      metadata: metadata ?? {},
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Analytics event error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

function adminAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return void res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function parseDays(raw: string | undefined): number {
  const d = parseInt(raw as string);
  return isNaN(d) ? 30 : d;
}

function getSince(days: number): Date | null {
  if (days === 0) return null;
  return new Date(Date.now() - days * 86400000);
}

function sinceCondition(since: Date | null) {
  return since ? gte(analyticsEventsTable.createdAt, since) : undefined;
}

router.get("/admin/analytics/summary", adminAuth, async (req, res) => {
  try {
    const days = parseDays(req.query.days as string);
    const since = getSince(days);
    const cond = sinceCondition(since);

    const [
      totalEvents,
      listingViews,
      searches,
      outfitterSessions,
      towChecks,
      pageViews,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(analyticsEventsTable)
        .where(cond),
      db.select({ count: sql<number>`count(*)` })
        .from(analyticsEventsTable)
        .where(cond ? and(eq(analyticsEventsTable.eventType, "listing_view"), cond) : eq(analyticsEventsTable.eventType, "listing_view")),
      db.select({ count: sql<number>`count(*)` })
        .from(analyticsEventsTable)
        .where(cond ? and(eq(analyticsEventsTable.eventType, "search"), cond) : eq(analyticsEventsTable.eventType, "search")),
      db.select({ count: sql<number>`count(DISTINCT session_id)` })
        .from(analyticsEventsTable)
        .where(cond ? and(eq(analyticsEventsTable.eventType, "outfitter_session"), cond) : eq(analyticsEventsTable.eventType, "outfitter_session")),
      db.select({ count: sql<number>`count(*)` })
        .from(analyticsEventsTable)
        .where(cond ? and(eq(analyticsEventsTable.eventType, "tow_check"), cond) : eq(analyticsEventsTable.eventType, "tow_check")),
      db.select({ count: sql<number>`count(*)` })
        .from(analyticsEventsTable)
        .where(cond ? and(eq(analyticsEventsTable.eventType, "page_view"), cond) : eq(analyticsEventsTable.eventType, "page_view")),
    ]);

    res.json({
      totalEvents: Number(totalEvents[0]?.count ?? 0),
      listingViews: Number(listingViews[0]?.count ?? 0),
      searches: Number(searches[0]?.count ?? 0),
      outfitterSessions: Number(outfitterSessions[0]?.count ?? 0),
      towChecks: Number(towChecks[0]?.count ?? 0),
      pageViews: Number(pageViews[0]?.count ?? 0),
      days,
    });
  } catch (err) {
    console.error("Admin summary error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/admin/analytics/dealer-views", adminAuth, async (req, res) => {
  try {
    const days = parseDays(req.query.days as string);
    const since = getSince(days);
    const sinceClause = since ? sql`AND ae.created_at >= ${since}` : sql``;

    const rows = await db.execute(sql`
      SELECT 
        ae.dealer_id,
        ae.metadata->>'dealerName' as dealer_name,
        COUNT(*) as view_count,
        COUNT(DISTINCT ae.session_id) as unique_visitors
      FROM analytics_events ae
      WHERE ae.event_type = 'listing_view'
        ${sinceClause}
        AND ae.dealer_id IS NOT NULL
      GROUP BY ae.dealer_id, ae.metadata->>'dealerName'
      ORDER BY view_count DESC
      LIMIT 25
    `);

    res.json({ dealers: rows.rows });
  } catch (err) {
    console.error("Dealer views error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/admin/analytics/top-listings", adminAuth, async (req, res) => {
  try {
    const days = parseDays(req.query.days as string);
    const since = getSince(days);
    const sinceClause = since ? sql`AND ae.created_at >= ${since}` : sql``;

    const rows = await db.execute(sql`
      SELECT 
        ae.listing_id,
        ae.metadata->>'title' as listing_title,
        ae.metadata->>'dealerName' as dealer_name,
        COUNT(*) as view_count,
        COUNT(DISTINCT ae.session_id) as unique_visitors
      FROM analytics_events ae
      WHERE ae.event_type = 'listing_view'
        ${sinceClause}
        AND ae.listing_id IS NOT NULL
      GROUP BY ae.listing_id, ae.metadata->>'title', ae.metadata->>'dealerName'
      ORDER BY view_count DESC
      LIMIT 25
    `);

    res.json({ listings: rows.rows });
  } catch (err) {
    console.error("Top listings error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/admin/analytics/search-trends", adminAuth, async (req, res) => {
  try {
    const days = parseDays(req.query.days as string);
    const since = getSince(days);
    const sinceClause = since ? sql`AND ae.created_at >= ${since}` : sql``;

    const [typeRows, stateRows] = await Promise.all([
      db.execute(sql`
        SELECT ae.metadata->>'type' as rv_type, COUNT(*) as count
        FROM analytics_events ae
        WHERE ae.event_type = 'search'
          ${sinceClause}
          AND ae.metadata->>'type' IS NOT NULL
          AND ae.metadata->>'type' != ''
        GROUP BY ae.metadata->>'type'
        ORDER BY count DESC
      `),
      db.execute(sql`
        SELECT ae.metadata->>'state' as state, COUNT(*) as count
        FROM analytics_events ae
        WHERE ae.event_type = 'search'
          ${sinceClause}
          AND ae.metadata->>'state' IS NOT NULL
          AND ae.metadata->>'state' != ''
        GROUP BY ae.metadata->>'state'
        ORDER BY count DESC
      `),
    ]);

    res.json({
      types: typeRows.rows,
      states: stateRows.rows,
    });
  } catch (err) {
    console.error("Search trends error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/admin/analytics/budgets", adminAuth, async (req, res) => {
  try {
    const days = parseDays(req.query.days as string);
    const since = getSince(days);
    const sinceClause = since ? sql`AND created_at >= ${since}` : sql``;

    const rows = await db.execute(sql`
      WITH all_budgets AS (
        SELECT (metadata->>'maxPrice')::numeric AS budget
        FROM analytics_events
        WHERE event_type = 'search'
          ${sinceClause}
          AND metadata->>'maxPrice' IS NOT NULL
        UNION ALL
        SELECT (metadata->>'maxBudget')::numeric AS budget
        FROM analytics_events
        WHERE event_type = 'outfitter_session'
          ${sinceClause}
          AND metadata->>'maxBudget' IS NOT NULL
      ),
      bucketed AS (
        SELECT
          CASE
            WHEN budget < 25000 THEN 'Under $25k'
            WHEN budget < 50000 THEN '$25k-$50k'
            WHEN budget < 75000 THEN '$50k-$75k'
            WHEN budget < 100000 THEN '$75k-$100k'
            WHEN budget < 150000 THEN '$100k-$150k'
            ELSE '$150k+'
          END AS range,
          CASE
            WHEN budget < 25000 THEN 1
            WHEN budget < 50000 THEN 2
            WHEN budget < 75000 THEN 3
            WHEN budget < 100000 THEN 4
            WHEN budget < 150000 THEN 5
            ELSE 6
          END AS sort_order
        FROM all_budgets
      )
      SELECT range, COUNT(*) AS count
      FROM bucketed
      GROUP BY range, sort_order
      ORDER BY sort_order
    `);

    res.json({ budgets: rows.rows });
  } catch (err) {
    console.error("Budgets error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/admin/analytics/tow-vehicles", adminAuth, async (req, res) => {
  try {
    const days = parseDays(req.query.days as string);
    const since = getSince(days);
    const sinceClause = since ? sql`AND ae.created_at >= ${since}` : sql``;

    const rows = await db.execute(sql`
      SELECT 
        ae.metadata->>'vehicleMake' as make,
        ae.metadata->>'vehicleModel' as model,
        COUNT(*) as count
      FROM analytics_events ae
      WHERE ae.event_type = 'tow_check'
        ${sinceClause}
      GROUP BY ae.metadata->>'vehicleMake', ae.metadata->>'vehicleModel'
      ORDER BY count DESC
      LIMIT 15
    `);

    res.json({ vehicles: rows.rows });
  } catch (err) {
    console.error("Tow vehicles error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/admin/analytics/outfitter-insights", adminAuth, async (req, res) => {
  try {
    const days = parseDays(req.query.days as string);
    const since = getSince(days);
    const sinceClause = since ? sql`AND ae.created_at >= ${since}` : sql``;

    const [typeRows, useCaseRows] = await Promise.all([
      db.execute(sql`
        SELECT ae.metadata->>'rvType' as rv_type, COUNT(*) as count
        FROM analytics_events ae
        WHERE ae.event_type = 'outfitter_session'
          ${sinceClause}
          AND ae.metadata->>'rvType' IS NOT NULL
        GROUP BY ae.metadata->>'rvType'
        ORDER BY count DESC
      `),
      db.execute(sql`
        SELECT ae.metadata->>'useCase' as use_case, COUNT(*) as count
        FROM analytics_events ae
        WHERE ae.event_type = 'outfitter_session'
          ${sinceClause}
          AND ae.metadata->>'useCase' IS NOT NULL
        GROUP BY ae.metadata->>'useCase'
        ORDER BY count DESC
      `),
    ]);

    res.json({
      rvTypes: typeRows.rows,
      useCases: useCaseRows.rows,
    });
  } catch (err) {
    console.error("Outfitter insights error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/admin/analytics/timeline", adminAuth, async (req, res) => {
  try {
    const days = parseDays(req.query.days as string);
    const since = getSince(days);
    const sinceClause = since ? sql`AND ae.created_at >= ${since}` : sql``;

    const rows = await db.execute(sql`
      SELECT 
        DATE(ae.created_at) as date,
        COUNT(*) as count
      FROM analytics_events ae
      WHERE ae.event_type = 'search'
        ${sinceClause}
      GROUP BY DATE(ae.created_at)
      ORDER BY date ASC
    `);

    res.json({ timeline: rows.rows });
  } catch (err) {
    console.error("Timeline error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/admin/analytics/kpis", adminAuth, async (req, res) => {
  try {
    const days = parseDays(req.query.days as string);
    const since = getSince(days);
    const sc = since ? sql`AND created_at >= ${since}` : sql``;
    const aesc = since ? sql`AND ae.created_at >= ${since}` : sql``;

    const [funnelRows, returnRows, keywordRows, landingRows, dealerRows, leadRows] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(CASE WHEN event_type = 'quiz_start' THEN 1 END)::int            AS quiz_starts,
          COUNT(CASE WHEN event_type = 'quiz_complete' THEN 1 END)::int          AS quiz_completes,
          COUNT(CASE WHEN event_type = 'match_report_generated' THEN 1 END)::int AS reports_generated,
          COUNT(CASE WHEN event_type = 'match_report_unlock' THEN 1 END)::int    AS unlock_attempts
        FROM analytics_events
        WHERE event_type IN ('quiz_start','quiz_complete','match_report_generated','match_report_unlock')
          ${sc}
      `),
      db.execute(sql`
        SELECT
          COUNT(CASE WHEN event_type = 'return_visit' THEN 1 END)::int                        AS return_visits,
          COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN session_id END)::int          AS total_sessions
        FROM analytics_events
        WHERE event_type IN ('return_visit','page_view')
          ${sc}
      `),
      db.execute(sql`
        SELECT keyword, SUM(kcount)::int AS count
        FROM (
          SELECT metadata->>'rvType' AS keyword, COUNT(*) AS kcount
          FROM analytics_events
          WHERE event_type = 'outfitter_session'
            AND metadata->>'rvType' IS NOT NULL
            AND metadata->>'rvType' NOT IN ('not_sure','')
            ${sc}
          GROUP BY 1
          UNION ALL
          SELECT metadata->>'type' AS keyword, COUNT(*) AS kcount
          FROM analytics_events
          WHERE event_type = 'search'
            AND metadata->>'type' IS NOT NULL AND metadata->>'type' != ''
            ${sc}
          GROUP BY 1
          UNION ALL
          SELECT metadata->>'useCase' AS keyword, COUNT(*) AS kcount
          FROM analytics_events
          WHERE event_type = 'outfitter_session'
            AND metadata->>'useCase' IS NOT NULL AND metadata->>'useCase' != ''
            ${sc}
          GROUP BY 1
        ) k
        WHERE keyword IS NOT NULL AND keyword != ''
        GROUP BY keyword
        ORDER BY count DESC
        LIMIT 12
      `),
      db.execute(sql`
        SELECT
          COALESCE(metadata->>'path', metadata->>'page', '/') AS page,
          COUNT(*)::int AS count
        FROM analytics_events
        WHERE event_type = 'page_view'
          ${sc}
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
      `),
      db.execute(sql`
        SELECT
          ae.dealer_id,
          COALESCE(ae.metadata->>'dealerName', 'Dealer #' || ae.dealer_id::text) AS dealer_name,
          COUNT(*)::int AS total_views,
          COUNT(DISTINCT ae.session_id)::int AS unique_visitors
        FROM analytics_events ae
        WHERE ae.event_type = 'listing_view'
          AND ae.dealer_id IS NOT NULL
          ${aesc}
        GROUP BY ae.dealer_id, ae.metadata->>'dealerName'
        ORDER BY unique_visitors DESC
        LIMIT 10
      `),
      db.execute(sql`
        SELECT
          COUNT(*)::int AS total_leads,
          COUNT(CASE WHEN status IN ('contacted','closed') THEN 1 END)::int AS qualified,
          COUNT(CASE WHEN buyer_profile IS NOT NULL
                      AND buyer_profile::text NOT IN ('{}','null') THEN 1 END)::int AS with_ai_profile,
          COUNT(CASE WHEN lead_source = 'match_report_unlock' THEN 1 END)::int  AS report_purchases,
          COUNT(CASE WHEN lead_source = 'buyers_agent_inquiry' THEN 1 END)::int AS agent_inquiries
        FROM buyer_leads
        ${since ? sql`WHERE created_at >= ${since}` : sql``}
      `),
    ]);

    const f  = funnelRows.rows[0]  as Record<string, number>;
    const rv = returnRows.rows[0]  as Record<string, number>;
    const lq = leadRows.rows[0]    as Record<string, number>;

    const quizStarts       = Number(f?.quiz_starts       ?? 0);
    const quizCompletes    = Number(f?.quiz_completes    ?? 0);
    const reportsGenerated = Number(f?.reports_generated ?? 0);
    const unlockAttempts   = Number(f?.unlock_attempts   ?? 0);
    const completionRate   = quizStarts > 0 ? Math.round((reportsGenerated / quizStarts) * 100) : null;

    const returnVisits  = Number(rv?.return_visits  ?? 0);
    const totalSessions = Number(rv?.total_sessions ?? 0);
    const returnRate    = totalSessions > 0 ? Math.round((returnVisits / totalSessions) * 100) : null;

    const totalLeads        = Number(lq?.total_leads     ?? 0);
    const qualified         = Number(lq?.qualified       ?? 0);
    const withAiProfile     = Number(lq?.with_ai_profile ?? 0);
    const reportPurchases   = Number(lq?.report_purchases  ?? 0);
    const agentInquiries    = Number(lq?.agent_inquiries   ?? 0);
    const leadQualifiedRate = totalLeads > 0 ? Math.round((qualified / totalLeads) * 100) : null;

    const COST_PER_REPORT = 0.028;
    const REPORT_PRICE    = 29.96;
    const AGENT_PRICE     = 499;

    res.json({
      reportFunnel: { quizStarts, quizCompletes, reportsGenerated, unlockAttempts, completionRate },
      costEstimate: {
        reportsGenerated,
        costPerReport: COST_PER_REPORT,
        totalCost:     +(reportsGenerated * COST_PER_REPORT).toFixed(2),
        grossRevenue:  +(reportPurchases * REPORT_PRICE).toFixed(2),
        agentRevenue:  agentInquiries * AGENT_PRICE,
      },
      leadQuality:    { totalLeads, qualified, withAiProfile, reportPurchases, agentInquiries, leadQualifiedRate },
      returnVisitors: { returnVisits, totalSessions, returnRate },
      topKeywords:    keywordRows.rows,
      topLandingPages: landingRows.rows,
      dealerInterest: dealerRows.rows,
      days,
    });
  } catch (err) {
    console.error("KPI error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/admin/analytics/recent-events", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "150"), 300);
    const rows = await db
      .select()
      .from(analyticsEventsTable)
      .orderBy(desc(analyticsEventsTable.createdAt))
      .limit(limit);
    res.json({ events: rows });
  } catch (err) {
    console.error("Recent events error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

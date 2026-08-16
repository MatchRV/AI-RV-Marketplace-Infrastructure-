import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const analyticsEventsTable = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  sessionId: text("session_id"),
  listingId: integer("listing_id"),
  dealerId: integer("dealer_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_analytics_event_type").on(table.eventType),
  index("idx_analytics_created_at").on(table.createdAt),
  index("idx_analytics_dealer_id").on(table.dealerId),
  index("idx_analytics_listing_id").on(table.listingId),
]);

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;

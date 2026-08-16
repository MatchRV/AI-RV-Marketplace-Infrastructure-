import { pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const scraperLeadsTable = pgTable("scraper_leads", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id"),
  dealerName: text("dealer_name"),
  dealerEmail: text("dealer_email"),
  buyerName: text("buyer_name"),
  buyerEmail: text("buyer_email"),
  buyerPhone: text("buyer_phone"),
  message: text("message"),
  listingTitle: text("listing_title"),
  listingUrl: text("listing_url"),
  crmSyncStatus: varchar("crm_sync_status", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ScraperLead = typeof scraperLeadsTable.$inferSelect;
export type InsertScraperLead = typeof scraperLeadsTable.$inferInsert;

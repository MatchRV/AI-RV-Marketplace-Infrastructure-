import { pgTable, serial, varchar, text, real, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const sellLeadsTable = pgTable("sell_leads", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  year: integer("year").notNull(),
  make: varchar("make").notNull(),
  model: varchar("model").notNull(),
  type: varchar("type").notNull(),
  condition: varchar("condition").notNull(),
  askingPrice: real("asking_price"),
  description: text("description"),
  photos: jsonb("photos").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contactSubmissionsTable = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  email: varchar("email").notNull(),
  subject: varchar("subject").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const buyerLeadsTable = pgTable("buyer_leads", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id"),
  listingId: integer("listing_id"),
  dealerId: integer("dealer_id"),
  listingSnapshot: jsonb("listing_snapshot").$type<Record<string, unknown>>().default({}),
  buyerProfile: jsonb("buyer_profile").$type<Record<string, unknown>>().default({}),
  conversation: jsonb("conversation").$type<{ role: string; content: string }[]>().default([]),
  contactName: varchar("contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  message: text("message"),
  leadSource: varchar("lead_source").notNull().default("contact_dealer"),
  status: varchar("status").notNull().default("new"),
  notes: text("notes"),
  crmSyncStatus: varchar("crm_sync_status"),
  smsOptIn: boolean("sms_opt_in").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_buyer_leads_status").on(table.status),
  index("idx_buyer_leads_dealer").on(table.dealerId),
  index("idx_buyer_leads_created").on(table.createdAt),
]);

export type BuyerLead = typeof buyerLeadsTable.$inferSelect;

export const matchReportLeadsTable = pgTable("match_report_leads", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull(),
  reportId: varchar("report_id"),
  quiz: jsonb("quiz").$type<Record<string, unknown>>().default({}),
  source: varchar("source").notNull().default("match_report"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_match_report_leads_email").on(table.email),
  index("idx_match_report_leads_created").on(table.createdAt),
]);

export type MatchReportLead = typeof matchReportLeadsTable.$inferSelect;
export type InsertMatchReportLead = typeof matchReportLeadsTable.$inferInsert;

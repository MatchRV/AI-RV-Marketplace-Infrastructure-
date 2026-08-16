import { pgTable, serial, varchar, integer, real, boolean, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { listingsTable, dealersTable } from "./listings";

export const savedListingsTable = pgTable("saved_listings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_saved_listing").on(table.userId, table.listingId),
  index("idx_saved_user").on(table.userId),
]);

export const savedSearchesTable = pgTable("saved_searches", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_saved_searches_user").on(table.userId),
]);

export const priceAlertsTable = pgTable("price_alerts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  listingId: integer("listing_id").references(() => listingsTable.id, { onDelete: "cascade" }),
  rvType: varchar("rv_type"),
  targetPrice: real("target_price").notNull(),
  triggered: boolean("triggered").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_price_alerts_user").on(table.userId),
]);

export const dealerMessagesTable = pgTable("dealer_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  dealerId: integer("dealer_id").notNull().references(() => dealersTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  body: varchar("body").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dealer_messages_user").on(table.userId),
  index("idx_dealer_messages_dealer").on(table.dealerId),
]);

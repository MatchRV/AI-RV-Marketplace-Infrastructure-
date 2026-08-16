import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const importRunsTable = pgTable("import_runs", {
  id: serial("id").primaryKey(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  sourceIp: text("source_ip"),
  dealersInserted: integer("dealers_inserted").notNull().default(0),
  dealersUpdated: integer("dealers_updated").notNull().default(0),
  listingsInserted: integer("listings_inserted").notNull().default(0),
  listingsUpdated: integer("listings_updated").notNull().default(0),
  listingsSkipped: integer("listings_skipped").notNull().default(0),
  durationMs: integer("duration_ms"),
  error: text("error"),
});

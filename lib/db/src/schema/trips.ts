import { pgTable, serial, varchar, integer, real, boolean, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";

export const campgroundsTable = pgTable("campgrounds", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: varchar("description", { length: 1000 }),
  state: varchar("state", { length: 2 }).notNull(),
  city: varchar("city").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  hookupType: varchar("hookup_type").notNull(),
  maxRvLength: integer("max_rv_length"),
  totalSites: integer("total_sites"),
  nightlyRateMin: real("nightly_rate_min"),
  nightlyRateMax: real("nightly_rate_max"),
  bookingUrl: varchar("booking_url", { length: 500 }),
  amenities: jsonb("amenities").$type<string[]>().default([]),
  campgroundType: varchar("campground_type").notNull(),
  imageUrl: varchar("image_url", { length: 500 }),
  phone: varchar("phone", { length: 30 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_campgrounds_state").on(table.state),
  index("idx_campgrounds_hookup").on(table.hookupType),
]);

export const tripsTable = pgTable("trips", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name").notNull(),
  startDate: varchar("start_date", { length: 10 }),
  endDate: varchar("end_date", { length: 10 }),
  notes: varchar("notes", { length: 2000 }),
  status: varchar("status").notNull().default("planning"),
  shareToken: varchar("share_token", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_trips_user").on(table.userId),
  index("idx_trips_share_token").on(table.shareToken),
]);

export const tripStopsTable = pgTable("trip_stops", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  campgroundId: integer("campground_id").notNull().references(() => campgroundsTable.id, { onDelete: "cascade" }),
  stopOrder: integer("stop_order").notNull().default(0),
  arrivalDate: varchar("arrival_date", { length: 10 }),
  departureDate: varchar("departure_date", { length: 10 }),
  nights: integer("nights"),
  notes: varchar("notes", { length: 1000 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_trip_stops_trip").on(table.tripId),
]);

import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  type: text("type").notNull(),
  price: real("price").notNull(),
  marketValue: real("market_value").notNull(),
  dealScore: text("deal_score").notNull().default("fair_deal"),
  dealSavings: real("deal_savings").default(0),
  mileage: integer("mileage"),
  length: real("length"),
  slides: integer("slides").default(0),
  sleeps: integer("sleeps").notNull().default(2),
  location: text("location").notNull(),
  state: text("state").notNull(),
  dealerName: text("dealer_name").notNull(),
  dealerId: integer("dealer_id").notNull(),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  daysOnMarket: integer("days_on_market").notNull().default(0),
  condition: text("condition").notNull().default("used"),
  isNew: boolean("is_new").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  vin: text("vin"),
  description: text("description"),
  features: jsonb("features").$type<string[]>().default([]),
  widthFt: real("width_ft"),
  heightFt: real("height_ft"),
  dryWeight: real("dry_weight"),
  gvwr: real("gvwr"),
  hitchWeight: real("hitch_weight"),
  freshWater: real("fresh_water"),
  greyWater: real("grey_water"),
  blackWater: real("black_water"),
  generator: boolean("generator").default(false),
  solar: boolean("solar").default(false),
  awning: boolean("awning").default(true),
  outdoorKitchen: boolean("outdoor_kitchen").default(false),
  washerDryer: boolean("washer_dryer").default(false),
  priceHistory: jsonb("price_history").$type<{ date: string; price: number }[]>().default([]),
  // ── AI Enrichment fields ───────────────────────────────────────────────────
  solarReady:          boolean("solar_ready"),
  solarInstalled:      boolean("solar_installed"),
  bedSize:             text("bed_size"),
  hasFireplace:        boolean("has_fireplace"),
  petFriendly:         boolean("pet_friendly"),
  rearBedroom:         boolean("rear_bedroom"),
  rearLiving:          boolean("rear_living"),
  frontKitchen:        boolean("front_kitchen"),
  theaterSeating:      boolean("theater_seating"),
  islandKitchen:       boolean("island_kitchen"),
  walkAroundBed:       boolean("walk_around_bed"),
  outdoorShower:       boolean("outdoor_shower"),
  outdoorSpeakers:     boolean("outdoor_speakers"),
  backupCamera:        boolean("backup_camera"),
  hydraulicJacks:      boolean("hydraulic_jacks"),
  powerAwning:         boolean("power_awning"),
  enclosedUnderbelly:  boolean("enclosed_underbelly"),
  heatedTanks:         boolean("heated_tanks"),
  fourSeason:          boolean("four_season"),
  hitchType:           text("hitch_type"),
  boondockingScore:    integer("boondocking_score"),
  enrichmentVersion:   integer("enrichment_version").default(0),
  enrichedAt:          timestamp("enriched_at"),
  latitude:            doublePrecision("latitude"),
  longitude:           doublePrecision("longitude"),
  // ──────────────────────────────────────────────────────────────────────────
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;

export const dealersTable = pgTable("dealers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").unique(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  phone: text("phone"),
  rating: real("rating").notNull().default(4.0),
  reviewCount: integer("review_count").notNull().default(0),
  avgResponseTime: text("avg_response_time").notNull().default("< 2 hours"),
  beginnerFriendly: boolean("beginner_friendly").notNull().default(false),
  yearsInBusiness: integer("years_in_business").notNull().default(5),
  totalListings: integer("total_listings").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealerSchema = createInsertSchema(dealersTable).omit({ id: true, createdAt: true });
export type InsertDealer = z.infer<typeof insertDealerSchema>;
export type Dealer = typeof dealersTable.$inferSelect;

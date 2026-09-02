CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"session_id" text,
	"listing_id" integer,
	"dealer_id" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "buyer_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar,
	"listing_id" integer,
	"dealer_id" integer,
	"listing_snapshot" jsonb DEFAULT '{}'::jsonb,
	"buyer_profile" jsonb DEFAULT '{}'::jsonb,
	"conversation" jsonb DEFAULT '[]'::jsonb,
	"contact_name" varchar,
	"contact_email" varchar,
	"contact_phone" varchar,
	"message" text,
	"lead_source" varchar DEFAULT 'contact_dealer' NOT NULL,
	"status" varchar DEFAULT 'new' NOT NULL,
	"notes" text,
	"crm_sync_status" varchar,
	"sms_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "campgrounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar(1000),
	"state" varchar(2) NOT NULL,
	"city" varchar NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"hookup_type" varchar NOT NULL,
	"max_rv_length" integer,
	"total_sites" integer,
	"nightly_rate_min" real,
	"nightly_rate_max" real,
	"booking_url" varchar(500),
	"amenities" jsonb DEFAULT '[]'::jsonb,
	"campground_type" varchar NOT NULL,
	"image_url" varchar(500),
	"phone" varchar(30),
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "contact_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"subject" varchar NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "dealer_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"dealer_id" integer NOT NULL,
	"listing_id" integer NOT NULL,
	"body" varchar NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "dealers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"phone" text,
	"rating" real DEFAULT 4 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"avg_response_time" text DEFAULT '< 2 hours' NOT NULL,
	"beginner_friendly" boolean DEFAULT false NOT NULL,
	"years_in_business" integer DEFAULT 5 NOT NULL,
	"total_listings" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "dealers_domain_unique" UNIQUE("domain")
);

CREATE TABLE "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"source_ip" text,
	"dealers_inserted" integer DEFAULT 0 NOT NULL,
	"dealers_updated" integer DEFAULT 0 NOT NULL,
	"listings_inserted" integer DEFAULT 0 NOT NULL,
	"listings_updated" integer DEFAULT 0 NOT NULL,
	"listings_skipped" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text
);

CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"type" text NOT NULL,
	"price" real NOT NULL,
	"market_value" real NOT NULL,
	"deal_score" text DEFAULT 'fair_deal' NOT NULL,
	"deal_savings" real DEFAULT 0,
	"mileage" integer,
	"length" real,
	"slides" integer DEFAULT 0,
	"sleeps" integer DEFAULT 2 NOT NULL,
	"location" text NOT NULL,
	"state" text NOT NULL,
	"dealer_name" text NOT NULL,
	"dealer_id" integer NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"days_on_market" integer DEFAULT 0 NOT NULL,
	"condition" text DEFAULT 'used' NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"vin" text,
	"description" text,
	"features" jsonb DEFAULT '[]'::jsonb,
	"width_ft" real,
	"height_ft" real,
	"dry_weight" real,
	"gvwr" real,
	"hitch_weight" real,
	"fresh_water" real,
	"grey_water" real,
	"black_water" real,
	"generator" boolean DEFAULT false,
	"solar" boolean DEFAULT false,
	"awning" boolean DEFAULT true,
	"outdoor_kitchen" boolean DEFAULT false,
	"washer_dryer" boolean DEFAULT false,
	"price_history" jsonb DEFAULT '[]'::jsonb,
	"solar_ready" boolean,
	"solar_installed" boolean,
	"bed_size" text,
	"has_fireplace" boolean,
	"pet_friendly" boolean,
	"rear_bedroom" boolean,
	"rear_living" boolean,
	"front_kitchen" boolean,
	"theater_seating" boolean,
	"island_kitchen" boolean,
	"walk_around_bed" boolean,
	"outdoor_shower" boolean,
	"outdoor_speakers" boolean,
	"backup_camera" boolean,
	"hydraulic_jacks" boolean,
	"power_awning" boolean,
	"enclosed_underbelly" boolean,
	"heated_tanks" boolean,
	"four_season" boolean,
	"hitch_type" text,
	"boondocking_score" integer,
	"enrichment_version" integer DEFAULT 0,
	"enriched_at" timestamp,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "match_report_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar NOT NULL,
	"report_id" varchar,
	"quiz" jsonb DEFAULT '{}'::jsonb,
	"source" varchar DEFAULT 'match_report' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "price_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"listing_id" integer,
	"rv_type" varchar,
	"target_price" real NOT NULL,
	"triggered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "saved_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"listing_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_saved_listing" UNIQUE("user_id","listing_id")
);

CREATE TABLE "saved_searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "scraper_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer,
	"dealer_name" text,
	"dealer_email" text,
	"buyer_name" text,
	"buyer_email" text,
	"buyer_phone" text,
	"message" text,
	"listing_title" text,
	"listing_url" text,
	"crm_sync_status" varchar(50),
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "sell_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar,
	"year" integer NOT NULL,
	"make" varchar NOT NULL,
	"model" varchar NOT NULL,
	"type" varchar NOT NULL,
	"condition" varchar NOT NULL,
	"asking_price" real,
	"description" text,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);

CREATE TABLE "trip_stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"campground_id" integer NOT NULL,
	"stop_order" integer DEFAULT 0 NOT NULL,
	"arrival_date" varchar(10),
	"departure_date" varchar(10),
	"nights" integer,
	"notes" varchar(1000),
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"start_date" varchar(10),
	"end_date" varchar(10),
	"notes" varchar(2000),
	"status" varchar DEFAULT 'planning' NOT NULL,
	"share_token" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"driveway_length_ft" integer,
	"driveway_width_ft" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

ALTER TABLE "dealer_messages" ADD CONSTRAINT "dealer_messages_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dealer_messages" ADD CONSTRAINT "dealer_messages_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_analytics_event_type" ON "analytics_events" USING btree ("event_type");
CREATE INDEX "idx_analytics_created_at" ON "analytics_events" USING btree ("created_at");
CREATE INDEX "idx_analytics_dealer_id" ON "analytics_events" USING btree ("dealer_id");
CREATE INDEX "idx_analytics_listing_id" ON "analytics_events" USING btree ("listing_id");
CREATE INDEX "idx_buyer_leads_status" ON "buyer_leads" USING btree ("status");
CREATE INDEX "idx_buyer_leads_dealer" ON "buyer_leads" USING btree ("dealer_id");
CREATE INDEX "idx_buyer_leads_created" ON "buyer_leads" USING btree ("created_at");
CREATE INDEX "idx_campgrounds_state" ON "campgrounds" USING btree ("state");
CREATE INDEX "idx_campgrounds_hookup" ON "campgrounds" USING btree ("hookup_type");
CREATE INDEX "idx_dealer_messages_user" ON "dealer_messages" USING btree ("user_id");
CREATE INDEX "idx_dealer_messages_dealer" ON "dealer_messages" USING btree ("dealer_id");
CREATE INDEX "idx_match_report_leads_email" ON "match_report_leads" USING btree ("email");
CREATE INDEX "idx_match_report_leads_created" ON "match_report_leads" USING btree ("created_at");
CREATE INDEX "idx_price_alerts_user" ON "price_alerts" USING btree ("user_id");
CREATE INDEX "idx_saved_user" ON "saved_listings" USING btree ("user_id");
CREATE INDEX "idx_saved_searches_user" ON "saved_searches" USING btree ("user_id");
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");
CREATE INDEX "idx_trip_stops_trip" ON "trip_stops" USING btree ("trip_id");
CREATE INDEX "idx_trips_user" ON "trips" USING btree ("user_id");
CREATE INDEX "idx_trips_share_token" ON "trips" USING btree ("share_token");

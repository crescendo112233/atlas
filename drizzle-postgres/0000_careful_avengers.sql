CREATE TABLE "app_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "footprint_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"footprint_id" integer NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "footprint_photos_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "footprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"boundary_geojson" text DEFAULT '' NOT NULL,
	"visited_at" text DEFAULT '' NOT NULL,
	"memory" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "footprint_photos" ADD CONSTRAINT "footprint_photos_footprint_id_footprints_id_fk" FOREIGN KEY ("footprint_id") REFERENCES "public"."footprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_footprint_photos_footprint_id" ON "footprint_photos" USING btree ("footprint_id");--> statement-breakpoint
CREATE INDEX "idx_footprints_visited_at" ON "footprints" USING btree ("visited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_footprints_city_country" ON "footprints" USING btree ("city","country");
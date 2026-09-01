import { doublePrecision, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const footprints = pgTable(
  "footprints",
  {
    id: serial("id").primaryKey(),
    city: text("city").notNull(),
    country: text("country").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    boundaryGeoJson: text("boundary_geojson").notNull().default(""),
    visitedAt: text("visited_at").notNull().default(""),
    memory: text("memory").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_footprints_visited_at").on(table.visitedAt),
    uniqueIndex("uq_footprints_city_country").on(table.city, table.country),
  ],
);

export const footprintPhotos = pgTable(
  "footprint_photos",
  {
    id: serial("id").primaryKey(),
    footprintId: integer("footprint_id").notNull().references(() => footprints.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_footprint_photos_footprint_id").on(table.footprintId)],
);

export const appMetadata = pgTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

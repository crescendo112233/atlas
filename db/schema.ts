import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const footprints = sqliteTable(
  "footprints",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    city: text("city").notNull(),
    country: text("country").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    visitedAt: text("visited_at").notNull(),
    memory: text("memory").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_footprints_visited_at").on(table.visitedAt)],
);

export const footprintPhotos = sqliteTable(
  "footprint_photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    footprintId: integer("footprint_id").notNull().references(() => footprints.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_footprint_photos_footprint_id").on(table.footprintId)],
);

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

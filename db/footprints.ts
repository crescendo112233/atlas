import { env } from "cloudflare:workers";

export type FootprintRow = {
  id: number;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  visitedAt: string;
  memory: string;
  createdAt: string;
};

function getD1() {
  if (!env.DB) throw new Error("足迹数据库暂时不可用");
  return env.DB;
}

export async function ensureFootprintsTable() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS footprints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      visited_at TEXT NOT NULL,
      memory TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_footprints_visited_at
      ON footprints(visited_at)`),
  ]);
}

export async function listFootprints() {
  const result = await getD1()
    .prepare(`SELECT
      id, city, country, latitude, longitude,
      visited_at AS visitedAt, memory, created_at AS createdAt
      FROM footprints
      ORDER BY visited_at DESC, id DESC`)
    .all<FootprintRow>();
  return result.results;
}

export async function createFootprint(input: Omit<FootprintRow, "id" | "createdAt">) {
  return getD1()
    .prepare(`INSERT INTO footprints
      (city, country, latitude, longitude, visited_at, memory)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, city, country, latitude, longitude,
      visited_at AS visitedAt, memory, created_at AS createdAt`)
    .bind(input.city, input.country, input.latitude, input.longitude, input.visitedAt, input.memory)
    .first<FootprintRow>();
}

export async function deleteFootprint(id: number) {
  return getD1().prepare("DELETE FROM footprints WHERE id = ?").bind(id).run();
}

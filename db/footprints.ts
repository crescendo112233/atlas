import { env } from "cloudflare:workers";

export type PhotoRow = {
  id: number;
  footprintId: number;
  objectKey: string;
  contentType: string;
  sortOrder: number;
};

export type FootprintRow = {
  id: number;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  boundary: { type: "Polygon" | "MultiPolygon"; coordinates: unknown } | null;
  visitedAt: string;
  createdAt: string;
  photos: Array<{ id: number; url: string; contentType: string; sortOrder: number }>;
};

type StoredFootprintRow = Omit<FootprintRow, "boundary" | "photos"> & { boundaryGeoJson: string };

const SEED_PLACES = [
  ["新加坡", "新加坡", 1.3521, 103.8198],
  ["重庆", "中国", 29.563, 106.5516],
  ["成都", "中国", 30.5728, 104.0668],
  ["曼谷", "泰国", 13.7563, 100.5018],
  ["函馆", "日本", 41.7687, 140.7288],
  ["小樽", "日本", 43.1907, 140.9947],
  ["札幌", "日本", 43.0618, 141.3545],
] as const;

function getD1() {
  if (!env.DB) throw new Error("地点数据库暂时不可用");
  return env.DB;
}

function getMedia() {
  const media = (env as typeof env & { MEDIA?: R2Bucket }).MEDIA;
  if (!media) throw new Error("照片存储暂时不可用");
  return media;
}

function parseBoundary(value: string) {
  if (!value) return null;
  try {
    const geometry = JSON.parse(value) as { type?: string; coordinates?: unknown };
    return geometry.type === "Polygon" || geometry.type === "MultiPolygon"
      ? geometry as { type: "Polygon" | "MultiPolygon"; coordinates: unknown }
      : null;
  } catch {
    return null;
  }
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
      boundary_geojson TEXT NOT NULL DEFAULT '',
      visited_at TEXT NOT NULL,
      memory TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_footprints_visited_at ON footprints(visited_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS footprint_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      footprint_id INTEGER NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
      object_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_footprint_photos_footprint_id ON footprint_photos(footprint_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`),
  ]);
  const footprintColumns = await db.prepare("PRAGMA table_info(footprints)").all<{ name: string }>();
  if (!footprintColumns.results.some((column) => column.name === "boundary_geojson")) {
    await db.prepare("ALTER TABLE footprints ADD COLUMN boundary_geojson TEXT NOT NULL DEFAULT ''").run();
  }
  const seedState = await db.prepare("SELECT value FROM app_metadata WHERE key = ?")
    .bind("initial_seed_completed").first<{ value: string }>();
  if (!seedState) {
    await db.batch([
      ...SEED_PLACES.map(([city, country, latitude, longitude]) => db.prepare(`
        INSERT INTO footprints (city, country, latitude, longitude, visited_at, memory)
        SELECT ?, ?, ?, ?, '', ''
        WHERE NOT EXISTS (SELECT 1 FROM footprints WHERE city = ? AND country = ?)
      `).bind(city, country, latitude, longitude, city, country)),
      db.prepare("INSERT INTO app_metadata (key, value) VALUES (?, ?)")
        .bind("initial_seed_completed", new Date().toISOString()),
    ]);
  }
}

export async function listFootprints(): Promise<FootprintRow[]> {
  const db = getD1();
  const footprints = await db.prepare(`SELECT
    id, city, country, latitude, longitude,
    boundary_geojson AS boundaryGeoJson,
    visited_at AS visitedAt, created_at AS createdAt
    FROM footprints
    ORDER BY CASE WHEN visited_at = '' THEN 1 ELSE 0 END, visited_at DESC, id ASC
  `).all<StoredFootprintRow>();
  const photos = await db.prepare(`SELECT id, footprint_id AS footprintId, object_key AS objectKey,
    content_type AS contentType, sort_order AS sortOrder
    FROM footprint_photos ORDER BY footprint_id, sort_order, id
  `).all<PhotoRow>();
  const grouped = new Map<number, FootprintRow["photos"]>();
  for (const photo of photos.results) {
    const list = grouped.get(photo.footprintId) ?? [];
    list.push({ id: photo.id, url: `/api/photos/${photo.id}`, contentType: photo.contentType, sortOrder: photo.sortOrder });
    grouped.set(photo.footprintId, list);
  }
  return footprints.results.map(({ boundaryGeoJson, ...item }) => ({
    ...item,
    boundary: parseBoundary(boundaryGeoJson),
    photos: grouped.get(item.id) ?? [],
  }));
}

export async function findFootprintLocation(city: string) {
  return getD1().prepare(`SELECT city, country, latitude, longitude,
    boundary_geojson AS boundaryGeoJson
    FROM footprints WHERE lower(city) = lower(?) ORDER BY id LIMIT 1
  `).bind(city).first<Pick<StoredFootprintRow, "city" | "country" | "latitude" | "longitude" | "boundaryGeoJson">>();
}

export async function createFootprint(input: {
  city: string; country: string; latitude: number; longitude: number; boundaryGeoJson: string; visitedAt: string;
}) {
  const db = getD1();
  const existing = await db.prepare(`SELECT id, city, country, latitude, longitude,
    boundary_geojson AS boundaryGeoJson,
    visited_at AS visitedAt, created_at AS createdAt
    FROM footprints WHERE city = ? AND country = ? ORDER BY id LIMIT 1
  `).bind(input.city, input.country).first<StoredFootprintRow>();
  if (existing) {
    const nextVisitedAt = input.visitedAt || existing.visitedAt;
    await db.prepare(`UPDATE footprints SET latitude = ?, longitude = ?, boundary_geojson = ?, visited_at = ? WHERE id = ?`)
      .bind(input.latitude, input.longitude, input.boundaryGeoJson, nextVisitedAt, existing.id).run();
    existing.latitude = input.latitude;
    existing.longitude = input.longitude;
    existing.boundaryGeoJson = input.boundaryGeoJson;
    existing.visitedAt = nextVisitedAt;
    return { footprint: existing, created: false };
  }
  const footprint = await db.prepare(`INSERT INTO footprints
    (city, country, latitude, longitude, boundary_geojson, visited_at, memory)
    VALUES (?, ?, ?, ?, ?, ?, '')
    RETURNING id, city, country, latitude, longitude,
    boundary_geojson AS boundaryGeoJson,
    visited_at AS visitedAt, created_at AS createdAt
  `).bind(input.city, input.country, input.latitude, input.longitude, input.boundaryGeoJson, input.visitedAt).first<StoredFootprintRow>();
  return { footprint, created: true };
}

export async function storeFootprintPhotos(footprintId: number, files: File[]) {
  if (!files.length) return;
  const db = getD1();
  const media = getMedia();
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM footprint_photos WHERE footprint_id = ?")
    .bind(footprintId).first<{ count: number }>();
  const startIndex = existing?.count ?? 0;
  const uploaded: string[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
      const objectKey = `footprints/${footprintId}/${crypto.randomUUID()}.${extension}`;
      await media.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
      uploaded.push(objectKey);
      await db.prepare(`INSERT INTO footprint_photos
        (footprint_id, object_key, content_type, sort_order) VALUES (?, ?, ?, ?)
      `).bind(footprintId, objectKey, file.type, startIndex + index).run();
    }
  } catch (error) {
    if (uploaded.length) await media.delete(uploaded);
    for (const objectKey of uploaded) {
      await db.prepare("DELETE FROM footprint_photos WHERE object_key = ?").bind(objectKey).run();
    }
    throw error;
  }
}

export async function countFootprintPhotos(footprintId: number) {
  const result = await getD1().prepare("SELECT COUNT(*) AS count FROM footprint_photos WHERE footprint_id = ?")
    .bind(footprintId).first<{ count: number }>();
  return result?.count ?? 0;
}

export async function getPhoto(id: number) {
  const photo = await getD1().prepare(`SELECT id, footprint_id AS footprintId, object_key AS objectKey,
    content_type AS contentType, sort_order AS sortOrder FROM footprint_photos WHERE id = ?
  `).bind(id).first<PhotoRow>();
  if (!photo) return null;
  const object = await getMedia().get(photo.objectKey);
  return object ? { photo, object } : null;
}

export async function deletePhoto(id: number) {
  const db = getD1();
  const photo = await db.prepare(`SELECT id, footprint_id AS footprintId, object_key AS objectKey,
    content_type AS contentType, sort_order AS sortOrder FROM footprint_photos WHERE id = ?
  `).bind(id).first<PhotoRow>();
  if (!photo) return false;
  await getMedia().delete(photo.objectKey);
  await db.prepare("DELETE FROM footprint_photos WHERE id = ?").bind(id).run();
  return true;
}

export async function deleteFootprint(id: number) {
  const db = getD1();
  const photos = await db.prepare("SELECT object_key AS objectKey FROM footprint_photos WHERE footprint_id = ?")
    .bind(id).all<{ objectKey: string }>();
  if (photos.results.length) await getMedia().delete(photos.results.map((item) => item.objectKey));
  await db.prepare("DELETE FROM footprint_photos WHERE footprint_id = ?").bind(id).run();
  return db.prepare("DELETE FROM footprints WHERE id = ?").bind(id).run();
}

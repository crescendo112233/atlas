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
  visitedAt: string;
  createdAt: string;
  photos: Array<{ id: number; url: string; contentType: string; sortOrder: number }>;
};

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
  ]);
  await db.batch(SEED_PLACES.map(([city, country, latitude, longitude]) => db.prepare(`
    INSERT INTO footprints (city, country, latitude, longitude, visited_at, memory)
    SELECT ?, ?, ?, ?, '', ''
    WHERE NOT EXISTS (SELECT 1 FROM footprints WHERE city = ? AND country = ?)
  `).bind(city, country, latitude, longitude, city, country)));
}

export async function listFootprints(): Promise<FootprintRow[]> {
  const db = getD1();
  const footprints = await db.prepare(`SELECT
    id, city, country, latitude, longitude,
    visited_at AS visitedAt, created_at AS createdAt
    FROM footprints
    ORDER BY CASE WHEN visited_at = '' THEN 1 ELSE 0 END, visited_at DESC, id ASC
  `).all<Omit<FootprintRow, "photos">>();
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
  return footprints.results.map((item) => ({ ...item, photos: grouped.get(item.id) ?? [] }));
}

export async function createFootprint(input: {
  city: string; country: string; latitude: number; longitude: number; visitedAt: string;
}) {
  const db = getD1();
  const existing = await db.prepare(`SELECT id, city, country, latitude, longitude,
    visited_at AS visitedAt, created_at AS createdAt
    FROM footprints WHERE city = ? AND country = ? ORDER BY id LIMIT 1
  `).bind(input.city, input.country).first<Omit<FootprintRow, "photos">>();
  if (existing) {
    if (input.visitedAt && input.visitedAt !== existing.visitedAt) {
      await db.prepare("UPDATE footprints SET visited_at = ? WHERE id = ?").bind(input.visitedAt, existing.id).run();
      existing.visitedAt = input.visitedAt;
    }
    return { footprint: existing, created: false };
  }
  const footprint = await db.prepare(`INSERT INTO footprints
    (city, country, latitude, longitude, visited_at, memory)
    VALUES (?, ?, ?, ?, ?, '')
    RETURNING id, city, country, latitude, longitude,
    visited_at AS visitedAt, created_at AS createdAt
  `).bind(input.city, input.country, input.latitude, input.longitude, input.visitedAt).first<Omit<FootprintRow, "photos">>();
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

export async function deleteFootprint(id: number) {
  const db = getD1();
  const photos = await db.prepare("SELECT object_key AS objectKey FROM footprint_photos WHERE footprint_id = ?")
    .bind(id).all<{ objectKey: string }>();
  if (photos.results.length) await getMedia().delete(photos.results.map((item) => item.objectKey));
  await db.prepare("DELETE FROM footprint_photos WHERE footprint_id = ?").bind(id).run();
  return db.prepare("DELETE FROM footprints WHERE id = ?").bind(id).run();
}

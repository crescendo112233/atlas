import OSS from "ali-oss";
import Credential, { Config } from "@alicloud/credentials";
import { getSql } from "./index";

const CredentialClient = (
  (Credential as unknown as { default?: typeof Credential }).default ?? Credential
);

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

type StoredFootprintRow = Omit<FootprintRow, "boundary" | "photos" | "createdAt"> & {
  boundaryGeoJson: string;
  createdAt: Date | string;
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

const ecsCredential = process.env.ALIBABA_CLOUD_ECS_ROLE_NAME
  ? new CredentialClient(new Config({
      type: "ecs_ram_role",
      roleName: process.env.ALIBABA_CLOUD_ECS_ROLE_NAME,
      disableIMDSv1: true,
    }))
  : null;

async function mediaClient() {
  const region = required("OSS_REGION");
  const bucket = required("OSS_BUCKET");
  const temporary = ecsCredential ? await ecsCredential.getCredential() : null;
  const accessKeyId = temporary?.accessKeyId ?? required("ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret = temporary?.accessKeySecret ?? required("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  return new OSS({
    region,
    bucket,
    accessKeyId,
    accessKeySecret,
    stsToken: temporary?.securityToken ?? process.env.ALIBABA_CLOUD_SECURITY_TOKEN,
    secure: true,
    authorizationV4: true,
  });
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
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

function formatFootprint(row: StoredFootprintRow, photos: FootprintRow["photos"] = []): FootprintRow {
  return {
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    boundary: parseBoundary(row.boundaryGeoJson),
    photos,
  };
}

export async function ensureFootprintsTable() {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS footprints (
    id SERIAL PRIMARY KEY,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    boundary_geojson TEXT NOT NULL DEFAULT '',
    visited_at TEXT NOT NULL DEFAULT '',
    memory TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_footprints_visited_at ON footprints(visited_at)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_footprints_city_country ON footprints(city, country)`;
  await sql`CREATE TABLE IF NOT EXISTS footprint_photos (
    id SERIAL PRIMARY KEY,
    footprint_id INTEGER NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_footprint_photos_footprint_id ON footprint_photos(footprint_id)`;
  await sql`CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;

  const [seedState] = await sql<{ value: string }[]>`SELECT value FROM app_metadata WHERE key = 'initial_seed_completed'`;
  if (!seedState) {
    await sql.begin(async (transaction) => {
      for (const [city, country, latitude, longitude] of SEED_PLACES) {
        await transaction`INSERT INTO footprints (city, country, latitude, longitude)
          VALUES (${city}, ${country}, ${latitude}, ${longitude})
          ON CONFLICT (city, country) DO NOTHING`;
      }
      await transaction`INSERT INTO app_metadata (key, value)
        VALUES ('initial_seed_completed', ${new Date().toISOString()})
        ON CONFLICT (key) DO NOTHING`;
    });
  }
}

export async function listFootprints(): Promise<FootprintRow[]> {
  const sql = getSql();
  const footprints = await sql<StoredFootprintRow[]>`SELECT
    id, city, country, latitude, longitude,
    boundary_geojson AS "boundaryGeoJson",
    visited_at AS "visitedAt", created_at AS "createdAt"
    FROM footprints
    ORDER BY CASE WHEN visited_at = '' THEN 1 ELSE 0 END, visited_at DESC, id ASC`;
  const photos = await sql<PhotoRow[]>`SELECT id, footprint_id AS "footprintId", object_key AS "objectKey",
    content_type AS "contentType", sort_order AS "sortOrder"
    FROM footprint_photos ORDER BY footprint_id, sort_order, id`;
  const grouped = new Map<number, FootprintRow["photos"]>();
  for (const photo of photos) {
    const list = grouped.get(photo.footprintId) ?? [];
    list.push({ id: photo.id, url: `/api/photos/${photo.id}`, contentType: photo.contentType, sortOrder: photo.sortOrder });
    grouped.set(photo.footprintId, list);
  }
  return footprints.map((item) => formatFootprint(item, grouped.get(item.id) ?? []));
}

export async function findFootprintLocation(city: string) {
  const [row] = await getSql()<StoredFootprintRow[]>`SELECT city, country, latitude, longitude,
    boundary_geojson AS "boundaryGeoJson", visited_at AS "visitedAt", created_at AS "createdAt", id
    FROM footprints WHERE lower(city) = lower(${city}) ORDER BY id LIMIT 1`;
  return row;
}

export async function createFootprint(input: {
  city: string; country: string; latitude: number; longitude: number; boundaryGeoJson: string; visitedAt: string;
}) {
  const sql = getSql();
  const [existing] = await sql<StoredFootprintRow[]>`SELECT id, city, country, latitude, longitude,
    boundary_geojson AS "boundaryGeoJson", visited_at AS "visitedAt", created_at AS "createdAt"
    FROM footprints WHERE city = ${input.city} AND country = ${input.country} ORDER BY id LIMIT 1`;
  if (existing) {
    const nextVisitedAt = input.visitedAt || existing.visitedAt;
    const [updated] = await sql<StoredFootprintRow[]>`UPDATE footprints SET
      latitude = ${input.latitude}, longitude = ${input.longitude},
      boundary_geojson = ${input.boundaryGeoJson}, visited_at = ${nextVisitedAt}
      WHERE id = ${existing.id}
      RETURNING id, city, country, latitude, longitude, boundary_geojson AS "boundaryGeoJson",
      visited_at AS "visitedAt", created_at AS "createdAt"`;
    return { footprint: updated, created: false };
  }
  const [footprint] = await sql<StoredFootprintRow[]>`INSERT INTO footprints
    (city, country, latitude, longitude, boundary_geojson, visited_at)
    VALUES (${input.city}, ${input.country}, ${input.latitude}, ${input.longitude}, ${input.boundaryGeoJson}, ${input.visitedAt})
    RETURNING id, city, country, latitude, longitude, boundary_geojson AS "boundaryGeoJson",
    visited_at AS "visitedAt", created_at AS "createdAt"`;
  return { footprint, created: true };
}

export async function storeFootprintPhotos(footprintId: number, files: File[]) {
  if (!files.length) return;
  const sql = getSql();
  const media = await mediaClient();
  const [{ count }] = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM footprint_photos WHERE footprint_id = ${footprintId}`;
  const uploaded: string[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
      const objectKey = `footprints/${footprintId}/${crypto.randomUUID()}.${extension}`;
      await media.put(objectKey, Buffer.from(await file.arrayBuffer()), { headers: { "Content-Type": file.type } });
      uploaded.push(objectKey);
      await sql`INSERT INTO footprint_photos (footprint_id, object_key, content_type, sort_order)
        VALUES (${footprintId}, ${objectKey}, ${file.type}, ${count + index})`;
    }
  } catch (error) {
    await Promise.allSettled(uploaded.map((objectKey) => media.delete(objectKey)));
    if (uploaded.length) await sql`DELETE FROM footprint_photos WHERE object_key = ANY(${uploaded})`;
    throw error;
  }
}

export async function countFootprintPhotos(footprintId: number) {
  const [result] = await getSql()<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM footprint_photos WHERE footprint_id = ${footprintId}`;
  return result?.count ?? 0;
}

export async function getPhoto(id: number) {
  const [photo] = await getSql()<PhotoRow[]>`SELECT id, footprint_id AS "footprintId", object_key AS "objectKey",
    content_type AS "contentType", sort_order AS "sortOrder" FROM footprint_photos WHERE id = ${id}`;
  if (!photo) return null;
  try {
    const object = await (await mediaClient()).get(photo.objectKey);
    const headers = object.res.headers as Record<string, unknown>;
    return { photo, body: object.content, etag: String(headers.etag ?? "") };
  } catch (error) {
    if (typeof error === "object" && error && "status" in error && error.status === 404) return null;
    throw error;
  }
}

export async function deletePhoto(id: number) {
  const sql = getSql();
  const [photo] = await sql<PhotoRow[]>`SELECT id, footprint_id AS "footprintId", object_key AS "objectKey",
    content_type AS "contentType", sort_order AS "sortOrder" FROM footprint_photos WHERE id = ${id}`;
  if (!photo) return false;
  await (await mediaClient()).delete(photo.objectKey);
  await sql`DELETE FROM footprint_photos WHERE id = ${id}`;
  return true;
}

export async function deleteFootprint(id: number) {
  const sql = getSql();
  const photos = await sql<{ objectKey: string }[]>`SELECT object_key AS "objectKey" FROM footprint_photos WHERE footprint_id = ${id}`;
  const media = await mediaClient();
  await Promise.allSettled(photos.map((item) => media.delete(item.objectKey)));
  const deleted = await sql`DELETE FROM footprints WHERE id = ${id} RETURNING id`;
  return deleted.length > 0;
}

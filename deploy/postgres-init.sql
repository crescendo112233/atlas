CREATE TABLE IF NOT EXISTS footprints (
  id SERIAL PRIMARY KEY,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  boundary_geojson TEXT NOT NULL DEFAULT '',
  visited_at TEXT NOT NULL DEFAULT '',
  memory TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_footprints_visited_at ON footprints(visited_at);
-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_footprints_city_country ON footprints(city, country);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS footprint_photos (
  id SERIAL PRIMARY KEY,
  footprint_id INTEGER NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_footprint_photos_footprint_id ON footprint_photos(footprint_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- statement-breakpoint
INSERT INTO footprints (city, country, latitude, longitude) VALUES
  ('新加坡', '新加坡', 1.3521, 103.8198),
  ('重庆', '中国', 29.563, 106.5516),
  ('成都', '中国', 30.5728, 104.0668),
  ('曼谷', '泰国', 13.7563, 100.5018),
  ('函馆', '日本', 41.7687, 140.7288),
  ('小樽', '日本', 43.1907, 140.9947),
  ('札幌', '日本', 43.0618, 141.3545)
ON CONFLICT (city, country) DO NOTHING;
-- statement-breakpoint
INSERT INTO app_metadata (key, value)
VALUES ('initial_seed_completed', CURRENT_TIMESTAMP::text)
ON CONFLICT (key) DO NOTHING;

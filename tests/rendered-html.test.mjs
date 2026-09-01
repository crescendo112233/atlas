import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the finished atlas experience during the Alibaba Cloud migration", async () => {
  const [layout, component, styles] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GlobeDiary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /TOOP & PP'S ATLAS/);
  assert.match(layout, /process\.env\.APP_ORIGIN/);
  assert.match(component, /ADD PLACE \/ PHOTOS/);
  assert.match(component, /world-countries\.geojson/);
  assert.match(component, /CITY SELECTED/);
  assert.match(component, /mapBoundarySegments/);
  assert.match(component, /new THREE\.LineSegments/);
  assert.match(component, /globeTransitioning/);
  assert.match(component, /ZOOM/);
  assert.match(component, /HIDE SIDEBAR/);
  assert.match(component, /ADD MORE PHOTOS/);
  assert.match(component, /DELETE CITY/);
  assert.match(styles, /globe-resize-transition/);
});

test("uses PostgreSQL, Alibaba OSS, and a production container", async () => {
  const [database, storage, route, packageJson, dockerfile, compose, migration, envExample] = await Promise.all([
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/footprints.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/footprints/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../compose.yaml", import.meta.url), "utf8"),
    readFile(new URL("../deploy/postgres-init.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(database, /drizzle-orm\/postgres-js/);
  assert.match(database, /DB_HOST/);
  assert.doesNotMatch(database + storage, /cloudflare:workers|R2Bucket|D1Database/);
  assert.match(storage, /from "ali-oss"/);
  assert.match(storage, /ecs_ram_role/);
  assert.match(storage, /authorizationV4: true/);
  assert.match(route, /polygon_geojson/);
  assert.match(route, /process\.env\.APP_ORIGIN/);
  assert.equal(JSON.parse(packageJson).scripts.build, "next build");
  assert.match(dockerfile, /\.next\/standalone/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS footprints/);
  assert.match(envExample, /ALIBABA_CLOUD_ECS_ROLE_NAME/);
});

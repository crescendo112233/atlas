import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the restrained globe workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>MAKE LOVE ATLAS<\/title>/);
  assert.match(html, /MAKE LOVE ATLAS/);
  assert.doesNotMatch(html, /PRIVATE ATLAS|<h1>我们的地球<\/h1>/);
  assert.match(html, /添加地点 \/ 照片/);
  assert.doesNotMatch(html, /悄悄话|粉色泡泡/);
});

test("ships the cartographic globe, automatic city boundary, and photo-storage configuration", async () => {
  const [component, route, migration, hosting, boundaries, countries] = await Promise.all([
    readFile(new URL("../app/GlobeDiary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/footprints/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_curly_changeling.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../public/visited-boundaries.json", import.meta.url), "utf8"),
    readFile(new URL("../public/world-countries.geojson", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(component, /earth-blue-marble/);
  assert.match(component, /world-countries\.geojson/);
  assert.match(component, /紫色填充/);
  assert.match(component, /pinGeometry/);
  assert.match(component, /pointermove/);
  assert.match(component, /zoomToCursor = false/);
  assert.match(component, /controls\.rotateSpeed = THREE\.MathUtils\.lerp/);
  assert.match(component, /opacity: 0\.48/);
  assert.match(component, /城市名称/);
  assert.doesNotMatch(component, /国家或地区|纬度<input|经度<input/);
  assert.match(route, /polygon_geojson/);
  assert.match(migration, /boundary_geojson/);
  assert.match(component, /remainingPhotoSlots/);
  assert.match(component, /继续添加照片/);
  assert.match(component, /GlobeBackdrop/);
  assert.match(component, /atlas-fallback\.jpg/);
  assert.equal(JSON.parse(hosting).r2, "MEDIA");
  assert.equal(JSON.parse(boundaries).features.length, 7);
  assert.ok(JSON.parse(countries).features.length > 150);
});

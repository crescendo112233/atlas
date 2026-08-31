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
  assert.match(html, /<title>TOOP &amp; PP&#x27;S ATLAS<\/title>/);
  assert.match(html, /TOOP &amp; PP&#x27;S ATLAS/);
  assert.match(html, /ADD PLACE \/ PHOTOS/);
  assert.match(html, /tppp-logo\.png/);
  assert.match(html, /TppP logo/);
  assert.doesNotMatch(html, /[\u3400-\u9fff]/);
});

test("ships the cartographic globe, automatic city boundary, and photo-storage configuration", async () => {
  const [component, route, migration, hosting, boundaries, countries] = await Promise.all([
    readFile(new URL("../app/GlobeDiary.tsx", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../app/api/footprints/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/photos/[id]/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../db/footprints.ts", import.meta.url), "utf8"),
    ]).then((files) => files.join("\n")),
    readFile(new URL("../drizzle/0002_curly_changeling.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../public/visited-boundaries.json", import.meta.url), "utf8"),
    readFile(new URL("../public/world-countries.geojson", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(component, /earth-blue-marble/);
  assert.match(component, /world-countries\.geojson/);
  assert.match(component, /CITY SELECTED/);
  assert.match(component, /pinGeometry/);
  assert.match(component, /pointermove/);
  assert.match(component, /zoomToCursor = false/);
  assert.match(component, /controls\.rotateSpeed = THREE\.MathUtils\.lerp/);
  assert.match(component, /mapBoundarySegments/);
  assert.match(component, /new THREE\.LineSegments/);
  assert.match(component, /hardwareConcurrency/);
  assert.match(component, /powerPreference: "high-performance"/);
  assert.match(component, /1000 \/ 30/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /globeExpanded/);
  assert.doesNotMatch(component, /EXPAND GLOBE|ZOOM OUT/);
  assert.match(component, />ZOOM<\/b>/);
  assert.match(component, /HIDE SIDEBAR/);
  assert.match(component, /atlas-backdrop-frame/);
  assert.match(component, /aria-label=\{panelOpen \? "Hide sidebar"/);
  assert.match(component, /opacity: 0\.48/);
  assert.match(component, /City name/);
  assert.doesNotMatch(component, /Country or region|Latitude<input|Longitude<input/);
  assert.match(route, /polygon_geojson/);
  assert.match(migration, /boundary_geojson/);
  assert.match(component, /remainingPhotoSlots/);
  assert.match(component, /50 -/);
  assert.doesNotMatch(component, /globe-hint/);
  assert.match(component, /ADD MORE PHOTOS/);
  assert.match(component, /GlobeBackdrop/);
  assert.match(component, /atlas-fallback\.jpg/);
  assert.match(component, /isFallback/);
  assert.match(component, /panel-collapsed/);
  assert.match(component, /delete-photo-button/);
  assert.match(component, /DELETE CITY/);
  assert.match(component, /method: "DELETE"/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /deletePhoto/);
  assert.equal(JSON.parse(hosting).r2, "MEDIA");
  assert.equal(JSON.parse(boundaries).features.length, 7);
  assert.ok(JSON.parse(countries).features.length > 150);
});

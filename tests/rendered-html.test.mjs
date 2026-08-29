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
  assert.match(html, /<title>我们的地球<\/title>/);
  assert.match(html, /PRIVATE ATLAS/);
  assert.match(html, /添加地点 \/ 照片/);
  assert.doesNotMatch(html, /悄悄话|粉色泡泡/);
});

test("ships the satellite, boundary, and photo-storage configuration", async () => {
  const [component, hosting, boundaries] = await Promise.all([
    readFile(new URL("../app/GlobeDiary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../public/visited-boundaries.json", import.meta.url), "utf8"),
  ]);
  assert.match(component, /earth-blue-marble\.png/);
  assert.match(component, /最多五张/);
  assert.equal(JSON.parse(hosting).r2, "MEDIA");
  assert.equal(JSON.parse(boundaries).features.length, 7);
});

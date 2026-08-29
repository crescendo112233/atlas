import { ensureFootprintsTable, getPhoto } from "../../../../db/footprints";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = Number(new URL(request.url).pathname.split("/").pop());
  if (!Number.isInteger(id) || id < 1) return new Response("Not found", { status: 404 });
  await ensureFootprintsTable();
  const result = await getPhoto(id);
  if (!result) return new Response("Not found", { status: 404 });
  return new Response(result.object.body, {
    headers: {
      "Content-Type": result.photo.contentType,
      "Cache-Control": "private, max-age=3600",
      ETag: result.object.httpEtag,
    },
  });
}

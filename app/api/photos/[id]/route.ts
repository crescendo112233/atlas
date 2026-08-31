import { deletePhoto, ensureFootprintsTable, getPhoto } from "../../../../db/footprints";

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

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).pathname.split("/").pop());
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "无效的照片" }, { status: 400 });
  try {
    await ensureFootprintsTable();
    const deleted = await deletePhoto(id);
    return deleted
      ? Response.json({ ok: true })
      : Response.json({ error: "没有找到这张照片" }, { status: 404 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "照片删除失败，请稍后再试" }, { status: 500 });
  }
}

import {
  createFootprint,
  countFootprintPhotos,
  deleteFootprint,
  ensureFootprintsTable,
  listFootprints,
  storeFootprintPhotos,
} from "../../../db/footprints";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function errorResponse(error: unknown) {
  console.error(error);
  return Response.json({ error: "暂时没有保存成功，请稍后再试" }, { status: 500 });
}

export async function GET() {
  try {
    await ensureFootprintsTable();
    return Response.json(
      { footprints: await listFootprints() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const city = cleanText(body.get("city"), 60);
    const country = cleanText(body.get("country"), 60);
    const visitedAt = cleanText(body.get("visitedAt"), 10);
    const latitude = Number(body.get("latitude"));
    const longitude = Number(body.get("longitude"));
    const files = body.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);
    const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

    if (!city || !country || (visitedAt && !/^\d{4}-\d{2}-\d{2}$/.test(visitedAt))) {
      return Response.json({ error: "请填写有效的城市和国家" }, { status: 400 });
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return Response.json({ error: "请选择一个有效的地球位置" }, { status: 400 });
    }
    if (files.length > 5) return Response.json({ error: "每个地点最多上传五张照片" }, { status: 400 });
    if (files.some((file) => !supportedTypes.has(file.type) || file.size > 8 * 1024 * 1024)) {
      return Response.json({ error: "仅支持 JPG、PNG、WebP、AVIF，且每张不超过 8MB" }, { status: 400 });
    }

    await ensureFootprintsTable();
    const result = await createFootprint({ city, country, latitude, longitude, visitedAt });
    const footprint = result.footprint;
    if (!footprint) throw new Error("地点保存失败");
    const existingPhotoCount = await countFootprintPhotos(footprint.id);
    if (existingPhotoCount + files.length > 5) {
      if (result.created) await deleteFootprint(footprint.id);
      return Response.json({ error: `这个地点还能上传 ${5 - existingPhotoCount} 张照片` }, { status: 400 });
    }
    try {
      await storeFootprintPhotos(footprint.id, files);
    } catch (error) {
      if (result.created) await deleteFootprint(footprint.id);
      throw error;
    }
    return Response.json({ footprint: { ...footprint, photos: [] } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) {
      return Response.json({ error: "无效的足迹" }, { status: 400 });
    }
    await ensureFootprintsTable();
    await deleteFootprint(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

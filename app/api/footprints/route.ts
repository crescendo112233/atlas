import {
  createFootprint,
  deleteFootprint,
  ensureFootprintsTable,
  listFootprints,
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
    const body = (await request.json()) as Record<string, unknown>;
    const city = cleanText(body.city, 60);
    const country = cleanText(body.country, 60);
    const memory = cleanText(body.memory, 280);
    const visitedAt = cleanText(body.visitedAt, 10);
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (!city || !country || !/^\d{4}-\d{2}-\d{2}$/.test(visitedAt)) {
      return Response.json({ error: "请把城市、国家和日期填写完整" }, { status: 400 });
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return Response.json({ error: "请选择一个有效的地球位置" }, { status: 400 });
    }

    await ensureFootprintsTable();
    const footprint = await createFootprint({ city, country, latitude, longitude, visitedAt, memory });
    return Response.json({ footprint }, { status: 201 });
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

import {
  createFootprint,
  countFootprintPhotos,
  deleteFootprint,
  ensureFootprintsTable,
  findFootprintLocation,
  listFootprints,
  storeFootprintPhotos,
} from "../../../db/footprints";

export const dynamic = "force-dynamic";

const CITY_SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search";

type CitySearchResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: { country?: string };
  geojson?: { type?: string; coordinates?: unknown };
};

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function errorResponse(error: unknown) {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: "Could not save your changes. Please try again." }, { status: 500 });
}

async function resolveCity(city: string) {
  const url = new URL(CITY_SEARCH_ENDPOINT);
  url.searchParams.set("q", city);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("polygon_threshold", "0.0008");
  url.searchParams.set("limit", "6");
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://our-planet-diary-sz-sg.quzheping112233.chatgpt.site/",
        "User-Agent": "OurPlanetDiary/1.0 (+https://our-planet-diary-sz-sg.quzheping112233.chatgpt.site)",
      },
    });
  } catch {
    throw new RequestError("The city boundary service is temporarily unavailable. Please try again.", 503);
  }
  if (!response.ok) throw new RequestError("The city boundary service is temporarily unavailable. Please try again.", 503);
  const results = await response.json() as CitySearchResult[];
  const result = results.find((item) => item.geojson?.type === "Polygon" || item.geojson?.type === "MultiPolygon");
  if (!result?.geojson || (result.geojson.type !== "Polygon" && result.geojson.type !== "MultiPolygon")) {
    throw new RequestError("No administrative boundary was found. Try a more complete city name.", 404);
  }
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new RequestError("An accurate location could not be found for this city.", 404);
  }
  return {
    city,
    country: result.address?.country ?? result.display_name.split(",").at(-1)?.trim() ?? "Unknown region",
    latitude,
    longitude,
    boundaryGeoJson: JSON.stringify(result.geojson),
  };
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
    const visitedAt = cleanText(body.get("visitedAt"), 10);
    const files = body.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);
    const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

    if (!city || (visitedAt && !/^\d{4}-\d{2}-\d{2}$/.test(visitedAt))) {
      return Response.json({ error: "Enter a valid city name" }, { status: 400 });
    }
    if (files.length > 50) return Response.json({ error: "Each place can contain up to 50 photos" }, { status: 400 });
    if (files.some((file) => !supportedTypes.has(file.type) || file.size > 8 * 1024 * 1024)) {
      return Response.json({ error: "Use JPG, PNG, WebP or AVIF files up to 8 MB each" }, { status: 400 });
    }

    await ensureFootprintsTable();
    const cachedCity = await findFootprintLocation(city);
    const resolvedCity = cachedCity ?? await resolveCity(city);
    const result = await createFootprint({ ...resolvedCity, visitedAt });
    const footprint = result.footprint;
    if (!footprint) throw new Error("The place could not be saved");
    const existingPhotoCount = await countFootprintPhotos(footprint.id);
    if (existingPhotoCount + files.length > 50) {
      if (result.created) await deleteFootprint(footprint.id);
      return Response.json({ error: `You can add ${50 - existingPhotoCount} more photos here` }, { status: 400 });
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
      return Response.json({ error: "Invalid place" }, { status: 400 });
    }
    await ensureFootprintsTable();
    await deleteFootprint(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

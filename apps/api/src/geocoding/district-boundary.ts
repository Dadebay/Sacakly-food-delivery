const MAX_DELIVERY_ZONE_POINTS = 64;

export type GeocodedBoundaryPoint = {
  latitude: number;
  longitude: number;
};

export type DistrictBoundarySuggestion = {
  label: string;
  nameRu: string;
  nameTk: string;
  nameEn: string | null;
  boundary: GeocodedBoundaryPoint[] | null;
  provider: "NOMINATIM";
};

/**
 * Converts the deliberately small subset of Nominatim's reverse response that
 * the tariff editor needs. Provider payloads never escape this adapter.
 */
export function districtBoundarySuggestionFromNominatim(
  value: unknown,
  focus?: GeocodedBoundaryPoint,
): DistrictBoundarySuggestion | null {
  if (!isRecord(value)) return null;

  const address = isRecord(value.address) ? value.address : {};
  const names = isRecord(value.namedetails) ? value.namedetails : {};
  const genericName = firstString(
    value.name,
    names.name,
    address.city_district,
    address.district,
    address.suburb,
    address.neighbourhood,
    address.county,
  );
  const label = firstString(value.display_name, genericName);
  if (!label || !genericName) return null;

  return {
    label,
    nameRu: firstString(names["name:ru"], genericName)!,
    nameTk: firstString(names["name:tk"], genericName)!,
    nameEn: firstString(names["name:en"]),
    boundary: boundaryFromGeoJson(value.geojson, focus),
    provider: "NOMINATIM",
  };
}

function boundaryFromGeoJson(
  value: unknown,
  focus?: GeocodedBoundaryPoint,
): GeocodedBoundaryPoint[] | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const candidates: GeocodedBoundaryPoint[][] = [];

  if (
    value.type === "Polygon" &&
    Array.isArray(value.coordinates) &&
    value.coordinates.length === 1
  ) {
    const ring = readRing(value.coordinates[0]);
    if (ring) candidates.push(ring);
  }
  if (value.type === "MultiPolygon" && Array.isArray(value.coordinates)) {
    for (const polygon of value.coordinates) {
      if (!Array.isArray(polygon) || polygon.length !== 1) continue;
      const ring = readRing(polygon[0]);
      if (ring) candidates.push(ring);
    }
  }
  if (!candidates.length) return null;

  const selected =
    (focus ? candidates.find((ring) => pointInRing(focus, ring)) : null) ??
    candidates.toSorted((left, right) => ringArea(right) - ringArea(left))[0];
  if (!selected) return null;
  return reduceRing(selected, MAX_DELIVERY_ZONE_POINTS);
}

function readRing(value: unknown): GeocodedBoundaryPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.flatMap((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return [];
    const longitude = finiteCoordinate(coordinate[0], -180, 180);
    const latitude = finiteCoordinate(coordinate[1], -90, 90);
    if (latitude === null || longitude === null) return [];
    return [
      {
        latitude: Number(latitude.toFixed(7)),
        longitude: Number(longitude.toFixed(7)),
      },
    ];
  });
  if (points.length > 1 && samePoint(points[0]!, points.at(-1)!)) points.pop();

  const deduplicated = points.filter(
    (point, index) => index === 0 || !samePoint(point, points[index - 1]!),
  );
  return deduplicated.length >= 3 ? deduplicated : null;
}

function reduceRing(
  points: readonly GeocodedBoundaryPoint[],
  maximum: number,
): GeocodedBoundaryPoint[] {
  if (points.length <= maximum) return [...points];
  return Array.from({ length: maximum }, (_, index) => {
    const sourceIndex = Math.floor((index * points.length) / maximum);
    return points[sourceIndex]!;
  });
}

function pointInRing(
  point: GeocodedBoundaryPoint,
  ring: readonly GeocodedBoundaryPoint[],
) {
  let inside = false;
  for (
    let current = 0, previous = ring.length - 1;
    current < ring.length;
    previous = current++
  ) {
    const a = ring[current]!;
    const b = ring[previous]!;
    const crosses =
      a.latitude > point.latitude !== b.latitude > point.latitude &&
      point.longitude <
        ((b.longitude - a.longitude) * (point.latitude - a.latitude)) /
          (b.latitude - a.latitude) +
          a.longitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function ringArea(points: readonly GeocodedBoundaryPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area +=
      current.longitude * next.latitude - next.longitude * current.latitude;
  }
  return Math.abs(area / 2);
}

function samePoint(left: GeocodedBoundaryPoint, right: GeocodedBoundaryPoint) {
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

function finiteCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

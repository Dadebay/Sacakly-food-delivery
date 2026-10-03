import type {
  DeliveryEtrapWithWelayat,
  DeliveryWelayat,
  DeliveryZonePoint,
  DeliveryZoneSuggestion,
} from "@/src/entities/delivery";

const STARTER_ZONE_RADIUS_METERS = 800;
const METERS_PER_LATITUDE_DEGREE = 111_320;
const STARTER_ZONE_POINT_COUNT = 8;

function comparableName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[çÇ]/g, "c")
    .replace(/[ňŇ]/g, "n")
    .replace(/[şŞ]/g, "s")
    .replace(/[ýÝ]/g, "y")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function findWelayatForZoneSuggestion(
  welayats: readonly DeliveryWelayat[],
  suggestion: DeliveryZoneSuggestion,
) {
  const haystack = comparableName(
    [suggestion.label, suggestion.nameRu, suggestion.nameTk, suggestion.nameEn]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
  return [...welayats]
    .sort(
      (left, right) =>
        Math.max(right.nameRu.length, right.nameTk.length) -
        Math.max(left.nameRu.length, left.nameTk.length),
    )
    .find((welayat) =>
      [welayat.nameRu, welayat.nameTk, welayat.nameEn]
        .filter((value): value is string => Boolean(value))
        .some((name) => {
          const comparable = comparableName(name);
          return comparable.length >= 4 && haystack.includes(comparable);
        }),
    );
}

export function findExistingZoneForSuggestion(
  zones: readonly DeliveryEtrapWithWelayat[],
  suggestion: DeliveryZoneSuggestion,
  welayatId?: number,
) {
  const suggestedNames = new Set(
    [suggestion.nameRu, suggestion.nameTk, suggestion.nameEn]
      .filter((value): value is string => Boolean(value))
      .map(comparableName),
  );
  return zones.find(
    (zone) =>
      (welayatId === undefined || zone.welayatId === welayatId) &&
      [zone.nameRu, zone.nameTk, zone.nameEn]
        .filter((value): value is string => Boolean(value))
        .some((name) => suggestedNames.has(comparableName(name))),
  );
}

/**
 * Creates an editable draft only. It is deliberately never treated as an
 * authoritative map boundary and still requires an administrator to inspect,
 * reshape and save it.
 */
export function createStarterDeliveryZone(
  center: DeliveryZonePoint,
): DeliveryZonePoint[] {
  const latitudeDelta = STARTER_ZONE_RADIUS_METERS / METERS_PER_LATITUDE_DEGREE;
  const longitudeDelta =
    STARTER_ZONE_RADIUS_METERS /
    (METERS_PER_LATITUDE_DEGREE *
      Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01));

  return Array.from({ length: STARTER_ZONE_POINT_COUNT }, (_, index) => {
    const angle = (index / STARTER_ZONE_POINT_COUNT) * Math.PI * 2;
    return {
      latitude: Number(
        (center.latitude + Math.sin(angle) * latitudeDelta).toFixed(7),
      ),
      longitude: Number(
        (center.longitude + Math.cos(angle) * longitudeDelta).toFixed(7),
      ),
    };
  });
}

export function scaleDeliveryZone(
  points: readonly DeliveryZonePoint[],
  factor: number,
): DeliveryZonePoint[] {
  if (points.length < 3 || !Number.isFinite(factor) || factor <= 0) {
    return [...points];
  }
  const center = points.reduce(
    (sum, point) => ({
      latitude: sum.latitude + point.latitude / points.length,
      longitude: sum.longitude + point.longitude / points.length,
    }),
    { latitude: 0, longitude: 0 },
  );
  return points.map((point) => ({
    latitude: Number(
      (center.latitude + (point.latitude - center.latitude) * factor).toFixed(
        7,
      ),
    ),
    longitude: Number(
      (
        center.longitude +
        (point.longitude - center.longitude) * factor
      ).toFixed(7),
    ),
  }));
}

export function insertDeliveryZonePointAtNearestEdge(
  points: readonly DeliveryZonePoint[],
  point: DeliveryZonePoint,
): DeliveryZonePoint[] {
  if (points.length < 3) return [...points, point];

  const latitudeRadians = (point.latitude * Math.PI) / 180;
  const longitudeScale = Math.max(Math.cos(latitudeRadians), 0.01);
  const planar = (candidate: DeliveryZonePoint) => ({
    x: candidate.longitude * longitudeScale,
    y: candidate.latitude,
  });
  const target = planar(point);
  let nearestEdge = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const start = planar(points[index]!);
    const end = planar(points[(index + 1) % points.length]!);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((target.x - start.x) * dx + (target.y - start.y) * dy) /
                lengthSquared,
            ),
          );
    const projectedX = start.x + projection * dx;
    const projectedY = start.y + projection * dy;
    const distance =
      (target.x - projectedX) ** 2 + (target.y - projectedY) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestEdge = index;
    }
  }

  const afterEdge = points.slice(nearestEdge + 1);
  const throughEdge = points.slice(0, nearestEdge + 1);
  return [...afterEdge, ...throughEdge, point];
}

export function replaceDeliveryZonePoint(
  points: readonly DeliveryZonePoint[],
  index: number,
  point: DeliveryZonePoint,
) {
  return points.map((candidate, candidateIndex) =>
    candidateIndex === index ? point : candidate,
  );
}

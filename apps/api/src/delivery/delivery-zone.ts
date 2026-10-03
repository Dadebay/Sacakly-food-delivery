export type DeliveryZonePoint = {
  latitude: number;
  longitude: number;
};

export type DeliveryZoneCandidate = {
  id: number;
  deliveryZone: unknown;
};

const EPSILON = 1e-10;

function samePoint(left: DeliveryZonePoint, right: DeliveryZonePoint) {
  return (
    Math.abs(left.latitude - right.latitude) <= EPSILON &&
    Math.abs(left.longitude - right.longitude) <= EPSILON
  );
}

function orientation(
  a: DeliveryZonePoint,
  b: DeliveryZonePoint,
  c: DeliveryZonePoint,
) {
  return (
    (b.longitude - a.longitude) * (c.latitude - a.latitude) -
    (b.latitude - a.latitude) * (c.longitude - a.longitude)
  );
}

function pointOnSegment(
  point: DeliveryZonePoint,
  start: DeliveryZonePoint,
  end: DeliveryZonePoint,
) {
  if (Math.abs(orientation(start, end, point)) > EPSILON) return false;
  return (
    point.longitude >= Math.min(start.longitude, end.longitude) - EPSILON &&
    point.longitude <= Math.max(start.longitude, end.longitude) + EPSILON &&
    point.latitude >= Math.min(start.latitude, end.latitude) - EPSILON &&
    point.latitude <= Math.max(start.latitude, end.latitude) + EPSILON
  );
}

function segmentsIntersect(
  a: DeliveryZonePoint,
  b: DeliveryZonePoint,
  c: DeliveryZonePoint,
  d: DeliveryZonePoint,
  includeTouching: boolean,
) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  const proper =
    ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON));
  if (proper || !includeTouching) return proper;
  return (
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b) ||
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d)
  );
}

function polygonArea(points: readonly DeliveryZonePoint[]) {
  return Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return (
        sum + point.longitude * next.latitude - next.longitude * point.latitude
      );
    }, 0) / 2,
  );
}

export function deliveryZoneFromJson(
  value: unknown,
): DeliveryZonePoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const candidate = point as Record<string, unknown>;
    const latitude = candidate.latitude;
    const longitude = candidate.longitude;
    return typeof latitude === "number" && typeof longitude === "number"
      ? [{ latitude, longitude }]
      : [];
  });
  return points.length === value.length ? points : null;
}

export function normalizeDeliveryZone(
  value: readonly DeliveryZonePoint[],
): DeliveryZonePoint[] {
  const normalized = value.map(({ latitude, longitude }) => ({
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  }));
  if (
    normalized.length > 3 &&
    samePoint(normalized[0]!, normalized[normalized.length - 1]!)
  ) {
    normalized.pop();
  }
  return normalized;
}

export function deliveryZoneValidationError(
  value: readonly DeliveryZonePoint[],
): string | null {
  const points = normalizeDeliveryZone(value);
  if (points.length < 3) return "Delivery zone requires at least 3 points";
  if (points.length > 64) return "Delivery zone supports at most 64 points";
  if (
    points.some(
      ({ latitude, longitude }) =>
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180,
    )
  ) {
    return "Delivery zone contains invalid coordinates";
  }
  const unique = points.filter(
    (point, index) =>
      points.findIndex((candidate) => samePoint(candidate, point)) === index,
  );
  if (unique.length < 3) return "Delivery zone requires 3 unique points";
  if (unique.length !== points.length)
    return "Delivery zone must not contain duplicate points";
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (
        left === right ||
        leftNext === right ||
        rightNext === left ||
        (left === 0 && rightNext === 0)
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          points[left]!,
          points[leftNext]!,
          points[right]!,
          points[rightNext]!,
          true,
        )
      ) {
        return "Delivery zone boundary must not cross itself";
      }
    }
  }
  if (polygonArea(points) <= EPSILON)
    return "Delivery zone must cover a non-zero area";
  return null;
}

export function pointInDeliveryZone(
  point: DeliveryZonePoint,
  zone: readonly DeliveryZonePoint[],
  includeBoundary = true,
) {
  let inside = false;
  for (
    let index = 0, previous = zone.length - 1;
    index < zone.length;
    previous = index++
  ) {
    const currentPoint = zone[index]!;
    const previousPoint = zone[previous]!;
    if (pointOnSegment(point, previousPoint, currentPoint)) {
      return includeBoundary;
    }
    const crossesLatitude =
      currentPoint.latitude > point.latitude !==
      previousPoint.latitude > point.latitude;
    if (!crossesLatitude) continue;
    const crossingLongitude =
      ((previousPoint.longitude - currentPoint.longitude) *
        (point.latitude - currentPoint.latitude)) /
        (previousPoint.latitude - currentPoint.latitude) +
      currentPoint.longitude;
    if (point.longitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

export function deliveryZonesOverlap(
  left: readonly DeliveryZonePoint[],
  right: readonly DeliveryZonePoint[],
) {
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const leftNext = (leftIndex + 1) % left.length;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const rightNext = (rightIndex + 1) % right.length;
      if (
        segmentsIntersect(
          left[leftIndex]!,
          left[leftNext]!,
          right[rightIndex]!,
          right[rightNext]!,
          false,
        )
      ) {
        return true;
      }
    }
  }
  if (left.some((point) => pointInDeliveryZone(point, right, false)))
    return true;
  if (right.some((point) => pointInDeliveryZone(point, left, false)))
    return true;

  const hasSharedInterior = (
    source: readonly DeliveryZonePoint[],
    target: readonly DeliveryZonePoint[],
  ) =>
    source.some((start, index) => {
      const end = source[(index + 1) % source.length]!;
      const latitudeDelta = end.latitude - start.latitude;
      const longitudeDelta = end.longitude - start.longitude;
      const length = Math.hypot(latitudeDelta, longitudeDelta);
      if (length <= EPSILON) return false;
      const midpoint = {
        latitude: (start.latitude + end.latitude) / 2,
        longitude: (start.longitude + end.longitude) / 2,
      };
      return [1, -1].some((direction) => {
        const offset = Math.max(
          EPSILON * 100,
          Math.min(1e-7, length * 1e-6),
        );
        const sample = {
          latitude:
            midpoint.latitude -
            (longitudeDelta / length) * offset * direction,
          longitude:
            midpoint.longitude +
            (latitudeDelta / length) * offset * direction,
        };
        return (
          pointInDeliveryZone(sample, source, false) &&
          pointInDeliveryZone(sample, target, false)
        );
      });
    });

  return hasSharedInterior(left, right) || hasSharedInterior(right, left);
}

export function findDeliveryAreaForCoordinates<T extends DeliveryZoneCandidate>(
  candidates: readonly T[],
  point: DeliveryZonePoint,
): T | null {
  const matches = candidates.filter((candidate) => {
    const zone = deliveryZoneFromJson(candidate.deliveryZone);
    return zone ? pointInDeliveryZone(point, zone) : false;
  });
  return matches.length === 1 ? matches[0]! : null;
}

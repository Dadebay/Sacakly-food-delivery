const EARTH_RADIUS_METERS = 6_371_000;

export type Coordinates = {
  latitude: number;
  longitude: number;
};

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceBetweenMeters(from: Coordinates, to: Coordinates) {
  for (const point of [from, to]) {
    if (
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      Math.abs(point.latitude) > 90 ||
      Math.abs(point.longitude) > 180
    ) {
      throw new RangeError("Invalid geographic coordinates");
    }
  }
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = Math.min(1, Math.max(0, haversine));
  const centralAngle =
    2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
  return Math.round(EARTH_RADIUS_METERS * centralAngle);
}

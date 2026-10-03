export type BranchCoordinates = {
  latitude: number;
  longitude: number;
};

function coordinate(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    return null;
  }
  return Number(value.toFixed(7));
}

export function normalizeBranchCoordinates(
  latitude: number,
  longitude: number,
): BranchCoordinates | null {
  const parsedLatitude = coordinate(latitude, -90, 90);
  const parsedLongitude = coordinate(longitude, -180, 180);
  if (parsedLatitude === null || parsedLongitude === null) return null;
  return { latitude: parsedLatitude, longitude: parsedLongitude };
}

export function formatBranchDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return null;
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} м`;
  return `${(distanceMeters / 1_000).toFixed(distanceMeters < 10_000 ? 1 : 0)} км`;
}

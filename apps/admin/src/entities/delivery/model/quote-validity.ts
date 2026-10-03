export function quoteBoundaryDelay(
  validUntil: string | null | undefined,
  now = Date.now(),
): number | false {
  if (!validUntil) return false;
  const boundary = Date.parse(validUntil);
  return Number.isFinite(boundary)
    ? Math.max(1000, boundary - now + 100)
    : false;
}

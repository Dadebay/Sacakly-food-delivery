import type { AppVersion } from "./types";

export function updateVersionCache(
  current: AppVersion[] | undefined,
  saved: AppVersion,
) {
  return [
    ...(current ?? []).filter(({ platform }) => platform !== saved.platform),
    saved,
  ].sort((a, b) => a.platform.localeCompare(b.platform));
}

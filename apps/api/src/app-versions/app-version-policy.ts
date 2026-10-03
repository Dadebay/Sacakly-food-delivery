import { PushDevicePlatform } from "../generated/prisma/client";

export const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function compareAppVersions(left: string, right: string) {
  const a = left.split(".").map(BigInt);
  const b = right.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0n) > (b[i] ?? 0n)) return 1;
    if ((a[i] ?? 0n) < (b[i] ?? 0n)) return -1;
  }
  return 0;
}

export function isAppStoreUrl(platform: PushDevicePlatform, value: string) {
  try {
    const url = new URL(value);
    if (url.username.length > 0) return false;
    if (url.password.length > 0) return false;
    if (url.port || url.protocol !== "https:") return false;
    return platform === PushDevicePlatform.ANDROID
      ? url.hostname === "play.google.com" &&
          url.pathname === "/store/apps/details" &&
          url.searchParams.get("id") === "com.gurbanov.alowalow"
      : url.hostname === "apps.apple.com" && /\/id[1-9]\d*$/.test(url.pathname);
  } catch {
    return false;
  }
}

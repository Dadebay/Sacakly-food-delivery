import type { components } from "@alowalow/api-contract";

export type AppVersion = components["schemas"]["AdminAppVersionResponseDto"];
export type AppPlatform = AppVersion["platform"];
export type SaveAppVersion = components["schemas"]["SaveAppVersionDto"];

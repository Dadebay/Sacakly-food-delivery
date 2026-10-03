import type { components } from "@alowalow/api-contract";

export type LoginAttempt = components["schemas"]["LoginAttemptResponseDto"];
export type LoginAttemptsResponse = components["schemas"]["LoginAttemptsResponseDto"];
export type LoginAttemptStatus = NonNullable<LoginAttempt["status"]>;
export type LoginAttemptPlatform = NonNullable<LoginAttempt["platform"]>;

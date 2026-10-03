import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { SmsGatewayGuard } from "../src/auth/sms-gateway.guard";
import type { AppEnv } from "../src/config/env";

const deviceToken = "test-android-device-token-with-at-least-32-characters";

function createGuard(authRequired: boolean, allowUnauthenticatedLocal = false) {
  const values: Partial<AppEnv> = {
    SMS_GATEWAY_AUTH_REQUIRED: authRequired,
    SMS_GATEWAY_ALLOW_UNAUTHENTICATED_LOCAL: allowUnauthenticatedLocal,
    SMS_GATEWAY_DEVICE_TOKEN: deviceToken,
  };
  const config = {
    get: (key: keyof AppEnv) => values[key],
  } as ConfigService<AppEnv, true>;
  return new SmsGatewayGuard(config);
}

function context(authorization?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization ? { authorization } : {},
      }),
    }),
  } as ExecutionContext;
}

describe("SmsGatewayGuard", () => {
  it("temporarily permits the SMS device without a token when auth is disabled", () => {
    expect(createGuard(false).canActivate(context())).toBe(true);
  });

  it("keeps the future protected mode ready behind the env switch", () => {
    const guard = createGuard(true);

    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
    expect(() =>
      guard.canActivate(context("Bearer wrong-device-token")),
    ).toThrow(UnauthorizedException);
    expect(guard.canActivate(context(`Bearer ${deviceToken}`))).toBe(true);
  });

  it("preserves the development-only local bypass", () => {
    expect(createGuard(true, true).canActivate(context())).toBe(true);
  });
});

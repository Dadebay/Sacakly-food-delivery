import {
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/config/env";
import { ReceiptAgentGuard } from "../src/orders/receipt-agent.guard";

const agentToken = "receipt-agent-test-token-with-at-least-32-characters";

function guard(token = agentToken) {
  const values: Partial<AppEnv> = {
    RECEIPT_AGENT_API_TOKEN: token,
  };
  const config = {
    get: (key: keyof AppEnv) => values[key],
  } as ConfigService<AppEnv, true>;
  return new ReceiptAgentGuard(config);
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

describe("ReceiptAgentGuard", () => {
  it("fails closed until the dedicated key is configured", () => {
    expect(() => guard("").canActivate(context())).toThrow(
      ServiceUnavailableException,
    );
  });

  it("accepts only the separate print-agent bearer token", () => {
    const protectedGuard = guard();
    expect(() => protectedGuard.canActivate(context())).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      protectedGuard.canActivate(context("Bearer a-user-jwt-is-not-valid")),
    ).toThrow(UnauthorizedException);
    expect(protectedGuard.canActivate(context(`Bearer ${agentToken}`))).toBe(
      true,
    );
  });
});

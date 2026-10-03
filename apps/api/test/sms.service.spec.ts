import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/config/env";
import type { SmsGatewayService } from "../src/auth/sms-gateway.service";

import { SmsService } from "../src/auth/sms.service";

function config(values: Partial<AppEnv>) {
  return {
    get: (key: keyof AppEnv) => values[key],
  } as ConfigService<AppEnv, true>;
}

describe("SMS delivery", () => {
  const enqueueOtp = vi.fn();
  const gateway = {
    enqueueOtp,
  } as unknown as SmsGatewayService;

  beforeEach(() => {
    enqueueOtp.mockReset();
  });

  it("does not enqueue a real SMS in local console mode", async () => {
    const service = new SmsService(
      config({
        SMS_PROVIDER: "console",
      }),
      gateway,
    );

    await service.sendOtp("+99365123456", "123456", "request-id", 300);

    expect(enqueueOtp).not.toHaveBeenCalled();
  });

  it("queues OTP delivery for the authenticated Android pull gateway", async () => {
    enqueueOtp.mockResolvedValue({ id: "job-id" });
    const service = new SmsService(
      config({
        SMS_PROVIDER: "android_pull",
      }),
      gateway,
    );

    await service.sendOtp("+99365123456", "123456", "request-id", 300);

    expect(enqueueOtp).toHaveBeenCalledWith(
      "+99365123456",
      "123456",
      "request-id",
      300,
    );
  });
});

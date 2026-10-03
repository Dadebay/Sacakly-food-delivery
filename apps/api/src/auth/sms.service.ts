import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/env";
import { SmsGatewayService } from "./sms-gateway.service";

@Injectable()
export class SmsService {
  private readonly provider: AppEnv["SMS_PROVIDER"];

  constructor(
    config: ConfigService<AppEnv, true>,
    private readonly gateway: SmsGatewayService,
  ) {
    this.provider = config.get("SMS_PROVIDER", { infer: true });
  }

  async sendOtp(
    phone: string,
    code: string,
    requestId: string,
    expiresInSeconds: number,
  ) {
    if (this.provider === "console") return;
    return this.gateway.enqueueOtp(phone, code, requestId, expiresInSeconds);
  }
}

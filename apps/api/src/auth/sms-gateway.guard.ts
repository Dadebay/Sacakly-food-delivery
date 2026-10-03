import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { AppEnv } from "../config/env";

@Injectable()
export class SmsGatewayGuard implements CanActivate {
  private readonly expectedTokenHash: Buffer;
  private readonly authRequired: boolean;
  private readonly allowUnauthenticatedLocal: boolean;

  constructor(config: ConfigService<AppEnv, true>) {
    this.authRequired = config.get("SMS_GATEWAY_AUTH_REQUIRED", {
      infer: true,
    });
    this.allowUnauthenticatedLocal = config.get(
      "SMS_GATEWAY_ALLOW_UNAUTHENTICATED_LOCAL",
      { infer: true },
    );
    this.expectedTokenHash = this.hash(
      config.get("SMS_GATEWAY_DEVICE_TOKEN", { infer: true }),
    );
  }

  canActivate(context: ExecutionContext) {
    if (!this.authRequired || this.allowUnauthenticatedLocal) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token, extra] = String(
      request.headers.authorization ?? "",
    ).split(" ");
    if (
      scheme !== "Bearer" ||
      !token ||
      extra ||
      !timingSafeEqual(this.hash(token), this.expectedTokenHash)
    ) {
      throw new UnauthorizedException("SMS gateway token is invalid");
    }
    return true;
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest();
  }
}

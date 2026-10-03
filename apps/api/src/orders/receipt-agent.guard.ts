import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { AppEnv } from "../config/env";

@Injectable()
export class ReceiptAgentGuard implements CanActivate {
  private readonly configured: boolean;
  private readonly expectedTokenHash: Buffer;

  constructor(config: ConfigService<AppEnv, true>) {
    const token = config.get("RECEIPT_AGENT_API_TOKEN", { infer: true });
    this.configured = Boolean(token);
    this.expectedTokenHash = this.hash(token);
  }

  canActivate(context: ExecutionContext) {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        "Direct receipt agent is not configured",
      );
    }
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
      throw new UnauthorizedException("Receipt agent token is invalid");
    }
    return true;
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest();
  }
}

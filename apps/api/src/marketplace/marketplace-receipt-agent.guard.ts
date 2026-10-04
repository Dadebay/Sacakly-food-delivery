import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { MarketplaceReceiptsService } from "./marketplace-receipts.service";

export type CafeReceiptAgentRequest = Request & { receiptCafeId: string };

@Injectable()
export class MarketplaceReceiptAgentGuard implements CanActivate {
  constructor(private readonly receipts: MarketplaceReceiptsService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<CafeReceiptAgentRequest>();
    const [scheme, token, extra] = String(request.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token || extra) throw new UnauthorizedException("Receipt agent token is invalid");
    try {
      request.receiptCafeId = await this.receipts.agentCafe(token);
    } catch {
      throw new UnauthorizedException("Receipt agent token is invalid");
    }
    return true;
  }
}

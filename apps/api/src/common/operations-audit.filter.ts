import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";

/** Logs rejected operations requests after their transaction has rolled back.
 * Never persist headers, tokens, raw bodies, query strings or exception details.
 * A filter also sees authentication/role/validation failures before the service.
 */
@Catch()
@Injectable()
export class OperationsAuditFilter extends BaseExceptionFilter {
  private readonly auditLogger = new Logger(OperationsAuditFilter.name);

  constructor(
    adapter: HttpAdapterHost,
    private readonly prisma: PrismaService,
  ) {
    super(adapter.httpAdapter);
  }

  async catch(exception: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<Request>();
    const domain = /^\/api\/v1\/(marketplace|inventory|orders|receipt-print-tasks|accounting|catalog|branches|delivery|users|admin-page-access|contacts|ordering-hours|loyalty|marketing|app|notifications|media)(?:\/|$)/.exec(
      request.path,
    )?.[1];
    if (domain) {
      const status =
        exception instanceof HttpException ? exception.getStatus() : 500;
      const candidate =
        request.params.id ??
        request.params.ingredientId ??
        request.params.productId;
      const entityId =
        typeof candidate === "string" && /^[0-9a-f-]{36}$/i.test(candidate)
          ? candidate
          : null;
      try {
        await this.prisma.auditLog.create({
          data: {
            actorId: request.user?.id,
            action: `${domain === "orders" ? "order" : domain}.request.rejected`,
            entityType: domain === "orders" ? "Order" : domain === "inventory" ? "InventoryRequest" : "OperationsRequest",
            entityId,
            ip: request.socket.remoteAddress,
            metadata: {
              method: request.method,
              route:
                (request.route as { path?: string } | undefined)?.path ??
                `${domain}/unmatched`,
              status,
              actorRole: request.user?.role ?? null,
            },
          },
        });
      } catch {
        this.auditLogger.error(
          "Could not persist rejected operations request audit",
        );
      }
    }
    super.catch(exception, host);
  }
}

import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { AuthUser } from "../common/auth.types";
import { CreateReceiptPrinterDto } from "../catalog/catalog.dto";
import { Role } from "../generated/prisma/client";
import { ReceiptQueueService } from "../orders/receipt-queue.service";
import { ReprintReceiptDto } from "../orders/receipt-queue.dto";
import { PrismaService } from "../prisma/prisma.service";
import { assertCafeMember, assertModuleEnabled } from "./marketplace-policy";
import { RotateCafeReceiptTokenDto, RouteCafeReceiptPrinterDto, SetCafeReceiptConfigDto } from "./marketplace-receipts.dto";

@Injectable()
export class MarketplaceReceiptsService {
  constructor(private readonly prisma: PrismaService, private readonly queue: ReceiptQueueService) {}

  private async authorize(actor: AuthUser, cafeId: string, manager = false) {
    const membership = await this.prisma.cafeMembership.findUnique({ where: { cafeId_userId: { cafeId, userId: actor.id } }, include: { cafe: { select: { isActive: true } } } });
    assertCafeMember(actor.id, cafeId, membership, manager ? [Role.ADMIN] : [Role.ADMIN, Role.OPERATOR]);
    if (!membership?.cafe.isActive) throw new ForbiddenException("Cafe is inactive");
  }

  async config(actor: AuthUser, cafeId: string) {
    await this.authorize(actor, cafeId);
    const value = await this.prisma.cafeReceiptConfiguration.findUnique({ where: { cafeId } });
    return { cafeId, mainPrinterId: value?.mainPrinterId ?? null, mainCopies: value?.mainCopies ?? 1,
      businessPhone: value?.businessPhone ?? null, agentConfigured: Boolean(value?.agentTokenHash), version: value?.version ?? 0 };
  }

  async printers(actor: AuthUser, cafeId: string) {
    await this.authorize(actor, cafeId);
    return this.prisma.receiptPrinter.findMany({ where: { cafeId }, orderBy: { createdAt: "asc" } });
  }

  async createPrinter(actor: AuthUser, cafeId: string, dto: CreateReceiptPrinterDto) {
    await this.authorize(actor, cafeId, true);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const printer = await tx.receiptPrinter.create({ data: {
          cafeId, name: dto.name.trim(), ipAddress: dto.ipAddress, port: dto.port,
          transport: dto.transport, isActive: dto.isActive ?? true,
        } });
        await tx.auditLog.create({ data: { actorId: actor.id, action: "cafe.receipt.printer_created", entityType: "ReceiptPrinter", entityId: printer.id, metadata: { cafeId } } });
        return printer;
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ConflictException("Printer endpoint is already registered");
      throw error;
    }
  }

  async setConfig(actor: AuthUser, cafeId: string, dto: SetCafeReceiptConfigDto) {
    await this.authorize(actor, cafeId, true);
    return this.prisma.$transaction(async (tx) => {
      const printer = await tx.receiptPrinter.findFirst({ where: { id: dto.mainPrinterId, cafeId, isActive: true } });
      if (!printer) throw new ConflictException("Main printer must belong to this cafe and be active");
      const before = await tx.cafeReceiptConfiguration.findUnique({ where: { cafeId } });
      if ((before?.version ?? 0) !== dto.expectedVersion) throw new ConflictException("Receipt configuration changed");
      const data = { mainPrinterId: dto.mainPrinterId, mainCopies: dto.mainCopies, businessPhone: dto.businessPhone ?? null };
      const updated = before
        ? await tx.cafeReceiptConfiguration.updateMany({ where: { cafeId, version: dto.expectedVersion }, data: { ...data, version: { increment: 1 } } }).then(async (result) => {
          if (result.count !== 1) throw new ConflictException("Receipt configuration changed");
          return tx.cafeReceiptConfiguration.findUniqueOrThrow({ where: { cafeId } });
        })
        : await tx.cafeReceiptConfiguration.create({ data: { cafeId, ...data } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "cafe.receipt.config_changed", entityType: "CafeReceiptConfiguration", entityId: cafeId, metadata: { cafeId, mainPrinterId: dto.mainPrinterId, mainCopies: dto.mainCopies, version: updated.version } } });
      return { cafeId, mainPrinterId: updated.mainPrinterId, mainCopies: updated.mainCopies, businessPhone: updated.businessPhone, agentConfigured: Boolean(updated.agentTokenHash), version: updated.version };
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ConflictException("Receipt configuration changed");
      throw error;
    });
  }

  async rotateAgentToken(actor: AuthUser, cafeId: string, dto: RotateCafeReceiptTokenDto) {
    await this.authorize(actor, cafeId, true);
    const token = `sacakly_${randomBytes(32).toString("base64url")}`;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.cafeReceiptConfiguration.updateMany({ where: { cafeId, version: dto.expectedVersion }, data: { agentTokenHash: tokenHash, tokenIssuedAt: new Date(), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Receipt configuration changed");
      await tx.auditLog.create({ data: { actorId: actor.id, action: "cafe.receipt.agent_rotated", entityType: "CafeReceiptConfiguration", entityId: cafeId, metadata: { cafeId } } });
      return { token, version: dto.expectedVersion + 1 };
    });
  }

  async routeCategory(actor: AuthUser, cafeId: string, categoryId: string, dto: RouteCafeReceiptPrinterDto) {
    await this.authorize(actor, cafeId, true);
    return this.prisma.$transaction(async (tx) => {
      if (dto.printerId && !await tx.receiptPrinter.findFirst({ where: { id: dto.printerId, cafeId, isActive: true } })) throw new ConflictException("Printer does not belong to this cafe");
      const changed = await tx.category.updateMany({ where: { id: categoryId, cafeId, version: dto.expectedVersion }, data: { receiptPrinterId: dto.printerId ?? null, receiptPrinterIp: null, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Category changed or belongs to another cafe");
      await tx.auditLog.create({ data: { actorId: actor.id, action: "cafe.receipt.category_route", entityType: "Category", entityId: categoryId, metadata: { cafeId, printerId: dto.printerId ?? null } } });
      return tx.category.findUniqueOrThrow({ where: { id: categoryId } });
    });
  }

  async routeProduct(actor: AuthUser, cafeId: string, productId: string, dto: RouteCafeReceiptPrinterDto) {
    await this.authorize(actor, cafeId, true);
    return this.prisma.$transaction(async (tx) => {
      if (dto.printerId && !await tx.receiptPrinter.findFirst({ where: { id: dto.printerId, cafeId, isActive: true } })) throw new ConflictException("Printer does not belong to this cafe");
      const changed = await tx.product.updateMany({ where: { id: productId, category: { cafeId }, version: dto.expectedVersion }, data: { receiptPrinterId: dto.printerId ?? null, receiptPrinterIp: null, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Product changed or belongs to another cafe");
      await tx.auditLog.create({ data: { actorId: actor.id, action: "cafe.receipt.product_route", entityType: "Product", entityId: productId, metadata: { cafeId, printerId: dto.printerId ?? null } } });
      return tx.product.findUniqueOrThrow({ where: { id: productId } });
    });
  }

  async queueList(actor: AuthUser, cafeId: string) { await this.authorize(actor, cafeId); return this.queue.listCafe(cafeId); }
  async queueHistory(actor: AuthUser, cafeId: string) { await this.authorize(actor, cafeId); return this.queue.historyCafe(cafeId); }
  async retry(actor: AuthUser, cafeId: string, taskId: string) { await this.authorize(actor, cafeId); return this.queue.retryCafe(actor, cafeId, taskId); }
  async cancel(actor: AuthUser, cafeId: string, taskId: string) { await this.authorize(actor, cafeId, true); return this.queue.cancelCafe(actor, cafeId, taskId); }
  async reprint(actor: AuthUser, cafeId: string, orderId: string, dto: ReprintReceiptDto) {
    await this.authorize(actor, cafeId, true);
    assertModuleEnabled(await this.prisma.cafeModuleEntitlement.findUnique({ where: { cafeId_key: { cafeId, key: "RECEIPTS" } } }), cafeId);
    return this.queue.reprintCafe(actor, cafeId, orderId, dto);
  }

  async agentCafe(token: string) {
    if (!token || token.length < 40) throw new ForbiddenException("Receipt agent token is invalid");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const config = await this.prisma.cafeReceiptConfiguration.findUnique({ where: { agentTokenHash: tokenHash }, include: { cafe: true } });
    if (!config?.cafe.isActive) throw new ForbiddenException("Receipt agent token is invalid");
    const module = await this.prisma.cafeModuleEntitlement.findUnique({ where: { cafeId_key: { cafeId: config.cafeId, key: "RECEIPTS" } } });
    assertModuleEnabled(module, config.cafeId);
    return config.cafeId;
  }

  async assertReadyForActivation(cafeId: string) {
    const config = await this.prisma.cafeReceiptConfiguration.findUnique({ where: { cafeId }, include: { mainPrinter: true } });
    if (!config?.agentTokenHash || !config.mainPrinter?.isActive || config.mainPrinter.cafeId !== cafeId) throw new ConflictException("Configure a cafe printer and agent before enabling receipts");
  }
}

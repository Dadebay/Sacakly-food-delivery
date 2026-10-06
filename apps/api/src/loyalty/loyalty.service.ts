import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { toApiResponse } from "../common/api-response";
import type { AuthUser } from "../common/auth.types";
import { LoyaltyEntryKind, Prisma, type Gift } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateGiftDto, UpdateGiftDto } from "./loyalty.dto";
import { redemptionPoints } from "./loyalty-points";

export type RequestedGift = { giftId: string; quantity: number };
export type PreparedGift = { gift: Gift; quantity: number; totalPoints: number };

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async gifts(includeInactive: boolean) {
    return toApiResponse(await this.prisma.gift.findMany({
      where: { cafeId: null, ...(includeInactive ? {} : { isActive: true, OR: [{ stock: null }, { stock: { gt: 0 } }] }) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }));
  }

  async enabled(tx: Prisma.TransactionClient, cafeId: string | null) {
    if (!cafeId) return true;
    return Boolean((await tx.cafeModuleEntitlement.findUnique({ where: { cafeId_key: { cafeId, key: "LOYALTY" } } }))?.enabled);
  }

  async balance(tx: Prisma.TransactionClient, userId: string, cafeId: string | null = null) {
    if (cafeId) return (await tx.cafeLoyaltyWallet.findUnique({ where: { cafeId_userId: { cafeId, userId } } }))?.balance ?? 0;
    return (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { pointsBalance: true } })).pointsBalance;
  }

  async wallet(userId: string, cafeId: string | null = null) {
    return this.prisma.$transaction(async (tx) => toApiResponse({
      pointsBalance: await this.balance(tx, userId, cafeId),
      entries: await tx.loyaltyEntry.findMany({ where: { userId, cafeId }, select: { id: true, orderId: true, kind: true, points: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }),
    }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async changeBalance(tx: Prisma.TransactionClient, userId: string, cafeId: string | null, points: number, allowDebt = false) {
    const bounds = points > 0 ? { lte: 2_147_483_647 - points } : { gte: allowDebt ? -2_147_483_648 - points : -points };
    if (cafeId) {
      await tx.cafeLoyaltyWallet.upsert({ where: { cafeId_userId: { cafeId, userId } }, create: { cafeId, userId }, update: {} });
      const changed = await tx.cafeLoyaltyWallet.updateMany({ where: { cafeId, userId, balance: bounds }, data: { balance: { increment: points } } });
      if (!changed.count) throw new ConflictException(points < 0 ? "Insufficient loyalty points" : "Loyalty balance limit reached");
    } else {
      const changed = await tx.user.updateMany({ where: { id: userId, pointsBalance: bounds }, data: { pointsBalance: { increment: points } } });
      if (!changed.count) throw new ConflictException(points < 0 ? "Insufficient loyalty points" : "Loyalty balance limit reached");
    }
  }

  createGift(actor: AuthUser, dto: CreateGiftDto) {
    return this.prisma.$transaction(async (tx) => {
      const gift = await tx.gift.create({ data: { ...dto, name: dto.name.trim(), description: dto.description.trim(), stock: dto.stock ?? null } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "loyalty.gift.created", entityType: "Gift", entityId: gift.id, metadata: { pointsCost: gift.pointsCost, stock: gift.stock } } });
      return toApiResponse(gift);
    });
  }

  updateGift(actor: AuthUser, id: string, dto: UpdateGiftDto) {
    const { version, ...update } = dto;
    if (Object.keys(update).length === 0) throw new BadRequestException("At least one gift field is required");
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.gift.findFirst({ where: { id, cafeId: null } });
      if (!before) throw new NotFoundException("Gift not found");
      const changed = await tx.gift.updateMany({ where: { id, version, cafeId: null }, data: { ...update, ...(dto.name === undefined ? {} : { name: dto.name.trim() }), ...(dto.description === undefined ? {} : { description: dto.description.trim() }), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Gift changed; reload and try again");
      const gift = await tx.gift.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "loyalty.gift.updated", entityType: "Gift", entityId: id, metadata: { changedFields: Object.keys(update), previous: toApiResponse(before) } } });
      return toApiResponse(gift);
    });
  }

  async prepareRedemption(tx: Prisma.TransactionClient, requested: readonly RequestedGift[] = [], cafeId: string | null = null) {
    if (!requested.length) return { gifts: [] as PreparedGift[], pointsSpent: 0 };
    if (!await this.enabled(tx, cafeId)) throw new ForbiddenException("Cafe loyalty is disabled");
    if (requested.length > 10 || new Set(requested.map((gift) => gift.giftId)).size !== requested.length)
      throw new BadRequestException("Choose at most ten different gifts");
    const gifts = await tx.gift.findMany({ where: { cafeId, id: { in: requested.map((gift) => gift.giftId) }, isActive: true } });
    const byId = new Map(gifts.map((gift) => [gift.id, gift]));
    const prepared = requested.map(({ giftId, quantity }) => {
      const gift = byId.get(giftId);
      if (!gift) throw new BadRequestException("Gift is unavailable");
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) throw new BadRequestException("Gift quantity must be between 1 and 10");
      if (gift.stock !== null && gift.stock < quantity) throw new ConflictException("Gift is out of stock");
      return { gift, quantity, totalPoints: gift.pointsCost * quantity };
    });
    return { gifts: prepared, pointsSpent: redemptionPoints(prepared.map(({ gift, quantity }) => ({ pointsCost: gift.pointsCost, quantity }))) };
  }

  async redeem(tx: Prisma.TransactionClient, userId: string, orderId: string, gifts: readonly PreparedGift[], pointsSpent: number, cafeId: string | null = null) {
    if (!pointsSpent) return;
    await this.changeBalance(tx, userId, cafeId, -pointsSpent);
    for (const { gift, quantity, totalPoints } of [...gifts].sort((a, b) => a.gift.id.localeCompare(b.gift.id))) {
      const reserved = await tx.gift.updateMany({ where: { id: gift.id, cafeId, version: gift.version, isActive: true, ...(gift.stock === null ? { stock: null } : { stock: { gte: quantity } }) }, data: { version: { increment: 1 }, ...(gift.stock === null ? {} : { stock: { decrement: quantity } }) } });
      if (reserved.count !== 1) throw new ConflictException("Gift is no longer available");
      await tx.orderGift.create({ data: { orderId, giftId: gift.id, name: gift.name, imageUrl: gift.imageUrl, pointsCost: gift.pointsCost, quantity, totalPoints } });
    }
    await tx.loyaltyEntry.create({ data: { cafeId, userId, orderId, kind: LoyaltyEntryKind.REDEEM, points: -pointsSpent } });
  }

  async award(tx: Prisma.TransactionClient, userId: string, orderId: string, points: number, cafeId: string | null = null) {
    if (!points) return;
    await tx.loyaltyEntry.create({ data: { cafeId, userId, orderId, kind: LoyaltyEntryKind.EARN, points } });
    await this.changeBalance(tx, userId, cafeId, points);
  }

  async cancel(tx: Prisma.TransactionClient, userId: string, orderId: string, earned: number, spent: number, cafeId: string | null = null) {
    if (earned) {
      const existing = await tx.loyaltyEntry.findUnique({ where: { orderId_kind: { orderId, kind: LoyaltyEntryKind.EARN } } });
      if (existing) {
        await tx.loyaltyEntry.create({ data: { cafeId, userId, orderId, kind: LoyaltyEntryKind.REVERSE_EARN, points: -earned } });
        await this.changeBalance(tx, userId, cafeId, -earned, true);
      }
    }
    if (spent) {
      await tx.loyaltyEntry.create({ data: { cafeId, userId, orderId, kind: LoyaltyEntryKind.REFUND, points: spent } });
      await this.changeBalance(tx, userId, cafeId, spent);
      const gifts = await tx.orderGift.findMany({ where: { orderId }, orderBy: { giftId: "asc" } });
      for (const gift of gifts) {
        await tx.gift.updateMany({ where: { id: gift.giftId, cafeId, stock: { not: null } }, data: { stock: { increment: gift.quantity }, version: { increment: 1 } } });
      }
    }
  }
}

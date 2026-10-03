import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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
      where: includeInactive ? undefined : { isActive: true, OR: [{ stock: null }, { stock: { gt: 0 } }] },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }));
  }

  async wallet(userId: string) {
    const [user, entries] = await this.prisma.$transaction([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { pointsBalance: true } }),
      this.prisma.loyaltyEntry.findMany({ where: { userId }, select: { id: true, orderId: true, kind: true, points: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }),
    ]);
    return toApiResponse({ pointsBalance: user.pointsBalance, entries });
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
      const before = await tx.gift.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Gift not found");
      const changed = await tx.gift.updateMany({ where: { id, version }, data: { ...update, ...(dto.name === undefined ? {} : { name: dto.name.trim() }), ...(dto.description === undefined ? {} : { description: dto.description.trim() }), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Gift changed; reload and try again");
      const gift = await tx.gift.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "loyalty.gift.updated", entityType: "Gift", entityId: id, metadata: { changedFields: Object.keys(update), previous: toApiResponse(before) } } });
      return toApiResponse(gift);
    });
  }

  async prepareRedemption(tx: Prisma.TransactionClient, requested: readonly RequestedGift[] = []) {
    if (!requested.length) return { gifts: [] as PreparedGift[], pointsSpent: 0 };
    if (requested.length > 10 || new Set(requested.map((gift) => gift.giftId)).size !== requested.length)
      throw new BadRequestException("Choose at most ten different gifts");
    const gifts = await tx.gift.findMany({ where: { id: { in: requested.map((gift) => gift.giftId) }, isActive: true } });
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

  async redeem(tx: Prisma.TransactionClient, userId: string, orderId: string, gifts: readonly PreparedGift[], pointsSpent: number) {
    if (!pointsSpent) return;
    const debited = await tx.user.updateMany({ where: { id: userId, pointsBalance: { gte: pointsSpent } }, data: { pointsBalance: { decrement: pointsSpent } } });
    if (debited.count !== 1) throw new ConflictException("Insufficient loyalty points");
    for (const { gift, quantity, totalPoints } of gifts) {
      const reserved = await tx.gift.updateMany({ where: { id: gift.id, version: gift.version, isActive: true, ...(gift.stock === null ? { stock: null } : { stock: { gte: quantity } }) }, data: { version: { increment: 1 }, ...(gift.stock === null ? {} : { stock: { decrement: quantity } }) } });
      if (reserved.count !== 1) throw new ConflictException("Gift is no longer available");
      await tx.orderGift.create({ data: { orderId, giftId: gift.id, name: gift.name, imageUrl: gift.imageUrl, pointsCost: gift.pointsCost, quantity, totalPoints } });
    }
    await tx.loyaltyEntry.create({ data: { userId, orderId, kind: LoyaltyEntryKind.REDEEM, points: -pointsSpent } });
  }

  async award(tx: Prisma.TransactionClient, userId: string, orderId: string, points: number) {
    if (!points) return;
    await tx.loyaltyEntry.create({ data: { userId, orderId, kind: LoyaltyEntryKind.EARN, points } });
    const credited = await tx.user.updateMany({ where: { id: userId, pointsBalance: { lte: 2_147_483_647 - points } }, data: { pointsBalance: { increment: points } } });
    if (credited.count !== 1) throw new ConflictException("Loyalty balance limit reached");
  }

  async cancel(tx: Prisma.TransactionClient, userId: string, orderId: string, earned: number, spent: number) {
    if (earned) {
      const existing = await tx.loyaltyEntry.findUnique({ where: { orderId_kind: { orderId, kind: LoyaltyEntryKind.EARN } } });
      if (existing) {
        await tx.loyaltyEntry.create({ data: { userId, orderId, kind: LoyaltyEntryKind.REVERSE_EARN, points: -earned } });
        await tx.user.update({ where: { id: userId }, data: { pointsBalance: { decrement: earned } } });
      }
    }
    if (spent) {
      await tx.loyaltyEntry.create({ data: { userId, orderId, kind: LoyaltyEntryKind.REFUND, points: spent } });
      const credited = await tx.user.updateMany({ where: { id: userId, pointsBalance: { lte: 2_147_483_647 - spent } }, data: { pointsBalance: { increment: spent } } });
      if (credited.count !== 1) throw new ConflictException("Loyalty balance limit reached");
      const gifts = await tx.orderGift.findMany({ where: { orderId } });
      for (const gift of gifts) {
        await tx.gift.updateMany({ where: { id: gift.giftId, stock: { not: null } }, data: { stock: { increment: gift.quantity }, version: { increment: 1 } } });
      }
    }
  }
}

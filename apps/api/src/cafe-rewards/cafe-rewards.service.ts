import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { toApiResponse } from "../common/api-response";
import { Prisma, PromoType, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertCafeMember, assertModuleEnabled } from "../marketplace/marketplace-policy";
import { calculatePromoDiscount } from "../orders/order-pricing";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { CreateCafeGiftDto, CreateCafePromotionDto, UpdateCafeGiftDto, UpdateCafePromotionDto } from "./cafe-rewards.dto";

@Injectable()
export class CafeRewardsService {
  constructor(private readonly prisma: PrismaService, private readonly loyalty: LoyaltyService) {}

  private async authorize(tx: Prisma.TransactionClient, actor: AuthUser, cafeId: string, key: string, write = true) {
    const member = await tx.cafeMembership.findUnique({ where: { cafeId_userId: { cafeId, userId: actor.id } }, include: { cafe: true } });
    assertCafeMember(actor.id, cafeId, member, [Role.ADMIN]);
    if (!member?.cafe.isActive) throw new NotFoundException("Active cafe not found");
    if (write) assertModuleEnabled(await tx.cafeModuleEntitlement.findUnique({ where: { cafeId_key: { cafeId, key } } }), cafeId);
  }

  async manage(actor: AuthUser, cafeId: string) {
    await this.authorize(this.prisma, actor, cafeId, "MARKETING", false);
    const [promotions, gifts, modules] = await Promise.all([
      this.prisma.cafePromotion.findMany({ where: { cafeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      this.prisma.gift.findMany({ where: { cafeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      this.prisma.cafeModuleEntitlement.findMany({ where: { cafeId, enabled: true } }),
    ]);
    return toApiResponse({ promotions, gifts, marketingEnabled: modules.some((m) => m.key === "MARKETING"), loyaltyEnabled: modules.some((m) => m.key === "LOYALTY") });
  }

  async publicRewards(cafeId: string) {
    const cafe = await this.prisma.cafe.findFirst({ where: { id: cafeId, isActive: true, modules: { some: { key: "ORDERING", enabled: true } } }, include: { modules: { where: { enabled: true } } } });
    if (!cafe) throw new NotFoundException("Cafe not found");
    const marketingEnabled = cafe.modules.some((m) => m.key === "MARKETING");
    const loyaltyEnabled = cafe.modules.some((m) => m.key === "LOYALTY");
    const now = new Date();
    const [promotions, gifts] = await Promise.all([
      marketingEnabled ? this.prisma.cafePromotion.findMany({ where: { cafeId, isAutomatic: true, isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }) : [],
      loyaltyEnabled ? this.prisma.gift.findMany({ where: { cafeId, isActive: true, OR: [{ stock: null }, { stock: { gt: 0 } }] }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }) : [],
    ]);
    return toApiResponse({ marketingEnabled, loyaltyEnabled, promotions: promotions.filter((p) => p.totalUsageLimit === null || p.usedCount < p.totalUsageLimit), gifts });
  }

  async wallet(actor: AuthUser, cafeId: string) {
    if (!await this.prisma.cafe.findUnique({ where: { id: cafeId }, select: { id: true } })) throw new NotFoundException("Cafe not found");
    return { cafeId, ...await this.loyalty.wallet(actor.id, cafeId) };
  }

  private promotionData(dto: CreateCafePromotionDto) {
    if (dto.type === PromoType.PERCENT && dto.value > 100) throw new BadRequestException("Percentage must not exceed 100");
    if (!dto.isAutomatic && !dto.code) throw new BadRequestException("A promo code is required");
    if (dto.isAutomatic && dto.code) throw new BadRequestException("Automatic promotions must not have a code");
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && startsAt >= endsAt) throw new BadRequestException("Promotion end must be after its start");
    return { title: dto.title.trim(), code: dto.isAutomatic ? null : dto.code!.toUpperCase(), isAutomatic: dto.isAutomatic, type: dto.type, value: dto.value, minOrderAmount: dto.minOrderAmount ?? 0, maxDiscountAmount: dto.maxDiscountAmount ?? null, totalUsageLimit: dto.totalUsageLimit ?? null, perUserLimit: dto.perUserLimit ?? 1, isActive: dto.isActive ?? true, startsAt, endsAt };
  }

  async savePromotion(actor: AuthUser, cafeId: string, dto: CreateCafePromotionDto | UpdateCafePromotionDto, id?: string) {
    const data = this.promotionData(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.authorize(tx, actor, cafeId, "MARKETING");
        if (id) {
          const previous = await tx.cafePromotion.findFirst({ where: { id, cafeId } });
          if (!previous) throw new NotFoundException("Promotion not found in this cafe");
          if (data.totalUsageLimit !== null && data.totalUsageLimit < previous.usedCount) throw new BadRequestException("Usage limit is below existing redemptions");
          const changed = await tx.cafePromotion.updateMany({ where: { id, cafeId, version: (dto as UpdateCafePromotionDto).expectedVersion }, data: { ...data, version: { increment: 1 } } });
          if (!changed.count) throw new ConflictException("Promotion changed; reload before saving");
        }
        const promotion = id ? await tx.cafePromotion.findUniqueOrThrow({ where: { id } }) : await tx.cafePromotion.create({ data: { cafeId, ...data } });
        await tx.auditLog.create({ data: { actorId: actor.id, action: id ? "cafe.promotion.updated" : "cafe.promotion.created", entityType: "CafePromotion", entityId: promotion.id, metadata: { cafeId, version: promotion.version, settings: toApiResponse(data) } } });
        return toApiResponse(promotion);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("This cafe already has that promo code");
      throw error;
    }
  }

  async saveGift(actor: AuthUser, cafeId: string, dto: CreateCafeGiftDto | UpdateCafeGiftDto, id?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, actor, cafeId, "LOYALTY");
      const data = { name: dto.name.trim(), description: dto.description.trim(), pointsCost: dto.pointsCost, stock: dto.stock ?? null, isActive: dto.isActive ?? true };
      if (id) {
        if (!await tx.gift.findFirst({ where: { id, cafeId } })) throw new NotFoundException("Gift not found in this cafe");
        const changed = await tx.gift.updateMany({ where: { id, cafeId, version: (dto as UpdateCafeGiftDto).expectedVersion }, data: { ...data, version: { increment: 1 } } });
        if (!changed.count) throw new ConflictException("Gift changed; reload before saving");
      }
      const gift = id ? await tx.gift.findUniqueOrThrow({ where: { id } }) : await tx.gift.create({ data: { ...data, cafeId, imageUrl: "" } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: id ? "cafe.gift.updated" : "cafe.gift.created", entityType: "Gift", entityId: gift.id, metadata: { cafeId, version: gift.version, ...data } } });
      return toApiResponse(gift);
    });
  }

  async price(tx: Prisma.TransactionClient, cafeId: string, customerId: string, subtotal: number, code?: string, reserve = false) {
    const module = await tx.cafeModuleEntitlement.findUnique({ where: { cafeId_key: { cafeId, key: "MARKETING" } } });
    if (!module?.enabled) {
      if (code) throw new BadRequestException("Cafe promotions are disabled");
      return { promotion: null, discount: 0 };
    }
    // Serialize redemption with edits and other checkouts, including per-user
    // limits. Lock in stable order when comparing multiple automatic campaigns.
    if (reserve) await tx.$queryRaw`SELECT "id" FROM "CafePromotion" WHERE "cafeId" = ${cafeId}::uuid ORDER BY "id" FOR UPDATE`;
    const now = new Date();
    const candidates = await tx.cafePromotion.findMany({ where: { cafeId, ...(code ? { code: code.trim().toUpperCase(), isAutomatic: false } : { isAutomatic: true }), isActive: true, minOrderAmount: { lte: subtotal }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] }, orderBy: { id: "asc" } });
    const counts = candidates.length ? await tx.order.groupBy({ by: ["cafePromotionId"], where: { cafePromotionId: { in: candidates.map((promotion) => promotion.id) }, customerId }, _count: { _all: true } }) : [];
    const usageByPromotion = new Map(counts.map((entry) => [entry.cafePromotionId, entry._count._all]));
    const eligible = [];
    for (const promotion of candidates) {
      if (promotion.totalUsageLimit !== null && promotion.usedCount >= promotion.totalUsageLimit) continue;
      const used = usageByPromotion.get(promotion.id) ?? 0;
      if (used >= promotion.perUserLimit) continue;
      eligible.push({ promotion, discount: calculatePromoDiscount({ type: promotion.type, value: Number(promotion.value), maxDiscountAmount: promotion.maxDiscountAmount === null ? null : Number(promotion.maxDiscountAmount) }, subtotal) });
    }
    const chosen = eligible.sort((a, b) => b.discount - a.discount)[0];
    if (!chosen && code) throw new BadRequestException("Promo code is unavailable or its limit was reached");
    if (!chosen) return { promotion: null, discount: 0 };
    if (reserve) await tx.cafePromotion.update({ where: { id: chosen.promotion.id }, data: { usedCount: { increment: 1 }, version: { increment: 1 } } });
    return chosen;
  }
}

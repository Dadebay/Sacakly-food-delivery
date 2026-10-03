import { Injectable, NotFoundException } from "@nestjs/common";
import { toApiResponse } from "../common/api-response";
import type { AuthUser } from "../common/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateBannerDto,
  CreatePromoCodeDto,
  UpdateBannerDto,
  UpdatePromoCodeDto,
} from "./marketing.dto";

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  async activeBanners() {
    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { sortOrder: "asc" },
    });
    return toApiResponse(banners);
  }

  async allBanners() {
    const banners = await this.prisma.banner.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return toApiResponse(banners);
  }

  createBanner(actor: AuthUser, dto: CreateBannerDto) {
    return this.prisma.$transaction(async (tx) => {
      const banner = await tx.banner.create({
        data: {
          ...dto,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "marketing.banner.created",
          entityType: "Banner",
          entityId: banner.id,
          metadata: { title: banner.title },
        },
      });
      return toApiResponse(banner);
    });
  }

  updateBanner(actor: AuthUser, id: string, dto: UpdateBannerDto) {
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.banner.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException("Banner not found");
      const banner = await tx.banner.update({
        where: { id },
        data: {
          ...dto,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "marketing.banner.updated",
          entityType: "Banner",
          entityId: id,
          metadata: { title: banner.title, isActive: banner.isActive, before: toApiResponse(exists), after: toApiResponse(banner) },
        },
      });
      return toApiResponse(banner);
    });
  }

  deleteBanner(actor: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const banner = await tx.banner.findUnique({ where: { id } });
      if (!banner) throw new NotFoundException("Banner not found");
      const deleted = await tx.banner.deleteMany({ where: { id } });
      if (deleted.count !== 1) {
        throw new NotFoundException("Banner not found");
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "marketing.banner.deleted",
          entityType: "Banner",
          entityId: id,
          metadata: {
            title: banner.title,
            imageUrl: banner.imageUrl,
            isActive: banner.isActive,
          },
        },
      });
      return toApiResponse(banner);
    });
  }

  async promoCodes() {
    const promos = await this.prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
    });
    return toApiResponse(promos);
  }

  createPromoCode(actor: AuthUser, dto: CreatePromoCodeDto) {
    return this.prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.create({
        data: {
          ...dto,
          code: dto.code.trim().toUpperCase(),
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "marketing.promo.created",
          entityType: "PromoCode",
          entityId: promo.id,
          metadata: { code: promo.code },
        },
      });
      return toApiResponse(promo);
    });
  }

  updatePromoCode(actor: AuthUser, id: string, dto: UpdatePromoCodeDto) {
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.promoCode.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException("Promo code not found");
      const promo = await tx.promoCode.update({
        where: { id },
        data: {
          ...dto,
          code: dto.code?.trim().toUpperCase(),
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "marketing.promo.updated",
          entityType: "PromoCode",
          entityId: id,
          metadata: { code: promo.code, isActive: promo.isActive, before: toApiResponse(exists), after: toApiResponse(promo) },
        },
      });
      return toApiResponse(promo);
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { CourierApplicationStatus, OrderStatus, Role } from "../generated/prisma/client";
import { AssignCourierDto } from "../orders/orders.dto";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { CreateMarketplaceCafeDto, GrantCafeMemberDto, ListMarketplaceCafesDto, LookupMarketplaceUserDto, ReviewCourierDto, SetCafeModuleDto, UpdateMarketplaceCafeDto } from "./marketplace.dto";
import { assertPublishedCafeReady, cafeReadiness, lockCafeSetup } from "./cafe-onboarding";
import {
  assertCafeMember,
  assertPlatformOwner,
} from "./marketplace-policy";

import { PLATFORM_OWNER_PHONE } from "./platform-owner";
import { MarketplaceReceiptsService } from "./marketplace-receipts.service";

function rethrowCreateConflict(error: unknown): never {
  if (
    error && typeof error === "object" && "code" in error &&
    error.code === "P2002"
  ) {
    throw new ConflictException("The record changed; reload and retry");
  }
  throw error;
}

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService, private readonly orders: OrdersService, private readonly receipts: MarketplaceReceiptsService) {}

  publicCafes(query: ListMarketplaceCafesDto = {}) {
    return this.prisma.cafe.findMany({
      where: { isActive: true, modules: { some: { key: "ORDERING", enabled: true } }, ...(query.cuisine ? { cuisines: { has: query.cuisine } } : {}) },
      select: { id: true, name: true, slug: true, description: true, imageUrl: true, isActive: true, cuisines: true, version: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async ownerCafes(actor: AuthUser) {
    await this.assertOwner(actor);
    return this.prisma.cafe.findMany({
      select: { id: true, name: true, slug: true, description: true, imageUrl: true, isActive: true, cuisines: true, version: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async ownerCafeReadiness(actor: AuthUser, cafeId: string) {
    await this.assertOwner(actor);
    const readiness = await cafeReadiness(this.prisma, cafeId);
    if (!readiness) throw new NotFoundException("Cafe not found");
    return readiness;
  }

  async merchantCafeReadiness(actor: AuthUser, cafeId: string) {
    const membership = await this.prisma.cafeMembership.findUnique({ where: { cafeId_userId: { cafeId, userId: actor.id } } });
    assertCafeMember(actor.id, cafeId, membership, [Role.ADMIN, Role.OPERATOR, Role.ACCOUNTANT]);
    const readiness = await cafeReadiness(this.prisma, cafeId);
    if (!readiness) throw new NotFoundException("Cafe not found");
    return readiness;
  }

  async assertOwner(actor: AuthUser): Promise<void> {
    const entitlement = await this.prisma.platformOwner.findUnique({
      where: { userId: actor.id },
    });
    assertPlatformOwner(
      { id: actor.id, phone: actor.phone, role: actor.role, isActive: true },
      entitlement,
      PLATFORM_OWNER_PHONE,
    );
  }

  async ownerStatus(actor: AuthUser) {
    await this.assertOwner(actor);
    return { owner: true };
  }

  myCafes(actor: AuthUser) {
    return this.prisma.cafeMembership.findMany({
      where: { userId: actor.id, isActive: true, cafe: { isActive: true } },
      select: {
        cafeId: true,
        role: true,
        cafe: { select: { name: true, slug: true } },
      },
      orderBy: { cafe: { name: "asc" } },
    });
  }

  async ownerCafeModules(actor: AuthUser, cafeId: string) {
    await this.assertOwner(actor);
    const cafe = await this.prisma.cafe.findUnique({ where: { id: cafeId } });
    if (!cafe) throw new NotFoundException("Cafe not found");
    return this.prisma.cafeModuleEntitlement.findMany({
      where: { cafeId },
      orderBy: { key: "asc" },
    });
  }

  async createCafe(actor: AuthUser, dto: CreateMarketplaceCafeDto) {
    await this.assertOwner(actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cafe = await tx.cafe.create({
          data: { name: dto.name.trim(), slug: dto.slug, description: dto.description?.trim() || null, cuisines: dto.cuisines ?? [] },
          select: { id: true, name: true, slug: true, description: true, imageUrl: true, isActive: true, cuisines: true, version: true },
        });
        await tx.auditLog.create({
          data: { actorId: actor.id, action: "cafe.created", entityType: "Cafe", entityId: cafe.id },
        });
        return cafe;
      });
    } catch (error) {
      rethrowCreateConflict(error);
    }
  }

  async updateCafe(actor: AuthUser, cafeId: string, dto: UpdateMarketplaceCafeDto) {
    await this.assertOwner(actor);
    return this.prisma.$transaction(async (tx) => {
      const beforeSetup = await lockCafeSetup(tx, cafeId);
      const previous = await tx.cafe.findUnique({ where: { id: cafeId } });
      if (!previous) throw new NotFoundException("Cafe not found");
      if (previous.version !== dto.expectedVersion) throw new ConflictException("Cafe version changed");
      const changed = await tx.cafe.updateMany({
        where: { id: cafeId, version: dto.expectedVersion },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.description === undefined ? {} : { description: dto.description.trim() || null }),
          ...(dto.cuisines === undefined ? {} : { cuisines: dto.cuisines }),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException("Cafe changed");
      await assertPublishedCafeReady(tx, cafeId, beforeSetup);
      await tx.auditLog.create({ data: { actorId: actor.id, action: "cafe.profile.changed", entityType: "Cafe", entityId: cafeId,
        metadata: { beforeVersion: previous.version, afterVersion: previous.version + 1, beforeCuisines: previous.cuisines, afterCuisines: dto.cuisines ?? previous.cuisines } } });
      return tx.cafe.findUniqueOrThrow({ where: { id: cafeId }, select: { id: true, name: true, slug: true, description: true, imageUrl: true, isActive: true, cuisines: true, version: true } });
    });
  }

  async lookupUser(actor: AuthUser, dto: LookupMarketplaceUserDto) {
    await this.assertOwner(actor);
    const parsed = parsePhoneNumberFromString(dto.phone, "TM");
    if (!parsed?.isValid()) throw new BadRequestException("Phone number is invalid");
    const user = await this.prisma.user.findUnique({
      where: { phone: parsed.number },
      select: { id: true, phone: true, firstName: true, lastName: true, isActive: true },
    });
    if (!user?.isActive) throw new NotFoundException("Active account not found");
    return { id: user.id, phone: user.phone, firstName: user.firstName, lastName: user.lastName };
  }

  async ownerCafeMembers(actor: AuthUser, cafeId: string) {
    await this.assertOwner(actor);
    const cafe = await this.prisma.cafe.findUnique({ where: { id: cafeId } });
    if (!cafe) throw new NotFoundException("Cafe not found");
    return this.prisma.cafeMembership.findMany({
      where: { cafeId },
      select: {
        cafeId: true, userId: true, role: true, isActive: true, version: true,
        user: { select: { id: true, phone: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async dispatchOrders(actor: AuthUser) {
    await this.assertOwner(actor);
    return this.prisma.order.findMany({
      where: { cafeId: { not: null }, status: { in: [OrderStatus.READY, OrderStatus.ASSIGNED_TO_COURIER] } },
      select: {
        id: true, number: true, status: true, version: true, cafeId: true,
        cafe: { select: { name: true } }, courierId: true, address: true, createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
  }

  async dispatchCouriers(actor: AuthUser) {
    await this.assertOwner(actor);
    const approved = await this.prisma.courierApplication.findMany({
      where: { status: CourierApplicationStatus.APPROVED, user: { isActive: true, role: Role.COURIER } },
      select: { user: { select: { id: true, phone: true, firstName: true, lastName: true } } },
      orderBy: { reviewedAt: "asc" },
      take: 100,
    });
    return approved.map((entry) => entry.user);
  }

  async dispatchAssignCourier(actor: AuthUser, orderId: string, dto: AssignCourierDto) {
    await this.assertOwner(actor);
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { cafeId: true } });
    if (!order?.cafeId) throw new NotFoundException("Marketplace order not found");
    return this.orders.assignCourier(actor, orderId, dto);
  }

  async applyCourier(actor: AuthUser) {
    if (actor.role !== Role.CUSTOMER) {
      throw new BadRequestException("Only customer accounts may apply as couriers");
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.courierApplication.findUnique({
        where: { userId: actor.id },
      });
      if (existing) return existing;
      const application = await tx.courierApplication.create({
        data: { userId: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "courier.application.created",
          entityType: "CourierApplication",
          entityId: actor.id,
        },
      });
      return application;
    }).catch(rethrowCreateConflict);
  }

  myCourierApplication(actor: AuthUser) {
    return this.prisma.courierApplication.findUnique({
      where: { userId: actor.id },
    });
  }

  async listCourierApplications(actor: AuthUser) {
    await this.assertOwner(actor);
    return this.prisma.courierApplication.findMany({
      where: { status: CourierApplicationStatus.PENDING },
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
      take: 100,
      include: { user: { select: { phone: true, firstName: true, lastName: true } } },
    });
  }

  async reviewCourier(actor: AuthUser, userId: string, dto: ReviewCourierDto) {
    await this.assertOwner(actor);
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.courierApplication.findUnique({
        where: { userId },
      });
      if (!application) throw new NotFoundException("Courier application not found");
      if (application.status !== CourierApplicationStatus.PENDING) {
        throw new ConflictException("Courier application is already reviewed");
      }
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.isActive || user.role !== Role.CUSTOMER) {
        throw new ConflictException("Applicant account is no longer eligible");
      }
      const status = dto.decision === "APPROVED"
        ? CourierApplicationStatus.APPROVED
        : CourierApplicationStatus.REJECTED;
      const changed = await tx.courierApplication.updateMany({
        where: { userId, status: CourierApplicationStatus.PENDING },
        data: {
          status,
          note: dto.note?.trim() || null,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new ConflictException("Application changed");
      if (status === CourierApplicationStatus.APPROVED) {
        const promoted = await tx.user.updateMany({
          where: { id: userId, role: Role.CUSTOMER, isActive: true },
          data: { role: Role.COURIER },
        });
        if (promoted.count !== 1) throw new ConflictException("Applicant changed");
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "courier.application.reviewed",
          entityType: "CourierApplication",
          entityId: userId,
          metadata: { before: application.status, after: status },
        },
      });
      return tx.courierApplication.findUniqueOrThrow({ where: { userId } });
    });
  }

  async grantCafeMember(actor: AuthUser, cafeId: string, dto: GrantCafeMemberDto) {
    await this.assertOwner(actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const beforeSetup = await lockCafeSetup(tx, cafeId);
        const cafe = await tx.cafe.findUnique({ where: { id: cafeId } });
        if (!cafe?.isActive) throw new NotFoundException("Active cafe not found");
        const user = await tx.user.findUnique({ where: { id: dto.userId } });
        if (!user?.isActive) throw new NotFoundException("Active user not found");
        if (dto.role === Role.COURIER) {
          if (user.role !== Role.CUSTOMER && user.role !== Role.COURIER) {
            throw new ConflictException("Only a customer or courier account can become a cafe courier");
          }
          if (user.role === Role.CUSTOMER) {
            const promoted = await tx.user.updateMany({
              where: { id: user.id, role: Role.CUSTOMER, isActive: true },
              data: { role: Role.COURIER },
            });
            if (promoted.count !== 1) throw new ConflictException("Courier account changed");
          }
        }
        const where = { cafeId_userId: { cafeId, userId: dto.userId } };
        const previous = await tx.cafeMembership.findUnique({ where });
        if ((previous?.version ?? 0) !== dto.expectedVersion) {
          throw new ConflictException("Membership version changed");
        }
        const membership = previous
          ? await tx.cafeMembership.updateMany({
              where: { cafeId, userId: dto.userId, version: dto.expectedVersion },
              data: { role: dto.role, isActive: dto.isActive ?? true, version: { increment: 1 } },
            }).then(async (changed) => {
              if (changed.count !== 1) throw new ConflictException("Membership changed");
              return tx.cafeMembership.findUniqueOrThrow({ where });
            })
          : await tx.cafeMembership.create({
              data: { cafeId, userId: dto.userId, role: dto.role, isActive: dto.isActive ?? true },
            });
        await assertPublishedCafeReady(tx, cafeId, beforeSetup);
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "cafe.membership.changed",
            entityType: "CafeMembership",
            entityId: cafeId,
            metadata: { cafeId, userId: dto.userId, before: { role: previous?.role ?? null, active: previous?.isActive ?? null }, after: { role: dto.role, active: membership.isActive } },
          },
        });
        return membership;
      });
    } catch (error) {
      rethrowCreateConflict(error);
    }
  }

  async merchantOrders(actor: AuthUser, cafeId: string) {
    const membership = await this.prisma.cafeMembership.findUnique({
      where: { cafeId_userId: { cafeId, userId: actor.id } },
    });
    assertCafeMember(actor.id, cafeId, membership, [Role.ADMIN, Role.OPERATOR, Role.COOK, Role.ACCOUNTANT]);
    return this.prisma.order.findMany({
      where: { cafeId },
      select: { id: true, number: true, status: true, version: true, packingConfirmedAt: true, total: true, branchId: true, createdAt: true,
        items: { select: { id: true, productName: true, quantity: true, preparationMinutes: true } },
        gifts: { select: { id: true } }, deliveryRequest: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
  }

  async setCafeModule(
    actor: AuthUser,
    cafeId: string,
    key: string,
    dto: SetCafeModuleDto,
  ) {
    await this.assertOwner(actor);
    if (dto.enabled && !["ORDERING", "RECEIPTS"].includes(key)) {
      throw new ConflictException("This cafe module is not yet tenant-ready");
    }
    if (dto.enabled && key === "RECEIPTS") await this.receipts.assertReadyForActivation(cafeId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const readiness = await lockCafeSetup(tx, cafeId);
        const cafe = await tx.cafe.findUnique({ where: { id: cafeId } });
        if (!cafe) throw new NotFoundException("Cafe not found");
        const where = { cafeId_key: { cafeId, key } };
        const previous = await tx.cafeModuleEntitlement.findUnique({ where });
        if ((previous?.version ?? 0) !== dto.expectedVersion) {
          throw new ConflictException("Module version changed");
        }
        if (dto.enabled && key === "ORDERING" && !previous?.enabled) {
          if (!readiness?.readyForOrdering) {
            throw new ConflictException(`Cafe setup is incomplete: ${Object.entries(readiness?.checks ?? {}).filter(([, ready]) => !ready).map(([check]) => check).join(", ") || "inactive cafe"}`);
          }
        }
        const module = previous
          ? await tx.cafeModuleEntitlement.updateMany({
              where: { cafeId, key, version: dto.expectedVersion },
              data: { enabled: dto.enabled, version: { increment: 1 }, updatedById: actor.id },
            }).then(async (changed) => {
              if (changed.count !== 1) throw new ConflictException("Module changed");
              return tx.cafeModuleEntitlement.findUniqueOrThrow({ where });
            })
          : await tx.cafeModuleEntitlement.create({
              data: { cafeId, key, enabled: dto.enabled, updatedById: actor.id },
            });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "cafe.module.changed",
            entityType: "CafeModuleEntitlement",
            entityId: cafeId,
            metadata: { cafeId, key, before: previous?.enabled ?? null, after: dto.enabled, version: module.version },
          },
        });
        return module;
      });
    } catch (error) {
      rethrowCreateConflict(error);
    }
  }
}

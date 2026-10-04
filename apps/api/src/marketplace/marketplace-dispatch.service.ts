import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { CourierApplicationStatus, MarketplaceDeliveryMode, MarketplaceDeliveryStatus, OrderStatus, Role } from "../generated/prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { ConfirmOrderPackingDto } from "../orders/orders.dto";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertApprovedCourier, assertCafeMember, assertModuleEnabled } from "./marketplace-policy";
import { deliveryOfferAt, mayOfferExternally } from "./marketplace-dispatch-policy";
import { ChooseMarketplaceDeliveryDto } from "./marketplace-dispatch.dto";

@Injectable()
export class MarketplaceDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketplaceDispatchService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private publishing = false;
  constructor(private readonly prisma: PrismaService, private readonly orders: OrdersService, private readonly notifications: NotificationsService) {}

  onModuleInit() { this.timer = setInterval(() => void this.publishDue().catch((error: unknown) => this.logger.error(error)), 15_000); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  private async assertManager(actor: AuthUser, cafeId: string) {
    const [membership, module] = await Promise.all([
      this.prisma.cafeMembership.findUnique({ where: { cafeId_userId: { cafeId, userId: actor.id } } }),
      this.prisma.cafeModuleEntitlement.findUnique({ where: { cafeId_key: { cafeId, key: "ORDERING" } } }),
    ]);
    assertCafeMember(actor.id, cafeId, membership, [Role.ADMIN, Role.OPERATOR]);
    assertModuleEnabled(module, cafeId);
  }

  private async assertNetworkCourier(actor: AuthUser) {
    if (actor.role !== Role.COURIER) throw new ForbiddenException("Approved courier required");
    assertApprovedCourier(await this.prisma.courierApplication.findUnique({ where: { userId: actor.id } }), actor.id);
  }

  async ownCouriers(actor: AuthUser, cafeId: string) {
    await this.assertManager(actor, cafeId);
    const members = await this.prisma.cafeMembership.findMany({
      where: { cafeId, role: Role.COURIER, isActive: true, user: { isActive: true, role: Role.COURIER } },
      select: { user: { select: { id: true, phone: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return members.map((entry) => entry.user);
  }

  async choose(actor: AuthUser, cafeId: string, orderId: string, dto: ChooseMarketplaceDeliveryDto) {
    await this.assertManager(actor, cafeId);
    if (dto.mode === MarketplaceDeliveryMode.NETWORK && dto.courierId !== undefined) throw new BadRequestException("Network requests cannot name a courier");
    const request = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { select: { preparationMinutes: true } } } });
      if (!order || order.cafeId !== cafeId) throw new NotFoundException("Cafe order not found");
      if (!mayOfferExternally(order.status) || order.courierId) throw new ConflictException("Delivery can only be selected before assignment");
      if (order.version !== dto.expectedOrderVersion) throw new ConflictException("Order changed; reload and retry");
      if (dto.mode === MarketplaceDeliveryMode.OWN) {
        const member = await tx.cafeMembership.findUnique({ where: { cafeId_userId: { cafeId, userId: dto.courierId! } }, include: { user: true } });
        if (!member?.isActive || member.role !== Role.COURIER || !member.user.isActive || member.user.role !== Role.COURIER) throw new ForbiddenException("Courier is not active in this cafe");
      }
      const previous = await tx.marketplaceDeliveryRequest.findUnique({ where: { orderId } });
      if (previous && previous.status !== MarketplaceDeliveryStatus.WAITING && previous.status !== MarketplaceDeliveryStatus.OFFERED) throw new ConflictException("Delivery request is already claimed");
      const changed = await tx.order.updateMany({ where: { id: orderId, cafeId, version: dto.expectedOrderVersion, status: order.status, courierId: null }, data: { version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Order changed; reload and retry");
      const prep = Math.max(0, ...order.items.map((item) => item.preparationMinutes));
      const data = { cafeId, mode: dto.mode, status: dto.mode === MarketplaceDeliveryMode.OWN ? MarketplaceDeliveryStatus.CLAIMED : MarketplaceDeliveryStatus.WAITING,
        courierId: dto.mode === MarketplaceDeliveryMode.OWN ? dto.courierId! : null,
        offerAt: deliveryOfferAt(order.createdAt, prep), offeredAt: null, claimedAt: dto.mode === MarketplaceDeliveryMode.OWN ? new Date() : null };
      const saved = previous ? await tx.marketplaceDeliveryRequest.update({ where: { orderId }, data: { ...data, version: { increment: 1 } } }) : await tx.marketplaceDeliveryRequest.create({ data: { orderId, ...data } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "delivery.route.selected", entityType: "Order", entityId: orderId, metadata: { cafeId, mode: dto.mode, courierId: data.courierId, offerAt: saved.offerAt.toISOString() } } });
      return { saved, orderVersion: order.version + 1, ready: order.status === OrderStatus.READY && Boolean(order.packingConfirmedAt) };
    });
    if (request.saved.mode === MarketplaceDeliveryMode.NETWORK) await this.publishDue();
    if (request.ready && request.saved.courierId) await this.orders.assignCourier(actor, orderId, { courierId: request.saved.courierId, version: request.orderVersion });
    return this.prisma.marketplaceDeliveryRequest.findUniqueOrThrow({ where: { orderId } });
  }

  async ready(actor: AuthUser, cafeId: string, orderId: string, dto: ConfirmOrderPackingDto) {
    await this.assertManager(actor, cafeId);
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { cafeId: true, status: true, packingConfirmedAt: true, version: true } });
    if (!order || order.cafeId !== cafeId) throw new NotFoundException("Cafe order not found");
    if (order.status === OrderStatus.READY && order.packingConfirmedAt) {
      const reserved = await this.prisma.marketplaceDeliveryRequest.findUnique({ where: { orderId } });
      if (reserved?.status !== MarketplaceDeliveryStatus.CLAIMED || !reserved.courierId) throw new ConflictException("No reserved courier to assign");
      return this.orders.assignCourier(actor, orderId, { courierId: reserved.courierId, version: order.version });
    }
    const confirmed = await this.orders.confirmPacking(actor, orderId, dto);
    const request = await this.prisma.marketplaceDeliveryRequest.findUnique({ where: { orderId } });
    if (request?.status === MarketplaceDeliveryStatus.CLAIMED && request.courierId) {
      return this.orders.assignCourier(actor, orderId, { courierId: request.courierId, version: confirmed.version });
    }
    return confirmed;
  }

  async offers(actor: AuthUser) {
    await this.assertNetworkCourier(actor);
    const rows = await this.prisma.marketplaceDeliveryRequest.findMany({
      where: { mode: MarketplaceDeliveryMode.NETWORK, status: MarketplaceDeliveryStatus.OFFERED,
        order: { status: { in: [OrderStatus.COOKING, OrderStatus.READY] }, cafe: { isActive: true, modules: { some: { key: "ORDERING", enabled: true } } } } },
      select: { orderId: true, offeredAt: true, offerAt: true, order: { select: { number: true, createdAt: true, items: { select: { preparationMinutes: true } } } }, cafe: { select: { name: true } } },
      orderBy: { offeredAt: "asc" }, take: 100,
    });
    return rows.map((row) => ({ orderId: row.orderId, orderNumber: row.order.number, cafeName: row.cafe.name,
      offeredAt: row.offeredAt, estimatedReadyAt: new Date(row.order.createdAt.getTime() + Math.max(0, ...row.order.items.map((item) => item.preparationMinutes)) * 60_000) }));
  }

  async claim(actor: AuthUser, orderId: string) {
    await this.assertNetworkCourier(actor);
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.marketplaceDeliveryRequest.findUnique({ where: { orderId }, include: { order: true } });
      if (!request || request.mode !== MarketplaceDeliveryMode.NETWORK) throw new NotFoundException("External offer not found");
      if (request.status === MarketplaceDeliveryStatus.CLAIMED && request.courierId === actor.id) {
        return { ready: request.order.status === OrderStatus.READY && Boolean(request.order.packingConfirmedAt), version: request.order.version };
      }
      if (request.status !== MarketplaceDeliveryStatus.OFFERED || !mayOfferExternally(request.order.status)) throw new ConflictException("Offer is no longer available");
      const changed = await tx.marketplaceDeliveryRequest.updateMany({ where: { orderId, status: MarketplaceDeliveryStatus.OFFERED, courierId: null,
        order: { status: { in: [OrderStatus.COOKING, OrderStatus.READY] }, courierId: null } }, data: { status: MarketplaceDeliveryStatus.CLAIMED, courierId: actor.id, claimedAt: new Date(), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Another courier accepted first");
      await tx.auditLog.create({ data: { actorId: actor.id, action: "delivery.offer.claimed", entityType: "Order", entityId: orderId, metadata: { cafeId: request.cafeId, courierId: actor.id } } });
      return { ready: request.order.status === OrderStatus.READY && Boolean(request.order.packingConfirmedAt), version: request.order.version };
    });
    if (result.ready) await this.orders.assignCourier(actor, orderId, { courierId: actor.id, version: result.version });
    return this.prisma.marketplaceDeliveryRequest.findUniqueOrThrow({ where: { orderId } });
  }

  async publishDue(now = new Date()) {
    if (this.publishing) return;
    this.publishing = true;
    try {
      const due = await this.prisma.marketplaceDeliveryRequest.findMany({ where: { mode: MarketplaceDeliveryMode.NETWORK, status: MarketplaceDeliveryStatus.WAITING, offerAt: { lte: now } }, select: { orderId: true }, orderBy: { offerAt: "asc" }, take: 50 });
      for (const { orderId } of due) {
        const published = await this.prisma.$transaction(async (tx) => {
          const changed = await tx.marketplaceDeliveryRequest.updateMany({ where: { orderId, status: MarketplaceDeliveryStatus.WAITING, order: { status: { in: [OrderStatus.COOKING, OrderStatus.READY] }, courierId: null, cafe: { isActive: true, modules: { some: { key: "ORDERING", enabled: true } } } } }, data: { status: MarketplaceDeliveryStatus.OFFERED, offeredAt: now, version: { increment: 1 } } });
          if (changed.count !== 1) return false;
          const request = await tx.marketplaceDeliveryRequest.findUniqueOrThrow({ where: { orderId }, include: { order: { select: { number: true } }, cafe: { select: { name: true } } } });
          const couriers = await tx.courierApplication.findMany({ where: { status: CourierApplicationStatus.APPROVED, user: { isActive: true, role: Role.COURIER } }, select: { userId: true }, take: 1000 });
          if (couriers.length) await tx.directPushEvent.createMany({ data: couriers.map(({ userId }) => ({
            eventKey: `offer:${orderId}:${request.version}:${userId}`, userId,
            title: `Saçakly · ${request.cafe.name}`, body: `Новый заказ №${request.order.number} доступен для принятия`, offerOrderId: orderId,
          })), skipDuplicates: true });
          await tx.auditLog.create({ data: { action: "delivery.offer.published", entityType: "Order", entityId: orderId, metadata: { cafeId: request.cafeId, intendedCourierCount: couriers.length } } });
          return true;
        });
        if (published) await this.notifications.dispatchDueDirectPushes();
      }
    } finally { this.publishing = false; }
  }
}

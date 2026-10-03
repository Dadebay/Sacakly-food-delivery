import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { toApiResponse } from "../common/api-response";
import { OrderStatus, Prisma, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ACCOUNTING_TIME_ZONE,
  addLocalDays,
  localDateForInstant,
  localDateRange,
  resolveShiftWindow,
} from "./accounting-period";
import {
  InspectionAuditQueryDto,
  InspectionCarryoverQueryDto,
  InspectionOrdersQueryDto,
  InspectionPageDto,
  InspectionRangeDto,
} from "./accounting-inspection.dto";
import { orderAuditSnapshot } from "../orders/order-audit-snapshot";

const actorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
} satisfies Prisma.UserSelect;
const orderSelect = {
  id: true,
  number: true,
  status: true,
  source: true,
  createdAt: true,
  total: true,
  discount: true,
  deliveryFee: true,
  address: true,
  branchName: true,
  deliveryEtrapName: true,
  cancellationReason: true,
  courier: { select: actorSelect },
} satisfies Prisma.OrderSelect;

// Defense in depth for historical metadata. Never expose authentication material
// even if a legacy/domain writer accidentally included it in a business event.
export function sanitizeAudit(value: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(value)) return value.map(sanitizeAudit);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /password|secret|token|authorization|cookie|otp|hash|credential|installationId|privateKey/i.test(
          key,
        )
          ? "[REDACTED]"
          : sanitizeAudit(item ?? null),
      ]),
    );
  }
  return value;
}

function foodAmount(
  total: Prisma.Decimal | null,
  deliveryFee: Prisma.Decimal | null,
) {
  return Number(
    (total ?? new Prisma.Decimal(0)).minus(deliveryFee ?? 0).toFixed(2),
  );
}

@Injectable()
export class AccountingInspectionService {
  constructor(private readonly prisma: PrismaService) {}

  private authorize(actor: AuthUser) {
    // A generic page grant must never silently grant cross-business audit/PII.
    if (actor.role !== Role.ACCOUNTANT && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        "Accounting inspection requires an accountant or owner",
      );
    }
  }

  private async range(tx: Prisma.TransactionClient, query: InspectionRangeDto) {
    if (query.shiftKey) {
      const frozen = await tx.cashHandoff.findUnique({
        where: { shiftKey: query.shiftKey },
      });
      if (frozen) return { start: frozen.periodStart, end: frozen.periodEnd };
      const settings = await tx.accountingSettings.findUnique({
        where: { id: "default" },
      });
      try {
        const window = resolveShiftWindow(
          query.shiftKey,
          settings ?? {
            firstShiftName: "Дневная смена",
            firstShiftStartMinutes: 570,
            secondShiftName: "Ночная смена",
            secondShiftStartMinutes: 1140,
          },
        );
        return { start: window.periodStart, end: window.periodEnd };
      } catch {
        throw new BadRequestException("Invalid shift key");
      }
    }
    const toDate = query.toDate ?? localDateForInstant(new Date());
    try {
      const fromDate = query.fromDate ?? addLocalDays(toDate, -6);
      const range = localDateRange(fromDate, toDate);
      if (
        range.end <= range.start ||
        range.end.getTime() - range.start.getTime() > 366 * 86400000
      )
        throw new Error();
      return range;
    } catch {
      throw new BadRequestException(
        "Invalid accounting range; maximum 366 days",
      );
    }
  }

  async overview(actor: AuthUser, query: InspectionRangeDto) {
    this.authorize(actor);
    return this.prisma.$transaction(
      async (tx) => {
        const range = await this.range(tx, query);
        const createdAt = { gte: range.start, lt: range.end };
        const where = { createdAt };
        const active = { createdAt, status: { not: OrderStatus.CANCELLED } };
        const [
          createdOrders,
          cancelledOrders,
          amounts,
          unreturned,
          cancellationEvents,
          editEvents,
          districts,
          branches,
          reasons,
          most,
          least,
        ] = await Promise.all([
          tx.order.count({ where }),
          tx.order.count({
            where: { ...where, status: OrderStatus.CANCELLED },
          }),
          tx.order.aggregate({
            where: active,
            _sum: { total: true, deliveryFee: true },
          }),
          tx.order.aggregate({
            where: { ...where, status: OrderStatus.DELIVERED },
            _sum: { total: true, deliveryFee: true },
          }),
          tx.orderTransition.count({
            where: { createdAt, toStatus: OrderStatus.CANCELLED },
          }),
          tx.auditLog.count({
            where: { createdAt, action: "order.admin-edited" },
          }),
          tx.order.groupBy({
            by: ["deliveryEtrapName"],
            where: active,
            _count: { _all: true },
            _sum: { total: true, deliveryFee: true },
            orderBy: { _count: { deliveryEtrapName: "desc" } },
          }),
          tx.order.groupBy({
            by: ["branchName"],
            where: active,
            _count: { _all: true },
            _sum: { total: true, deliveryFee: true },
            orderBy: { _count: { branchName: "desc" } },
          }),
          tx.order.groupBy({
            by: ["cancellationReason"],
            where: { ...where, status: OrderStatus.CANCELLED },
            _count: { _all: true },
            _sum: { total: true, deliveryFee: true },
            orderBy: { _count: { cancellationReason: "desc" } },
          }),
          tx.orderItem.groupBy({
            by: ["productId", "productName"],
            where: { order: active },
            _sum: { quantity: true },
            orderBy: [
              { _sum: { quantity: "desc" } },
              { productId: "asc" },
              { productName: "asc" },
            ],
            take: 10,
          }),
          tx.orderItem.groupBy({
            by: ["productId", "productName"],
            where: { order: active },
            _sum: { quantity: true },
            orderBy: [
              { _sum: { quantity: "asc" } },
              { productId: "asc" },
              { productName: "asc" },
            ],
            take: 10,
          }),
        ]);
        // PostgreSQL timezone/date grouping cannot be expressed by Prisma groupBy.
        // Parameterized SQL returns at most 367 calendar buckets, never order rows.
        const daily = await tx.$queryRaw<
          Array<{ date: string; orders: number; cancelled: number }>
        >`
        SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ashgabat', 'YYYY-MM-DD') AS date,
          count(*)::int AS orders,
          count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
        FROM "Order" WHERE "createdAt" >= ${range.start} AND "createdAt" < ${range.end}
        GROUP BY 1 ORDER BY 1`;
        const byDate = new Map(daily.map((day) => [day.date, day]));
        const series = [];
        for (
          let date = localDateForInstant(range.start);
          date <= localDateForInstant(new Date(range.end.getTime() - 1));
          date = addLocalDays(date, 1)
        ) {
          series.push(byDate.get(date) ?? { date, orders: 0, cancelled: 0 });
        }
        return toApiResponse({
          periodStart: range.start,
          periodEnd: range.end,
          timeZone: ACCOUNTING_TIME_ZONE,
          summary: {
            createdOrders,
            cancelledOrders,
            cancellationRate: createdOrders
              ? Math.round((cancelledOrders / createdOrders) * 10000) / 100
              : 0,
            orderedFoodAmount: foodAmount(
              amounts._sum.total,
              amounts._sum.deliveryFee,
            ),
            deliveredUnreturnedAmount: foodAmount(
              unreturned._sum.total,
              unreturned._sum.deliveryFee,
            ),
            cancellationEvents,
            editEvents,
          },
          districts: districts.map((group) => ({
            name: group.deliveryEtrapName ?? "Район не определён",
            count: group._count._all,
            foodAmount: foodAmount(group._sum.total, group._sum.deliveryFee),
          })),
          branches: branches.map((group) => ({
            name: group.branchName ?? "Филиал не указан",
            count: group._count._all,
            foodAmount: foodAmount(group._sum.total, group._sum.deliveryFee),
          })),
          cancellationReasons: reasons.map((group) => ({
            name: group.cancellationReason || "Причина не записана",
            count: group._count._all,
            foodAmount: foodAmount(group._sum.total, group._sum.deliveryFee),
          })),
          mostOrderedProducts: most.map((group) => ({
            productId: group.productId,
            name: group.productName,
            quantity: group._sum.quantity ?? 0,
          })),
          leastOrderedProducts: least.map((group) => ({
            productId: group.productId,
            name: group.productName,
            quantity: group._sum.quantity ?? 0,
          })),
          daily: series,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }

  async orders(actor: AuthUser, query: InspectionOrdersQueryDto) {
    this.authorize(actor);
    return this.prisma.$transaction(
      async (tx) => {
        const range = await this.range(tx, query);
        const handoff =
          query.basis === "cashReturned" && query.shiftKey
            ? await tx.cashHandoff.findUnique({
                where: { shiftKey: query.shiftKey },
                select: { id: true },
              })
            : null;
        const where: Prisma.OrderWhereInput = {
          ...(query.basis === "cashReturned"
            ? {
                cashSettlement: {
                  is: handoff
                    ? { cashHandoffId: handoff.id }
                    : {
                        operatorTakenAt: { gte: range.start, lt: range.end },
                        status: { in: ["CONFIRMED", "RECONCILED"] },
                      },
                },
              }
            : { createdAt: { gte: range.start, lt: range.end } }),
          status: query.status,
          number: query.number,
        };
        const [items, total] = await Promise.all([
          tx.order.findMany({
            where,
            select: orderSelect,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          tx.order.count({ where }),
        ]);
        return toApiResponse({
          items: items.map((order) => ({
            ...order,
            foodAmount: foodAmount(order.total, order.deliveryFee),
          })),
          total,
          page: query.page,
          limit: query.limit,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async carryover(actor: AuthUser, query: InspectionCarryoverQueryDto) {
    this.authorize(actor);
    return this.prisma.$transaction(
      async (tx) => {
        const range = await this.range(tx, query);
        const requested = query.direction === "in" ? range.start : range.end;
        const now = new Date();
        const isProvisional = requested > now;
        const boundary = isProvisional ? now : requested;
        const active = [
          OrderStatus.COOKING,
          OrderStatus.READY,
          OrderStatus.ASSIGNED_TO_COURIER,
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.DELIVERED,
        ];
        const where: Prisma.OrderWhereInput = {
          createdAt: { lt: boundary },
          OR: [
            { status: { in: active } },
            {
              transitions: {
                some: {
                  createdAt: { gte: boundary },
                  fromStatus: { in: active },
                },
              },
            },
          ],
        };
        if (query.direction === "in" && isProvisional)
          return {
            items: [],
            total: 0,
            page: query.page,
            limit: query.limit,
            boundary: requested.toISOString(),
            isProvisional,
          };
        const [orders, total] = await Promise.all([
          tx.order.findMany({
            where,
            include: {
              items: true,
              courier: { select: actorSelect },
              transitions: {
                where: { createdAt: { gte: boundary } },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: 1,
              },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          tx.order.count({ where }),
        ]);
        const items = await Promise.all(
          orders.map(async (order) => {
            const nextEdit = await tx.auditLog.findFirst({
              where: {
                entityType: "Order",
                entityId: order.id,
                action: {
                  in: [
                    "order.admin-edited",
                    "order.transitioned",
                    "order.packing-confirmed",
                    "order.courier-assigned",
                    "order.courier-reassigned",
                    "order.cancelled",
                  ],
                },
                createdAt: { gte: boundary },
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            });
            const metadata = nextEdit?.metadata;
            const before =
              metadata &&
              typeof metadata === "object" &&
              !Array.isArray(metadata)
                ? metadata.before
                : null;
            const snapshot = nextEdit
              ? (before ?? null)
              : orderAuditSnapshot(order);
            const statusAtBoundary =
              order.transitions[0]?.fromStatus ?? order.status;
            return {
              id: order.id,
              number: order.number,
              status: order.status,
              source: order.source,
              createdAt: order.createdAt,
              total: order.total,
              discount: order.discount,
              deliveryFee: order.deliveryFee,
              foodAmount: foodAmount(order.total, order.deliveryFee),
              address: order.address,
              branchName: order.branchName,
              deliveryEtrapName: order.deliveryEtrapName,
              cancellationReason: order.cancellationReason,
              courier: order.courier,
              statusAtBoundary,
              historicalSnapshotAvailable: snapshot !== null,
              snapshot: snapshot
                ? {
                    ...(snapshot as Prisma.JsonObject),
                    status: statusAtBoundary,
                  }
                : null,
            };
          }),
        );
        return toApiResponse({
          items,
          total,
          page: query.page,
          limit: query.limit,
          boundary,
          isProvisional,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }

  async order(actor: AuthUser, id: string) {
    this.authorize(actor);
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        ...orderSelect,
        cook: { select: actorSelect },
        version: true,
        customerNote: true,
        subtotal: true,
        latitude: true,
        longitude: true,
        entrance: true,
        floor: true,
        apartment: true,
        branchAddress: true,
        assignedAt: true,
        deliveredAt: true,
        completedAt: true,
        packingConfirmedAt: true,
        loyaltyPointsEarned: true,
        loyaltyPointsSpent: true,
        gifts: true,
        rating: true,
        customer: { select: { phone: true, firstName: true, lastName: true } },
        items: {
          select: {
            id: true,
            productName: true,
            variantName: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            preparationMinutes: true,
          },
          orderBy: { id: "asc" },
        },
        transitions: {
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
            actor: { select: actorSelect },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        cashSettlement: {
          include: {
            operator: { select: actorSelect },
            accountant: { select: actorSelect },
          },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    const events = await this.prisma.auditLog.findMany({
      where: { entityType: "Order", entityId: id },
      select: { action: true, actor: { select: actorSelect } },
      distinct: ["actorId", "action"],
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const participants = new Map<
      string,
      {
        actor: NonNullable<(typeof events)[number]["actor"]>;
        actions: string[];
      }
    >();
    for (const event of events) {
      if (!event.actor) continue;
      const entry = participants.get(event.actor.id) ?? {
        actor: event.actor,
        actions: [],
      };
      if (!entry.actions.includes(event.action))
        entry.actions.push(event.action);
      participants.set(event.actor.id, entry);
    }
    for (const event of order.transitions) {
      const entry = participants.get(event.actor.id) ?? {
        actor: event.actor,
        actions: [],
      };
      const action = `transition:${event.toStatus}`;
      if (!entry.actions.includes(action)) entry.actions.push(action);
      participants.set(event.actor.id, entry);
    }
    const actualCourierUnknown = Boolean(
      await this.prisma.auditLog.findFirst({
        where: {
          entityType: "Order",
          entityId: id,
          action: "order.historical-completion-requested",
          metadata: { path: ["actualCourierUnknown"], equals: true },
        },
        select: { id: true },
      }),
    );
    const { customer, cashSettlement, ...fields } = order;
    return toApiResponse({
      ...fields,
      participants: [...participants.values()],
      actualCourierUnknown,
      foodAmount: foodAmount(order.total, order.deliveryFee),
      customerPhone: customer.phone,
      customerName: [customer.firstName, customer.lastName]
        .filter(Boolean)
        .join(" "),
      settlement: cashSettlement,
    });
  }

  async audit(
    actor: AuthUser,
    query: InspectionAuditQueryDto | InspectionPageDto,
    orderId?: string,
  ) {
    this.authorize(actor);
    return this.prisma.$transaction(
      async (tx) => {
        const order = orderId
          ? await tx.order.findUnique({
              where: { id: orderId },
              select: {
                id: true,
                cashSettlement: { select: { cashHandoffId: true } },
              },
            })
          : null;
        if (orderId && !order) throw new NotFoundException("Order not found");
        const receiptIds = orderId
          ? await tx.receiptPrintTask.findMany({
              where: { orderId },
              select: { id: true },
            })
          : [];
        const range = orderId ? null : await this.range(tx, query);
        const filters = query as InspectionAuditQueryDto;
        const where: Prisma.AuditLogWhereInput = orderId
          ? {
              OR: [
                { entityType: "Order", entityId: orderId },
                {
                  entityType: "ReceiptPrintTask",
                  entityId: { in: receiptIds.map(({ id }) => id) },
                },
                ...(order?.cashSettlement?.cashHandoffId
                  ? [
                      {
                        entityType: "CashHandoff",
                        entityId: order.cashSettlement.cashHandoffId,
                      },
                    ]
                  : []),
              ],
            }
          : {
              createdAt: { gte: range!.start, lt: range!.end },
              actorId: filters.actorId,
              action: filters.action,
              entityType: filters.entityType,
            };
        const [items, total] = await Promise.all([
          tx.auditLog.findMany({
            where,
            select: {
              id: true,
              action: true,
              entityType: true,
              entityId: true,
              metadata: true,
              createdAt: true,
              actor: { select: actorSelect },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          tx.auditLog.count({ where }),
        ]);
        // Resolve labels in batches for this page, including legacy events without snapshots.
        const receiptEvents = items.filter(
          (event) => event.entityType === "ReceiptPrintTask" && event.entityId,
        );
        const receipts = await tx.receiptPrintTask.findMany({
          where: { id: { in: receiptEvents.map((event) => event.entityId!) } },
          select: { id: true, orderId: true },
        });
        const receiptOrders = new Map(
          receipts.map((receipt) => [receipt.id, receipt.orderId]),
        );
        const eventOrderId = (event: (typeof items)[number]) =>
          event.entityType === "Order"
            ? event.entityId
            : event.entityType === "ReceiptPrintTask"
              ? (receiptOrders.get(event.entityId ?? "") ?? null)
              : null;
        const orderIds = items
          .map(eventOrderId)
          .filter((id): id is string =>
            Boolean(
              id &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                id,
              ),
            ),
          );
        const orders = await tx.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, number: true },
        });
        const orderNumbers = new Map(
          orders.map((order) => [order.id, order.number]),
        );
        const relatedIds = (value: Prisma.JsonValue): string[] => {
          if (!value || typeof value !== "object") return [];
          if (Array.isArray(value)) return value.flatMap(relatedIds);
          return Object.entries(value).flatMap(([key, item]) =>
            /^(courierId|previousCourierId|cookId|operatorId|accountantId|technicalCourierId)$/.test(
              key,
            ) &&
            typeof item === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              item,
            )
              ? [item]
              : relatedIds(item ?? null),
          );
        };
        const references = new Map(
          items.map((event) => [event.id, relatedIds(event.metadata)]),
        );
        const people = await tx.user.findMany({
          where: { id: { in: [...new Set([...references.values()].flat())] } },
          select: actorSelect,
        });
        return toApiResponse({
          items: items.map((event) => ({
            ...event,
            orderId: orderNumbers.has(eventOrderId(event) ?? "")
              ? eventOrderId(event)
              : null,
            orderNumber: orderNumbers.get(eventOrderId(event) ?? "") ?? null,
            relatedActors: people.filter((person) =>
              references.get(event.id)?.includes(person.id),
            ),
            metadata: sanitizeAudit(event.metadata),
          })),
          total,
          page: query.page,
          limit: query.limit,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

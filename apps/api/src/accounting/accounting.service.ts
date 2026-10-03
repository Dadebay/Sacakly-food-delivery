import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { toApiResponse } from "../common/api-response";
import {
  CashHandoffStatus,
  CashSettlementStatus,
  OrderStatus,
  Prisma,
  Role,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  type AccountingRangeQueryDto,
  type ConfirmCashHandoffDto,
  type SubmitCashHandoffDto,
  type UpdateAccountingSettingsDto,
} from "./accounting.dto";
import {
  ACCOUNTING_TIME_ZONE,
  addLocalDays,
  enumerateShiftWindows,
  localDateForInstant,
  localDateRange,
  minutesToTime,
  resolveShiftWindow,
  timeToMinutes,
} from "./accounting-period";

const handoffInclude = {
  submittedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  confirmedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.CashHandoffInclude;

type HandoffWithActors = Prisma.CashHandoffGetPayload<{
  include: typeof handoffInclude;
}>;

function handoffResponse(handoff: HandoffWithActors) {
  return {
    ...handoff,
    expectedAmount: Number(handoff.expectedAmount),
    declaredAmount: Number(handoff.declaredAmount),
  };
}

function decimalSum(values: Array<{ amount: Prisma.Decimal }>) {
  return (
    Math.round(
      values.reduce((sum, item) => sum + Number(item.amount), 0) * 100,
    ) / 100
  );
}

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  private async settingsRecord() {
    return this.prisma.accountingSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
  }

  private settingsResponse(
    settings: Awaited<ReturnType<AccountingService["settingsRecord"]>>,
  ) {
    return {
      firstShiftName: settings.firstShiftName,
      firstShiftStart: minutesToTime(settings.firstShiftStartMinutes),
      secondShiftName: settings.secondShiftName,
      secondShiftStart: minutesToTime(settings.secondShiftStartMinutes),
      timeZone: ACCOUNTING_TIME_ZONE,
      updatedAt: settings.updatedAt,
    };
  }

  private range(
    query: AccountingRangeQueryDto,
    defaultDays: number,
    maxDays: number,
  ) {
    const today = localDateForInstant(new Date());
    const toDate = query.toDate ?? today;
    const fromDate = query.fromDate ?? addLocalDays(toDate, -(defaultDays - 1));
    let dateRange: ReturnType<typeof localDateRange>;
    try {
      dateRange = localDateRange(fromDate, toDate);
    } catch {
      throw new BadRequestException("Invalid accounting date range");
    }
    if (fromDate > toDate) {
      throw new BadRequestException("fromDate must not be later than toDate");
    }
    const days = Math.round(
      (dateRange.end.getTime() - dateRange.start.getTime()) / 86_400_000,
    );
    if (days > maxDays) {
      throw new BadRequestException(
        `Accounting range cannot exceed ${maxDays} days`,
      );
    }
    return { fromDate, toDate, ...dateRange };
  }

  async settings() {
    return toApiResponse(this.settingsResponse(await this.settingsRecord()));
  }

  async updateSettings(actor: AuthUser, dto: UpdateAccountingSettingsDto) {
    const firstStart = timeToMinutes(dto.firstShiftStart);
    const secondStart = timeToMinutes(dto.secondShiftStart);
    const firstName = dto.firstShiftName.trim();
    const secondName = dto.secondShiftName.trim();
    if (!firstName || !secondName) {
      throw new BadRequestException("Shift names cannot be empty");
    }
    if (firstStart >= secondStart) {
      throw new BadRequestException(
        "The first shift must start before the second shift",
      );
    }
    const settings = await this.prisma.$transaction(async (tx) => {
      const before = await tx.accountingSettings.findUnique({ where: { id: "default" } });
      const updated = await tx.accountingSettings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          firstShiftName: firstName,
          firstShiftStartMinutes: firstStart,
          secondShiftName: secondName,
          secondShiftStartMinutes: secondStart,
        },
        update: {
          firstShiftName: firstName,
          firstShiftStartMinutes: firstStart,
          secondShiftName: secondName,
          secondShiftStartMinutes: secondStart,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "accounting.settings_updated",
          entityType: "AccountingSettings",
          entityId: updated.id,
          metadata: {
            before: toApiResponse(before),
            after: toApiResponse(updated),
            firstShiftName: firstName,
            firstShiftStart: dto.firstShiftStart,
            secondShiftName: secondName,
            secondShiftStart: dto.secondShiftStart,
          },
        },
      });
      return updated;
    });
    return toApiResponse(this.settingsResponse(settings));
  }

  async shifts(query: AccountingRangeQueryDto) {
    const settings = await this.settingsRecord();
    const range = this.range(query, 3, 366);
    const windows = enumerateShiftWindows(
      range.fromDate,
      range.toDate,
      settings,
    );
    const first = windows[0];
    const last = windows.at(-1);
    if (!first || !last) return [];
    const [settlements, handoffs] = await Promise.all([
      this.prisma.cashSettlement.findMany({
        where: {
          operatorTakenAt: { gte: first.periodStart, lt: last.periodEnd },
          status: {
            in: [
              CashSettlementStatus.CONFIRMED,
              CashSettlementStatus.RECONCILED,
            ],
          },
        },
        select: {
          amount: true,
          status: true,
          operatorTakenAt: true,
          cashHandoffId: true,
        },
      }),
      this.prisma.cashHandoff.findMany({
        where: { shiftKey: { in: windows.map(({ shiftKey }) => shiftKey) } },
        include: handoffInclude,
      }),
    ]);
    const handoffByShift = new Map(
      handoffs.map((handoff) => [handoff.shiftKey, handoff]),
    );
    const now = new Date();
    return toApiResponse(
      windows.map((window) => {
        const handoff = handoffByShift.get(window.shiftKey) ?? null;
        const periodStart = handoff?.periodStart ?? window.periodStart;
        const periodEnd = handoff?.periodEnd ?? window.periodEnd;
        const shiftSettlements = settlements.filter(
          (settlement) =>
            settlement.operatorTakenAt &&
            settlement.operatorTakenAt >= periodStart &&
            settlement.operatorTakenAt < periodEnd,
        );
        const available = shiftSettlements.filter(
          (settlement) =>
            settlement.status === CashSettlementStatus.CONFIRMED &&
            !settlement.cashHandoffId,
        );
        const isComplete = periodEnd <= now;
        const state = handoff
          ? handoff.status
          : !isComplete
            ? "OPEN"
            : available.length
              ? "READY"
              : "EMPTY";
        return {
          ...window,
          shiftName: handoff?.shiftName ?? window.shiftName,
          periodStart,
          periodEnd,
          isComplete,
          expectedAmount: handoff
            ? Number(handoff.expectedAmount)
            : decimalSum(shiftSettlements),
          availableAmount: decimalSum(available),
          settlementCount: handoff?.settlementCount ?? shiftSettlements.length,
          canSubmit: isComplete && !handoff && available.length > 0,
          state,
          handoff: handoff ? handoffResponse(handoff) : null,
        };
      }),
    );
  }

  async submit(actor: AuthUser, dto: SubmitCashHandoffDto) {
    const settings = await this.settingsRecord();
    let window: ReturnType<typeof resolveShiftWindow>;
    try {
      window = resolveShiftWindow(dto.shiftKey, settings);
    } catch {
      throw new BadRequestException("Invalid shift key");
    }
    if (window.periodEnd > new Date()) {
      throw new ConflictException("The shift is still open");
    }
    try {
      const handoff = await this.prisma.$transaction(
        async (tx) => {
          const exists = await tx.cashHandoff.findUnique({
            where: { shiftKey: window.shiftKey },
          });
          if (exists)
            throw new ConflictException("This shift was already submitted");
          const settlements = await tx.cashSettlement.findMany({
            where: {
              status: CashSettlementStatus.CONFIRMED,
              cashHandoffId: null,
              operatorTakenAt: {
                gte: window.periodStart,
                lt: window.periodEnd,
              },
            },
            select: { id: true, amount: true },
          });
          if (!settlements.length) {
            throw new ConflictException(
              "This shift has no cash ready for handoff",
            );
          }
          const expectedAmount = decimalSum(settlements);
          const created = await tx.cashHandoff.create({
            data: {
              shiftKey: window.shiftKey,
              shiftName: window.shiftName,
              periodStart: window.periodStart,
              periodEnd: window.periodEnd,
              submittedById: actor.id,
              expectedAmount,
              declaredAmount: dto.declaredAmount ?? expectedAmount,
              settlementCount: settlements.length,
              note: dto.note?.trim() || null,
            },
          });
          const claimed = await tx.cashSettlement.updateMany({
            where: {
              id: { in: settlements.map(({ id }) => id) },
              status: CashSettlementStatus.CONFIRMED,
              cashHandoffId: null,
            },
            data: { cashHandoffId: created.id, operatorId: actor.id },
          });
          if (claimed.count !== settlements.length) {
            throw new ConflictException(
              "Cash changed while the shift was submitted",
            );
          }
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              action: "cash_handoff.submitted",
              entityType: "CashHandoff",
              entityId: created.id,
              metadata: {
                shiftKey: created.shiftKey,
                expectedAmount,
                declaredAmount: dto.declaredAmount ?? expectedAmount,
                settlementCount: settlements.length,
              },
            },
          });
          return tx.cashHandoff.findUniqueOrThrow({
            where: { id: created.id },
            include: handoffInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return toApiResponse(handoffResponse(handoff));
    } catch (error) {
      if (
        error instanceof ConflictException ||
        (typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error.code === "P2002" || error.code === "P2034"))
      ) {
        throw new ConflictException(
          "This shift was already submitted or changed",
        );
      }
      throw error;
    }
  }

  async confirm(actor: AuthUser, id: string, dto: ConfirmCashHandoffDto) {
    try {
      const handoff = await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.cashHandoff.findUnique({
            where: { id },
            include: {
              settlements: {
                select: { id: true, orderId: true, status: true },
              },
            },
          });
          if (!current) throw new NotFoundException("Cash handoff not found");
          if (current.status !== CashHandoffStatus.SUBMITTED) {
            throw new ConflictException("Cash handoff is already confirmed");
          }
          if (
            current.settlements.length !== current.settlementCount ||
            current.settlements.some(
              ({ status }) => status !== CashSettlementStatus.CONFIRMED,
            )
          ) {
            throw new ConflictException("Cash handoff contents changed");
          }
          const orderIds = current.settlements.map(({ orderId }) => orderId);
          const updatedOrders = await tx.order.updateMany({
            where: { id: { in: orderIds }, status: OrderStatus.CASH_RETURNED },
            data: { status: OrderStatus.RECONCILED, version: { increment: 1 } },
          });
          if (updatedOrders.count !== orderIds.length) {
            throw new ConflictException("One or more handoff orders changed");
          }
          const now = new Date();
          await tx.cashSettlement.updateMany({
            where: {
              cashHandoffId: id,
              status: CashSettlementStatus.CONFIRMED,
            },
            data: {
              status: CashSettlementStatus.RECONCILED,
              accountantId: actor.id,
              reconciledAt: now,
            },
          });
          await tx.orderTransition.createMany({
            data: orderIds.map((orderId) => ({
              orderId,
              actorId: actor.id,
              fromStatus: OrderStatus.CASH_RETURNED,
              toStatus: OrderStatus.RECONCILED,
              note: `Cash handoff ${current.shiftKey}`,
            })),
          });
          const confirmed = await tx.cashHandoff.updateMany({
            where: { id, status: CashHandoffStatus.SUBMITTED },
            data: {
              status: CashHandoffStatus.CONFIRMED,
              confirmedById: actor.id,
              confirmedAt: now,
              confirmationNote: dto.note?.trim() || null,
            },
          });
          if (confirmed.count !== 1) {
            throw new ConflictException(
              "Cash handoff changed while confirming",
            );
          }
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              action: "cash_handoff.confirmed",
              entityType: "CashHandoff",
              entityId: id,
              metadata: {
                shiftKey: current.shiftKey,
                expectedAmount: Number(current.expectedAmount),
                declaredAmount: Number(current.declaredAmount),
                settlementCount: current.settlementCount,
              },
            },
          });
          return tx.cashHandoff.findUniqueOrThrow({
            where: { id },
            include: handoffInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return toApiResponse(handoffResponse(handoff));
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034"
      ) {
        throw new ConflictException("Cash handoff changed while confirming");
      }
      throw error;
    }
  }

  async report(actor: AuthUser, query: AccountingRangeQueryDto) {
    const range = this.range(query, 7, 366);
    const [settlements, handoffs, cancelledOrders, productGroups, createdOrders] =
      await Promise.all([
        this.prisma.cashSettlement.findMany({
          where: {
            operatorTakenAt: { gte: range.start, lt: range.end },
            status: {
              in: [
                CashSettlementStatus.CONFIRMED,
                CashSettlementStatus.RECONCILED,
              ],
            },
          },
          select: {
            amount: true,
            status: true,
            operatorTakenAt: true,
            cashHandoffId: true,
          },
        }),
        this.prisma.cashHandoff.findMany({
          where: { periodStart: { gte: range.start, lt: range.end } },
          include: handoffInclude,
          orderBy: { periodStart: "desc" },
        }),
        this.prisma.order.count({
          where: {
            status: OrderStatus.CANCELLED,
            createdAt: { gte: range.start, lt: range.end },
          },
        }),
        (actor.role === Role.SUPER_ADMIN || actor.role === Role.ACCOUNTANT)
          ? this.prisma.orderItem.groupBy({
              by: ["productId", "productName"],
              where: {
                order: {
                  cashSettlement: {
                    is: {
                      operatorTakenAt: { gte: range.start, lt: range.end },
                    },
                  },
                },
              },
              _sum: { quantity: true, lineTotal: true },
              orderBy: { _sum: { quantity: "desc" } },
              take: 10,
            })
          : Promise.resolve([]),
        this.prisma.order.count({ where: { createdAt: { gte: range.start, lt: range.end } } }),
      ]);
    const collectedAmount = decimalSum(settlements);
    const submitted = settlements.filter(({ cashHandoffId }) => cashHandoffId);
    const reconciled = settlements.filter(
      ({ status }) => status === CashSettlementStatus.RECONCILED,
    );
    const outstanding = settlements.filter(
      ({ status, cashHandoffId }) =>
        status === CashSettlementStatus.CONFIRMED && !cashHandoffId,
    );
    const dailyMap = new Map<string, { amount: number; count: number }>();
    for (const settlement of settlements) {
      if (!settlement.operatorTakenAt) continue;
      const date = localDateForInstant(settlement.operatorTakenAt);
      const current = dailyMap.get(date) ?? { amount: 0, count: 0 };
      current.amount += Number(settlement.amount);
      current.count += 1;
      dailyMap.set(date, current);
    }
    const daily: Array<{ date: string; amount: number; orderCount: number }> =
      [];
    for (
      let date = range.fromDate;
      date <= range.toDate;
      date = addLocalDays(date, 1)
    ) {
      const value = dailyMap.get(date) ?? { amount: 0, count: 0 };
      daily.push({
        date,
        amount: Math.round(value.amount * 100) / 100,
        orderCount: value.count,
      });
    }
    const completedOrders = settlements.length;
    return toApiResponse({
      fromDate: range.fromDate,
      toDate: range.toDate,
      timeZone: ACCOUNTING_TIME_ZONE,
      summary: {
        declaredHandoffAmount: decimalSum(handoffs.map((handoff) => ({ amount: handoff.declaredAmount }))),
        handoffDiscrepancy: decimalSum(handoffs.map((handoff) => ({ amount: handoff.declaredAmount.minus(handoff.expectedAmount) }))),
        collectedAmount,
        completedOrders,
        averageOrderAmount: completedOrders
          ? Math.round((collectedAmount / completedOrders) * 100) / 100
          : 0,
        submittedAmount: decimalSum(submitted),
        confirmedAmount: decimalSum(reconciled),
        outstandingAmount: decimalSum(outstanding),
        cancelledOrders,
        cancellationRate:
          createdOrders
            ? Math.round(
                (cancelledOrders / createdOrders) *
                  10_000,
              ) / 100
            : 0,
      },
      daily,
      handoffs: handoffs.map(handoffResponse),
      popularProducts: productGroups.map((product) => ({
        productId: product.productId,
        productName: product.productName,
        quantity: product._sum.quantity ?? 0,
        revenue: Number(product._sum.lineTotal ?? 0),
      })),
    });
  }
}

import { BadRequestException, Injectable } from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { OrderStatus, Prisma, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertCafeMember } from "./marketplace-policy";
import { CafeReportPeriodDto } from "./marketplace-reports.dto";

const COLLECTED: OrderStatus[] = [OrderStatus.CASH_RETURNED, OrderStatus.RECONCILED];

function validDay(day: string) {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

export function reportPeriod(dto: CafeReportPeriodDto) {
  if (!validDay(dto.from) || !validDay(dto.to)) throw new BadRequestException("Invalid report date");
  const start = new Date(`${dto.from}T00:00:00+05:00`);
  const end = new Date(new Date(`${dto.to}T00:00:00+05:00`).getTime() + 86_400_000);
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days < 1 || days > 93) throw new BadRequestException("Report range must be 1–93 days");
  return { gte: start, lt: end };
}

@Injectable()
export class MarketplaceReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async orders(actor: AuthUser, cafeId: string, dto: CafeReportPeriodDto) {
    const membership = await this.prisma.cafeMembership.findUnique({ where: { cafeId_userId: { cafeId, userId: actor.id } } });
    assertCafeMember(actor.id, cafeId, membership, [Role.ADMIN, Role.ACCOUNTANT]);
    const createdAt = reportPeriod(dto);
    const where = { cafeId, createdAt };
    // One query keeps headline amounts and branch rows on the same DB snapshot.
    const branches = await this.prisma.order.groupBy({ by: ["branchId", "branchName", "status"], where, _count: { _all: true }, _sum: { total: true } });
    const sum = (rows: Array<{ total: Prisma.Decimal | null }>) => rows.reduce((amount, row) => amount.plus(row.total ?? 0), new Prisma.Decimal(0)).toFixed(2);
    const sums = branches.map((row) => ({ status: row.status, total: row._sum.total }));
    const branchMap = new Map<string, { branchId: string | null; branchName: string | null; orders: number; value: Prisma.Decimal; collected: Prisma.Decimal }>();
    for (const row of branches) {
      const key = `${row.branchId ?? "legacy"}:${row.branchName ?? ""}`;
      const current = branchMap.get(key) ?? { branchId: row.branchId, branchName: row.branchName, orders: 0, value: new Prisma.Decimal(0), collected: new Prisma.Decimal(0) };
      if (row.status !== OrderStatus.CANCELLED) {
        current.orders += row._count._all;
        current.value = current.value.plus(row._sum.total ?? 0);
      }
      if (COLLECTED.includes(row.status)) current.collected = current.collected.plus(row._sum.total ?? 0);
      branchMap.set(key, current);
    }
    return {
      cafeId, from: dto.from, to: dto.to,
      orders: branches.reduce((count, row) => count + row._count._all, 0),
      cancelled: branches.filter((row) => row.status === OrderStatus.CANCELLED).reduce((count, row) => count + row._count._all, 0),
      orderValue: sum(sums.filter((row) => row.status !== OrderStatus.CANCELLED)),
      cashCollected: sum(sums.filter((row) => COLLECTED.includes(row.status))),
      deliveredAwaitingCash: sum(sums.filter((row) => row.status === OrderStatus.DELIVERED)),
      branches: [...branchMap.values()].filter((row) => row.orders > 0).map((row) => ({ branchId: row.branchId, branchName: row.branchName, orders: row.orders, orderValue: row.value.toFixed(2), cashCollected: row.collected.toFixed(2) })),
    };
  }
}

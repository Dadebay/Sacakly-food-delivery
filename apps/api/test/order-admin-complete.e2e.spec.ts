import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { OrderStatus, Role, type Order } from "../src/generated/prisma/client";
import { LoyaltyService } from "../src/loyalty/loyalty.service";
import { PrismaService } from "../src/prisma/prisma.service";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";

describe("administrator completion for a courier without the app", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let inactiveCourierId: string;
  const users = new Map<Role, string>();
  const tokens = new Map<Role, string>();
  const reason =
    "Курьер ушёл без приложения.\nДоставку проверили звонком клиенту, 105 TMT получены и сданы администратору.";
  const auth = (role = Role.ADMIN) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });
  const complete = (
    order: Order,
    extra: Record<string, unknown> = {},
    role = Role.ADMIN,
  ) =>
    request(server)
      .patch(`/api/v1/orders/${order.id}/admin-complete`)
      .set(auth(role))
      .send({ version: order.version, reason, cashReceived: true, ...extra });
  const create = (
    status: OrderStatus = OrderStatus.ASSIGNED_TO_COURIER,
    courierId: string | null = users.get(Role.COURIER)!,
  ) =>
    prisma.order.create({
      data: {
        customerId: users.get(Role.CUSTOMER)!,
        courierId,
        status,
        subtotal: 100,
        discount: 10,
        deliveryFee: 15,
        total: 105,
        loyaltyPointsEarned: 7,
        address: "Admin completion fixture",
        latitude: 37.95,
        longitude: 58.38,
        assignedAt: courierId ? new Date("2026-09-01T00:00:00Z") : null,
      },
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    for (const [index, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: { phone: `+993610088${index}0`, role },
      });
      users.set(role, user.id);
      tokens.set(
        role,
        await app
          .get(JwtService)
          .signAsync({ sub: user.id, phone: user.phone, role }),
      );
    }
    inactiveCourierId = (
      await prisma.user.create({
        data: { phone: "+99361008899", role: Role.COURIER, isActive: false },
      })
    ).id;
  });
  afterAll(async () => {
    if (prisma)
      await prisma.user.updateMany({
        where: { id: { in: [...users.values()] } },
        data: { isActive: false },
      });
    await app?.close();
  });

  it("denies every other role and unauthenticated clients without changing the order", async () => {
    const order = await create();
    for (const role of Object.values(Role).filter(
      (role) => ![Role.ADMIN, Role.SUPER_ADMIN].includes(role),
    )) {
      await complete(order, {}, role).expect(403);
    }
    await request(server)
      .patch(`/api/v1/orders/${order.id}/admin-complete`)
      .send({ version: 1, reason, cashReceived: true })
      .expect(401);
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: order.status, version: 1 });
    expect(
      await prisma.cashSettlement.count({ where: { orderId: order.id } }),
    ).toBe(0);
  });

  it("requires a detailed trimmed reason, true cash confirmation and valid version", async () => {
    const order = await create();
    for (const extra of [
      { reason: undefined },
      { reason: null },
      { reason: "  " },
      { reason: "x".repeat(19) },
      { reason: "x".repeat(501) },
      { reason: 42 },
      { cashReceived: undefined },
      { cashReceived: false },
      { cashReceived: "true" },
      { cashReceived: 1 },
      { version: undefined },
      { version: 0 },
      { version: "1" },
      { total: 0 },
      { courierId: null },
      { courierId: "bad-id" },
    ])
      await complete(order, extra).expect(400);
    await complete(order, { version: 99 }).expect(409);
    expect(
      await prisma.cashSettlement.count({ where: { orderId: order.id } }),
    ).toBe(0);
    expect(
      await prisma.orderTransition.count({ where: { orderId: order.id } }),
    ).toBe(0);
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ version: 1, status: order.status });
  });

  it("recovers every active stage, preserves real courier and records full reason and cash once", async () => {
    const statuses = [
      OrderStatus.COOKING,
      OrderStatus.READY,
      OrderStatus.ASSIGNED_TO_COURIER,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];
    for (const [index, status] of statuses.entries()) {
      const order = await create(status);
      if (status === OrderStatus.DELIVERED) {
        await prisma.$transaction((tx) =>
          app.get(LoyaltyService).award(tx, order.customerId, order.id, 7),
        );
      }
      const beforePoints = (
        await prisma.user.findUniqueOrThrow({ where: { id: order.customerId } })
      ).pointsBalance;
      const actor = index % 2 ? Role.SUPER_ADMIN : Role.ADMIN;
      const response = await complete(
        order,
        { reason: `  ${reason}  ` },
        actor,
      ).expect(200);
      const completed = response.body as OrderResponseDto;
      expect(completed).toMatchObject({
        status: "CASH_RETURNED",
        version: 2,
        courierId: order.courierId,
        total: 105,
        deliveryFee: 15,
        packingConfirmedAt: null,
      });
      expect(completed.completedAt).toBeTruthy();
      expect(completed.deliveredAt).toBeTruthy();
      expect(completed.assignedAt).toBe(order.assignedAt!.toISOString());
      const transitions = await prisma.orderTransition.findMany({
        where: { orderId: order.id },
      });
      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toMatchObject({
        fromStatus: status,
        toStatus: "CASH_RETURNED",
        actorId: users.get(actor),
        note: reason,
      });
      const settlement = await prisma.cashSettlement.findUniqueOrThrow({
        where: { orderId: order.id },
      });
      expect(Number(settlement.amount)).toBe(90);
      expect(settlement).toMatchObject({
        courierId: order.courierId,
        operatorId: users.get(actor),
        status: "CONFIRMED",
        cashHandoffId: null,
      });
      expect(settlement.operatorTakenAt?.toISOString()).toBe(
        completed.completedAt,
      );
      expect(
        await prisma.auditLog.findFirstOrThrow({
          where: { entityId: order.id, action: "order.admin-completed" },
        }),
      ).toMatchObject({
        actorId: users.get(actor),
        metadata: {
          reason,
          cashReceived: true,
          deliveryConfirmed: true,
          courierId: order.courierId,
          receivedTotal: "105",
          accountingAmount: "90",
        },
      });
      expect(
        (
          await prisma.user.findUniqueOrThrow({
            where: { id: order.customerId },
          })
        ).pointsBalance,
      ).toBe(beforePoints + (status === OrderStatus.DELIVERED ? 0 : 7));
      expect(
        await prisma.loyaltyEntry.count({
          where: { orderId: order.id, kind: "EARN" },
        }),
      ).toBe(1);
      await complete(order).expect(409);
      await complete({ ...order, version: 2 }).expect(409);
      const detail = await request(server)
        .get(`/api/v1/orders/${order.id}`)
        .set(auth())
        .expect(200);
      expect((detail.body as OrderResponseDto).transitions[0].note).toBe(
        reason,
      );
    }
  });

  it("requires a real active courier when none was assigned and never replaces an existing courier", async () => {
    const order = await create(OrderStatus.READY, null);
    await complete(order).expect(400);
    for (const courierId of [
      randomUUID(),
      users.get(Role.CUSTOMER),
      inactiveCourierId,
    ])
      await complete(order, { courierId }).expect(409);
    const result = await complete(order, {
      courierId: users.get(Role.COURIER),
      reason: "я".repeat(500),
    }).expect(200);
    expect((result.body as OrderResponseDto).courierId).toBe(
      users.get(Role.COURIER),
    );
    expect((result.body as OrderResponseDto).transitions[0].note).toBe(
      "я".repeat(500),
    );
    const other = await prisma.user.create({
      data: { phone: "+99361008898", role: Role.COURIER },
    });
    const assigned = await create();
    await complete(assigned, { courierId: other.id }).expect(409);
    const legacyInactive = await create(
      OrderStatus.OUT_FOR_DELIVERY,
      inactiveCourierId,
    );
    await complete(legacyInactive).expect(200);
  });

  it("rejects terminal orders and existing cash settlements", async () => {
    for (const status of [
      OrderStatus.CANCELLED,
      OrderStatus.CASH_RETURNED,
      OrderStatus.RECONCILED,
    ]) {
      const order = await create(status);
      await complete(order).expect(409);
      expect(
        await prisma.orderTransition.count({ where: { orderId: order.id } }),
      ).toBe(0);
    }
    const inconsistent = await create();
    await prisma.cashSettlement.create({
      data: {
        orderId: inconsistent.id,
        courierId: inconsistent.courierId!,
        amount: 90,
      },
    });
    await complete(inconsistent).expect(409);
    await request(server)
      .patch(`/api/v1/orders/${randomUUID()}/admin-complete`)
      .set(auth())
      .send({ version: 1, reason, cashReceived: true })
      .expect(404);
  });

  it("rolls back completion when a dependent ledger write fails", async () => {
    const order = await create();
    const award = vi
      .spyOn(app.get(LoyaltyService), "award")
      .mockRejectedValueOnce(new Error("Test ledger failure"));
    try {
      await complete(order).expect(500);
    } finally {
      award.mockRestore();
    }
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: order.status, version: 1, completedAt: null });
    expect(
      await prisma.cashSettlement.count({ where: { orderId: order.id } }),
    ).toBe(0);
    expect(
      await prisma.orderTransition.count({ where: { orderId: order.id } }),
    ).toBe(0);
  });

  it("permits only one concurrent completion and includes its food cash in shift reporting", async () => {
    const order = await create();
    const responses = await Promise.all([
      complete(order),
      complete(order, {}, Role.SUPER_ADMIN),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      await prisma.cashSettlement.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      await prisma.orderTransition.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityId: order.id, action: "order.admin-completed" },
      }),
    ).toBe(1);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ashgabat",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const report = await request(server)
      .get(`/api/v1/accounting/report?fromDate=${date}&toDate=${date}`)
      .set(auth(Role.SUPER_ADMIN))
      .expect(200);
    expect(
      (report.body as { summary: { outstandingAmount: number } }).summary
        .outstandingAmount,
    ).toBeGreaterThanOrEqual(90);
  });
});

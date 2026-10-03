import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import {
  CashSettlementStatus,
  OrderStatus,
  Role,
  type User,
} from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";

type Actor = "admin" | "accountant" | "superAdmin" | "customer" | "courier";
type HandoffResponse = {
  id: string;
  status: "SUBMITTED" | "CONFIRMED";
  shiftKey: string;
  expectedAmount: number;
  declaredAmount: number;
  settlementCount: number;
};
type ReportResponse = {
  summary: {
    collectedAmount: number;
    completedOrders: number;
    confirmedAmount: number;
    outstandingAmount: number;
  };
  popularProducts: Array<{
    productName: string;
    quantity: number;
    revenue: number;
  }>;
};

describe("shift cash handoffs and accounting reports", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];
  let users: Record<Actor, User>;
  let tokens: Record<Actor, string>;
  const orderIds: string[] = [];
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    const roles: Record<Actor, Role> = {
      admin: Role.ADMIN,
      accountant: Role.ACCOUNTANT,
      superAdmin: Role.SUPER_ADMIN,
      customer: Role.CUSTOMER,
      courier: Role.COURIER,
    };
    users = Object.fromEntries(
      await Promise.all(
        Object.entries(roles).map(async ([key, role], index) => [
          key,
          await prisma.user.create({
            data: {
              phone: `+993650009${String(index).padStart(2, "0")}`,
              firstName: key,
              role,
            },
          }),
        ]),
      ),
    ) as Record<Actor, User>;
    tokens = Object.fromEntries(
      await Promise.all(
        Object.entries(users).map(async ([key, user]) => [
          key,
          await jwt.signAsync({
            sub: user.id,
            phone: user.phone,
            role: user.role,
          }),
        ]),
      ),
    ) as Record<Actor, string>;

    const category = await prisma.category.create({
      data: { name: "Accounting products", slug: "accounting-products" },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Accounting bestseller",
        slug: "accounting-bestseller",
        description: "Analytics fixture",
        price: 50,
      },
    });
    for (const [index, amount] of [100, 150].entries()) {
      const order = await prisma.order.create({
        data: {
          customerId: users.customer.id,
          courierId: users.courier.id,
          status: OrderStatus.CASH_RETURNED,
          subtotal: amount,
          total: amount,
          address: "Accounting test address",
          latitude: 37.95,
          longitude: 58.38,
          completedAt: new Date("2026-08-20T05:00:00.000Z"),
          items: {
            create: {
              productId: product.id,
              productName: product.name,
              unitPrice: amount,
              quantity: index + 1,
              lineTotal: amount,
            },
          },
          cashSettlement: {
            create: {
              courierId: users.courier.id,
              amount,
              status: CashSettlementStatus.CONFIRMED,
              operatorTakenAt: new Date(`2026-08-20T0${5 + index}:00:00.000Z`),
            },
          },
        },
      });
      orderIds.push(order.id);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("denies settings and financial report mutations to the wrong roles", async () => {
    const settings = await request(server)
      .get("/api/v1/accounting/settings")
      .set(bearer(tokens.admin))
      .expect(200);
    expect((settings.body as { firstShiftStart: string }).firstShiftStart).toBe(
      "09:30",
    );
    await request(server)
      .patch("/api/v1/accounting/settings")
      .set(bearer(tokens.admin))
      .send({
        firstShiftName: "Day",
        firstShiftStart: "09:30",
        secondShiftName: "Night",
        secondShiftStart: "19:00",
      })
      .expect(403);
    await request(server)
      .patch("/api/v1/accounting/settings")
      .set(bearer(tokens.superAdmin))
      .send({
        firstShiftName: "Дневная смена",
        firstShiftStart: "19:00",
        secondShiftName: "Ночная смена",
        secondShiftStart: "09:30",
      })
      .expect(400);
    await request(server)
      .patch("/api/v1/accounting/settings")
      .set(bearer(tokens.superAdmin))
      .send({
        firstShiftName: "Дневная смена",
        firstShiftStart: "09:30",
        secondShiftName: "Ночная смена",
        secondShiftStart: "19:00",
      })
      .expect(200);
    await request(server)
      .get("/api/v1/accounting/report?fromDate=2026-08-20&toDate=2026-08-20")
      .set(bearer(tokens.admin))
      .expect(403);
  });

  it("submits one completed shift exactly once and reconciles it atomically", async () => {
    const shifts = await request(server)
      .get("/api/v1/accounting/shifts?fromDate=2026-08-20&toDate=2026-08-20")
      .set(bearer(tokens.admin))
      .expect(200);
    expect(shifts.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          shiftKey: "2026-08-20:first",
          state: "READY",
          expectedAmount: 250,
          settlementCount: 2,
          canSubmit: true,
        }),
      ]),
    );

    await request(server)
      .patch(`/api/v1/orders/${orderIds[0]}/transition`)
      .set(bearer(tokens.admin))
      .send({ status: OrderStatus.RECONCILED, version: 1 })
      .expect(403);
    await request(server)
      .patch(`/api/v1/orders/${orderIds[0]}/transition`)
      .set(bearer(tokens.accountant))
      .send({ status: OrderStatus.RECONCILED, version: 1 })
      .expect(403);
    await request(server)
      .get("/api/v1/orders?limit=10")
      .set(bearer(tokens.accountant))
      .expect(403);
    await request(server)
      .get(`/api/v1/orders/${orderIds[0]}`)
      .set(bearer(tokens.accountant))
      .expect(403);

    const submittedResponse = await request(server)
      .post("/api/v1/accounting/handoffs")
      .set(bearer(tokens.admin))
      .send({
        shiftKey: "2026-08-20:first",
        declaredAmount: 249,
        note: "Short by 1",
      })
      .expect(201);
    const submitted = submittedResponse.body as HandoffResponse;
    expect(submitted).toMatchObject({
      shiftKey: "2026-08-20:first",
      expectedAmount: 250,
      declaredAmount: 249,
      settlementCount: 2,
      status: "SUBMITTED",
    });
    await request(server)
      .post("/api/v1/accounting/handoffs")
      .set(bearer(tokens.admin))
      .send({ shiftKey: "2026-08-20:first" })
      .expect(409);
    await request(server)
      .patch(`/api/v1/accounting/handoffs/${submitted.id}/confirm`)
      .set(bearer(tokens.admin))
      .send({})
      .expect(403);
    const confirmations = await Promise.all([
      request(server)
        .patch(`/api/v1/accounting/handoffs/${submitted.id}/confirm`)
        .set(bearer(tokens.accountant))
        .send({ note: "Cash counted" }),
      request(server)
        .patch(`/api/v1/accounting/handoffs/${submitted.id}/confirm`)
        .set(bearer(tokens.accountant))
        .send({ note: "Concurrent duplicate" }),
    ]);
    expect(confirmations.map(({ status }) => status).sort()).toEqual([200, 409]);
    const confirmation = confirmations.find(({ status }) => status === 200);
    expect((confirmation?.body as HandoffResponse).status).toBe("CONFIRMED");

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
    });
    const settlements = await prisma.cashSettlement.findMany({
      where: { orderId: { in: orderIds } },
    });
    expect(
      orders.every(
        ({ status, version }) =>
          status === OrderStatus.RECONCILED && version === 2,
      ),
    ).toBe(true);
    expect(
      settlements.every(
        ({ status, accountantId, cashHandoffId }) =>
          status === CashSettlementStatus.RECONCILED &&
          accountantId === users.accountant.id &&
          cashHandoffId === submitted.id,
      ),
    ).toBe(true);
  });

  it("shows financial data to accountants and product analytics to accountants and super admins", async () => {
    const accountant = await request(server)
      .get("/api/v1/accounting/report?fromDate=2026-08-20&toDate=2026-08-20")
      .set(bearer(tokens.accountant))
      .expect(200);
    const accountantReport = accountant.body as ReportResponse;
    expect(accountantReport.summary).toMatchObject({
      collectedAmount: 250,
      completedOrders: 2,
      confirmedAmount: 250,
      outstandingAmount: 0,
      declaredHandoffAmount: 249,
      handoffDiscrepancy: -1,
    });
    expect(accountantReport.popularProducts[0]).toMatchObject({ quantity: 3, revenue: 250 });

    const superAdmin = await request(server)
      .get("/api/v1/accounting/report?fromDate=2026-08-20&toDate=2026-08-20")
      .set(bearer(tokens.superAdmin))
      .expect(200);
    const superAdminReport = superAdmin.body as ReportResponse;
    expect(superAdminReport.popularProducts[0]).toMatchObject({
      productName: "Accounting bestseller",
      quantity: 3,
      revenue: 250,
    });
  });

  it("records only discounted food for accounting while the customer pays delivery", async () => {
    const order = await prisma.order.create({
      data: {
        customerId: users.customer.id,
        courierId: users.courier.id,
        status: OrderStatus.DELIVERED,
        subtotal: 120,
        discount: 20,
        deliveryFee: 15,
        total: 115,
        address: "Food-only accounting test address",
        latitude: 37.95,
        longitude: 58.38,
      },
    });

    const response = await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(tokens.courier))
      .send({ status: OrderStatus.CASH_RETURNED, version: order.version })
      .expect(200);
    expect((response.body as { total: number }).total).toBe(115);

    const settlement = await prisma.cashSettlement.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(Number(settlement.amount)).toBe(100);
  });
});

import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { OrderStatus, Role, type User } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import type {
  InspectionAuditPageDto,
  InspectionCarryoverPageDto,
  InspectionOrdersPageDto,
  InspectionOrderDetailDto,
  InspectionOverviewDto,
} from "../src/accounting/accounting-inspection.dto";

describe("accountant inspection and shift carryover", () => {
  let app: INestApplication,
    prisma: PrismaService,
    server: Parameters<typeof request>[0];
  const users = {} as Record<Role, User>;
  const tokens = {} as Record<Role, string>;
  let etrapId: number;
  let productId: string,
    branchId: string,
    crossingId: string,
    boundaryId: string;
  const auth = (role = Role.ACCOUNTANT) => ({
    Authorization: `Bearer ${tokens[role]}`,
  });
  const root = "/api/v1/accounting";
  const month = "fromDate=2025-02-01&toDate=2025-02-28";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    const jwt = app.get(JwtService);
    for (const [index, role] of Object.values(Role).entries()) {
      users[role] = await prisma.user.create({
        data: {
          phone: `+993650052${index.toString().padStart(2, "0")}`,
          firstName: `Inspection ${role}`,
          role,
        },
      });
      tokens[role] = await jwt.signAsync({
        sub: users[role].id,
        phone: users[role].phone,
        role,
      });
    }
    await prisma.accountingSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: { firstShiftStartMinutes: 570, secondShiftStartMinutes: 1140 },
    });
    const category = await prisma.category.create({
      data: { name: "Inspection", slug: "inspection-fixture" },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Долгое блюдо",
        slug: "inspection-product",
        description: "Fixture",
        price: 50,
      },
    });
    productId = product.id;
    const welayat = await prisma.welayat.create({
      data: { nameRu: "Inspection", nameTk: "Inspection" },
    });
    etrapId = (
      await prisma.etrap.create({
        data: {
          welayatId: welayat.id,
          nameRu: "Inspection",
          nameTk: "Inspection",
          isDeliveryEnabled: true,
          price: 15,
        },
      })
    ).id;
    const branch = await prisma.branch.create({
      data: {
        name: "Inspection kitchen",
        address: "Kitchen",
        latitude: 37.87,
        longitude: 58.31,
      },
    });
    branchId = branch.id;
    const makeOrder = (
      createdAt: string,
      status: OrderStatus = OrderStatus.COOKING,
      quantity = 1,
    ) =>
      prisma.order.create({
        data: {
          customerId: users.CUSTOMER.id,
          branchId,
          branchName: branch.name,
          createdAt: new Date(createdAt),
          status,
          subtotal: 50 * quantity,
          discount: 5,
          deliveryFee: 15,
          total: 50 * quantity + 10,
          address: "Первый адрес",
          latitude: 37.87,
          longitude: 58.31,
          deliveryEtrapName: "Тестовый район",
          cancellationReason:
            status === OrderStatus.CANCELLED ? "Клиент передумал" : null,
          items: {
            create: {
              productId,
              productName: product.name,
              quantity,
              unitPrice: 50,
              lineTotal: quantity * 50,
              preparationMinutes: 520,
            },
          },
        },
      });
    crossingId = (await makeOrder("2025-02-01T13:50:00.000Z")).id;
    boundaryId = (
      await makeOrder("2025-02-01T14:00:00.000Z", OrderStatus.DELIVERED, 2)
    ).id;
    await makeOrder("2025-02-02T05:00:00.000Z", OrderStatus.CANCELLED);
    await makeOrder("2025-02-28T18:59:59.999Z", OrderStatus.RECONCILED);
    await makeOrder("2025-02-28T19:00:00.000Z"); // March 1 local, excluded.
  });
  afterAll(async () => {
    await app.close();
  });

  it("allows accountants/owners and denies other roles, including an expanded page grant", async () => {
    for (const path of [
      "overview",
      "orders",
      "audit",
      "carryover?shiftKey=2025-02-01:first",
      `orders/${crossingId}`,
      `orders/${crossingId}/audit`,
    ]) {
      await request(server).get(`${root}/${path}`).expect(401);
      for (const role of [
        Role.ADMIN,
        Role.OPERATOR,
        Role.COOK,
        Role.COURIER,
        Role.CUSTOMER,
      ])
        await request(server)
          .get(`${root}/${path}`)
          .set(auth(role))
          .expect(403);
      await request(server)
        .get(`${root}/${path}`)
        .set(auth(Role.SUPER_ADMIN))
        .expect(200);
      await request(server).get(`${root}/${path}`).set(auth()).expect(200);
    }
    await prisma.adminRolePageAccess.upsert({
      where: { role: Role.OPERATOR },
      create: { role: Role.OPERATOR, allowedPages: ["ACCOUNTING"] },
      update: { allowedPages: ["ACCOUNTING"] },
    });
    try {
      await request(server)
        .get(`${root}/overview`)
        .set(auth(Role.OPERATOR))
        .expect(403);
    } finally {
      await prisma.adminRolePageAccess.delete({
        where: { role: Role.OPERATOR },
      });
    }
    await request(server)
      .patch(`/api/v1/orders/${crossingId}/cancel`)
      .set(auth())
      .send({ version: 1, reason: "Forbidden" })
      .expect(403);
  });

  it("uses a complete local calendar month, separates delivery and includes cancelled reasons", async () => {
    const response = await request(server)
      .get(`${root}/overview?${month}`)
      .set(auth())
      .expect(200);
    const data = response.body as InspectionOverviewDto;
    expect(data.periodStart).toBe("2025-01-31T19:00:00.000Z");
    expect(data.periodEnd).toBe("2025-02-28T19:00:00.000Z");
    expect(data.summary).toMatchObject({
      createdOrders: 4,
      cancelledOrders: 1,
      cancellationRate: 25,
      orderedFoodAmount: 185,
      deliveredUnreturnedAmount: 95,
    });
    expect(data.daily).toHaveLength(28);
    expect(data.daily[0]).toMatchObject({ orders: 2, cancelled: 0 });
    expect(data.cancellationReasons).toEqual([
      { name: "Клиент передумал", count: 1, foodAmount: 45 },
    ]);
    expect(data.districts[0]).toMatchObject({
      name: "Тестовый район",
      count: 3,
      foodAmount: 185,
    });
    expect(data.mostOrderedProducts[0]).toMatchObject({
      productId,
      quantity: 4,
    });
    const first = await request(server)
      .get(`${root}/orders?${month}&page=1&limit=2`)
      .set(auth())
      .expect(200);
    const second = await request(server)
      .get(`${root}/orders?${month}&page=2&limit=2`)
      .set(auth())
      .expect(200);
    expect((first.body as InspectionOrdersPageDto).total).toBe(4);
    expect(
      new Set(
        [
          ...(first.body as InspectionOrdersPageDto).items,
          ...(second.body as InspectionOrdersPageDto).items,
        ].map((order) => order.id),
      ).size,
    ).toBe(4);
    const filtered = await request(server)
      .get(`${root}/orders?${month}&status=CANCELLED`)
      .set(auth())
      .expect(200);
    expect(
      (filtered.body as InspectionOrdersPageDto).items[0]?.cancellationReason,
    ).toBe("Клиент передумал");
  });

  it("snapshots real edits, persists failed attempts, and reconstructs work crossing a shift", async () => {
    await request(server)
      .patch(`/api/v1/orders/${crossingId}/admin-edit`)
      .set(auth(Role.ADMIN))
      .send({
        version: 1,
        deliveryEtrapId: etrapId,
        items: [{ productId, quantity: 3 }],
        address: "Исправленный адрес",
        latitude: 37.87,
        longitude: 58.31,
        customerNote: "Добавили две порции",
      })
      .expect(200);
    const edit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: crossingId, action: "order.admin-edited" },
    });
    expect(edit.metadata).toMatchObject({
      before: { address: "Первый адрес", total: 60, items: [{ quantity: 1 }] },
      after: { address: "Исправленный адрес", items: [{ quantity: 3 }] },
    });
    await prisma.auditLog.update({
      where: { id: edit.id },
      data: { createdAt: new Date("2025-02-01T14:10:00.000Z") },
    });
    await request(server)
      .patch(`/api/v1/orders/${crossingId}/admin-edit`)
      .set(auth(Role.ADMIN))
      .send({
        version: 1,
        deliveryEtrapId: etrapId,
        items: [{ productId, quantity: 1 }],
        address: "Stale",
        latitude: 37.87,
        longitude: 58.31,
      })
      .expect(409);
    expect(
      await prisma.auditLog.count({
        where: { entityId: crossingId, action: "order.request.rejected" },
      }),
    ).toBeGreaterThan(0);
    for (const [shiftKey, direction] of [
      ["2025-02-01:first", "out"],
      ["2025-02-01:second", "in"],
    ]) {
      const result = await request(server)
        .get(`${root}/carryover?shiftKey=${shiftKey}&direction=${direction}`)
        .set(auth())
        .expect(200);
      const data = result.body as InspectionCarryoverPageDto;
      expect(data.items.map((order) => order.id)).toContain(crossingId);
      expect(data.items.map((order) => order.id)).not.toContain(boundaryId);
      expect(data.items.find((order) => order.id === crossingId)).toMatchObject(
        {
          statusAtBoundary: "COOKING",
          historicalSnapshotAvailable: true,
          snapshot: { address: "Первый адрес", items: [{ quantity: 1 }] },
        },
      );
    }
    await request(server)
      .patch(`/api/v1/orders/${crossingId}/cancel`)
      .set(auth(Role.ADMIN))
      .send({ version: 2, reason: "После передачи смены" })
      .expect(200);
    const cancelled = await prisma.orderTransition.findFirstOrThrow({
      where: { orderId: crossingId, toStatus: "CANCELLED" },
    });
    await prisma.orderTransition.update({
      where: { id: cancelled.id },
      data: { createdAt: new Date("2025-02-01T14:20:00.000Z") },
    });
    const after = await request(server)
      .get(`${root}/carryover?shiftKey=2025-02-01:first`)
      .set(auth())
      .expect(200);
    expect(
      (after.body as InspectionCarryoverPageDto).items.find(
        (order) => order.id === crossingId,
      ),
    ).toMatchObject({ status: "CANCELLED", statusAtBoundary: "COOKING" });
    const audit = await request(server)
      .get(`${root}/orders/${crossingId}/audit?limit=1&page=1`)
      .set(auth())
      .expect(200);
    expect((audit.body as InspectionAuditPageDto).total).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("uses frozen shift boundaries and packet membership without counting a cash order twice", async () => {
    const handoff = await prisma.cashHandoff.create({
      data: {
        shiftKey: "2025-02-02:first",
        shiftName: "Frozen shift",
        periodStart: new Date("2025-02-02T04:30:00Z"),
        periodEnd: new Date("2025-02-02T14:00:00Z"),
        submittedById: users.ADMIN.id,
        expectedAmount: 95,
        declaredAmount: 90,
        settlementCount: 1,
      },
    });
    await prisma.cashSettlement.create({
      data: {
        orderId: boundaryId,
        amount: 95,
        courierId: users.COURIER.id,
        operatorTakenAt: new Date("2025-02-02T10:00:00Z"),
        status: "CONFIRMED",
        cashHandoffId: handoff.id,
      },
    });
    await prisma.order.update({
      where: { id: boundaryId },
      data: {
        status: "CASH_RETURNED",
        transitions: {
          create: {
            fromStatus: "DELIVERED",
            toStatus: "CASH_RETURNED",
            actorId: users.COURIER.id,
            createdAt: new Date("2025-02-02T10:00:00Z"),
          },
        },
      },
    });
    const rows = await request(server)
      .get(`${root}/orders?shiftKey=2025-02-02:first&basis=cashReturned`)
      .set(auth())
      .expect(200);
    expect(
      (rows.body as InspectionOrdersPageDto).items.map((item) => item.id),
    ).toEqual([boundaryId]);
    const carry = await request(server)
      .get(`${root}/carryover?shiftKey=2025-02-02:first`)
      .set(auth())
      .expect(200);
    expect(
      (carry.body as InspectionCarryoverPageDto).items.map((item) => item.id),
    ).not.toContain(boundaryId);
    await prisma.accountingSettings.update({
      where: { id: "default" },
      data: { firstShiftStartMinutes: 600 },
    });
    const frozen = await request(server)
      .get(`${root}/overview?shiftKey=2025-02-02:first`)
      .set(auth())
      .expect(200);
    expect((frozen.body as InspectionOverviewDto).periodStart).toBe(
      "2025-02-02T04:30:00.000Z",
    );
    await prisma.accountingSettings.update({
      where: { id: "default" },
      data: { firstShiftStartMinutes: 570 },
    });
  });

  it("does not expose secrets and supports exact actor/action filters", async () => {
    await prisma.auditLog.create({
      data: {
        actorId: users.ADMIN.id,
        action: "inspection.security-fixture",
        entityType: "Fixture",
        createdAt: new Date("2025-02-01T05:00:00Z"),
        metadata: {
          token: "private-fixture",
          nested: { passwordHash: "private-fixture", amount: 10 },
        },
      },
    });
    const response = await request(server)
      .get(
        `${root}/audit?${month}&action=inspection.security-fixture&actorId=${users.ADMIN.id}`,
      )
      .set(auth())
      .expect(200);
    expect((response.body as InspectionAuditPageDto).total).toBe(1);
    expect(JSON.stringify(response.body)).not.toContain("private-fixture");
    expect(
      (response.body as InspectionAuditPageDto).items[0]?.metadata,
    ).toMatchObject({
      token: "[REDACTED]",
      nested: { passwordHash: "[REDACTED]", amount: 10 },
    });
  });

  it("accepts 520 cooking minutes, rejects invalid values, and audits other admin edits", async () => {
    await request(server)
      .patch(`/api/v1/catalog/products/${productId}`)
      .set(auth(Role.ADMIN))
      .send({ preparationMinutes: 520 })
      .expect(200);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .preparationMinutes,
    ).toBe(520);
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: { entityId: productId, action: "catalog.product.updated" },
        })
      ).metadata,
    ).toMatchObject({
      before: { preparationMinutes: 0 },
      after: { preparationMinutes: 520 },
    });
    for (const value of [-1, 1441, 5.2])
      await request(server)
        .patch(`/api/v1/catalog/products/${productId}`)
        .set(auth(Role.ADMIN))
        .send({ preparationMinutes: value })
        .expect(400);
    await request(server)
      .put("/api/v1/contacts")
      .set(auth(Role.ADMIN))
      .send({ displayName: "Inspection contact", phone: "+99312000000" })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: { actorId: users.ADMIN.id, action: "contacts.updated" },
      }),
    ).toBe(1);
  });

  it("validates date, shift, paging and identifier boundaries", async () => {
    for (const query of [
      "toDate=2025-02-30",
      "fromDate=2025-02-02&toDate=2025-02-01",
      "fromDate=2023-01-01&toDate=2025-01-01",
      "shiftKey=2025-02-30:first",
    ])
      await request(server)
        .get(`${root}/overview?${query}`)
        .set(auth())
        .expect(400);
    for (const query of [
      "limit=101",
      "page=0",
      "page=1.1",
      "number=-1",
      "status=UNKNOWN",
      "basis=invalid",
    ])
      await request(server)
        .get(`${root}/orders?${query}`)
        .set(auth())
        .expect(400);
    await request(server)
      .get(`${root}/carryover?direction=invalid`)
      .set(auth())
      .expect(400);
    await request(server).get(`${root}/orders/invalid`).set(auth()).expect(400);
    await request(server)
      .get(`${root}/orders/00000000-0000-4000-8000-000000000000`)
      .set(auth())
      .expect(404);
  });
  it("names every participant and resolves legacy journal order numbers without exposing other roles", async () => {
    const order = await prisma.order.create({
      data: {
        customerId: users.CUSTOMER.id,
        courierId: users.COURIER.id,
        cookId: users.COOK.id,
        status: "RECONCILED",
        subtotal: 50,
        total: 65,
        deliveryFee: 15,
        address: "Readable accounting",
        latitude: 37.87,
        longitude: 58.31,
        cashSettlement: {
          create: {
            courierId: users.COURIER.id,
            operatorId: users.OPERATOR.id,
            accountantId: users.ACCOUNTANT.id,
            amount: 50,
            status: "RECONCILED",
          },
        },
        transitions: {
          create: {
            actorId: users.ADMIN.id,
            fromStatus: "DELIVERED",
            toStatus: "CASH_RETURNED",
          },
        },
      },
    });
    const event = await prisma.auditLog.create({
      data: {
        actorId: users.OPERATOR.id,
        entityType: "Order",
        entityId: order.id,
        action: "order.historical-completion-requested",
        metadata: { actualCourierUnknown: true, courierId: users.COURIER.id },
      },
    });
    const detail = (
      await request(server)
        .get(`${root}/orders/${order.id}`)
        .set(auth())
        .expect(200)
    ).body as InspectionOrderDetailDto;
    expect(detail.number).toBe(order.number);
    expect(detail.courier).toMatchObject({
      id: users.COURIER.id,
      firstName: users.COURIER.firstName,
    });
    expect(detail.cook).toMatchObject({ id: users.COOK.id });
    expect(detail.actualCourierUnknown).toBe(true);
    expect(
      detail.participants.find(
        (person) => person.actor.id === users.OPERATOR.id,
      )?.actions,
    ).toEqual(["order.historical-completion-requested"]);
    expect(
      detail.participants.find((person) => person.actor.id === users.ADMIN.id)
        ?.actions,
    ).toEqual(["transition:CASH_RETURNED"]);
    expect(detail.settlement?.operator).toMatchObject({
      id: users.OPERATOR.id,
    });
    expect(detail.settlement?.accountant).toMatchObject({
      id: users.ACCOUNTANT.id,
    });
    const journal = (
      await request(server)
        .get(`${root}/orders/${order.id}/audit`)
        .set(auth())
        .expect(200)
    ).body as InspectionAuditPageDto;
    expect(journal.items.find((item) => item.id === event.id)).toMatchObject({
      orderId: order.id,
      orderNumber: order.number,
      relatedActors: [expect.objectContaining({ id: users.COURIER.id })],
    });
    for (const role of [Role.ADMIN, Role.CUSTOMER, Role.COURIER, Role.OPERATOR])
      await request(server)
        .get(`${root}/orders/${order.id}`)
        .set(auth(role))
        .expect(403);
    const ordinary = (
      await request(server)
        .get(`${root}/orders/${boundaryId}`)
        .set(auth())
        .expect(200)
    ).body as InspectionOrderDetailDto;
    expect(ordinary.actualCourierUnknown).toBe(false);
  });
});

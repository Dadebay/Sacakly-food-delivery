import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { Role } from "../src/generated/prisma/client";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";
import { PrismaService } from "../src/prisma/prisma.service";

describe("order comments from checkout through admin and receipts", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let productId: string;
  let branchId: string;
  let etrapId: number;
  const tokens = new Map<Role, string>();
  const userIds: string[] = [];
  const customerPhone = "+99361009300";
  const location = {
    address: "Comment test address",
    latitude: 37.95,
    longitude: 58.38,
  };
  const auth = (role = Role.CUSTOMER) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });
  const body = (extra: Record<string, unknown> = {}) => ({
    items: [{ productId, quantity: 1 }],
    ...location,
    ...extra,
  });
  const create = (extra: Record<string, unknown> = {}) =>
    request(server).post("/api/v1/orders").set(auth()).send(body(extra));
  const edit = (
    order: OrderResponseDto,
    customerNote: unknown,
    role = Role.ADMIN,
  ) =>
    request(server)
      .patch(`/api/v1/orders/${order.id}/admin-edit`)
      .set(auth(role))
      .send({
        ...body(),
        deliveryEtrapId: etrapId,
        version: order.version,
        customerNote,
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
    for (const [i, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: {
          phone:
            role === Role.CUSTOMER
              ? customerPhone
              : `+993610093${String(i + 1).padStart(2, "0")}`,
          role,
        },
      });
      userIds.push(user.id);
      tokens.set(
        role,
        await app
          .get(JwtService)
          .signAsync({ sub: user.id, phone: user.phone, role }),
      );
    }
    branchId = (
      await prisma.branch.create({
        data: { ...location, name: "Comment test branch" },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: "Comment test dish",
          slug: "comment-test-dish",
          description: "Comment fixture",
          price: 10,
          category: {
            create: {
              name: "Comment test",
              slug: "comment-test",
              receiptPrinterIp: "192.168.0.86",
            },
          },
        },
      })
    ).id;
    etrapId = (
      await prisma.etrap.create({
        data: {
          nameRu: "Comment test etrap",
          nameTk: "Comment test etrap",
          price: 15,
          isDeliveryEnabled: true,
          welayat: {
            create: { nameRu: "Comment test", nameTk: "Comment test" },
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      await prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { isActive: false },
      });
      await prisma.branch.update({
        where: { id: branchId },
        data: { isActive: false },
      });
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: false },
      });
      await prisma.etrap.update({
        where: { id: etrapId },
        data: { isDeliveryEnabled: false },
      });
    } finally {
      await app.close();
    }
  });

  it("persists a multiline customer comment in order lists, details and the frozen receipt", async () => {
    const customerNote = "Без лука. Соус отдельно.\nПозвонить перед доставкой.";
    const response = await create({
      customerNote: `  ${customerNote}  `,
    }).expect(201);
    const order = response.body as OrderResponseDto;
    expect(order.customerNote).toBe(customerNote);
    expect(order.rating).toBeNull();
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ customerNote });
    for (const role of [Role.CUSTOMER, Role.ADMIN, Role.SUPER_ADMIN]) {
      const detail = await request(server)
        .get(`/api/v1/orders/${order.id}`)
        .set(auth(role))
        .expect(200);
      expect(detail.body).toMatchObject({ customerNote });
    }
    const list = await request(server)
      .get(`/api/v1/orders?search=${order.number}`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect((list.body as { items: OrderResponseDto[] }).items).toContainEqual(
      expect.objectContaining({ id: order.id, customerNote }),
    );
    const queued = await prisma.receiptPrintTask.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(queued.plan).toMatchObject({
      metadata: { customerNote },
      jobs: [expect.objectContaining({ printerIp: "192.168.0.86" })],
    });
  });

  it("accepts optional, empty and 500-character comments; rejects invalid input without creating orders", async () => {
    for (const customerNote of [undefined, null, "", " \n  "]) {
      const response = await create({ customerNote }).expect(201);
      expect(response.body).toMatchObject({ customerNote: null });
    }
    const maximum = "я".repeat(500);
    expect(
      (await create({ customerNote: maximum }).expect(201)).body,
    ).toMatchObject({ customerNote: maximum });
    const before = await prisma.order.count();
    for (const customerNote of [
      "я".repeat(501),
      42,
      { text: "Без лука" },
      ["Без лука"],
    ]) {
      await create({ customerNote }).expect(400);
    }
    expect(await prisma.order.count()).toBe(before);
  });

  it("preserves caller comments for all assisted-order roles", async () => {
    for (const role of [Role.OPERATOR, Role.ADMIN, Role.SUPER_ADMIN]) {
      const response = await request(server)
        .post("/api/v1/orders/assisted")
        .set(auth(role))
        .send(
          body({ customerPhone, customerNote: "  Соус отдельно\nБез перца  " }),
        )
        .expect(201);
      expect(response.body).toMatchObject({
        source: "STAFF_PHONE",
        customerNote: "Соус отдельно\nБез перца",
      });
    }
    for (const role of [
      Role.CUSTOMER,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]) {
      await request(server)
        .post("/api/v1/orders/assisted")
        .set(auth(role))
        .send(body({ customerPhone, customerNote: "Без лука" }))
        .expect(403);
    }
  });

  it("audits admin comment edits, rejects stale/forbidden edits and gives reprints the new comment", async () => {
    const original = (await create({ customerNote: "Без лука" }).expect(201))
      .body as OrderResponseDto;
    for (const role of [
      Role.CUSTOMER,
      Role.OPERATOR,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]) {
      await edit(original, "Новый комментарий", role).expect(403);
    }
    await edit(original, "я".repeat(501)).expect(400);
    const customerNote = "Без лука\nИ без перца";
    const edited = (await edit(original, ` ${customerNote} `).expect(200))
      .body as OrderResponseDto;
    expect(edited).toMatchObject({
      customerNote,
      version: original.version + 1,
    });
    await edit(original, "Устаревшее изменение").expect(409);
    expect(
      await prisma.auditLog.count({
        where: { entityId: original.id, action: "order.admin-edited" },
      }),
    ).toBe(1);
    const frozen = await prisma.receiptPrintTask.findFirstOrThrow({
      where: { orderId: original.id },
    });
    expect(frozen.plan).toMatchObject({
      metadata: { customerNote: "Без лука" },
    });
    const reprint = await request(server)
      .post(`/api/v1/receipt-print-tasks/orders/${original.id}/reprint`)
      .set(auth(Role.ADMIN))
      .send({ idempotencyKey: randomUUID() })
      .expect(201);
    const reprintId = (reprint.body as { id: string }).id;
    expect(
      (
        await prisma.receiptPrintTask.findUniqueOrThrow({
          where: { id: reprintId },
        })
      ).plan,
    ).toMatchObject({ metadata: { customerNote } });
    const cleared = (await edit(edited, " \n ", Role.SUPER_ADMIN).expect(200))
      .body as OrderResponseDto;
    expect(cleared.customerNote).toBeNull();
    const preview = await request(server)
      .get(`/api/v1/orders/${original.id}/receipt-print-plan`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(preview.body).toMatchObject({ metadata: { customerNote: null } });
    await prisma.order.update({
      where: { id: original.id },
      data: { status: "OUT_FOR_DELIVERY" },
    });
    await edit(cleared, "Позднее изменение").expect(403);
  });
});

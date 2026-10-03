import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { OtpService } from "../src/auth/otp.service";
import { configureApp } from "../src/bootstrap";
import { OrderStatus, Role } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";

describe("marketplace HTTP tenant boundaries", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let otp: OtpService;
  let server: Parameters<typeof request>[0];
  let cafeA: string;
  let cafeB: string;
  let ownerId: string;
  let merchantId: string;
  let applicantId: string;
  let otherId: string;

  const token = async (id: string) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    return jwt.signAsync({ sub: id, role: user.role, phone: user.phone });
  };
  const auth = async (id: string) => `Bearer ${await token(id)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    otp = app.get(OtpService);
    const suffix = Math.random().toString(36).slice(2, 10);
    const owner = await prisma.user.create({ data: { phone: "+99362969614", role: Role.CUSTOMER } });
    const merchant = await prisma.user.create({ data: { phone: `+99365001${suffix.slice(0, 4)}`, role: Role.CUSTOMER } });
    const applicant = await prisma.user.create({ data: { phone: `+99365002${suffix.slice(0, 4)}`, role: Role.CUSTOMER } });
    const other = await prisma.user.create({ data: { phone: `+99365003${suffix.slice(0, 4)}`, role: Role.CUSTOMER } });
    ownerId = owner.id;
    merchantId = merchant.id;
    applicantId = applicant.id;
    otherId = other.id;
    cafeA = (await prisma.cafe.create({ data: { name: "Cafe A", slug: `market-a-${suffix}` } })).id;
    cafeB = (await prisma.cafe.create({ data: { name: "Cafe B", slug: `market-b-${suffix}` } })).id;
  });

  afterAll(async () => { await app?.close(); });

  it("requires a persisted owner entitlement even for the exact phone", async () => {
    await request(server)
      .get("/api/v1/marketplace/owner/courier-applications")
      .set("Authorization", await auth(ownerId))
      .expect(403);
    const code = (await otp.issue("+99362969614")).code;
    await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99362969614", code })
      .expect(200);
    expect((await prisma.platformOwner.findUnique({ where: { userId: ownerId } }))?.isActive).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).role).toBe(Role.SUPER_ADMIN);
    await request(server)
      .get("/api/v1/marketplace/owner/courier-applications")
      .set("Authorization", await auth(ownerId))
      .expect(200);
    await request(server)
      .get("/api/v1/marketplace/owner/courier-applications")
      .set("Authorization", await auth(otherId))
      .expect(403);
    await request(server)
      .get("/api/v1/marketplace/owner/me")
      .set("Authorization", await auth(ownerId))
      .expect(200);
  });

  it("accepts a courier application and only OWNER can approve it once", async () => {
    await request(server)
      .post("/api/v1/marketplace/courier-applications")
      .set("Authorization", await auth(applicantId))
      .expect(201);
    await request(server)
      .patch(`/api/v1/marketplace/owner/courier-applications/${applicantId}`)
      .set("Authorization", await auth(otherId))
      .send({ decision: "APPROVED" })
      .expect(403);
    await request(server)
      .patch(`/api/v1/marketplace/owner/courier-applications/${applicantId}`)
      .set("Authorization", await auth(ownerId))
      .send({ decision: "APPROVED" })
      .expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: applicantId } })).role).toBe(Role.COURIER);
    await request(server)
      .patch(`/api/v1/marketplace/owner/courier-applications/${applicantId}`)
      .set("Authorization", await auth(ownerId))
      .send({ decision: "REJECTED" })
      .expect(409);
  });

  it("scopes merchant access and module activation to one cafe", async () => {
    await request(server)
      .put(`/api/v1/marketplace/owner/cafes/${cafeA}/members`)
      .set("Authorization", await auth(otherId))
      .send({ userId: merchantId, role: Role.ADMIN, expectedVersion: 0 })
      .expect(403);
    await request(server)
      .put(`/api/v1/marketplace/owner/cafes/${cafeA}/members`)
      .set("Authorization", await auth(ownerId))
      .send({ userId: merchantId, role: Role.ADMIN, expectedVersion: 0 })
      .expect(200);
    const myCafes = await request(server)
      .get("/api/v1/marketplace/merchant/cafes/me")
      .set("Authorization", await auth(merchantId))
      .expect(200);
    expect((myCafes.body as Array<{ cafeId: string }>).map((entry) => entry.cafeId)).toEqual([cafeA]);
    await request(server)
      .put(`/api/v1/marketplace/owner/cafes/${cafeA}/modules/ORDERING`)
      .set("Authorization", await auth(ownerId))
      .send({ enabled: true, expectedVersion: 0 })
      .expect(200);
    await request(server)
      .put(`/api/v1/marketplace/owner/cafes/${cafeA}/modules/ORDERING`)
      .set("Authorization", await auth(ownerId))
      .send({ enabled: false, expectedVersion: 0 })
      .expect(409);
    await request(server)
      .put(`/api/v1/marketplace/owner/cafes/${cafeA}/modules/RECEIPTS`)
      .set("Authorization", await auth(ownerId))
      .send({ enabled: true, expectedVersion: 0 })
      .expect(409);
    await prisma.order.create({ data: { customerId: otherId, cafeId: cafeA, subtotal: 10, total: 10, address: "A", latitude: 37.96, longitude: 58.33 } });
    await prisma.order.create({ data: { customerId: otherId, cafeId: cafeB, subtotal: 20, total: 20, address: "B", latitude: 37.96, longitude: 58.33 } });
    const own = await request(server)
      .get(`/api/v1/marketplace/merchant/cafes/${cafeA}/orders`)
      .set("Authorization", await auth(merchantId))
      .expect(200);
    const ownOrders = own.body as Array<{ total: string }>;
    expect(ownOrders).toHaveLength(1);
    expect(ownOrders[0]?.total).toBe("10");
    await request(server)
      .get(`/api/v1/marketplace/merchant/cafes/${cafeB}/orders`)
      .set("Authorization", await auth(merchantId))
      .expect(403);
    await request(server)
      .get(`/api/v1/marketplace/merchant/cafes/${cafeA}/orders`)
      .set("Authorization", await auth(otherId))
      .expect(403);
  });

  it("lets OWNER onboard a cafe and manage only versioned memberships", async () => {
    await request(server)
      .post("/api/v1/marketplace/owner/cafes")
      .set("Authorization", await auth(otherId))
      .send({ name: "New Cafe", slug: `new-${cafeA}` })
      .expect(403);
    const created = await request(server)
      .post("/api/v1/marketplace/owner/cafes")
      .set("Authorization", await auth(ownerId))
      .send({ name: "New Cafe", slug: `new-${cafeA}` })
      .expect(201);
    const newCafeId = (created.body as { id: string }).id;
    const phone = "+99362969614";
    await request(server)
      .post("/api/v1/marketplace/owner/users/lookup")
      .set("Authorization", await auth(merchantId))
      .send({ phone })
      .expect(403);
    const lookup = await request(server)
      .post("/api/v1/marketplace/owner/users/lookup")
      .set("Authorization", await auth(ownerId))
      .send({ phone })
      .expect(201);
    expect((lookup.body as { id: string }).id).toBe(ownerId);
    const member = await request(server)
      .put(`/api/v1/marketplace/owner/cafes/${newCafeId}/members`)
      .set("Authorization", await auth(ownerId))
      .send({ userId: otherId, role: Role.ADMIN, expectedVersion: 0 })
      .expect(200);
    expect((member.body as { version: number }).version).toBe(1);
    const listed = await request(server)
      .get(`/api/v1/marketplace/owner/cafes/${newCafeId}/members`)
      .set("Authorization", await auth(ownerId))
      .expect(200);
    expect((listed.body as Array<{ userId: string }>).map((entry) => entry.userId)).toEqual([otherId]);
    await request(server)
      .get(`/api/v1/marketplace/owner/cafes/${newCafeId}/members`)
      .set("Authorization", await auth(merchantId))
      .expect(403);
    await request(server)
      .put(`/api/v1/marketplace/owner/cafes/${newCafeId}/members`)
      .set("Authorization", await auth(ownerId))
      .send({ userId: otherId, role: Role.ADMIN, isActive: false, expectedVersion: 0 })
      .expect(409);
    await request(server)
      .put(`/api/v1/marketplace/owner/cafes/${newCafeId}/members`)
      .set("Authorization", await auth(ownerId))
      .send({ userId: otherId, role: Role.ADMIN, isActive: false, expectedVersion: 1 })
      .expect(200);
    expect((await request(server)
      .get("/api/v1/marketplace/merchant/cafes/me")
      .set("Authorization", await auth(otherId))
      .expect(200)).body).toEqual([]);
  });

  it("creates a one-cafe order and routes only to that cafe's branch", async () => {
    const categoryA = await prisma.category.create({ data: { cafeId: cafeA, name: "A menu", slug: `a-menu-${cafeA}` } });
    const categoryB = await prisma.category.create({ data: { cafeId: cafeB, name: "B menu", slug: `b-menu-${cafeB}` } });
    const productA = await prisma.product.create({ data: { categoryId: categoryA.id, name: "A meal", slug: `a-meal-${cafeA}`, description: "A", price: 10 } });
    const productB = await prisma.product.create({ data: { categoryId: categoryB.id, name: "B meal", slug: `b-meal-${cafeB}`, description: "B", price: 20 } });
    const branchA = await prisma.branch.create({ data: { cafeId: cafeA, name: "A kitchen", address: "A street", latitude: 37.97, longitude: 58.35 } });
    await prisma.branch.create({ data: { cafeId: cafeB, name: "B kitchen", address: "B street", latitude: 37.96, longitude: 58.33 } });
    await request(server)
      .post("/api/v1/marketplace/checkout/quote")
      .set("Authorization", await auth(otherId))
      .send({ cafeId: cafeA, items: [{ productId: productA.id, quantity: 1 }, { productId: productB.id, quantity: 1 }] })
      .expect(400);
    await request(server)
      .post("/api/v1/marketplace/checkout/quote")
      .set("Authorization", await auth(otherId))
      .send({ cafeId: cafeA, items: [{ productId: productA.id, quantity: 1 }] })
      .expect(200);
    const response = await request(server)
      .post("/api/v1/marketplace/checkout/orders")
      .set("Authorization", await auth(otherId))
      .send({ cafeId: cafeA, items: [{ productId: productA.id, quantity: 1 }], address: "Customer street", latitude: 37.96, longitude: 58.33 })
      .expect(201);
    const orderId = (response.body as { id: string }).id;
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(saved.cafeId).toBe(cafeA);
    expect(saved.branchId).toBe(branchA.id);
    expect(saved.items.map((item) => item.cafeId)).toEqual([cafeA]);
    expect(await prisma.receiptPrintTask.count({ where: { orderId } })).toBe(0);
    await request(server)
      .post(`/api/v1/receipt-print-tasks/orders/${orderId}/reprint`)
      .set("Authorization", await auth(ownerId))
      .send({ idempotencyKey: "00000000-0000-4000-8000-000000000701" })
      .expect(409);
    await request(server)
      .post("/api/v1/marketplace/checkout/orders")
      .set("Authorization", await auth(otherId))
      .send({ cafeId: cafeA, items: [{ productId: productB.id, quantity: 1 }], address: "Customer street", latitude: 37.96, longitude: 58.33 })
      .expect(400);
  });

  it("lets only OWNER dispatch an approved platform courier across cafes", async () => {
    const suffix = Math.random().toString(36).slice(2, 9);
    const courier = await prisma.user.create({ data: { phone: `+9936600${suffix}`, role: Role.COURIER } });
    await prisma.courierApplication.create({ data: { userId: courier.id, status: "APPROVED", reviewedById: ownerId, reviewedAt: new Date() } });
    const order = await prisma.order.create({
      data: {
        customerId: otherId, cafeId: cafeB, status: OrderStatus.READY,
        packingConfirmedAt: new Date(), subtotal: 25, total: 25,
        address: "Delivery address", latitude: 37.96, longitude: 58.33,
      },
    });
    await request(server)
      .get("/api/v1/marketplace/owner/dispatch/orders")
      .set("Authorization", await auth(merchantId))
      .expect(403);
    const listed = await request(server)
      .get("/api/v1/marketplace/owner/dispatch/orders")
      .set("Authorization", await auth(ownerId))
      .expect(200);
    expect((listed.body as Array<{ id: string }>).some((entry) => entry.id === order.id)).toBe(true);
    await request(server)
      .patch(`/api/v1/marketplace/owner/dispatch/orders/${order.id}/courier`)
      .set("Authorization", await auth(merchantId))
      .send({ courierId: courier.id, version: order.version })
      .expect(403);
    await request(server)
      .patch(`/api/v1/marketplace/owner/dispatch/orders/${order.id}/courier`)
      .set("Authorization", await auth(ownerId))
      .send({ courierId: courier.id, version: order.version })
      .expect(200);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.courierId).toBe(courier.id);
    expect(saved.cafeId).toBe(cafeB);
    await request(server)
      .patch(`/api/v1/marketplace/owner/dispatch/orders/${order.id}/courier`)
      .set("Authorization", await auth(ownerId))
      .send({ courierId: courier.id, version: order.version })
      .expect(409);
  });

  it("does not reactivate a disabled owner entitlement on another OTP login", async () => {
    await prisma.platformOwner.update({ where: { userId: ownerId }, data: { isActive: false } });
    const code = (await otp.issue("+99362969614")).code;
    await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99362969614", code })
      .expect(200);
    await request(server)
      .get("/api/v1/marketplace/owner/me")
      .set("Authorization", await auth(ownerId))
      .expect(403);
  });
});

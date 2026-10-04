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
import { MarketplaceDispatchService } from "../src/marketplace/marketplace-dispatch.service";
import { MarketplaceDeliveryStatus } from "../src/generated/prisma/client";

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

  it("lists only orderable cafes and lets only OWNER publish versioned pages", async () => {
    const cafes = await request(server).get("/api/v1/marketplace/cafes").expect(200);
    expect((cafes.body as Array<{ id: string }>).map((cafe) => cafe.id)).toContain(cafeA);
    expect((cafes.body as Array<{ id: string }>).map((cafe) => cafe.id)).not.toContain(cafeB);

    const path = "/api/v1/site/owner/pages/ru/about";
    const data = { expectedVersion: 0, title: "О платформе", description: "Доставка из местных кафе Ашхабада", body: "Свежая еда рядом.", published: false };
    await request(server).put(path).send(data).expect(401);
    await request(server).put(path).set("Authorization", await auth(merchantId)).send(data).expect(403);
    await request(server).put(path).set("Authorization", await auth(ownerId)).send(data).expect(200);
    await request(server).get("/api/v1/site/pages/ru/about").expect(404);
    await request(server).put(path).set("Authorization", await auth(ownerId))
      .send({ ...data, expectedVersion: 1, published: true }).expect(200);
    await request(server).put(path).set("Authorization", await auth(ownerId))
      .send({ ...data, expectedVersion: 1, published: false }).expect(409);
    const published = await request(server).get("/api/v1/site/pages/ru/about").expect(200);
    expect((published.body as { title: string; version: number }).title).toBe(data.title);
    expect((published.body as { version: number }).version).toBe(2);
    const listed = await request(server).get("/api/v1/site/pages").expect(200);
    expect((listed.body as Array<{ slug: string }>).some((page) => page.slug === "about")).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "site.page.saved", entityId: "ru/about" } })).toBe(2);
  });

  it("keeps merchant catalog and branches inside one cafe with versioned changes", async () => {
    const base = `/api/v1/marketplace/merchant/cafes/${cafeA}/catalog`;
    const categoryInput = { name: "Lunch", slug: "lunch" };
    await request(server).post(`${base}/categories`).send(categoryInput).expect(401);
    await request(server).post(`${base}/categories`).set("Authorization", await auth(otherId)).send(categoryInput).expect(403);
    const category = await request(server).post(`${base}/categories`).set("Authorization", await auth(merchantId)).send(categoryInput).expect(201);
    const categoryId = (category.body as { id: string }).id;
    expect((category.body as { version: number }).version).toBe(1);
    await request(server).patch(`${base}/categories/${categoryId}`).set("Authorization", await auth(merchantId))
      .send({ expectedVersion: 2, name: "New Lunch" }).expect(409);
    await request(server).patch(`${base}/categories/${categoryId}`).set("Authorization", await auth(merchantId))
      .send({ expectedVersion: 1, name: "New Lunch" }).expect(200);

    const foreign = await prisma.category.create({ data: { cafeId: cafeB, name: "Foreign", slug: `foreign-${cafeB}` } });
    await request(server).post(`${base}/products`).set("Authorization", await auth(merchantId))
      .send({ categoryId: foreign.id, name: "Wrong", slug: "wrong", description: "Food", price: 12, preparationMinutes: 20 }).expect(404);
    const product = await request(server).post(`${base}/products`).set("Authorization", await auth(merchantId))
      .send({ categoryId, name: "Soup", slug: "soup", description: "Hot", price: 12.5, preparationMinutes: 20 }).expect(201);
    const productId = (product.body as { id: string }).id;
    await request(server).patch(`${base}/products/${productId}`).set("Authorization", await auth(otherId))
      .send({ expectedVersion: 1, price: 15 }).expect(403);
    await request(server).patch(`${base}/products/${productId}`).set("Authorization", await auth(merchantId))
      .send({ expectedVersion: 1, price: 15 }).expect(200);
    await request(server).patch(`${base}/products/${productId}`).set("Authorization", await auth(merchantId))
      .send({ expectedVersion: 1, price: 17 }).expect(409);

    const branch = await request(server).post(`${base}/branches`).set("Authorization", await auth(merchantId))
      .send({ name: "Kitchen", address: "Main street", latitude: 37.96, longitude: 58.33 }).expect(201);
    const branchId = (branch.body as { id: string }).id;
    const foreignBranch = await prisma.branch.create({ data: { cafeId: cafeB, name: "Foreign kitchen", address: "Other street", latitude: 37.95, longitude: 58.32 } });
    await request(server).patch(`${base}/branches/${foreignBranch.id}`).set("Authorization", await auth(merchantId))
      .send({ expectedVersion: 1, isActive: false }).expect(404);
    const listed = await request(server).get(base).set("Authorization", await auth(merchantId)).expect(200);
    const catalog = listed.body as { categories: Array<{ id: string; products: Array<{ id: string; price: string }> }>; branches: Array<{ id: string }> };
    expect(catalog.categories.find((entry) => entry.id === categoryId)?.products).toEqual(expect.arrayContaining([expect.objectContaining({ id: productId, price: "15" })]));
    expect(catalog.branches.map((entry) => entry.id)).toContain(branchId);
    expect(catalog.branches.map((entry) => entry.id)).not.toContain(foreignBranch.id);
    expect(catalog.categories.map((entry) => entry.id)).not.toContain(foreign.id);
    await request(server).get(`/api/v1/marketplace/merchant/cafes/${cafeB}/catalog`)
      .set("Authorization", await auth(merchantId)).expect(403);
    await request(server).patch(`${base}/branches/${branchId}`).set("Authorization", await auth(merchantId))
      .send({ expectedVersion: 1, isActive: false }).expect(200);
    expect(await prisma.auditLog.count({ where: { actorId: merchantId, action: { startsWith: "marketplace.catalog." } } })).toBe(6);
  });

  it("schedules an external offer, awards it to one courier, and assigns only after packing", async () => {
    const suffix = Math.random().toString(36).slice(2, 9);
    const category = await prisma.category.create({ data: { cafeId: cafeA, name: "Delivery test", slug: `delivery-${suffix}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: "Meal", slug: `meal-${suffix}`, description: "Food", price: 25 } });
    const second = await prisma.user.create({ data: { phone: `+993651${Math.floor(100000 + Math.random() * 899999)}`, role: Role.COURIER } });
    await prisma.courierApplication.create({ data: { userId: second.id, status: "APPROVED" } });
    const createdAt = new Date(Date.now() - 21 * 60_000);
    const order = await prisma.order.create({ data: { customerId: otherId, cafeId: cafeA, subtotal: 25, total: 25, address: "A", latitude: 37.96, longitude: 58.33, createdAt,
      items: { create: [{ cafeId: cafeA, productId: product.id, productName: "Meal", preparationMinutes: 60, unitPrice: 25, quantity: 1, lineTotal: 25 }] } }, include: { items: true } });
    const path = `/api/v1/marketplace/delivery/merchant/cafes/${cafeA}/orders/${order.id}/route`;
    await request(server).post(path).set("Authorization", await auth(otherId)).send({ mode: "NETWORK", expectedOrderVersion: 1 }).expect(403);
    await request(server).post(`/api/v1/marketplace/delivery/merchant/cafes/${cafeB}/orders/${order.id}/route`).set("Authorization", await auth(merchantId)).send({ mode: "NETWORK", expectedOrderVersion: 1 }).expect(403);
    const scheduled = await request(server).post(path).set("Authorization", await auth(merchantId)).send({ mode: "NETWORK", expectedOrderVersion: 1 }).expect(200);
    expect((scheduled.body as { offerAt: string }).offerAt).toBe(new Date(createdAt.getTime() + 20 * 60_000).toISOString());
    await app.get(MarketplaceDispatchService).publishDue();
    expect((await prisma.marketplaceDeliveryRequest.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe(MarketplaceDeliveryStatus.OFFERED);
    const offer = await request(server).get("/api/v1/marketplace/delivery/courier/offers").set("Authorization", await auth(applicantId)).expect(200);
    expect((offer.body as Array<{ orderId: string }>).some((entry) => entry.orderId === order.id)).toBe(true);
    const claimPath = `/api/v1/marketplace/delivery/courier/offers/${order.id}/claim`;
    const [first, secondClaim] = await Promise.all([
      request(server).post(claimPath).set("Authorization", await auth(applicantId)),
      request(server).post(claimPath).set("Authorization", await auth(second.id)),
    ]);
    expect([first.status, secondClaim.status].sort()).toEqual([200, 409]);
    const winner = (await prisma.marketplaceDeliveryRequest.findUniqueOrThrow({ where: { orderId: order.id } })).courierId;
    expect([applicantId, second.id]).toContain(winner);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("COOKING");
    await request(server).post(`/api/v1/marketplace/delivery/merchant/cafes/${cafeA}/orders/${order.id}/ready`)
      .set("Authorization", await auth(otherId)).send({ version: 2, checkedItemIds: order.items.map((item) => item.id) }).expect(403);
    await request(server).post(`/api/v1/marketplace/delivery/merchant/cafes/${cafeA}/orders/${order.id}/ready`)
      .set("Authorization", await auth(merchantId)).send({ version: 2, checkedItemIds: order.items.map((item) => item.id) }).expect(200);
    const assigned = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(assigned.status).toBe("ASSIGNED_TO_COURIER");
    expect(assigned.courierId).toBe(winner);
    expect((await prisma.marketplaceDeliveryRequest.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe(MarketplaceDeliveryStatus.ASSIGNED);
  });

  it("lets a cafe reserve its own courier without offering the order to the network", async () => {
    const suffix = Math.random().toString(36).slice(2, 9);
    const own = await prisma.user.create({ data: { phone: `+993652${Math.floor(100000 + Math.random() * 899999)}`, role: Role.CUSTOMER } });
    await request(server).put(`/api/v1/marketplace/owner/cafes/${cafeA}/members`)
      .set("Authorization", await auth(ownerId)).send({ userId: own.id, role: Role.COURIER, expectedVersion: 0 }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: own.id } })).role).toBe(Role.COURIER);
    const ownCouriers = await request(server).get(`/api/v1/marketplace/delivery/merchant/cafes/${cafeA}/couriers`)
      .set("Authorization", await auth(merchantId)).expect(200);
    expect((ownCouriers.body as Array<{ id: string }>).some((courier) => courier.id === own.id)).toBe(true);
    await request(server).get(`/api/v1/marketplace/delivery/merchant/cafes/${cafeA}/couriers`)
      .set("Authorization", await auth(otherId)).expect(403);
    const category = await prisma.category.create({ data: { cafeId: cafeA, name: "Own delivery", slug: `own-${suffix}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: "Own meal", slug: `own-meal-${suffix}`, description: "Food", price: 30 } });
    const order = await prisma.order.create({ data: { customerId: otherId, cafeId: cafeA, subtotal: 30, total: 30, address: "B", latitude: 37.96, longitude: 58.33,
      items: { create: [{ cafeId: cafeA, productId: product.id, productName: "Own meal", preparationMinutes: 15, unitPrice: 30, quantity: 1, lineTotal: 30 }] } }, include: { items: true } });
    await request(server).post(`/api/v1/marketplace/delivery/merchant/cafes/${cafeA}/orders/${order.id}/route`)
      .set("Authorization", await auth(merchantId)).send({ mode: "OWN", courierId: own.id, expectedOrderVersion: 1 }).expect(200);
    expect((await prisma.marketplaceDeliveryRequest.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe(MarketplaceDeliveryStatus.CLAIMED);
    const offers = await request(server).get("/api/v1/marketplace/delivery/courier/offers")
      .set("Authorization", await auth(applicantId)).expect(200);
    expect((offers.body as Array<{ orderId: string }>).some((entry) => entry.orderId === order.id)).toBe(false);
    await request(server).post(`/api/v1/marketplace/delivery/merchant/cafes/${cafeA}/orders/${order.id}/ready`)
      .set("Authorization", await auth(merchantId)).send({ version: 2, checkedItemIds: order.items.map((item) => item.id) }).expect(200);
    const assigned = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(assigned.status).toBe("ASSIGNED_TO_COURIER");
    expect(assigned.courierId).toBe(own.id);
  });

  it("withdraws a network offer when OWNER cancels the order", async () => {
    const suffix = Math.random().toString(36).slice(2, 9);
    const category = await prisma.category.create({ data: { cafeId: cafeA, name: "Cancel delivery", slug: `cancel-delivery-${suffix}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: "Quick meal", slug: `quick-meal-${suffix}`, description: "Food", price: 20 } });
    const order = await prisma.order.create({ data: { customerId: otherId, cafeId: cafeA, subtotal: 20, total: 20, address: "C", latitude: 37.96, longitude: 58.33,
      items: { create: [{ cafeId: cafeA, productId: product.id, productName: "Quick meal", preparationMinutes: 10, unitPrice: 20, quantity: 1, lineTotal: 20 }] } } });
    await request(server).post(`/api/v1/marketplace/delivery/merchant/cafes/${cafeA}/orders/${order.id}/route`)
      .set("Authorization", await auth(merchantId)).send({ mode: "NETWORK", expectedOrderVersion: 1 }).expect(200);
    expect((await prisma.marketplaceDeliveryRequest.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe(MarketplaceDeliveryStatus.OFFERED);
    await request(server).patch(`/api/v1/orders/${order.id}/cancel`).set("Authorization", await auth(ownerId))
      .send({ version: 2, reason: "Test cancellation" }).expect(200);
    expect((await prisma.marketplaceDeliveryRequest.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe(MarketplaceDeliveryStatus.CANCELLED);
    await request(server).post(`/api/v1/marketplace/delivery/courier/offers/${order.id}/claim`)
      .set("Authorization", await auth(applicantId)).expect(409);
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

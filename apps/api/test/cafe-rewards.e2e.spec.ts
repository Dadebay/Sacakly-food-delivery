import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { OrderStatus, Role } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";

describe("cafe promotions and loyalty", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];
  let manager: string;
  let customer: string;
  let operator: string;
  let cafe: string;
  let foreign: string;
  let product: string;
  const auth = async (id: string) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    return `Bearer ${await jwt.signAsync({ sub: id, role: user.role, phone: user.phone })}`;
  };
  const base = () => `/api/v1/marketplace/merchant/cafes/${cafe}/rewards`;
  const promoInput = { title: "Welcome", code: "WELCOME", type: "PERCENT", value: 10, isAutomatic: false, minOrderAmount: 0, perUserLimit: 1 };
  const quote = (extra: Record<string, unknown> = {}) => ({ cafeId: cafe, items: [{ productId: product, quantity: 1 }], ...extra });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0]; prisma = app.get(PrismaService); jwt = app.get(JwtService);
    const user = async (role: Role) => (await prisma.user.create({ data: { role, phone: `rewards-${randomUUID().slice(0, 12)}` } })).id;
    manager = await user(Role.ADMIN); customer = await user(Role.CUSTOMER); operator = await user(Role.CUSTOMER);
    cafe = (await prisma.cafe.create({ data: { name: "Rewards cafe", slug: `rewards-${randomUUID()}` } })).id;
    foreign = (await prisma.cafe.create({ data: { name: "Other cafe", slug: `other-rewards-${randomUUID()}` } })).id;
    await prisma.cafeMembership.createMany({ data: [{ cafeId: cafe, userId: manager, role: Role.ADMIN }, { cafeId: cafe, userId: operator, role: Role.OPERATOR }] });
    await prisma.cafeModuleEntitlement.create({ data: { cafeId: cafe, key: "ORDERING", enabled: true } });
    await prisma.branch.create({ data: { cafeId: cafe, name: "Rewards kitchen", address: "Test street", latitude: 37.96, longitude: 58.33 } });
    const category = await prisma.category.create({ data: { cafeId: cafe, name: "Meals", slug: `rewards-menu-${randomUUID()}` } });
    product = (await prisma.product.create({ data: { categoryId: category.id, name: "Meal", slug: `rewards-meal-${randomUUID()}`, description: "Meal", price: 100, loyaltyPoints: 5 } })).id;
  });
  afterAll(async () => { await app?.close(); });

  it("requires an OWNER-enabled module and cafe ADMIN for promotion changes", async () => {
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send(promoInput).expect(403);
    await prisma.cafeModuleEntitlement.create({ data: { cafeId: cafe, key: "MARKETING", enabled: true } });
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(customer)).send(promoInput).expect(403);
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(operator)).send(promoInput).expect(403);
    await request(server).post(`${base().replace(cafe, foreign)}/promotions`).set("Authorization", await auth(manager)).send(promoInput).expect(403);
    const created = await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send(promoInput).expect(201);
    const id = (created.body as { id: string }).id;
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send(promoInput).expect(409);
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send({ ...promoInput, code: "INVALID", startsAt: "2026-02-30T00:00:00Z" }).expect(400);
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send({ ...promoInput, code: "INVALID", startsAt: "2030-01-01T00:00:00Z", endsAt: "2029-01-01T00:00:00Z" }).expect(400);
    await request(server).patch(`${base()}/promotions/${id}`).set("Authorization", await auth(manager)).send({ ...promoInput, expectedVersion: 0 }).expect(400);
    await request(server).patch(`${base()}/promotions/${id}`).set("Authorization", await auth(manager)).send({ ...promoInput, expectedVersion: 2 }).expect(409);
    await request(server).patch(`${base()}/promotions/${id}`).set("Authorization", await auth(manager)).send({ ...promoInput, value: 101, expectedVersion: 1 }).expect(400);
  });

  it("prices the cafe promo on the server and excludes the global legacy wallet", async () => {
    await prisma.user.update({ where: { id: customer }, data: { pointsBalance: 999 } });
    const result = await request(server).post("/api/v1/marketplace/checkout/quote").set("Authorization", await auth(customer)).send(quote({ promoCode: "WELCOME" })).expect(200);
    expect(result.body).toMatchObject({ subtotal: 100, discount: 10, discountedSubtotal: 90, pointsBalance: 0, loyaltyPointsEarned: 0 });
    await request(server).get(`/api/v1/marketplace/cafes/${cafe}/loyalty/me`).set("Authorization", await auth(customer)).expect(200);
  });
  it("selects one best automatic offer, respects dates and rejects another cafe or legacy code", async () => {
    const automatic = { ...promoInput, code: null, isAutomatic: true, perUserLimit: 100 };
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send({ ...automatic, title: "Ten percent", value: 10 }).expect(201);
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send({ ...automatic, title: "Best offer", value: 30, maxDiscountAmount: 20 }).expect(201);
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send({ ...automatic, title: "Expired", value: 90, endsAt: "2020-01-01T00:00:00Z" }).expect(201);
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send({ ...automatic, title: "Future", value: 90, startsAt: "2099-01-01T00:00:00Z" }).expect(201);
    await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send({ ...automatic, title: "Large basket", value: 90, minOrderAmount: 200 }).expect(201);
    await prisma.cafePromotion.create({ data: { cafeId: foreign, title: "Foreign", code: "FOREIGN", type: "PERCENT", value: 99 } });
    await prisma.promoCode.create({ data: { code: `LEGACY-${cafe.slice(0, 8)}`, type: "PERCENT", value: 90 } });
    const priced = await request(server).post("/api/v1/marketplace/checkout/quote").set("Authorization", await auth(customer)).send(quote()).expect(200);
    expect(priced.body).toMatchObject({ discount: 20, promo: { code: "Best offer" } });
    for (const promoCode of ["FOREIGN", `LEGACY-${cafe.slice(0, 8)}`]) {
      await request(server).post("/api/v1/marketplace/checkout/quote").set("Authorization", await auth(customer)).send(quote({ promoCode })).expect(400);
    }
    const publicOffers = await request(server).get(`/api/v1/marketplace/cafes/${cafe}/rewards`).expect(200);
    expect((publicOffers.body as { promotions: Array<{ title: string }> }).promotions.map((p) => p.title).sort()).toEqual(["Best offer", "Large basket", "Ten percent"]);
  });

  it("serializes promo limits and makes checkout retries idempotent", async () => {
    const authorization = await auth(customer);
    const payload = { ...quote({ promoCode: "WELCOME" }), address: "Rewards street", latitude: 37.96, longitude: 58.33 };
    const attempts = await Promise.all([1, 2].map(() => request(server).post("/api/v1/marketplace/checkout/orders").set("Authorization", authorization).send({ ...payload, idempotencyKey: randomUUID() })));
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.order.count({ where: { customerId: customer, cafePromotion: { code: "WELCOME", cafeId: cafe } } })).toBe(1);
    const promotion = await prisma.cafePromotion.findUniqueOrThrow({ where: { cafeId_code: { cafeId: cafe, code: "WELCOME" } } });
    expect(promotion.usedCount).toBe(1);
    const retryPayload = { ...quote(), address: "Retry street", latitude: 37.96, longitude: 58.33, idempotencyKey: randomUUID() };
    const retries = await Promise.all([1, 2].map(() => request(server).post("/api/v1/marketplace/checkout/orders").set("Authorization", authorization).send(retryPayload)));
    expect(retries.map((r) => r.status)).toEqual([201, 201]);
    expect((retries[0]!.body as { id: string }).id).toBe((retries[1]!.body as { id: string }).id);
  });

  it("awards only this cafe after delivery, spends once, and refunds cancellation", async () => {
    const giftInput = { name: "Tea gift", description: "One cup", pointsCost: 5, stock: 1 };
    await request(server).post(`${base()}/gifts`).set("Authorization", await auth(manager)).send(giftInput).expect(403);
    await prisma.cafeModuleEntitlement.create({ data: { cafeId: cafe, key: "LOYALTY", enabled: true } });
    await request(server).post(`${base()}/gifts`).set("Authorization", await auth(operator)).send(giftInput).expect(403);
    const giftResponse = await request(server).post(`${base()}/gifts`).set("Authorization", await auth(manager)).send(giftInput).expect(201);
    const giftId = (giftResponse.body as { id: string }).id;
    await request(server).patch(`${base()}/gifts/${giftId}`).set("Authorization", await auth(manager)).send({ ...giftInput, expectedVersion: 1 }).expect(200);
    await request(server).patch(`${base()}/gifts/${giftId}`).set("Authorization", await auth(manager)).send({ ...giftInput, expectedVersion: 1 }).expect(409);
    await request(server).patch(`${base()}/gifts/${randomUUID()}`).set("Authorization", await auth(manager)).send({ ...giftInput, expectedVersion: 1 }).expect(404);
    await request(server).patch(`/api/v1/loyalty/admin/gifts/${giftId}`).set("Authorization", await auth(manager)).send({ version: 1, isActive: false }).expect(404);
    const oldGifts = await request(server).get("/api/v1/loyalty/gifts").expect(200);
    expect((oldGifts.body as Array<{ id: string }>).map((gift) => gift.id)).not.toContain(giftId);
    const ownAuth = await auth(customer);
    const managerAuth = await auth(manager);
    const orderResponse = await request(server).post("/api/v1/marketplace/checkout/orders").set("Authorization", ownAuth).send({ ...quote(), address: "Earn street", latitude: 37.96, longitude: 58.33 }).expect(201);
    const order = orderResponse.body as { id: string; version: number; loyaltyPointsEarned: number };
    expect(order.loyaltyPointsEarned).toBe(5);
    const walletPath = `/api/v1/marketplace/cafes/${cafe}/loyalty/me`;
    expect((await request(server).get(walletPath).set("Authorization", ownAuth).expect(200)).body).toMatchObject({ pointsBalance: 0 });
    await prisma.cafeModuleEntitlement.update({ where: { cafeId_key: { cafeId: cafe, key: "LOYALTY" } }, data: { enabled: false } });
    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.OUT_FOR_DELIVERY } });
    await request(server).patch(`/api/v1/orders/${order.id}/transition`).set("Authorization", managerAuth).send({ status: OrderStatus.DELIVERED, version: order.version }).expect(200);
    expect((await request(server).get(walletPath).set("Authorization", ownAuth).expect(200)).body).toMatchObject({ pointsBalance: 5, entries: [expect.objectContaining({ kind: "EARN", points: 5 })] });
    expect((await request(server).get(walletPath.replace(cafe, foreign)).set("Authorization", ownAuth).expect(200)).body).toMatchObject({ pointsBalance: 0, entries: [] });
    expect((await request(server).get("/api/v1/loyalty/me").set("Authorization", ownAuth).expect(200)).body).toMatchObject({ pointsBalance: 999, entries: [] });
    await request(server).patch(`/api/v1/orders/${order.id}/transition`).set("Authorization", managerAuth).send({ status: OrderStatus.DELIVERED, version: order.version }).expect(409);
    expect(await prisma.loyaltyEntry.count({ where: { orderId: order.id, kind: "EARN" } })).toBe(1);
    await prisma.cafeModuleEntitlement.update({ where: { cafeId_key: { cafeId: cafe, key: "LOYALTY" } }, data: { enabled: true } });
    const spendPayload = { ...quote(), gifts: [{ giftId, quantity: 1 }], address: "Gift street", latitude: 37.96, longitude: 58.33 };
    const attempts = await Promise.all([1, 2].map(() => request(server).post("/api/v1/marketplace/checkout/orders").set("Authorization", ownAuth).send({ ...spendPayload, idempotencyKey: randomUUID() })));
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
    const spent = attempts.find((r) => r.status === 201)!.body as { id: string; version: number };
    expect((await prisma.gift.findUniqueOrThrow({ where: { id: giftId } })).stock).toBe(0);
    expect((await request(server).get(walletPath).set("Authorization", ownAuth).expect(200)).body).toMatchObject({ pointsBalance: 0 });
    await prisma.cafeModuleEntitlement.update({ where: { cafeId_key: { cafeId: cafe, key: "LOYALTY" } }, data: { enabled: false } });
    await request(server).patch(`/api/v1/orders/${spent.id}/cancel`).set("Authorization", ownAuth).send({ reason: "Changed plans", version: spent.version }).expect(200);
    expect((await request(server).get(walletPath).set("Authorization", ownAuth).expect(200)).body).toMatchObject({ pointsBalance: 5 });
    expect((await prisma.gift.findUniqueOrThrow({ where: { id: giftId } })).stock).toBe(1);
    expect(await prisma.loyaltyEntry.count({ where: { orderId: spent.id, kind: "REFUND" } })).toBe(1);
    await request(server).patch(`/api/v1/orders/${spent.id}/cancel`).set("Authorization", ownAuth).send({ reason: "Retry", version: spent.version }).expect(409);
    await request(server).post("/api/v1/marketplace/checkout/quote").set("Authorization", ownAuth).send(quote({ gifts: [{ giftId, quantity: 1 }] })).expect(403);
    await prisma.cafeModuleEntitlement.update({ where: { cafeId_key: { cafeId: cafe, key: "LOYALTY" } }, data: { enabled: true } });
    const secondGift = await request(server).post("/api/v1/marketplace/checkout/orders").set("Authorization", ownAuth).send(spendPayload).expect(201);
    await request(server).patch(`/api/v1/orders/${order.id}/cancel`).set("Authorization", managerAuth).send({ reason: "Reverse delivered earning", version: order.version + 1 }).expect(200);
    expect((await request(server).get(walletPath).set("Authorization", ownAuth).expect(200)).body).toMatchObject({ pointsBalance: -5 });
    // A debt caused by reversing previously spent earning blocks gifts, not food.
    await request(server).post("/api/v1/marketplace/checkout/quote").set("Authorization", ownAuth).send(quote()).expect(200);
    const second = secondGift.body as { id: string; version: number };
    await request(server).patch(`/api/v1/orders/${second.id}/cancel`).set("Authorization", ownAuth).send({ reason: "Return second gift", version: second.version }).expect(200);
    expect((await request(server).get(walletPath).set("Authorization", ownAuth).expect(200)).body).toMatchObject({ pointsBalance: 0 });
    const foreignGift = await prisma.gift.create({ data: { cafeId: foreign, name: "Foreign gift", description: "Hidden", imageUrl: "", pointsCost: 1 } });
    await request(server).post("/api/v1/marketplace/checkout/quote").set("Authorization", ownAuth).send(quote({ gifts: [{ giftId: foreignGift.id, quantity: 1 }] })).expect(400);
    await request(server).get(`${base().replace(cafe, foreign)}`).set("Authorization", managerAuth).expect(403);
  });
  it("guards total campaign limits across customers and validates updates", async () => {
    const input = { ...promoInput, title: "One redemption", code: "ONE", type: "FIXED", value: 150, totalUsageLimit: 1, perUserLimit: 10 };
    const saved = await request(server).post(`${base()}/promotions`).set("Authorization", await auth(manager)).send(input).expect(201);
    const attempts = await Promise.all([customer, operator].map(async (id) => request(server).post("/api/v1/marketplace/checkout/orders").set("Authorization", await auth(id)).send({ ...quote({ promoCode: "ONE" }), address: "One street", latitude: 37.96, longitude: 58.33 })));
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(attempts.find((r) => r.status === 201)!.body).toMatchObject({ discount: 100, promotionLabel: "One redemption" });
    const promotion = await prisma.cafePromotion.findUniqueOrThrow({ where: { id: (saved.body as { id: string }).id } });
    await request(server).patch(`${base()}/promotions/${promotion.id}`).set("Authorization", await auth(manager)).send({ ...input, isActive: false, expectedVersion: promotion.version }).expect(200);
    await request(server).post("/api/v1/marketplace/checkout/quote").set("Authorization", await auth(customer)).send(quote({ promoCode: "ONE" })).expect(400);
    expect(await prisma.auditLog.count({ where: { entityId: promotion.id, action: "cafe.promotion.updated" } })).toBe(1);
  });
  it("allows zero point meals and rejects overflowing totals without a server error", async () => {
    const version = (await prisma.product.findUniqueOrThrow({ where: { id: product } })).version;
    const path = `/api/v1/marketplace/merchant/cafes/${cafe}/catalog/products/${product}`;
    await request(server).patch(path).set("Authorization", await auth(manager)).send({ expectedVersion: version, loyaltyPoints: null }).expect(400);
    await request(server).patch(path).set("Authorization", await auth(manager)).send({ expectedVersion: version, loyaltyPoints: 0 }).expect(200);
    expect((await request(server).post("/api/v1/marketplace/checkout/quote").set("Authorization", await auth(customer)).send(quote()).expect(200)).body).toMatchObject({ loyaltyPointsEarned: 0 });
    const categoryId = (await prisma.product.findUniqueOrThrow({ where: { id: product } })).categoryId;
    const products = await Promise.all(Array.from({ length: 44 }, (_, i) => prisma.product.create({ data: { categoryId, name: `Large ${i}`, slug: `large-${randomUUID()}`, description: "Test", price: 1, loyaltyPoints: 1000000 } })));
    const items = products.map((item) => ({ productId: item.id, quantity: 50 }));
    await request(server).post("/api/v1/marketplace/checkout/quote").set("Authorization", await auth(customer)).send(quote({ items })).expect(400);
  });
});

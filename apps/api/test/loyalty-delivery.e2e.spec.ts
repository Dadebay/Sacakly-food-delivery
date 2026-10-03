import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { OrderStatus, Role, type DeliverySettings } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { calculateDistanceDeliveryFee } from "../src/delivery/delivery-pricing";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";
import type { DeliveryTariffQuoteResponseDto } from "../src/delivery/delivery-response.dto";
import type { GiftResponseDto } from "../src/loyalty/loyalty-response.dto";

describe("loyalty shop and kilometer delivery HTTP", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let originalSettings: DeliverySettings;
  let productId: string;
  let giftId: string;
  let customerId: string;
  let adminToken: string;
  let customerToken: string;
  let operatorToken: string;
  let branchId: string;
  const createdUserIds: string[] = [];
  const imageUrl = `/api/v1/media/${randomUUID()}.webp`;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const body = (extra: Record<string, unknown> = {}) => ({
    items: [{ productId, quantity: 2 }],
    address: "Loyalty integration address",
    latitude: 37.95,
    longitude: 58.38,
    ...extra,
  });
  const create = (extra: Record<string, unknown> = {}) =>
    request(server).post("/api/v1/orders").set(auth(customerToken)).send(body(extra));

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
    originalSettings = await prisma.deliverySettings.findUniqueOrThrow({ where: { id: "default" } });
    const jwt = app.get(JwtService);
    const makeUser = async (role: Role) => {
      const user = await prisma.user.create({ data: { phone: `+993${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}${String(createdUserIds.length).padStart(2, "0")}`, role } });
      createdUserIds.push(user.id);
      return { user, token: await jwt.signAsync({ sub: user.id, phone: user.phone, role }) };
    };
    const customer = await makeUser(Role.CUSTOMER);
    customerId = customer.user.id;
    customerToken = customer.token;
    adminToken = (await makeUser(Role.ADMIN)).token;
    operatorToken = (await makeUser(Role.OPERATOR)).token;
    const branch = await prisma.branch.create({ data: { name: `Loyalty test ${randomUUID()}`, address: "Test", latitude: 37.95, longitude: 58.38, isPrimary: true } });
    branchId = branch.id;
    productId = (await prisma.product.create({ data: { name: "Loyalty dish", slug: `loyalty-${randomUUID()}`, description: "Test", price: 10, loyaltyPoints: 3, category: { create: { name: "Loyalty category", slug: `loyalty-category-${randomUUID()}` } } } })).id;
    await prisma.user.update({ where: { id: customerId }, data: { pointsBalance: 100 } });
  });

  afterAll(async () => {
    if (prisma && originalSettings) {
      const { id, ...data } = originalSettings;
      await prisma.deliverySettings.update({ where: { id }, data });
      await prisma.branch.update({ where: { id: branchId }, data: { isActive: false } });
      await prisma.user.updateMany({ where: { id: { in: createdUserIds } }, data: { isActive: false } });
    }
    await app?.close();
  });

  it.each([
    { explicit: false, distancePricing: false },
    { explicit: true, distancePricing: false },
    { explicit: false, distancePricing: true },
    { explicit: true, distancePricing: true },
  ])(
    "accepts legacy null coordinates with saved addresses ($explicit, kilometer=$distancePricing)",
    async ({ explicit, distancePricing }) => {
      const settings = await prisma.deliverySettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      await prisma.deliverySettings.update({
        where: { id: "default" },
        data: {
          distancePricingEnabled: distancePricing,
          dayPricePerKilometer: 10,
          nightPricePerKilometer: 15,
        },
      });
      try {
        const address = await prisma.userAddress.create({
          data: {
            userId: customerId,
            label: "Legacy checkout",
            address: "Saved legacy address",
            latitude: 37.95123,
            longitude: 58.38123,
          },
        });
        await prisma.userAddress.updateMany({
          where: { userId: customerId },
          data: { isActive: false },
        });
        await prisma.userAddress.update({
          where: { id: address.id },
          data: { isActive: true },
        });
        const response = await request(server)
          .post("/api/v1/orders")
          .set(auth(customerToken))
          .send({
            items: [{ productId, quantity: 1 }],
            ...(explicit ? { addressId: address.id } : {}),
            latitude: null,
            longitude: null,
          })
          .expect(201);
        expect(response.body).toMatchObject({
          addressId: address.id,
          address: address.address,
          latitude: 37.95123,
          longitude: 58.38123,
        });
        await request(server)
          .post("/api/v1/orders")
          .set(auth(customerToken))
          .send({
            items: [{ productId, quantity: 1 }],
            address: "New address without coordinates",
            latitude: null,
            longitude: null,
          })
          .expect(400);
        await prisma.userAddress.delete({ where: { id: address.id } });
      } finally {
        await prisma.deliverySettings.update({
          where: { id: "default" },
          data: {
            distancePricingEnabled: settings.distancePricingEnabled,
            dayPricePerKilometer: settings.dayPricePerKilometer,
            nightPricePerKilometer: settings.nightPricePerKilometer,
          },
        });
      }
    },
  );

  it("restricts gift management and exposes active gifts publicly", async () => {
    const payload = { name: "Toy", description: "A gift", imageUrl, pointsCost: 30, stock: 2 };
    await request(server).post("/api/v1/loyalty/admin/gifts").set(auth(customerToken)).send(payload).expect(403);
    await request(server).post("/api/v1/loyalty/admin/gifts").set(auth(operatorToken)).send(payload).expect(403);
    const created = await request(server).post("/api/v1/loyalty/admin/gifts").set(auth(adminToken)).send(payload).expect(201);
    giftId = (created.body as GiftResponseDto).id;
    const listed = await request(server).get("/api/v1/loyalty/gifts").expect(200);
    expect(listed.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: giftId, pointsCost: 30 })]));
    await request(server).get("/api/v1/loyalty/me").set(auth(operatorToken)).expect(403);
  });

  it("selects area or distance pricing with the admin version, and rejects missing coordinates", async () => {
    const version = (await prisma.deliverySettings.findUniqueOrThrow({ where: { id: "default" } })).version;
    await request(server).patch("/api/v1/delivery/admin/settings").set(auth(customerToken)).send({ version, distancePricingEnabled: true, dayPricePerKilometer: 5, nightPricePerKilometer: 8 }).expect(403);
    await request(server).patch("/api/v1/delivery/admin/settings").set(auth(adminToken)).send({ version, distancePricingEnabled: true, dayPricePerKilometer: 5, nightPricePerKilometer: 8 }).expect(200);
    await request(server).post("/api/v1/delivery/tariff-quote").send({ subtotal: 20 }).expect(400);
    const quote = await request(server).post("/api/v1/delivery/tariff-quote").send({ subtotal: 20, latitude: 37.95, longitude: 58.38 }).expect(200);
    expect(quote.body).toMatchObject({ pricingMode: "DISTANCE", distanceMeters: 0, fee: 15 });
    const farther = await request(server).post("/api/v1/delivery/tariff-quote").send({ subtotal: 20, latitude: 37.98, longitude: 58.38 }).expect(200);
    const farQuote = farther.body as DeliveryTariffQuoteResponseDto;
    expect(farQuote.fee).toBe(calculateDistanceDeliveryFee(farQuote.distanceMeters!, farQuote.pricePerKilometer!));
    const current = await prisma.deliverySettings.findUniqueOrThrow({ where: { id: "default" } });
    await request(server).patch("/api/v1/delivery/admin/settings").set(auth(adminToken)).send({ version: current.version - 1, distancePricingEnabled: false }).expect(409);
    await request(server).patch("/api/v1/delivery/admin/settings").set(auth(adminToken)).send({ version: current.version, distancePricingEnabled: false }).expect(200);
    const area = await request(server).post("/api/v1/delivery/tariff-quote").send({ subtotal: 20 }).expect(200);
    expect((area.body as DeliveryTariffQuoteResponseDto).pricingMode).toBe("AREA");
  });

  it("redeems gifts only with food, awards on delivery, and restores points and stock on cancellation", async () => {
    const gift = { giftId, quantity: 1 };
    await create({ items: [], gifts: [gift] }).expect(400);
    await create({ gifts: [{ giftId, quantity: 3 }] }).expect(409);
    await create({ gifts: [gift, gift] }).expect(400);
    const key = randomUUID();
    const created = await create({ gifts: [gift], idempotencyKey: key }).expect(201);
    const createdOrder = created.body as OrderResponseDto;
    expect(createdOrder).toMatchObject({ loyaltyPointsEarned: 6, loyaltyPointsSpent: 30 });
    expect(createdOrder.gifts).toEqual([expect.objectContaining({ giftId, quantity: 1, pointsCost: 30 })]);
    const repeated = await create({ gifts: [gift], idempotencyKey: key }).expect(201);
    expect((repeated.body as OrderResponseDto).id).toBe(createdOrder.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).pointsBalance).toBe(70);
    expect((await prisma.gift.findUniqueOrThrow({ where: { id: giftId } })).stock).toBe(1);

    const checkedItemIds = createdOrder.items.map((item) => item.id);
    await request(server).patch(`/api/v1/orders/${createdOrder.id}/confirm-packing`).set(auth(adminToken)).send({ version: createdOrder.version, checkedItemIds }).expect(400);
    await request(server).patch(`/api/v1/orders/${createdOrder.id}/confirm-packing`).set(auth(adminToken)).send({ version: createdOrder.version, checkedItemIds, checkedGiftIds: createdOrder.gifts.map((item) => item.id) }).expect(200);

    await prisma.order.update({ where: { id: createdOrder.id }, data: { status: OrderStatus.OUT_FOR_DELIVERY, version: { increment: 1 } } });
    const beforeDelivery = await prisma.order.findUniqueOrThrow({ where: { id: createdOrder.id } });
    await request(server).patch(`/api/v1/orders/${createdOrder.id}/transition`).set(auth(customerToken)).send({ status: OrderStatus.DELIVERED, version: beforeDelivery.version }).expect(403);
    const delivered = await request(server).patch(`/api/v1/orders/${createdOrder.id}/transition`).set(auth(adminToken)).send({ status: OrderStatus.DELIVERED, version: beforeDelivery.version }).expect(200);
    const deliveredOrder = delivered.body as OrderResponseDto;
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).pointsBalance).toBe(76);
    await request(server).patch(`/api/v1/orders/${createdOrder.id}/transition`).set(auth(adminToken)).send({ status: OrderStatus.DELIVERED, version: beforeDelivery.version }).expect(409);
    const cancelled = await request(server).patch(`/api/v1/orders/${createdOrder.id}/cancel`).set(auth(adminToken)).send({ version: deliveredOrder.version, reason: "Test cancellation" });
    expect(cancelled.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).pointsBalance).toBe(100);
    expect((await prisma.gift.findUniqueOrThrow({ where: { id: giftId } })).stock).toBe(2);
    expect(await prisma.loyaltyEntry.count({ where: { orderId: createdOrder.id } })).toBe(4);
  });

  it("rejects unaffordable and assisted redemptions, and keeps unlimited gifts available", async () => {
    await prisma.user.update({ where: { id: customerId }, data: { pointsBalance: 0 } });
    await create({ gifts: [{ giftId, quantity: 1 }] }).expect(409);
    expect((await prisma.gift.findUniqueOrThrow({ where: { id: giftId } })).stock).toBe(2);
    await request(server).post("/api/v1/orders/assisted").set(auth(operatorToken)).send({ ...body({ gifts: [{ giftId, quantity: 1 }] }), customerPhone: "+99365123456" }).expect(403);
    await prisma.user.update({ where: { id: customerId }, data: { pointsBalance: 100 } });
    const unlimited = await request(server).post("/api/v1/loyalty/admin/gifts").set(auth(adminToken)).send({ name: "Unlimited toy", description: "", imageUrl, pointsCost: 5, stock: null }).expect(201);
    const gift = unlimited.body as GiftResponseDto;
    await request(server).patch(`/api/v1/loyalty/admin/gifts/${gift.id}`).set(auth(adminToken)).send({ version: gift.version + 1, name: "Stale" }).expect(409);
    const placed = await create({ gifts: [{ giftId: gift.id, quantity: 2 }] }).expect(201);
    const placedOrder = placed.body as OrderResponseDto;
    expect(placedOrder.loyaltyPointsSpent).toBe(10);
    expect((await prisma.gift.findUniqueOrThrow({ where: { id: gift.id } })).stock).toBeNull();
    await request(server).patch(`/api/v1/orders/${placedOrder.id}/cancel`).set(auth(adminToken)).send({ version: placedOrder.version, reason: "Test" }).expect(200);
    expect((await prisma.gift.findUniqueOrThrow({ where: { id: gift.id } })).stock).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).pointsBalance).toBe(100);
  });
});

import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import {
  Role,
  type DeliverySettings,
  type User,
} from "../src/generated/prisma/client";
import { GeocodingService } from "../src/geocoding/geocoding.service";
import { PrismaService } from "../src/prisma/prisma.service";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";

const NIGHT = new Date("2026-09-12T18:00:00Z");
const DAY = new Date("2026-09-13T08:00:00Z");

describe("night delivery HTTP pricing", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let original: DeliverySettings;
  let etrapId: number;
  let productId: string;
  const users = new Map<Role, User>();
  const tokens = new Map<Role, string>();
  const auth = (role = Role.ADMIN) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });
  const quote = (subtotal = 100, deliveryEtrapId: number | null = etrapId) =>
    request(server)
      .post("/api/v1/delivery/tariff-quote")
      .send({ subtotal, deliveryEtrapId });
  const settings = () =>
    prisma.deliverySettings.findUniqueOrThrow({ where: { id: "default" } });
  const etrap = () =>
    prisma.etrap.findUniqueOrThrow({ where: { id: etrapId } });
  const orderBody = (quantity = 1) => ({
    items: [{ productId, quantity }],
    address: "Night tariff test",
    latitude: 37.95,
    longitude: 58.38,
    deliveryEtrapId: etrapId,
  });
  const create = async (quantity = 1) =>
    (
      await request(server)
        .post("/api/v1/orders")
        .set(auth(Role.CUSTOMER))
        .send(orderBody(quantity))
        .expect(201)
    ).body as OrderResponseDto;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NIGHT);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeocodingService)
      .useValue({ reverseGeocode: () => Promise.resolve("Gijeliktest etraby") })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0, "127.0.0.1");
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
    original = await settings();
    const jwt = app.get(JwtService);
    for (const [i, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: { phone: `+9936100950${i}`, role },
      });
      users.set(role, user);
      tokens.set(
        role,
        await jwt.signAsync(
          { sub: user.id, phone: user.phone, role },
          { expiresIn: "30d" },
        ),
      );
    }
    await prisma.branch.create({
      data: {
        name: "Night tariff branch",
        address: "Night tariff test",
        latitude: 37.95,
        longitude: 58.38,
      },
    });
    etrapId = (
      await prisma.etrap.create({
        data: {
          nameRu: "Gijeliktest",
          nameTk: "Gijeliktest",
          isDeliveryEnabled: true,
          price: 20,
          nightPrice: 35,
          welayat: {
            create: {
              nameRu: "Night tariff test",
              nameTk: "Night tariff test",
            },
          },
        },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: "Night tariff meal",
          slug: "night-tariff-meal",
          description: "Test meal",
          price: 100,
          category: {
            create: {
              name: "Night tariff category",
              slug: "night-tariff-category",
            },
          },
        },
      })
    ).id;
  });

  beforeEach(async () => {
    vi.setSystemTime(NIGHT);
    await prisma.deliverySettings.update({
      where: { id: "default" },
      data: {
        nightTariffEnabled: true,
        nightStartsAt: "23:00",
        nightEndsAt: "07:00",
        fallbackPrice: 15,
        fallbackFreeDeliveryThreshold: 150,
        fallbackNightPrice: 30,
        fallbackNightFreeDeliveryThreshold: 300,
        version: { increment: 1 },
      },
    });
    await prisma.etrap.update({
      where: { id: etrapId },
      data: {
        isDeliveryEnabled: true,
        price: 20,
        freeDeliveryThreshold: 200,
        nightPrice: 35,
        nightFreeDeliveryThreshold: 400,
        version: { increment: 1 },
      },
    });
  });

  afterAll(async () => {
    if (prisma && original) {
      const { id, ...data } = original;
      await prisma.deliverySettings.update({ where: { id }, data });
      await prisma.branch.updateMany({
        where: { name: "Night tariff branch" },
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
    }
    await app?.close();
    vi.useRealTimers();
  });

  it("uses the fallback default and keeps night pricing disabled on migration", () => {
    expect(original.nightTariffEnabled).toBe(false);
    expect(Number(original.fallbackNightPrice)).toBe(25);
  });

  it("uses the separate district night price and night free threshold", async () => {
    expect((await quote(199).expect(200)).body).toMatchObject({
      tariff: "NIGHT",
      price: 35,
      fee: 35,
      freeDeliveryThreshold: 400,
      timeZone: "Asia/Ashgabat",
      validUntil: "2026-09-13T02:00:00.000Z",
    });
    expect((await quote(200).expect(200)).body).toMatchObject({ fee: 35 });
    expect((await quote(400).expect(200)).body).toMatchObject({ fee: 0 });
    vi.setSystemTime(DAY);
    expect((await quote(199).expect(200)).body).toMatchObject({
      tariff: "DAY",
      price: 20,
      fee: 20,
      freeDeliveryThreshold: 200,
    });
    expect((await quote(200).expect(200)).body).toMatchObject({ fee: 0 });
  });

  it("supports a fully paid night tariff even when daytime delivery is free", async () => {
    const before = await etrap();
    await request(server)
      .patch(`/api/v1/delivery/admin/etraps/${etrapId}`)
      .set(auth())
      .send({ version: before.version, nightFreeDeliveryThreshold: null })
      .expect(200);
    expect((await quote(1000).expect(200)).body).toMatchObject({ fee: 35 });
  });

  it("uses separate fallback night pricing and the same policy for map quotes", async () => {
    expect((await quote(150, null).expect(200)).body).toMatchObject({
      fee: 30,
      tariff: "NIGHT",
      freeDeliveryThreshold: 300,
    });
    expect((await quote(300, null).expect(200)).body).toMatchObject({ fee: 0 });
    const result = await request(server)
      .post("/api/v1/delivery/quote")
      .send({ latitude: 37.95, longitude: 58.38, subtotal: 100 })
      .expect(200);
    expect(result.body).toMatchObject({
      matched: true,
      fee: 35,
      tariff: "NIGHT",
      etrap: { id: etrapId },
    });
    await prisma.deliverySettings.update({
      where: { id: "default" },
      data: { nightTariffEnabled: false },
    });
    expect((await quote().expect(200)).body).toMatchObject({
      tariff: "DAY",
      fee: 20,
      validUntil: null,
    });
  });

  it("persists the night charge on real customer and assisted orders and receipts", async () => {
    const order = await create();
    expect(order).toMatchObject({
      deliveryFee: 35,
      total: 135,
      createdAt: NIGHT.toISOString(),
    });
    const receipt = await request(server)
      .get(`/api/v1/orders/${order.id}/receipt-print-plan`)
      .set(auth())
      .expect(200);
    expect(receipt.body).toMatchObject({
      summary: { deliveryFee: 35, total: 135 },
    });
    const assisted = await request(server)
      .post("/api/v1/orders/assisted")
      .set(auth())
      .send({ ...orderBody(), customerPhone: users.get(Role.CUSTOMER)!.phone })
      .expect(201);
    expect(assisted.body).toMatchObject({ deliveryFee: 35, total: 135 });
    const preview = await request(server)
      .post("/api/v1/orders/quote")
      .set(auth(Role.CUSTOMER))
      .send({ items: orderBody().items, deliveryEtrapId: etrapId })
      .expect(200);
    expect(preview.body).toMatchObject({ deliveryFee: 35, total: 135 });
    vi.setSystemTime(DAY);
    expect(
      (
        await request(server)
          .get(`/api/v1/orders/${order.id}`)
          .set(auth())
          .expect(200)
      ).body,
    ).toMatchObject({ deliveryFee: 35 });
    const edited = await request(server)
      .patch(`/api/v1/orders/${order.id}/admin-edit`)
      .set(auth())
      .send({ ...orderBody(2), version: order.version })
      .expect(200);
    expect(edited.body).toMatchObject({ deliveryFee: 35, total: 235 });
  });

  it("allows ADMIN and SUPER_ADMIN configuration changes with audit history", async () => {
    for (const role of [Role.ADMIN, Role.SUPER_ADMIN]) {
      const before = await settings();
      await request(server)
        .patch("/api/v1/delivery/admin/settings")
        .set(auth(role))
        .send({
          version: before.version,
          nightStartsAt: "22:30",
          nightEndsAt: "06:30",
          fallbackNightPrice: 42,
          fallbackNightFreeDeliveryThreshold: null,
        })
        .expect(200);
      const audit = await prisma.auditLog.findFirst({
        where: {
          actorId: users.get(role)!.id,
          action: "delivery.settings_updated",
        },
        orderBy: { createdAt: "desc" },
      });
      const metadata = audit?.metadata as { changedFields: string[] };
      expect(metadata.changedFields).toContain("nightStartsAt");
      expect(metadata.changedFields).toContain("fallbackNightPrice");
      expect(audit?.metadata).toMatchObject({
        previous: { fallbackNightPrice: Number(before.fallbackNightPrice) },
      });
    }
  });

  it.each([
    Role.CUSTOMER,
    Role.OPERATOR,
    Role.COOK,
    Role.COURIER,
    Role.ACCOUNTANT,
  ])("denies night tariff changes to %s", async (role) => {
    const before = await settings();
    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .set(auth(role))
      .send({ version: before.version, nightTariffEnabled: false })
      .expect(403);
    await request(server)
      .patch(`/api/v1/delivery/admin/etraps/${etrapId}`)
      .set(auth(role))
      .send({ version: (await etrap()).version, nightPrice: 1 })
      .expect(403);
    expect((await settings()).version).toBe(before.version);
  });

  it("rejects anonymous changes and malformed or conflicting night configuration", async () => {
    const before = await settings();
    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .send({ nightTariffEnabled: true })
      .expect(401);
    for (const patch of [
      { nightStartsAt: "24:00" },
      { nightStartsAt: null },
      { nightEndsAt: "7:0" },
      { nightEndsAt: "23:00" },
      { fallbackNightPrice: -1 },
      { fallbackNightPrice: null },
      { fallbackNightPrice: 1.111 },
      { fallbackNightFreeDeliveryThreshold: -1 },
      { nightTariffEnabled: "true" },
    ]) {
      await request(server)
        .patch("/api/v1/delivery/admin/settings")
        .set(auth())
        .send({ version: before.version, ...patch })
        .expect(400);
    }
    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .set(auth())
      .send({ nightTariffEnabled: true })
      .expect(400);
    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .set(auth())
      .send({ version: before.version - 1, nightTariffEnabled: false })
      .expect(409);
    const responses = await Promise.all(
      [true, false].map((nightTariffEnabled) =>
        request(server)
          .patch("/api/v1/delivery/admin/settings")
          .set(auth())
          .send({ version: before.version, nightTariffEnabled }),
      ),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  });

  it("rejects stale district prices, invalid prices, disabled zones and client-supplied clocks", async () => {
    const before = await etrap();
    for (const patch of [
      { nightPrice: null },
      { nightPrice: -1 },
      { nightPrice: 1.111 },
      { nightFreeDeliveryThreshold: -1 },
    ]) {
      await request(server)
        .patch(`/api/v1/delivery/admin/etraps/${etrapId}`)
        .set(auth())
        .send({ version: before.version, ...patch })
        .expect(400);
    }
    await request(server)
      .patch(`/api/v1/delivery/admin/etraps/${etrapId}`)
      .set(auth())
      .send({ nightPrice: 40 })
      .expect(400);
    await request(server)
      .patch(`/api/v1/delivery/admin/etraps/${etrapId}`)
      .set(auth())
      .send({ version: before.version - 1, nightPrice: 40 })
      .expect(409);
    await request(server)
      .post("/api/v1/delivery/tariff-quote")
      .send({ subtotal: 100, deliveryEtrapId: etrapId, at: DAY.toISOString() })
      .expect(400);
    await prisma.etrap.update({
      where: { id: etrapId },
      data: { isDeliveryEnabled: false },
    });
    await quote().expect(400);
    await quote(100, 2_147_483_647).expect(400);
  });
});

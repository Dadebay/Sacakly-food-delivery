import "reflect-metadata";
import { randomUUID } from "node:crypto";
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
import { parseDistancePriceTiers } from "../src/delivery/distance-price-tiers";
import {
  Role,
  type DeliverySettings,
  type User,
} from "../src/generated/prisma/client";
import { GeocodingService } from "../src/geocoding/geocoding.service";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";
import { PrismaService } from "../src/prisma/prisma.service";

const tiers = [
  { afterKilometers: 5, dayPricePerKilometer: 4, nightPricePerKilometer: 6 },
  { afterKilometers: 10, dayPricePerKilometer: 3, nightPricePerKilometer: 5 },
];
const DAY = new Date("2026-09-27T08:00:00Z");
const NIGHT = new Date("2026-09-27T19:00:00Z");
// Exactly 6 km north (rounded to whole meters) of the isolated test branch.
const coordinates = { latitude: 36.5539593, longitude: 60 };

describe("configurable distance price tiers HTTP", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let original: DeliverySettings;
  let branchId: string;
  let productId: string;
  const users = new Map<Role, User>();
  const tokens = new Map<Role, string>();
  const settings = () =>
    prisma.deliverySettings.findUniqueOrThrow({ where: { id: "default" } });
  const auth = (role = Role.ADMIN) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });
  const patch = (body: object, role = Role.ADMIN) =>
    request(server)
      .patch("/api/v1/delivery/admin/settings")
      .set(auth(role))
      .send(body);
  const quote = () =>
    request(server)
      .post("/api/v1/delivery/tariff-quote")
      .send({ ...coordinates, subtotal: 100 });
  const orderBody = () => ({
    ...coordinates,
    address: "Distance tier test",
    items: [{ productId, quantity: 1 }],
  });

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(DAY);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeocodingService)
      .useValue({ reverseGeocode: () => Promise.resolve(null) })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
    original = await settings();
    const jwt = app.get(JwtService);
    for (const [index, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: { phone: `+9936100870${index}`, role },
      });
      users.set(role, user);
      tokens.set(
        role,
        await jwt.signAsync({ sub: user.id, phone: user.phone, role }),
      );
    }
    branchId = (
      await prisma.branch.create({
        data: {
          name: "Distance tier branch",
          address: "Test",
          latitude: 36.5,
          longitude: 60,
        },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: "Tier test meal",
          slug: `tier-${randomUUID()}`,
          description: "Test",
          price: 100,
          category: {
            create: { name: "Tier test", slug: `tier-${randomUUID()}` },
          },
        },
      })
    ).id;
  });

  beforeEach(async () => {
    vi.setSystemTime(DAY);
    await prisma.deliverySettings.update({
      where: { id: "default" },
      data: {
        distancePricingEnabled: true,
        dayPricePerKilometer: 5,
        nightPricePerKilometer: 8,
        distancePriceTiers: tiers,
        nightTariffEnabled: true,
        nightStartsAt: "23:00",
        nightEndsAt: "07:00",
        version: { increment: 1 },
      },
    });
  });

  afterAll(async () => {
    if (prisma && original) {
      const { id, distancePriceTiers, ...data } = original;
      await prisma.deliverySettings.update({
        where: { id },
        data: {
          ...data,
          distancePriceTiers: parseDistancePriceTiers(distancePriceTiers),
        },
      });
      await prisma.branch.update({
        where: { id: branchId },
        data: { isActive: false },
      });
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: false },
      });
      await prisma.user.updateMany({
        where: { id: { in: [...users.values()].map((user) => user.id) } },
        data: { isActive: false },
      });
    }
    await app?.close();
    vi.useRealTimers();
  });

  it("migrates to empty tiers and exposes the configured rules on public config and quotes", async () => {
    expect(original.distancePriceTiers).toEqual([]);
    expect(
      (await request(server).get("/api/v1/delivery/config").expect(200)).body,
    ).toMatchObject({ distancePriceTiers: tiers });
    expect((await quote().expect(200)).body).toMatchObject({
      distancePriceTiers: tiers,
      tariff: "DAY",
      distanceMeters: 6000,
      pricePerKilometer: 5,
      fee: 30,
    });
    const mapQuote = await request(server)
      .post("/api/v1/delivery/quote")
      .send({ ...coordinates, subtotal: 100 })
      .expect(200);
    expect(mapQuote.body).toMatchObject({ distancePriceTiers: tiers, fee: 30 });
    vi.setSystemTime(NIGHT);
    expect((await quote().expect(200)).body).toMatchObject({
      tariff: "NIGHT",
      pricePerKilometer: 8,
      fee: 45,
    });
  });

  it("uses the same progressive fee for order quotes, customer/assisted orders, edits and receipts", async () => {
    const preview = await request(server)
      .post("/api/v1/orders/quote")
      .set(auth(Role.CUSTOMER))
      .send({ ...coordinates, items: orderBody().items })
      .expect(200);
    expect(preview.body).toMatchObject({ deliveryFee: 30, total: 130 });
    const order = (
      await request(server)
        .post("/api/v1/orders")
        .set(auth(Role.CUSTOMER))
        .send(orderBody())
        .expect(201)
    ).body as OrderResponseDto;
    expect(order).toMatchObject({ deliveryFee: 30, total: 130 });
    expect(
      (
        await request(server)
          .get(`/api/v1/orders/${order.id}/receipt-print-plan`)
          .set(auth())
          .expect(200)
      ).body,
    ).toMatchObject({ summary: { deliveryFee: 30, total: 130 } });
    const assisted = await request(server)
      .post("/api/v1/orders/assisted")
      .set(auth())
      .send({ ...orderBody(), customerPhone: users.get(Role.CUSTOMER)!.phone })
      .expect(201);
    expect(assisted.body).toMatchObject({ deliveryFee: 30, total: 130 });
    const edited = await request(server)
      .patch(`/api/v1/orders/${order.id}/admin-edit`)
      .set(auth())
      .send({
        ...orderBody(),
        deliveryEtrapId: 1,
        latitude: 36.6079186,
        version: order.version,
      })
      .expect(200);
    expect(edited.body).toMatchObject({ deliveryFee: 50, total: 150 });
    // Clearing tiers reprices new quotes, while saved order snapshots stay fixed.
    await patch({
      version: (await settings()).version,
      distancePriceTiers: [],
    }).expect(200);
    const existing = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set(auth())
      .expect(200);
    expect(existing.body).toMatchObject({ deliveryFee: 50 });
  });

  it("allows administrators, requires the version, audits before/after, preserves omission and clears explicitly", async () => {
    for (const role of [Role.ADMIN, Role.SUPER_ADMIN]) {
      const before = await settings();
      const response = await patch(
        { version: before.version, distancePriceTiers: tiers.slice(0, 1) },
        role,
      ).expect(200);
      expect(response.body).toMatchObject({
        version: before.version + 1,
        distancePriceTiers: tiers.slice(0, 1),
      });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          actorId: users.get(role)!.id,
          action: "delivery.settings_updated",
          metadata: { path: ["previous", "version"], equals: before.version },
        },
      });
      expect(audit.metadata).toMatchObject({
        changedFields: ["distancePriceTiers"],
        previous: { version: before.version, distancePriceTiers: before.distancePriceTiers },
        current: { distancePriceTiers: tiers.slice(0, 1) },
      });
    }
    await patch({ distancePriceTiers: [] }).expect(400);
    await patch({
      version: (await settings()).version,
      dayPricePerKilometer: 6,
    }).expect(200);
    expect((await settings()).distancePriceTiers).toEqual(tiers.slice(0, 1));
    await patch({
      version: (await settings()).version,
      distancePriceTiers: [],
    }).expect(200);
    expect((await quote().expect(200)).body).toMatchObject({
      fee: 35,
      distancePriceTiers: [],
    });
    await patch({
      version: (await settings()).version,
      distancePricingEnabled: false,
      distancePriceTiers: tiers,
    }).expect(200);
    expect((await quote().expect(200)).body).toMatchObject({
      pricingMode: "AREA",
      distancePriceTiers: [],
    });
    expect((await settings()).distancePriceTiers).toEqual(tiers);
  });

  it("denies unauthenticated and every non-administrator role", async () => {
    const before = await settings();
    const body = { version: before.version, distancePriceTiers: [] };
    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .send(body)
      .expect(401);
    for (const role of [
      Role.CUSTOMER,
      Role.OPERATOR,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]) {
      await patch(body, role).expect(403);
    }
    expect((await settings()).version).toBe(before.version);
  });

  it("rejects invalid tiers atomically and conflicting concurrent versions", async () => {
    const before = await settings();
    const first = tiers[0]!;
    for (const distancePriceTiers of [
      null,
      {},
      [null],
      [{ ...first, extra: 1 }],
      [{ afterKilometers: 5 }],
      [{ ...first, afterKilometers: 0 }],
      [{ ...first, dayPricePerKilometer: 0 }],
      [{ ...first, nightPricePerKilometer: 10001 }],
      [{ ...first, afterKilometers: 5.001 }],
      [{ ...first, afterKilometers: "5" }],
      [first, first],
      [...tiers].reverse(),
      Array.from({ length: 21 }, (_, index) => ({
        ...first,
        afterKilometers: index + 1,
      })),
    ]) {
      await patch({ version: before.version, distancePriceTiers }).expect(400);
    }
    expect((await settings()).version).toBe(before.version);
    const concurrent = await Promise.all([
      patch({ version: before.version, distancePriceTiers: [] }),
      patch({ version: before.version, distancePriceTiers: tiers.slice(0, 1) }),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect((await settings()).version).toBe(before.version + 1);
  });
});

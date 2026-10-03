import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { Role, type User } from "../src/generated/prisma/client";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";
import { PrismaService } from "../src/prisma/prisma.service";

describe("checkout address reuse and capacity", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];
  let customer: User;
  let token: string;
  let productId: string;
  let branchId: string;
  let etrapId: number;
  let sequence = 0;
  const userIds: string[] = [];
  const staffTokens = new Map<Role, string>();
  const location = {
    address: "Köpetdag etraby, Berzeňňi, Berzeňňi köçesi, , , , , , ,",
    latitude: 37.8890173,
    longitude: 58.3754883,
  };
  const auth = (value = token) => ({ Authorization: `Bearer ${value}` });
  const body = (extra: Record<string, unknown> = {}) => ({
    items: [{ productId, quantity: 1 }],
    addressLabel: "Gowşuryş salgysy",
    ...location,
    entrance: null,
    floor: null,
    apartment: null,
    customerNote: null,
    ...extra,
  });
  const order = (extra: Record<string, unknown> = {}, value = token) =>
    request(server).post("/api/v1/orders").set(auth(value)).send(body(extra));
  const fillAddresses = (count: number) =>
    prisma.userAddress.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        userId: customer.id,
        ...location,
        address: `Saved address ${i}`,
        isActive: i === 0,
      })),
    });
  const countAddresses = () =>
    prisma.userAddress.count({ where: { userId: customer.id } });
  const sign = (user: User) => {
    userIds.push(user.id);
    return jwt.signAsync({ sub: user.id, phone: user.phone, role: user.role });
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    for (const [i, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: { phone: `+993610090${String(i).padStart(2, "0")}`, role },
      });
      staffTokens.set(role, await sign(user));
    }
    const branch = await prisma.branch.create({
      data: { ...location, name: "Address regression branch" },
    });
    branchId = branch.id;
    const product = await prisma.product.create({
      data: {
        name: "Address regression dish",
        slug: "address-regression-dish",
        description: "Checkout address regression fixture",
        price: 10,
        category: {
          create: {
            name: "Address regression category",
            slug: "address-regression-category",
          },
        },
      },
    });
    productId = product.id;
    const etrap = await prisma.etrap.create({
      data: {
        nameRu: "Address regression etrap",
        nameTk: "Address regression etrap",
        price: 27,
        isDeliveryEnabled: true,
        welayat: {
          create: {
            nameRu: "Address regression welayat",
            nameTk: "Address regression welayat",
          },
        },
      },
    });
    etrapId = etrap.id;
  });

  beforeEach(async () => {
    customer = await prisma.user.create({
      data: {
        phone: `+993610091${String(++sequence).padStart(2, "0")}`,
        role: Role.CUSTOMER,
      },
    });
    token = await sign(customer);
  });

  afterAll(async () => {
    try {
      // Other suites share the isolated database and test the last active
      // SUPER_ADMIN and nearest active branch, so retire our own fixtures.
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

  it("accepts the logged mobile request after twenty saved addresses", async () => {
    await fillAddresses(20);
    const response = await order().expect(201);
    expect(response.body).toMatchObject({
      ...location,
      status: "COOKING",
      deliveryEtrapId: null,
    });
    expect(await countAddresses()).toBe(21);
  });

  it("allows the hundredth saved address, rejects a new 101st, and reuses at capacity", async () => {
    await fillAddresses(99);
    const saved = await request(server)
      .post("/api/v1/users/me/addresses")
      .set(auth())
      .send({ ...location, label: "Home" })
      .expect(201);
    const addressId = (saved.body as { id: string }).id;
    for (const path of ["/api/v1/users/me/addresses", "/api/v1/orders"]) {
      const response = await request(server)
        .post(path)
        .set(auth())
        .send(
          path.endsWith("orders")
            ? body({ address: "New destination" })
            : { ...location, address: "New destination" },
        )
        .expect(400);
      expect(response.body).toMatchObject({
        message: "A user can store up to 100 addresses",
      });
    }
    await prisma.userAddress.updateMany({
      where: { userId: customer.id },
      data: { isActive: false },
    });
    const reused = await order().expect(201);
    expect(reused.body).toMatchObject({ addressId });
    expect(await countAddresses()).toBe(100);
    const active = await prisma.userAddress.findMany({
      where: { userId: customer.id, isActive: true },
    });
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ id: addressId, label: "Home" });
    expect(active[0].lastUsedAt).toBeInstanceOf(Date);
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: customer.id,
          action: "address.used_for_order",
          entityId: addressId,
        },
      }),
    ).toBe(1);
  });

  it("serializes simultaneous new addresses at the hundred-address boundary", async () => {
    await fillAddresses(99);
    const results = await Promise.all([
      order({ address: "First new destination" }),
      order({ address: "Second new destination" }),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 400]);
    expect(await countAddresses()).toBe(100);
    expect(
      await prisma.order.count({ where: { customerId: customer.id } }),
    ).toBe(1);
  });

  it("reuses concurrent inline checkouts at stored precision with empty optional details", async () => {
    const [a, b] = await Promise.all([
      order({ latitude: 37.88901734, longitude: 58.37548834 }).expect(201),
      order({ latitude: 37.88901734, longitude: 58.37548834 }).expect(201),
    ]);
    const first = a.body as OrderResponseDto;
    expect(b.body).toMatchObject({ addressId: first.addressId });
    expect((b.body as OrderResponseDto).id).not.toBe(first.id);
    const repeated = await order({
      address: ` ${location.address} `,
      entrance: " ",
      floor: "",
      apartment: undefined,
      addressLabel: "Another display label",
    }).expect(201);
    expect(repeated.body).toMatchObject({ addressId: first.addressId });
    expect(await countAddresses()).toBe(1);
  });

  it("keeps changed address text, coordinates and courier details separate", async () => {
    const changes = [
      {},
      { address: "A different building" },
      { latitude: 37.8891 },
      { longitude: 58.3755 },
      { entrance: "2" },
      { floor: "3" },
      { apartment: "12" },
    ];
    const ids = new Set<string | null>();
    for (const change of changes) {
      const response = await order(change).expect(201);
      ids.add((response.body as OrderResponseDto).addressId);
    }
    expect(ids.size).toBe(changes.length);
    expect(await countAddresses()).toBe(changes.length);
  });

  it("does not reuse another user's address and lets every role place a personal order", async () => {
    const foreign = await prisma.user.create({
      data: { phone: "+99361009200", role: Role.CUSTOMER },
    });
    userIds.push(foreign.id);
    const saved = await prisma.userAddress.create({
      data: { userId: foreign.id, ...location, isActive: true },
    });
    await request(server)
      .post("/api/v1/orders")
      .set(auth())
      .send({ items: body().items, addressId: saved.id })
      .expect(404);
    const response = await order().expect(201);
    expect((response.body as OrderResponseDto).addressId).not.toBe(saved.id);
    expect(await countAddresses()).toBe(1);
    for (const role of Object.values(Role)) {
      const staffToken = staffTokens.get(role) ?? "";
      const staffAddress = await request(server)
        .post("/api/v1/users/me/addresses")
        .set(auth(staffToken))
        .send({
          ...location,
          address: `${role} personal destination`,
          label: "Personal",
        })
        .expect(201);
      const created = await request(server)
        .post("/api/v1/orders")
        .set(auth(staffToken))
        .send({
          items: body().items,
          addressId: (staffAddress.body as { id: string }).id,
        })
        .expect(201);
      expect(created.body).toMatchObject({
        addressId: (staffAddress.body as { id: string }).id,
        source: "CUSTOMER_APP",
        status: "COOKING",
      });
    }
    await request(server).post("/api/v1/orders").send(body()).expect(401);
    expect(
      await prisma.userAddress.findUniqueOrThrow({ where: { id: saved.id } }),
    ).toMatchObject({ userId: foreign.id, isActive: true, lastUsedAt: null });
  });

  it("reuses the caller's address for allowed assisted roles and audits the actor", async () => {
    const initial = await order().expect(201);
    const addressId = (initial.body as OrderResponseDto).addressId;
    for (const role of [Role.OPERATOR, Role.ADMIN, Role.SUPER_ADMIN]) {
      const response = await request(server)
        .post("/api/v1/orders/assisted")
        .set(auth(staffTokens.get(role) ?? ""))
        .send({ ...body(), customerPhone: customer.phone })
        .expect(201);
      expect(response.body).toMatchObject({ addressId, source: "STAFF_PHONE" });
    }
    expect(await countAddresses()).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: addressId!,
          action: "address.used_for_order",
          actorId: { not: customer.id },
        },
      }),
    ).toBe(3);
  });

  it("uses the latest inline tariff and preserves historical order snapshots", async () => {
    const initial = await order().expect(201);
    const original = initial.body as OrderResponseDto;
    const matched = await order({ deliveryEtrapId: etrapId }).expect(201);
    expect(matched.body).toMatchObject({
      addressId: original.addressId,
      deliveryEtrapId: etrapId,
      deliveryFee: 27,
    });
    const fallback = await order().expect(201);
    expect(fallback.body).toMatchObject({
      addressId: original.addressId,
      deliveryEtrapId: null,
      deliveryFee: original.deliveryFee,
    });
    const historical = await prisma.order.findUniqueOrThrow({
      where: { id: (matched.body as OrderResponseDto).id },
    });
    expect(historical.deliveryEtrapId).toBe(etrapId);
    expect(Number(historical.deliveryFee)).toBe(27);
    expect(await countAddresses()).toBe(1);
  });
});

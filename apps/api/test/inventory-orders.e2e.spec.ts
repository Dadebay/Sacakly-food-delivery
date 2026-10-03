import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { returnsInventoryOnCancellation } from "../src/orders/order-policy";
import { OrderStatus, Role } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";

describe("order ingredient reservations and courier-handoff cancellation", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let branchId: string;
  let categoryId: string;
  let etrapId: number;
  const tokens = new Map<Role, string>();
  const users = new Map<Role, string>();
  const location = {
    address: "Inventory order test",
    latitude: 38.719876,
    longitude: 57.812345,
  };
  const auth = (role = Role.ADMIN) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });
  const api = (path: string) => `/api/v1${path}`;
  const stock = async (id: string, branch = branchId) =>
    Number(
      (
        await prisma.ingredientStock.findUniqueOrThrow({
          where: {
            ingredientId_branchId: { ingredientId: id, branchId: branch },
          },
        })
      ).quantity,
    );
  const pickup = (order: OrderResponseDto) =>
    request(server)
      .patch(api(`/orders/${order.id}/transition`))
      .set(auth(Role.COURIER))
      .send({ version: order.version, status: "OUT_FOR_DELIVERY" });
  const assign = (order: OrderResponseDto) =>
    request(server)
      .patch(api(`/orders/${order.id}/assign-courier`))
      .set(auth())
      .send({ version: order.version, courierId: users.get(Role.COURIER) });
  const cancel = (order: OrderResponseDto, role = Role.CUSTOMER) =>
    request(server)
      .patch(api(`/orders/${order.id}/cancel`))
      .set(auth(role))
      .send({ version: order.version, reason: "Customer cancelled" });
  const pack = (order: OrderResponseDto) =>
    request(server)
      .patch(api(`/orders/${order.id}/confirm-packing`))
      .set(auth())
      .send({
        version: order.version,
        checkedItemIds: order.items.map(({ id }) => id),
      });
  const create = (productId: string, quantity = 1, key = randomUUID()) =>
    request(server)
      .post(api("/orders"))
      .set(auth(Role.CUSTOMER))
      .send({
        ...location,
        items: [{ productId, quantity }],
        idempotencyKey: key,
      });
  const edit = (
    order: OrderResponseDto,
    productId: string,
    quantity: number,
    address = location,
  ) =>
    request(server)
      .patch(api(`/orders/${order.id}/admin-edit`))
      .set(auth())
      .send({
        ...address,
        items: [{ productId, quantity }],
        deliveryEtrapId: etrapId,
        version: order.version,
      });
  const body = (response: request.Response) =>
    response.body as OrderResponseDto;
  async function fixture(
    quantity = 1000,
    recipeQuantity = 100,
    yieldQuantity = 2,
  ) {
    const ingredient = await prisma.ingredient.create({
      data: {
        name: `Flour ${randomUUID()}`,
        unit: "GRAM",
        costPerUnit: 0.02,
        reorderPoint: 100,
        stocks: { create: { branchId, quantity } },
      },
    });
    const product = await prisma.product.create({
      data: {
        categoryId,
        name: "Inventory meal",
        slug: `inventory-order-${randomUUID()}`,
        description: "Test recipe",
        price: 50,
      },
    });
    await request(server)
      .put(api(`/inventory/recipes/${product.id}`))
      .set(auth())
      .send({
        yieldQuantity,
        ingredients: [
          { ingredientId: ingredient.id, quantity: recipeQuantity },
        ],
      })
      .expect(200);
    return { ingredientId: ingredient.id, productId: product.id };
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    for (const role of Object.values(Role)) {
      const user = await prisma.user.create({
        data: {
          role,
          phone: `+993${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        },
      });
      users.set(role, user.id);
      tokens.set(
        role,
        await app
          .get(JwtService)
          .signAsync({ sub: user.id, phone: user.phone, role }),
      );
    }
    etrapId = (
      await prisma.etrap.findFirstOrThrow({
        where: { isDeliveryEnabled: true },
      })
    ).id;
    branchId = (
      await prisma.branch.create({
        data: { name: "Inventory order branch", ...location },
      })
    ).id;
    categoryId = (
      await prisma.category.create({
        data: {
          name: "Inventory orders",
          slug: `inventory-orders-${randomUUID()}`,
        },
      })
    ).id;
  });
  afterAll(async () => {
    // Other suites verify the last active SUPER_ADMIN invariant in the shared
    // isolated database. Retire only this suite's fixture accounts.
    await prisma?.user.updateMany({
      where: { id: { in: [...users.values()] } },
      data: { isActive: false },
    });
    await app?.close();
  });

  it("reserves exact recipe portions on creation, deduplicates creation, and restores them before courier pickup within 15 minutes", async () => {
    const f = await fixture();
    const key = randomUUID();
    const order = body(await create(f.productId, 3, key).expect(201));
    expect(await stock(f.ingredientId)).toBe(850);
    const originalRequirement = await prisma.inventoryOrderRequirement.findFirstOrThrow({ where: { orderId: order.id } });
    expect(originalRequirement).toMatchObject({ source: "RECIPE", recipeVersion: 1 });
    expect(Number(originalRequirement.quantity)).toBe(150);
    await create(f.productId, 3, key).expect(201);
    expect(await stock(f.ingredientId)).toBe(850);
    // A later recipe change must not change the original refund amount.
    await request(server)
      .put(api(`/inventory/recipes/${f.productId}`))
      .set(auth())
      .send({
        yieldQuantity: 1,
        ingredients: [{ ingredientId: f.ingredientId, quantity: 700 }],
      })
      .expect(200);
    const cancelled = body(await cancel(order).expect(200));
    expect(cancelled.status).toBe("CANCELLED");
    expect(await stock(f.ingredientId)).toBe(1000);
    await cancel(order).expect(409);
    expect(await stock(f.ingredientId)).toBe(1000);
    const movements = await prisma.inventoryMovement.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(movements.map((movement) => Number(movement.quantityDelta))).toEqual(
      [-150, 150],
    );
    expect((await prisma.inventoryOrderRequirement.findFirstOrThrow({ where: { orderId: order.id } })).recipeVersion).toBe(1);
  });

  it("returns stock after packing or courier assignment, but not after actual pickup or delivery", async () => {
    const f = await fixture();
    let order = body(await create(f.productId).expect(201));
    order = body(await pack(order).expect(200));
    await cancel(order).expect(200);
    expect(await stock(f.ingredientId)).toBe(1000);
    order = body(await create(f.productId).expect(201));
    order = body(await assign(body(await pack(order).expect(200))).expect(200));
    await cancel(order).expect(200);
    expect(await stock(f.ingredientId)).toBe(1000);
    order = body(await create(f.productId).expect(201));
    order = body(
      await pickup(
        body(await assign(body(await pack(order).expect(200))).expect(200)),
      ).expect(200),
    );
    await cancel(order).expect(200);
    expect(await stock(f.ingredientId)).toBe(950);
    order = body(await create(f.productId).expect(201));
    order = body(
      await pickup(
        body(await assign(body(await pack(order).expect(200))).expect(200)),
      ).expect(200),
    );
    order = body(
      await request(server)
        .patch(api(`/orders/${order.id}/transition`))
        .set(auth(Role.COURIER))
        .send({ version: order.version, status: "DELIVERED" })
        .expect(200),
    );
    await cancel(order, Role.ADMIN).expect(200);
    expect(await stock(f.ingredientId)).toBe(900);
  });

  it("reserves and physically issues directly sold water without a recipe", async () => {
    const water = await prisma.ingredient.create({ data: {
      name: `Water bottle ${randomUUID()}`, unit: "PIECE", costPerUnit: 2,
    } });
    const product = await prisma.product.create({ data: {
      categoryId, name: "Water 0.5 L", slug: `water-${randomUUID()}`,
      description: "Direct sale", price: 10,
    } });
    const warehouse = await request(server).post(api("/inventory/locations"))
      .set(auth()).send({ branchId, code: `W-${randomUUID()}`, name: "Warehouse" }).expect(201);
    const locationId = (warehouse.body as { id: string }).id;
    await request(server).post(api("/inventory/documents/receipt"))
      .set(auth(Role.OPERATOR)).send({ branchId, locationId,
        ingredientId: water.id, lotCode: `WATER-${randomUUID()}`,
        quantity: 24, unitCost: 2, reason: "Supplier delivery", idempotencyKey: randomUUID() }).expect(403);
    const receiptPayload = { branchId, locationId, ingredientId: water.id,
      lotCode: `WATER-${randomUUID()}`, quantity: 24, unitCost: 2,
      reason: "Two boxes of 12 bottles", idempotencyKey: randomUUID() };
    const receipt = await request(server).post(api("/inventory/documents/receipt"))
      .set(auth()).send(receiptPayload).expect(201);
    await request(server).post(api("/inventory/documents/receipt"))
      .set(auth()).send(receiptPayload).expect(201);
    expect(await stock(water.id)).toBe(24);
    const lotId = (receipt.body as { lines: Array<{ lotId: string }> }).lines[0]!.lotId;
    await request(server).put(api(`/inventory/product-links/${product.id}`))
      .set(auth()).send({ ingredientId: water.id, quantity: 1 }).expect(200);
    let order = body(await create(product.id, 3).expect(201));
    expect(await stock(water.id)).toBe(21);
    const waterRequirement = await prisma.inventoryOrderRequirement.findFirstOrThrow({ where: { orderId: order.id } });
    expect(waterRequirement).toMatchObject({ source: "DIRECT_PRODUCT", orderItemId: order.items[0]!.id });
    expect(Number(waterRequirement.quantity)).toBe(3);
    expect(Number((await prisma.inventoryLotBalance.findFirstOrThrow({ where: { lotId } })).quantity)).toBe(24);
    await cancel(order).expect(200);
    expect(await stock(water.id)).toBe(24);
    order = body(await create(product.id, 3).expect(201));
    order = body(await assign(body(await pack(order).expect(200))).expect(200));
    await pickup(order).expect(200);
    expect(await stock(water.id)).toBe(21);
    expect(Number((await prisma.inventoryLotBalance.findFirstOrThrow({ where: { lotId } })).quantity)).toBe(21);
    const issue = await prisma.inventoryDocument.findUniqueOrThrow({ where: {
      orderId_kind: { orderId: order.id, kind: "ORDER_ISSUE" },
    }, include: { lines: true } });
    expect(issue.lines.map((line) => Number(line.quantity))).toEqual([3]);
    expect(issue.lines[0]?.orderItemId).toBe(order.items[0]!.id);
  });

  it("uses a variant-specific direct stock quantity and snapshots the selected variant", async () => {
    const water = await prisma.ingredient.create({ data: {
      name: `Pack water ${randomUUID()}`, unit: "PIECE", costPerUnit: 2,
      stocks: { create: { branchId, quantity: 24 } },
    } });
    const product = await prisma.product.create({ data: {
      categoryId, name: "Water pack", slug: `water-pack-${randomUUID()}`,
      description: "Direct variants", pricingType: "VARIANT", price: 0,
      variants: { create: [{ name: "Six bottles", price: 50 }] },
    }, include: { variants: true } });
    const variant = product.variants[0]!;
    await request(server).put(api(`/inventory/product-links/${product.id}`))
      .set(auth()).send({ ingredientId: water.id, quantity: 1 }).expect(200);
    await request(server).put(api(`/inventory/product-links/${product.id}`))
      .set(auth()).send({ variantId: variant.id, ingredientId: water.id, quantity: 6 }).expect(200);
    const order = body(await request(server).post(api("/orders"))
      .set(auth(Role.CUSTOMER)).send({ ...location, idempotencyKey: randomUUID(),
        items: [{ productId: product.id, variantId: variant.id, quantity: 2 }] }).expect(201));
    expect(await stock(water.id)).toBe(12);
    const requirement = await prisma.inventoryOrderRequirement.findFirstOrThrow({ where: { orderId: order.id } });
    expect(requirement).toMatchObject({ source: "DIRECT_VARIANT", productVariantId: variant.id });
    expect(Number(requirement.perSaleQuantity)).toBe(6);
    expect(Number(requirement.quantity)).toBe(12);
    await cancel(order).expect(200);
    expect(await stock(water.id)).toBe(24);
  });

  it("preserves the 15-minute cancellation authorization and denies unrelated roles", async () => {
    const f = await fixture();
    const order = body(await create(f.productId).expect(201));
    for (const role of [
      Role.OPERATOR,
      Role.COURIER,
      Role.ACCOUNTANT,
      Role.COOK,
    ])
      await cancel(order, role).expect(403);
    await request(server)
      .patch(api(`/orders/${order.id}/cancel`))
      .send({ version: 1, reason: "Invalid" })
      .expect(401);
    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });
    await cancel(order).expect(403);
    expect(await stock(f.ingredientId)).toBe(950);
    await cancel(order, Role.SUPER_ADMIN).expect(200);
    expect(await stock(f.ingredientId)).toBe(1000);
  });

  it("replaces pre-pickup reservations on quantity/branch edits, and refunds the last exact reservation", async () => {
    const f = await fixture();
    let order = body(await create(f.productId, 2).expect(201));
    order = body(await edit(order, f.productId, 1).expect(200));
    expect(await stock(f.ingredientId)).toBe(950);
    const otherLocation = {
      address: "Other inventory branch",
      latitude: 38.72345,
      longitude: 57.82345,
    };
    const other = await prisma.branch.create({
      data: { name: "Other stock branch", ...otherLocation },
    });
    await prisma.ingredientStock.create({
      data: { ingredientId: f.ingredientId, branchId: other.id, quantity: 200 },
    });
    order = body(await edit(order, f.productId, 2, otherLocation).expect(200));
    expect(order.branchId).toBe(other.id);
    expect(await stock(f.ingredientId)).toBe(1000);
    expect(await stock(f.ingredientId, other.id)).toBe(100);
    await cancel(order).expect(200);
    expect(await stock(f.ingredientId, other.id)).toBe(200);
  });

  it("never double-debits packing/rollback; later added portions debit only their extra recipe quantities", async () => {
    const f = await fixture();
    let order = body(await create(f.productId, 2).expect(201));
    order = body(await pack(order).expect(200));
    expect(await stock(f.ingredientId)).toBe(900);
    order = body(
      await request(server)
        .patch(api(`/orders/${order.id}/transition`))
        .set(auth())
        .send({ version: order.version, status: "COOKING" })
        .expect(200),
    );
    order = body(await pack(order).expect(200));
    expect(await stock(f.ingredientId)).toBe(900);
    order = body(await edit(order, f.productId, 1).expect(200));
    expect(await stock(f.ingredientId)).toBe(950);
    order = body(await edit(order, f.productId, 3).expect(200));
    expect(await stock(f.ingredientId)).toBe(850);
    await cancel(order).expect(200);
    expect(await stock(f.ingredientId)).toBe(1000);
  });

  it("rolls back the entire creation for a missing ingredient, including other debits and movement history", async () => {
    const f = await fixture();
    const missing = await prisma.ingredient.create({
      data: { name: "Missing ingredient", unit: "PIECE", costPerUnit: 1 },
    });
    await request(server)
      .put(api(`/inventory/recipes/${f.productId}`))
      .set(auth())
      .send({
        yieldQuantity: 1,
        ingredients: [
          { ingredientId: f.ingredientId, quantity: 10 },
          { ingredientId: missing.id, quantity: 1 },
        ],
      })
      .expect(200);
    await create(f.productId).expect(409);
    expect(await stock(f.ingredientId)).toBe(1000);
    expect(
      await prisma.inventoryMovement.count({
        where: { ingredientId: f.ingredientId },
      }),
    ).toBe(0);
    expect(
      await prisma.orderItem.count({ where: { productId: f.productId } }),
    ).toBe(0);
  });

  it("serializes competing orders and manual movements without negative balances or lost writes", async () => {
    const f = await fixture(100, 75, 1);
    const results = await Promise.all([
      create(f.productId),
      create(f.productId),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await stock(f.ingredientId)).toBe(25);
    const adjustments = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(server)
          .post(api(`/inventory/stock/${f.ingredientId}/adjust`))
          .set(auth())
          .send({ branchId, quantityDelta: -10, type: "WASTE" }),
      ),
    );
    expect(adjustments.map((response) => response.status).sort()).toEqual([
      201, 201, 409, 409,
    ]);
    expect(await stock(f.ingredientId)).toBe(5);
    const receipts = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(server)
          .post(api(`/inventory/stock/${f.ingredientId}/adjust`))
          .set(auth())
          .send({ branchId, quantityDelta: 0.1, type: "RECEIPT" }),
      ),
    );
    expect(receipts.every((response) => response.status === 201)).toBe(true);
    expect(await stock(f.ingredientId)).toBe(5.4);
  });

  it("resolves a cancellation/pickup race with one version winner and no double refund", async () => {
    const f = await fixture();
    const order = body(
      await assign(
        body(
          await pack(body(await create(f.productId).expect(201))).expect(200),
        ),
      ).expect(200),
    );
    const results = await Promise.all([pickup(order), cancel(order)]);
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const current = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(await stock(f.ingredientId)).toBe(
      current.status === "CANCELLED" ? 1000 : 950,
    );
  });

  it("rounds fractional base units once and refunds the exact persisted debit", async () => {
    const f = await fixture(1, 1, 3);
    const order = body(await create(f.productId).expect(201));
    expect(await stock(f.ingredientId)).toBe(0.666);
    await cancel(order).expect(200);
    expect(await stock(f.ingredientId)).toBe(1);
  });

  it("does not backfill inventory for legacy orders during packing, edits or cancellation", async () => {
    const f = await fixture();
    let order = body(await create(f.productId).expect(201));
    // Simulate an existing order from before the inventory migration.
    await prisma.inventoryMovement.deleteMany({ where: { orderId: order.id } });
    await prisma.inventoryAllocatedProduct.deleteMany({
      where: { orderId: order.id },
    });
    await prisma.ingredientStock.update({
      where: {
        ingredientId_branchId: { ingredientId: f.ingredientId, branchId },
      },
      data: { quantity: 1000 },
    });
    order = body(await pack(order).expect(200));
    order = body(await edit(order, f.productId, 2).expect(200));
    await cancel(order).expect(200);
    expect(await stock(f.ingredientId)).toBe(1000);
    expect(
      await prisma.inventoryMovement.count({ where: { orderId: order.id } }),
    ).toBe(0);
  });

  it("keeps the full cancellation stock matrix deny-by-default and validates ingredient precision", async () => {
    for (const status of Object.values(OrderStatus))
      expect(returnsInventoryOnCancellation(status)).toBe(
        ["COOKING", "READY", "ASSIGNED_TO_COURIER"].includes(status),
      );
    for (const payload of [
      { name: "   ", unit: "GRAM", costPerUnit: 1 },
      { name: "Too expensive", unit: "GRAM", costPerUnit: 1000000 },
    ])
      await request(server)
        .post(api("/inventory/ingredients"))
        .set(auth())
        .send(payload)
        .expect(400);
  });

  it("returns bounded, branch-scoped decrease notifications and preserves access control", async () => {
    const f = await fixture();
    const order = body(await create(f.productId).expect(201));
    const result = await request(server)
      .get(api(`/inventory/movements?branchId=${branchId}&limit=1`))
      .set(auth(Role.SUPER_ADMIN))
      .expect(200);
    expect(result.body).toMatchObject([
      {
        ingredientId: f.ingredientId,
        quantityDelta: -50,
        quantityAfter: 950,
        orderId: order.id,
        orderNumber: order.number,
        unit: "GRAM",
      },
    ]);
    for (const role of [Role.CUSTOMER, Role.ACCOUNTANT, Role.COURIER])
      await request(server)
        .get(api("/inventory/movements"))
        .set(auth(role))
        .expect(403);
    await request(server)
      .get(api("/inventory/movements?limit=101"))
      .set(auth())
      .expect(400);
    await request(server)
      .get(api("/inventory/movements?branchId=bad"))
      .set(auth())
      .expect(400);
  });
  it("deduplicates simultaneous manual write-offs even when the first exhausts stock, and rejects changed retry payloads", async () => {
    const f = await fixture(10);
    const payload = {
      branchId,
      quantityDelta: -10,
      type: "WASTE",
      reason: "Damaged bag",
      idempotencyKey: randomUUID(),
    };
    const adjust = (input = payload) =>
      request(server)
        .post(api(`/inventory/stock/${f.ingredientId}/adjust`))
        .set(auth())
        .send(input);
    const responses = await Promise.all([adjust(), adjust(), adjust()]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201, 201]);
    expect(await stock(f.ingredientId)).toBe(0);
    await adjust().expect(201);
    await adjust({ ...payload, quantityDelta: -1 }).expect(409);
    await adjust({ ...payload, reason: "Different operation" }).expect(409);
    expect(
      await prisma.inventoryMovement.count({
        where: { ingredientId: f.ingredientId },
      }),
    ).toBe(1);
    const adjustment = await prisma.auditLog.findFirstOrThrow({
      where: {
        actorId: users.get(Role.ADMIN),
        action: "inventory.stock.adjusted",
        metadata: { path: ["idempotencyKey"], equals: payload.idempotencyKey },
      },
    });
    expect(adjustment.metadata).toMatchObject({
      quantityBefore: "10",
      quantityAfter: "0",
      quantityDelta: -10,
      type: "WASTE",
      reason: payload.reason,
      unit: "GRAM",
    });
    expect(adjustment.createdAt).toBeInstanceOf(Date);
    const receipt = {
      ...payload,
      idempotencyKey: randomUUID(),
      type: "RECEIPT",
      quantityDelta: 1,
    };
    await adjust(receipt).expect(201);
    // Keys belong to an authenticated actor, not to another administrator.
    await request(server)
      .post(api(`/inventory/stock/${f.ingredientId}/adjust`))
      .set(auth(Role.SUPER_ADMIN))
      .send(receipt)
      .expect(201);
    expect(await stock(f.ingredientId)).toBe(2);
  });

  it("enforces every inventory read and write role on the API, including SUPER_ADMIN inheritance", async () => {
    const f = await fixture();
    const readRoles: Role[] = [
      Role.ADMIN,
      Role.SUPER_ADMIN,
      Role.OPERATOR,
      Role.COOK,
    ];
    for (const role of Object.values(Role)) {
      for (const path of [
        "ingredients",
        "recipes",
        `recipes/${f.productId}`,
        "stock",
        "alerts",
        "movements",
      ])
        await request(server)
          .get(api(`/inventory/${path}`))
          .set(auth(role))
          .expect(readRoles.includes(role) ? 200 : 403);
      const allowed = role === Role.ADMIN || role === Role.SUPER_ADMIN;
      await request(server)
        .post(api("/inventory/ingredients"))
        .set(auth(role))
        .send({ name: `Role ${role}`, unit: "GRAM", costPerUnit: 1 })
        .expect(allowed ? 201 : 403);
      await request(server)
        .patch(api(`/inventory/ingredients/${f.ingredientId}`))
        .set(auth(role))
        .send({ reorderPoint: 2 })
        .expect(allowed ? 200 : 403);
      await request(server)
        .put(api(`/inventory/recipes/${f.productId}`))
        .set(auth(role))
        .send({
          yieldQuantity: 2,
          ingredients: [{ ingredientId: f.ingredientId, quantity: 100 }],
        })
        .expect(allowed ? 200 : 403);
      await request(server)
        .post(api(`/inventory/stock/${f.ingredientId}/adjust`))
        .set(auth(role))
        .send({ branchId, quantityDelta: 1, reason: "Role check" })
        .expect(allowed ? 201 : 403);
    }
    expect(await stock(f.ingredientId)).toBe(1002);
  });

  it("ignores a spoofed JWT role, rejects inactive and revoked sessions, and never logs token content", async () => {
    const f = await fixture();
    const path = api(`/inventory/stock/${f.ingredientId}/adjust`);
    const payload = {
      branchId,
      quantityDelta: -1,
      type: "WASTE",
      reason: "Auth check",
    };
    const jwt = app.get(JwtService);
    const fakeRole = await jwt.signAsync({
      sub: users.get(Role.CUSTOMER),
      role: Role.SUPER_ADMIN,
    });
    await request(server)
      .post(path)
      .set({ Authorization: `Bearer ${fakeRole}` })
      .send(payload)
      .expect(403);
    await request(server).post(path).send(payload).expect(401);
    await request(server)
      .post(path)
      .set({ Authorization: "Bearer forged-secret-must-not-be-logged" })
      .send(payload)
      .expect(401);
    const revoked = await jwt.signAsync({
      sub: users.get(Role.ADMIN),
      sid: randomUUID(),
      role: Role.ADMIN,
    });
    await request(server)
      .post(path)
      .set({ Authorization: `Bearer ${revoked}` })
      .send(payload)
      .expect(401);
    await prisma.user.update({
      where: { id: users.get(Role.ADMIN) },
      data: { isActive: false },
    });
    try {
      await request(server).post(path).set(auth()).send(payload).expect(401);
    } finally {
      await prisma.user.update({
        where: { id: users.get(Role.ADMIN) },
        data: { isActive: true },
      });
    }
    const audits = await prisma.auditLog.findMany({
      where: { entityId: f.ingredientId, action: "inventory.request.rejected" },
    });
    expect(audits).toHaveLength(5);
    expect(
      audits.find((entry) => entry.actorId === users.get(Role.CUSTOMER))
        ?.metadata,
    ).toMatchObject({ actorRole: "CUSTOMER", status: 403 });
    expect(audits.filter((entry) => entry.actorId === null)).toHaveLength(4);
    const auditText = JSON.stringify(audits);
    expect(auditText).not.toContain(fakeRole);
    expect(auditText).not.toContain("forged-secret");
    expect(auditText).not.toContain("Authorization");
    expect(await stock(f.ingredientId)).toBe(1000);
  });

  it("rejects client-supplied identity, history and balance fields, invalid quantities and identifiers without changing stock", async () => {
    const f = await fixture();
    const path = api(`/inventory/stock/${f.ingredientId}/adjust`);
    const valid = {
      branchId,
      quantityDelta: -1,
      type: "WASTE",
      reason: "Security check",
    };
    for (const extra of [
      { actorId: users.get(Role.SUPER_ADMIN) },
      { orderId: randomUUID() },
      { quantityAfter: 9000 },
      { createdAt: new Date().toISOString() },
      { idempotencyKey: "bad-key" },
      { branchId: "bad-id" },
    ])
      await request(server)
        .post(path)
        .set(auth())
        .send({ ...valid, ...extra })
        .expect(400);
    for (const quantityDelta of [
      0,
      0.0001,
      -100000001,
      "NaN",
      "Infinity",
      null,
      {},
      [],
    ])
      await request(server)
        .post(path)
        .set(auth())
        .send({ ...valid, quantityDelta })
        .expect(400);
    await request(server)
      .post(path)
      .set(auth())
      .send({ ...valid, branchId: randomUUID() })
      .expect(404);
    await request(server)
      .post(path)
      .set(auth())
      .send({ ...valid, quantityDelta: -1001 })
      .expect(409);
    expect(await stock(f.ingredientId)).toBe(1000);
    expect(
      await prisma.inventoryMovement.count({
        where: { ingredientId: f.ingredientId },
      }),
    ).toBe(0);
    const logs = await prisma.auditLog.findMany({
      where: { entityId: f.ingredientId, action: "inventory.request.rejected" },
    });
    expect(logs).toHaveLength(16);
    expect(logs.every(({ actorId }) => actorId === users.get(Role.ADMIN))).toBe(
      true,
    );
    expect(
      logs.some(
        ({ metadata }) => (metadata as { status: number }).status === 409,
      ),
    ).toBe(true);
  });

  it("records full ingredient and recipe before/after snapshots and protects historical units", async () => {
    const f = await fixture();
    await request(server)
      .patch(api(`/inventory/ingredients/${f.ingredientId}`))
      .set(auth())
      .send({ name: "Audited flour", costPerUnit: 0.03, reorderPoint: 200 })
      .expect(200);
    const ingredientLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityId: f.ingredientId,
        action: "inventory.ingredient.updated",
      },
    });
    expect(ingredientLog.metadata).toMatchObject({
      before: { costPerUnit: "0.02", reorderPoint: "100", unit: "GRAM" },
      after: {
        name: "Audited flour",
        costPerUnit: "0.03",
        reorderPoint: "200",
        unit: "GRAM",
      },
    });
    await request(server)
      .put(api(`/inventory/recipes/${f.productId}`))
      .set(auth())
      .send({
        yieldQuantity: 4,
        ingredients: [{ ingredientId: f.ingredientId, quantity: 60 }],
      })
      .expect(200);
    const recipeLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "inventory.recipe.upserted",
        metadata: { path: ["productId"], equals: f.productId },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(recipeLog.metadata).toMatchObject({
      before: {
        yieldQuantity: "2",
        ingredients: [
          { ingredientId: f.ingredientId, quantity: "100", unit: "GRAM" },
        ],
      },
      after: {
        yieldQuantity: "4",
        ingredients: [
          { ingredientId: f.ingredientId, quantity: "60", unit: "GRAM" },
        ],
      },
    });
    const historyOnly = await prisma.ingredient.create({
      data: { name: "History only", unit: "GRAM", costPerUnit: 1 },
    });
    for (const quantityDelta of [1, -1])
      await request(server)
        .post(api(`/inventory/stock/${historyOnly.id}/adjust`))
        .set(auth())
        .send({ branchId, quantityDelta, reason: "Unit history" })
        .expect(201);
    expect(await stock(historyOnly.id)).toBe(0);
    await request(server)
      .patch(api(`/inventory/ingredients/${historyOnly.id}`))
      .set(auth())
      .send({ unit: "PIECE" })
      .expect(409);
  });

  it("logs reservation and return as exact linked movements attributed to the real actor", async () => {
    const f = await fixture();
    const order = body(await create(f.productId, 2).expect(201));
    await cancel(order).expect(200);
    const audits = await prisma.auditLog.findMany({
      where: { entityId: order.id, action: "inventory.order.adjusted" },
      orderBy: { createdAt: "asc" },
    });
    expect(audits).toHaveLength(2);
    for (const [index, audit] of audits.entries()) {
      expect(audit.actorId).toBe(users.get(Role.CUSTOMER));
      expect(audit.metadata).toMatchObject({
        stockChanges: 1,
        movements: [
          {
            ingredientId: f.ingredientId,
            branchId,
            quantityBefore: index === 0 ? "1000" : "900",
            quantityAfter: index === 0 ? "900" : "1000",
            quantityDelta: index === 0 ? "-100" : "100",
            unit: "GRAM",
          },
        ],
      });
    }
    const orderAfterPickup = body(
      await pickup(
        body(
          await assign(
            body(
              await pack(body(await create(f.productId).expect(201))).expect(
                200,
              ),
            ),
          ).expect(200),
        ),
      ).expect(200),
    );
    await cancel(orderAfterPickup).expect(200);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "inventory.order.adjusted",
          entityId: orderAfterPickup.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: "order.cancelled", entityId: orderAfterPickup.id },
      }),
    ).toBe(1);
  });

  it("rolls back stock and movement when the success audit cannot be saved, while logging the rejected request", async () => {
    const f = await fixture();
    // PostgreSQL-specific failure injection, isolated alofood_test only. Never used in application code.
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION inventory_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'inventory.stock.adjusted' THEN RAISE EXCEPTION 'Test audit persistence failure'; END IF; RETURN NEW; END; $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER inventory_test_fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION inventory_test_fail_audit()`,
    );
    try {
      const response = await request(server)
        .post(api(`/inventory/stock/${f.ingredientId}/adjust`))
        .set(auth())
        .send({
          branchId,
          quantityDelta: -20,
          reason: "Atomicity test",
          idempotencyKey: randomUUID(),
        })
        .expect(500);
      expect(response.body).toMatchObject({ message: "Internal server error" });
      expect(JSON.stringify(response.body)).not.toContain(
        "Test audit persistence",
      );
      expect(await stock(f.ingredientId)).toBe(1000);
      expect(
        await prisma.inventoryMovement.count({
          where: { ingredientId: f.ingredientId },
        }),
      ).toBe(0);
      const rejection = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: "inventory.request.rejected",
          entityId: f.ingredientId,
        },
      });
      expect(rejection.metadata).toMatchObject({ status: 500 });
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER inventory_test_fail_audit ON "AuditLog"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION inventory_test_fail_audit()`,
      );
    }
  });

  it("denies another customer's cancellation and concurrent double cancellation without extra stock or history", async () => {
    const f = await fixture();
    const order = body(await create(f.productId).expect(201));
    const stranger = await prisma.user.create({
      data: {
        phone: `+993${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        role: Role.CUSTOMER,
      },
    });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: stranger.id, role: Role.CUSTOMER });
    await request(server)
      .patch(api(`/orders/${order.id}/cancel`))
      .set({ Authorization: `Bearer ${token}` })
      .send({ version: order.version, reason: "Forged refund" })
      .expect(403);
    expect(await stock(f.ingredientId)).toBe(950);
    const responses = await Promise.all([cancel(order), cancel(order)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await stock(f.ingredientId)).toBe(1000);
    expect(
      await prisma.inventoryMovement.count({
        where: { orderId: order.id, quantityDelta: { gt: 0 } },
      }),
    ).toBe(1);
    const rejected = await prisma.auditLog.findMany({
      where: { entityId: order.id, action: "order.request.rejected" },
    });
    expect(rejected).toHaveLength(2);
    expect(rejected.some(({ actorId }) => actorId === stranger.id)).toBe(true);
  });

  it("rejects stock overflow and rolls back the cancellation if its return would exceed storage precision", async () => {
    const f = await fixture(999999999.999);
    await request(server)
      .post(api(`/inventory/stock/${f.ingredientId}/adjust`))
      .set(auth())
      .send({ branchId, quantityDelta: 0.001, reason: "Overflow" })
      .expect(409);
    const order = body(await create(f.productId).expect(201));
    await request(server)
      .post(api(`/inventory/stock/${f.ingredientId}/adjust`))
      .set(auth())
      .send({ branchId, quantityDelta: 50, reason: "Fill capacity" })
      .expect(201);
    await cancel(order).expect(409);
    expect(await stock(f.ingredientId)).toBe(999999999.999);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("COOKING");
    expect(
      await prisma.inventoryMovement.count({
        where: { orderId: order.id, quantityDelta: { gt: 0 } },
      }),
    ).toBe(0);
  });
});

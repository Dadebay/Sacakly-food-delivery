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

type ActorKey =
  | "admin"
  | "superAdmin"
  | "operator"
  | "cook"
  | "accountant"
  | "customerA"
  | "customerB"
  | "courierA"
  | "courierB";

type CategoryResponse = {
  id: string;
  name: string;
  slug: string;
  receiptPrinterIp: string | null;
  isActive: boolean;
  products?: ProductResponse[];
};

type ProductResponse = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  price: number;
  receiptPrinterIp: string | null;
  effectiveReceiptPrinterIp: string | null;
  isActive: boolean;
};

type OrderResponse = {
  id: string;
  number: number;
  status: OrderStatus;
  version: number;
  packingConfirmedAt: string | null;
  courierId: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  branchId: string | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    quantity: number;
  }>;
  transitions?: Array<{ toStatus: OrderStatus }>;
};

type DispatchCourier = {
  id: string;
  presence: "ONLINE" | "STALE" | "OFFLINE";
  location: {
    latitude: number;
    longitude: number;
    recordedAt: string;
    receivedAt: string;
  } | null;
  activeOrders: Array<{
    id: string;
    number: number;
    items: Array<{ productName: string; quantity: number }>;
  }>;
};

type DispatchSnapshot = {
  courierUpdateIntervalSeconds: number;
  branches: Array<{ id: string }>;
  couriers: DispatchCourier[];
};

type ReceiptPrintPlan = {
  orderId: string;
  jobs: Array<{
    printerIp: string;
    items: Array<{ name: string; quantity: number }>;
  }>;
  mainJob: null | {
    printerIp: string;
    items: Array<{ name: string; quantity: number }>;
  };
};

describe("complete catalog, order and multi-courier journey", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];
  let users: Record<ActorKey, User>;
  let tokens: Record<ActorKey, string>;
  let branchId: string;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function transition(
    token: string,
    order: OrderResponse,
    status: OrderStatus,
  ) {
    const response = await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(token))
      .send({ status, version: order.version })
      .expect(200);
    return response.body as OrderResponse;
  }

  async function dispatchSnapshot() {
    const response = await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.admin))
      .expect(200);
    return response.body as DispatchSnapshot;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const userData = {
      admin: { phone: "+99365000401", role: Role.ADMIN },
      superAdmin: { phone: "+99365000409", role: Role.SUPER_ADMIN },
      operator: { phone: "+99365000402", role: Role.OPERATOR },
      cook: { phone: "+99365000403", role: Role.COOK },
      accountant: { phone: "+99365000404", role: Role.ACCOUNTANT },
      customerA: { phone: "+99365000405", role: Role.CUSTOMER },
      customerB: { phone: "+99365000406", role: Role.CUSTOMER },
      courierA: { phone: "+99365000407", role: Role.COURIER },
      courierB: { phone: "+99365000408", role: Role.COURIER },
    } satisfies Record<ActorKey, { phone: string; role: Role }>;
    users = Object.fromEntries(
      await Promise.all(
        Object.entries(userData).map(async ([key, data]) => [
          key,
          await prisma.user.create({
            data: {
              ...data,
              firstName: key,
              isActive: true,
            },
          }),
        ]),
      ),
    ) as Record<ActorKey, User>;
    tokens = Object.fromEntries(
      await Promise.all(
        Object.entries(users).map(async ([key, user]) => [
          key,
          await jwt.signAsync({
            sub: user.id,
            phone: user.phone,
            role: user.role,
          }),
        ]),
      ),
    ) as Record<ActorKey, string>;

    const branch = await prisma.branch.create({
      data: {
        name: "Operations journey branch",
        address: "Journey branch street",
        latitude: 37.9801,
        longitude: 58.3401,
        isActive: true,
      },
    });
    branchId = branch.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("covers catalog CRUD, two admin-visible deliveries and both free moving couriers", async () => {
    const disposableCategoryResponse = await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({
        name: "Journey disposable category",
        receiptPrinterIp: "192.168.140.10",
      })
      .expect(201);
    const disposableCategory =
      disposableCategoryResponse.body as CategoryResponse;
    expect(disposableCategory.slug).toBe("journey-disposable-category");
    const disposableProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId: disposableCategory.id,
        name: "Journey disposable meal",
        description: "Created, read, updated and deleted by the journey",
        price: 12,
      })
      .expect(201);
    const disposableProduct = disposableProductResponse.body as ProductResponse;
    expect(disposableProduct.slug).toBe("journey-disposable-meal");

    await request(server)
      .patch(`/api/v1/catalog/categories/${disposableCategory.id}`)
      .set(bearer(tokens.admin))
      .send({
        name: "Journey disposable category updated",
        receiptPrinterIp: "192.168.140.11",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          name: "Journey disposable category updated",
          receiptPrinterIp: "192.168.140.11",
        });
      });
    await request(server)
      .patch(`/api/v1/catalog/products/${disposableProduct.id}`)
      .set(bearer(tokens.admin))
      .send({ name: "Journey disposable meal updated", price: 13 })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          name: "Journey disposable meal updated",
          price: 13,
          effectiveReceiptPrinterIp: "192.168.140.11",
        });
      });
    const disposableRead = await request(server)
      .get(`/api/v1/catalog/admin/products?categoryId=${disposableCategory.id}`)
      .set(bearer(tokens.admin))
      .expect(200);
    expect(disposableRead.body).toEqual([
      expect.objectContaining({
        id: disposableProduct.id,
        name: "Journey disposable meal updated",
      }),
    ]);
    await request(server)
      .delete(`/api/v1/catalog/products/${disposableProduct.id}`)
      .set(bearer(tokens.admin))
      .expect(204);
    await request(server)
      .delete(`/api/v1/catalog/categories/${disposableCategory.id}`)
      .set(bearer(tokens.admin))
      .expect(204);
    const afterDisposableDelete = await request(server)
      .get("/api/v1/catalog/admin/categories")
      .set(bearer(tokens.admin))
      .expect(200);
    expect(
      (afterDisposableDelete.body as CategoryResponse[]).some(
        ({ id }) => id === disposableCategory.id,
      ),
    ).toBe(false);

    const kitchenCategoryResponse = await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({
        name: "Journey kitchen",
        slug: "journey-kitchen",
        receiptPrinterIp: "192.168.140.20",
      })
      .expect(201);
    const kitchenCategory = kitchenCategoryResponse.body as CategoryResponse;
    const inheritedProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId: kitchenCategory.id,
        name: "Journey soup",
        slug: "journey-soup",
        description: "Inherits the category kitchen printer",
        price: 30,
      })
      .expect(201);
    const overrideProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId: kitchenCategory.id,
        name: "Journey pizza",
        slug: "journey-pizza",
        description: "Overrides the category kitchen printer",
        price: 50,
        receiptPrinterIp: "192.168.140.21",
      })
      .expect(201);
    const inheritedProduct = inheritedProductResponse.body as ProductResponse;
    let overrideProduct = overrideProductResponse.body as ProductResponse;

    await request(server)
      .patch(`/api/v1/catalog/categories/${kitchenCategory.id}`)
      .set(bearer(tokens.admin))
      .send({
        name: "Journey hot kitchen",
        receiptPrinterIp: "192.168.140.22",
      })
      .expect(200);
    const updatedOverrideResponse = await request(server)
      .patch(`/api/v1/catalog/products/${overrideProduct.id}`)
      .set(bearer(tokens.admin))
      .send({ price: 55, receiptPrinterIp: "192.168.140.23" })
      .expect(200);
    overrideProduct = updatedOverrideResponse.body as ProductResponse;

    const adminProductsResponse = await request(server)
      .get(`/api/v1/catalog/admin/products?categoryId=${kitchenCategory.id}`)
      .set(bearer(tokens.admin))
      .expect(200);
    const adminProducts = adminProductsResponse.body as ProductResponse[];
    expect(
      adminProducts.find(({ id }) => id === inheritedProduct.id),
    ).toMatchObject({
      receiptPrinterIp: null,
      effectiveReceiptPrinterIp: "192.168.140.22",
    });
    expect(
      adminProducts.find(({ id }) => id === overrideProduct.id),
    ).toMatchObject({
      price: 55,
      receiptPrinterIp: "192.168.140.23",
      effectiveReceiptPrinterIp: "192.168.140.23",
    });
    const publicProductsResponse = await request(server)
      .get(`/api/v1/catalog/products?categoryId=${kitchenCategory.id}`)
      .expect(200);
    expect(JSON.stringify(publicProductsResponse.body)).not.toContain(
      "receiptPrinterIp",
    );

    const orderInputs = [
      {
        customer: "customerA" as const,
        courier: "courierA" as const,
        latitude: 37.9807,
        longitude: 58.3407,
        pizzaQuantity: 1,
      },
      {
        customer: "customerB" as const,
        courier: "courierB" as const,
        latitude: 37.9813,
        longitude: 58.3413,
        pizzaQuantity: 2,
      },
    ];
    const orders: OrderResponse[] = [];
    for (const [index, input] of orderInputs.entries()) {
      const created = await request(server)
        .post("/api/v1/orders")
        .set(bearer(tokens[input.customer]))
        .send({
          items: [
            { productId: inheritedProduct.id, quantity: 1 },
            {
              productId: overrideProduct.id,
              quantity: input.pizzaQuantity,
            },
          ],
          address: `Journey delivery address ${index + 1}`,
          latitude: input.latitude,
          longitude: input.longitude,
        })
        .expect(201);
      const order = created.body as OrderResponse;
      expect(order).toMatchObject({
        status: OrderStatus.COOKING,
        packingConfirmedAt: null,
        courierId: null,
        branchId,
        subtotal: 30 + 55 * input.pizzaQuantity,
      });
      orders.push(order);
    }

    const kitchenQueue = await request(server)
      .get("/api/v1/orders?statuses=COOKING,READY&limit=100")
      .set(bearer(tokens.admin))
      .expect(200);
    expect(
      (kitchenQueue.body as { items: OrderResponse[] }).items.map(
        ({ id }) => id,
      ),
    ).toEqual(expect.arrayContaining(orders.map(({ id }) => id)));

    const printPlanResponse = await request(server)
      .get(`/api/v1/orders/${orders[0].id}/receipt-print-plan`)
      .set(bearer(tokens.admin))
      .expect(200);
    const printPlan = printPlanResponse.body as ReceiptPrintPlan;
    expect(printPlan.orderId).toBe(orders[0].id);
    expect(printPlan.jobs).toEqual(
      expect.arrayContaining([
        {
          printerIp: "192.168.140.22",
          printerPort: 80,
          transport: "JSPEED_HTTP",
          items: [
            expect.objectContaining({ name: "Journey soup", quantity: 1 }),
          ],
        },
        {
          printerIp: "192.168.140.23",
          printerPort: 80,
          transport: "JSPEED_HTTP",
          items: [
            expect.objectContaining({ name: "Journey pizza", quantity: 1 }),
          ],
        },
      ]),
    );
    if (printPlan.mainJob) {
      expect(printPlan.mainJob.items).toHaveLength(2);
    }

    for (const [index, input] of orderInputs.entries()) {
      let order = orders[index];
      const packed = await request(server)
        .patch(`/api/v1/orders/${order.id}/confirm-packing`)
        .set(bearer(tokens.admin))
        .send({
          checkedItemIds: order.items.map(({ id }) => id),
          version: order.version,
        })
        .expect(200);
      order = packed.body as OrderResponse;
      expect(order.status).toBe(OrderStatus.READY);
      expect(order.packingConfirmedAt).toBeTruthy();
      const assigned = await request(server)
        .patch(`/api/v1/orders/${order.id}/assign-courier`)
        .set(bearer(tokens.operator))
        .send({
          courierId: users[input.courier].id,
          version: order.version,
        })
        .expect(200);
      orders[index] = assigned.body as OrderResponse;
      expect(orders[index]).toMatchObject({
        status: OrderStatus.ASSIGNED_TO_COURIER,
        courierId: users[input.courier].id,
      });
    }

    const assignedQueue = await request(server)
      .get("/api/v1/orders?statuses=ASSIGNED_TO_COURIER&limit=100")
      .set(bearer(tokens.admin))
      .expect(200);
    expect(
      (assignedQueue.body as { items: OrderResponse[] }).items.map(
        ({ id }) => id,
      ),
    ).toEqual(expect.arrayContaining(orders.map(({ id }) => id)));

    const initialRecordedAt = new Date().toISOString();
    const initialLocations = [
      { latitude: 37.9821, longitude: 58.3421 },
      { latitude: 37.9831, longitude: 58.3431 },
    ];
    for (const [index, input] of orderInputs.entries()) {
      await request(server)
        .put("/api/v1/tracking/me/location")
        .set(bearer(tokens[input.courier]))
        .send({
          ...initialLocations[index],
          accuracy: 9 + index,
          recordedAt: initialRecordedAt,
        })
        .expect(200);

      const ownRoute = await request(server)
        .get("/api/v1/orders/courier/route")
        .set(bearer(tokens[input.courier]))
        .expect(200);
      const ownStopIds = (
        ownRoute.body as { stops: Array<{ orderId: string }> }
      ).stops.map(({ orderId }) => orderId);
      expect(ownStopIds).toContain(orders[index].id);
      expect(ownStopIds).not.toContain(orders[index === 0 ? 1 : 0].id);

      const adminRoute = await request(server)
        .get(`/api/v1/orders/couriers/${users[input.courier].id}/route`)
        .set(bearer(tokens.admin))
        .expect(200);
      expect(
        (adminRoute.body as { stops: Array<{ orderId: string }> }).stops.map(
          ({ orderId }) => orderId,
        ),
      ).toEqual(ownStopIds);
    }

    const busySnapshot = await dispatchSnapshot();
    expect(busySnapshot.courierUpdateIntervalSeconds).toBe(15);
    expect(busySnapshot.branches.map(({ id }) => id)).toContain(branchId);
    for (const [index, input] of orderInputs.entries()) {
      const courier = busySnapshot.couriers.find(
        ({ id }) => id === users[input.courier].id,
      );
      expect(courier).toMatchObject({
        presence: "ONLINE",
        location: initialLocations[index],
      });
      expect(courier?.activeOrders.map(({ id }) => id)).toEqual([
        orders[index].id,
      ]);
      expect(courier?.activeOrders[0]?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ productName: "Journey soup", quantity: 1 }),
          expect.objectContaining({
            productName: "Journey pizza",
            quantity: input.pizzaQuantity,
          }),
        ]),
      );
    }

    for (const [index, input] of orderInputs.entries()) {
      let order = await transition(
        tokens[input.courier],
        orders[index],
        OrderStatus.OUT_FOR_DELIVERY,
      );
      order = await transition(
        tokens[input.courier],
        order,
        OrderStatus.DELIVERED,
      );
      orders[index] = order;
    }
    const deliveredQueue = await request(server)
      .get("/api/v1/orders?statuses=DELIVERED&limit=100")
      .set(bearer(tokens.admin))
      .expect(200);
    expect(
      (deliveredQueue.body as { items: OrderResponse[] }).items.map(
        ({ id }) => id,
      ),
    ).toEqual(expect.arrayContaining(orders.map(({ id }) => id)));

    const deliveredSnapshot = await dispatchSnapshot();
    for (const [index, input] of orderInputs.entries()) {
      expect(
        deliveredSnapshot.couriers.find(
          ({ id }) => id === users[input.courier].id,
        ),
      ).toMatchObject({
        presence: "ONLINE",
        location: initialLocations[index],
        activeOrders: [],
      });
    }

    const afterDeliveryRecordedAt = new Date(
      Math.max(Date.now(), Date.parse(initialRecordedAt) + 1),
    ).toISOString();
    const afterDeliveryLocations = [
      { latitude: 37.9841, longitude: 58.3441 },
      { latitude: 37.9851, longitude: 58.3451 },
    ];
    for (const [index, input] of orderInputs.entries()) {
      await request(server)
        .put("/api/v1/tracking/me/location")
        .set(bearer(tokens[input.courier]))
        .send({
          ...afterDeliveryLocations[index],
          accuracy: 7 + index,
          recordedAt: afterDeliveryRecordedAt,
        })
        .expect(200);
    }
    const movingFreeSnapshot = await dispatchSnapshot();
    for (const [index, input] of orderInputs.entries()) {
      expect(
        movingFreeSnapshot.couriers.find(
          ({ id }) => id === users[input.courier].id,
        ),
      ).toMatchObject({
        presence: "ONLINE",
        location: afterDeliveryLocations[index],
        activeOrders: [],
      });
    }

    for (const [index, input] of orderInputs.entries()) {
      let order = await transition(
        tokens[input.courier],
        orders[index],
        OrderStatus.CASH_RETURNED,
      );
      order = await transition(
        tokens.superAdmin,
        order,
        OrderStatus.RECONCILED,
      );
      orders[index] = order;
    }
    const archive = await request(server)
      .get("/api/v1/orders?statuses=RECONCILED&limit=100")
      .set(bearer(tokens.admin))
      .expect(200);
    expect(
      (archive.body as { items: OrderResponse[] }).items.map(({ id }) => id),
    ).toEqual(expect.arrayContaining(orders.map(({ id }) => id)));
    for (const order of orders) {
      const details = await request(server)
        .get(`/api/v1/orders/${order.id}`)
        .set(bearer(tokens.admin))
        .expect(200);
      expect(
        (details.body as OrderResponse).transitions?.map(
          ({ toStatus }) => toStatus,
        ),
      ).toEqual([
        OrderStatus.READY,
        OrderStatus.ASSIGNED_TO_COURIER,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
        OrderStatus.CASH_RETURNED,
        OrderStatus.RECONCILED,
      ]);
    }

    await request(server)
      .delete(`/api/v1/catalog/products/${inheritedProduct.id}`)
      .set(bearer(tokens.admin))
      .expect(409);
    await request(server)
      .delete(`/api/v1/catalog/categories/${kitchenCategory.id}`)
      .set(bearer(tokens.admin))
      .expect(409);
    await request(server)
      .patch(`/api/v1/catalog/products/${inheritedProduct.id}`)
      .set(bearer(tokens.admin))
      .send({ isActive: false })
      .expect(200);
    await request(server)
      .patch(`/api/v1/catalog/categories/${kitchenCategory.id}`)
      .set(bearer(tokens.admin))
      .send({ isActive: false })
      .expect(200);
    const hiddenAdminCategoryResponse = await request(server)
      .get("/api/v1/catalog/admin/categories")
      .set(bearer(tokens.admin))
      .expect(200);
    expect(
      (hiddenAdminCategoryResponse.body as CategoryResponse[]).find(
        ({ id }) => id === kitchenCategory.id,
      ),
    ).toMatchObject({ isActive: false });
    const publicCategoriesResponse = await request(server)
      .get("/api/v1/catalog/categories")
      .expect(200);
    expect(
      (publicCategoriesResponse.body as CategoryResponse[]).some(
        ({ id }) => id === kitchenCategory.id,
      ),
    ).toBe(false);

    for (const input of orderInputs) {
      await request(server)
        .delete("/api/v1/tracking/me/location")
        .set(bearer(tokens[input.courier]))
        .expect(200);
    }
    const stoppedSnapshot = await dispatchSnapshot();
    for (const input of orderInputs) {
      expect(
        stoppedSnapshot.couriers.find(
          ({ id }) => id === users[input.courier].id,
        ),
      ).toMatchObject({
        presence: "OFFLINE",
        location: null,
        activeOrders: [],
      });
    }
  });
});

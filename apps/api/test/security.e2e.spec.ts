import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import {
  OrderSource,
  OrderStatus,
  ProductPricingType,
  PromoType,
  Role,
  type User,
} from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { OtpService } from "../src/auth/otp.service";
import {
  SmsGatewayJobStatus,
  type SmsGatewayJobResponseDto,
  type SmsGatewayStatusResponseDto,
} from "../src/auth/sms-gateway.dto";
import { SmsGatewayService } from "../src/auth/sms-gateway.service";
import { RedisService } from "../src/redis/redis.service";

type TestUsers = Record<
  | "customer"
  | "otherCustomer"
  | "operator"
  | "cook"
  | "otherCook"
  | "courier"
  | "otherCourier"
  | "accountant"
  | "admin"
  | "superAdmin"
  | "inactive",
  User
>;

type SessionResponse = {
  accessToken: string;
  refreshToken: string;
};

type AddressResponse = {
  id: string;
  address: string;
  isActive: boolean;
};

type OrderResponse = {
  id: string;
  number: number;
  status: OrderStatus;
  source: OrderSource;
  version: number;
  packingConfirmedAt: string | null;
  completedAt: string | null;
  courierId?: string | null;
  address: string;
  branchId: string | null;
  branchName: string | null;
  branchAddress: string | null;
  branchDistanceMeters: number | null;
  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  total?: number;
  deliveryEtrapId?: number | null;
  deliveryWelayatName?: string | null;
  deliveryEtrapName?: string | null;
  items?: Array<{
    id: string;
    productId: string;
    productVariantId: string | null;
    productName: string;
    variantName: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    productImageUrl: string | null;
  }>;
  cashSettlement?: { status: string } | null;
  rating?: { score: number; comment: string | null } | null;
  transitions?: Array<{ toStatus: OrderStatus }>;
};

type OrderQuoteResponse = {
  items: Array<{
    productId: string;
    productVariantId: string | null;
    productName: string;
    variantName: string | null;
    productImageUrl: string | null;
    quantity: number;
    unitPrice: number;
    originalLineTotal: number;
    discount: number;
    discountedLineTotal: number;
  }>;
  promo: {
    code: string;
    type: PromoType;
    value: number;
    discount: number;
  } | null;
  subtotal: number;
  discount: number;
  discountedSubtotal: number;
  deliveryFee: number;
  total: number;
  deliveryEtrapId: number | null;
};

type CatalogProductResponse = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  pricingType: ProductPricingType;
  price: number;
  minPrice: number;
  hasVariants: boolean;
  receiptPrinterIp: string | null;
  variantLabel: string | null;
  displayImageUrl: string | null;
  images: Array<{ url: string; sortOrder: number }>;
  variants: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    isActive: boolean;
    sortOrder: number;
    images: Array<{ url: string; sortOrder: number }>;
  }>;
};

type PublicCatalogCategoryResponse = {
  id: string;
  cafeId: string;
  products: Array<Record<string, unknown>>;
};

type CatalogCafeResponse = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  categoryCount?: number;
};

type AdminCatalogProductPageResponse = {
  items: CatalogProductResponse[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ReceiptPrintPlanResponse = {
  orderId: string;
  orderNumber: number;
  documentType: "ORDER" | "CANCELLATION";
  cancellationReason: string | null;
  summary: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
    deliveryAreaName: string | null;
  };
  jobs: Array<{
    printerIp: string;
    printerPort: number;
    transport: "RAW_TCP" | "JSPEED_HTTP";
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
    }>;
  }>;
  mainJob: {
    printerIp: string;
    printerPort: number;
    transport: "RAW_TCP" | "JSPEED_HTTP";
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
    }>;
  } | null;
  unassignedItems: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
};

type ReceiptPrinterResponse = {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  transport: "RAW_TCP" | "JSPEED_HTTP";
  isActive: boolean;
};

type BranchResponse = {
  id: string;
  isActive: boolean;
  phone: string | null;
};

type DeliveryConfigResponse = {
  mapPricingEnabled: boolean;
  welayats: Array<{
    id: number;
    etraps: Array<{
      id: number;
      nameRu: string;
      price: number;
      freeDeliveryThreshold: number | null;
      isDeliveryEnabled: boolean;
      deliveryZone: Array<{ latitude: number; longitude: number }> | null;
    }>;
  }>;
};

type DeliveryQuoteResponse = {
  latitude: number;
  longitude: number;
  subtotal: number;
  fee: number;
  matched: boolean;
  matchSource: "MAP_ZONE" | "LEGACY_TEXT" | "FALLBACK";
};

type NotificationCampaignResponse = {
  id: string;
  title: string;
  status: "PENDING" | "SENDING" | "SENT" | "PARTIAL" | "FAILED";
  intendedUserCount: number;
  deviceCount: number;
  sentCount: number;
  failedCount: number;
};

type UserNotificationResponse = {
  id: string;
  title: string;
  body: string;
  deepLink: string | null;
  readAt: string | null;
};

describe("backend security and critical workflow", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let otp: OtpService;
  let smsGateway: SmsGatewayService;
  let redis: RedisService;
  let server: Parameters<typeof request>[0];
  let users: TestUsers;
  let tokens: Record<keyof TestUsers, string>;
  let productId: string;
  let nearestBranchId: string;
  let nearestBranchName: string;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const mediaUrl = (sequence: number) =>
    `/api/v1/media/00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}.webp`;

  async function createOrder(
    token: string,
    body: Record<string, unknown>,
  ): Promise<OrderResponse> {
    const response = await request(server)
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({
        items: [{ productId, quantity: 2 }],
        ...body,
      })
      .expect(201);
    return response.body as OrderResponse;
  }

  async function transition(
    token: string,
    order: Pick<OrderResponse, "id" | "version">,
    status: OrderStatus,
  ): Promise<OrderResponse> {
    const response = await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(token))
      .send({ status, version: order.version })
      .expect(200);
    return response.body as OrderResponse;
  }

  async function confirmPacking(
    token: string,
    order: Pick<OrderResponse, "id" | "version" | "items">,
  ): Promise<OrderResponse> {
    const response = await request(server)
      .patch(`/api/v1/orders/${order.id}/confirm-packing`)
      .set(bearer(token))
      .send({
        checkedItemIds: order.items?.map(({ id }) => id),
        version: order.version,
      })
      .expect(200);
    return response.body as OrderResponse;
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
    otp = app.get(OtpService);
    smsGateway = app.get(SmsGatewayService);
    redis = app.get(RedisService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const userData = {
      customer: { phone: "+99365000101", role: Role.CUSTOMER },
      otherCustomer: { phone: "+99365000102", role: Role.CUSTOMER },
      operator: { phone: "+99365000103", role: Role.OPERATOR },
      cook: { phone: "+99365000104", role: Role.COOK },
      otherCook: { phone: "+99365000105", role: Role.COOK },
      courier: { phone: "+99365000106", role: Role.COURIER },
      otherCourier: { phone: "+99365000107", role: Role.COURIER },
      accountant: { phone: "+99365000108", role: Role.ACCOUNTANT },
      admin: { phone: "+99365000109", role: Role.ADMIN },
      superAdmin: { phone: "+99365000111", role: Role.SUPER_ADMIN },
      inactive: {
        phone: "+99365000110",
        role: Role.CUSTOMER,
        isActive: false,
      },
    } satisfies Record<
      keyof TestUsers,
      { phone: string; role: Role; isActive?: boolean }
    >;

    const created = await Promise.all(
      Object.entries(userData).map(async ([key, data]) => [
        key,
        await prisma.user.create({
          data: {
            ...data,
            firstName: key,
          },
        }),
      ]),
    );
    users = Object.fromEntries(created) as TestUsers;

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
    ) as Record<keyof TestUsers, string>;

    const category = await prisma.category.create({
      data: { name: "Security test category", slug: "security-test-category" },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Security test meal",
        slug: "security-test-meal",
        description: "Meal used by isolated end-to-end tests",
        price: 75,
      },
    });
    productId = product.id;

    // Other suites may leave active branches in the shared test database.
    // Keep routing assertions deterministic for this suite's own fixtures.
    await prisma.branch.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    const nearestBranch = await prisma.branch.create({
      data: {
        name: "Nearest test branch",
        address: "Branch street 1",
        latitude: 37.9502,
        longitude: 58.3802,
      },
    });
    nearestBranchId = nearestBranch.id;
    nearestBranchName = nearestBranch.name;
    await prisma.branch.createMany({
      data: [
        {
          name: "Far test branch",
          address: "Branch street 2",
          latitude: 37.7,
          longitude: 58.0,
        },
        {
          name: "Inactive closest branch",
          address: "Branch street 3",
          latitude: 37.95,
          longitude: 58.38,
          isActive: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("exposes only public health data with security and CORS headers", async () => {
    const allowed = await request(server)
      .get("/api/v1/health")
      .set("Origin", "http://localhost:3000")
      .expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["x-powered-by"]).toBeUndefined();

    const denied = await request(server)
      .get("/api/v1/health")
      .set("Origin", "https://evil.example")
      .expect(200);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();

    const locationPreflight = await request(server)
      .options("/api/v1/tracking/me/location")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "PUT")
      .expect(204);
    expect(locationPreflight.headers["access-control-allow-methods"]).toContain(
      "PUT",
    );
  });

  it("publishes active district prices and lets only administrators configure backend-owned delivery totals", async () => {
    const quote = await request(server)
      .post("/api/v1/delivery/quote")
      .send({ latitude: 37.9503, longitude: 58.3803, subtotal: 100 })
      .expect(200);
    const quoteBody = quote.body as DeliveryQuoteResponse;
    expect(quoteBody).toMatchObject({
      latitude: 37.9503,
      longitude: 58.3803,
      subtotal: 100,
    });
    expect(typeof quoteBody.fee).toBe("number");
    expect(typeof quoteBody.matched).toBe("boolean");

    const publicConfig = await request(server)
      .get("/api/v1/delivery/config")
      .expect(200);
    const config = publicConfig.body as DeliveryConfigResponse;
    expect(config).toMatchObject({
      fallbackPrice: 25,
      fallbackNightPrice: 25,
    });
    const ashgabat = config.welayats.find((welayat) => welayat.id === 1);
    expect(ashgabat).toBeDefined();
    expect(ashgabat?.etraps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 25,
          nameRu: "1 мкр",
          price: 15,
          freeDeliveryThreshold: 150,
          isDeliveryEnabled: true,
        }),
      ]),
    );

    await request(server)
      .get("/api/v1/delivery/admin/config")
      .set(bearer(tokens.accountant))
      .expect(403);
    await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.customer))
      .send({ price: 22 })
      .expect(403);

    await request(server)
      .post("/api/v1/delivery/admin/welayats")
      .set(bearer(tokens.accountant))
      .send({ nameRu: "Запрещённый", nameTk: "Gadagan" })
      .expect(403);
    const createdWelayatResponse = await request(server)
      .post("/api/v1/delivery/admin/welayats")
      .set(bearer(tokens.admin))
      .send({
        nameEn: "Test region",
        nameRu: "Тестовый велаят",
        nameTk: "Synag welaýaty",
        sortOrder: 99,
      })
      .expect(201);
    const createdWelayat = createdWelayatResponse.body as {
      id: number;
      nameRu: string;
      sortOrder: number;
      etraps: unknown[];
    };
    expect(typeof createdWelayat.id).toBe("number");
    expect(createdWelayat).toMatchObject({
      nameRu: "Тестовый велаят",
      sortOrder: 99,
      etraps: [],
    });
    await request(server)
      .post("/api/v1/delivery/admin/welayats")
      .set(bearer(tokens.admin))
      .send({ nameRu: "Тестовый велаят", nameTk: "Başga at" })
      .expect(409);
    await request(server)
      .patch(`/api/v1/delivery/admin/welayats/${createdWelayat.id}`)
      .set(bearer(tokens.admin))
      .send({ nameRu: "Новый велаят", sortOrder: 7 })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: createdWelayat.id,
          nameRu: "Новый велаят",
          sortOrder: 7,
        });
      });

    await request(server)
      .post("/api/v1/delivery/admin/etraps")
      .set(bearer(tokens.admin))
      .send({
        welayatId: 999_999,
        nameRu: "Нет региона",
        nameTk: "Welaýatsyz",
      })
      .expect(404);
    const createdEtrapResponse = await request(server)
      .post("/api/v1/delivery/admin/etraps")
      .set(bearer(tokens.admin))
      .send({
        welayatId: createdWelayat.id,
        nameEn: "Test district",
        nameRu: "Тестовый район",
        nameTk: "Synag etraby",
        queuePosition: 3,
        price: 31.5,
        freeDeliveryThreshold: null,
        isDeliveryEnabled: true,
      })
      .expect(201);
    const createdEtrap = createdEtrapResponse.body as {
      id: number;
      welayatId: number;
      nameRu: string;
      nameTk: string;
      queuePosition: number | null;
      price: number;
      freeDeliveryThreshold: number | null;
      isDeliveryEnabled: boolean;
    };
    expect(typeof createdEtrap.id).toBe("number");
    expect(createdEtrap).toMatchObject({
      welayatId: createdWelayat.id,
      nameRu: "Тестовый район",
      nameTk: "Synag etraby",
      queuePosition: 3,
      price: 31.5,
      freeDeliveryThreshold: null,
      isDeliveryEnabled: true,
    });
    await request(server)
      .post("/api/v1/delivery/admin/etraps")
      .set(bearer(tokens.admin))
      .send({
        welayatId: createdWelayat.id,
        nameRu: "Тестовый район",
        nameTk: "Başga etrap",
      })
      .expect(409);
    await request(server)
      .patch(`/api/v1/delivery/admin/etraps/${createdEtrap.id}`)
      .set(bearer(tokens.admin))
      .send({
        nameRu: "Новый район",
        queuePosition: null,
        price: 32,
        freeDeliveryThreshold: 250,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          nameRu: "Новый район",
          queuePosition: null,
          price: 32,
          freeDeliveryThreshold: 250,
        });
      });

    const configurablePublic = await request(server)
      .get("/api/v1/delivery/config")
      .expect(200);
    const configurableConfig =
      configurablePublic.body as DeliveryConfigResponse;
    const configuredWelayat = configurableConfig.welayats.find(
      ({ id }) => id === createdWelayat.id,
    );
    expect(configuredWelayat?.nameRu).toBe("Новый велаят");
    const configuredEtrap = configuredWelayat?.etraps.find(
      ({ id }) => id === createdEtrap.id,
    );
    expect(configuredEtrap).toMatchObject({
      nameRu: "Новый район",
      price: 32,
    });

    await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.admin))
      .send({
        price: 22,
        freeDeliveryThreshold: 200,
        isDeliveryEnabled: true,
      })
      .expect(200);

    const districtOrder = await createOrder(tokens.customer, {
      deliveryEtrapId: 25,
      address: "District pricing street",
      latitude: 37.95031,
      longitude: 58.38031,
    });
    expect(districtOrder).toMatchObject({
      subtotal: 150,
      deliveryFee: 22,
      total: 172,
      deliveryEtrapId: 25,
      deliveryWelayatName: "Ашхабад",
      deliveryEtrapName: "1 мкр",
    });

    await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.admin))
      .send({ price: null })
      .expect(400);
    await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.admin))
      .send({ freeDeliveryThreshold: null })
      .expect(200);

    await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.admin))
      .send({ isDeliveryEnabled: false })
      .expect(200);
    await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [{ productId, quantity: 2 }],
        deliveryEtrapId: 25,
        address: "Disabled district street",
        latitude: 37.95032,
        longitude: 58.38032,
      })
      .expect(400);

    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .set(bearer(tokens.admin))
      .send({ fallbackPrice: 18, fallbackFreeDeliveryThreshold: 160 })
      .expect(200);
    const legacyOrder = await createOrder(tokens.customer, {
      address: "Legacy delivery street",
      latitude: 37.95033,
      longitude: 58.38033,
    });
    expect(legacyOrder).toMatchObject({
      subtotal: 150,
      deliveryFee: 18,
      total: 168,
      deliveryEtrapId: null,
    });

    await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.admin))
      .send({
        price: 15,
        freeDeliveryThreshold: 150,
        isDeliveryEnabled: true,
      })
      .expect(200);
    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .set(bearer(tokens.admin))
      .send({ fallbackPrice: 25, fallbackFreeDeliveryThreshold: 150 })
      .expect(200);

    const enabledBeforeMapPricing = await prisma.etrap.findMany({
      where: { isDeliveryEnabled: true },
      select: { id: true },
    });
    const settingsBeforeMapPricing =
      await prisma.deliverySettings.findUniqueOrThrow({
        where: { id: "default" },
      });
    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .set(bearer(tokens.admin))
      .send({
        mapPricingEnabled: true,
        version: settingsBeforeMapPricing.version,
      })
      .expect(400);

    await prisma.etrap.updateMany({ data: { isDeliveryEnabled: false } });
    const mapTarget = await prisma.etrap.findUniqueOrThrow({
      where: { id: 25 },
    });
    const deliveryZone = [
      { latitude: 37.94, longitude: 58.37 },
      { latitude: 37.94, longitude: 58.39 },
      { latitude: 37.96, longitude: 58.39 },
      { latitude: 37.96, longitude: 58.37 },
    ];

    await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.operator))
      .send({ deliveryZone, version: mapTarget.version })
      .expect(403);
    await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.admin))
      .send({
        deliveryZone: [
          { latitude: 37.94, longitude: 58.37 },
          { latitude: 37.96, longitude: 58.39 },
          { latitude: 37.94, longitude: 58.39 },
          { latitude: 37.96, longitude: 58.37 },
        ],
        version: mapTarget.version,
      })
      .expect(400);
    const zonedTarget = await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.admin))
      .send({
        deliveryZone,
        isDeliveryEnabled: true,
        price: 17,
        freeDeliveryThreshold: null,
        version: mapTarget.version,
      })
      .expect(200);
    expect(zonedTarget.body).toMatchObject({ deliveryZone });

    const legacyUnzonedId = enabledBeforeMapPricing.find(
      ({ id }) => id !== 25,
    )?.id;
    if (legacyUnzonedId !== undefined) {
      await prisma.etrap.update({
        where: { id: legacyUnzonedId },
        data: { isDeliveryEnabled: true },
      });
    }

    const readySettings = await prisma.deliverySettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .set(bearer(tokens.admin))
      .send({ mapPricingEnabled: true, version: readySettings.version })
      .expect(200);

    await request(server)
      .post("/api/v1/orders/quote")
      .set(bearer(tokens.customer))
      .send({
        items: [{ productId, quantity: 2 }],
        latitude: 37.9503,
      })
      .expect(400);

    const mappedQuote = await request(server)
      .post("/api/v1/delivery/quote")
      .send({ latitude: 37.9503, longitude: 58.3803, subtotal: 100 })
      .expect(200);
    expect(mappedQuote.body).toMatchObject({
      matched: true,
      matchSource: "MAP_ZONE",
      fee: 17,
      etrap: { id: 25 },
    });
    const fallbackQuote = await request(server)
      .post("/api/v1/delivery/quote")
      .send({ latitude: 37.8, longitude: 58.1, subtotal: 100 })
      .expect(200);
    expect(fallbackQuote.body).toMatchObject({
      matched: false,
      matchSource: "FALLBACK",
      fee: 25,
      etrap: null,
    });

    const mapPricedOrder = await createOrder(tokens.customer, {
      deliveryEtrapId: createdEtrap.id,
      address: "Map-priced delivery point",
      latitude: 37.9504,
      longitude: 58.3804,
    });
    expect(mapPricedOrder).toMatchObject({
      deliveryEtrapId: 25,
      deliveryFee: 17,
    });

    const activeMapSettings = await prisma.deliverySettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    await request(server)
      .patch("/api/v1/delivery/admin/settings")
      .set(bearer(tokens.admin))
      .send({
        mapPricingEnabled: false,
        version: activeMapSettings.version,
      })
      .expect(200);
    const zonedTargetAfterQuote = await prisma.etrap.findUniqueOrThrow({
      where: { id: 25 },
    });
    await request(server)
      .patch("/api/v1/delivery/admin/etraps/25")
      .set(bearer(tokens.admin))
      .send({
        deliveryZone: null,
        price: 15,
        freeDeliveryThreshold: 150,
        version: zonedTargetAfterQuote.version,
      })
      .expect(200);
    await prisma.etrap.updateMany({ data: { isDeliveryEnabled: false } });
    await prisma.etrap.updateMany({
      where: { id: { in: enabledBeforeMapPricing.map(({ id }) => id) } },
      data: { isDeliveryEnabled: true },
    });
  });

  it("previews selected variant and promo prices without creating an order or consuming the promo", async () => {
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: "security-test-category" },
    });
    const quotedProduct = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Quote variant meal",
        slug: "quote-variant-meal",
        description: "Variant used by the side-effect-free order quote",
        pricingType: ProductPricingType.VARIANT,
        price: 25,
        variantLabel: "Размер",
        variants: {
          create: {
            name: "Большая",
            price: 25,
          },
        },
      },
      include: { variants: true },
    });
    const quotedVariant = quotedProduct.variants[0]!;
    const promo = await prisma.promoCode.create({
      data: {
        code: "QUOTE15",
        type: PromoType.PERCENT,
        value: 15,
        minOrderAmount: 80,
        perUserLimit: 1,
      },
    });
    const body = {
      items: [
        { productId, quantity: 1 },
        {
          productId: quotedProduct.id,
          variantId: quotedVariant.id,
          quantity: 1,
        },
      ],
      deliveryEtrapId: 25,
      promoCode: "quote15",
    };
    const orderCountBefore = await prisma.order.count();

    await request(server).post("/api/v1/orders/quote").send(body).expect(401);
    let quote: OrderQuoteResponse | undefined;
    for (const actor of [
      "customer",
      "operator",
      "cook",
      "courier",
      "accountant",
      "admin",
      "superAdmin",
    ] as const) {
      const response = await request(server)
        .post("/api/v1/orders/quote")
        .set(bearer(tokens[actor]))
        .send(body)
        .expect(200);
      if (actor === "customer") quote = response.body as OrderQuoteResponse;
    }
    expect(quote).toBeDefined();
    if (!quote) throw new Error("Customer order quote was not captured");

    expect(quote).toMatchObject({
      promo: {
        code: "QUOTE15",
        type: PromoType.PERCENT,
        value: 15,
        discount: 15,
      },
      subtotal: 100,
      discount: 15,
      discountedSubtotal: 85,
      deliveryFee: 15,
      total: 100,
      deliveryEtrapId: 25,
    });
    expect(quote.items).toEqual([
      expect.objectContaining({
        productId,
        productVariantId: null,
        productName: "Security test meal",
        variantName: null,
        quantity: 1,
        unitPrice: 75,
        originalLineTotal: 75,
        discount: 11.25,
        discountedLineTotal: 63.75,
      }),
      expect.objectContaining({
        productId: quotedProduct.id,
        productVariantId: quotedVariant.id,
        productName: "Quote variant meal",
        variantName: "Большая",
        quantity: 1,
        unitPrice: 25,
        originalLineTotal: 25,
        discount: 3.75,
        discountedLineTotal: 21.25,
      }),
    ]);
    expect(await prisma.order.count()).toBe(orderCountBefore);
    expect(
      await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } }),
    ).toMatchObject({ usedCount: 0 });
    expect(
      await prisma.promoRedemption.count({
        where: { promoCodeId: promo.id, userId: users.customer.id },
      }),
    ).toBe(0);

    await request(server)
      .post("/api/v1/orders/quote")
      .set(bearer(tokens.customer))
      .send({ ...body, promoCode: "UNKNOWN" })
      .expect(400);
  });

  it("rejects missing, malformed, wrong-audience and inactive-user tokens", async () => {
    await request(server).get("/api/v1/orders").expect(401);
    await request(server)
      .get("/api/v1/orders")
      .set(bearer("not-a-jwt"))
      .expect(401);

    const wrongAudience = await jwt.signAsync(
      {
        sub: users.customer.id,
        phone: users.customer.phone,
        role: Role.CUSTOMER,
      },
      { audience: "another-service" },
    );
    await request(server)
      .get("/api/v1/orders")
      .set(bearer(wrongAudience))
      .expect(401);
    await request(server)
      .get("/api/v1/orders")
      .set(bearer(tokens.inactive))
      .expect(401);
  });

  it("uses the database role instead of trusting a role embedded in JWT", async () => {
    const forgedRole = await jwt.signAsync({
      sub: users.customer.id,
      phone: users.customer.phone,
      role: Role.ADMIN,
    });
    await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(forgedRole))
      .send({ name: "Forbidden", slug: "forbidden-role-escalation" })
      .expect(403);
  });

  it("rejects unknown DTO fields and non-numeric OTP codes", async () => {
    await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99365000999", code: "12a456" })
      .expect(400);
    await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99365000999", code: "123456", isAdmin: true })
      .expect(400);
  });

  it("consumes an OTP once even under concurrent verification", async () => {
    const phone = "+99365000201";
    const challenge = await otp.issue(phone);

    const attempts = await Promise.all([
      request(server)
        .post("/api/v1/auth/otp/verify")
        .send({ phone, code: challenge.code }),
      request(server)
        .post("/api/v1/auth/otp/verify")
        .send({ phone, code: challenge.code }),
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 401]);

    const successful = attempts.find(({ status }) => status === 200);
    expect(successful).toBeDefined();
    const session = successful?.body as SessionResponse;
    expect(session.accessToken).toEqual(expect.any(String));
    expect(session.refreshToken).toEqual(expect.any(String));
    await request(server)
      .get("/api/v1/users/me")
      .set(bearer(session.accessToken))
      .expect(200);

    const [tokenId] = session.refreshToken.split(".");
    await request(server)
      .post("/api/v1/auth/logout")
      .send({ refreshToken: `${tokenId}.wrong-secret` })
      .expect(200);
    await request(server)
      .get("/api/v1/users/me")
      .set(bearer(session.accessToken))
      .expect(200);

    const refreshed = await request(server)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    const rotated = refreshed.body as SessionResponse;
    await request(server)
      .get("/api/v1/users/me")
      .set(bearer(session.accessToken))
      .expect(401);
    await request(server)
      .get("/api/v1/users/me")
      .set(bearer(rotated.accessToken))
      .expect(200);

    const rotations = await Promise.all([
      request(server)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: rotated.refreshToken }),
      request(server)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: rotated.refreshToken }),
    ]);
    expect(rotations.map(({ status }) => status).sort()).toEqual([200, 401]);
    await request(server)
      .get("/api/v1/users/me")
      .set(bearer(rotated.accessToken))
      .expect(401);
    const latest = rotations.find(({ status }) => status === 200)
      ?.body as SessionResponse;
    await request(server)
      .get("/api/v1/users/me")
      .set(bearer(latest.accessToken))
      .expect(200);
    await request(server)
      .post("/api/v1/auth/logout")
      .send({ refreshToken: latest.refreshToken })
      .expect(200);
    await request(server)
      .get("/api/v1/users/me")
      .set(bearer(latest.accessToken))
      .expect(401);
  });

  it("locks an OTP after five incorrect attempts", async () => {
    const phone = "+99365000202";
    const challenge = await otp.issue(phone);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(otp.verify(phone, "000000")).resolves.toBe("incorrect");
    }
    await expect(otp.verify(phone, challenge.code)).resolves.toBe(
      "unavailable",
    );
  });

  it("allows only administrators to permanently delete banner records", async () => {
    const bannerInput = {
      title: "Deletable banner",
      subtitle: "Removed from public and admin lists",
      imageUrl: mediaUrl(120),
      link: "/orders",
      sortOrder: 8,
      isActive: true,
    };

    await request(server)
      .post("/api/v1/marketing/banners")
      .set(bearer(tokens.operator))
      .send(bannerInput)
      .expect(403);
    const created = await request(server)
      .post("/api/v1/marketing/banners")
      .set(bearer(tokens.admin))
      .send(bannerInput)
      .expect(201);
    const bannerId = (created.body as { id: string }).id;
    expect(
      (
        (await request(server).get("/api/v1/marketing/banners").expect(200))
          .body as Array<{ id: string }>
      ).some(({ id }) => id === bannerId),
    ).toBe(true);

    await request(server)
      .delete(`/api/v1/marketing/banners/${bannerId}`)
      .set(bearer(tokens.operator))
      .expect(403);
    await request(server)
      .delete(`/api/v1/marketing/banners/${bannerId}`)
      .set(bearer(tokens.customer))
      .expect(403);
    await request(server)
      .delete("/api/v1/marketing/banners/00000000-0000-4000-8000-000000009999")
      .set(bearer(tokens.admin))
      .expect(404);

    const deleted = await request(server)
      .delete(`/api/v1/marketing/banners/${bannerId}`)
      .set(bearer(tokens.admin))
      .expect(200);
    expect(deleted.body).toMatchObject({
      id: bannerId,
      title: bannerInput.title,
      imageUrl: bannerInput.imageUrl,
    });
    await request(server)
      .delete(`/api/v1/marketing/banners/${bannerId}`)
      .set(bearer(tokens.admin))
      .expect(404);

    const [publicAfterDelete, adminAfterDelete] = await Promise.all([
      request(server).get("/api/v1/marketing/banners").expect(200),
      request(server)
        .get("/api/v1/marketing/admin/banners")
        .set(bearer(tokens.admin))
        .expect(200),
    ]);
    for (const response of [publicAfterDelete, adminAfterDelete]) {
      expect(
        (response.body as Array<{ id: string }>).some(
          ({ id }) => id === bannerId,
        ),
      ).toBe(false);
    }
    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: "marketing.banner.deleted",
          entityId: bannerId,
        },
      }),
    ).toMatchObject({
      actorId: users.admin.id,
      entityType: "Banner",
      metadata: {
        title: bannerInput.title,
        imageUrl: bannerInput.imageUrl,
        isActive: true,
      },
    });

    const superAdminBanner = await request(server)
      .post("/api/v1/marketing/banners")
      .set(bearer(tokens.admin))
      .send({
        ...bannerInput,
        title: "Super admin deletable banner",
        imageUrl: mediaUrl(121),
      })
      .expect(201);
    const superAdminBannerId = (superAdminBanner.body as { id: string }).id;
    await request(server)
      .delete(`/api/v1/marketing/banners/${superAdminBannerId}`)
      .set(bearer(tokens.superAdmin))
      .expect(200);
  });

  it("enforces admin-only catalog mutations", async () => {
    await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.operator))
      .send({ name: "Operator category", slug: "operator-category" })
      .expect(403);

    await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({
        name: "Admin category",
        slug: "admin-category",
        unexpected: true,
      })
      .expect(400);

    const categoryResponse = await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({
        name: "Admin category",
        slug: "admin-category",
        receiptPrinterIp: "192.168.10.52",
      })
      .expect(201);
    const categoryId = (categoryResponse.body as { id: string }).id;
    expect(categoryResponse.body).toMatchObject({
      receiptPrinterIp: "192.168.10.52",
    });

    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.operator))
      .send({
        categoryId,
        name: "Operator product",
        slug: "operator-product",
        description: "Must not be created",
        price: 10,
      })
      .expect(403);

    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Invalid printer IP",
        slug: "invalid-printer-ip",
        description: "LAN printer IPv4 validation",
        price: 12,
        receiptPrinterIp: "192.168.1.999",
      })
      .expect(400);

    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Public printer IP",
        slug: "public-printer-ip",
        description: "Only private LAN printer addresses are accepted",
        price: 12,
        receiptPrinterIp: "8.8.8.8",
      })
      .expect(400);

    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "External image product",
        slug: "external-image-product",
        description: "External image URLs are forbidden",
        price: 12,
        imageUrls: ["https://example.com/not-private-storage.jpg"],
      })
      .expect(400);
    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Duplicate variant names",
        slug: "duplicate-variant-names",
        description: "Names are unique without case sensitivity",
        price: 45,
        variantLabel: "Размер",
        variants: [
          { name: "Small", price: 45 },
          { name: " small ", price: 55 },
        ],
      })
      .expect(400);
    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Too many variant images",
        slug: "too-many-variant-images",
        description: "Each variant has an independent image limit",
        price: 45,
        variantLabel: "Размер",
        variants: [
          {
            name: "Маленькая",
            price: 45,
            imageUrls: Array.from({ length: 11 }, (_, index) =>
              mediaUrl(index + 80),
            ),
          },
        ],
      })
      .expect(400);

    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Too many images",
        slug: "too-many-images",
        description: "The DTO enforces the product image limit",
        price: 15,
        imageUrls: Array.from({ length: 11 }, (_, index) =>
          mediaUrl(index + 1),
        ),
      })
      .expect(400);

    const imageUrls = [mediaUrl(1), mediaUrl(2), mediaUrl(3)];
    const createdProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Three image meal",
        slug: "three-image-meal",
        description: "A complete menu item with several ordered images",
        price: 49.9,
        receiptPrinterIp: "192.168.10.50",
        imageUrls,
      })
      .expect(201);
    const createdProduct =
      createdProductResponse.body as CatalogProductResponse;
    expect(createdProduct).toMatchObject({
      categoryId,
      description: "A complete menu item with several ordered images",
      price: 49.9,
      receiptPrinterIp: "192.168.10.50",
    });
    expect(createdProduct.images.map(({ url }) => url)).toEqual(imageUrls);
    expect(createdProduct.images.map(({ sortOrder }) => sortOrder)).toEqual([
      0, 1, 2,
    ]);

    const replacementUrls = [mediaUrl(3), mediaUrl(1)];
    const updatedProductResponse = await request(server)
      .patch(`/api/v1/catalog/products/${createdProduct.id}`)
      .set(bearer(tokens.admin))
      .send({ imageUrls: replacementUrls })
      .expect(200);
    const updatedProduct =
      updatedProductResponse.body as CatalogProductResponse;
    expect(updatedProduct.images.map(({ url }) => url)).toEqual(
      replacementUrls,
    );

    const publicProducts = await request(server)
      .get(`/api/v1/catalog/products?categoryId=${categoryId}`)
      .expect(200);
    const publicCreatedProduct = (
      publicProducts.body as CatalogProductResponse[]
    ).find(({ id }) => id === createdProduct.id);
    expect(publicCreatedProduct?.images.map(({ url }) => url)).toEqual(
      replacementUrls,
    );
    expect(publicCreatedProduct).not.toHaveProperty("receiptPrinterIp");
    const publicCategories = await request(server)
      .get("/api/v1/catalog/categories")
      .expect(200);
    expect(
      (publicCategories.body as Array<Record<string, unknown>>).find(
        ({ id }) => id === categoryId,
      ),
    ).not.toHaveProperty("receiptPrinterIp");

    const adminProducts = await request(server)
      .get(`/api/v1/catalog/admin/products?categoryId=${categoryId}`)
      .set(bearer(tokens.admin))
      .expect(200);
    expect(
      (adminProducts.body as CatalogProductResponse[]).find(
        ({ id }) => id === createdProduct.id,
      ),
    ).toMatchObject({ receiptPrinterIp: "192.168.10.50" });

    const fullProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Full image meal",
        slug: "full-image-meal",
        description: "Already contains the maximum image count",
        price: 55,
        imageUrls: Array.from({ length: 10 }, (_, index) =>
          mediaUrl(index + 20),
        ),
      })
      .expect(201);
    const fullProduct = fullProductResponse.body as CatalogProductResponse;

    await request(server)
      .post(`/api/v1/catalog/products/${fullProduct.id}/images`)
      .set(bearer(tokens.admin))
      .send({ url: mediaUrl(99) })
      .expect(409);

    const variantImageUrls = [mediaUrl(70), mediaUrl(71)];
    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Fixed product without price",
        slug: "fixed-product-without-price",
        description: "A fixed product must have its own price",
        pricingType: ProductPricingType.FIXED,
      })
      .expect(400);
    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Variant product without variants",
        slug: "variant-product-without-variants",
        description: "Variant pricing requires a sellable option",
        pricingType: ProductPricingType.VARIANT,
        variantLabel: "Размер",
        variants: [],
      })
      .expect(400);
    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Variant product without active variants",
        slug: "variant-product-without-active-variants",
        description: "At least one option must remain orderable",
        pricingType: ProductPricingType.VARIANT,
        variantLabel: "Размер",
        variants: [{ name: "Скрытый", price: 45, isActive: false }],
      })
      .expect(400);
    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Variant without selector",
        slug: "variant-without-selector",
        description: "A selector label is required",
        price: 45,
        variants: [{ name: "Small", price: 45 }],
      })
      .expect(400);
    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "External variant image",
        slug: "external-variant-image",
        description: "Variant images must come from private media storage",
        price: 45,
        variantLabel: "Размер",
        variants: [
          {
            name: "Маленькая",
            price: 45,
            imageUrls: ["https://example.com/external.webp"],
          },
        ],
      })
      .expect(400);

    const variantProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Pizza with sizes",
        slug: "pizza-with-sizes",
        description: "The cheapest active size is the displayed price",
        pricingType: ProductPricingType.VARIANT,
        receiptPrinterIp: "192.168.10.51",
        variantLabel: "Размер",
        variants: [
          {
            name: "Большая, 35 см",
            description: "Для компании",
            price: 75,
            sortOrder: 1,
            imageUrls: [variantImageUrls[1]],
          },
          {
            name: "Маленькая, 25 см",
            price: 45,
            sortOrder: 0,
            imageUrls: [variantImageUrls[0]],
          },
        ],
      })
      .expect(201);
    const variantProduct =
      variantProductResponse.body as CatalogProductResponse;
    expect(variantProduct).toMatchObject({
      pricingType: ProductPricingType.VARIANT,
      price: 45,
      minPrice: 45,
      hasVariants: true,
      receiptPrinterIp: "192.168.10.51",
      variantLabel: "Размер",
      displayImageUrl: variantImageUrls[0],
    });
    expect(variantProduct.variants.map(({ name }) => name)).toEqual([
      "Маленькая, 25 см",
      "Большая, 35 см",
    ]);
    const smallVariant = variantProduct.variants[0];
    const largeVariant = variantProduct.variants[1];
    await request(server)
      .patch(`/api/v1/catalog/products/${variantProduct.id}`)
      .set(bearer(tokens.admin))
      .send({ variantLabel: "" })
      .expect(400);
    const variantDelivery = {
      addressLabel: "Variant test",
      address: "Variant street 1",
      latitude: 37.95021,
      longitude: 58.38021,
    };

    const explicitVariantOrderResponse = await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [
          {
            productId: variantProduct.id,
            variantId: largeVariant.id,
            quantity: 2,
          },
        ],
        ...variantDelivery,
      })
      .expect(201);
    const explicitVariantOrder =
      explicitVariantOrderResponse.body as OrderResponse;
    expect(explicitVariantOrder.subtotal).toBe(150);
    expect(explicitVariantOrder.items?.[0]).toMatchObject({
      productId: variantProduct.id,
      productVariantId: largeVariant.id,
      variantName: "Большая, 35 см",
      unitPrice: 75,
      quantity: 2,
      lineTotal: 150,
      productImageUrl: variantImageUrls[1],
    });
    expect(explicitVariantOrder.items?.[0]).not.toHaveProperty(
      "receiptPrinterIp",
    );
    const printerSnapshot = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: explicitVariantOrder.id },
    });
    expect(printerSnapshot.receiptPrinterIp).toBe("192.168.10.51");

    const compatibleOrderResponse = await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [{ productId: variantProduct.id, quantity: 1 }],
        ...variantDelivery,
      })
      .expect(201);
    const compatibleOrder = compatibleOrderResponse.body as OrderResponse;
    expect(compatibleOrder.subtotal).toBe(45);
    expect(compatibleOrder.items?.[0]).toMatchObject({
      productVariantId: smallVariant.id,
      variantName: "Маленькая, 25 см",
      unitPrice: 45,
      productImageUrl: variantImageUrls[0],
    });

    await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [
          {
            productId: createdProduct.id,
            variantId: smallVariant.id,
            quantity: 1,
          },
        ],
        ...variantDelivery,
      })
      .expect(400);

    await request(server)
      .patch(`/api/v1/catalog/products/${variantProduct.id}`)
      .set(bearer(tokens.admin))
      .send({
        variants: [
          {
            id: largeVariant.id,
            name: smallVariant.name,
            price: largeVariant.price,
            sortOrder: largeVariant.sortOrder,
            isActive: true,
          },
        ],
      })
      .expect(400);

    const updatedVariantProductResponse = await request(server)
      .patch(`/api/v1/catalog/products/${variantProduct.id}`)
      .set(bearer(tokens.admin))
      .send({
        variantLabel: "Размер",
        variants: [
          {
            id: smallVariant.id,
            name: smallVariant.name,
            description: smallVariant.description ?? undefined,
            price: smallVariant.price,
            sortOrder: smallVariant.sortOrder,
            isActive: false,
            imageUrls: variantImageUrls.slice(0, 1),
          },
          {
            id: largeVariant.id,
            name: largeVariant.name,
            description: largeVariant.description ?? undefined,
            price: 70,
            sortOrder: largeVariant.sortOrder,
            isActive: true,
            imageUrls: variantImageUrls.slice(1),
          },
        ],
      })
      .expect(200);
    const updatedVariantProduct =
      updatedVariantProductResponse.body as CatalogProductResponse;
    expect(updatedVariantProduct).toMatchObject({ price: 70, minPrice: 70 });
    expect(
      updatedVariantProduct.variants.find(({ id }) => id === smallVariant.id)
        ?.isActive,
    ).toBe(false);
    await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [
          {
            productId: variantProduct.id,
            variantId: smallVariant.id,
            quantity: 1,
          },
        ],
        ...variantDelivery,
      })
      .expect(400);

    const publicVariantProducts = await request(server)
      .get(`/api/v1/catalog/products?categoryId=${categoryId}`)
      .expect(200);
    const publicVariantProduct = (
      publicVariantProducts.body as CatalogProductResponse[]
    ).find(({ id }) => id === variantProduct.id);
    expect(publicVariantProduct?.variants).toHaveLength(1);
    expect(publicVariantProduct?.variants[0]).toMatchObject({
      id: largeVariant.id,
      price: 70,
    });

    await request(server)
      .patch(`/api/v1/catalog/products/${variantProduct.id}`)
      .set(bearer(tokens.admin))
      .send({ pricingType: ProductPricingType.FIXED, variants: [] })
      .expect(400);
    const fixedProduct = await request(server)
      .patch(`/api/v1/catalog/products/${variantProduct.id}`)
      .set(bearer(tokens.admin))
      .send({
        pricingType: ProductPricingType.FIXED,
        price: 52,
        variants: [],
      })
      .expect(200);
    expect(fixedProduct.body).toMatchObject({
      pricingType: ProductPricingType.FIXED,
      price: 52,
      minPrice: 52,
      hasVariants: false,
      variantLabel: null,
    });
    expect(
      await prisma.productVariant.count({
        where: { productId: variantProduct.id, isActive: true },
      }),
    ).toBe(0);
  });

  it("scopes categories to cafes while allowing one order to mix cafe products", async () => {
    await request(server)
      .post("/api/v1/catalog/cafes")
      .set(bearer(tokens.operator))
      .send({ name: "Forbidden cafe" })
      .expect(403);
    await request(server).get("/api/v1/catalog/admin/cafes").expect(401);
    await request(server)
      .get("/api/v1/catalog/categories?cafeId=not-a-uuid")
      .expect(400);

    const firstCafeResponse = await request(server)
      .post("/api/v1/catalog/cafes")
      .set(bearer(tokens.admin))
      .send({
        name: "Multi cafe burgers",
        description: "First virtual kitchen brand",
        imageUrl: mediaUrl(151),
        sortOrder: 151,
      })
      .expect(201);
    const secondCafeResponse = await request(server)
      .post("/api/v1/catalog/cafes")
      .set(bearer(tokens.admin))
      .send({
        name: "Multi cafe pizza",
        description: "Second virtual kitchen brand",
        imageUrl: mediaUrl(152),
        sortOrder: 152,
      })
      .expect(201);
    const firstCafe = firstCafeResponse.body as CatalogCafeResponse;
    const secondCafe = secondCafeResponse.body as CatalogCafeResponse;
    expect(firstCafe).toMatchObject({
      slug: "multi-cafe-burgers",
      categoryCount: 0,
      imageUrl: mediaUrl(151),
    });

    const firstCategoryResponse = await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({ cafeId: firstCafe.id, name: "Multi cafe burgers menu" })
      .expect(201);
    const secondCategoryResponse = await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({ cafeId: secondCafe.id, name: "Multi cafe pizza menu" })
      .expect(201);
    const firstCategoryId = (firstCategoryResponse.body as { id: string }).id;
    const secondCategoryId = (secondCategoryResponse.body as { id: string }).id;
    expect(firstCategoryResponse.body).toMatchObject({
      cafeId: firstCafe.id,
      cafe: { id: firstCafe.id, name: firstCafe.name },
    });

    const firstProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId: firstCategoryId,
        name: "Multi cafe burger meal",
        description: "Burger from the first cafe",
        price: 31,
      })
      .expect(201);
    const secondProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId: secondCategoryId,
        name: "Multi cafe pizza meal",
        description: "Pizza from the second cafe",
        price: 44,
      })
      .expect(201);
    const firstProduct = firstProductResponse.body as CatalogProductResponse;
    const secondProduct = secondProductResponse.body as CatalogProductResponse;

    const publicCafes = await request(server)
      .get("/api/v1/catalog/cafes")
      .expect(200);
    expect(publicCafes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstCafe.id, imageUrl: mediaUrl(151) }),
        expect.objectContaining({ id: secondCafe.id, imageUrl: mediaUrl(152) }),
      ]),
    );

    const [firstCategories, secondCategories, firstProducts] =
      await Promise.all([
        request(server)
          .get(`/api/v1/catalog/categories?cafeId=${firstCafe.id}`)
          .expect(200),
        request(server)
          .get(`/api/v1/catalog/categories?cafeId=${secondCafe.id}`)
          .expect(200),
        request(server)
          .get(`/api/v1/catalog/products?cafeId=${firstCafe.id}`)
          .expect(200),
      ]);
    expect(
      (firstCategories.body as PublicCatalogCategoryResponse[]).map(
        ({ id }) => id,
      ),
    ).toEqual([firstCategoryId]);
    expect(
      (secondCategories.body as PublicCatalogCategoryResponse[]).map(
        ({ id }) => id,
      ),
    ).toEqual([secondCategoryId]);
    expect(
      (firstProducts.body as CatalogProductResponse[]).map(({ id }) => id),
    ).toEqual([firstProduct.id]);

    const mixedOrder = await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [
          { productId: firstProduct.id, quantity: 1 },
          { productId: secondProduct.id, quantity: 2 },
        ],
        address: "Multi cafe delivery street",
        latitude: 37.95025,
        longitude: 58.38025,
      })
      .expect(201);
    expect(
      (mixedOrder.body as OrderResponse).items?.map(
        ({ productId }) => productId,
      ),
    ).toEqual([firstProduct.id, secondProduct.id]);
    expect(mixedOrder.body).toMatchObject({ branchId: nearestBranchId });

    await request(server)
      .patch(`/api/v1/catalog/categories/${firstCategoryId}`)
      .set(bearer(tokens.operator))
      .send({ cafeId: secondCafe.id })
      .expect(403);
    const movedCategory = await request(server)
      .patch(`/api/v1/catalog/categories/${firstCategoryId}`)
      .set(bearer(tokens.admin))
      .send({ cafeId: secondCafe.id })
      .expect(200);
    expect(movedCategory.body).toMatchObject({
      cafeId: secondCafe.id,
      cafe: { id: secondCafe.id, name: secondCafe.name },
    });
    const [emptiedFirstCafe, expandedSecondCafe] = await Promise.all([
      request(server)
        .get(`/api/v1/catalog/categories?cafeId=${firstCafe.id}`)
        .expect(200),
      request(server)
        .get(`/api/v1/catalog/categories?cafeId=${secondCafe.id}`)
        .expect(200),
    ]);
    expect(emptiedFirstCafe.body).toEqual([]);
    expect(
      (expandedSecondCafe.body as PublicCatalogCategoryResponse[]).map(
        ({ id }) => id,
      ),
    ).toEqual([firstCategoryId, secondCategoryId]);
    await request(server)
      .patch(`/api/v1/catalog/categories/${firstCategoryId}`)
      .set(bearer(tokens.admin))
      .send({ cafeId: firstCafe.id })
      .expect(200);

    await request(server)
      .patch(`/api/v1/catalog/cafes/${secondCafe.id}`)
      .set(bearer(tokens.admin))
      .send({ isActive: false })
      .expect(200);
    const hiddenCafeCategories = await request(server)
      .get(`/api/v1/catalog/categories?cafeId=${secondCafe.id}`)
      .expect(200);
    expect(hiddenCafeCategories.body).toEqual([]);
    await request(server)
      .post("/api/v1/orders/quote")
      .set(bearer(tokens.customer))
      .send({ items: [{ productId: secondProduct.id, quantity: 1 }] })
      .expect(400);

    const adminCafes = await request(server)
      .get("/api/v1/catalog/admin/cafes")
      .set(bearer(tokens.admin))
      .expect(200);
    expect(
      (adminCafes.body as CatalogCafeResponse[]).find(
        ({ id }) => id === secondCafe.id,
      ),
    ).toMatchObject({ isActive: false, categoryCount: 1 });
  });

  it("hides a category without losing its kitchen printer route", async () => {
    const createdCategory = await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({
        name: "Hidden kitchen category",
        slug: "hidden-kitchen-category",
        receiptPrinterIp: "192.168.123.110",
        sortOrder: 12,
      })
      .expect(201);
    const categoryId = (createdCategory.body as { id: string }).id;
    const createdProduct = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Hidden category product",
        slug: "hidden-category-product",
        description: "Disappears when its parent category is hidden",
        price: 20,
      })
      .expect(201);
    const productId = (createdProduct.body as { id: string }).id;

    await request(server)
      .patch(`/api/v1/catalog/categories/${categoryId}`)
      .set(bearer(tokens.operator))
      .send({ isActive: false })
      .expect(403);
    const hidden = await request(server)
      .patch(`/api/v1/catalog/categories/${categoryId}`)
      .set(bearer(tokens.admin))
      .send({ isActive: false })
      .expect(200);
    expect(hidden.body).toMatchObject({
      id: categoryId,
      isActive: false,
      receiptPrinterIp: "192.168.123.110",
      sortOrder: 12,
    });

    const [publicCategories, publicProducts, adminCategories] =
      await Promise.all([
        request(server).get("/api/v1/catalog/categories").expect(200),
        request(server)
          .get(`/api/v1/catalog/products?categoryId=${categoryId}`)
          .expect(200),
        request(server)
          .get("/api/v1/catalog/admin/categories")
          .set(bearer(tokens.admin))
          .expect(200),
      ]);
    expect(
      (publicCategories.body as Array<{ id: string }>).some(
        ({ id }) => id === categoryId,
      ),
    ).toBe(false);
    expect(
      (publicProducts.body as Array<{ id: string }>).some(
        ({ id }) => id === productId,
      ),
    ).toBe(false);
    expect(
      (adminCategories.body as Array<Record<string, unknown>>).find(
        ({ id }) => id === categoryId,
      ),
    ).toMatchObject({
      isActive: false,
      receiptPrinterIp: "192.168.123.110",
    });
    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: "catalog.category.updated",
          entityId: categoryId,
        },
        orderBy: { createdAt: "desc" },
      }),
    ).toMatchObject({
      actorId: users.admin.id,
      metadata: { changedFields: ["isActive"] },
    });
  });

  it("paginates and filters the administrator catalog without changing legacy lists", async () => {
    const slug = "catalog-pagination-test";
    await prisma.product.deleteMany({ where: { category: { slug } } });
    await prisma.category.deleteMany({ where: { slug } });
    const category = await prisma.category.create({
      data: {
        name: "Catalog pagination test",
        slug,
        products: {
          create: Array.from({ length: 5 }, (_, index) => ({
            name: `Pagination meal ${index + 1}`,
            slug: `pagination-meal-${index + 1}`,
            description: `Page fixture ${index + 1}`,
            price: 20 + index,
            sortOrder: index + 1,
          })),
        },
      },
    });

    try {
      await request(server)
        .get("/api/v1/catalog/admin/category-summaries")
        .expect(401);
      await request(server)
        .get("/api/v1/catalog/admin/products/page")
        .expect(401);

      const summaries = await request(server)
        .get("/api/v1/catalog/admin/category-summaries")
        .set(bearer(tokens.admin))
        .expect(200);
      const summary = (summaries.body as Array<Record<string, unknown>>).find(
        ({ id }) => id === category.id,
      );
      expect(summary).toMatchObject({
        id: category.id,
        productCount: 5,
      });
      expect(summary).not.toHaveProperty("products");

      const firstPage = await request(server)
        .get(
          `/api/v1/catalog/admin/products/page?categoryId=${category.id}&page=1&limit=2`,
        )
        .set(bearer(tokens.admin))
        .expect(200);
      const secondPage = await request(server)
        .get(
          `/api/v1/catalog/admin/products/page?categoryId=${category.id}&page=2&limit=2`,
        )
        .set(bearer(tokens.admin))
        .expect(200);
      const lastPage = await request(server)
        .get(
          `/api/v1/catalog/admin/products/page?categoryId=${category.id}&page=3&limit=2`,
        )
        .set(bearer(tokens.admin))
        .expect(200);
      const pages = [firstPage, secondPage, lastPage].map(
        ({ body }) => body as AdminCatalogProductPageResponse,
      );

      expect(pages.map(({ page }) => page)).toEqual([1, 2, 3]);
      expect(pages[0]).toMatchObject({
        pageSize: 2,
        total: 5,
        totalPages: 3,
      });
      expect(pages.map(({ items }) => items.map(({ name }) => name))).toEqual([
        ["Pagination meal 1", "Pagination meal 2"],
        ["Pagination meal 3", "Pagination meal 4"],
        ["Pagination meal 5"],
      ]);
      expect(
        new Set(pages.flatMap(({ items }) => items.map(({ id }) => id))).size,
      ).toBe(5);

      const filtered = await request(server)
        .get(
          `/api/v1/catalog/admin/products/page?categoryId=${category.id}&query=meal%204&page=1&limit=2`,
        )
        .set(bearer(tokens.admin))
        .expect(200);
      expect(filtered.body).toMatchObject({ total: 1, totalPages: 1 });
      expect(
        (filtered.body as AdminCatalogProductPageResponse).items.map(
          ({ name }) => name,
        ),
      ).toEqual(["Pagination meal 4"]);

      const legacy = await request(server)
        .get(`/api/v1/catalog/admin/products?categoryId=${category.id}`)
        .set(bearer(tokens.admin))
        .expect(200);
      expect(legacy.body).toHaveLength(5);

      await request(server)
        .get("/api/v1/catalog/admin/products/page?page=0")
        .set(bearer(tokens.admin))
        .expect(400);
      await request(server)
        .get("/api/v1/catalog/admin/products/page?limit=101")
        .set(bearer(tokens.admin))
        .expect(400);
    } finally {
      await prisma.product.deleteMany({ where: { categoryId: category.id } });
      await prisma.category.delete({ where: { id: category.id } });
    }
  });

  it("permanently deletes unused catalog records and preserves order history", async () => {
    const deletableCategoryResponse = await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({
        name: "Deletable catalog category",
        slug: "deletable-catalog-category",
        receiptPrinterIp: "192.168.123.120",
      })
      .expect(201);
    const deletableCategoryId = (
      deletableCategoryResponse.body as { id: string }
    ).id;
    const firstProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId: deletableCategoryId,
        name: "Individually deletable product",
        slug: "individually-deletable-product",
        description: "Has no order history",
        price: 19,
      })
      .expect(201);
    const firstProductId = (firstProductResponse.body as { id: string }).id;
    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId: deletableCategoryId,
        name: "Cascade deletable product",
        slug: "cascade-deletable-product",
        description: "Deleted with its unused category",
        price: 21,
      })
      .expect(201);

    await request(server)
      .delete(`/api/v1/catalog/products/${firstProductId}`)
      .set(bearer(tokens.operator))
      .expect(403);
    await request(server)
      .delete(`/api/v1/catalog/products/${firstProductId}`)
      .set(bearer(tokens.admin))
      .expect(204);
    await request(server)
      .delete(`/api/v1/catalog/products/${firstProductId}`)
      .set(bearer(tokens.admin))
      .expect(404);
    await request(server)
      .delete(`/api/v1/catalog/categories/${deletableCategoryId}`)
      .set(bearer(tokens.superAdmin))
      .expect(204);
    expect(
      await prisma.product.count({
        where: { categoryId: deletableCategoryId },
      }),
    ).toBe(0);
    expect(
      await prisma.category.count({ where: { id: deletableCategoryId } }),
    ).toBe(0);

    const protectedCategoryResponse = await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({
        name: "Order history catalog category",
        slug: "order-history-catalog-category",
      })
      .expect(201);
    const protectedCategoryId = (
      protectedCategoryResponse.body as { id: string }
    ).id;
    const protectedProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId: protectedCategoryId,
        name: "Order history product",
        slug: "order-history-product",
        description: "Must remain available to historical order rows",
        price: 24,
      })
      .expect(201);
    const protectedProductId = (protectedProductResponse.body as { id: string })
      .id;
    await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [{ productId: protectedProductId, quantity: 1 }],
        address: "Catalog deletion history street",
        latitude: 37.95021,
        longitude: 58.38021,
      })
      .expect(201);

    const productConflict = await request(server)
      .delete(`/api/v1/catalog/products/${protectedProductId}`)
      .set(bearer(tokens.admin))
      .expect(409);
    expect((productConflict.body as { message: string }).message).toContain(
      "Скройте блюдо",
    );
    const categoryConflict = await request(server)
      .delete(`/api/v1/catalog/categories/${protectedCategoryId}`)
      .set(bearer(tokens.admin))
      .expect(409);
    expect((categoryConflict.body as { message: string }).message).toContain(
      "Скройте категорию",
    );
    expect(
      await prisma.product.count({ where: { id: protectedProductId } }),
    ).toBe(1);

    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: "catalog.product.deleted",
          entityId: firstProductId,
        },
      }),
    ).toMatchObject({
      actorId: users.admin.id,
      entityType: "Product",
      metadata: { retainedMediaObjects: true },
    });
    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: "catalog.category.deleted",
          entityId: deletableCategoryId,
        },
      }),
    ).toMatchObject({
      actorId: users.superAdmin.id,
      entityType: "Category",
      metadata: { productCount: 1, retainedMediaObjects: true },
    });
  });

  it("prices multiple variants independently and aggregates duplicate selections", async () => {
    const category = await prisma.category.create({
      data: {
        name: "Variant order category",
        slug: "variant-order-category",
      },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Variant order product",
        slug: "variant-order-product",
        description: "Used to verify independent variant order lines",
        pricingType: ProductPricingType.VARIANT,
        price: 40,
        variantLabel: "Размер",
        variants: {
          create: [
            { name: "Маленькая", price: 40, sortOrder: 0 },
            { name: "Большая", price: 80, sortOrder: 1 },
          ],
        },
      },
      include: { variants: { orderBy: { sortOrder: "asc" } } },
    });
    const [small, large] = product.variants;
    const delivery = {
      addressLabel: "Variant aggregation",
      address: "Variant aggregation street",
      latitude: 37.95021,
      longitude: 58.38021,
    };

    const response = await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [
          { productId: product.id, variantId: small.id, quantity: 1 },
          { productId: product.id, variantId: large.id, quantity: 2 },
          { productId: product.id, variantId: small.id, quantity: 2 },
        ],
        ...delivery,
      })
      .expect(201);
    const order = response.body as OrderResponse;
    expect(order.subtotal).toBe(280);
    expect(order.items).toHaveLength(2);
    expect(
      order.items?.find(
        ({ productVariantId }) => productVariantId === small.id,
      ),
    ).toMatchObject({ quantity: 3, unitPrice: 40, lineTotal: 120 });
    expect(
      order.items?.find(
        ({ productVariantId }) => productVariantId === large.id,
      ),
    ).toMatchObject({ quantity: 2, unitPrice: 80, lineTotal: 160 });

    await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [
          { productId: product.id, variantId: small.id, quantity: 30 },
          { productId: product.id, variantId: small.id, quantity: 21 },
        ],
        ...delivery,
      })
      .expect(400);
  });

  it("manages printer endpoints and assigns category defaults with product overrides", async () => {
    await request(server)
      .get("/api/v1/catalog/admin/receipt-printers")
      .expect(401);
    const predefinedPrinters = (
      await request(server)
        .get("/api/v1/catalog/admin/receipt-printers")
        .set(bearer(tokens.operator))
        .expect(200)
    ).body as ReceiptPrinterResponse[];
    expect(predefinedPrinters).toHaveLength(6);
    expect(
      predefinedPrinters.every(({ id }) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
      ),
    ).toBe(true);
    expect(
      predefinedPrinters.map(
        ({ name, ipAddress, port, transport, isActive }) => ({
          name,
          ipAddress,
          port,
          transport,
          isActive,
        }),
      ),
    ).toEqual(
      expect.arrayContaining(
        [
          { name: "Аппарат 1", ipAddress: "192.168.123.100" },
          { name: "Аппарат 2", ipAddress: "192.168.123.101" },
          { name: "Аппарат 3", ipAddress: "192.168.123.105" },
          { name: "Аппарат 4", ipAddress: "192.168.0.4" },
          { name: "Аппарат 5", ipAddress: "192.168.0.86" },
          { name: "Аппарат 6", ipAddress: "192.168.0.87" },
        ].map((printer) => ({
          ...printer,
          port: 9100,
          transport: "RAW_TCP",
          isActive: true,
        })),
      ),
    );
    const selectablePredefinedPrinter = predefinedPrinters.find(
      ({ ipAddress }) => ipAddress === "192.168.123.100",
    );
    expect(selectablePredefinedPrinter).toBeDefined();
    if (!selectablePredefinedPrinter) {
      throw new Error("Predefined receipt printer was not returned");
    }
    const predefinedCategory = (
      await request(server)
        .post("/api/v1/catalog/categories")
        .set(bearer(tokens.admin))
        .send({
          name: "Predefined printer category",
          slug: "predefined-printer-category",
          receiptPrinterId: selectablePredefinedPrinter.id,
        })
        .expect(201)
    ).body as { id: string; receiptPrinterId: string | null };
    expect(predefinedCategory).toMatchObject({
      receiptPrinterId: selectablePredefinedPrinter.id,
    });
    await request(server)
      .patch(
        `/api/v1/catalog/receipt-printers/${selectablePredefinedPrinter.id}`,
      )
      .set(bearer(tokens.admin))
      .send({ name: selectablePredefinedPrinter.name })
      .expect(200);
    await request(server)
      .delete(`/api/v1/catalog/categories/${predefinedCategory.id}`)
      .set(bearer(tokens.admin))
      .expect(204);
    await request(server)
      .post("/api/v1/catalog/receipt-printers")
      .set(bearer(tokens.operator))
      .send({
        name: "Forbidden printer",
        ipAddress: "192.168.123.210",
        port: 9100,
        transport: "RAW_TCP",
      })
      .expect(403);
    await request(server)
      .post("/api/v1/catalog/receipt-printers")
      .set(bearer(tokens.admin))
      .send({
        name: "Public IP is forbidden",
        ipAddress: "8.8.8.8",
        port: 9100,
        transport: "RAW_TCP",
      })
      .expect(400);

    const categoryPrinter = (
      await request(server)
        .post("/api/v1/catalog/receipt-printers")
        .set(bearer(tokens.admin))
        .send({
          name: "Soups kitchen",
          ipAddress: "192.168.123.210",
          port: 9100,
          transport: "RAW_TCP",
        })
        .expect(201)
    ).body as ReceiptPrinterResponse;
    const productPrinter = (
      await request(server)
        .post("/api/v1/catalog/receipt-printers")
        .set(bearer(tokens.admin))
        .send({
          name: "Pizza kitchen",
          ipAddress: "192.168.123.211",
          port: 80,
          transport: "JSPEED_HTTP",
        })
        .expect(201)
    ).body as ReceiptPrinterResponse;

    await request(server)
      .post("/api/v1/catalog/receipt-printers")
      .set(bearer(tokens.admin))
      .send({
        name: "Duplicate endpoint",
        ipAddress: categoryPrinter.ipAddress,
        port: categoryPrinter.port,
        transport: "RAW_TCP",
      })
      .expect(409);
    const list = await request(server)
      .get("/api/v1/catalog/admin/receipt-printers")
      .set(bearer(tokens.operator))
      .expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: categoryPrinter.id }),
        expect.objectContaining({ id: productPrinter.id }),
      ]),
    );

    const category = (
      await request(server)
        .post("/api/v1/catalog/categories")
        .set(bearer(tokens.admin))
        .send({
          name: "Registered route category",
          slug: "registered-route-category",
          receiptPrinterId: categoryPrinter.id,
        })
        .expect(201)
    ).body as { id: string };
    const product = (
      await request(server)
        .post("/api/v1/catalog/products")
        .set(bearer(tokens.admin))
        .send({
          categoryId: category.id,
          name: "Registered route meal",
          slug: "registered-route-meal",
          description: "Product printer overrides category printer",
          price: 25,
          receiptPrinterId: productPrinter.id,
        })
        .expect(201)
    ).body as CatalogProductResponse & {
      receiptPrinterId: string | null;
      effectiveReceiptPrinterId: string | null;
      effectiveReceiptPrinterIp: string | null;
    };
    expect(product).toMatchObject({
      receiptPrinterId: productPrinter.id,
      effectiveReceiptPrinterId: productPrinter.id,
      effectiveReceiptPrinterIp: productPrinter.ipAddress,
    });

    await request(server)
      .delete(`/api/v1/catalog/receipt-printers/${productPrinter.id}`)
      .set(bearer(tokens.admin))
      .expect(409);
    await request(server)
      .patch(`/api/v1/catalog/receipt-printers/${productPrinter.id}`)
      .set(bearer(tokens.admin))
      .send({ isActive: false })
      .expect(200);
    await request(server)
      .patch(`/api/v1/catalog/categories/${category.id}`)
      .set(bearer(tokens.admin))
      .send({ receiptPrinterId: productPrinter.id })
      .expect(400);
    await request(server)
      .patch(`/api/v1/catalog/receipt-printers/${productPrinter.id}`)
      .set(bearer(tokens.admin))
      .send({ isActive: true })
      .expect(200);

    const publicCategories = (
      await request(server).get("/api/v1/catalog/categories").expect(200)
    ).body as PublicCatalogCategoryResponse[];
    const publicCategory = publicCategories.find(
      ({ id }) => id === category.id,
    );
    expect(publicCategory).toBeDefined();
    if (!publicCategory) throw new Error("Public category was not returned");
    expect(publicCategory).not.toHaveProperty("receiptPrinterId");
    expect(publicCategory).not.toHaveProperty("receiptPrinterIp");
    expect(publicCategory.products[0]).not.toHaveProperty("receiptPrinter");

    await request(server)
      .delete(`/api/v1/catalog/categories/${category.id}`)
      .set(bearer(tokens.admin))
      .expect(204);
    await request(server)
      .delete(`/api/v1/catalog/receipt-printers/${categoryPrinter.id}`)
      .set(bearer(tokens.admin))
      .expect(204);
    await request(server)
      .delete(`/api/v1/catalog/receipt-printers/${productPrinter.id}`)
      .set(bearer(tokens.admin))
      .expect(204);
  });

  it("builds an authorized accepted-order print plan grouped by snapshot endpoint", async () => {
    const settingsAuditCountBefore = await prisma.auditLog.count({
      where: {
        action: "catalog.receipt-print-settings.updated",
        entityType: "ReceiptPrintSettings",
      },
    });
    const [categoryPrinter, productPrinter, mainPrinter] = await Promise.all([
      prisma.receiptPrinter.findFirstOrThrow({
        where: {
          cafeId: null,
          ipAddress: "192.168.123.100",
          port: 9100,
        },
      }),
      prisma.receiptPrinter.findFirstOrThrow({
        where: {
          cafeId: null,
          ipAddress: "192.168.123.101",
          port: 9100,
        },
      }),
      prisma.receiptPrinter.create({
        data: {
          name: "Receipt administrator",
          ipAddress: "192.168.123.99",
          port: 9100,
          transport: "RAW_TCP",
        },
      }),
    ]);
    const category = await prisma.category.create({
      data: {
        name: "Receipt routing category",
        slug: "receipt-routing-category",
        receiptPrinterId: categoryPrinter.id,
      },
    });
    const unassignedCategory = await prisma.category.create({
      data: {
        name: "Unassigned receipt routing category",
        slug: "unassigned-receipt-routing-category",
      },
    });
    const [first, second, unassigned] = await Promise.all([
      prisma.product.create({
        data: {
          categoryId: category.id,
          name: "Printer one meal",
          slug: "printer-one-meal",
          description: "Routes to the first kitchen printer",
          price: 25,
        },
      }),
      prisma.product.create({
        data: {
          categoryId: category.id,
          name: "Printer two meal",
          slug: "printer-two-meal",
          description: "Routes to the second kitchen printer",
          price: 40,
          receiptPrinterId: productPrinter.id,
        },
      }),
      prisma.product.create({
        data: {
          categoryId: unassignedCategory.id,
          name: "Unassigned meal",
          slug: "unassigned-printer-meal",
          description: "Remains visible when a printer route is missing",
          price: 15,
        },
      }),
    ]);
    const created = await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.customer))
      .send({
        items: [
          { productId: first.id, quantity: 2 },
          { productId: second.id, quantity: 1 },
          { productId: unassigned.id, quantity: 3 },
        ],
        address: "Receipt routing street",
        latitude: 37.95021,
        longitude: 58.38021,
      })
      .expect(201);
    const order = created.body as OrderResponse;
    expect(order.status).toBe(OrderStatus.COOKING);

    await prisma.receiptPrinter.update({
      where: { id: productPrinter.id },
      data: { ipAddress: "192.168.123.102", port: 9200 },
    });

    await request(server)
      .patch("/api/v1/catalog/receipt-print-settings")
      .set(bearer(tokens.operator))
      .send({ mainPrinterIp: "192.168.123.99" })
      .expect(403);
    await request(server)
      .patch("/api/v1/catalog/receipt-print-settings")
      .set(bearer(tokens.admin))
      .send({ mainPrinterIp: "8.8.8.8" })
      .expect(400);
    await request(server)
      .patch("/api/v1/catalog/receipt-print-settings")
      .set(bearer(tokens.admin))
      .send({ mainPrinterId: mainPrinter.id })
      .expect(200);
    const settingsResponse = await request(server)
      .get("/api/v1/catalog/admin/receipt-print-settings")
      .set(bearer(tokens.operator))
      .expect(200);
    expect(settingsResponse.body).toMatchObject({
      mainPrinterId: mainPrinter.id,
      mainPrinterIp: "192.168.123.99",
    });

    await request(server)
      .get(`/api/v1/orders/${order.id}/receipt-print-plan`)
      .set(bearer(tokens.customer))
      .expect(403);
    await request(server)
      .get(`/api/v1/orders/${order.id}/receipt-print-plan`)
      .set(bearer(tokens.accountant))
      .expect(403);

    const response = await request(server)
      .get(`/api/v1/orders/${order.id}/receipt-print-plan`)
      .set(bearer(tokens.superAdmin))
      .expect(200);
    const plan = response.body as ReceiptPrintPlanResponse;

    expect(plan.orderId).toBe(order.id);
    expect(plan.documentType).toBe("ORDER");
    expect(plan.cancellationReason).toBeNull();
    expect(plan.summary).toEqual({
      subtotal: 135,
      discount: 0,
      deliveryFee: 25,
      total: 160,
      deliveryAreaName: null,
    });
    expect(plan.mainJob?.printerIp).toBe("192.168.123.99");
    expect(plan.mainJob).toMatchObject({
      printerPort: 9100,
      transport: "RAW_TCP",
    });
    expect(plan.mainJob?.items).toHaveLength(3);
    expect(
      plan.mainJob?.items
        .map(({ name, quantity }) => ({ name, quantity }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    ).toEqual([
      { name: "Printer one meal", quantity: 2 },
      { name: "Printer two meal", quantity: 1 },
      { name: "Unassigned meal", quantity: 3 },
    ]);
    expect(plan.jobs).toEqual([
      {
        printerIp: "192.168.123.100",
        printerPort: 9100,
        transport: "RAW_TCP",
        items: [
          expect.objectContaining({
            name: "Printer one meal",
            quantity: 2,
            unitPrice: 25,
          }),
        ],
      },
      {
        printerIp: "192.168.123.101",
        printerPort: 9100,
        transport: "RAW_TCP",
        items: [
          expect.objectContaining({
            name: "Printer two meal",
            quantity: 1,
            unitPrice: 40,
          }),
        ],
      },
    ]);
    expect(plan.unassignedItems).toEqual([
      expect.objectContaining({
        name: "Unassigned meal",
        quantity: 3,
        unitPrice: 15,
      }),
    ]);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "catalog.receipt-print-settings.updated",
          entityType: "ReceiptPrintSettings",
        },
      }),
    ).toBe(settingsAuditCountBefore + 1);
    expect(response.text).not.toContain("customerId");

    await request(server)
      .patch(`/api/v1/orders/${order.id}/cancel`)
      .set(bearer(tokens.admin))
      .send({ reason: "Customer cancelled", version: order.version })
      .expect(200);
    const cancellationResponse = await request(server)
      .get(`/api/v1/orders/${order.id}/receipt-print-plan`)
      .set(bearer(tokens.superAdmin))
      .expect(200);
    const cancellationPlan =
      cancellationResponse.body as ReceiptPrintPlanResponse;
    expect(cancellationPlan.documentType).toBe("CANCELLATION");
    expect(cancellationPlan.cancellationReason).toBe("Customer cancelled");
    expect(cancellationPlan.mainJob?.items).toHaveLength(3);
    // Merely requesting a plan does not prove kitchen delivery.
    expect(cancellationPlan.jobs).toHaveLength(0);
  });

  it("allows only administrators to manage branches", async () => {
    await request(server)
      .post("/api/v1/branches")
      .set(bearer(tokens.operator))
      .send({
        name: "Forbidden branch",
        address: "Forbidden address",
        latitude: 37.9,
        longitude: 58.3,
      })
      .expect(403);

    await request(server)
      .post("/api/v1/branches")
      .set(bearer(tokens.admin))
      .send({
        name: "Invalid branch",
        address: "Invalid address",
        latitude: 91,
        longitude: 58.3,
      })
      .expect(400);

    await request(server)
      .post("/api/v1/branches")
      .set(bearer(tokens.admin))
      .send({
        name: "Missing map point",
        address: "Missing coordinates",
      })
      .expect(400);

    const created = await request(server)
      .post("/api/v1/branches")
      .set(bearer(tokens.admin))
      .send({
        name: "Temporary branch",
        address: "Temporary address",
        latitude: 37.8,
        longitude: 58.2,
        phone: "+99365123456",
      })
      .expect(201);
    const createdBranch = created.body as BranchResponse;

    const updated = await request(server)
      .patch(`/api/v1/branches/${createdBranch.id}`)
      .set(bearer(tokens.admin))
      .send({
        isActive: false,
        phone: "",
        latitude: 37.9601235,
        longitude: 58.3261,
      })
      .expect(200);
    expect((updated.body as BranchResponse).phone).toBeNull();
    expect(updated.body).toMatchObject({
      latitude: 37.9601235,
      longitude: 58.3261,
    });

    const list = await request(server)
      .get("/api/v1/branches")
      .set(bearer(tokens.operator))
      .expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createdBranch.id,
          isActive: false,
        }),
      ]),
    );

    await request(server)
      .get("/api/v1/branches")
      .set(bearer(tokens.customer))
      .expect(403);
  });

  it("delivers admin-created notifications only to registered customer devices", async () => {
    const installationId = "sacakly_customer_installation_0001";

    await request(server)
      .put("/api/v1/notifications/devices")
      .set(bearer(tokens.operator))
      .send({ installationId, platform: "ANDROID" })
      .expect(403);
    const registered = await request(server)
      .put("/api/v1/notifications/devices")
      .set(bearer(tokens.customer))
      .send({
        installationId,
        platform: "ANDROID",
        appVersion: "1.0.0",
        locale: "ru-TM",
      })
      .expect(200);
    expect(registered.body).toMatchObject({
      installationId,
      platform: "ANDROID",
      isActive: true,
    });

    await request(server)
      .delete(`/api/v1/notifications/devices/${installationId}`)
      .set(bearer(tokens.otherCustomer))
      .expect(404);
    await request(server)
      .delete("/api/v1/notifications/devices/not%20safe")
      .set(bearer(tokens.customer))
      .expect(400);

    await request(server)
      .post("/api/v1/notifications/admin/campaigns")
      .set(bearer(tokens.operator))
      .send({ title: "Forbidden", body: "Operator cannot send this" })
      .expect(403);
    await request(server)
      .post("/api/v1/notifications/admin/campaigns")
      .set(bearer(tokens.admin))
      .send({
        title: "External link",
        body: "Must be rejected",
        deepLink: "https://evil.example",
      })
      .expect(400);
    await request(server)
      .post("/api/v1/notifications/admin/campaigns")
      .set(bearer(tokens.admin))
      .send({
        title: "Unknown field",
        body: "Must be rejected",
        isSuperAdmin: true,
      })
      .expect(400);

    const created = await request(server)
      .post("/api/v1/notifications/admin/campaigns")
      .set(bearer(tokens.admin))
      .send({
        title: "Заказ уже рядом",
        body: "Проверьте статус доставки в приложении.",
        deepLink: "/orders/current",
      })
      .expect(201);
    const campaignId = (created.body as NotificationCampaignResponse).id;

    let campaign: NotificationCampaignResponse | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const list = await request(server)
        .get("/api/v1/notifications/admin/campaigns?page=1&limit=10")
        .set(bearer(tokens.admin))
        .expect(200);
      campaign = (
        list.body as { items: NotificationCampaignResponse[] }
      ).items.find(({ id }) => id === campaignId);
      if (campaign?.status === "SENT") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(campaign).toMatchObject({
      id: campaignId,
      status: "SENT",
      deviceCount: 1,
      sentCount: 1,
      failedCount: 0,
    });
    expect(campaign?.intendedUserCount).toBeGreaterThanOrEqual(2);

    const customerInbox = await request(server)
      .get("/api/v1/notifications/me")
      .set(bearer(tokens.customer))
      .expect(200);
    const customerInboxBody = customerInbox.body as {
      items: UserNotificationResponse[];
      unread: number;
    };
    const customerNotification = customerInboxBody.items.find(
      ({ title }) => title === "Заказ уже рядом",
    );
    expect(customerNotification).toMatchObject({
      body: "Проверьте статус доставки в приложении.",
      deepLink: "/orders/current",
      readAt: null,
    });
    expect(customerInboxBody.unread).toBeGreaterThanOrEqual(1);

    await request(server)
      .patch(`/api/v1/notifications/me/${customerNotification?.id}/read`)
      .set(bearer(tokens.otherCustomer))
      .expect(404);
    const marked = await request(server)
      .patch(`/api/v1/notifications/me/${customerNotification?.id}/read`)
      .set(bearer(tokens.customer))
      .expect(200);
    expect(marked.body).toMatchObject({
      id: customerNotification?.id,
      readAt: expect.any(String) as string,
    });

    const otherInbox = await request(server)
      .get("/api/v1/notifications/me")
      .set(bearer(tokens.otherCustomer))
      .expect(200);
    expect(
      (otherInbox.body as { items: UserNotificationResponse[] }).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Заказ уже рядом" }),
      ]),
    );

    await request(server)
      .post("/api/v1/notifications/me/read-all")
      .set(bearer(tokens.customer))
      .expect(200);
    await request(server)
      .get("/api/v1/notifications/me/unread-count")
      .set(bearer(tokens.customer))
      .expect(200)
      .expect({ unread: 0 });

    await request(server)
      .delete(`/api/v1/notifications/devices/${installationId}`)
      .set(bearer(tokens.customer))
      .expect(204);
    const audit = await prisma.auditLog.findMany({
      where: { entityType: "NotificationCampaign", entityId: campaignId },
    });
    expect(audit.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "notification.campaign.created",
        "notification.campaign.finished",
      ]),
    );
  });

  it("reserves SUPER_ADMIN role management for a super administrator", async () => {
    const candidate = await prisma.user.create({
      data: {
        phone: "+99365000112",
        firstName: "Promotion candidate",
        role: Role.OPERATOR,
      },
    });

    await request(server)
      .patch(`/api/v1/staff/${candidate.id}`)
      .set(bearer(tokens.admin))
      .send({ role: Role.SUPER_ADMIN })
      .expect(403);

    const promoted = await request(server)
      .patch(`/api/v1/staff/${candidate.id}`)
      .set(bearer(tokens.superAdmin))
      .send({ role: Role.SUPER_ADMIN })
      .expect(200);
    expect((promoted.body as User).role).toBe(Role.SUPER_ADMIN);

    await prisma.user.delete({ where: { id: candidate.id } });
    const otherActiveSuperAdmins = await prisma.user.findMany({
      where: {
        id: { not: users.superAdmin.id },
        role: Role.SUPER_ADMIN,
        isActive: true,
      },
      select: { id: true },
    });
    await prisma.user.updateMany({
      where: { id: { in: otherActiveSuperAdmins.map(({ id }) => id) } },
      data: { isActive: false },
    });
    try {
      await request(server)
        .patch(`/api/v1/staff/${users.superAdmin.id}`)
        .set(bearer(tokens.superAdmin))
        .send({ role: Role.ADMIN })
        .expect(400);
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: otherActiveSuperAdmins.map(({ id }) => id) } },
        data: { isActive: true },
      });
    }
  });

  it("creates staff through the admin API without allowing role escalation", async () => {
    await request(server)
      .post("/api/v1/staff")
      .set(bearer(tokens.operator))
      .send({ phone: "+99365000113", role: Role.COURIER })
      .expect(403);

    await request(server)
      .post("/api/v1/staff")
      .set(bearer(tokens.admin))
      .send({ phone: "+99365000113", role: Role.SUPER_ADMIN })
      .expect(403);

    const created = await request(server)
      .post("/api/v1/staff")
      .set(bearer(tokens.admin))
      .send({
        phone: "+99365000113",
        firstName: "New",
        lastName: "Courier",
        role: Role.COURIER,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      phone: "+99365000113",
      role: Role.COURIER,
      isActive: true,
    });

    await request(server)
      .post("/api/v1/staff")
      .set(bearer(tokens.admin))
      .send({ phone: "+99365000113", role: Role.COOK })
      .expect(409);
  });

  it("isolates saved addresses by owner and activates the latest order address", async () => {
    const firstResponse = await request(server)
      .post("/api/v1/users/me/addresses")
      .set(bearer(tokens.customer))
      .send({
        label: "Home",
        address: "Street 1",
        latitude: 37.95,
        longitude: 58.38,
      })
      .expect(201);
    const first = firstResponse.body as AddressResponse;

    const secondResponse = await request(server)
      .post("/api/v1/users/me/addresses")
      .set(bearer(tokens.customer))
      .send({
        label: "Work",
        address: "Street 2",
        latitude: 37.96,
        longitude: 58.39,
      })
      .expect(201);
    const second = secondResponse.body as AddressResponse;

    const addresses = await request(server)
      .get("/api/v1/users/me/addresses")
      .set(bearer(tokens.customer))
      .expect(200);
    const listed = addresses.body as AddressResponse[];
    expect(listed.filter(({ isActive }) => isActive)).toHaveLength(1);
    expect(listed.find(({ isActive }) => isActive)?.id).toBe(second.id);

    await request(server)
      .post(`/api/v1/users/me/addresses/${first.id}/activate`)
      .set(bearer(tokens.otherCustomer))
      .expect(404);

    const order = await createOrder(tokens.customer, { addressId: first.id });
    expect(order.address).toBe("Street 1");
    expect(order).toMatchObject({
      branchId: nearestBranchId,
      branchName: nearestBranchName,
      branchAddress: "Branch street 1",
    });
    expect(order.branchDistanceMeters).toBeLessThan(50);

    const byBranch = await request(server)
      .get(`/api/v1/orders?branchId=${nearestBranchId}`)
      .set(bearer(tokens.operator))
      .expect(200);
    expect(
      (byBranch.body as { items: OrderResponse[] }).items.map(({ id }) => id),
    ).toContain(order.id);

    const afterOrder = await request(server)
      .get("/api/v1/users/me/addresses")
      .set(bearer(tokens.customer))
      .expect(200);
    const afterOrderAddresses = afterOrder.body as AddressResponse[];
    expect(afterOrderAddresses.find(({ isActive }) => isActive)?.id).toBe(
      first.id,
    );

    await request(server)
      .patch(`/api/v1/users/me/addresses/${first.id}`)
      .set(bearer(tokens.customer))
      .send({ address: "Street 1 changed" })
      .expect(200);
    const storedOrder = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set(bearer(tokens.customer))
      .expect(200);
    expect((storedOrder.body as OrderResponse).address).toBe("Street 1");
    expect((storedOrder.body as OrderResponse).branchName).toBe(
      nearestBranchName,
    );

    await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set(bearer(tokens.otherCustomer))
      .expect(403);
  });

  it("filters role kanbans by multiple statuses without weakening cook scope", async () => {
    const kitchenOrder = await createOrder(tokens.customer, {});
    const hiddenOrder = await createOrder(tokens.otherCustomer, {
      address: "Private order outside kitchen queue",
      latitude: 37.9503,
      longitude: 58.3803,
    });
    await prisma.order.update({
      where: { id: hiddenOrder.id },
      data: { status: OrderStatus.DELIVERED },
    });

    const queue = await request(server)
      .get("/api/v1/orders?statuses=COOKING,READY&limit=100")
      .set(bearer(tokens.cook))
      .expect(200);
    const queueItems = (queue.body as { items: OrderResponse[] }).items;
    expect(queueItems.map(({ id }) => id)).toContain(kitchenOrder.id);
    expect(queueItems.map(({ id }) => id)).not.toContain(hiddenOrder.id);
    expect(
      queueItems.every(({ status }) =>
        [OrderStatus.COOKING, OrderStatus.READY].includes(status),
      ),
    ).toBe(true);

    const visibleSearch = await request(server)
      .get(`/api/v1/orders?search=${kitchenOrder.number}`)
      .set(bearer(tokens.cook))
      .expect(200);
    expect(
      (visibleSearch.body as { items: OrderResponse[] }).items.map(
        ({ id }) => id,
      ),
    ).toContain(kitchenOrder.id);

    const forbiddenSearch = await request(server)
      .get(`/api/v1/orders?search=${hiddenOrder.number}`)
      .set(bearer(tokens.cook))
      .expect(200);
    expect(
      (forbiddenSearch.body as { items: OrderResponse[] }).items.map(
        ({ id }) => id,
      ),
    ).not.toContain(hiddenOrder.id);

    await request(server)
      .get("/api/v1/orders?statuses=COOKING,NOT_A_STATUS")
      .set(bearer(tokens.operator))
      .expect(400);

    const now = Date.now();
    const currentWindow = await request(server)
      .get(
        `/api/v1/orders?createdFrom=${encodeURIComponent(new Date(now - 60_000).toISOString())}&createdTo=${encodeURIComponent(new Date(now + 60_000).toISOString())}`,
      )
      .set(bearer(tokens.operator))
      .expect(200);
    expect(
      (currentWindow.body as { items: OrderResponse[] }).items.map(
        ({ id }) => id,
      ),
    ).toContain(kitchenOrder.id);

    const futureWindow = await request(server)
      .get(
        `/api/v1/orders?createdFrom=${encodeURIComponent(new Date(now + 86_400_000).toISOString())}`,
      )
      .set(bearer(tokens.operator))
      .expect(200);
    expect(
      (futureWindow.body as { items: OrderResponse[] }).items,
    ).toHaveLength(0);

    await request(server)
      .get(
        `/api/v1/orders?createdFrom=${encodeURIComponent(new Date(now + 60_000).toISOString())}&createdTo=${encodeURIComponent(new Date(now).toISOString())}`,
      )
      .set(bearer(tokens.operator))
      .expect(400);
    await request(server)
      .get("/api/v1/orders?createdFrom=not-a-date")
      .set(bearer(tokens.operator))
      .expect(400);
  });

  it("creates audited phone orders for callers without issuing a session", async () => {
    const callerPhone = "+99365000301";
    const body = {
      customerPhone: callerPhone,
      customerFirstName: "Phone",
      customerLastName: "Customer",
      items: [{ productId, quantity: 2 }],
      addressLabel: "По телефону",
      address: "Parahat 7, unofficial landmark",
      latitude: 37.95021,
      longitude: 58.38021,
      entrance: "2",
      floor: "4",
      apartment: "18",
      customerNote: "Позвонить перед доставкой",
    };

    await request(server)
      .post("/api/v1/orders/assisted")
      .set(bearer(tokens.customer))
      .send(body)
      .expect(403);
    await request(server)
      .post("/api/v1/orders/assisted")
      .set(bearer(tokens.cook))
      .send(body)
      .expect(403);
    await request(server)
      .post("/api/v1/orders")
      .set(bearer(tokens.admin))
      .send(body)
      .expect(400);

    const createdResponse = await request(server)
      .post("/api/v1/orders/assisted")
      .set(bearer(tokens.operator))
      .send(body)
      .expect(201);
    const created = createdResponse.body as OrderResponse & {
      customer: { id: string; phone: string; firstName: string | null };
      addressId: string;
    };
    expect(created).toMatchObject({
      source: OrderSource.STAFF_PHONE,
      status: OrderStatus.COOKING,
      branchId: nearestBranchId,
      branchName: nearestBranchName,
      address: body.address,
      entrance: body.entrance,
      floor: body.floor,
      apartment: body.apartment,
      customer: {
        phone: callerPhone,
        firstName: "Phone",
      },
    });

    const caller = await prisma.user.findUniqueOrThrow({
      where: { phone: callerPhone },
      include: { refreshTokens: true, addresses: true },
    });
    expect(caller).toMatchObject({ role: Role.CUSTOMER, isActive: true });
    expect(caller.refreshTokens).toHaveLength(0);
    expect(caller.addresses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.addressId,
          isActive: true,
          address: body.address,
          entrance: body.entrance,
          floor: body.floor,
          apartment: body.apartment,
        }),
      ]),
    );

    const found = await request(server)
      .get("/api/v1/orders/assisted/customers?phone=0301")
      .set(bearer(tokens.operator))
      .expect(200);
    const foundBody = found.body as {
      items: Array<{
        id: string;
        phone: string;
        addresses: Array<{ id: string }>;
      }>;
    };
    const foundCaller = foundBody.items.find(({ id }) => id === caller.id);
    expect(foundCaller).toMatchObject({ id: caller.id, phone: callerPhone });
    expect(
      foundCaller?.addresses.some(({ id }) => id === created.addressId),
    ).toBe(true);
    await request(server)
      .get("/api/v1/orders/assisted/customers?phone=301")
      .set(bearer(tokens.operator))
      .expect(400);
    await request(server)
      .get("/api/v1/orders/assisted/customers?phone=0301")
      .set(bearer(tokens.accountant))
      .expect(403);

    const repeated = await request(server)
      .post("/api/v1/orders/assisted")
      .set(bearer(tokens.admin))
      .send({
        customerPhone: callerPhone,
        items: [{ productId, quantity: 1 }],
        addressId: created.addressId,
      })
      .expect(201);
    expect(repeated.body).toMatchObject({
      source: OrderSource.STAFF_PHONE,
      customerId: caller.id,
      addressId: created.addressId,
    });

    await request(server)
      .post("/api/v1/orders/assisted")
      .set(bearer(tokens.operator))
      .send({ ...body, customerPhone: users.operator.phone })
      .expect(409);
    await request(server)
      .post("/api/v1/orders/assisted")
      .set(bearer(tokens.operator))
      .send({ ...body, customerPhone: users.inactive.phone })
      .expect(409);

    const audit = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "Order", entityId: created.id },
          { entityType: "User", entityId: caller.id },
        ],
      },
    });
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: users.operator.id,
          action: "order.created_by_staff",
        }),
        expect.objectContaining({
          actorId: users.operator.id,
          action: "customer.resolved_for_phone_order",
        }),
      ]),
    );
  });

  it("rejects a new order when no active branch can accept it", async () => {
    await prisma.branch.updateMany({ data: { isActive: false } });
    try {
      await request(server)
        .post("/api/v1/orders")
        .set(bearer(tokens.customer))
        .send({ items: [{ productId, quantity: 1 }] })
        .expect(409);
    } finally {
      await prisma.branch.updateMany({
        where: { id: nearestBranchId },
        data: { isActive: true },
      });
    }
  });

  it("allows only one concurrent order mutation to win", async () => {
    const order = await createOrder(tokens.customer, {});
    const outcomes = await Promise.all([
      request(server)
        .patch(`/api/v1/orders/${order.id}/confirm-packing`)
        .set(bearer(tokens.admin))
        .send({
          checkedItemIds: order.items?.map(({ id }) => id),
          version: order.version,
        }),
      request(server)
        .patch(`/api/v1/orders/${order.id}/cancel`)
        .set(bearer(tokens.admin))
        .send({ reason: "Kitchen stopped the order", version: order.version }),
    ]);
    expect(outcomes.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(
      outcomes.every(({ status }) => [200, 403, 409].includes(status)),
    ).toBe(true);

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect([OrderStatus.READY, OrderStatus.CANCELLED]).toContain(stored.status);
    expect(stored.version).toBe(2);
  });

  it("requires the administrator checklist before a cooking order becomes ready", async () => {
    let order = await createOrder(tokens.customer, {});

    await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(tokens.admin))
      .send({ status: OrderStatus.READY, version: order.version })
      .expect(403);

    await request(server)
      .patch(`/api/v1/orders/${order.id}/confirm-packing`)
      .set(bearer(tokens.admin))
      .send({ checkedItemIds: [], version: order.version })
      .expect(400);

    order = await confirmPacking(tokens.admin, order);
    expect(order).toMatchObject({
      status: OrderStatus.READY,
      version: 2,
    });
    expect(order.packingConfirmedAt).toBeTruthy();
    expect(
      await prisma.orderTransition.count({
        where: {
          orderId: order.id,
          actorId: users.admin.id,
          fromStatus: OrderStatus.COOKING,
          toStatus: OrderStatus.READY,
        },
      }),
    ).toBe(1);
  });

  it("restricts packing to administrators and recovers legacy ready orders", async () => {
    const order = await createOrder(tokens.customer, {});
    const body = {
      checkedItemIds: order.items?.map(({ id }) => id),
      version: order.version,
    };
    for (const role of [
      "customer",
      "operator",
      "cook",
      "courier",
      "accountant",
    ] as const) {
      await request(server)
        .patch(`/api/v1/orders/${order.id}/confirm-packing`)
        .set(bearer(tokens[role]))
        .send(body)
        .expect(403);
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.READY },
    });
    await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.admin))
      .send({ courierId: users.courier.id, version: order.version })
      .expect(409);
    await request(server)
      .patch(`/api/v1/orders/${order.id}/confirm-packing`)
      .set(bearer(tokens.admin))
      .send({ ...body, version: order.version + 1 })
      .expect(409);
    const packed = await confirmPacking(tokens.superAdmin, order);
    expect(packed.status).toBe(OrderStatus.READY);
    expect(packed.packingConfirmedAt).toBeTruthy();
    await request(server)
      .patch(`/api/v1/orders/${order.id}/confirm-packing`)
      .set(bearer(tokens.superAdmin))
      .send({ ...body, version: packed.version })
      .expect(409);
  });

  it("reassigns a courier only before delivery starts with audit and locking", async () => {
    let order = await createOrder(tokens.customer, {});
    order = await confirmPacking(tokens.admin, order);

    const assigned = await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.operator))
      .send({ courierId: users.courier.id, version: order.version })
      .expect(200);
    order = assigned.body as OrderResponse;

    await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.customer))
      .send({ courierId: users.otherCourier.id, version: order.version })
      .expect(403);
    await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.operator))
      .send({ courierId: users.otherCourier.id, version: order.version - 1 })
      .expect(409);

    const reassigned = await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.operator))
      .send({ courierId: users.otherCourier.id, version: order.version })
      .expect(200);
    order = reassigned.body as OrderResponse;
    expect(order).toMatchObject({
      status: OrderStatus.ASSIGNED_TO_COURIER,
      courierId: users.otherCourier.id,
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityType: "Order",
        entityId: order.id,
        action: "order.courier-reassigned",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.metadata).toMatchObject({
      previousCourierId: users.courier.id,
      courierId: users.otherCourier.id,
    });

    order = await transition(
      tokens.otherCourier,
      order,
      OrderStatus.OUT_FOR_DELIVERY,
    );
    await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.operator))
      .send({ courierId: users.courier.id, version: order.version })
      .expect(409);
  });

  it("lets only administrators edit order contents before pickup and recalculates totals", async () => {
    let order = await createOrder(tokens.customer, { deliveryEtrapId: 25 });
    order = await confirmPacking(tokens.admin, order);
    const assigned = await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.operator))
      .send({ courierId: users.courier.id, version: order.version })
      .expect(200);
    order = assigned.body as OrderResponse;
    const body = {
      version: order.version,
      items: order.items?.map((item) => ({
        productId: item.productId,
        ...(item.productVariantId ? { variantId: item.productVariantId } : {}),
        quantity: item.quantity + 1,
      })),
      deliveryEtrapId: 25,
      address: "Administrator corrected address",
      latitude: 37.95031,
      longitude: 58.38031,
      entrance: "2",
      floor: "3",
      apartment: "12",
      customerNote: "Call before arrival",
    };

    await request(server)
      .patch(`/api/v1/orders/${order.id}/admin-edit`)
      .set(bearer(tokens.operator))
      .send(body)
      .expect(403);
    const editedResponse = await request(server)
      .patch(`/api/v1/orders/${order.id}/admin-edit`)
      .set(bearer(tokens.admin))
      .send(body)
      .expect(200);
    const edited = editedResponse.body as OrderResponse;
    expect(edited).toMatchObject({
      status: OrderStatus.COOKING,
      cookId: null,
      courierId: null,
      packingConfirmedAt: null,
      address: "Administrator corrected address",
      entrance: "2",
      floor: "3",
      apartment: "12",
      customerNote: "Call before arrival",
      deliveryEtrapId: 25,
      subtotal: 225,
      deliveryFee: 0,
      total: 225,
      version: order.version + 1,
    });
    expect(edited.items?.[0]?.quantity).toBe(3);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: "Order",
          entityId: order.id,
          action: "order.admin-edited",
        },
      }),
    ).toBe(1);
  });

  it("enforces every role, ownership check and cash workflow transition", async () => {
    let order = await createOrder(tokens.customer, {});

    await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(tokens.customer))
      .send({ status: OrderStatus.READY, version: order.version })
      .expect(403);

    await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(tokens.cook))
      .send({ status: OrderStatus.READY, version: order.version })
      .expect(403);

    await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.operator))
      .send({ courierId: users.courier.id, version: order.version })
      .expect(409);
    await request(server)
      .patch(`/api/v1/orders/${order.id}/confirm-packing`)
      .set(bearer(tokens.cook))
      .send({
        checkedItemIds: order.items?.map(({ id }) => id),
        version: order.version,
      })
      .expect(403);
    await request(server)
      .patch(`/api/v1/orders/${order.id}/confirm-packing`)
      .set(bearer(tokens.admin))
      .send({ checkedItemIds: [], version: order.version })
      .expect(400);
    order = await confirmPacking(tokens.admin, order);
    expect(order.packingConfirmedAt).toBeTruthy();

    const assignedResponse = await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.operator))
      .send({ courierId: users.courier.id, version: order.version })
      .expect(200);
    order = assignedResponse.body as OrderResponse;

    await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(tokens.otherCourier))
      .send({
        status: OrderStatus.OUT_FOR_DELIVERY,
        version: order.version,
      })
      .expect(403);
    order = await transition(
      tokens.courier,
      order,
      OrderStatus.OUT_FOR_DELIVERY,
    );
    order = await transition(tokens.courier, order, OrderStatus.DELIVERED);

    await request(server)
      .post(`/api/v1/orders/${order.id}/rating`)
      .set(bearer(tokens.otherCustomer))
      .send({ score: 5, comment: "Not my order" })
      .expect(403);
    await request(server)
      .post(`/api/v1/orders/${order.id}/rating`)
      .set(bearer(tokens.customer))
      .send({ score: 5, comment: "Delivered safely" })
      .expect(201);
    await request(server)
      .post(`/api/v1/orders/${order.id}/rating`)
      .set(bearer(tokens.customer))
      .send({ score: 4 })
      .expect(409);

    order = await transition(tokens.courier, order, OrderStatus.CASH_RETURNED);
    expect(order.cashSettlement?.status).toBe("CONFIRMED");
    expect(order.completedAt).toBeTruthy();
    await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(tokens.accountant))
      .send({ status: OrderStatus.RECONCILED, version: order.version })
      .expect(403);
    order = await transition(tokens.superAdmin, order, OrderStatus.RECONCILED);
    expect(order.cashSettlement?.status).toBe("RECONCILED");

    const historyResponse = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set(bearer(tokens.customer))
      .expect(200);
    const history = historyResponse.body as OrderResponse;
    expect(history.rating).toMatchObject({
      score: 5,
      comment: "Delivered safely",
    });
    expect(history.transitions?.map(({ toStatus }) => toStatus)).toEqual([
      OrderStatus.READY,
      OrderStatus.ASSIGNED_TO_COURIER,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
      OrderStatus.CASH_RETURNED,
      OrderStatus.RECONCILED,
    ]);
  });

  it("allows own customer cancellation for 15 minutes and later administrator cancellation", async () => {
    const recentOrder = await createOrder(tokens.customer, {});
    const customerCancellation = await request(server)
      .patch(`/api/v1/orders/${recentOrder.id}/cancel`)
      .set(bearer(tokens.customer))
      .send({
        reason: "Customer changed their mind",
        version: recentOrder.version,
      })
      .expect(200);
    expect(customerCancellation.body).toMatchObject({
      status: OrderStatus.CANCELLED,
      cancellationReason: "Customer changed their mind",
      version: recentOrder.version + 1,
    });

    const otherCustomersOrder = await createOrder(tokens.customer, {});
    await request(server)
      .patch(`/api/v1/orders/${otherCustomersOrder.id}/cancel`)
      .set(bearer(tokens.otherCustomer))
      .send({
        reason: "Cannot cancel someone else's order",
        version: otherCustomersOrder.version,
      })
      .expect(403);

    const expiredOrder = await createOrder(tokens.customer, {});
    await prisma.order.update({
      where: { id: expiredOrder.id },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    await request(server)
      .patch(`/api/v1/orders/${expiredOrder.id}/cancel`)
      .set(bearer(tokens.customer))
      .send({
        reason: "Customer cancellation window expired",
        version: expiredOrder.version,
      })
      .expect(403);
    await request(server)
      .patch(`/api/v1/orders/${expiredOrder.id}/cancel`)
      .set(bearer(tokens.admin))
      .send({
        reason: "Administrator cancelled after customer window",
        version: expiredOrder.version,
      })
      .expect(200);

    const operatorOrder = await createOrder(tokens.customer, {});
    await request(server)
      .patch(`/api/v1/orders/${operatorOrder.id}/cancel`)
      .set(bearer(tokens.operator))
      .send({
        reason: "Operator cannot cancel",
        version: operatorOrder.version,
      })
      .expect(403);

    let rollbackOrder = await createOrder(tokens.customer, {});
    rollbackOrder = await confirmPacking(tokens.admin, rollbackOrder);
    await request(server)
      .patch(`/api/v1/orders/${rollbackOrder.id}/cancel`)
      .set(bearer(tokens.operator))
      .send({
        reason: "Operator cannot undo cooking",
        version: rollbackOrder.version,
      })
      .expect(403);

    await request(server)
      .patch(`/api/v1/orders/${rollbackOrder.id}/transition`)
      .set(bearer(tokens.operator))
      .send({
        status: OrderStatus.COOKING,
        note: "Operator cannot roll back",
        version: rollbackOrder.version,
      })
      .expect(403);
    const rolledBack = await request(server)
      .patch(`/api/v1/orders/${rollbackOrder.id}/transition`)
      .set(bearer(tokens.admin))
      .send({
        status: OrderStatus.COOKING,
        note: "Administrator corrected the kitchen stage",
        version: rollbackOrder.version,
      })
      .expect(200);
    expect(rolledBack.body).toMatchObject({
      status: OrderStatus.COOKING,
      cookId: null,
      version: rollbackOrder.version + 1,
    });

    for (const role of ["admin", "superAdmin"] as const) {
      const cooking = await createOrder(tokens.customer, {});
      await request(server)
        .patch(`/api/v1/orders/${cooking.id}/cancel`)
        .set(bearer(tokens[role]))
        .send({
          reason: `Administrator correction by ${role}`,
          version: cooking.version,
        })
        .expect(200);
    }
  });

  it("tracks only the authenticated courier and exposes dispatch data only to trusted staff", async () => {
    const location = {
      latitude: 37.9601,
      longitude: 58.3261,
      accuracy: 14,
      recordedAt: new Date().toISOString(),
    };

    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.customer))
      .send(location)
      .expect(403);
    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.operator))
      .send(location)
      .expect(403);
    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send({ ...location, courierId: users.otherCourier.id })
      .expect(400);
    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send({ ...location, latitude: 91 })
      .expect(400);
    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send({
        ...location,
        recordedAt: new Date(Date.now() + 120_000).toISOString(),
      })
      .expect(422);

    const published = await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send(location)
      .expect(200);
    expect(published.body).toMatchObject({
      accepted: true,
      nextUpdateInSeconds: 15,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    });

    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send({
        ...location,
        recordedAt: new Date(
          Date.parse(location.recordedAt) - 1_000,
        ).toISOString(),
      })
      .expect(409);

    const assignedOrders: OrderResponse[] = [];
    for (let index = 0; index < 2; index += 1) {
      let order = await createOrder(tokens.customer, {});
      order = await confirmPacking(tokens.admin, order);
      const assigned = await request(server)
        .patch(`/api/v1/orders/${order.id}/assign-courier`)
        .set(bearer(tokens.operator))
        .send({
          courierId: users.courier.id,
          version: order.version,
        })
        .expect(200);
      assignedOrders.push(assigned.body as OrderResponse);
    }

    await request(server)
      .get("/api/v1/orders/courier/route")
      .set(bearer(tokens.customer))
      .expect(403);
    await request(server)
      .get("/api/v1/orders/courier/route")
      .set(bearer(tokens.operator))
      .expect(403);
    const courierRoute = await request(server)
      .get("/api/v1/orders/courier/route")
      .set(bearer(tokens.courier))
      .expect(200);
    const courierRouteBody = courierRoute.body as {
      courierId: string;
      routingStatus: string;
      recalculateAfterSeconds: number;
      stops: Array<{ orderId: string }>;
      route: null | {
        planId: string;
        geometry: { type: string; coordinates: number[][] };
        nextWaypoints: Array<{ orderId: string | null }>;
      };
    };
    expect(courierRouteBody.courierId).toBe(users.courier.id);
    expect(courierRouteBody.recalculateAfterSeconds).toBe(15);
    expect(courierRouteBody.stops.map(({ orderId }) => orderId)).toEqual(
      expect.arrayContaining(assignedOrders.map(({ id }) => id)),
    );
    expect(["READY", "UNAVAILABLE"]).toContain(courierRouteBody.routingStatus);

    await request(server)
      .get(`/api/v1/orders/couriers/${users.courier.id}/route`)
      .set(bearer(tokens.customer))
      .expect(403);
    await request(server)
      .get(`/api/v1/orders/couriers/${users.courier.id}/route`)
      .set(bearer(tokens.courier))
      .expect(403);
    const dispatchRoute = await request(server)
      .get(`/api/v1/orders/couriers/${users.courier.id}/route`)
      .set(bearer(tokens.operator))
      .expect(200);
    const dispatchRouteBody = dispatchRoute.body as typeof courierRouteBody;
    expect(dispatchRouteBody.courierId).toBe(users.courier.id);
    expect(dispatchRouteBody.stops.map(({ orderId }) => orderId)).toEqual(
      courierRouteBody.stops.map(({ orderId }) => orderId),
    );
    if (courierRouteBody.route && dispatchRouteBody.route) {
      expect(dispatchRouteBody.route.planId).toBe(
        courierRouteBody.route.planId,
      );
      expect(dispatchRouteBody.route.geometry).toEqual(
        courierRouteBody.route.geometry,
      );
      expect(dispatchRouteBody.route.nextWaypoints.length).toBeLessThanOrEqual(
        3,
      );
    }

    await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.courier))
      .expect(403);
    await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.customer))
      .expect(403);
    await request(server)
      .get("/api/v1/tracking/dispatch/live")
      .set(bearer(tokens.customer))
      .expect(403);

    const dispatch = await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.operator))
      .expect(200);
    const dispatchBody = dispatch.body as {
      courierUpdateIntervalSeconds: number;
      branches: Array<{ id: string }>;
      couriers: Array<{
        id: string;
        presence: string;
        location: { latitude: number; longitude: number } | null;
        activeOrders: Array<{
          id: string;
          branch: { id: string; name: string } | null;
          customer: { phone: string };
          items: Array<{ productName: string; quantity: number }>;
        }>;
      }>;
    };
    const tracked = dispatchBody.couriers.find(
      ({ id }) => id === users.courier.id,
    );
    expect(dispatchBody.courierUpdateIntervalSeconds).toBe(15);
    expect(dispatchBody.branches.map(({ id }) => id)).toContain(
      nearestBranchId,
    );
    expect(tracked).toMatchObject({
      presence: "ONLINE",
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    });
    expect(tracked?.activeOrders.map(({ id }) => id)).toEqual(
      expect.arrayContaining(assignedOrders.map(({ id }) => id)),
    );
    expect(tracked?.activeOrders[0]?.customer.phone).toBe(users.customer.phone);
    expect(tracked?.activeOrders[0]?.branch).toMatchObject({
      id: nearestBranchId,
      name: nearestBranchName,
    });
    expect(tracked?.activeOrders[0]?.items[0]).toMatchObject({
      productName: "Security test meal",
      quantity: 2,
    });

    await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.admin))
      .expect(200);
    await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.superAdmin))
      .expect(200);

    for (const assignedOrder of assignedOrders) {
      let delivery = await transition(
        tokens.courier,
        assignedOrder,
        OrderStatus.OUT_FOR_DELIVERY,
      );
      delivery = await transition(
        tokens.courier,
        delivery,
        OrderStatus.DELIVERED,
      );
      expect(delivery.status).toBe(OrderStatus.DELIVERED);
    }
    const freeAfterDelivery = await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.operator))
      .expect(200);
    expect(
      (
        freeAfterDelivery.body as {
          couriers: Array<{
            id: string;
            presence: string;
            location: { latitude: number; longitude: number } | null;
            activeOrders: Array<{ id: string }>;
          }>;
        }
      ).couriers.find(({ id }) => id === users.courier.id),
    ).toMatchObject({
      presence: "ONLINE",
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      activeOrders: [],
    });

    const afterDeliveryLocation = {
      ...location,
      latitude: 37.96021,
      longitude: 58.39021,
      recordedAt: new Date(
        Math.max(Date.now(), Date.parse(location.recordedAt) + 1),
      ).toISOString(),
    };
    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send(afterDeliveryLocation)
      .expect(200);
    const movingFreeCourier = await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.operator))
      .expect(200);
    expect(
      (
        movingFreeCourier.body as {
          couriers: Array<{
            id: string;
            presence: string;
            location: { latitude: number; longitude: number } | null;
            activeOrders: Array<{ id: string }>;
          }>;
        }
      ).couriers.find(({ id }) => id === users.courier.id),
    ).toMatchObject({
      presence: "ONLINE",
      location: {
        latitude: afterDeliveryLocation.latitude,
        longitude: afterDeliveryLocation.longitude,
      },
      activeOrders: [],
    });

    await request(server)
      .delete("/api/v1/tracking/me/location")
      .set(bearer(tokens.otherCourier))
      .expect(200);
    const stillTracked = await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.operator))
      .expect(200);
    expect(
      (
        stillTracked.body as {
          couriers: Array<{ id: string; presence: string }>;
        }
      ).couriers.find(({ id }) => id === users.courier.id)?.presence,
    ).toBe("ONLINE");

    await request(server)
      .delete("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .expect(200);
    const stopped = await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.operator))
      .expect(200);
    expect(
      (
        stopped.body as {
          couriers: Array<{
            id: string;
            presence: string;
            location: unknown;
          }>;
        }
      ).couriers.find(({ id }) => id === users.courier.id),
    ).toMatchObject({ presence: "OFFLINE", location: null });
  });

  it("validates image contents, restricts deletion and stores safe WebP objects", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );

    await request(server)
      .post("/api/v1/media/images")
      .set(bearer(tokens.customer))
      .attach("file", png, { filename: "pixel.png", contentType: "image/png" })
      .expect(403);
    await request(server)
      .post("/api/v1/media/images")
      .set(bearer(tokens.operator))
      .attach("file", Buffer.from("not an image"), {
        filename: "fake.png",
        contentType: "image/png",
      })
      .expect(400);

    const uploaded = await request(server)
      .post("/api/v1/media/images")
      .set(bearer(tokens.operator))
      .attach("file", png, { filename: "pixel.png", contentType: "image/png" })
      .expect(201);
    const filename = (uploaded.body as { filename: string }).filename;
    expect(filename).toMatch(/^[0-9a-f-]{36}\.webp$/);

    await request(server)
      .get(`/api/v1/media/${filename}`)
      .expect("Content-Type", /image\/webp/)
      .expect(200);
    await request(server).get("/api/v1/media/not-a-safe-name.webp").expect(404);
    await request(server)
      .delete(`/api/v1/media/images/${filename}`)
      .set(bearer(tokens.operator))
      .expect(403);
    await request(server)
      .delete(`/api/v1/media/images/${filename}`)
      .set(bearer(tokens.admin))
      .expect(204);
  });

  it("allows temporary tokenless Android pull, claims once and cancels failed OTP delivery", async () => {
    const phone = "+99365000320";
    const challenge = await otp.issue(phone);

    await expect(
      smsGateway.enqueueOtp(
        phone,
        challenge.code,
        challenge.requestId,
        challenge.expiresInSeconds,
      ),
    ).rejects.toMatchObject({ status: 503 });

    await request(server)
      .post("/api/v1/internal/sms-gateway/heartbeat")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          deviceId: "android-test",
          status: "ONLINE",
          pollIntervalSeconds: 3,
        });
      });

    await smsGateway.enqueueOtp(
      phone,
      challenge.code,
      challenge.requestId,
      challenge.expiresInSeconds,
    );
    const pulls = await Promise.all([
      request(server).get("/api/v1/internal/sms-gateway/pull"),
      request(server).get("/api/v1/internal/sms-gateway/pull"),
    ]);
    expect(pulls.map(({ status }) => status).sort()).toEqual([200, 204]);
    const claimed = pulls.find(({ status }) => status === 200);
    expect(claimed).toBeDefined();
    const job = claimed?.body as SmsGatewayJobResponseDto;
    expect(job).toMatchObject({
      phone,
      message: expect.stringContaining(challenge.code) as string,
    });
    expect(job).not.toHaveProperty("otpRequestId");

    const encrypted = await redis.hGet(
      `sacakly:sms:job:${job.id}`,
      "envelope",
    );
    expect(encrypted).toEqual(expect.any(String));
    expect(encrypted).not.toContain(phone);
    expect(encrypted).not.toContain(challenge.code);

    await request(server)
      .post(`/api/v1/internal/sms-gateway/jobs/${job.id}/status`)
      .send({
        receipt: "00000000-0000-4000-8000-000000000001",
        status: SmsGatewayJobStatus.FAILED,
      })
      .expect(409);

    await request(server)
      .post(`/api/v1/internal/sms-gateway/jobs/${job.id}/status`)
      .send({
        receipt: job.receipt,
        status: SmsGatewayJobStatus.FAILED,
        errorCode: "NO_SIGNAL",
      })
      .expect(200)
      .expect((response) => {
        const body = response.body as SmsGatewayStatusResponseDto;
        expect(body).toEqual({
          accepted: true,
          idempotent: false,
          status: SmsGatewayJobStatus.FAILED,
        });
      });
    await expect(otp.verify(phone, challenge.code)).resolves.toBe(
      "unavailable",
    );

    await request(server)
      .post(`/api/v1/internal/sms-gateway/jobs/${job.id}/status`)
      .send({
        receipt: job.receipt,
        status: SmsGatewayJobStatus.FAILED,
      })
      .expect(200)
      .expect((response) => {
        const body = response.body as SmsGatewayStatusResponseDto;
        expect(body.idempotent).toBe(true);
      });
  });

  it("accepts idempotent sent and delivered Android SMS acknowledgements", async () => {
    const phone = "+99365000321";
    const challenge = await otp.issue(phone);
    await smsGateway.enqueueOtp(
      phone,
      challenge.code,
      challenge.requestId,
      challenge.expiresInSeconds,
    );
    const pulled = await request(server)
      .get("/api/v1/internal/sms-gateway/pull")
      .expect(200);
    const job = pulled.body as SmsGatewayJobResponseDto;

    for (const idempotent of [false, true]) {
      await request(server)
        .post(`/api/v1/internal/sms-gateway/jobs/${job.id}/status`)
        .send({
          receipt: job.receipt,
          status: SmsGatewayJobStatus.SENT,
        })
        .expect(200)
        .expect((response) => {
          const body = response.body as SmsGatewayStatusResponseDto;
          expect(body.idempotent).toBe(idempotent);
        });
    }
    await request(server)
      .post(`/api/v1/internal/sms-gateway/jobs/${job.id}/status`)
      .send({
        receipt: job.receipt,
        status: SmsGatewayJobStatus.DELIVERED,
        unexpected: true,
      })
      .expect(400);
    await request(server)
      .post(`/api/v1/internal/sms-gateway/jobs/${job.id}/status`)
      .send({
        receipt: job.receipt,
        status: SmsGatewayJobStatus.DELIVERED,
      })
      .expect(200);
    await expect(otp.verify(phone, challenge.code)).resolves.toBe("valid");
  });

  it.each(["/health", "/users/me"])(
    "accepts bursts above the former global limit on %s",
    async (path) => {
      for (let index = 0; index < 125; index += 1) {
        const response = await request(server)
          .get(`/api/v1${path}`)
          .set(bearer(tokens.customer))
          .expect(200);
        expect(response.headers).not.toHaveProperty("x-ratelimit-limit");
        expect(response.headers).not.toHaveProperty("retry-after");
      }
      await request(server).get("/api/v1/users/me").expect(401);
      await request(server)
        .get("/api/v1/delivery/admin/config")
        .set(bearer(tokens.customer))
        .expect(403);
    },
  );

  it("allows repeated OTP requests without exposing codes outside development", async () => {
    const responses = [];
    for (let index = 0; index < 16; index += 1) {
      responses.push(
        await request(server)
          .post("/api/v1/auth/otp/request")
          .send({ phone: "+99365000301" })
          .expect(200),
      );
    }
    for (const response of responses) {
      expect(response.body).toEqual({ expiresInSeconds: 300 });
      expect(response.body).not.toHaveProperty("devCode");
    }

    const firstStaticCodeSession = await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99365000301", code: "1111" })
      .expect(200);
    const firstStaticCodeSessionBody =
      firstStaticCodeSession.body as SessionResponse;
    expect(typeof firstStaticCodeSessionBody.accessToken).toBe("string");
    expect(typeof firstStaticCodeSessionBody.refreshToken).toBe("string");
    await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99365000301", code: "1111" })
      .expect(401);

    await request(server)
      .post("/api/v1/auth/otp/request")
      .send({ phone: "+99365000302" })
      .expect(200);
    const secondStaticCodeSession = await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99365000302", code: "1111" })
      .expect(200);
    const secondStaticCodeSessionBody =
      secondStaticCodeSession.body as SessionResponse;
    expect(typeof secondStaticCodeSessionBody.accessToken).toBe("string");
  });

  it("allows repeated sign-ins above the former verification limit", async () => {
    const phone = "+99365000301";
    for (let index = 0; index < 10; index += 1) {
      await request(server)
        .post("/api/v1/auth/otp/request")
        .send({ phone })
        .expect(200);
      await request(server)
        .post("/api/v1/auth/otp/verify")
        .send({ phone, code: "1111" })
        .expect(200);
      await request(server)
        .post("/api/v1/auth/otp/verify")
        .send({ phone, code: "1111" })
        .expect(401);
    }
  });

  it("ignores legacy resend limits and preserves the newest concurrent OTP", async () => {
    const phone = "+99365000330";
    const phoneHash = createHmac("sha256", process.env.OTP_PEPPER!)
      .update(phone)
      .digest("hex");
    const challengeKey = `sacakly:otp:challenge:${phoneHash}`;
    const cooldownKey = `sacakly:otp:cooldown:${phoneHash}`;
    const hourlyKey = `sacakly:otp:hourly:${phoneHash}`;
    await redis.evalNumber(
      'redis.call("SET", KEYS[1], "old-request", "EX", 60); redis.call("SET", KEYS[2], "5", "EX", 3600); return 1',
      [cooldownKey, hourlyKey],
      [],
    );

    const challenges = await Promise.all(
      Array.from({ length: 8 }, () => otp.issue(phone)),
    );
    expect(new Set(challenges.map(({ requestId }) => requestId)).size).toBe(8);
    const requestId = await redis.hGet(challengeKey, "requestId");
    const newest = challenges.find(
      (challenge) => challenge.requestId === requestId,
    )!;
    expect(newest).toBeDefined();
    for (const challenge of challenges) {
      if (challenge.requestId !== requestId) {
        await otp.cancel(phone, challenge.requestId);
      }
    }
    expect(await redis.hGet(challengeKey, "requestId")).toBe(requestId);
    expect(await redis.hGet(challengeKey, "codeHash")).toBe(
      createHmac("sha256", process.env.OTP_PEPPER!)
        .update(`${phone}:${newest.code}`)
        .digest("hex"),
    );
    const ttl = await redis.evalNumber(
      'return redis.call("TTL", KEYS[1])',
      [challengeKey],
      [],
    );
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
    await expect(otp.verify(phone, newest.code)).resolves.toBe("valid");
    await expect(otp.verify(phone, newest.code)).resolves.toBe("unavailable");

    await redis.delete(cooldownKey);
    await redis.delete(hourlyKey);
    const replacement = await otp.issue(phone);
    expect(await redis.getMany([cooldownKey, hourlyKey])).toEqual([null, null]);
    await otp.cancel(phone, replacement.requestId);
    await expect(otp.verify(phone, replacement.code)).resolves.toBe(
      "unavailable",
    );
  });
});

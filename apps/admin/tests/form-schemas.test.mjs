import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  otpRequestSchema,
  otpVerifySchema,
} from "../src/features/otp-login/model/otp-login-form.ts";
import { branchFormSchema } from "../src/widgets/branch-manager/model/branch-form.ts";
import {
  categoryFormSchema,
  categoryReceiptRouteFormSchema,
  orderingHoursFormSchema,
  productFormSchema,
  receiptPrinterFormSchema,
  receiptPrintSettingsFormSchema,
} from "../src/widgets/catalog-manager/model/catalog-forms.ts";
import { manualReceiptFormSchema } from "../src/features/receipt-printing/model/manual-receipt-form.ts";
import { giftFormSchema } from "../src/widgets/catalog-manager/model/gift-form.ts";
import {
  bannerFormSchema,
  promoFormSchema,
} from "../src/widgets/marketing-manager/model/marketing-forms.ts";
import { orderSearchFormSchema } from "../src/widgets/order-board/model/order-search-form.ts";
import { notificationFormSchema } from "../src/widgets/notification-manager/model/notification-form.ts";
import { staffFormSchema } from "../src/widgets/staff-manager/model/staff-form.ts";
import {
  assistedOrderFormSchema,
  buildAssistedDeliveryAddress,
  normalizeAssistedOrderCoordinates,
} from "../src/widgets/assisted-order/model/assisted-order-form.ts";
import { buildAssistedOrderDeliverySelection } from "../src/widgets/assisted-order/model/assisted-order-delivery.ts";

test("OTP schemas validate Turkmen phone and four- or six-digit verification code", () => {
  assert.equal(
    otpRequestSchema.parse({ phone: "+993 65 12 34 56", code: "" }).phone,
    "+99365123456",
  );
  assert.equal(
    otpRequestSchema.safeParse({ phone: "65123456", code: "" }).success,
    false,
  );
  assert.equal(
    otpVerifySchema.safeParse({ phone: "+99365123456", code: "123456" })
      .success,
    true,
  );
  assert.equal(
    otpVerifySchema.safeParse({ phone: "+99365123456", code: "1111" }).success,
    true,
  );
  assert.equal(
    otpVerifySchema.safeParse({ phone: "+99365123456", code: "12345" }).success,
    false,
  );
});

test("branch and staff forms trim values and validate required fields", () => {
  assert.deepEqual(
    branchFormSchema.parse({
      name: "  Berkarar  ",
      phone: "",
      address: "  Atatürk köçesi  ",
      isActive: true,
      isPrimary: false,
    }),
    {
      name: "Berkarar",
      phone: undefined,
      address: "Atatürk köçesi",
      isActive: true,
      isPrimary: false,
    },
  );
  assert.equal(
    branchFormSchema.safeParse({
      name: "Berkarar",
      phone: "65123456",
      address: "Atatürk köçesi",
      isActive: true,
    }).success,
    false,
  );
  assert.equal(
    staffFormSchema.safeParse({
      phone: "+99365123456",
      firstName: "Operator",
      lastName: "",
      role: "OPERATOR",
      isActive: true,
    }).success,
    true,
  );
  assert.equal(
    staffFormSchema.safeParse({
      phone: "+99365123456",
      firstName: "Operator",
      lastName: "",
      role: "CUSTOMER",
      isActive: true,
    }).success,
    false,
  );
});

test("catalog forms accept display names without a technical slug", () => {
  assert.equal(
    categoryFormSchema.safeParse({
      cafeId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Пицца",
      receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      sortOrder: 0,
      isActive: true,
    }).success,
    true,
  );
  assert.equal(
    categoryFormSchema.safeParse({
      cafeId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Блюда русской кухни",
      receiptPrinterId: "",
      sortOrder: 0,
      isActive: true,
    }).success,
    true,
  );
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Маргарита",
      description: "Пицца",
      pricingType: "FIXED",
      price: 49.999,
      receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      variantLabel: "",
      variants: [],
      sortOrder: 0,
      isActive: true,
    }).success,
    false,
  );
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Маргарита",
      description: "Пицца",
      pricingType: "VARIANT",
      price: 50,
      receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      preparationMinutes: 20,
      loyaltyPoints: 3,
      variantLabel: "Размер",
      variants: [
        {
          name: "Маленькая",
          description: "25 см",
          price: 50,
          sortOrder: 0,
          isActive: true,
          imageUrls: [],
        },
        {
          name: "Большая",
          description: "35 см",
          price: 75,
          sortOrder: 1,
          isActive: true,
          imageUrls: [],
        },
      ],
      sortOrder: 0,
      isActive: true,
    }).success,
    true,
  );
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Нарезка",
      description: "Мясо",
      pricingType: "VARIANT",
      price: 50,
      receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      variantLabel: "",
      variants: [
        {
          name: "Вручную",
          description: "",
          price: 50,
          sortOrder: 0,
          isActive: true,
          imageUrls: [],
        },
      ],
      sortOrder: 0,
      isActive: true,
    }).success,
    false,
  );
});

test("receipt routing forms accept registered printer IDs", () => {
  assert.equal(
    receiptPrintSettingsFormSchema.safeParse({
      mainPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      mainCopies: 2,
    }).success,
    true,
  );
  assert.equal(
    receiptPrintSettingsFormSchema.safeParse({ mainPrinterId: "not-a-uuid" })
      .success,
    false,
  );
  assert.equal(
    categoryReceiptRouteFormSchema.safeParse({
      receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
    }).success,
    true,
  );
  assert.equal(
    categoryReceiptRouteFormSchema.safeParse({ receiptPrinterId: "1.1.1.1" })
      .success,
    false,
  );
  assert.equal(
    categoryFormSchema.safeParse({
      cafeId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Супы",
      receiptPrinterId: "",
      sortOrder: 0,
      isActive: true,
    }).success,
    true,
  );
});

test("ordering hours form allows overnight hours but rejects equal or invalid times", () => {
  const value = { enabled: true, opensAt: "22:00", closesAt: "03:00", version: 0 };
  assert.equal(orderingHoursFormSchema.safeParse(value).success, true);
  assert.equal(
    orderingHoursFormSchema.safeParse({ ...value, closesAt: "22:00" }).success,
    false,
  );
  assert.equal(
    orderingHoursFormSchema.safeParse({ ...value, opensAt: "24:00" }).success,
    false,
  );
});

test("manual receipt form rejects invalid and oversized item route lists", () => {
  const route = {
    itemId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
    destination: "DEFAULT",
    included: true,
  };
  assert.equal(manualReceiptFormSchema.safeParse({ mainCopies: 2, routes: [route] }).success, true);
  assert.equal(
    manualReceiptFormSchema.safeParse({ mainCopies: 2, routes: [{ ...route, itemId: "bad" }] })
      .success,
    false,
  );
  assert.equal(
    manualReceiptFormSchema.safeParse({ mainCopies: 2, routes: Array(101).fill(route) }).success,
    false,
  );
});

test("product variant schema rejects duplicate names and excess images", () => {
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Пицца",
      description: "Повторяющиеся размеры",
      pricingType: "VARIANT",
      price: 50,
      receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      variantLabel: "Размер",
      variants: [
        {
          name: "Маленькая",
          description: "",
          price: 50,
          sortOrder: 0,
          isActive: true,
          imageUrls: [],
        },
        {
          name: " маленькая ",
          description: "",
          price: 55,
          sortOrder: 1,
          isActive: true,
          imageUrls: [],
        },
      ],
      sortOrder: 0,
      isActive: true,
    }).success,
    false,
  );
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Пицца",
      description: "Слишком много изображений",
      pricingType: "VARIANT",
      price: 50,
      receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      variantLabel: "Размер",
      variants: [
        {
          name: "Маленькая",
          description: "",
          price: 50,
          sortOrder: 0,
          isActive: true,
          imageUrls: Array.from(
            { length: 11 },
            (_, index) => `/api/v1/media/${index}.webp`,
          ),
        },
      ],
      sortOrder: 0,
      isActive: true,
    }).success,
    false,
  );
});

test("printer registry validates LAN endpoint and product uses its ID", () => {
  const product = {
    categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
    name: "Манты",
    description: "Печатается на кухонном аппарате",
    pricingType: "FIXED",
    price: 60,
    receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
    preparationMinutes: 10,
    loyaltyPoints: 2,
    variantLabel: "",
    variants: [],
    sortOrder: 0,
    isActive: true,
  };

  assert.equal(productFormSchema.safeParse(product).success, true);
  assert.equal(productFormSchema.safeParse({ ...product, loyaltyPoints: 0 }).success, false);
  assert.equal(
    productFormSchema.safeParse({
      ...product,
      pricingType: "VARIANT",
      variantLabel: "Начинка",
      variants: [
        {
          name: "Фарш",
          description: "",
          price: 60,
          sortOrder: 0,
          isActive: false,
          imageUrls: [],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    productFormSchema.safeParse({
      ...product,
      receiptPrinterId: "not-a-uuid",
    }).success,
    false,
  );
  assert.equal(
    receiptPrinterFormSchema.safeParse({
      name: "Пицца — кухня",
      ipAddress: "192.168.123.100",
      port: 9100,
      transport: "RAW_TCP",
      isActive: true,
    }).success,
    true,
  );
  assert.equal(
    receiptPrinterFormSchema.safeParse({
      name: "Внешний адрес",
      ipAddress: "8.8.8.8",
      port: 9100,
      transport: "RAW_TCP",
      isActive: true,
    }).success,
    false,
  );
  assert.equal(
    receiptPrinterFormSchema.safeParse({
      name: "Неверный порт",
      ipAddress: "192.168.123.101",
      port: 70_000,
      transport: "RAW_TCP",
      isActive: true,
    }).success,
    false,
  );
});

test("gift form requires positive points and accepts limited or unlimited stock", () => {
  const gift = { name: "  Мишка  ", description: "Игрушка", pointsCost: 30, stock: "", sortOrder: 0, isActive: true };
  assert.deepEqual(giftFormSchema.parse(gift), { ...gift, name: "Мишка", stock: null });
  assert.equal(giftFormSchema.parse({ ...gift, stock: "0" }).stock, 0);
  assert.equal(giftFormSchema.safeParse({ ...gift, pointsCost: 0 }).success, false);
  assert.equal(giftFormSchema.safeParse({ ...gift, stock: "1.5" }).success, false);
});

test("marketing schemas normalize promo code and reject reversed dates", () => {
  assert.deepEqual(
    promoFormSchema.parse({
      code: " welcome15 ",
      type: "PERCENT",
      value: 15,
      minOrderAmount: undefined,
      maxDiscountAmount: undefined,
      totalUsageLimit: undefined,
      perUserLimit: 1,
      startsAt: "",
      endsAt: "",
      isActive: true,
    }).code,
    "WELCOME15",
  );
  assert.equal(
    bannerFormSchema.safeParse({
      title: "Летнее меню",
      subtitle: "",
      link: "",
      sortOrder: 0,
      startsAt: "2026-08-03T12:00",
      endsAt: "2026-08-02T12:00",
      isActive: true,
    }).success,
    false,
  );
});

test("order search schema trims query and limits its length", () => {
  assert.deepEqual(orderSearchFormSchema.parse({ search: "  +99365  " }), {
    search: "+99365",
  });
  assert.equal(
    orderSearchFormSchema.safeParse({ search: "x".repeat(201) }).success,
    false,
  );
});

test("notification schema accepts only internal application deep links", () => {
  assert.deepEqual(
    notificationFormSchema.parse({
      title: "  Заказ уже рядом ",
      body: " Проверьте статус доставки. ",
      deepLink: "/orders/current",
    }),
    {
      audience: "ALL_CUSTOMERS",
      title: "Заказ уже рядом",
      body: "Проверьте статус доставки.",
      deepLink: "/orders/current",
    },
  );
  assert.equal(
    notificationFormSchema.safeParse({
      title: "Внешняя ссылка",
      body: "Такую ссылку отправлять нельзя",
      deepLink: "https://evil.example",
    }).success,
    false,
  );
});

test("assisted order keeps the optional unofficial address and always builds a delivery label", () => {
  const parsed = assistedOrderFormSchema.parse({
    customerPhone: "+993 65 12 34 56",
    customerFirstName: " Aman ",
    customerLastName: "",
    addressId: "",
    deliveryEtrapId: "25",
    addressLabel: " По телефону ",
    address: " около школы 26, второй поворот ",
    entrance: "",
    floor: "",
    apartment: "",
    customerNote: " позвонить ",
    promoCode: " welcome15 ",
    addressSearch: "",
  });

  assert.equal(parsed.customerPhone, "+99365123456");
  assert.equal(parsed.address, "около школы 26, второй поворот");
  assert.equal(parsed.deliveryEtrapId, 25);
  assert.equal(parsed.promoCode, "WELCOME15");
  assert.equal(
    assistedOrderFormSchema.parse({
      customerPhone: "+99365123456",
      customerFirstName: "",
      customerLastName: "",
      addressId: "",
      deliveryEtrapId: "",
      addressLabel: "",
      address: "",
      entrance: "",
      floor: "",
      apartment: "",
      customerNote: "",
      promoCode: "",
      addressSearch: "",
    }).deliveryEtrapId,
    undefined,
  );
  assert.equal(
    buildAssistedDeliveryAddress({
      officialAddress: "Garaşsyzlyk şaýoly 60",
      unofficialAddress: "синий подъезд",
      coordinates: { latitude: 37.96, longitude: 58.32 },
    }),
    "Garaşsyzlyk şaýoly 60 — ориентир: синий подъезд",
  );
  assert.equal(
    buildAssistedDeliveryAddress({
      coordinates: { latitude: 37.960123, longitude: 58.326789 },
    }),
    "Точка на карте: 37.96012, 58.32679",
  );
  assert.deepEqual(normalizeAssistedOrderCoordinates(37.960123456, 58.3261), {
    latitude: 37.9601235,
    longitude: 58.3261,
  });
  assert.equal(normalizeAssistedOrderCoordinates(91, 58.3261), null);
});

test("assisted address details never move the marker and changed saved details are submitted", () => {
  const coordinates = { latitude: 37.95, longitude: 58.38 };
  const savedAddress = {
    id: "00000000-0000-4000-8000-000000000018",
    deliveryEtrapId: 25,
    label: "Дом",
    address: "Garaşsyzlyk şaýoly 60",
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    entrance: "2",
    floor: "4",
    apartment: "18",
    isActive: true,
  };
  const values = assistedOrderFormSchema.parse({
    customerPhone: "+99365123456",
    customerFirstName: "",
    customerLastName: "",
    addressId: savedAddress.id,
    deliveryEtrapId: "25",
    addressLabel: "Дом",
    address: "",
    entrance: "2",
    floor: "4",
    apartment: "18",
    customerNote: "",
    promoCode: "",
    addressSearch: "",
  });

  assert.deepEqual(
    buildAssistedOrderDeliverySelection({
      values,
      coordinates,
      savedAddress,
      officialAddress: savedAddress.address,
    }),
    { deliveryEtrapId: 25, addressId: savedAddress.id },
  );

  const changedApartment = buildAssistedOrderDeliverySelection({
    values: { ...values, apartment: "42" },
    coordinates,
    savedAddress,
    officialAddress: savedAddress.address,
  });
  assert.deepEqual(changedApartment, {
    deliveryEtrapId: 25,
    addressLabel: "Дом",
    address: savedAddress.address,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    entrance: "2",
    floor: "4",
    apartment: "42",
  });
  assert.deepEqual(
    {
      latitude: changedApartment?.latitude,
      longitude: changedApartment?.longitude,
    },
    coordinates,
  );
});

test("every admin form uses React Hook Form instead of manual FormData", async () => {
  const formFiles = [
    "../src/features/otp-login/ui/otp-login-card.tsx",
    "../src/widgets/branch-manager/ui/branch-manager.tsx",
    "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
    "../src/widgets/marketing-manager/ui/marketing-manager.tsx",
    "../src/widgets/order-board/ui/order-board.tsx",
    "../src/widgets/assisted-order/ui/assisted-order-dialog.tsx",
    "../src/widgets/delivery-manager/ui/delivery-manager.tsx",
    "../src/widgets/notification-manager/ui/notification-manager.tsx",
    "../src/widgets/staff-manager/ui/staff-manager.tsx",
  ];

  for (const file of formFiles) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /useForm/);
    assert.match(source, /zodResolver/);
    assert.doesNotMatch(source, /new FormData\(/);
  }
});

test("notifications can target guests while retaining the authenticated audience default", () => {
  const body = { title: "Объявление", body: "Новое меню", deepLink: "" };
  assert.equal(notificationFormSchema.parse(body).audience, "ALL_CUSTOMERS");
  assert.equal(
    notificationFormSchema.parse({ ...body, audience: "ALL_APP_INSTALLATIONS" })
      .audience,
    "ALL_APP_INSTALLATIONS",
  );
  assert.equal(
    notificationFormSchema.safeParse({ ...body, audience: "arbitrary-topic" })
      .success,
    false,
  );
  assert.equal(
    notificationFormSchema.safeParse({
      ...body,
      deepLink: "/" + String.fromCharCode(92) + "evil.example",
    }).success,
    false,
  );
});

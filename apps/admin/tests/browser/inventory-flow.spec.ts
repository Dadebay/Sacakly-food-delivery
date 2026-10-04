import { expect, test } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const waterId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const locationId = "55555555-5555-4555-8555-555555555555";
const lotId = "66666666-6666-4666-8666-666666666666";
const docId = "77777777-7777-4777-8777-777777777777";
const lineId = "88888888-8888-4888-8888-888888888888";
const now = "2026-09-30T06:00:00.000Z";

test("admin links bottled water, receives a lot and follows its document", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.addInitScript(
    (session) =>
      sessionStorage.setItem("sacakly.session.v1", JSON.stringify(session)),
    {
      accessToken: "test-access",
      refreshToken: "test-refresh",
      expiresInSeconds: 3600,
      accessExpiresAt: Date.now() + 3_600_000,
      user: {
        id: userId,
        phone: "+99365123456",
        firstName: "Admin",
        lastName: null,
        role: "ADMIN",
      },
    },
  );
  const state = {
    locations: [] as Record<string, unknown>[],
    lots: [] as Record<string, unknown>[],
    documents: [] as Record<string, unknown>[],
    links: [
      {
        productId,
        productName: "Вода 0,5 л",
        hasActiveRecipe: false,
        ingredientId: null,
        quantity: null,
        variants: [],
      },
    ] as Record<string, unknown>[],
    linkWrites: [] as Record<string, unknown>[],
    receipts: [] as Record<string, unknown>[],
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/api\/v1/,
      "",
    );
    const method = route.request().method();
    const body =
      method === "POST" || method === "PUT"
        ? (route.request().postDataJSON() as Record<string, unknown>)
        : {};
    let result: unknown = [];
    let status = 200;
    if (path === "/admin-page-access/me")
      result = {
        role: "ADMIN",
        allowedPages: ["MEAL_CONFIG"],
        availablePages: ["MEAL_CONFIG"],
        expandedPages: [],
        editable: false,
        version: 1,
      };
    else if (path === "/branches")
      result = [{ id: branchId, name: "Главный филиал", isActive: true }];
    else if (path === "/inventory/ingredients")
      result = [
        {
          id: waterId,
          name: "Вода 0,5 л",
          sku: "WATER-05",
          unit: "PIECE",
          costPerUnit: 2,
          reorderPoint: 10,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ];
    else if (path === "/inventory/locations" && method === "GET")
      result = state.locations;
    else if (path === "/inventory/locations" && method === "POST") {
      result = { id: locationId, branchId, ...body, createdAt: now };
      state.locations.push(result as Record<string, unknown>);
      status = 201;
    } else if (path === "/inventory/lots") result = state.lots;
    else if (path === "/inventory/documents" && method === "GET")
      result = state.documents;
    else if (path === "/inventory/product-links" && method === "GET")
      result = state.links;
    else if (
      path === `/inventory/product-links/${productId}` &&
      method === "PUT"
    ) {
      state.linkWrites.push(body);
      state.links[0] = {
        ...state.links[0],
        ingredientId: body.ingredientId,
        quantity: body.quantity,
      };
      result = { productId, variantId: null, ...body };
    } else if (path === "/inventory/documents/receipt" && method === "POST") {
      state.receipts.push(body);
      const lot = {
        id: lotId,
        branchId,
        code: body.lotCode,
        ingredientId: waterId,
        ingredientName: "Вода 0,5 л",
        unit: "PIECE",
        unitCost: body.unitCost,
        expiresAt: null,
        originNote: null,
        createdAt: now,
        balances: [
          {
            locationId,
            locationName: "Основной склад",
            locationCode: "WAREHOUSE",
            quantity: body.quantity,
          },
        ],
      };
      const document = {
        id: docId,
        branchId,
        actorId: userId,
        orderId: null,
        kind: "RECEIPT",
        reason: body.reason,
        createdAt: now,
        lines: [
          {
            id: lineId,
            lotId,
            lotCode: body.lotCode,
            ingredientId: waterId,
            ingredientName: "Вода 0,5 л",
            unit: "PIECE",
            locationId,
            locationName: "Основной склад",
            kind: "IN",
            quantity: body.quantity,
            unitCost: body.unitCost,
            orderItemId: null,
          },
        ],
      };
      state.lots.push(lot);
      state.documents.push(document);
      result = document;
      status = 201;
    } else if (path === `/inventory/lots/${lotId}/trace`)
      result = { lotId, documents: state.documents };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.goto("/meal-config?view=flow");
  await expect(page.getByTestId("inventory-flow")).toBeVisible();
  await expect(page.getByTestId("flow-location-form")).toBeVisible();
  await page.getByTestId("flow-location-code").fill("WAREHOUSE");
  await page.getByTestId("flow-location-name").fill("Основной склад");
  await page.getByTestId("flow-location-save").click();
  await expect.poll(() => state.locations.length).toBe(1);
  await page.getByTestId("flow-link-product").selectOption(productId);
  await page.getByTestId("flow-link-ingredient").selectOption(waterId);
  await page.getByTestId("flow-link-quantity").fill("1");
  await page.getByTestId("flow-link-save").click();
  await expect.poll(() => state.linkWrites.length).toBe(1);
  expect(state.linkWrites[0]).toMatchObject({
    ingredientId: waterId,
    quantity: 1,
  });
  await page.getByTestId("flow-receipt-ingredient").selectOption(waterId);
  await page.getByTestId("flow-receipt-lot-code").fill("WATER-42");
  await page.getByTestId("flow-receipt-unit-cost").fill("2");
  await page.getByTestId("flow-document-location").selectOption(locationId);
  await page.getByTestId("flow-document-quantity").fill("24");
  await page
    .getByTestId("flow-document-reason")
    .fill("Два ящика по 12 бутылок");
  await page.getByTestId("flow-document-save").click();
  await expect.poll(() => state.receipts.length).toBe(1);
  expect(state.receipts[0]).toMatchObject({
    ingredientId: waterId,
    locationId,
    lotCode: "WATER-42",
    quantity: 24,
    unitCost: 2,
  });
  await expect(page.getByTestId(`flow-lot-${lotId}`)).toBeVisible();
  await page.getByTestId(`flow-lot-${lotId}`).click();
  await page.getByTestId("flow-trace").locator("summary").click();
  await expect(
    page.getByTestId("flow-trace").getByText("Два ящика по 12 бутылок"),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("inventory-flow.png"),
    fullPage: true,
  });
  await page.goto("/meal-config?view=budget");
  await expect(page).toHaveURL(/\/meal-config\?view=stock$/);
  await expect(page.getByTestId("inventory-tab-stock")).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(errors).toEqual([]);
});

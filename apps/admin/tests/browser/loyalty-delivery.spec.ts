import { expect, test, type Page } from "@playwright/test";

const browserConsoleErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserConsoleErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
});
test.afterEach(({ page }) => {
  expect(browserConsoleErrors.get(page)).toEqual([]);
});

const CAFE_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const GIFT_ID = "33333333-3333-4333-8333-333333333333";
const IMAGE_URL = `/api/v1/media/${GIFT_ID}.webp`;
const now = "2026-09-25T10:00:00.000Z";
const cafe = { id: CAFE_ID, name: "Test cafe", slug: "test-cafe", description: null, imageUrl: null, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now, categoryCount: 1 };
const category = { id: CATEGORY_ID, cafeId: CAFE_ID, cafe, name: "Food", slug: "food", imageUrl: null, receiptPrinterId: null, receiptPrinterIp: null, receiptPrinter: null, productCount: 0, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP49/35fwAJrwPcl3fl5wAAAABJRU5ErkJggg==", "base64");

function makeDeliveryConfig() {
  return { mapPricingEnabled: false, distancePricingEnabled: false, dayPricePerKilometer: null, nightPricePerKilometer: null, distancePriceTiers: [], fallbackPrice: 15, fallbackFreeDeliveryThreshold: null, fallbackNightPrice: 25, fallbackNightFreeDeliveryThreshold: null, nightTariffEnabled: false, nightStartsAt: "23:00", nightEndsAt: "07:00", version: 1, timeZone: "Asia/Ashgabat", welayats: [{ id: 1, nameRu: "Ашхабад", nameTk: "Aşgabat", nameEn: null, sortOrder: 0, etraps: [{ id: 2, welayatId: 1, nameRu: "Улица Анкара", nameTk: "Ankara", nameEn: null, queuePosition: 1, price: 15, nightPrice: 25, freeDeliveryThreshold: null, nightFreeDeliveryThreshold: null, isDeliveryEnabled: true, deliveryZone: null, version: 1, updatedAt: now }] }] };
}

async function mockAdmin(page: Page) {
  await page.route("**/styles/alowalow/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  const session = { accessToken: "test-access", refreshToken: "test-refresh", expiresInSeconds: 3600, accessExpiresAt: Date.now() + 3_600_000, user: { id: "44444444-4444-4444-8444-444444444444", phone: "+99365123456", firstName: "Admin", lastName: null, role: "ADMIN" } };
  await page.addInitScript((value) => sessionStorage.setItem("alowalow.session.v1", JSON.stringify(value)), session);
  const state = { gifts: [] as Record<string, unknown>[], productPosts: [] as Record<string, unknown>[], deliveryPatches: [] as Record<string, unknown>[], deliveryConfigReads: 0, delivery: makeDeliveryConfig() };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = route.request().method();
    let status = 200;
    let json: unknown = [];
    if (path === "/admin-page-access/me") json = { role: "ADMIN", allowedPages: ["CATALOG", "DELIVERY"], availablePages: ["CATALOG", "DELIVERY"], expandedPages: [], editable: false, version: 1 };
    else if (path === "/catalog/admin/cafes") json = [cafe];
    else if (path === "/catalog/admin/category-summaries") json = [category];
    else if (path === "/catalog/admin/receipt-printers") json = [];
    else if (path === "/catalog/admin/receipt-print-settings") json = { mainCopies: 2, mainPrinterId: null, mainPrinterIp: null, mainPrinter: null, updatedAt: now };
    else if (path === "/catalog/admin/products/page") json = { items: [], page: 1, limit: 40, total: 0, pages: 0 };
    else if (path === "/catalog/products" && method === "POST") { const body = route.request().postDataJSON() as Record<string, unknown>; state.productPosts.push(body); json = { id: "55555555-5555-4555-8555-555555555555", ...body }; status = 201; }
    else if (path === "/loyalty/admin/gifts" && method === "GET") json = state.gifts;
    else if (path === "/loyalty/admin/gifts" && method === "POST") { const body = route.request().postDataJSON() as Record<string, unknown>; const gift = { id: GIFT_ID, ...body, version: 1, createdAt: now, updatedAt: now }; state.gifts.push(gift); json = gift; status = 201; }
    else if (path === "/media/images" && method === "POST") { json = { url: IMAGE_URL, filename: `${GIFT_ID}.webp` }; status = 201; }
    else if (path === `/media/${GIFT_ID}.webp`) { await route.fulfill({ status: 200, contentType: "image/png", body: png }); return; }
    else if (path === "/delivery/admin/config" && method === "GET") { state.deliveryConfigReads += 1; json = state.delivery; }
    else if (path === "/delivery/admin/settings" && method === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.version !== state.delivery.version) { status = 409; json = { statusCode: 409, message: "Delivery settings changed; reload and try again" }; }
      else { state.deliveryPatches.push(body); state.delivery = { ...state.delivery, ...body, version: state.delivery.version + 1 }; json = { ...state.delivery, id: "default", createdAt: now, updatedAt: now }; }
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
  });
  return state;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test("per-dish points are sent with the product form", async ({ page }) => {
  const state = await mockAdmin(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/catalog");
  await page.getByTestId("catalog-product-open").click();
  await page.getByTestId("product-category").selectOption(CATEGORY_ID);
  await page.getByTestId("product-name").fill("Манты");
  await page.getByTestId("product-description").fill("Горячее блюдо");
  await page.getByTestId("product-price").fill("50");
  await page.getByTestId("product-loyalty-points").fill("7");
  await page.getByTestId("product-preparation-minutes").fill("520");
  await page.getByTestId("product-save").click();
  await expect.poll(() => state.productPosts.length).toBe(1);
  expect(state.productPosts[0]?.loyaltyPoints).toBe(7);
  expect(state.productPosts[0]?.preparationMinutes).toBe(520);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("gift photo and configurable point price are submitted in the shop", async ({ page }) => {
  const state = await mockAdmin(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/catalog");
  await page.getByTestId("catalog-tab-gifts").click();
  await page.getByTestId("gift-create-open").click();
  await page.getByTestId("gift-name").fill("Мишка");
  await page.getByTestId("gift-points-cost").fill("35");
  await page.getByTestId("gift-stock").fill("2");
  await page.getByTestId("gift-image").setInputFiles({ name: "toy.png", mimeType: "image/png", buffer: png });
  await page.getByTestId("gift-form").getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => state.gifts.length).toBe(1);
  expect(state.gifts[0]).toMatchObject({ name: "Мишка", imageUrl: IMAGE_URL, pointsCost: 35, stock: 2 });
  await expect(page.getByText("Мишка")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("delivery pricing mode sends day and night kilometer rates", async ({ page }, testInfo) => {
  const state = await mockAdmin(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/delivery");
  await expect(page.getByTestId("delivery-settings-form")).toBeVisible();
  expect(await page.getByTestId("delivery-settings-form").evaluate((form) => !!(form.compareDocumentPosition(document.querySelector('[data-testid="delivery-zone-overview"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.getByTestId("delivery-distance-pricing-enabled").check();
  await expect(page.getByTestId("delivery-area-pricing-inactive")).toBeVisible();
  await expect(page.getByTestId("delivery-map-pricing-enabled")).toBeDisabled();
  await page.getByTestId("delivery-day-price-per-km").fill("5,50");
  await page.getByTestId("delivery-night-price-per-km").fill("8");
  await page.getByTestId("delivery-settings-save").click();
  await expect.poll(() => state.deliveryPatches.length).toBe(1);
  expect(state.deliveryPatches[0]).toMatchObject({ distancePricingEnabled: true, dayPricePerKilometer: 5.5, nightPricePerKilometer: 8, version: 1 });
  await expect(page.getByTestId("delivery-distance-pricing-enabled")).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("delivery-pricing.png") });
  await page.getByTestId("delivery-area-pricing-enabled").check();
  await expect(page.getByTestId("delivery-map-pricing-enabled")).toBeEnabled();
  await page.getByTestId("delivery-settings-save").click();
  await expect.poll(() => state.deliveryPatches.length).toBe(2);
  expect(state.deliveryPatches[1]).toMatchObject({ distancePricingEnabled: false, dayPricePerKilometer: 5.5, nightPricePerKilometer: 8, version: 2 });
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("street names without map boundaries remain searchable and editable", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/delivery");
  const table = page.getByTestId("delivery-etrap-table-card");
  await expect(table.getByText("Улица Анкара")).toBeVisible();
  await page.getByTestId("delivery-etrap-search").fill("Анкара");
  await expect(table.getByText("Улица Анкара")).toBeVisible();
  await page.getByTestId("delivery-etrap-edit-2").click();
  await expect(page.getByTestId("delivery-etrap-name-ru")).toHaveValue("Улица Анкара");
});

test("distance tiers can be added, validated, saved, reloaded and removed", async ({ page }, testInfo) => {
  const state = await mockAdmin(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/delivery");
  await page.getByTestId("delivery-distance-pricing-enabled").check();
  await page.getByTestId("delivery-day-price-per-km").fill("5");
  await page.getByTestId("delivery-night-price-per-km").fill("8");
  await expect(page.getByTestId("delivery-distance-tiers-empty")).toBeVisible();
  await page.getByTestId("delivery-tier-add").click();
  await page.getByTestId("delivery-tier-after-km").fill("5");
  await page.getByTestId("delivery-tier-day-price").fill("4");
  await page.getByTestId("delivery-tier-night-price").fill("6");
  await page.getByTestId("delivery-tier-add").click();
  await page.getByTestId("delivery-tier-after-km").nth(1).fill("5");
  await page.getByTestId("delivery-tier-day-price").nth(1).fill("3,50");
  await page.getByTestId("delivery-tier-night-price").nth(1).fill("5");
  await page.getByTestId("delivery-settings-save").click();
  await expect(page.getByText("Каждый следующий порог должен быть больше предыдущего")).toBeVisible();
  expect(state.deliveryPatches).toHaveLength(0);
  await page.getByTestId("delivery-tier-after-km").nth(1).fill("10");
  await page.getByTestId("delivery-settings-save").click();
  await expect.poll(() => state.deliveryPatches.length).toBe(1);
  expect(state.deliveryPatches[0]).toMatchObject({ version: 1, distancePriceTiers: [{ afterKilometers: 5, dayPricePerKilometer: 4, nightPricePerKilometer: 6 }, { afterKilometers: 10, dayPricePerKilometer: 3.5, nightPricePerKilometer: 5 }] });
  await page.reload();
  await expect(page.getByTestId("delivery-tier-day-price").first()).toHaveValue("4.00");
  await expect(page.getByTestId("delivery-tier-after-km").nth(1)).toHaveValue("10");
  await expectNoHorizontalOverflow(page);
  await page.getByTestId("delivery-distance-tiers").screenshot({ path: testInfo.outputPath("distance-tiers.png") });
  await page.getByTestId("delivery-tier-after-km").first().focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("delivery-tier-day-price").first()).toBeFocused();
  await page.getByTestId("delivery-tier-remove").first().click();
  await expect(page.getByTestId("delivery-tier-after-km")).toHaveValue("10");
  await page.getByTestId("delivery-tier-remove").click();
  await expect(page.getByTestId("delivery-distance-tiers-empty")).toBeVisible();
  await page.getByTestId("delivery-settings-save").click();
  await expect.poll(() => state.deliveryPatches.length).toBe(2);
  expect(state.deliveryPatches[1]).toMatchObject({ version: 2, distancePriceTiers: [] });
  expect(errors).toEqual([]);
});

test("a conflicting tier save keeps the draft and offers configuration reload", async ({ page }) => {
  await mockAdmin(page);
  await page.route("**/api/v1/delivery/admin/settings", (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ statusCode: 409, message: "Delivery settings changed; reload and try again" }) }));
  await page.goto("/delivery");
  await page.getByTestId("delivery-tier-add").click();
  await page.getByTestId("delivery-tier-after-km").fill("5");
  await page.getByTestId("delivery-tier-day-price").fill("4");
  await page.getByTestId("delivery-tier-night-price").fill("4");
  await page.getByTestId("delivery-settings-save").click();
  await expect(page.getByTestId("delivery-config-reload")).toBeVisible();
  await expect(page.getByTestId("delivery-tier-day-price")).toHaveValue("4");
  await expect(page.getByTestId("delivery-settings-save")).toBeEnabled();
  // Expected HTTP conflict is surfaced in the UI; browsers also log its status.
  browserConsoleErrors.set(page, (browserConsoleErrors.get(page) ?? []).filter((message) => message.includes("409") === false));
});

test("saved kilometer tiers can be edited, cancelled and deleted with nearby save controls", async ({ page }, testInfo) => {
  const state = await mockAdmin(page);
  Object.assign(state.delivery, { distancePricingEnabled: true, dayPricePerKilometer: 4.2, nightPricePerKilometer: 4.2, distancePriceTiers: [
    { afterKilometers: 4, dayPricePerKilometer: 3.5, nightPricePerKilometer: 3.5 },
    { afterKilometers: 5, dayPricePerKilometer: 3.5, nightPricePerKilometer: 3.5 },
    { afterKilometers: 10, dayPricePerKilometer: 2.5, nightPricePerKilometer: 2.5 },
  ] });
  await page.goto("/delivery");
  await page.getByTestId("delivery-tier-edit").first().click();
  await expect(page.getByTestId("delivery-tier-after-km").first()).toBeFocused();
  await page.getByTestId("delivery-tier-after-km").first().fill("3");
  await page.getByTestId("delivery-tier-day-price").first().fill("3,75");
  await page.getByTestId("delivery-tier-remove").nth(1).click();
  await expect(page.getByTestId("delivery-tier-after-km")).toHaveCount(2);
  await expect(page.getByTestId("delivery-settings-draft-status")).toHaveText("Есть несохранённые изменения");
  expect(state.deliveryPatches).toHaveLength(0);
  await page.getByTestId("delivery-settings-cancel").click();
  await expect(page.getByTestId("delivery-tier-after-km")).toHaveCount(3);
  await expect(page.getByTestId("delivery-tier-after-km").first()).toHaveValue("4");
  await expect(page.getByTestId("delivery-settings-cancel")).toBeDisabled();
  await page.getByTestId("delivery-tier-edit").first().click();
  await page.getByTestId("delivery-tier-after-km").first().fill("3");
  await page.getByTestId("delivery-tier-day-price").first().fill("3,75");
  await page.getByTestId("delivery-tier-remove").nth(1).click();
  await page.getByTestId("delivery-settings-save").click();
  await expect(page.getByTestId("delivery-settings-draft-status")).toHaveText("Тарифы сохранены");
  expect(state.deliveryPatches[0]).toMatchObject({ version: 1, distancePriceTiers: [
    { afterKilometers: 3, dayPricePerKilometer: 3.75, nightPricePerKilometer: 3.5 },
    { afterKilometers: 10, dayPricePerKilometer: 2.5, nightPricePerKilometer: 2.5 },
  ] });
  await page.reload();
  await expect(page.getByTestId("delivery-tier-after-km").first()).toHaveValue("3");
  await expect(page.getByTestId("delivery-tier-day-price").first()).toHaveValue("3.75");
  await page.getByTestId("delivery-distance-tiers").screenshot({ path: testInfo.outputPath("saved-tier-actions.png") });
  await expectNoHorizontalOverflow(page);
  await page.getByTestId("delivery-tier-remove").first().click();
  await page.getByTestId("delivery-tier-remove").click();
  await page.getByTestId("delivery-settings-save").click();
  await expect.poll(() => state.deliveryPatches.length).toBe(2);
  await page.reload();
  await expect(page.getByTestId("delivery-distance-tiers-empty")).toBeVisible();
  expect(state.deliveryPatches[1]).toMatchObject({ version: 2, distancePriceTiers: [] });
});

test("background config refresh preserves tier edits and the draft version until explicit reload", async ({ page }) => {
  const state = await mockAdmin(page);
  Object.assign(state.delivery, { dayPricePerKilometer: 5, nightPricePerKilometer: 5, distancePriceTiers: [
    { afterKilometers: 5, dayPricePerKilometer: 4, nightPricePerKilometer: 4 },
  ] });
  await page.goto("/delivery");
  await page.getByTestId("delivery-tier-day-price").fill("3");
  const reads = state.deliveryConfigReads;
  Object.assign(state.delivery, { version: 2, distancePriceTiers: [
    { afterKilometers: 8, dayPricePerKilometer: 6, nightPricePerKilometer: 6 },
  ] });
  await page.clock.install();
  await page.clock.fastForward(31_000);
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => state.deliveryConfigReads).toBeGreaterThan(reads);
  await expect(page.getByTestId("delivery-tier-day-price")).toHaveValue("3");
  await expect(page.getByTestId("delivery-tier-after-km")).toHaveValue("5");
  const request = page.waitForRequest((r) => r.url().endsWith("/delivery/admin/settings") && r.method() === "PATCH");
  await page.getByTestId("delivery-settings-save").click();
  expect((await request).postDataJSON().version).toBe(1);
  await expect(page.getByTestId("delivery-config-reload")).toBeVisible();
  await expect(page.getByTestId("delivery-tier-day-price")).toHaveValue("3");
  await page.getByTestId("delivery-config-reload").click();
  await expect(page.getByTestId("delivery-tier-day-price")).toHaveValue("6.00");
  await expect(page.getByTestId("delivery-tier-after-km")).toHaveValue("8");
  await expect(page.getByTestId("delivery-settings-cancel")).toBeDisabled();
  browserConsoleErrors.set(page, (browserConsoleErrors.get(page) ?? []).filter((message) => !message.includes("409")));
});

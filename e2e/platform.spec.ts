import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const api = "http://127.0.0.1:4000/api/v1";
const merchantOrigin = "http://127.0.0.1:5174";

function collectBrowserErrors(page: Page, errors: string[], expectOwnerDenial = false) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => {
    if (!["error", "warning"].includes(entry.type())) return;
    const message = entry.text();
    // Firefox emits these for cross-port localhost and Next's development HMR
    // preloads. Keep them in the test report; all application warnings still fail.
    const developmentWarning = entry.type() === "warning" && (
      (message.includes("127.0.0.1") && message.includes("classified as a bounce tracker")) ||
      (message.includes("http://127.0.0.1:3000/_next/static/chunks/") && message.includes("preloaded with link preload was not used"))
    );
    const ownerProbeDenied = expectOwnerDenial && entry.type() === "error" &&
      entry.location().url === `${merchantOrigin}/api/v1/marketplace/owner/me` &&
      message.includes("403 (Forbidden)");
    if (ownerProbeDenied) test.info().annotations.push({ type: "expected-owner-denial", description: message });
    else if (developmentWarning) test.info().annotations.push({ type: "development-browser-warning", description: message });
    else errors.push(`${entry.type()}: ${message}`);
  });
}

async function signInMerchant(page: Page, phone: string) {
  await page.goto(merchantOrigin);
  await page.getByTestId("merchant-phone-input").fill(phone);
  await page.getByTestId("merchant-login-submit").click();
  await page.getByTestId("merchant-code-input").fill("1111");
  await page.getByTestId("merchant-login-submit").click();
}

async function placeWebOrder(page: Page, signIn: boolean) {
  await page.getByRole("link", { name: /Оформить заказ/ }).click();
  if (signIn) {
    await page.getByRole("textbox", { name: "Телефон" }).fill("+99365000990");
    await page.getByRole("button", { name: "Получить код" }).click();
    await page.getByRole("textbox", { name: "Код из SMS" }).fill("1111");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.locator(".signed-in")).toContainText("+99365000990");
  }
  await page.getByTestId("checkout-address").fill("Aşgabat, browser test street");
  await page.getByTestId("checkout-latitude").fill("37.96");
  await page.getByTestId("checkout-longitude").fill("58.33");
  await page.getByRole("button", { name: "Рассчитать стоимость" }).click();
  await expect(
    page.getByRole("button", { name: "Подтвердить заказ" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(
    page.getByRole("heading", { name: "Заказ принят" }),
  ).toBeVisible();
  const number = await page.locator(".success-page strong").textContent();
  return Number(number?.replace("#", ""));
}

test("web checkout, automatic network dispatch and cafe receipts use the real API", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectBrowserErrors(page, errors);

  const cafesResponse = await request.get(`${api}/marketplace/cafes`);
  expect(cafesResponse.ok()).toBeTruthy();
  const cafes = (await cafesResponse.json()) as Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  const gunes = cafes.find((cafe) => cafe.slug === "e2e-gunes")!;
  const nar = cafes.find((cafe) => cafe.slug === "e2e-nar")!;

  await test.step("cuisine filters show only matching cafes", async () => {
    await page.goto("/ru?cuisine=TURKMEN#cafes");
    await expect(page.locator(".cafe-grid")).toContainText("E2E Güneş");
    await expect(page.locator(".cafe-grid")).not.toContainText("E2E Nar");
    await page.getByTestId("cuisine-filter-FAST_FOOD").click();
    await expect(page.locator(".cafe-grid")).toContainText("E2E Nar");
    await expect(page.locator(".cafe-grid")).not.toContainText("E2E Güneş");
  });

  await test.step("switching cafes replaces the basket", async () => {
    await page.goto("/ru");
    await page.getByRole("link", { name: /E2E Güneş/ }).click();
    await page.getByRole("button", { name: /В корзину: E2E Palow/ }).click();
    await expect(page.locator(".cart-card")).toContainText("E2E Palow");
    await page.goto("/ru");
    await page.getByRole("link", { name: /E2E Nar/ }).click();
    await page.getByRole("button", { name: /В корзину: E2E Manty/ }).click();
    await expect(page.getByRole("status")).toContainText(
      "Корзина обновлена для нового кафе",
    );
    await expect(page.locator(".cart-card")).toContainText("E2E Manty");
    await expect(page.locator(".cart-card")).not.toContainText("E2E Palow");
  });

  const firstNumber =
    await test.step("OTP, quote and checkout persist one cafe order", () =>
      placeWebOrder(page, true));
  expect(firstNumber).toBeGreaterThan(0);

  const merchant = await browser.newPage();
  collectBrowserErrors(merchant, errors, true);
  let firstOrderTotal = "";
  await test.step("merchant sees only its own order and the automatic external route", async () => {
    await signInMerchant(merchant, "+99365000991");
    await expect(merchant.getByTestId("merchant-dashboard-root")).toBeVisible();
    const session = await merchant.evaluate(
      () =>
        JSON.parse(
          sessionStorage.getItem("sacakly.merchant.session") ?? "null",
        ) as { accessToken: string },
    );
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const own = await request.get(
      `${api}/marketplace/merchant/cafes/${nar.id}/orders`,
      { headers },
    );
    expect(own.status()).toBe(200);
    const orders = (await own.json()) as Array<{
      id: string;
      number: number;
      total: string;
      createdAt: string;
      deliveryRequest: { mode: string; status: string; offerAt: string };
    }>;
    const order = orders.find((entry) => entry.number === firstNumber)!;
    firstOrderTotal = Number(order.total).toFixed(2);
    expect(order.deliveryRequest).toMatchObject({
      mode: "NETWORK",
      status: "WAITING",
    });
    expect(
      Date.parse(order.deliveryRequest.offerAt) - Date.parse(order.createdAt),
    ).toBe(20 * 60_000);
    await expect(
      merchant.getByTestId(`merchant-order-${order.id}`),
    ).toContainText("Общая сеть");
    expect(
      (
        await request.get(
          `${api}/marketplace/merchant/cafes/${gunes.id}/orders`,
          { headers },
        )
      ).status(),
    ).toBe(403);
  });

  await test.step("merchant setup and cafe-only report are available", async () => {
    await merchant.getByTestId("merchant-tab-setup").click();
    await expect(merchant.getByTestId("merchant-cafe-setup")).toContainText("Готово к включению заказов");
    await merchant.getByTestId("merchant-tab-reports").click();
    await merchant.getByTestId("cafe-report-submit").click();
    await expect(merchant.getByTestId("merchant-cafe-report")).toContainText("Сумма заказов");
    await expect(merchant.getByTestId("merchant-cafe-report")).toContainText(`${firstOrderTotal} TMT`);
  });

  let agentToken = "";
  await test.step("cafe admin configures its own printer and one-time agent key", async () => {
    await merchant
      .getByRole("navigation", { name: "Разделы кафе" })
      .getByRole("button", { name: "Чеки" })
      .click();
    await expect(merchant.getByTestId("merchant-receipts-root")).toBeVisible();
    const printers = merchant
      .locator("section.panel")
      .filter({ has: merchant.getByRole("heading", { name: "Принтеры" }) });
    await printers.getByLabel("Название").fill("Nar kitchen printer");
    await printers.getByLabel("Локальный IP").fill("192.168.10.10");
    await printers.getByRole("button", { name: "Добавить принтер" }).click();
    await expect(printers).toContainText("Nar kitchen printer");
    const config = merchant
      .locator("section.panel")
      .filter({
        has: merchant.getByRole("heading", { name: "Главный чек и агент" }),
      });
    await config
      .getByLabel("Главный принтер")
      .selectOption({ label: "Nar kitchen printer · 192.168.10.10" });
    await config.getByLabel("Телефон кафе").fill("+99365000991");
    await config.getByRole("button", { name: "Сохранить" }).click();
    await expect(config).toContainText("Ключ агента: не создан");
    await config
      .getByRole("button", { name: "Создать новый ключ агента" })
      .click();
    agentToken =
      (await config.locator(".receipt-token code").textContent()) ?? "";
    expect(agentToken).toMatch(/^sacakly_[A-Za-z0-9_-]{40,}$/);
    await merchant.reload();
    await merchant
      .getByRole("navigation", { name: "Разделы кафе" })
      .getByRole("button", { name: "Чеки" })
      .click();
    await expect(merchant.locator(".receipt-token")).toHaveCount(0);
  });

  const owner = await browser.newPage();
  collectBrowserErrors(owner, errors);
  await test.step("OWNER activates receipts only after cafe setup", async () => {
    await signInMerchant(owner, "+99362969614");
    await expect(owner.getByTestId("owner-dashboard-root")).toBeVisible();
    await owner.getByTestId("owner-cafe-select").selectOption(nar.id);
    await expect(owner.getByTestId("owner-cafe-setup")).toContainText("Готово к публикации");
    const toggle = owner.getByTestId("owner-module-receipts");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("new order enters only this cafe print queue", async () => {
    await page.goto(`/ru/cafes/${nar.slug}`);
    await page.getByRole("button", { name: /В корзину: E2E Manty/ }).click();
    const secondNumber = await placeWebOrder(page, false);
    await merchant
      .getByTestId("merchant-receipts-root")
      .getByRole("button", { name: "Обновить", exact: true })
      .click();
    await expect(merchant.getByTestId("merchant-receipts-root")).toContainText(
      `Заказ №${secondNumber}`,
    );

    const stationId = randomUUID();
    const agentHeaders = {
      Authorization: `Bearer ${agentToken}`,
      "X-Receipt-Agent-Id": stationId,
    };
    expect(
      (
        await request.post(`${api}/marketplace/receipt-agent/tasks/claim`, {
          headers: { ...agentHeaders, Authorization: "Bearer wrong-token" },
        })
      ).status(),
    ).toBe(401);
    const claimed = await request.post(
      `${api}/marketplace/receipt-agent/tasks/claim`,
      { headers: agentHeaders },
    );
    expect(claimed.status()).toBe(201);
    const task = (
      (await claimed.json()) as {
        task: {
          id: string;
          claimToken: string;
          plan: {
            metadata: { cafeName: string };
            mainJob: { printerIp: string };
          };
        };
      }
    ).task;
    expect(task.plan.metadata.cafeName).toBe(nar.name);
    expect(task.plan.mainJob.printerIp).toBe("192.168.10.10");
    const failed = await request.post(
      `${api}/marketplace/receipt-agent/tasks/${task.id}/outcome`,
      {
        headers: agentHeaders,
        data: {
          claimToken: task.claimToken,
          outcome: "FAILED",
          errorCode: "PRINTER_UNAVAILABLE",
        },
      },
    );
    expect(failed.status()).toBe(201);
    await merchant
      .getByTestId("merchant-receipts-root")
      .getByRole("button", { name: "Обновить", exact: true })
      .click();
    await expect(merchant.getByTestId("merchant-receipts-root")).toContainText(
      "PRINTER_UNAVAILABLE",
    );
    await merchant
      .getByTestId("merchant-receipts-root")
      .getByRole("button", { name: "Повторить" })
      .click();
    await expect(merchant.getByTestId("merchant-receipts-root")).toContainText(
      "Чек возвращён в очередь",
    );
  });

  await test.step("OWNER and cafe administrator complete onboarding before publication", async () => {
    await owner.getByTestId("owner-new-cafe-name").fill("E2E Sushi House");
    await owner.getByTestId("owner-new-cafe-slug").fill("e2e-sushi-house");
    await owner.getByTestId("owner-new-cafe-cuisine-SUSHI").check();
    const creation = owner.waitForResponse((response) => response.url().endsWith("/marketplace/owner/cafes") && response.request().method() === "POST");
    await owner.getByTestId("owner-create-cafe").click();
    const created = await creation;
    expect(created.status()).toBe(201);
    const draft = await created.json() as { id: string };
    await expect(owner.getByTestId("owner-cafe-select")).toHaveValue(draft.id);
    await expect(owner.getByTestId("owner-module-ordering")).toBeDisabled();
    await owner.getByTestId("owner-member-phone").fill("+99365000991");
    await owner.getByTestId("owner-grant-member").click();
    await expect(owner.getByTestId("owner-member-list")).toContainText("+99365000991");

    await merchant.reload();
    await merchant.getByTestId(`merchant-cafe-${draft.id}`).click();
    await merchant.getByTestId("merchant-tab-setup").click();
    await expect(merchant.getByTestId("merchant-cafe-setup")).toContainText("добавьте активный филиал");
    await merchant.getByTestId("cafe-setup-open-receipts").click();
    await expect(merchant.getByTestId("merchant-receipts-root")).toContainText("Ключ агента: не создан");
    await merchant.getByTestId("merchant-tab-catalog").click();
    const categories = merchant.locator("section.panel").filter({ has: merchant.getByRole("heading", { name: "Категории", exact: true }) });
    await categories.getByLabel("Название", { exact: true }).fill("Роллы");
    await categories.getByLabel("Код URL (латиница)").fill("rolls");
    await categories.getByRole("button", { name: "Добавить категорию" }).click();
    const products = merchant.locator("section.panel").filter({ has: merchant.getByRole("heading", { name: "Блюда", exact: true }) });
    await products.getByTestId("catalog-product-category").selectOption({ label: "Роллы" });
    await products.getByLabel("Название", { exact: true }).fill("Ролл с огурцом");
    await products.getByLabel("Код URL (латиница)").fill("cucumber-roll");
    await products.getByLabel("Описание").fill("Огурец, рис и нори");
    await products.getByLabel("Цена, TMT").fill("30");
    await products.getByTestId("catalog-product-points").fill("5");
    await products.getByRole("button", { name: "Добавить блюдо" }).click();
    await expect(products).toContainText("Ролл с огурцом");
    const branches = merchant.locator("section.panel").filter({ has: merchant.getByRole("heading", { name: "Филиалы и кухни", exact: true }) });
    await branches.getByLabel("Название", { exact: true }).fill("Центральная кухня");
    await branches.getByLabel("Адрес", { exact: true }).fill("Aşgabat, test kitchen");
    await branches.getByLabel("Широта").fill("37.96");
    await branches.getByLabel("Долгота").fill("58.33");
    await branches.getByRole("button", { name: "Добавить филиал" }).click();
    await expect(branches).toContainText("Центральная кухня");
    const beforePublish = await request.get(`${api}/marketplace/cafes?cuisine=SUSHI`);
    expect(await beforePublish.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id })]));
    await owner.getByTestId("owner-cafe-setup-refresh").click();
    await expect(owner.getByTestId("owner-module-ordering")).toBeEnabled();
    await owner.getByTestId("owner-module-ordering").click();
    await expect(owner.getByTestId("owner-module-ordering")).toHaveAttribute("aria-pressed", "true");
    await page.goto("/ru?cuisine=SUSHI#cafes");
    await expect(page.locator(".cafe-grid")).toContainText("E2E Sushi House");
    await expect(page.locator(".cafe-grid")).not.toContainText("E2E Nar");
  });

  await test.step("OWNER enables cafe rewards; merchant configures offers and gifts; checkout uses isolated points", async () => {
    await owner.getByTestId("owner-cafe-select").selectOption(nar.id);
    for (const key of ["marketing", "loyalty"]) {
      const toggle = owner.getByTestId(`owner-module-${key}`);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
    }
    await merchant.getByTestId(`merchant-cafe-${nar.id}`).click();
    await merchant.getByTestId("merchant-tab-rewards").click();
    await merchant.getByTestId("promotion-title").fill("Обед со скидкой");
    await merchant.getByTestId("promotion-user-limit").fill("100");
    await merchant.getByTestId("promotion-save").click();
    await expect(merchant.getByTestId("rewards-promotions").locator(".catalog-list")).toContainText("Обед со скидкой");
    await merchant.getByTestId("promotion-title").fill("Скидка по коду");
    await merchant.getByTestId("promotion-automatic").uncheck();
    await merchant.getByTestId("promotion-code").fill("WEB20");
    await merchant.getByTestId("promotion-value").fill("20");
    await merchant.getByTestId("promotion-save").click();
    await expect(merchant.getByTestId("rewards-promotions").locator(".catalog-list")).toContainText("WEB20");
    await merchant.getByTestId("gift-name").fill("Чай в подарок");
    await merchant.getByTestId("gift-description").fill("Чашка зелёного чая");
    await merchant.getByTestId("gift-points").fill("5");
    await merchant.getByTestId("gift-stock").fill("10");
    await merchant.getByTestId("gift-save").click();
    await expect(merchant.getByTestId("rewards-gifts").locator(".catalog-list")).toContainText("Чай в подарок");
    await merchant.setViewportSize({ width: 390, height: 844 });
    expect(await merchant.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await merchant.screenshot({ path: test.info().outputPath("rewards-merchant-mobile.png"), fullPage: true });
    await merchant.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`/ru/cafes/${nar.slug}`);
    await expect(page.getByTestId("cafe-offers")).toContainText("Обед со скидкой");
    await expect(page.getByTestId("cafe-offers")).not.toContainText("WEB20");
    await page.getByRole("button", { name: /В корзину: E2E Manty/ }).click();
    await page.getByRole("link", { name: /Оформить заказ/ }).click();
    await page.getByTestId("checkout-address").fill("Aşgabat, rewards street");
    await page.getByTestId("checkout-latitude").fill("37.96");
    await page.getByTestId("checkout-longitude").fill("58.33");
    await expect(page.getByTestId("checkout-points-balance")).toContainText("10");
    await page.getByTestId("checkout-quote").click();
    await expect(page.getByTestId("checkout-discount")).toContainText("3.80 TMT");
    await page.getByTestId("checkout-promo").fill("WEB20");
    await expect(page.getByTestId("checkout-place")).toBeDisabled();
    await page.getByLabel(/Чай в подарок/).check();
    await page.getByTestId("checkout-quote").click();
    await expect(page.getByTestId("checkout-discount")).toContainText("7.60 TMT");
    await expect(page.getByTestId("checkout-earned")).toContainText("+5");
    await expect(page.getByTestId("checkout-spent")).toContainText("−5");
    await page.getByTestId(/^checkout-add-/).click();
    await expect(page.getByTestId("checkout-place")).toBeDisabled();
    await page.getByTestId(/^checkout-remove-/).click();
    await page.getByTestId("checkout-quote").click();
    await expect(page.getByTestId("checkout-place")).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath("rewards-checkout-mobile.png"), fullPage: true });
    const creation = page.waitForResponse((response) => response.url().endsWith("/marketplace/checkout/orders") && response.request().method() === "POST");
    await page.getByTestId("checkout-place").click();
    const saved = await creation;
    expect(saved.status()).toBe(201);
    const order = await saved.json() as { id: string; gifts: Array<{ id: string }> };
    expect(order).toMatchObject({ discount: 7.6, loyaltyPointsSpent: 5, loyaltyPointsEarned: 5, promotionLabel: "Скидка по коду" });
    await expect(page.getByRole("heading", { name: "Заказ принят" })).toBeVisible();
    await merchant.getByTestId("merchant-tab-orders").click();
    await merchant.getByTestId("merchant-refresh-orders").click();
    const row = merchant.getByTestId(`merchant-order-${order.id}`);
    await expect(row).toContainText("Чай в подарок");
    await expect(row).toContainText("Скидка: 7.60 TMT");
    await row.getByLabel(/E2E Manty/).check();
    await row.getByRole("button", { name: "Заказ готов", exact: true }).click();
    await expect(merchant.getByRole("alert")).toContainText("Отметьте каждое блюдо и подарок");
    await row.getByTestId(`pack-gift-${order.gifts[0]!.id}`).check();
    await row.getByRole("button", { name: "Заказ готов", exact: true }).click();
    await expect(row.locator(".status-pill")).toHaveText("Готов");
    await page.goto(`/en/cafes/${nar.slug}`);
    await page.getByRole("button", { name: /Add to basket: E2E Manty/ }).click();
    await page.getByRole("link", { name: /Checkout/ }).click();
    await expect(page.getByTestId("checkout-points-balance")).toHaveText("Points at this cafe: 5");
    await expect(page.getByTestId("checkout-points-history")).toContainText("Gift");
  });

  await test.step("merchant and OWNER setup fit a mobile viewport", async () => {
    for (const surface of [merchant, owner]) {
      await surface.setViewportSize({ width: 390, height: 844 });
      expect(await surface.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await merchant.getByTestId("merchant-tab-setup").click();
    await expect(merchant.getByTestId("merchant-cafe-setup")).toBeVisible();
    await owner.getByTestId("owner-cafe-profile-name").focus();
    await expect(owner.getByTestId("owner-cafe-profile-name")).toBeFocused();
    await owner.screenshot({ path: test.info().outputPath("owner-mobile.png"), fullPage: true });
    await merchant.screenshot({ path: test.info().outputPath("merchant-mobile.png"), fullPage: true });
  });

  expect(errors).toEqual([]);
  await merchant.close();
  await owner.close();
});

test("localized storefront remains usable at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tk");
  await expect(page.getByRole("link", { name: /E2E Nar/ })).toBeVisible();
  await page.getByRole("link", { name: /E2E Nar/ }).click();
  await expect(page.getByRole("heading", { name: "E2E Nar" })).toBeVisible();
  await page.getByRole("button", { name: /Sebede goş: E2E Manty/ }).click();
  await expect(page.locator(".cart-card")).toContainText("E2E Manty");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

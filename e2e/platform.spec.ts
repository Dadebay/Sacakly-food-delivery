import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const api = "http://127.0.0.1:4000/api/v1";
const merchantOrigin = "http://127.0.0.1:5174";

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
  }
  await page
    .locator("#quote-form input")
    .nth(0)
    .fill("Aşgabat, browser test street");
  await page.locator("#quote-form input").nth(1).fill("37.96");
  await page.locator("#quote-form input").nth(2).fill("58.33");
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
  page.on("pageerror", (error) => errors.push(error.message));

  const cafesResponse = await request.get(`${api}/marketplace/cafes`);
  expect(cafesResponse.ok()).toBeTruthy();
  const cafes = (await cafesResponse.json()) as Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  const gunes = cafes.find((cafe) => cafe.slug === "e2e-gunes")!;
  const nar = cafes.find((cafe) => cafe.slug === "e2e-nar")!;

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
  merchant.on("pageerror", (error) => errors.push(error.message));
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
      createdAt: string;
      deliveryRequest: { mode: string; status: string; offerAt: string };
    }>;
    const order = orders.find((entry) => entry.number === firstNumber)!;
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
  owner.on("pageerror", (error) => errors.push(error.message));
  await test.step("OWNER activates receipts only after cafe setup", async () => {
    await signInMerchant(owner, "+99362969614");
    await expect(owner.getByTestId("owner-dashboard-root")).toBeVisible();
    await owner.getByTestId("owner-cafe-select").selectOption(nar.id);
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

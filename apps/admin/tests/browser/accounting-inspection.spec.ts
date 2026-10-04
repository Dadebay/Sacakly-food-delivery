import { expect, test, type Page } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const actor = {
  id: userId,
  firstName: "Бухгалтер",
  lastName: "Тест",
  role: "ACCOUNTANT",
};
const start = "2025-02-01T04:30:00.000Z",
  end = "2025-02-01T14:00:00.000Z";
const order = {
  id: orderId,
  number: 520,
  status: "COOKING",
  source: "STAFF_PHONE",
  createdAt: start,
  total: 115,
  discount: 0,
  deliveryFee: 15,
  foodAmount: 100,
  address: "Ашхабад, длинный адрес с указанием корпуса и подъезда",
  branchName: "Кухня №1",
  deliveryEtrapName: "Копетдаг",
  cancellationReason: null,
  courier: {
    id: "44444444-4444-4444-8444-444444444444",
    firstName: "Марат",
    lastName: "Доставкин",
    role: "COURIER",
  },
};
const event = {
  id: eventId,
  action: "order.admin-edited",
  entityType: "Order",
  entityId: orderId,
  orderId,
  orderNumber: 520,
  relatedActors: [],
  createdAt: end,
  actor,
  metadata: {
    before: {
      address: "Старый адрес",
      items: [{ productName: "Манты", quantity: 2 }],
      total: 100,
    },
    after: {
      address: "Новый адрес",
      items: [{ productName: "Манты", quantity: 1 }],
      total: 50,
    },
  },
};

async function setup(page: Page) {
  const requests: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.addInitScript(
    (user) =>
      sessionStorage.setItem(
        "sacakly.session.v1",
        JSON.stringify({
          accessToken: "test-access",
          refreshToken: "test-refresh",
          accessExpiresAt: Date.now() + 3_600_000,
          expiresInSeconds: 3600,
          user: { ...user, phone: "+99365123456" },
        }),
      ),
    actor,
  );
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace("/api/v1", "");
    requests.push(path + url.search);
    let json: unknown = [];
    if (path === "/admin-page-access/me")
      json = {
        role: "ACCOUNTANT",
        allowedPages: ["ACCOUNTING"],
        availablePages: ["ACCOUNTING"],
        expandedPages: [],
        editable: false,
        version: 1,
      };
    else if (path === "/accounting/settings")
      json = {
        firstShiftName: "Дневная",
        firstShiftStart: "09:30",
        secondShiftName: "Ночная",
        secondShiftStart: "19:00",
        timeZone: "Asia/Ashgabat",
        updatedAt: start,
      };
    else if (path === "/accounting/shifts")
      json = [
        {
          shiftKey: "2025-02-01:first",
          shiftName: "Дневная",
          periodStart: start,
          periodEnd: end,
          isComplete: true,
          expectedAmount: 100,
          availableAmount: 0,
          settlementCount: 1,
          canSubmit: false,
          state: "CONFIRMED",
          handoff: null,
        },
      ];
    else if (path === "/accounting/report")
      json = {
        fromDate: "2025-02-01",
        toDate: "2025-02-28",
        timeZone: "Asia/Ashgabat",
        summary: {
          collectedAmount: 100,
          completedOrders: 1,
          averageOrderAmount: 100,
          submittedAmount: 100,
          confirmedAmount: 100,
          declaredHandoffAmount: 100,
          handoffDiscrepancy: 0,
          outstandingAmount: 0,
          cancelledOrders: 1,
          cancellationRate: 50,
        },
        daily: [{ date: "2025-02-01", amount: 100, orderCount: 1 }],
        handoffs: [],
        popularProducts: [],
      };
    else if (path === "/accounting/overview")
      json = {
        periodStart: start,
        periodEnd: end,
        timeZone: "Asia/Ashgabat",
        summary: {
          createdOrders: 2,
          cancelledOrders: 1,
          cancellationRate: 50,
          orderedFoodAmount: 100,
          deliveredUnreturnedAmount: 50,
          cancellationEvents: 1,
          editEvents: 1,
        },
        daily: [{ date: "2025-02-01", orders: 2, cancelled: 1 }],
        districts: [{ name: "Копетдаг", count: 1, foodAmount: 100 }],
        branches: [{ name: "Кухня №1", count: 1, foodAmount: 100 }],
        cancellationReasons: [
          { name: "Клиент передумал", count: 1, foodAmount: 50 },
        ],
        mostOrderedProducts: [
          { productId: orderId, name: "Манты", quantity: 2 },
        ],
        leastOrderedProducts: [
          { productId: orderId, name: "Манты", quantity: 2 },
        ],
      };
    else if (path === "/accounting/orders")
      json = {
        items: url.searchParams.get("status") === "CANCELLED" ? [] : [order],
        total: 26,
        page: Number(url.searchParams.get("page") || 1),
        limit: 25,
      };
    else if (path === `/accounting/orders/${orderId}`)
      json = {
        ...order,
        version: 2,
        subtotal: 100,
        cook: {
          id: userId,
          firstName: "Повар",
          lastName: "Кухни",
          role: "COOK",
        },
        participants: [
          {
            actor: { ...actor, firstName: "Анна", role: "ADMIN" },
            actions: ["order.admin-edited", "order.packing-confirmed"],
          },
        ],
        actualCourierUnknown: true,
        gifts: [],
        customerPhone: "+99365123456",
        customerName: "Клиент",
        customerNote: "Без лука",
        items: [
          {
            id: eventId,
            productName: "Манты",
            variantName: null,
            quantity: 2,
            unitPrice: 50,
            lineTotal: 100,
            preparationMinutes: 520,
          },
        ],
        transitions: [],
        settlement: null,
      };
    else if (path === "/accounting/audit" || path.endsWith("/audit"))
      json = { items: [event], total: 1, page: 1, limit: 25 };
    else if (path === "/accounting/carryover")
      json = {
        items: [
          {
            ...order,
            statusAtBoundary: "COOKING",
            historicalSnapshotAvailable: true,
            snapshot: {
              address: order.address,
              items: [{ productName: "Манты", quantity: 2 }],
              total: 115,
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
        boundary: end,
        isProvisional: false,
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
  return { requests, errors };
}

test("accountant inspects the calendar month, real query parameters, edits and carryover without mutation controls", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await page.goto("/accounting?fromDate=2025-02-01&toDate=2025-02-28");
  await expect(page.getByTestId("inspection-orders")).toContainText(
    "Заказ №520",
  );
  await expect(page.getByTestId("inspection-orders")).toContainText(
    "Марат Доставкин",
  );
  await page.screenshot({
    path: testInfo.outputPath("orders.png"),
    fullPage: true,
  });
  await page.getByTestId("inspection-tab-overview").click();
  await expect(page.getByTestId("inspection-overview")).toBeVisible();
  expect(
    state.requests.filter((path) => path.startsWith("/accounting/overview?"))
      .length,
  ).toBeLessThanOrEqual(process.env.ADMIN_QA_PRODUCTION === "1" ? 1 : 2);

  await page.getByTestId("accounting-month").fill("2024-02");
  await page.getByTestId("accounting-month-apply").click();
  await expect
    .poll(() =>
      state.requests.some((path) =>
        path.includes("fromDate=2024-02-01&toDate=2024-02-29"),
      ),
    )
    .toBe(true);
  await expect(page.getByTestId("inspection-orders-chart")).toBeVisible();
  await expect(page.getByTestId("inspection-revenue-chart")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("monthly-charts.png"),
    fullPage: true,
  });
  await page.getByTestId("inspection-chart-day").selectOption("2025-02-01");
  await expect
    .poll(() =>
      state.requests.some((path) =>
        path.includes("fromDate=2025-02-01&toDate=2025-02-01"),
      ),
    )
    .toBe(true);
  await page.getByTestId("inspection-tab-shifts").click();
  await page.getByTestId("accounting-inspect-2025-02-01:first").click();
  await expect(page.getByTestId("inspection-shift")).toHaveValue(
    "2025-02-01:first",
  );
  await page.getByTestId("inspection-tab-out").click();
  await expect(page.getByTestId("inspection-carryover")).toContainText(
    "Готовится",
  );
  await page.getByTestId(`inspection-carry-order-${orderId}`).click();
  await expect(page.getByTestId("inspection-order-detail")).toContainText(
    "готовка 520 мин.",
  );
  await expect(page.getByTestId("inspection-participants")).toContainText(
    "Марат Доставкин",
  );
  await expect(page.getByTestId("inspection-participants")).toContainText(
    "Анна",
  );
  await expect(page.getByTestId("inspection-participants")).toContainText(
    "Кто доставил фактически — неизвестно",
  );
  await expect(page.getByTestId("inspection-order-detail")).toHaveJSProperty(
    "open",
    true,
  );
  expect(
    (await page.getByTestId("inspection-order-detail").boundingBox())?.y,
  ).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("order-details.png") });
  await page.getByTestId("inspection-history-tab").click();
  await page.getByTestId(`inspection-event-expand-${eventId}`).click();
  await expect(page.getByTestId("inspection-order-detail")).toContainText(
    "Старый адрес",
  );
  await expect(page.getByTestId("inspection-order-detail")).toContainText(
    "Новый адрес",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("inspection-order-detail")).toHaveCount(0);
  await page.getByTestId("inspection-tab-orders").click();
  await expect(page.getByTestId("inspection-orders")).toBeVisible();
  await page.getByTestId("inspection-orders-next").click();
  await expect
    .poll(() =>
      state.requests.some(
        (path) =>
          path.startsWith("/accounting/orders?") && path.includes("page=2"),
      ),
    )
    .toBe(true);
  await page.getByTestId("inspection-order-filters").click();
  await page.getByTestId("inspection-order-basis").selectOption("cashReturned");
  await expect
    .poll(() =>
      state.requests.some(
        (path) =>
          path.includes("basis=cashReturned") && path.includes("page=1"),
      ),
    )
    .toBe(true);
  await page.getByTestId("inspection-order-status").selectOption("CANCELLED");
  await expect(page.getByText("Заказы не найдены.")).toBeVisible();
  await page.getByTestId("inspection-tab-audit").click();
  await expect(page.getByTestId("inspection-audit-list")).toContainText(
    "Заказ №520",
  );
  await expect(page.getByTestId("inspection-audit-list")).not.toContainText(
    orderId,
  );
  await page.getByTestId(`inspection-event-expand-${eventId}`).click();
  await expect(page.getByTestId("inspection-audit-list")).toContainText("Было");
  await expect(page.getByTestId("inspection-audit-list")).toContainText(
    "Стало",
  );
  await expect(page.getByTestId("accounting-settings-form")).toHaveCount(0);
  await expect(page.getByTestId("accounting-handoff-form")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("accountant-inspection.png"),
    fullPage: true,
  });
  expect(state.errors).toEqual([]);
});

test("overview failures can be retried and empty audit is explicit", async ({
  page,
}) => {
  await setup(page);
  let failed = false;
  await page.route("**/api/v1/accounting/overview?**", async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "Период недоступен" }),
      });
    } else await route.fallback();
  });
  await page.goto("/accounting?inspection=overview");
  // Query retries once; the successful result replaces the transient failure.
  await expect(page.getByTestId("inspection-overview")).toBeVisible();
  await page.route("**/api/v1/accounting/audit?**", (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, limit: 25 } }),
  );
  await page.getByTestId("inspection-tab-audit").click();
  await expect(
    page.getByText("За выбранный период действий нет."),
  ).toBeVisible();
});

test("narrow phone keeps order numbers, month controls and dialog usable", async ({
  page,
}, testInfo) => {
  const { errors } = await setup(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/accounting?fromDate=2025-02-01&toDate=2025-02-28");
  await expect(
    page.getByTestId(`inspection-open-order-${orderId}`),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const rowBox = await page.locator(".inspection-orders-table tbody tr").first().boundingBox();
  const cellBoxes = await page.locator(".inspection-orders-table tbody tr").first().locator("td").evaluateAll(cells=>cells.map(cell=>cell.getBoundingClientRect().bottom));
  expect(Math.max(...cellBoxes)).toBeLessThanOrEqual(rowBox!.y + rowBox!.height);
  const paginationBox=await page.getByTestId("inspection-orders-next").boundingBox();
  expect(paginationBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height);
  await page.getByTestId(`inspection-open-order-${orderId}`).click();
  await expect(page.getByTestId("inspection-participants")).toContainText(
    "Марат",
  );
  expect(
    await page
      .getByTestId("inspection-order-detail")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("narrow-order.png") });
  await page.keyboard.press("Escape");
  await expect(
    page.getByTestId(`inspection-open-order-${orderId}`),
  ).toBeFocused();
  expect(errors).toEqual([]);
});

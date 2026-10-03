import { expect, test, type Page } from "@playwright/test";

const orderId = "11111111-1111-4111-8111-111111111111";
const courierId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const reason =
  "Курьер ушёл без приложения.\nКлиент подтвердил доставку, вся сумма 105 TMT сдана администратору.";

async function setup(
  page: Page,
  options: {
    role?: string;
    status?: string;
    unassigned?: boolean;
    conflict?: boolean;
    holdCompletion?: boolean;
  } = {},
) {
  const role = options.role ?? "ADMIN";
  const now = new Date().toISOString();
  const courier = {
    id: courierId,
    firstName: "Доставщик",
    lastName: "Без приложения",
    phone: "+99361008810",
    courierOrders: [],
  };
  let order = {
    id: orderId,
    number: 72,
    customerId: actorId,
    addressId: null,
    branchId: null,
    cookId: null,
    courierId: options.unassigned ? null : courierId,
    promoCodeId: null,
    deliveryEtrapId: null,
    status: options.status ?? "ASSIGNED_TO_COURIER",
    source: "CUSTOMER_APP",
    paymentMethod: "CASH",
    subtotal: 100,
    discount: 10,
    deliveryFee: 15,
    total: 105,
    loyaltyPointsEarned: 7,
    loyaltyPointsSpent: 0,
    address: "Тестовый адрес",
    latitude: 37.96,
    longitude: 58.33,
    entrance: null,
    floor: null,
    apartment: null,
    deliveryWelayatName: null,
    deliveryEtrapName: null,
    branchName: null,
    branchAddress: null,
    branchLatitude: null,
    branchLongitude: null,
    branchDistanceMeters: null,
    customerNote: null,
    cancellationReason: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    assignedAt: now,
    deliveredAt: null,
    completedAt: null,
    packingConfirmedAt: now,
    customer: {
      id: actorId,
      phone: "+99361008820",
      firstName: "Клиент",
      lastName: null,
    },
    cook: null,
    courier: options.unassigned ? null : courier,
    items: [],
    gifts: [],
    rating: null,
    cashSettlement: null,
    savedAddress: null,
    transitions: [] as Record<string, unknown>[],
  };
  const session = {
    accessToken: "test-access",
    refreshToken: "test-refresh",
    expiresInSeconds: 3600,
    accessExpiresAt: Date.now() + 3_600_000,
    user: {
      id: actorId,
      phone: "+99361008830",
      firstName: "Администратор",
      lastName: null,
      role,
    },
  };
  await page.addInitScript(
    (value) =>
      sessionStorage.setItem("alowalow.session.v1", JSON.stringify(value)),
    session,
  );
  const state = {
    writes: [] as Record<string, unknown>[],
    listReads: 0,
    detailReads: 0,
    errors: [] as string[],
    releaseCompletion: () => {},
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  page.on("console", (message) => {
    if (
      ["error", "warning"].includes(message.type()) &&
      !message.text().includes("Failed to load resource")
    )
      state.errors.push(message.text());
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/api\/v1/,
      "",
    );
    let json: unknown = [];
    let status = 200;
    if (path === "/admin-page-access/me")
      json = {
        role,
        allowedPages: ["ORDERS"],
        availablePages: ["ORDERS"],
        expandedPages: [],
        editable: false,
        version: 1,
      };
    else if (path === "/orders") {
      state.listReads++;
      json = { items: [order], page: 1, limit: 100, total: 1, pages: 1 };
    } else if (path === "/staff/couriers") json = [courier];
    else if (path === `/orders/${orderId}`) {
      state.detailReads++;
      json = order;
    } else if (path === "/receipt-print-tasks")
      json = {
        items: [],
        pending: 0,
        needsAttention: 0,
        consumerMode: "DIRECT_AGENT",
      };
    else if (path === `/orders/${orderId}/admin-complete`) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      state.writes.push(body);
      if (options.holdCompletion)
        await new Promise<void>((resolve) => {
          state.releaseCompletion = resolve;
        });
      if (options.conflict) {
        status = 409;
        json = {
          statusCode: 409,
          message: "Order changed; reload and try again",
        };
      } else {
        order = {
          ...order,
          status: "CASH_RETURNED",
          version: 2,
          courierId,
          courier,
          transitions: [
            {
              id: actorId,
              fromStatus: order.status,
              toStatus: "CASH_RETURNED",
              note: body.reason,
              createdAt: now,
              actor: { ...session.user },
            },
          ],
        };
        json = order;
      }
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
  await page.goto("/orders");
  await expect(page.getByTestId("order-board")).toBeVisible();
  return state;
}

async function openCompletion(page: Page, table = false) {
  if (table) {
    await expect(async () => {
      await page.getByTestId("orders-view-table").click();
      await expect(page.getByTestId("orders-view-table")).toHaveAttribute(
        "aria-selected",
        "true",
        { timeout: 1_000 },
      );
    }).toPass({ timeout: 10_000 });
    await page.getByTestId(`order-table-complete-${orderId}`).click();
  } else {
    await page.getByTestId(`order-kanban-summary-${orderId}`).click();
    await page.getByTestId(`order-kanban-complete-${orderId}`).click();
  }
  await expect(page.getByTestId("order-complete-dialog")).toBeVisible();
}

test("assigned courier completion requires the full reason and cash, refreshes history and blocks duplicate submits", async ({
  page,
}, info) => {
  const state = await setup(page, { holdCompletion: true });
  await openCompletion(page);
  await expect(page.getByTestId("order-complete-dialog")).toContainText(
    "Деньги должны быть уже получены",
  );
  await expect(
    page.getByTestId("order-complete-assigned-courier"),
  ).toContainText("Доставщик Без приложения");
  await expect(page.getByTestId("order-complete-courier")).toHaveCount(0);
  await page.getByTestId("order-complete-submit").click();
  await expect(page.getByTestId("order-complete-dialog")).toContainText(
    "минимум 20 символов",
  );
  await expect(page.getByTestId("order-complete-dialog")).toContainText(
    "Подтвердите доставку",
  );
  expect(state.writes).toHaveLength(0);
  await page.getByTestId("order-complete-reason").fill(`  ${reason}  `);
  await page.getByTestId("order-complete-cash").check();
  await page
    .getByTestId("order-complete-dialog")
    .screenshot({ path: info.outputPath("completion-form.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByTestId("order-complete-submit").click();
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(page.getByTestId("order-complete-submit")).toBeDisabled();
  state.releaseCompletion();
  await expect(page.getByTestId("order-complete-dialog")).toHaveCount(0);
  await expect(page.getByTestId("order-complete-success")).toContainText(
    "деньги учтены в смене",
  );
  expect(state.writes).toEqual([{ reason, cashReceived: true, version: 1 }]);
  expect(state.listReads).toBeGreaterThan(1);
  expect(state.detailReads).toBe(0);
  await page.getByTestId("orders-view-table").click();
  await page.getByTestId(`order-table-details-${orderId}`).click();
  await expect(page.locator(".order-timeline blockquote")).toHaveText(reason);
  expect(state.errors).toEqual([]);
});

test("table recovery selects the real courier for an unassigned order", async ({
  page,
}) => {
  const state = await setup(page, {
    status: "READY",
    unassigned: true,
    role: "SUPER_ADMIN",
  });
  await openCompletion(page, true);
  await page.getByTestId("order-complete-reason").fill(reason);
  await page.getByTestId("order-complete-cash").check();
  await page.getByTestId("order-complete-submit").click();
  await expect(page.getByTestId("order-complete-dialog")).toContainText(
    "Выберите курьера",
  );
  expect(state.writes).toHaveLength(0);
  await page.getByTestId("order-complete-courier").selectOption(courierId);
  await page.getByTestId("order-complete-submit").click();
  await expect(page.getByTestId("order-complete-dialog")).toHaveCount(0);
  expect(state.writes).toEqual([
    { reason, cashReceived: true, version: 1, courierId },
  ]);
  expect(state.errors).toEqual([]);
});

test("conflict refreshes data and requires reopening before another submission", async ({
  page,
}) => {
  const state = await setup(page, { conflict: true });
  await openCompletion(page);
  await page.getByTestId("order-complete-reason").fill(reason);
  await page.getByTestId("order-complete-cash").check();
  await page.getByTestId("order-complete-submit").click();
  await expect(page.getByTestId("order-complete-error")).toContainText(
    "откройте заказ заново",
  );
  await expect(page.getByTestId("order-complete-submit")).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  expect(state.listReads).toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("order-complete-dialog")).toHaveCount(0);
  await expect(
    page.getByTestId(`order-kanban-complete-${orderId}`),
  ).toBeFocused();
  expect(state.errors).toEqual([]);
});

test("operator cannot complete and terminal orders have no completion action", async ({
  page,
}) => {
  const state = await setup(page, { role: "OPERATOR" });
  await page.getByTestId("orders-view-table").click();
  await expect(page.getByTestId(`order-table-complete-${orderId}`)).toHaveCount(
    0,
  );
  expect(state.writes).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("completed order has no completion button and no recovery form requests occur on load", async ({
  page,
}) => {
  const state = await setup(page, { status: "CASH_RETURNED" });
  await page.getByTestId("orders-view-table").click();
  await expect(page.getByTestId(`order-table-complete-${orderId}`)).toHaveCount(
    0,
  );
  expect(state.writes).toHaveLength(0);
  expect(state.detailReads).toBe(0);
  expect(state.errors).toEqual([]);
});

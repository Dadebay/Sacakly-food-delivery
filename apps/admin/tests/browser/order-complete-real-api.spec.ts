import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { components } from "@alowalow/api-contract";

type Order = components["schemas"]["OrderResponseDto"];
type Session = components["schemas"]["AuthSessionResponseDto"] & {
  accessExpiresAt: number;
};

test("courier without an app is completed through the real Nest API and appears in shift accounting", async ({
  page,
}, info) => {
  test.skip(
    !process.env.ORDER_COMPLETE_QA_FIXTURE,
    "Requires the isolated alofood_test QA API",
  );
  const fixture = JSON.parse(
    await readFile(process.env.ORDER_COMPLETE_QA_FIXTURE!, "utf8"),
  ) as {
    session: Session;
    assigned: Order[];
    unassigned: Order[];
    courierId: string;
  };
  const order = fixture.assigned[info.project.name.includes("mobile") ? 1 : 0];
  const errors: string[] = [],
    writes: unknown[] = [],
    timings: number[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      errors.push(message.text());
  });
  await page.addInitScript((session) => {
    sessionStorage.setItem("alowalow.session.v1", JSON.stringify(session));
    Object.assign(window, {
      completionMetrics: { lcp: 0, cls: 0, maxEventMs: 0 },
    });
    const metrics = (
      window as unknown as {
        completionMetrics: { lcp: number; cls: number; maxEventMs: number };
      }
    ).completionMetrics;
    if (
      PerformanceObserver.supportedEntryTypes.includes(
        "largest-contentful-paint",
      )
    ) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    }
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          if (!shift.hadRecentInput) metrics.cls += shift.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    }
    if (PerformanceObserver.supportedEntryTypes.includes("event")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          metrics.maxEventMs = Math.max(metrics.maxEventMs, entry.duration);
      }).observe({ type: "event", buffered: true });
    }
  }, fixture.session);
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/admin-complete"))
      writes.push(route.request().postDataJSON());
    const response = await route.fetch({
      url: `http://127.0.0.1:4017${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  await page.goto("/orders");
  await page.getByTestId(`order-kanban-summary-${order.id}`).click();
  let started = Date.now();
  await page.getByTestId(`order-kanban-complete-${order.id}`).click();
  await expect(page.getByTestId("order-complete-dialog")).toBeVisible();
  timings.push(Date.now() - started);
  const reason = `Курьер доставил без приложения. Клиент подтвердил получение, вся сумма ${order.total} TMT сдана администратору.`;
  await page.getByTestId("order-complete-reason").fill(reason);
  await page.getByTestId("order-complete-cash").check();
  await page
    .getByTestId("order-complete-dialog")
    .screenshot({ path: info.outputPath("real-completion.png") });
  started = Date.now();
  await page.getByTestId("order-complete-submit").click();
  await expect(page.getByTestId("order-complete-success")).toBeVisible();
  timings.push(Date.now() - started);
  expect(writes).toEqual([
    { reason, cashReceived: true, version: order.version },
  ]);
  const detailResponse = await page.request.get(
    `http://127.0.0.1:4017/api/v1/orders/${order.id}`,
    { headers: { Authorization: `Bearer ${fixture.session.accessToken}` } },
  );
  expect(detailResponse.ok()).toBe(true);
  const detail = (await detailResponse.json()) as Order;
  expect(detail.status).toBe("CASH_RETURNED");
  expect(detail.courierId).toBe(fixture.courierId);
  expect(detail.transitions.at(-1)?.note).toBe(reason);
  expect(detail.cashSettlement?.status).toBe("CONFIRMED");
  expect(detail.cashSettlement?.amount).toBe(order.total - order.deliveryFee);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ashgabat",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const shiftsResponse = await page.request.get(
    `http://127.0.0.1:4017/api/v1/accounting/shifts?fromDate=${date}&toDate=${date}`,
    { headers: { Authorization: `Bearer ${fixture.session.accessToken}` } },
  );
  expect(shiftsResponse.ok()).toBe(true);
  const shifts =
    (await shiftsResponse.json()) as components["schemas"]["AccountingShiftResponseDto"][];
  expect(
    shifts.some(
      (shift) =>
        shift.expectedAmount >= detail.total - detail.deliveryFee &&
        shift.settlementCount >= 1,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath("real-results.json"),
    JSON.stringify(
      {
        timings,
        metrics: await page.evaluate(
          () =>
            (
              window as unknown as {
                completionMetrics: {
                  lcp: number;
                  cls: number;
                  maxEventMs: number;
                };
              }
            ).completionMetrics,
        ),
        writes: writes.length,
        status: detail.status,
        accountingAmount: detail.cashSettlement?.amount,
        errors,
      },
      null,
      2,
    ),
  );
});

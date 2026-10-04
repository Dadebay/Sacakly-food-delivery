import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("accountant month, shift transfer and audit work against the isolated Nest API", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.ACCOUNTING_QA_SESSION,
    "Requires an isolated sacakly_test API fixture and test-account session",
  );
  const session: unknown = JSON.parse(
    await readFile(process.env.ACCOUNTING_QA_SESSION!, "utf8"),
  );
  const errors: string[] = [],
    requests: string[] = [],
    latencies: number[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.addInitScript((value) => {
    sessionStorage.setItem("sacakly.session.v1", JSON.stringify(value));
    Object.assign(window, {
      accountingQa: {
        lcp: 0,
        cls: 0,
        layoutShifts: [] as { value: number; elements: string[] }[],
      },
    });
    const metrics = (
      window as unknown as {
        accountingQa: {
          lcp: number;
          cls: number;
          layoutShifts: { value: number; elements: string[] }[];
        };
      }
    ).accountingQa;
    if (
      PerformanceObserver.supportedEntryTypes.includes(
        "largest-contentful-paint",
      )
    )
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift"))
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: { node?: Element }[];
          };
          if (!shift.hadRecentInput) {
            metrics.cls += shift.value;
            metrics.layoutShifts.push({
              value: shift.value,
              elements: (shift.sources ?? []).map(
                ({ node }) =>
                  node?.getAttribute("data-testid") ??
                  node?.className ??
                  node?.tagName ??
                  "unknown",
              ),
            });
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
  }, session);
  // Forward the production bundle's configured origin to the real test API.
  // No API response is mocked; JWT, roles, SQL, aggregation and audit are real.
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const response = await route.fetch({
      url: `http://127.0.0.1:4015${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  await page.goto("/accounting?fromDate=2025-02-01&toDate=2025-02-28&inspection=overview");
  await expect(page.getByTestId("inspection-overview")).toContainText("30");
  await expect(page.getByTestId("inspection-overview")).toContainText(
    "Копетдаг",
  );
  expect(
    requests.filter((url) => url.includes("/accounting/overview?")).length,
  ).toBe(1);
  expect(requests.some((url) => url.includes("/accounting/orders"))).toBe(
    false,
  );
  await page
    .getByTestId("accounting-inspection")
    .screenshot({ path: testInfo.outputPath("real-month.png") });
  let started = Date.now();
  await page.getByTestId("inspection-tab-orders").click();
  await expect(page.getByTestId("inspection-orders")).toBeVisible();
  latencies.push(Date.now() - started);
  await page.getByTestId("inspection-orders-next").click();
  await expect(
    page.getByTestId("inspection-orders").locator("tbody tr"),
  ).toHaveCount(5);
  started = Date.now();
  await page
    .getByTestId("inspection-orders")
    .locator("tbody button")
    .first()
    .click();
  await expect(page.getByTestId("inspection-order-detail")).toContainText(
    "готовка 520 мин.",
  );
  latencies.push(Date.now() - started);
  await expect(page.getByTestId("inspection-participants")).toContainText("Ахмет");
  await page.screenshot({path:testInfo.outputPath("real-order.png")});
  await page.getByTestId("inspection-order-close").click();
  await page.getByTestId("inspection-shift").selectOption("2025-02-02:first");
  await page.getByTestId("inspection-tab-out").click();
  await expect(page.getByTestId("inspection-carryover")).toContainText(
    "Готовится",
  );
  await page
    .getByTestId("inspection-carryover")
    .screenshot({ path: testInfo.outputPath("real-carryover.png") });
  await page.getByTestId("inspection-tab-audit").click();
  await page
    .getByTestId("inspection-audit-action")
    .selectOption("order.admin-edited");
  await expect(
    page
      .getByTestId("inspection-audit-list")
      .getByRole("button", { name: "Подробнее" }),
  ).toHaveCount(1);
  await page
    .getByTestId("inspection-audit-list")
    .getByRole("button", { name: "Подробнее" })
    .click();
  await expect(page.getByTestId("inspection-audit-list")).toContainText(
    "Старый адрес",
  );
  await expect(page.getByTestId("inspection-audit-list")).toContainText("Было");
  await page
    .getByTestId("inspection-audit-list")
    .screenshot({ path: testInfo.outputPath("real-audit.png") });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  const metrics = await page.evaluate(
    () =>
      (
        window as unknown as {
          accountingQa: {
            lcp: number;
            cls: number;
            layoutShifts: { value: number; elements: string[] }[];
          };
        }
      ).accountingQa,
  );
  await writeFile(
    testInfo.outputPath("performance.json"),
    JSON.stringify(
      { ...metrics, interactionWallMs: latencies, requests, errors },
      null,
      2,
    ),
  );
  await testInfo.attach("performance.json", {
    body: JSON.stringify(
      { ...metrics, interactionWallMs: latencies, requests, errors },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});

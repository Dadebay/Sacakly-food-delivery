import { expect, test } from "@playwright/test";

const taskId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";

test("administrator cancels a waiting manta ticket from the queue", async ({ page }) => {
  const session = {
    accessToken: "test-access", refreshToken: "test-refresh", expiresInSeconds: 3600,
    accessExpiresAt: Date.now() + 3_600_000,
    user: { id: "33333333-3333-4333-8333-333333333333", phone: "+99365120000", firstName: "Admin", lastName: null, role: "ADMIN" },
  };
  await page.addInitScript((value) => sessionStorage.setItem("sacakly.session.v1", JSON.stringify(value)), session);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  let cancelled = 0;
  const due = new Date(Date.now() + 20 * 60_000).toISOString();
  const task = {
    id: taskId, orderId, orderNumber: 72, itemNames: ["Манты"],
    documentType: "ORDER", status: "PENDING", attempts: 0,
    createdAt: new Date().toISOString(), nextAttemptAt: due,
    stationId: null, lastError: null, deliveredAt: null,
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, "");
    const method = route.request().method();
    let json: unknown = [];
    let status = 200;
    if (path === "/admin-page-access/me")
      json = { role: "ADMIN", allowedPages: ["ORDERS"], availablePages: ["ORDERS"], expandedPages: [], editable: false, version: 1 };
    else if (path === "/orders")
      json = { items: [], page: 1, limit: 100, total: 0, pages: 1 };
    else if (path === "/receipt-print-tasks")
      json = { items: cancelled ? [] : [task], pending: cancelled ? 0 : 1, needsAttention: 0, consumerMode: "DIRECT_AGENT" };
    else if (path === `/receipt-print-tasks/${taskId}/cancel` && method === "POST") {
      cancelled += 1;
      json = { ...task, status: "CANCELLED", lastError: "MANUALLY_CANCELLED" };
      status = 201;
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
  });
  await page.goto("/orders");
  await expect(async () => {
    const queue = page.getByTestId("receipt-queue");
    if (!(await queue.evaluate((element) => (element as HTMLDetailsElement).open)))
      await page.getByTestId("receipt-queue-toggle").click();
    await expect(queue).toHaveJSProperty("open", true, { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(page.getByTestId(`receipt-queue-item-${taskId}`)).toBeVisible();
  await expect(page.getByTestId(`receipt-queue-item-${taskId}`)).toContainText("Манты");
  await page.getByTestId(`receipt-queue-cancel-${taskId}`).click();
  await expect.poll(() => cancelled).toBe(1);
  await expect(page.getByTestId(`receipt-queue-item-${taskId}`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canReceiveNewOrderAlerts,
  collectNewItems,
  createNewOrderTracker,
} from "../src/features/new-order-alert/model/new-order-alert.ts";

test("new-order alerts establish a quiet baseline and announce unseen IDs once", () => {
  const current = [{ id: "order-1" }, { id: "order-2" }];

  assert.deepEqual(collectNewItems(null, current), []);
  assert.deepEqual(collectNewItems(new Set(["order-1"]), current), [
    { id: "order-2" },
  ]);
  assert.deepEqual(
    collectNewItems(new Set(current.map((item) => item.id)), current),
    [],
  );
});

test("only newly created orders ring, including equal timestamps and an empty baseline", () => {
  const tracker = createNewOrderTracker();
  const old = { id: "old", createdAt: "2026-09-13T07:00:00Z" };
  const first = { id: "first", createdAt: "2026-09-13T08:00:00Z" };
  const second = { id: "second", createdAt: first.createdAt };
  const third = { id: "third", createdAt: "2026-09-13T08:01:00Z" };
  assert.deepEqual(tracker([first]), []);
  assert.deepEqual(tracker([second, first]), [second]);
  assert.deepEqual(tracker([]), []);
  assert.deepEqual(tracker([old, first, second]), []);
  assert.deepEqual(tracker([third, second]), [third]);
  assert.deepEqual(tracker([third, { ...second, version: 2 }]), []);
  const lateCommit = { id: "late-commit", createdAt: "2026-09-13T08:00:30Z" };
  assert.deepEqual(tracker([third, lateCommit]), [lateCommit]);
  const empty = createNewOrderTracker();
  assert.deepEqual(empty([]), []);
  assert.deepEqual(empty([first, second]), [first, second]);
});

test("only order intake roles receive new-order alerts", () => {
  for (const role of ["OPERATOR", "ADMIN", "SUPER_ADMIN"]) {
    assert.equal(canReceiveNewOrderAlerts(role), true, role);
  }
  for (const role of ["CUSTOMER", "COOK", "COURIER", "ACCOUNTANT"]) {
    assert.equal(canReceiveNewOrderAlerts(role), false, role);
  }
});


test("the alert uses one visible-tab 30-second order poll and browser opt-in", async () => {
  const [querySource, alertSource, dashboardSource] = await Promise.all([
    readFile(
      new URL("../src/entities/order/api/order-queries.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/features/new-order-alert/ui/new-order-alert.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(querySource, /ORDER_POLL_INTERVAL_MS = 30_000/);
  assert.match(querySource, /document\.visibilityState === "visible"/);
  assert.match(querySource, /refetchIntervalInBackground: false/);
  assert.match(alertSource, /statuses: \["COOKING", "READY"\]/);
  assert.doesNotMatch(alertSource, /claimAutomaticReceiptPrint/);
  assert.doesNotMatch(alertSource, /printReceipt\(order\.id\)/);
  assert.match(alertSource, /Notification\.requestPermission\(\)/);
  assert.match(alertSource, /data-testid="new-order-alert-toast"/);
  assert.match(alertSource, /data-testid="new-order-alert-open"/);
  assert.match(
    dashboardSource,
    /canReceiveNewOrderAlerts\(session\.user\.role\)/,
  );
  assert.doesNotMatch(dashboardSource, /showOperationalBanners/);
  assert.match(dashboardSource, /<NewOrderAlert\s+key=\{session\.user\.id\}/);
});

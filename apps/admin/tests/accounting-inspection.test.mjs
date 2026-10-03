import assert from "node:assert/strict";
import test from "node:test";
import { accountingMonthRange } from "../src/widgets/accounting-dashboard/model/accounting-forms.ts";
import { auditChanges, inspectionSearchSchema } from "../src/widgets/accounting-dashboard/model/inspection.ts";

test("calendar reports include the entire month and leap day", () => {
  assert.deepEqual(accountingMonthRange("2024-02"), { fromDate: "2024-02-01", toDate: "2024-02-29" });
  assert.deepEqual(accountingMonthRange("2025-02"), { fromDate: "2025-02-01", toDate: "2025-02-28" });
  assert.deepEqual(accountingMonthRange("2026-12"), { fromDate: "2026-12-01", toDate: "2026-12-31" });
  assert.throws(() => accountingMonthRange("2026-13"));
});
test("order audit comparison preserves changed lines, cleared values and zero prices", () => {
  assert.deepEqual(auditChanges({ before: { total: 15, note: "text", address: "same", items: [{ quantity: 2 }] }, after: { total: 0, note: null, address: "same", items: [{ quantity: 1 }] } }).map(({ key }) => key), ["total", "note", "items"]);
  assert.deepEqual(auditChanges({ previous: { price: 1 }, current: { price: 2 } }), [{ key: "price", before: 1, after: 2 }]);
  assert.deepEqual(auditChanges({ changedFields: ["price"] }), []);
  assert.deepEqual(auditChanges(null), []);
});
test("order search accepts empty reset and rejects invalid or overflowing numbers", () => {
  for (const number of ["", "520", "2147483647"]) assert.equal(inspectionSearchSchema.safeParse({ number }).success, true);
  for (const number of ["0", "-1", "1.1", "2147483648", "abc"]) assert.equal(inspectionSearchSchema.safeParse({ number }).success, false);
});

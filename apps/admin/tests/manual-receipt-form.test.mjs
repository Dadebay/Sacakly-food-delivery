import assert from "node:assert/strict";
import test from "node:test";
import {
  manualReceiptFormSchema,
  manualReceiptItemRoutes,
} from "../src/features/receipt-printing/model/manual-receipt-form.ts";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const printer = "33333333-3333-4333-8333-333333333333";

test("manual print requires at least one included dish", () => {
  assert.equal(manualReceiptFormSchema.safeParse({
    mainCopies: 2, routes: [{ itemId: first, included: false, destination: "DEFAULT" }],
  }).success, false);
});

test("manual print sends explicit omissions and printer overrides", () => {
  const values = manualReceiptFormSchema.parse({
    mainCopies: 2, routes: [
      { itemId: first, included: false, destination: "DEFAULT" },
      { itemId: second, included: true, destination: printer },
    ],
  });
  assert.deepEqual(manualReceiptItemRoutes(values), [
    { itemId: first, printerId: null, skip: true },
    { itemId: second, printerId: printer },
  ]);
});

test("default routes are omitted and main-only routes stay explicit", () => {
  const values = manualReceiptFormSchema.parse({
    mainCopies: 2, routes: [
      { itemId: first, included: true, destination: "DEFAULT" },
      { itemId: second, included: true, destination: "MAIN" },
    ],
  });
  assert.deepEqual(manualReceiptItemRoutes(values), [
    { itemId: second, printerId: null },
  ]);
  assert.equal(manualReceiptFormSchema.safeParse({
    mainCopies: 2, routes: [{ itemId: first, destination: "not-a-printer" }],
  }).success, false);
});

for (const mainCopies of [-1, 4, 1.5, null, "1"]) {
  test(`manual copies reject ${JSON.stringify(mainCopies)}`, () => {
    assert.equal(manualReceiptFormSchema.safeParse({ mainCopies, routes: [{ itemId: first, included: true, destination: "DEFAULT" }] }).success, false);
  });
}
test("main-only dish requires enabled main printing", () => {
  assert.equal(manualReceiptFormSchema.safeParse({ mainCopies: 0, routes: [{ itemId: first, included: true, destination: "MAIN" }] }).success, false);
  assert.equal(manualReceiptFormSchema.safeParse({ mainCopies: 0, routes: [{ itemId: first, included: true, destination: "DEFAULT" }] }).success, true);
});

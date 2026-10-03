import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCategoryPrinterUpdate,
  buildCategoryVisibilityUpdate,
} from "../src/widgets/catalog-manager/model/category-receipt-route.ts";

const category = {
  receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
  sortOrder: 7,
  isActive: true,
};

test("category printer update preserves visibility and ordering", () => {
  assert.deepEqual(
    buildCategoryPrinterUpdate(
      category,
      "c9949db2-cf7c-4f28-8a0f-81776210d2f1",
    ),
    {
      receiptPrinterId: "c9949db2-cf7c-4f28-8a0f-81776210d2f1",
      sortOrder: 7,
      isActive: true,
    },
  );
  assert.deepEqual(buildCategoryPrinterUpdate(category, ""), {
    receiptPrinterId: null,
    sortOrder: 7,
    isActive: true,
  });
  assert.equal(
    category.receiptPrinterId,
    "2d807991-e99f-4f17-9b9f-cc2fb7478820",
  );
});

test("category visibility update preserves its printer route", () => {
  assert.deepEqual(buildCategoryVisibilityUpdate(category), {
    receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
    sortOrder: 7,
    isActive: false,
  });
  assert.deepEqual(
    buildCategoryVisibilityUpdate({ ...category, isActive: false }),
    {
      receiptPrinterId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      sortOrder: 7,
      isActive: true,
    },
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cafeFormSchema,
  categoryFormSchema,
} from "../src/widgets/catalog-manager/model/catalog-forms.ts";

const cafeId = "00000000-0000-4000-8000-000000000151";

test("validates cafe details and requires every new category to select a cafe", () => {
  assert.equal(
    cafeFormSchema.safeParse({
      name: "Burger House",
      description: "Бургеры из общей кухни",
      sortOrder: 10,
      isActive: true,
    }).success,
    true,
  );
  assert.equal(
    cafeFormSchema.safeParse({
      name: " ",
      description: "",
      sortOrder: 10,
      isActive: true,
    }).success,
    false,
  );

  const category = {
    name: "Бургеры",
    receiptPrinterId: "",
    sortOrder: 0,
    isActive: true,
  };
  assert.equal(categoryFormSchema.safeParse(category).success, false);
  assert.equal(
    categoryFormSchema.safeParse({ ...category, cafeId }).success,
    true,
  );
});

test("catalog UI exposes cafe CRUD, cafe filtering, images, and nested category assignment", async () => {
  const [manager, cafeSection, queries, actions] = await Promise.all([
    readFile(
      new URL(
        "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/catalog-manager/ui/cafe-catalog-section.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/entities/catalog/api/catalog-queries.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/features/catalog-management/api/use-catalog-actions.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(manager, /useAdminCafes/);
  assert.match(manager, /data-testid="catalog-cafe-filter"/);
  assert.match(manager, /registerCategory\("cafeId"\)/);
  assert.match(manager, /переносит категорию вместе со всеми блюдами/);
  assert.match(manager, /category\.cafe\.name/);
  assert.match(cafeSection, /data-testid="cafe-image"/);
  assert.match(cafeSection, /data-testid="catalog-cafe-open"/);
  assert.match(cafeSection, /actions\.deleteCafe/);
  assert.match(queries, /\/catalog\/admin\/cafes/);
  assert.match(queries, /search\.set\("cafeId", params\.cafeId\)/);
  assert.match(actions, /\/catalog\/cafes/);
});

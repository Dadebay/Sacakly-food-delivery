import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CATALOG_PRODUCT_PAGE_SIZE,
  catalogPageRange,
} from "../src/widgets/catalog-manager/model/catalog-pagination.ts";

test("calculates complete and final catalog page ranges", () => {
  assert.equal(CATALOG_PRODUCT_PAGE_SIZE, 40);
  assert.deepEqual(catalogPageRange(1, 40, 95), { start: 1, end: 40 });
  assert.deepEqual(catalogPageRange(2, 40, 95), { start: 41, end: 80 });
  assert.deepEqual(catalogPageRange(3, 40, 95), { start: 81, end: 95 });
  assert.deepEqual(catalogPageRange(1, 40, 0), { start: 0, end: 0 });
});

test("catalog wires delayed server pagination without replacing legacy queries", async () => {
  const [manager, queries, pagination] = await Promise.all([
    readFile(
      new URL(
        "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
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
        "../src/widgets/catalog-manager/ui/catalog-pagination.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(manager, /useAdminCategorySummaries\(\)/);
  assert.match(manager, /useAdminProductPage\(/);
  assert.match(manager, /catalogTab === "products"/);
  assert.match(manager, /useDebouncedCatalogSearch\(catalogSearch\)/);
  assert.match(queries, /\/catalog\/admin\/category-summaries/);
  assert.match(queries, /\/catalog\/admin\/products\/page\?/);
  assert.match(queries, /placeholderData: keepPreviousData/);
  assert.match(pagination, /data-testid="catalog-product-pagination"/);
  assert.match(pagination, /data-testid="catalog-product-previous-page"/);
  assert.match(pagination, /data-testid="catalog-product-next-page"/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  filterCatalogCategories,
  filterCatalogProducts,
  filterOrderableProducts,
  groupProductsByCategory,
} from "../src/entities/catalog/model/product-groups.ts";

function category({ id, name, sortOrder = 0, isActive = true }) {
  return {
    id,
    name,
    slug: `${id}-slug`,
    imageUrl: null,
    receiptPrinterIp: null,
    sortOrder,
    isActive,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    products: [],
  };
}

function product({
  id,
  category: productCategory,
  categoryId = productCategory?.id ?? "missing-category",
  name = id,
  slug = `${id}-slug`,
  description = `${id} description`,
  receiptPrinterIp = null,
  isActive = true,
  variants = [],
}) {
  return {
    id,
    categoryId,
    name,
    slug,
    description,
    pricingType: variants.length > 0 ? "VARIANT" : "FIXED",
    price: 10,
    minPrice: 10,
    hasVariants: variants.length > 0,
    variantLabel: variants.length > 0 ? "Ölçegi" : null,
    displayImageUrl: null,
    receiptPrinterIp,
    effectiveReceiptPrinterIp:
      receiptPrinterIp ?? productCategory?.receiptPrinterIp ?? null,
    isActive,
    sortOrder: 0,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    images: [],
    variants,
    ...(productCategory ? { category: productCategory } : {}),
  };
}

const hot = category({
  id: "hot",
  name: "Gyzgyn naharlar",
  sortOrder: 10,
});
const soups = category({ id: "soups", name: "Çorbalar", sortOrder: 20 });

test("groups products by category order and preserves API product order", () => {
  const soupOne = product({ id: "soup-1", category: soups });
  const hotOne = product({ id: "hot-1", category: hot });
  const soupTwo = product({ id: "soup-2", category: soups });

  const groups = groupProductsByCategory([soupOne, hotOne, soupTwo]);

  assert.deepEqual(
    groups.map(({ id, products }) => [
      id,
      products.map((groupedProduct) => groupedProduct.id),
    ]),
    [
      ["hot", ["hot-1"]],
      ["soups", ["soup-1", "soup-2"]],
    ],
  );
});

test("handles an empty menu without synthetic groups", () => {
  assert.deepEqual(groupProductsByCategory([]), []);
  assert.deepEqual(filterCatalogCategories([], "soup"), []);
  assert.deepEqual(filterCatalogProducts([], { query: "soup" }), []);
  assert.deepEqual(filterOrderableProducts([], { query: "soup" }), []);
});

test("breaks equal category sort orders by name deterministically", () => {
  const zCategory = category({ id: "z", name: "Z kategoriýa", sortOrder: 10 });
  const aCategory = category({ id: "a", name: "A kategoriýa", sortOrder: 10 });

  const groups = groupProductsByCategory([
    product({ id: "z-product", category: zCategory }),
    product({ id: "a-product", category: aCategory }),
  ]);

  assert.deepEqual(
    groups.map(({ id }) => id),
    ["a", "z"],
  );
});

test("keeps missing expanded category metadata in a safe final group", () => {
  const missing = product({
    id: "missing-product",
    categoryId: "orphan-category",
  });
  const regular = product({ id: "hot-product", category: hot });

  const groups = groupProductsByCategory([missing, regular]);

  assert.equal(groups.at(-1).id, "orphan-category");
  assert.equal(groups.at(-1).name, "Без категории");
  assert.equal(groups.at(-1).isActive, false);
  assert.equal(groups.at(-1).products[0], missing);
});

test("grouping preserves product identity, variants, and printer routing", () => {
  const variants = [{ id: "small", name: "Kiçi" }];
  const original = product({
    id: "variant-product",
    category: hot,
    receiptPrinterIp: "192.168.123.100",
    variants,
  });

  const grouped = groupProductsByCategory([original])[0].products[0];

  assert.equal(grouped, original);
  assert.equal(grouped.variants, variants);
  assert.equal(grouped.receiptPrinterIp, "192.168.123.100");
});

test("catalog category search is trimmed, case-insensitive, and keeps hidden categories", () => {
  const hiddenDrinks = category({
    id: "drinks",
    name: "Içgiler",
    isActive: false,
  });
  const categories = [hot, soups, hiddenDrinks];

  assert.deepEqual(filterCatalogCategories(categories, "  ÇORB  "), [soups]);
  assert.deepEqual(filterCatalogCategories(categories, "DRINKS-SLUG"), [
    hiddenDrinks,
  ]);
  assert.deepEqual(filterCatalogCategories(categories, "   "), categories);

  const routedSoups = { ...soups, receiptPrinterIp: "192.168.123.105" };
  assert.deepEqual(filterCatalogCategories([hot, routedSoups], "123.105"), [
    routedSoups,
  ]);
});

test("catalog search covers name, slug, description, printer IP, and category", () => {
  const searchable = product({
    id: "searchable",
    category: hot,
    name: "Palaw",
    slug: "toy-palaw",
    description: "Goýun etli baýram nahary",
    receiptPrinterIp: "192.168.123.100",
  });
  const other = product({ id: "other", category: soups, name: "Çorba" });
  const products = [searchable, other];

  for (const query of [
    "PALAW",
    "toy-palaw",
    "baýram",
    "192.168.123.100",
    "gyzgyn",
  ]) {
    assert.deepEqual(filterCatalogProducts(products, { query }), [searchable]);
  }
});

test("catalog category and text filters compose instead of replacing each other", () => {
  const hotSoupName = product({ id: "hot-soup", category: hot, name: "Çorba" });
  const soup = product({ id: "soup", category: soups, name: "Çorba" });
  const products = [hotSoupName, soup];

  assert.deepEqual(
    filterCatalogProducts(products, { categoryId: "hot", query: "çorba" }),
    [hotSoupName],
  );
  assert.deepEqual(
    filterCatalogProducts(products, { categoryId: "hot", query: "burger" }),
    [],
  );
});

test("catalog keeps hidden records available to administrators", () => {
  const hiddenCategory = category({
    id: "hidden-category",
    name: "Hidden",
    isActive: false,
  });
  const hiddenProduct = product({
    id: "hidden-product",
    category: hot,
    isActive: false,
  });
  const productInHiddenCategory = product({
    id: "hidden-category-product",
    category: hiddenCategory,
  });

  assert.deepEqual(
    filterCatalogProducts([hiddenProduct, productInHiddenCategory]),
    [hiddenProduct, productInHiddenCategory],
  );
});

test("phone order excludes hidden products and products from hidden categories", () => {
  const hiddenCategory = category({
    id: "hidden-category",
    name: "Hidden",
    isActive: false,
  });
  const active = product({ id: "active", category: hot });
  const hiddenProduct = product({
    id: "hidden-product",
    category: hot,
    isActive: false,
  });
  const hiddenCategoryProduct = product({
    id: "hidden-category-product",
    category: hiddenCategory,
  });
  const missingMetadata = product({ id: "missing-metadata" });
  const unavailableVariantProduct = product({
    id: "unavailable-variant-product",
    category: hot,
    variants: [{ id: "hidden-variant", isActive: false }],
  });

  assert.deepEqual(
    filterOrderableProducts([
      active,
      hiddenProduct,
      hiddenCategoryProduct,
      missingMetadata,
      unavailableVariantProduct,
    ]),
    [active, missingMetadata],
  );
});

test("phone order searches only order-entry fields and composes category filter", () => {
  const palaw = product({
    id: "palaw",
    category: hot,
    name: "Palaw",
    slug: "special-slug",
    description: "secret-description",
    receiptPrinterIp: "192.168.123.100",
  });
  const soup = product({ id: "soup", category: soups, name: "Palaw çorbasy" });
  const products = [palaw, soup];

  assert.deepEqual(filterOrderableProducts(products, { query: "  GYZGYN  " }), [
    palaw,
  ]);
  assert.deepEqual(
    filterOrderableProducts(products, {
      categoryId: "soups",
      query: "palaw",
    }),
    [soup],
  );
  for (const query of ["special-slug", "secret-description", "192.168"]) {
    assert.deepEqual(filterOrderableProducts(products, { query }), []);
  }
});

test("literal punctuation queries never behave like regular expressions", () => {
  const punctuated = product({
    id: "punctuated",
    category: hot,
    name: "Set [2+1]",
  });

  assert.deepEqual(filterCatalogProducts([punctuated], { query: "[2+1]" }), [
    punctuated,
  ]);
  assert.deepEqual(filterOrderableProducts([punctuated], { query: "[2+1]" }), [
    punctuated,
  ]);
  assert.deepEqual(filterCatalogProducts([punctuated], { query: ".*" }), []);
});

test("large menu keeps all 1,000 products in 50 ordered groups without duplicates", () => {
  const categories = Array.from({ length: 50 }, (_, index) =>
    category({
      id: `category-${index}`,
      name: `Category ${String(index).padStart(2, "0")}`,
      sortOrder: 49 - index,
    }),
  );
  const largeMenu = Array.from({ length: 1_000 }, (_, index) =>
    product({
      id: `product-${index}`,
      category: categories[index % categories.length],
    }),
  );

  const groups = groupProductsByCategory(largeMenu);
  const flattened = groups.flatMap((group) => group.products);

  assert.equal(groups.length, 50);
  assert.equal(flattened.length, 1_000);
  assert.equal(new Set(flattened.map(({ id }) => id)).size, 1_000);
  assert.deepEqual(
    groups.map(({ sortOrder }) => sortOrder),
    Array.from({ length: 50 }, (_, index) => index),
  );
  assert.ok(
    flattened.every((groupedProduct) => largeMenu.includes(groupedProduct)),
  );
});

test("catalog and phone order expose stable grouped navigation hooks", async () => {
  const [catalog, assisted, styles] = await Promise.all([
    readFile(
      new URL(
        "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/assisted-order/ui/assisted-order-dialog.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../src/app/styles/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(catalog, /data-testid="catalog-product-groups"/);
  assert.match(catalog, /catalog-product-group-\$\{group\.id\}/);
  assert.match(catalog, /catalog-product-group-toggle-\$\{group\.id\}/);
  assert.match(catalog, /catalog-product-group-panel-\$\{group\.id\}/);
  assert.match(catalog, /data-testid="catalog-product-groups-collapse"/);
  assert.match(catalog, /data-testid="catalog-product-groups-expand"/);
  assert.match(catalog, /aria-expanded=\{isExpanded\}/);
  assert.match(catalog, /useAdminProductPage/);
  assert.match(catalog, /<CatalogPagination/);
  assert.match(assisted, /data-testid="assisted-product-categories"/);
  assert.match(assisted, /data-testid="assisted-product-category-all"/);
  assert.match(assisted, /assisted-product-group-\$\{group\.id\}/);
  assert.match(assisted, /filterOrderableProducts/);
  assert.match(
    styles,
    /\.assisted-product-categories\s*\{[\s\S]*overflow-x: auto/,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*\.assisted-product-group article\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(styles, /\.catalog-product-group-toggle:focus-visible\s*\{/);
});

test("maintenance documentation records behavior matrix and worst-case QA", async () => {
  const documentation = await readFile(
    new URL("../../../docs/CATALOG_CATEGORY_GROUPING.md", import.meta.url),
    "utf8",
  );

  assert.match(documentation, /## Behavior matrix/);
  assert.match(documentation, /1,000 products across 50 categories/);
  assert.match(documentation, /## Manual QA checklist/);
  assert.match(documentation, /## Performance and maintenance limits/);
  assert.match(documentation, /npm audit --audit-level=low/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const managerUrl = new URL(
  "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
  import.meta.url,
);

test("catalog editor separates fixed prices from required variants", async () => {
  const manager = await readFile(managerUrl, "utf8");

  assert.match(manager, /data-testid="product-pricing-type"/);
  assert.match(manager, /watchedPricingType === "FIXED"/);
  assert.match(manager, /watchedPricingType === "VARIANT"/);
  assert.match(manager, /replaceProductVariants\(\[\]\)/);
  assert.match(manager, /values\.pricingType === "FIXED" \? \{ price:/);
  assert.match(manager, /values\.pricingType === "VARIANT" \? variants : \[\]/);
});

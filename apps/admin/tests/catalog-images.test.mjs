import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAddProductImages,
  MAX_PRODUCT_IMAGES,
} from "../src/entities/catalog/model/product-images.ts";

test("catalog image selection accepts up to the backend limit", () => {
  assert.equal(MAX_PRODUCT_IMAGES, 10);
  assert.equal(canAddProductImages(0, 10), true);
  assert.equal(canAddProductImages(7, 3), true);
  assert.equal(canAddProductImages(7, 4), false);
});

test("catalog image selection rejects invalid counts", () => {
  assert.equal(canAddProductImages(-1, 1), false);
  assert.equal(canAddProductImages(1, -1), false);
});

test("catalog editor configures generic variants with separate images", async () => {
  const source = await readFile(
    new URL(
      "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /useFieldArray/);
  assert.match(source, /data-testid="product-variant-add"/);
  assert.match(source, /variants\.\$\{index\}\.imageFiles/);
  assert.match(source, /values\.pricingType === "VARIANT"/);
  assert.match(source, /values\.variantLabel \|\| undefined/);
  assert.match(source, /variant\.imageUrls/);
});

test("catalog editor fields remain visually distinct from cream panels", async () => {
  const styles = await readFile(
    new URL("../src/app/styles/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /--catalog-canvas-surface:\s*color-mix\(/);
  assert.match(styles, /--catalog-field-surface:\s*var\(--field-surface\);/);
  assert.match(styles, /--catalog-field-border:\s*var\(--field-border\);/);
  assert.match(
    styles,
    /\.catalog-editor-modal \.form-grid input:not\(\[type="checkbox"\]\),[\s\S]*?background: var\(--catalog-field-surface\);/,
  );
  assert.match(
    styles,
    /\.catalog-editor-modal \.form-grid select:focus,[\s\S]*?border-color: var\(--brand-orange\);/,
  );
  assert.match(
    styles,
    /input\[type="file"\]::file-selector-button[\s\S]*?border: 1px solid var\(--brand-orange\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*?\.catalog-editor-modal \.form-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  );
});

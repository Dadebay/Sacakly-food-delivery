import assert from "node:assert/strict";
import test from "node:test";
import {
  ingredientEditorSchema,
  stockEntrySchema,
} from "../src/features/inventory-management/model/inventory-editor.ts";
import { stockDelta } from "../src/features/inventory-management/model/inventory-forms.ts";
const ingredient = {
  name: "Рис",
  unit: "GRAM",
  costPerUnit: "20,5",
  reorderPoint: "2,5",
};
test("purchase price per kg and threshold in kg convert to persisted grams", () => {
  assert.deepEqual(ingredientEditorSchema.parse(ingredient), {
    name: "Рис",
    unit: "GRAM",
    costPerUnit: 0.0205,
    reorderPoint: 2500,
  });
});
test("litres convert to ml and piece prices retain their units", () => {
  assert.equal(
    ingredientEditorSchema.parse({ ...ingredient, unit: "MILLILITER" })
      .costPerUnit,
    0.0205,
  );
  assert.equal(
    ingredientEditorSchema.parse({ ...ingredient, unit: "PIECE" }).costPerUnit,
    20.5,
  );
  assert.equal(
    ingredientEditorSchema.parse({ ...ingredient, unit: "PIECE" }).reorderPoint,
    2.5,
  );
});
test("reject invalid, negative, overflowing and unrepresentable purchase values", () => {
  for (const costPerUnit of [
    "-1",
    "NaN",
    "Infinity",
    "1e6",
    "1.2345",
    "0.000000000001",
    "1000000001",
    "",
  ])
    assert.equal(
      ingredientEditorSchema.safeParse({ ...ingredient, costPerUnit }).success,
      false,
      costPerUnit,
    );
  for (const reorderPoint of [
    "-1",
    "0.0000001",
    "0.000000000001",
    "100000.001",
  ])
    assert.equal(
      ingredientEditorSchema.safeParse({ ...ingredient, reorderPoint }).success,
      false,
      reorderPoint,
    );
  assert.equal(
    ingredientEditorSchema.parse({
      ...ingredient,
      costPerUnit: "0",
      reorderPoint: "0",
    }).costPerUnit,
    0,
  );
});
test("receipt and consumption use signed base units exactly once", () => {
  const base = { amount: "2,5", reason: "Накладная 123" };
  assert.equal(
    stockDelta(stockEntrySchema("GRAM").parse({ ...base, type: "RECEIPT" })),
    2500,
  );
  assert.equal(
    stockDelta(
      stockEntrySchema("MILLILITER").parse({ ...base, type: "WASTE" }),
    ),
    -2500,
  );
  assert.equal(
    stockDelta(
      stockEntrySchema("PIECE").parse({ ...base, type: "CONSUMPTION" }),
    ),
    -2.5,
  );
  assert.equal(
    stockDelta(
      stockEntrySchema("GRAM").parse({
        ...base,
        amount: "-0.000001",
        type: "ADJUSTMENT",
      }),
    ),
    -0.001,
  );
});
test("stock forms reject zero, negative receipt, missing reason, excessive precision and amount", () => {
  for (const patch of [
    { amount: "0" },
    { amount: "-1" },
    { amount: "0.0000001" },
    { amount: "100001" },
    { reason: " " },
  ])
    assert.equal(
      stockEntrySchema("GRAM").safeParse({
        amount: "1",
        type: "RECEIPT",
        reason: "Поставка",
        ...patch,
      }).success,
      false,
    );
});

import assert from "node:assert/strict";
import test from "node:test";
import { ingredientFormSchema, recipeFormSchema, stockAdjustmentFormSchema, stockDelta } from "../src/features/inventory-management/model/inventory-forms.ts";
import { inventorySummary, thresholdCoverage, formatInventoryQuantity } from "../src/entities/inventory/model/presentation.ts";

const ingredient = { name: "  Мука  ", unit: "GRAM", costPerUnit: "0,02", reorderPoint: "100" };
const id = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
test("ingredient quantities preserve decimal precision and reject missing/invalid values", () => {
  assert.deepEqual(ingredientFormSchema.parse(ingredient), { name: "Мука", unit: "GRAM", costPerUnit: 0.02, reorderPoint: 100 });
  for (const costPerUnit of ["", "foo", "NaN", "-1", "0.0000001"]) assert.equal(ingredientFormSchema.safeParse({ ...ingredient, costPerUnit }).success, false);
  assert.equal(ingredientFormSchema.safeParse({ ...ingredient, name: " " }).success, false);
});
test("recipes scale batches, permit milligrams, reject repeated ingredients and empty recipes", () => {
  const recipe = { productId: id, yieldQuantity: "2", ingredients: [{ ingredientId: id, quantity: "0,001" }] };
  assert.equal(recipeFormSchema.parse(recipe).ingredients[0].quantity, 0.001);
  for (const ingredients of [[], [...recipe.ingredients, ...recipe.ingredients]]) assert.equal(recipeFormSchema.safeParse({ ...recipe, ingredients }).success, false);
  assert.equal(recipeFormSchema.safeParse({ ...recipe, yieldQuantity: "0" }).success, false);
});
test("stock form derives the debit sign and requires a reason without accepting double negatives", () => {
  for (const type of ["CONSUMPTION", "WASTE"]) {
    const values = stockAdjustmentFormSchema.parse({ type, amount: "12,5", reason: "Приготовление" });
    assert.equal(stockDelta(values), -12.5);
    assert.equal(stockAdjustmentFormSchema.safeParse({ type, amount: "-12.5", reason: "Причина" }).success, false);
  }
  assert.equal(stockDelta(stockAdjustmentFormSchema.parse({ type: "RECEIPT", amount: "5", reason: "Приход" })), 5);
  assert.equal(stockDelta(stockAdjustmentFormSchema.parse({ type: "ADJUSTMENT", amount: "-5", reason: "Инвентаризация" })), -5);
  for (const amount of ["", "0", "0.0001"]) assert.equal(stockAdjustmentFormSchema.safeParse({ type: "WASTE", amount, reason: "Причина" }).success, false);
  assert.equal(stockAdjustmentFormSchema.safeParse({ type: "WASTE", amount: "5", reason: " " }).success, false);
});
test("availability charts count branch positions and never combine incompatible stock units", () => {
  const items = [{ status: "IN_STOCK", quantity: 250, reorderPoint: 100, unit: "GRAM" }, { status: "LOW_STOCK", quantity: 50, reorderPoint: 100, unit: "MILLILITER" }, { status: "OUT_OF_STOCK", quantity: 0, reorderPoint: 0, unit: "PIECE" }];
  assert.deepEqual(inventorySummary(items), { IN_STOCK: 1, LOW_STOCK: 1, OUT_OF_STOCK: 1 });
  assert.deepEqual(inventorySummary([]), { IN_STOCK: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 });
  assert.equal(thresholdCoverage(items[0]), 100); assert.equal(thresholdCoverage(items[1]), 50); assert.equal(thresholdCoverage(items[2]), null);
  assert.match(formatInventoryQuantity(0.001, "GRAM"), /0,001 г/);
});

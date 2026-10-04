import type { components } from "@sacakly/api-contract";

export type InventoryUnit =
  components["schemas"]["CreateIngredientDto"]["unit"];
export type InventoryMovementType = NonNullable<
  components["schemas"]["AdjustInventoryStockDto"]["type"]
>;
export type Ingredient =
  components["schemas"]["InventoryIngredientResponseDto"];
export type Recipe = components["schemas"]["InventoryRecipeResponseDto"];
export type StockItem = components["schemas"]["InventoryStockResponseDto"];
export type StockAlert = components["schemas"]["InventoryAlertResponseDto"];
export type CreateIngredient = components["schemas"]["CreateIngredientDto"];
export type UpsertRecipe = components["schemas"]["UpsertRecipeDto"];
export type AdjustStock = components["schemas"]["AdjustInventoryStockDto"];
export type InventoryMovement =
  components["schemas"]["InventoryMovementResponseDto"];

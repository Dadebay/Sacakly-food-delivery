import type { InventoryMovementType, InventoryUnit, StockItem } from "./types";
export const inventoryUnitLabels: Record<InventoryUnit, string> = {
  GRAM: "г",
  MILLILITER: "мл",
  PIECE: "шт",
};
export const inventoryStatusLabels: Record<StockItem["status"], string> = {
  IN_STOCK: "В наличии",
  LOW_STOCK: "Заканчивается",
  OUT_OF_STOCK: "Нет в наличии",
};
export const inventoryMovementLabels: Record<InventoryMovementType, string> = {
  RECEIPT: "Приход",
  CONSUMPTION: "Расход",
  WASTE: "Потери / списание",
  ADJUSTMENT: "Корректировка",
};
export function formatInventoryQuantity(value: number, unit: InventoryUnit) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} ${inventoryUnitLabels[unit]}`;
}
export function inventorySummary(items: StockItem[]) {
  const counts = { IN_STOCK: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}
// This is threshold coverage, never a sum of incompatible grams/ml/pieces.
export function thresholdCoverage(item: StockItem) {
  return item.reorderPoint > 0
    ? Math.min(100, (item.quantity / item.reorderPoint) * 100)
    : null;
}

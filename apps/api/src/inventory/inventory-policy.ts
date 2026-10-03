import { BadRequestException, ConflictException } from "@nestjs/common";
import { InventoryMovementType } from "../generated/prisma/client";

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export function getStockStatus(
  quantity: number,
  reorderPoint: number,
): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= reorderPoint) return "LOW_STOCK";
  return "IN_STOCK";
}

export function validateRecipeIngredientIds(
  ingredientIds: string[],
  hasIngredients: boolean,
) {
  if (!hasIngredients)
    throw new BadRequestException(
      "Recipe must contain at least one ingredient",
    );
  if (new Set(ingredientIds).size !== ingredientIds.length)
    throw new BadRequestException("Recipe ingredients must be unique");
}

export function validateStockMovement(
  type: InventoryMovementType,
  quantityDelta: number,
) {
  if (quantityDelta === 0)
    throw new BadRequestException("quantityDelta cannot be zero");
  if (type === InventoryMovementType.RECEIPT && quantityDelta < 0)
    throw new BadRequestException("Receipt quantity must be positive");
  if (
    (type === InventoryMovementType.CONSUMPTION ||
      type === InventoryMovementType.WASTE) &&
    quantityDelta > 0
  )
    throw new BadRequestException(
      "Consumption and waste quantity must be negative",
    );
}

export function nextStockQuantity(current: number, quantityDelta: number) {
  const next = current + quantityDelta;
  if (next < 0) throw new ConflictException("Stock cannot become negative");
  return next;
}

export function calculateRecipeCost(
  lines: Array<{ quantity: number; costPerUnit: number }>,
) {
  return lines.reduce(
    (total, line) => total + line.quantity * line.costPerUnit,
    0,
  );
}

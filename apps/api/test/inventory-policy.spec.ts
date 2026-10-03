import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { InventoryMovementType } from "../src/generated/prisma/client";
import { calculateRecipeCost, getStockStatus, nextStockQuantity, validateRecipeIngredientIds, validateStockMovement } from "../src/inventory/inventory-policy";

describe("inventory policy", () => {
  it("classifies stock at, below and above the reorder point", () => {
    expect(getStockStatus(0, 10)).toBe("OUT_OF_STOCK");
    expect(getStockStatus(10, 10)).toBe("LOW_STOCK");
    expect(getStockStatus(11, 10)).toBe("IN_STOCK");
  });

  it("accepts positive receipts and negative consumption", () => {
    expect(() => validateStockMovement(InventoryMovementType.RECEIPT, 100)).not.toThrow();
    expect(() => validateStockMovement(InventoryMovementType.CONSUMPTION, -100)).not.toThrow();
    expect(() => validateStockMovement(InventoryMovementType.WASTE, -1)).not.toThrow();
    expect(() => validateStockMovement(InventoryMovementType.ADJUSTMENT, -1)).not.toThrow();
  });

  it("rejects zero and directionally invalid movements", () => {
    expect(() => validateStockMovement(InventoryMovementType.ADJUSTMENT, 0)).toThrow(BadRequestException);
    expect(() => validateStockMovement(InventoryMovementType.RECEIPT, -1)).toThrow(BadRequestException);
    expect(() => validateStockMovement(InventoryMovementType.WASTE, 1)).toThrow(BadRequestException);
  });

  it("prevents negative stock", () => {
    expect(nextStockQuantity(10, -10)).toBe(0);
    expect(() => nextStockQuantity(10, -11)).toThrow(ConflictException);
  });

  it("calculates recipe cost from normalized quantities and unit costs", () => {
    expect(calculateRecipeCost([{ quantity: 100, costPerUnit: 0.02 }, { quantity: 50, costPerUnit: 0.001 }])).toBeCloseTo(2.05, 6);
    expect(calculateRecipeCost([])).toBe(0);
  });

  it("requires a non-empty recipe with unique ingredients", () => {
    expect(() => validateRecipeIngredientIds([], false)).toThrow(BadRequestException);
    expect(() => validateRecipeIngredientIds(["a", "a"], true)).toThrow(BadRequestException);
    expect(() => validateRecipeIngredientIds(["a", "b"], true)).not.toThrow();
  });
});

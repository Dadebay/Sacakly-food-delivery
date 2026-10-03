import { z } from "zod";
import type { InventoryUnit } from "@/src/entities/inventory";
import {
  ingredientFormSchema,
  stockAdjustmentFormSchema,
} from "./inventory-forms.ts";

export const inventoryPurchaseUnits: Record<
  InventoryUnit,
  { label: string; factor: number }
> = {
  GRAM: { label: "кг", factor: 1000 },
  MILLILITER: { label: "л", factor: 1000 },
  PIECE: { label: "шт", factor: 1 },
};
function numericText(label: string) {
  return z
    .string()
    .trim()
    .regex(/^[-+]?\d+(?:[.,]\d+)?$/, label)
    .transform((value) => Number(value.replace(",", ".")))
    .pipe(z.number().finite());
}
function precise(value: number, digits: number) {
  const scaled = value * 10 ** digits;
  // Floating-point tolerance must never turn a positive price/quantity into zero.
  return (
    Number.isFinite(scaled) &&
    (scaled === 0 || Math.round(scaled) !== 0) &&
    Math.abs(scaled - Math.round(scaled)) < 0.00001
  );
}
export const ingredientEditorSchema = z
  .object({
    name: z.string().trim().min(1, "Укажите название").max(160),
    unit: z.enum(["GRAM", "MILLILITER", "PIECE"]),
    costPerUnit: numericText("Укажите цену").pipe(
      z.number().nonnegative("Цена не может быть отрицательной"),
    ),
    reorderPoint: numericText("Укажите минимальный запас").pipe(
      z.number().nonnegative("Запас не может быть отрицательным"),
    ),
  })
  .superRefine((value, context) => {
    const factor = inventoryPurchaseUnits[value.unit].factor;
    if (!precise(value.costPerUnit / factor, 6))
      context.addIssue({
        code: "custom",
        path: ["costPerUnit"],
        message:
          factor === 1
            ? "Не более 6 знаков после запятой"
            : "Не более 3 знаков после запятой",
      });
    if (!precise(value.reorderPoint * factor, 3))
      context.addIssue({
        code: "custom",
        path: ["reorderPoint"],
        message:
          factor === 1
            ? "Не более 3 знаков после запятой"
            : "Не более 6 знаков после запятой",
      });
  })
  .transform((value) => {
    const factor = inventoryPurchaseUnits[value.unit].factor;
    return {
      ...value,
      costPerUnit: (value.costPerUnit / factor).toFixed(6),
      reorderPoint: (value.reorderPoint * factor).toFixed(3),
    };
  })
  .pipe(ingredientFormSchema);

export function stockEntrySchema(unit: InventoryUnit) {
  const factor = inventoryPurchaseUnits[unit].factor;
  return z
    .object({
      amount: numericText("Укажите количество").refine(
        (value) => precise(value * factor, 3),
        factor === 1
          ? "Не более 3 знаков после запятой"
          : "Не более 6 знаков после запятой",
      ),
      type: z.enum(["RECEIPT", "CONSUMPTION", "WASTE", "ADJUSTMENT"]),
      reason: z.string(),
    })
    .transform((value) => ({
      ...value,
      amount: (value.amount * factor).toFixed(3),
    }))
    .pipe(stockAdjustmentFormSchema);
}
export type IngredientEditorInput = z.input<typeof ingredientEditorSchema>;
export type IngredientEditorValues = z.output<typeof ingredientEditorSchema>;
export type StockEntryInput = z.input<ReturnType<typeof stockEntrySchema>>;

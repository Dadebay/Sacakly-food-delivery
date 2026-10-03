import { z } from "zod";

function decimal(min: number, precision: number) {
  return z
    .string()
    .trim()
    .min(1, "Укажите количество")
    .regex(/^[-+]?\d+(?:[.,]\d+)?$/, "Введите число")
    .transform((value) => Number(value.replace(",", ".")))
    .pipe(
      z
        .number()
        .min(min, `Минимум: ${min}`)
        .max(100_000_000, "Слишком большое значение"),
    )
    .refine(
      (value) =>
        Math.abs(
          value * 10 ** precision - Math.round(value * 10 ** precision),
        ) < 0.00001,
      `Не более ${precision} знаков после запятой`,
    );
}

export const ingredientFormSchema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(160),
  unit: z.enum(["GRAM", "MILLILITER", "PIECE"]),
  costPerUnit: decimal(0, 6).refine(
    (value) => value <= 999999.999999,
    "Цена слишком большая",
  ),
  reorderPoint: decimal(0, 3),
});
export const recipeFormSchema = z
  .object({
    productId: z.uuid("Выберите блюдо"),
    yieldQuantity: decimal(0.001, 3),
    ingredients: z
      .array(
        z.object({
          ingredientId: z.uuid("Выберите ингредиент"),
          quantity: decimal(0.001, 3),
        }),
      )
      .min(1, "Добавьте ингредиенты")
      .max(100),
  })
  .refine(
    (value) =>
      new Set(value.ingredients.map((line) => line.ingredientId)).size ===
      value.ingredients.length,
    { message: "Ингредиенты не должны повторяться", path: ["ingredients"] },
  );

export const stockAdjustmentFormSchema = z
  .object({
    amount: decimal(-100_000_000, 3).refine(
      (value) => value !== 0,
      "Количество не может быть нулём",
    ),
    type: z.enum(["RECEIPT", "CONSUMPTION", "WASTE", "ADJUSTMENT"]),
    reason: z.string().trim().min(1, "Укажите причину операции").max(300),
  })
  .refine((value) => value.type === "ADJUSTMENT" || value.amount > 0, {
    message: "Введите положительное количество — расход спишется автоматически",
    path: ["amount"],
  });

export type IngredientFormInput = z.input<typeof ingredientFormSchema>;
export type IngredientFormValues = z.output<typeof ingredientFormSchema>;
export type RecipeFormInput = z.input<typeof recipeFormSchema>;
export type RecipeFormValues = z.output<typeof recipeFormSchema>;
export type StockAdjustmentFormInput = z.input<
  typeof stockAdjustmentFormSchema
>;
export type StockAdjustmentFormValues = z.output<
  typeof stockAdjustmentFormSchema
>;

export function stockDelta(values: StockAdjustmentFormValues) {
  return values.type === "CONSUMPTION" || values.type === "WASTE"
    ? -values.amount
    : values.amount;
}

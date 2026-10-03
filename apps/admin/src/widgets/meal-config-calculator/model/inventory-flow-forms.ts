import { z } from "zod";

const positive = z
  .string()
  .trim()
  .regex(
    /^\d+(?:[.,]\d{1,3})?$/,
    "Введите положительное число, не более 3 знаков после запятой",
  )
  .refine(
    (value) => Number(value.replace(",", ".")) > 0,
    "Количество должно быть больше нуля",
  );
const nonnegative = z
  .string()
  .trim()
  .regex(
    /^\d+(?:[.,]\d{1,3})?$/,
    "Введите число, не более 3 знаков после запятой",
  );
const money = z
  .string()
  .trim()
  .regex(
    /^\d+(?:[.,]\d{1,6})?$/,
    "Введите цену, не более 6 знаков после запятой",
  );

export const locationFormSchema = z.object({
  code: z.string().trim().min(1, "Укажите код").max(60),
  name: z.string().trim().min(1, "Укажите название").max(160),
});

export const productLinkFormSchema = z
  .object({
    productId: z.uuid("Выберите товар"),
    variantId: z.string(),
    ingredientId: z.string(),
    quantity: z.string(),
  })
  .superRefine((value, context) => {
    if (value.ingredientId && !z.uuid().safeParse(value.ingredientId).success)
      context.addIssue({
        code: "custom",
        path: ["ingredientId"],
        message: "Выберите складскую позицию",
      });
    if (value.ingredientId && !positive.safeParse(value.quantity).success)
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Укажите количество на одну продажу",
      });
  });

export const flowDocumentFormSchema = z
  .object({
    kind: z.enum(["RECEIPT", "TRANSFER", "PROCESS", "WASTE", "STOCKTAKE"]),
    ingredientId: z.string(),
    lotId: z.string(),
    locationId: z.string(),
    toLocationId: z.string(),
    outputIngredientId: z.string(),
    outputLotCode: z.string(),
    lotCode: z.string(),
    quantity: z.string(),
    outputQuantity: z.string(),
    wasteQuantity: z.string(),
    unitCost: z.string(),
    reason: z.string().trim().min(3, "Укажите основание операции").max(300),
  })
  .superRefine((value, context) => {
    const issue = (field: keyof typeof value, message: string) =>
      context.addIssue({ code: "custom", path: [field], message });
    if (value.kind === "RECEIPT") {
      if (!value.ingredientId) issue("ingredientId", "Выберите позицию");
      if (!value.locationId) issue("locationId", "Выберите место");
      if (!value.lotCode.trim()) issue("lotCode", "Укажите партию поставщика");
      if (!positive.safeParse(value.quantity).success)
        issue("quantity", "Укажите количество в базовых единицах");
      if (!money.safeParse(value.unitCost).success)
        issue("unitCost", "Укажите цену за базовую единицу");
    } else {
      if (!value.lotId) issue("lotId", "Выберите партию");
      if (!value.locationId) issue("locationId", "Выберите место");
      if (value.kind === "STOCKTAKE") {
        if (!nonnegative.safeParse(value.quantity).success)
          issue("quantity", "Укажите пересчитанный остаток");
      } else if (!positive.safeParse(value.quantity).success)
        issue("quantity", "Укажите количество");
      if (value.kind === "TRANSFER" && !value.toLocationId)
        issue("toLocationId", "Выберите место получения");
      if (value.kind === "PROCESS") {
        if (!value.outputIngredientId)
          issue("outputIngredientId", "Выберите результат обработки");
        if (!value.outputLotCode.trim())
          issue("outputLotCode", "Укажите код новой партии");
        if (!positive.safeParse(value.outputQuantity).success)
          issue("outputQuantity", "Укажите фактический выход");
        if (!nonnegative.safeParse(value.wasteQuantity).success)
          issue("wasteQuantity", "Укажите измеренные отходы, включая ноль");
      }
    }
  });

export type LocationForm = z.infer<typeof locationFormSchema>;
export type ProductLinkForm = z.infer<typeof productLinkFormSchema>;
export type FlowDocumentForm = z.infer<typeof flowDocumentFormSchema>;
export const parseDecimal = (value: string) => Number(value.replace(",", "."));

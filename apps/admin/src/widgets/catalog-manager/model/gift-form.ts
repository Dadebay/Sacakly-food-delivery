import { z } from "zod";

export const giftFormSchema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(160),
  description: z.string().trim().max(4000),
  pointsCost: z.number({ error: "Укажите стоимость" }).int().min(1).max(1_000_000),
  stock: z.string().trim().refine((value) => value === "" || /^\d+$/.test(value), "Укажите целое число или оставьте поле пустым").transform((value) => value === "" ? null : Number(value)).refine((value) => value === null || Number.isSafeInteger(value), "Слишком большой остаток"),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export type GiftFormInput = z.input<typeof giftFormSchema>;
export type GiftFormValues = z.output<typeof giftFormSchema>;

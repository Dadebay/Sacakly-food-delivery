import { z } from "zod";

export const orderCompleteFormSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(20, "Опишите причину подробно: минимум 20 символов")
    .max(500, "Максимум 500 символов"),
  cashReceived: z
    .boolean()
    .refine((value) => value, "Подтвердите доставку и получение всей суммы"),
  courierId: z.string().uuid("Выберите курьера"),
});

export type OrderCompleteFormValues = z.infer<typeof orderCompleteFormSchema>;

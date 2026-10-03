import { z } from "zod";
import { optionalText } from "@/src/shared/forms";

export const orderAdminEditFormSchema = z.object({
  deliveryEtrapId: z
    .string()
    .trim()
    .regex(/^\d+$/, "Выберите район доставки")
    .transform(Number)
    .pipe(z.number().int().positive()),
  address: z.string().trim().min(1, "Укажите адрес").max(500),
  entrance: optionalText(40),
  floor: optionalText(20),
  apartment: optionalText(20),
  customerNote: optionalText(500),
  courierId: optionalText(36),
});

export type OrderAdminEditFormInput = z.input<typeof orderAdminEditFormSchema>;
export type OrderAdminEditFormValues = z.output<
  typeof orderAdminEditFormSchema
>;

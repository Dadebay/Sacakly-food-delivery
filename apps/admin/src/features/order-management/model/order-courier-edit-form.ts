import { z } from "zod";

export const orderCourierEditFormSchema = z.object({
  courierId: z.uuid("Выберите доступного курьера"),
});

export type OrderCourierEditFormValues = z.infer<
  typeof orderCourierEditFormSchema
>;

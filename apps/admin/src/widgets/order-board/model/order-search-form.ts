import { z } from "zod";

export const orderSearchFormSchema = z.object({
  search: z.string().trim().max(200, "Не больше 200 символов"),
});

export type OrderSearchFormValues = z.infer<typeof orderSearchFormSchema>;

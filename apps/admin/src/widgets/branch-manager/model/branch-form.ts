import { z } from "zod";
import { optionalTurkmenPhoneSchema } from "../../../shared/forms/schema.ts";

export const branchFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите название филиала")
    .max(160, "Не больше 160 символов"),
  phone: optionalTurkmenPhoneSchema,
  address: z
    .string()
    .trim()
    .min(1, "Укажите адрес")
    .max(500, "Не больше 500 символов"),
  isActive: z.boolean(),
  isPrimary: z.boolean(),
});

export type BranchFormInput = z.input<typeof branchFormSchema>;
export type BranchFormValues = z.output<typeof branchFormSchema>;

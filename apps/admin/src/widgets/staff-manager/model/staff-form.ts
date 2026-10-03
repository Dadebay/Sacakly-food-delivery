import { z } from "zod";
import {
  optionalText,
  turkmenPhoneSchema,
} from "../../../shared/forms/schema.ts";

export const staffRoles = [
  "OPERATOR",
  "COOK",
  "COURIER",
  "ACCOUNTANT",
  "ADMIN",
  "SUPER_ADMIN",
] as const;

export const staffFormSchema = z.object({
  phone: turkmenPhoneSchema,
  firstName: optionalText(80),
  lastName: optionalText(80),
  role: z.enum(staffRoles),
  isActive: z.boolean(),
});

export type StaffFormInput = z.input<typeof staffFormSchema>;
export type StaffFormValues = z.output<typeof staffFormSchema>;

import { z } from "zod";
import { turkmenPhoneSchema } from "../../../shared/forms/schema.ts";

export const otpRequestSchema = z.object({
  phone: turkmenPhoneSchema,
  code: z.string(),
});

export const otpVerifySchema = otpRequestSchema.extend({
  code: z
    .string()
    .regex(/^(?:\d{4}|\d{6})$/, "Введите 4 или 6 цифр кода"),
});

export type OtpLoginFormValues = z.infer<typeof otpRequestSchema>;

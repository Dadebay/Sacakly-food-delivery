import { z } from "zod";
import {
  dateRangeIsValid,
  optionalLocalDateTimeSchema,
  optionalText,
} from "../../../shared/forms/schema.ts";

export const bannerFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Укажите заголовок")
      .max(160, "Не больше 160 символов"),
    subtitle: optionalText(300),
    link: optionalText(1000),
    sortOrder: z.number({ error: "Укажите порядок" }).int("Введите целое число"),
    startsAt: optionalLocalDateTimeSchema,
    endsAt: optionalLocalDateTimeSchema,
    isActive: z.boolean(),
    image: z.unknown().optional(),
  })
  .refine((value) => dateRangeIsValid(value.startsAt, value.endsAt), {
    path: ["endsAt"],
    message: "Окончание должно быть позже начала",
  });

export const promoFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Укажите промокод")
      .max(40, "Не больше 40 символов")
      .transform((value) => value.toUpperCase()),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z
      .number({ error: "Укажите размер скидки" })
      .min(0, "Скидка не может быть отрицательной")
      .multipleOf(0.01, "Не больше двух знаков после запятой"),
    minOrderAmount: z
      .number({ error: "Введите число" })
      .min(0, "Сумма не может быть отрицательной")
      .multipleOf(0.01, "Не больше двух знаков после запятой")
      .optional(),
    maxDiscountAmount: z
      .number({ error: "Введите число" })
      .min(0, "Сумма не может быть отрицательной")
      .multipleOf(0.01, "Не больше двух знаков после запятой")
      .optional(),
    totalUsageLimit: z
      .number({ error: "Введите число" })
      .int("Введите целое число")
      .min(1, "Минимум 1")
      .optional(),
    perUserLimit: z
      .number({ error: "Укажите лимит" })
      .int("Введите целое число")
      .min(1, "Минимум 1"),
    startsAt: optionalLocalDateTimeSchema,
    endsAt: optionalLocalDateTimeSchema,
    isActive: z.boolean(),
  })
  .refine((value) => dateRangeIsValid(value.startsAt, value.endsAt), {
    path: ["endsAt"],
    message: "Окончание должно быть позже начала",
  });

export type BannerFormInput = z.input<typeof bannerFormSchema>;
export type BannerFormValues = z.output<typeof bannerFormSchema>;
export type PromoFormInput = z.input<typeof promoFormSchema>;
export type PromoFormValues = z.output<typeof promoFormSchema>;

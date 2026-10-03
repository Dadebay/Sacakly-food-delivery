import { z } from "zod";

export const notificationFormSchema = z.object({
  audience: z
    .enum(["ALL_CUSTOMERS", "ALL_APP_INSTALLATIONS"])
    .default("ALL_CUSTOMERS"),
  title: z
    .string()
    .trim()
    .min(1, "Укажите заголовок")
    .max(160, "Не больше 160 символов"),
  body: z
    .string()
    .trim()
    .min(1, "Напишите текст уведомления")
    .max(1000, "Не больше 1000 символов"),
  deepLink: z
    .string()
    .trim()
    .max(500, "Не больше 500 символов")
    .refine(
      (value) => !value || /^\/(?![\\/])[^\\\s]*$/.test(value),
      "Укажите внутренний путь, например /orders/current",
    )
    .transform((value) => value || undefined),
});

export type NotificationFormInput = z.input<typeof notificationFormSchema>;
export type NotificationFormValues = z.output<typeof notificationFormSchema>;

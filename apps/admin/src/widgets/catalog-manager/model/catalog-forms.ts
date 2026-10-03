import { z } from "zod";

export const receiptPrinterIpSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.ipv4().safeParse(value).success,
    "Введите IPv4 адрес, например 192.168.1.50",
  )
  .refine(
    (value) =>
      value === "" ||
      /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(value),
    "Укажите локальный IP аппарата, например 192.168.1.50",
  );

export const cafeFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите название кафе")
    .max(120, "Не больше 120 символов"),
  description: z.string().trim().max(1000, "Не больше 1000 символов"),
  sortOrder: z.number({ error: "Укажите порядок" }).int("Введите целое число"),
  isActive: z.boolean(),
  image: z.unknown().optional(),
});

export const categoryFormSchema = z.object({
  cafeId: z.uuid("Выберите кафе"),
  name: z
    .string()
    .trim()
    .min(1, "Укажите название категории")
    .max(100, "Не больше 100 символов"),
  receiptPrinterId: z.union([z.literal(""), z.uuid("Выберите аппарат")]),
  sortOrder: z.number({ error: "Укажите порядок" }).int("Введите целое число"),
  isActive: z.boolean(),
  image: z.unknown().optional(),
});

const productVariantSchema = z.object({
  id: z.uuid().optional(),
  name: z
    .string()
    .trim()
    .min(1, "Укажите название варианта")
    .max(120, "Не больше 120 символов"),
  description: z.string().trim().max(300, "Не больше 300 символов"),
  price: z
    .number({ error: "Укажите цену варианта" })
    .min(0, "Цена не может быть отрицательной")
    .multipleOf(0.01, "Не больше двух знаков после запятой"),
  sortOrder: z.number({ error: "Укажите порядок" }).int("Введите целое число"),
  isActive: z.boolean(),
  imageUrls: z.array(z.string()).max(10),
  imageFiles: z.unknown().optional(),
});

export const receiptPrintSettingsFormSchema = z.object({
  mainPrinterId: z.union([z.literal(""), z.uuid("Выберите аппарат")]),
  mainCopies: z.number().int().min(1).max(3),
});

export const orderingHoursFormSchema = z
  .object({
    enabled: z.boolean(),
    opensAt: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Введите время открытия"),
    closesAt: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Введите время закрытия"),
    version: z.number().int().min(0),
  })
  .refine((value) => !value.enabled || value.opensAt !== value.closesAt, {
    path: ["closesAt"],
    message: "Время открытия и закрытия должны различаться",
  });

export const categoryReceiptRouteFormSchema = z.object({
  receiptPrinterId: z.union([z.literal(""), z.uuid("Выберите аппарат")]),
});

export const receiptPrinterFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите название аппарата")
    .max(100, "Не больше 100 символов"),
  ipAddress: receiptPrinterIpSchema.refine(
    (value) => value !== "",
    "Укажите IP-адрес аппарата",
  ),
  port: z
    .number({ error: "Укажите порт" })
    .int("Введите целое число")
    .min(1, "Порт должен быть от 1 до 65535")
    .max(65535, "Порт должен быть от 1 до 65535"),
  transport: z.enum(["RAW_TCP", "JSPEED_HTTP"]),
  isActive: z.boolean(),
});

export const productFormSchema = z
  .object({
    categoryId: z.uuid("Выберите категорию"),
    name: z
      .string()
      .trim()
      .min(1, "Укажите название блюда")
      .max(160, "Не больше 160 символов"),
    description: z
      .string()
      .trim()
      .min(1, "Добавьте описание")
      .max(4000, "Не больше 4000 символов"),
    pricingType: z.enum(["FIXED", "VARIANT"]),
    price: z
      .number({ error: "Укажите цену" })
      .min(0, "Цена не может быть отрицательной")
      .multipleOf(0.01, "Не больше двух знаков после запятой"),
    receiptPrinterId: z.union([z.literal(""), z.uuid("Выберите аппарат")]),
    preparationMinutes: z.number().int().min(0).max(1440),
    loyaltyPoints: z.number().int().min(1).max(100000),
    variantLabel: z.string().trim().max(80, "Не больше 80 символов"),
    variants: z.array(productVariantSchema).max(30, "Не больше 30 вариантов"),
    sortOrder: z
      .number({ error: "Укажите порядок" })
      .int("Введите целое число"),
    isActive: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.pricingType === "FIXED" && values.variants.length) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Для блюда с одной ценой удалите варианты",
      });
    }
    if (values.pricingType === "VARIANT" && !values.variants.length) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Добавьте хотя бы один вариант блюда",
      });
    }
    if (values.pricingType === "VARIANT" && !values.variantLabel) {
      context.addIssue({
        code: "custom",
        path: ["variantLabel"],
        message: "Укажите название выбора: например, Размер",
      });
    }
    if (
      values.pricingType === "VARIANT" &&
      !values.variants.some(({ isActive }) => isActive)
    ) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Оставьте в продаже хотя бы один вариант",
      });
    }
    const names = values.variants.map(({ name }) =>
      name.trim().toLocaleLowerCase("ru-RU"),
    );
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Названия вариантов не должны повторяться",
      });
    }
  });

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
export type CafeFormValues = z.infer<typeof cafeFormSchema>;
export type ProductFormValues = z.infer<typeof productFormSchema>;
export type ReceiptPrintSettingsFormValues = z.infer<
  typeof receiptPrintSettingsFormSchema
>;
export type CategoryReceiptRouteFormValues = z.infer<
  typeof categoryReceiptRouteFormSchema
>;
export type ReceiptPrinterFormValues = z.infer<typeof receiptPrinterFormSchema>;

import { z } from "zod";

const moneyInput = z
  .string()
  .trim()
  .min(1, "Укажите сумму")
  .refine(
    (value) => /^\d+(?:[.,]\d{1,2})?$/.test(value),
    "Укажите сумму с точностью до 2 знаков",
  )
  .transform((value) => Number(value.replace(",", ".")))
  .refine((value) => value <= 1_000_000, "Сумма слишком большая");

const optionalMoneyInput = z
  .string()
  .trim()
  .refine(
    (value) => !value || /^\d+(?:[.,]\d{1,2})?$/.test(value),
    "Укажите сумму с точностью до 2 знаков",
  )
  .transform((value) => (value ? Number(value.replace(",", ".")) : null))
  .refine(
    (value) => value === null || value <= 1_000_000,
    "Сумма слишком большая",
  );

const requiredName = (maxLength: number) =>
  z
    .string()
    .trim()
    .min(1, "Укажите название")
    .max(maxLength, `Не более ${maxLength} символов`);

const optionalName = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength, `Не более ${maxLength} символов`)
    .transform((value) => value || null);

const integerInput = z
  .string()
  .trim()
  .regex(/^\d+$/, "Укажите целое число")
  .transform(Number);

const optionalIntegerInput = z
  .string()
  .trim()
  .refine((value) => !value || /^\d+$/.test(value), "Укажите целое число")
  .transform((value) => (value ? Number(value) : null));

const kilometerPriceInput = moneyInput
  .refine((value) => value > 0, "Цена должна быть больше нуля")
  .refine((value) => value <= 10_000, "Цена не должна превышать 10 000 TMT");

export const deliverySettingsFormSchema = z
  .object({
    version: z.number().int().positive().optional(),
    mapPricingEnabled: z.boolean(),
    distancePricingEnabled: z.boolean(),
    dayPricePerKilometer: kilometerPriceInput,
    nightPricePerKilometer: kilometerPriceInput,
    distancePriceTiers: z
      .array(
        z.object({
          afterKilometers: z
            .string()
            .trim()
            .regex(
              /^\d+(?:[.,]\d{1,2})?$/,
              "Укажите расстояние с точностью до 2 знаков",
            )
            .transform((value) => Number(value.replace(",", ".")))
            .refine(
              (value) => value > 0 && value <= 10_000,
              "Расстояние должно быть от 0,01 до 10 000 км",
            ),
          dayPricePerKilometer: kilometerPriceInput,
          nightPricePerKilometer: kilometerPriceInput,
        }),
      )
      .max(20, "Можно добавить не более 20 ступеней")
      .default([]),
    fallbackPrice: moneyInput,
    fallbackNightPrice: moneyInput.optional(),
    fallbackNightFreeDeliveryThreshold: optionalMoneyInput.optional(),
    fallbackFreeDeliveryThreshold: optionalMoneyInput,
  })
  .superRefine((value, ctx) => {
    value.distancePriceTiers.forEach((tier, index) => {
      if (
        index > 0 &&
        tier.afterKilometers <=
          value.distancePriceTiers[index - 1].afterKilometers
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["distancePriceTiers", index, "afterKilometers"],
          message: "Каждый следующий порог должен быть больше предыдущего",
        });
      }
    });
  });

export const deliveryEtrapFormSchema = z.object({
  welayatId: integerInput,
  nameEn: optionalName(240),
  nameRu: requiredName(240),
  nameTk: requiredName(240),
  queuePosition: optionalIntegerInput,
  price: moneyInput,
  nightPrice: moneyInput.optional(),
  nightFreeDeliveryThreshold: optionalMoneyInput.optional(),
  freeDeliveryThreshold: optionalMoneyInput,
  isDeliveryEnabled: z.boolean(),
});

export const deliveryWelayatFormSchema = z.object({
  nameEn: optionalName(160),
  nameRu: requiredName(160),
  nameTk: requiredName(160),
  sortOrder: integerInput,
});

export type DeliverySettingsFormInput = z.input<
  typeof deliverySettingsFormSchema
>;
export type DeliverySettingsFormValues = z.output<
  typeof deliverySettingsFormSchema
>;
export type DeliveryEtrapFormInput = z.input<typeof deliveryEtrapFormSchema>;
export type DeliveryEtrapFormValues = z.output<typeof deliveryEtrapFormSchema>;
export type DeliveryWelayatFormInput = z.input<
  typeof deliveryWelayatFormSchema
>;
export type DeliveryWelayatFormValues = z.output<
  typeof deliveryWelayatFormSchema
>;

const clockInput = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время в формате ЧЧ:ММ");
export const deliveryNightScheduleSchema = z
  .object({
    version: z.number().int().min(1),
    nightTariffEnabled: z.boolean(),
    nightStartsAt: clockInput,
    nightEndsAt: clockInput,
  })
  .refine((value) => value.nightStartsAt !== value.nightEndsAt, {
    path: ["nightEndsAt"],
    message: "Начало и конец ночного тарифа должны различаться",
  });
export type DeliveryNightScheduleValues = z.infer<
  typeof deliveryNightScheduleSchema
>;

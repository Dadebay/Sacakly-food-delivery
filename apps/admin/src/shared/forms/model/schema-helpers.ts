import { z } from "zod";

export const slugSchema = z
  .string()
  .trim()
  .min(1, "Укажите slug")
  .regex(/^[a-z0-9-]+$/, "Используйте латинские буквы, цифры и дефисы");

const normalizedTurkmenPhoneSchema = z
  .string()
  .regex(/^\+993\d{8}$/, "Введите номер в формате +99365123456");

function normalizePhone(value: string) {
  return value.replace(/[\s()-]/g, "");
}

export const turkmenPhoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .pipe(normalizedTurkmenPhoneSchema);

export const optionalTurkmenPhoneSchema = z
  .string()
  .trim()
  .transform((value) => (value ? normalizePhone(value) : undefined))
  .pipe(z.union([normalizedTurkmenPhoneSchema, z.undefined()]));

export function optionalText(maximum: number) {
  return z
    .string()
    .trim()
    .max(maximum, `Не больше ${maximum} символов`)
    .transform((value) => value || undefined);
}

export const optionalLocalDateTimeSchema = z
  .string()
  .trim()
  .refine(
    (value) => !value || !Number.isNaN(new Date(value).getTime()),
    "Укажите корректную дату",
  )
  .transform((value) => value || undefined);

export function toIsoDateTime(value: string | undefined) {
  return value ? new Date(value).toISOString() : undefined;
}

export function dateRangeIsValid(
  startsAt: string | undefined,
  endsAt: string | undefined,
) {
  return !startsAt || !endsAt || new Date(endsAt) >= new Date(startsAt);
}

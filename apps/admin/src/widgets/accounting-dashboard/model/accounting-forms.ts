import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Выберите дату");
export const accountingMonthSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Выберите месяц") });
export function accountingMonthRange(month: string) {
  const parsed = accountingMonthSchema.parse({ month }).month;
  const [year, index] = parsed.split("-").map(Number);
  const last = new Date(Date.UTC(year!, index!, 0)).getUTCDate();
  return { fromDate: `${parsed}-01`, toDate: `${parsed}-${last}` };
}

export const accountingRangeSchema = z
  .object({ fromDate: date, toDate: date })
  .refine(({ fromDate, toDate }) => fromDate <= toDate, {
    path: ["toDate"],
    message: "Конец периода не может быть раньше начала",
  });

export const accountingSettingsSchema = z
  .object({
    firstShiftName: z.string().trim().min(1, "Укажите название").max(80),
    firstShiftStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    secondShiftName: z.string().trim().min(1, "Укажите название").max(80),
    secondShiftStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine(
    ({ firstShiftStart, secondShiftStart }) =>
      firstShiftStart < secondShiftStart,
    { path: ["secondShiftStart"], message: "Должно быть позже первой смены" },
  );

export const cashHandoffSchema = z.object({
  declaredAmount: z.number().min(0).max(99_999_999),
  note: z.string().trim().max(500),
});

export type AccountingRangeValues = z.infer<typeof accountingRangeSchema>;
export type AccountingSettingsValues = z.infer<typeof accountingSettingsSchema>;
export type CashHandoffValues = z.infer<typeof cashHandoffSchema>;

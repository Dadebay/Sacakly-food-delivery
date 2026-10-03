import { z } from "zod";

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).transform((value) => value || undefined);

export const contactFormSchema = z.object({
  displayName: z.string().trim().min(1, "Название обязательно").max(160),
  phone: z.string().trim().min(1, "Телефон обязателен").max(24),
  telegram: optionalText(500),
  email: optionalText(254),
  privacyLink: optionalText(1000),
  userAgreementLink: optionalText(1000),
});

export type ContactFormInput = z.input<typeof contactFormSchema>;
export type ContactFormValues = z.output<typeof contactFormSchema>;

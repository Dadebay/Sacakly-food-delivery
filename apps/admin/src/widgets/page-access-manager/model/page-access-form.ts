import { z } from "zod";
import { adminPageValues } from "@/src/entities/admin-page-access";

export const pageAccessFormSchema = z.object({
  allowedPages: z.array(z.enum(adminPageValues)),
  version: z.number().int().min(0),
});

export type PageAccessFormInput = z.input<typeof pageAccessFormSchema>;
export type PageAccessFormValues = z.output<typeof pageAccessFormSchema>;

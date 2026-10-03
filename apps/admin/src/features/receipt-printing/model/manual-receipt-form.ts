import { z } from "zod";

export const manualReceiptFormSchema = z
  .object({
    mainCopies: z.number().int().min(0).max(3),
    routes: z
      .array(
        z.object({
          itemId: z.uuid(),
          included: z.boolean(),
          destination: z.union([
            z.literal("DEFAULT"),
            z.literal("MAIN"),
            z.uuid(),
          ]),
        }),
      )
      .min(1)
      .max(100)
      .refine((routes) => routes.some((route) => route.included), {
        message: "Выберите хотя бы одно блюдо для печати",
      }),
  })
  .superRefine((values, context) => {
    if (values.mainCopies !== 0) return;
    values.routes.forEach((route, index) => {
      if (route.included && route.destination === "MAIN")
        context.addIssue({
          code: "custom",
          path: ["routes", index, "destination"],
          message: "Выберите кухню или включите главную кассу",
        });
    });
  });

export type ManualReceiptFormValues = z.infer<typeof manualReceiptFormSchema>;

export function manualReceiptItemRoutes(values: ManualReceiptFormValues) {
  return values.routes.flatMap((route) => {
    if (!route.included)
      return [{ itemId: route.itemId, printerId: null, skip: true }];
    if (route.destination === "DEFAULT") return [];
    return [
      {
        itemId: route.itemId,
        printerId: route.destination === "MAIN" ? null : route.destination,
      },
    ];
  });
}

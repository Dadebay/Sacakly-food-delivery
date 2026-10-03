import { z } from "zod";
import {
  optionalText,
  turkmenPhoneSchema,
} from "../../../shared/forms/schema.ts";

const optionalAddressId = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .pipe(z.union([z.uuid("Некорректный сохранённый адрес"), z.undefined()]));

const deliveryEtrapId = z
  .string()
  .trim()
  .transform((value) => (value ? Number(value) : undefined))
  .pipe(
    z
      .number()
      .int()
      .positive("Некорректный район доставки")
      .optional(),
  );

export const assistedOrderFormSchema = z.object({
  customerPhone: turkmenPhoneSchema,
  customerFirstName: optionalText(80),
  customerLastName: optionalText(80),
  addressId: optionalAddressId,
  deliveryEtrapId,
  addressLabel: optionalText(60),
  address: optionalText(500),
  entrance: optionalText(40),
  floor: optionalText(20),
  apartment: optionalText(20),
  customerNote: optionalText(500),
  promoCode: z
    .string()
    .trim()
    .max(40, "Не больше 40 символов")
    .transform((value) => value.toUpperCase() || undefined),
  addressSearch: z.string().trim().max(160, "Не больше 160 символов"),
});

export type AssistedOrderFormInput = z.input<typeof assistedOrderFormSchema>;
export type AssistedOrderFormValues = z.output<typeof assistedOrderFormSchema>;

export type AssistedOrderCoordinates = {
  latitude: number;
  longitude: number;
};

export function buildAssistedDeliveryAddress({
  officialAddress,
  unofficialAddress,
  coordinates,
}: {
  officialAddress?: string | null;
  unofficialAddress?: string | null;
  coordinates: AssistedOrderCoordinates;
}) {
  const official = officialAddress?.trim();
  const unofficial = unofficialAddress?.trim();
  if (official && unofficial) return `${official} — ориентир: ${unofficial}`;
  if (official) return official;
  if (unofficial) return unofficial;
  return `Точка на карте: ${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
}

export function normalizeAssistedOrderCoordinates(
  latitude: number,
  longitude: number,
): AssistedOrderCoordinates | null {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  };
}

import type { AssistedCustomerAddress } from "../../../entities/customer/model/types.ts";
import {
  buildAssistedDeliveryAddress,
  type AssistedOrderCoordinates,
  type AssistedOrderFormValues,
} from "./assisted-order-form.ts";

type AssistedOrderDeliveryValues = Pick<
  AssistedOrderFormValues,
  | "addressId"
  | "deliveryEtrapId"
  | "addressLabel"
  | "address"
  | "entrance"
  | "floor"
  | "apartment"
>;

export type AssistedOrderDeliverySelection = {
  deliveryEtrapId?: number;
  addressId?: string;
  addressLabel?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  entrance?: string;
  floor?: string;
  apartment?: string;
};

function normalizedDetail(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function canReuseAssistedSavedAddress(
  values: AssistedOrderDeliveryValues,
  savedAddress: AssistedCustomerAddress | undefined,
) {
  return Boolean(
    savedAddress &&
      values.addressId === savedAddress.id &&
      !normalizedDetail(values.address) &&
      normalizedDetail(values.addressLabel) ===
        normalizedDetail(savedAddress.label) &&
      normalizedDetail(values.entrance) ===
        normalizedDetail(savedAddress.entrance) &&
      normalizedDetail(values.floor) === normalizedDetail(savedAddress.floor) &&
      normalizedDetail(values.apartment) ===
        normalizedDetail(savedAddress.apartment),
  );
}

export function buildAssistedOrderDeliverySelection({
  values,
  coordinates,
  savedAddress,
  officialAddress,
}: {
  values: AssistedOrderDeliveryValues;
  coordinates: AssistedOrderCoordinates | null;
  savedAddress?: AssistedCustomerAddress;
  officialAddress?: string | null;
}): AssistedOrderDeliverySelection | null {
  const deliveryEtrap = values.deliveryEtrapId
    ? { deliveryEtrapId: values.deliveryEtrapId }
    : {};

  if (canReuseAssistedSavedAddress(values, savedAddress)) {
    return {
      ...deliveryEtrap,
      addressId: values.addressId,
    };
  }

  if (!coordinates) return null;

  return {
    ...deliveryEtrap,
    addressLabel: values.addressLabel,
    address: buildAssistedDeliveryAddress({
      officialAddress,
      unofficialAddress: values.address,
      coordinates,
    }),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    entrance: values.entrance,
    floor: values.floor,
    apartment: values.apartment,
  };
}

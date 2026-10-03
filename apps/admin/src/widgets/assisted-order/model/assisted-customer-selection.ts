import type {
  AssistedCustomer,
  AssistedCustomerAddress,
} from "@/src/entities/customer";
import type { AssistedOrderCoordinates } from "./assisted-order-form";

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function findExactAssistedCustomer(
  customers: AssistedCustomer[],
  phone: string,
) {
  const expected = phoneDigits(phone);
  if (!expected) return null;
  return (
    customers.find((customer) => phoneDigits(customer.phone) === expected) ??
    null
  );
}

export function getPreferredAssistedAddress(customer: AssistedCustomer) {
  return (
    customer.addresses.find((address) => address.isActive) ??
    customer.addresses[0] ??
    null
  );
}

export function toSavedAddressSelection(address: AssistedCustomerAddress): {
  values: {
    addressId: string;
    deliveryEtrapId: string;
    addressLabel: string;
    address: string;
    entrance: string;
    floor: string;
    apartment: string;
  };
  coordinates: AssistedOrderCoordinates;
} {
  return {
    values: {
      addressId: address.id,
      deliveryEtrapId: address.deliveryEtrapId
        ? String(address.deliveryEtrapId)
        : "",
      addressLabel: address.label ?? "",
      address: address.address,
      entrance: address.entrance ?? "",
      floor: address.floor ?? "",
      apartment: address.apartment ?? "",
    },
    coordinates: {
      latitude: address.latitude,
      longitude: address.longitude,
    },
  };
}

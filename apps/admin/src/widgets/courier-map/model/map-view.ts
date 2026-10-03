import type { DispatchCourier } from "@/src/entities/courier";

export function couriersOnMap(
  couriers: DispatchCourier[],
  selectedId: string | null,
) {
  return selectedId ? couriers.filter(({ id }) => id === selectedId) : couriers;
}

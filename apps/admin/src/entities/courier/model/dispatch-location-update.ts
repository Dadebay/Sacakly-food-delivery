import type { DispatchCourier, DispatchSnapshot } from "./types";

export type DispatchLocationUpdate = {
  courierId: string;
  location: DispatchCourier["location"];
  sentAt: string;
};

export function applyDispatchLocationUpdate(
  snapshot: DispatchSnapshot,
  event: DispatchLocationUpdate,
): DispatchSnapshot | null {
  if (!snapshot.couriers.some(({ id }) => id === event.courierId)) {
    return null;
  }

  return {
    ...snapshot,
    generatedAt: event.sentAt,
    couriers: snapshot.couriers.map((courier) =>
      courier.id === event.courierId
        ? {
            ...courier,
            presence: event.location ? "ONLINE" : "OFFLINE",
            location: event.location,
          }
        : courier,
    ),
  };
}

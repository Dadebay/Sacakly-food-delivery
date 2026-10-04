import { OrderStatus } from "../generated/prisma/client";

/** Offer external work 40 minutes before the longest snapshotted dish is ready. */
export function deliveryOfferAt(createdAt: Date, maxPreparationMinutes: number): Date {
  const delayMinutes = Math.max(0, Math.min(1440, maxPreparationMinutes) - 40);
  return new Date(createdAt.getTime() + delayMinutes * 60_000);
}

export function mayOfferExternally(status: OrderStatus): boolean {
  return status === OrderStatus.COOKING || status === OrderStatus.READY;
}

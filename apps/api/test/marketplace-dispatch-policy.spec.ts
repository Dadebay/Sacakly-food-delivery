import { describe, expect, it } from "vitest";
import { deliveryOfferAt, mayOfferExternally } from "../src/marketplace/marketplace-dispatch-policy";
import { OrderStatus } from "../src/generated/prisma/client";

describe("marketplace delivery offer timing", () => {
  const created = new Date("2026-10-03T12:00:00.000Z");
  it("offers a 60 minute order after minute 20", () => {
    expect(deliveryOfferAt(created, 60)).toEqual(new Date("2026-10-03T12:20:00.000Z"));
  });
  it("offers short preparations immediately and never before order creation", () => {
    expect(deliveryOfferAt(created, 20)).toEqual(created);
    expect(deliveryOfferAt(created, 0)).toEqual(created);
  });
  it("does not advertise cancelled or already assigned orders", () => {
    expect(mayOfferExternally(OrderStatus.COOKING)).toBe(true);
    expect(mayOfferExternally(OrderStatus.READY)).toBe(true);
    expect(mayOfferExternally(OrderStatus.CANCELLED)).toBe(false);
    expect(mayOfferExternally(OrderStatus.ASSIGNED_TO_COURIER)).toBe(false);
  });
});

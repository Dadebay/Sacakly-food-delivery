import { describe, expect, it } from "vitest";
import { PromoType } from "../src/generated/prisma/client";
import {
  allocateDiscountAcrossLines,
  calculatePromoDiscount,
} from "../src/orders/order-pricing";

describe("order promo pricing", () => {
  it("calculates percentage and fixed discounts with caps", () => {
    expect(
      calculatePromoDiscount(
        {
          type: PromoType.PERCENT,
          value: 15,
          maxDiscountAmount: null,
        },
        100,
      ),
    ).toBe(15);
    expect(
      calculatePromoDiscount(
        {
          type: PromoType.PERCENT,
          value: 50,
          maxDiscountAmount: 12.34,
        },
        100,
      ),
    ).toBe(12.34);
    expect(
      calculatePromoDiscount(
        {
          type: PromoType.FIXED,
          value: 200,
          maxDiscountAmount: null,
        },
        99.99,
      ),
    ).toBe(99.99);
  });

  it("allocates rounded discounts without losing or creating a cent", () => {
    const allocated = allocateDiscountAcrossLines([33.33, 33.33, 33.34], 10);

    expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(10);
    expect(allocated).toEqual([3.33, 3.33, 3.34]);
    expect(
      allocated.every((value, index) => value <= [33.33, 33.33, 33.34][index]!),
    ).toBe(true);
  });
});

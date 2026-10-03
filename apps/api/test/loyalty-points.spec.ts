import { describe, expect, it } from "vitest";
import { earnedPoints, redemptionPoints } from "../src/loyalty/loyalty-points";

describe("loyalty point calculation", () => {
  it("multiplies each product's point value by its quantity", () => {
    expect(earnedPoints([{ points: 2, quantity: 3 }, { points: 7, quantity: 1 }])).toBe(13);
  });

  it("uses the gift's snapshotted cost and quantity", () => {
    expect(redemptionPoints([{ pointsCost: 20, quantity: 2 }, { pointsCost: 35, quantity: 1 }])).toBe(75);
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])("rejects invalid product points %s", (points) => {
    expect(() => earnedPoints([{ points, quantity: 1 }])).toThrow(RangeError);
  });

  it("rejects overflow and zero or fractional quantities", () => {
    expect(() => earnedPoints([{ points: 1, quantity: 0 }])).toThrow(RangeError);
    expect(() => redemptionPoints([{ pointsCost: 10, quantity: 1.2 }])).toThrow(RangeError);
    expect(() => redemptionPoints([{ pointsCost: Number.MAX_SAFE_INTEGER, quantity: 2 }])).toThrow(RangeError);
  });
});

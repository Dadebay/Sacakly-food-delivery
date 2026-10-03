import { describe, expect, it } from "vitest";
import { distanceBetweenMeters } from "../src/branches/branch-distance";

describe("branch distance", () => {
  it("returns zero for the same point", () => {
    expect(
      distanceBetweenMeters(
        { latitude: 37.96, longitude: 58.38 },
        { latitude: 37.96, longitude: 58.38 },
      ),
    ).toBe(0);
  });

  it("calculates a stable straight-line distance in metres", () => {
    const distance = distanceBetweenMeters(
      { latitude: 37.95, longitude: 58.38 },
      { latitude: 37.96, longitude: 58.39 },
    );
    expect(distance).toBeGreaterThan(1_300);
    expect(distance).toBeLessThan(1_500);
  });

  it("is symmetric across the antimeridian and never takes the long way around", () => {
    const a = { latitude: 0, longitude: 179.9 };
    const b = { latitude: 0, longitude: -179.9 };
    expect(distanceBetweenMeters(a, b)).toBe(distanceBetweenMeters(b, a));
    expect(distanceBetweenMeters(a, b)).toBeGreaterThan(22_000);
    expect(distanceBetweenMeters(a, b)).toBeLessThan(23_000);
  });

  it.each([
    [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 0 }],
    [{ latitude: 0, longitude: -181 }, { latitude: 0, longitude: 0 }],
    [{ latitude: Number.NaN, longitude: 0 }, { latitude: 0, longitude: 0 }],
    [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: Infinity }],
  ])("rejects invalid coordinate pairs", (from, to) => {
    expect(() => distanceBetweenMeters(from, to)).toThrow(RangeError);
  });
});

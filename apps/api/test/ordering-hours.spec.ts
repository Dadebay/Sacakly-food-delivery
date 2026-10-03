import { describe, expect, it } from "vitest";
import { orderingIsOpen } from "../src/orders/ordering-hours.service";

describe("ordering hours in Ashgabat", () => {
  it("treats opening as inclusive and closing as exclusive", () => {
    expect(
      orderingIsOpen(true, "09:00", "22:00", new Date("2026-09-24T03:59:00Z")),
    ).toBe(false);
    expect(
      orderingIsOpen(true, "09:00", "22:00", new Date("2026-09-24T04:00:00Z")),
    ).toBe(true);
    expect(
      orderingIsOpen(true, "09:00", "22:00", new Date("2026-09-24T16:59:00Z")),
    ).toBe(true);
    expect(
      orderingIsOpen(true, "09:00", "22:00", new Date("2026-09-24T17:00:00Z")),
    ).toBe(false);
  });

  it("supports intervals crossing midnight and a disabled limit", () => {
    expect(
      orderingIsOpen(true, "22:00", "02:00", new Date("2026-09-24T16:59:00Z")),
    ).toBe(false);
    expect(
      orderingIsOpen(true, "22:00", "02:00", new Date("2026-09-24T17:00:00Z")),
    ).toBe(true);
    expect(
      orderingIsOpen(true, "22:00", "02:00", new Date("2026-09-24T20:30:00Z")),
    ).toBe(true);
    expect(
      orderingIsOpen(true, "22:00", "02:00", new Date("2026-09-24T21:00:00Z")),
    ).toBe(false);
    expect(
      orderingIsOpen(false, "09:00", "22:00", new Date("2026-09-24T23:00:00Z")),
    ).toBe(true);
  });
});

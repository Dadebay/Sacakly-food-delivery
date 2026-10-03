import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  localDateForInstant,
  localDateRange,
  resolveShiftWindow,
  timeToMinutes,
} from "../src/accounting/accounting-period";

const settings = {
  firstShiftName: "Day",
  firstShiftStartMinutes: 570,
  secondShiftName: "Night",
  secondShiftStartMinutes: 1140,
};

describe("Ashgabat accounting periods", () => {
  it("builds both shift windows across local midnight", () => {
    expect(resolveShiftWindow("2026-08-20:first", settings)).toMatchObject({
      shiftName: "Day",
      periodStart: new Date("2026-08-20T04:30:00.000Z"),
      periodEnd: new Date("2026-08-20T14:00:00.000Z"),
    });
    expect(resolveShiftWindow("2026-08-20:second", settings)).toMatchObject({
      shiftName: "Night",
      periodStart: new Date("2026-08-20T14:00:00.000Z"),
      periodEnd: new Date("2026-08-21T04:30:00.000Z"),
    });
  });

  it("keeps date ranges and daily reporting in Asia/Ashgabat", () => {
    expect(localDateRange("2026-08-20", "2026-08-20")).toEqual({
      start: new Date("2026-08-19T19:00:00.000Z"),
      end: new Date("2026-08-20T19:00:00.000Z"),
    });
    expect(localDateForInstant(new Date("2026-08-20T20:00:00.000Z"))).toBe(
      "2026-08-21",
    );
    expect(addLocalDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(timeToMinutes("19:00")).toBe(1140);
  });

  it("rejects invalid keys and times", () => {
    expect(() => resolveShiftWindow("2026-02-30:first", settings)).toThrow();
    expect(() => timeToMinutes("24:00")).toThrow();
  });
});

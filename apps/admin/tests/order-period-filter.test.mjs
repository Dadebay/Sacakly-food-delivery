import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  orderPeriodRange,
  todayDateValue,
} from "../src/widgets/order-board/model/order-period-filter.ts";

const fixedNow = new Date(2026, 7, 20, 14, 30, 0, 0);

test("order board defaults to the local current day", () => {
  assert.equal(todayDateValue(fixedNow), "2026-08-20");
  const range = orderPeriodRange({
    period: "today",
    selectedDate: "",
    startHour: 0,
    endHour: 24,
    now: fixedNow,
  });
  const from = new Date(range.createdFrom);
  const to = new Date(range.createdTo);
  assert.equal(from.getHours(), 0);
  assert.equal(to.getHours(), 0);
  assert.equal(to.getTime() - from.getTime(), 86_400_000);
});

test("order board supports a historical date and exact hour window", () => {
  const range = orderPeriodRange({
    period: "date",
    selectedDate: "2026-08-12",
    startHour: 9,
    endHour: 13,
    now: fixedNow,
  });
  const from = new Date(range.createdFrom);
  const to = new Date(range.createdTo);
  assert.equal(from.getDate(), 12);
  assert.equal(from.getHours(), 9);
  assert.equal(to.getHours(), 13);
  assert.equal(to.getTime() - from.getTime(), 4 * 60 * 60 * 1_000);
  assert.deepEqual(
    orderPeriodRange({
      period: "all",
      selectedDate: "",
      startHour: 0,
      endHour: 24,
      now: fixedNow,
    }),
    {},
  );
});

test("order query sends server-owned timestamp filters", async () => {
  const [board, queries] = await Promise.all([
    readFile(
      new URL("../src/widgets/order-board/ui/order-board.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/entities/order/api/order-queries.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(board, /data-testid="orders-period-filter"/);
  assert.match(board, /data-testid="orders-hour-from-filter"/);
  assert.match(board, /data-testid="orders-hour-to-filter"/);
  assert.match(queries, /query\.set\("createdFrom", normalized\.createdFrom\)/);
  assert.match(queries, /query\.set\("createdTo", normalized\.createdTo\)/);
});

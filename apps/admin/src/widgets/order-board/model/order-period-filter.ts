export type OrderPeriod = "today" | "yesterday" | "date" | "all";

export type OrderDateRange = {
  createdFrom?: string;
  createdTo?: string;
};

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromValue(value: string, fallback: Date) {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function todayDateValue(now = new Date()) {
  return localDateValue(now);
}

export function orderPeriodRange({
  period,
  selectedDate,
  startHour,
  endHour,
  now = new Date(),
}: {
  period: OrderPeriod;
  selectedDate: string;
  startHour: number;
  endHour: number;
  now?: Date;
}): OrderDateRange {
  if (period === "all") return {};

  const day =
    period === "date"
      ? dateFromValue(
          selectedDate,
          new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        )
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "yesterday") day.setDate(day.getDate() - 1);

  const from = new Date(day);
  const safeStartHour = Math.max(0, Math.min(23, startHour));
  const safeEndHour = Math.max(
    safeStartHour + 1,
    Math.min(24, endHour),
  );
  from.setHours(safeStartHour, 0, 0, 0);
  const to = new Date(day);
  if (safeEndHour === 24) {
    to.setDate(to.getDate() + 1);
    to.setHours(0, 0, 0, 0);
  } else {
    to.setHours(safeEndHour, 0, 0, 0);
  }

  return {
    createdFrom: from.toISOString(),
    createdTo: to.toISOString(),
  };
}

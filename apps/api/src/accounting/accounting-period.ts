export const ACCOUNTING_TIME_ZONE = "Asia/Ashgabat";
const ASHGABAT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AccountingShiftSettings = {
  firstShiftName: string;
  firstShiftStartMinutes: number;
  secondShiftName: string;
  secondShiftStartMinutes: number;
};

export type AccountingShiftWindow = {
  shiftKey: string;
  shiftName: string;
  periodStart: Date;
  periodEnd: Date;
};

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid local date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error("Invalid local date");
  }
  return candidate;
}

export function addLocalDays(value: string, days: number) {
  const date = parseLocalDate(value);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function localDateForInstant(value: Date) {
  return new Date(value.getTime() + ASHGABAT_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function localDateTime(value: string, minutes: number) {
  const date = parseLocalDate(value);
  return new Date(date.getTime() + minutes * 60_000 - ASHGABAT_OFFSET_MS);
}

export function localDateRange(fromDate: string, toDate: string) {
  return {
    start: localDateTime(fromDate, 0),
    end: localDateTime(addLocalDays(toDate, 1), 0),
  };
}

export function resolveShiftWindow(
  shiftKey: string,
  settings: AccountingShiftSettings,
): AccountingShiftWindow {
  const match = /^(\d{4}-\d{2}-\d{2}):(first|second)$/.exec(shiftKey);
  if (!match) throw new Error("Invalid shift key");
  const localDate = match[1]!;
  parseLocalDate(localDate);
  if (match[2] === "first") {
    return {
      shiftKey,
      shiftName: settings.firstShiftName,
      periodStart: localDateTime(localDate, settings.firstShiftStartMinutes),
      periodEnd: localDateTime(localDate, settings.secondShiftStartMinutes),
    };
  }
  return {
    shiftKey,
    shiftName: settings.secondShiftName,
    periodStart: localDateTime(localDate, settings.secondShiftStartMinutes),
    periodEnd: localDateTime(
      addLocalDays(localDate, 1),
      settings.firstShiftStartMinutes,
    ),
  };
}

export function enumerateShiftWindows(
  fromDate: string,
  toDate: string,
  settings: AccountingShiftSettings,
) {
  parseLocalDate(fromDate);
  parseLocalDate(toDate);
  const windows: AccountingShiftWindow[] = [];
  for (let date = fromDate; date <= toDate; date = addLocalDays(date, 1)) {
    windows.push(resolveShiftWindow(`${date}:first`, settings));
    windows.push(resolveShiftWindow(`${date}:second`, settings));
  }
  return windows;
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) throw new Error("Invalid time");
  const [hours, minutes] = value.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

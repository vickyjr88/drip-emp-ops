/**
 * The report covers one calendar day in the shop's own timezone, not UTC: an order at 23:30 in Nairobi belongs to
 * that day, not the next. Kenya has no daylight saving, so a fixed offset is exact; it is a parameter only so the
 * tests can prove the day boundaries.
 */
export const EAT_OFFSET_MINUTES = 180;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type ReportWindow = {
  /** YYYY-MM-DD in the shop's timezone. */
  dateKey: string;
  /** Inclusive start, exclusive end, as real instants. */
  start: Date;
  end: Date;
  /** "Wed 4 Nov 2026" */
  label: string;
};

export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function dateKeyOf(utcMidnight: Date) {
  return utcMidnight.toISOString().slice(0, 10);
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return dateKeyOf(new Date(Date.UTC(y, m - 1, d) + days * DAY_MS));
}

/** The local calendar date "now" falls on. */
export function localDateKey(now: Date, offsetMinutes = EAT_OFFSET_MINUTES): string {
  return dateKeyOf(new Date(now.getTime() + offsetMinutes * MINUTE_MS));
}

/** The day that just finished, which is what the 07:00 report describes. */
export function yesterdayKey(now: Date, offsetMinutes = EAT_OFFSET_MINUTES): string {
  return shiftDateKey(localDateKey(now, offsetMinutes), -1);
}

export function windowForDate(dateKey: string, offsetMinutes = EAT_OFFSET_MINUTES): ReportWindow {
  if (!DATE_KEY.test(dateKey)) throw new Error(`Not a YYYY-MM-DD date: ${dateKey}`);
  const [y, m, d] = dateKey.split('-').map(Number);
  const localMidnightAsUtc = Date.UTC(y, m - 1, d);
  const start = new Date(localMidnightAsUtc - offsetMinutes * MINUTE_MS);
  return {
    dateKey,
    start,
    end: new Date(start.getTime() + DAY_MS),
    label: new Date(localMidnightAsUtc).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).replace(',', ''),
  };
}

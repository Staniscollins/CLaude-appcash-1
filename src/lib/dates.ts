/**
 * Calendar helpers built on "day keys" (`YYYY-MM-DD`). Day keys are plain
 * calendar dates with no timezone: arithmetic is done in UTC so DST changes
 * never shift a day.
 */

export type DayKey = string;

const DAY_MS = 86_400_000;

export function dayKeyFromUTCDate(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}

/** Calendar date of `date` in the user's local timezone. */
export function localDayKey(date: Date = new Date()): DayKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Calendar date of an instant in a given IANA timezone (e.g. an exchange's). */
export function dayKeyInTimeZone(epochMs: number, timeZone: string): DayKey {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(epochMs));
    return parts; // en-CA formats as YYYY-MM-DD
  } catch {
    return dayKeyFromUTCDate(new Date(epochMs));
  }
}

export function dayKeyToUTC(key: DayKey): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

export function dayKeyToDate(key: DayKey): Date {
  return new Date(dayKeyToUTC(key));
}

export function addDays(key: DayKey, days: number): DayKey {
  return dayKeyFromUTCDate(new Date(dayKeyToUTC(key) + days * DAY_MS));
}

export function addMonths(key: DayKey, months: number): DayKey {
  const d = dayKeyToDate(key);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return dayKeyFromUTCDate(target);
}

export function addYears(key: DayKey, years: number): DayKey {
  return addMonths(key, years * 12);
}

export function diffDays(from: DayKey, to: DayKey): number {
  return Math.round((dayKeyToUTC(to) - dayKeyToUTC(from)) / DAY_MS);
}

export function weekday(key: DayKey): number {
  return dayKeyToDate(key).getUTCDay();
}

export function isWeekend(key: DayKey): boolean {
  const d = weekday(key);
  return d === 0 || d === 6;
}

/** Previous weekday strictly before `key`. */
export function previousWeekday(key: DayKey): DayKey {
  let k = addDays(key, -1);
  while (isWeekend(k)) k = addDays(k, -1);
  return k;
}

/** Most recent weekday on or before `key`. */
export function weekdayOnOrBefore(key: DayKey): DayKey {
  let k = key;
  while (isWeekend(k)) k = addDays(k, -1);
  return k;
}

/** All weekdays (Mon–Fri) between two keys, inclusive. */
export function weekdaysBetween(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  if (from > to) return out;
  let t = dayKeyToUTC(from);
  const end = dayKeyToUTC(to);
  while (t <= end) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(dayKeyFromUTCDate(new Date(t)));
    t += DAY_MS;
  }
  return out;
}

export function startOfYear(key: DayKey): DayKey {
  return `${key.slice(0, 4)}-01-01`;
}

export function monthKey(key: DayKey): string {
  return key.slice(0, 7);
}

export function yearsBetween(from: DayKey, to: DayKey): number {
  return diffDays(from, to) / 365.25;
}

export function minKey(a: DayKey, b: DayKey): DayKey {
  return a < b ? a : b;
}

export function maxKey(a: DayKey, b: DayKey): DayKey {
  return a > b ? a : b;
}

export function isValidDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = dayKeyToUTC(value);
  return Number.isFinite(t) && dayKeyFromUTCDate(new Date(t)) === value;
}

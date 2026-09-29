import { addMonths, addYears, startOfYear, type DayKey } from "../dates";

export type PeriodRange = "1mo" | "3mo" | "6mo" | "ytd" | "1y" | "2y" | "3y" | "5y" | "max";

/** First day of a period ending today (null = since inception). */
export function periodStart(range: string, today: DayKey): DayKey | null {
  switch (range) {
    case "1mo":
      return addMonths(today, -1);
    case "3mo":
      return addMonths(today, -3);
    case "6mo":
      return addMonths(today, -6);
    case "ytd":
      return startOfYear(today);
    case "1y":
      return addYears(today, -1);
    case "2y":
      return addYears(today, -2);
    case "3y":
      return addYears(today, -3);
    case "5y":
      return addYears(today, -5);
    default:
      return null;
  }
}

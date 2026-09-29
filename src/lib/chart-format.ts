import { formatDate, formatMoney, LOCALE } from "./format";

export type ChartSpan = "intraday" | "week" | "short" | "medium" | "long";

export function spanOfRange(range: string): ChartSpan {
  if (range === "1d") return "intraday";
  if (range === "5d") return "week";
  if (range === "1mo" || range === "3mo") return "short";
  if (range === "6mo" || range === "ytd" || range === "1y") return "medium";
  return "long";
}

const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
const weekFmt = new Intl.DateTimeFormat(LOCALE, { weekday: "short", hour: "2-digit", minute: "2-digit" });
const weekTickFmt = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric" });

/** Tooltip / header label of a chart point. */
export function formatPointTime(t: number, span: ChartSpan): string {
  if (span === "intraday") return timeFmt.format(new Date(t));
  if (span === "week") return weekFmt.format(new Date(t));
  return formatDate(new Date(t).toISOString().slice(0, 10), "long");
}

/** Axis tick label of a chart point. */
export function formatTick(t: number, span: ChartSpan): string {
  const d = new Date(t);
  if (span === "intraday") return timeFmt.format(d);
  if (span === "week") return weekTickFmt.format(d);
  const key = d.toISOString().slice(0, 10);
  if (span === "short") return formatDate(key, "short");
  if (span === "medium") return formatDate(key, "monthShort");
  return formatDate(key, "year");
}

export function moneyAxis(currency: string) {
  return (v: number) => formatMoney(v, currency, { compact: Math.abs(v) >= 10_000, decimals: Math.abs(v) >= 1000 ? 0 : 2 });
}

export const RANGE_SUFFIX: Record<string, string> = {
  "1d": "aujourd'hui",
  "5d": "sur 5 jours",
  "1mo": "sur 1 mois",
  "3mo": "sur 3 mois",
  "6mo": "sur 6 mois",
  ytd: "depuis le 1er janvier",
  "1y": "sur 1 an",
  "2y": "sur 2 ans",
  "3y": "sur 3 ans",
  "5y": "sur 5 ans",
  "10y": "sur 10 ans",
  max: "depuis le début",
};

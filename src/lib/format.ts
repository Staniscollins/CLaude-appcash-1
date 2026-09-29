import { dayKeyToDate } from "./dates";

export const LOCALE = "fr-FR";

const cache = new Map<string, Intl.NumberFormat>();

function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, options);
    cache.set(key, f);
  }
  return f;
}

/** Sub-unit currencies quoted by Yahoo (London pence, Johannesburg cents…). */
export const SUBUNIT_CURRENCIES: Record<string, { parent: string; factor: number; symbol: string }> = {
  GBp: { parent: "GBP", factor: 100, symbol: "p" },
  GBX: { parent: "GBP", factor: 100, symbol: "p" },
  ZAc: { parent: "ZAR", factor: 100, symbol: "c" },
  ZAC: { parent: "ZAR", factor: 100, symbol: "c" },
  ILA: { parent: "ILS", factor: 100, symbol: "ag." },
};

export function isSubunitCurrency(ccy: string | undefined): boolean {
  return !!ccy && ccy in SUBUNIT_CURRENCIES;
}

export function parentCurrency(ccy: string): string {
  return SUBUNIT_CURRENCIES[ccy]?.parent ?? ccy;
}

const SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  JPY: "¥",
  CHF: "CHF",
  CAD: "C$",
  AUD: "A$",
  HKD: "HK$",
  CNY: "¥",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  INR: "₹",
  KRW: "₩",
  BRL: "R$",
  BTC: "₿",
  ETH: "Ξ",
};

export function currencySymbol(ccy: string | undefined): string {
  if (!ccy) return "";
  const sub = SUBUNIT_CURRENCIES[ccy];
  if (sub) return sub.symbol;
  return SYMBOLS[ccy] ?? ccy;
}

function safeCurrency(ccy: string | undefined): string | null {
  if (!ccy || isSubunitCurrency(ccy)) return null;
  return /^[A-Z]{3}$/.test(ccy) ? ccy : null;
}

export interface MoneyOptions {
  decimals?: number;
  compact?: boolean;
  sign?: boolean;
}

/** Formats an amount of money. Compact output looks like `12,3 k€`. */
export function formatMoney(value: number | null | undefined, currency = "EUR", opts: MoneyOptions = {}): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const { compact = false, sign = false } = opts;
  const signDisplay = sign ? "exceptZero" : "auto";

  if (compact && Math.abs(value) >= 10_000) {
    const num = nf({ notation: "compact", maximumFractionDigits: Math.abs(value) >= 1e6 ? 2 : 1, signDisplay }).format(value);
    return `${num}${currencySymbol(currency) === "€" ? " €" : ` ${currencySymbol(currency)}`}`;
  }

  const decimals = opts.decimals ?? (Math.abs(value) >= 100_000 && compact ? 0 : 2);
  const iso = safeCurrency(currency);
  if (!iso) {
    const num = nf({ minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay }).format(value);
    return `${num} ${currencySymbol(currency)}`.trim();
  }
  return nf({
    style: "currency",
    currency: iso,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay,
  }).format(value);
}

/** Number of decimals that reads well for a quoted price. */
export function priceDecimals(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0) return 2;
  if (abs < 0.01) return 6;
  if (abs < 1) return 4;
  if (abs < 10_000) return 2;
  return 0;
}

export function formatPrice(value: number | null | undefined, currency?: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const decimals = priceDecimals(value);
  if (!currency) return formatNumber(value, { decimals });
  return formatMoney(value, currency, { decimals });
}

export interface NumberOptions {
  decimals?: number;
  minDecimals?: number;
  compact?: boolean;
  sign?: boolean;
}

export function formatNumber(value: number | null | undefined, opts: NumberOptions = {}): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const { decimals = 2, compact = false, sign = false } = opts;
  return nf({
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: decimals,
    minimumFractionDigits: opts.minDecimals ?? (compact ? 0 : Math.min(decimals, 2)),
    signDisplay: sign ? "exceptZero" : "auto",
  }).format(value);
}

/** Quantity of shares/units: up to 6 decimals, trailing zeros trimmed. */
export function formatQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return nf({ maximumFractionDigits: Math.abs(value) < 1 ? 8 : 6, minimumFractionDigits: 0 }).format(value);
}

/** Formats a ratio (0.0123 → "1,23 %"). */
export function formatPercent(ratio: number | null | undefined, opts: { decimals?: number; sign?: boolean } = {}): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  const { decimals = 2, sign = false } = opts;
  return nf({
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: sign ? "exceptZero" : "auto",
  }).format(ratio);
}

export function formatCompact(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return nf({ notation: "compact", maximumFractionDigits: decimals }).format(value);
}

const dateFormats = {
  short: { day: "numeric", month: "short" },
  medium: { day: "numeric", month: "short", year: "numeric" },
  long: { day: "numeric", month: "long", year: "numeric" },
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  month: { month: "long", year: "numeric" },
  monthShort: { month: "short", year: "2-digit" },
  monthOnly: { month: "short" },
  year: { year: "numeric" },
  weekday: { weekday: "short", day: "numeric", month: "short" },
  time: { hour: "2-digit", minute: "2-digit" },
  dateTime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof dateFormats;

const dfCache = new Map<string, Intl.DateTimeFormat>();

/** Formats a day key (interpreted as a calendar date) or an instant. */
export function formatDate(value: string | number | Date | null | undefined, style: DateStyle = "medium", timeZone?: string): string {
  if (value == null) return "—";
  let date: Date;
  let tz = timeZone;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date = dayKeyToDate(value);
    tz = "UTC"; // day keys are calendar dates
  } else {
    date = value instanceof Date ? value : new Date(value);
  }
  if (Number.isNaN(date.getTime())) return "—";
  const key = `${style}|${tz ?? ""}`;
  let f = dfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { ...dateFormats[style], ...(tz ? { timeZone: tz } : {}) });
    dfCache.set(key, f);
  }
  return f.format(date);
}

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("fr", { numeric: "auto" }) : null;

export function formatRelativeTime(epochMs: number, now = Date.now()): string {
  if (!rtf || !Number.isFinite(epochMs)) return "";
  const diff = epochMs - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "à l'instant";
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), "day");
  if (abs < 365 * day) return rtf.format(Math.round(diff / (30 * day)), "month");
  return rtf.format(Math.round(diff / (365 * day)), "year");
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${formatNumber(count, { decimals: 0 })} ${Math.abs(count) >= 2 ? plural : singular}`;
}

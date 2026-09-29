import { addYears, localDayKey, monthKey, type DayKey } from "../dates";
import type { Position } from "./engine";
import { dividendNetBase } from "./engine";
import type { MarketTables } from "./market-tables";
import type { Transaction } from "./types";

export interface DividendForecast {
  symbol: string;
  name: string;
  /** Annual dividend per share in instrument currency. */
  perShare: number;
  annualIncome: number;
  yield: number;
  yieldOnCost: number;
  paymentsPerYear: number;
  nextExDate?: DayKey;
}

export interface ProjectedPayment {
  symbol: string;
  date: DayKey;
  amount: number;
  estimated: true;
}

/** Forward dividend estimate per position, from the announced rate or the last 12 months. */
export function forecastDividends(positions: Position[], tables: MarketTables, today: DayKey = localDayKey()) {
  const yearAgo = addYears(today, -1);
  const items: DividendForecast[] = [];
  const projected: ProjectedPayment[] = [];
  for (const p of positions) {
    if (p.quantity <= 0) continue;
    const events = tables.dividends(p.symbol).filter((e) => e.date > yearAgo && e.date <= today);
    const ttm = events.reduce((s, e) => s + e.amount, 0);
    const quote = tables.quote(p.symbol);
    const rate = quote?.dividendRate && quote.dividendRate > 0 ? quote.dividendRate : ttm;
    if (!(rate > 0)) continue;
    const fx = tables.fxNow(p.currency);
    const annualIncome = p.quantity * rate * fx;
    const upcoming = events
      .map((e) => addYears(e.date, 1))
      .filter((d) => d > today)
      .sort();
    items.push({
      symbol: p.symbol,
      name: p.name,
      perShare: rate,
      annualIncome,
      yield: p.price > 0 ? rate / p.price : 0,
      yieldOnCost: p.avgCost > 0 ? rate / p.avgCost : 0,
      paymentsPerYear: events.length || 1,
      nextExDate: upcoming[0],
    });
    if (events.length) {
      const scale = ttm > 0 ? rate / ttm : 1;
      for (const e of events) {
        projected.push({ symbol: p.symbol, date: addYears(e.date, 1), amount: p.quantity * e.amount * scale * fx, estimated: true });
      }
    } else {
      // No history: assume a single annual payment one year after today.
      projected.push({ symbol: p.symbol, date: addYears(today, 1), amount: annualIncome, estimated: true });
    }
  }
  items.sort((a, b) => b.annualIncome - a.annualIncome);
  projected.sort((a, b) => a.date.localeCompare(b.date));
  return { items, projected, annualTotal: items.reduce((s, i) => s + i.annualIncome, 0) };
}

export interface ReceivedDividend {
  symbol?: string;
  date: DayKey;
  gross: number;
  net: number;
  auto: boolean;
  accountId: string;
}

export function receivedDividends(dividends: Transaction[], tables: MarketTables): ReceivedDividend[] {
  return dividends
    .map((d) => {
      const fx = d.fxRate && d.fxRate > 0 ? d.fxRate : tables.fxOn(d.currency, d.date);
      return {
        symbol: d.symbol,
        date: d.date,
        gross: (d.amount ?? 0) * fx,
        net: dividendNetBase(d, tables),
        auto: !!d.auto,
        accountId: d.accountId,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Sums amounts per month key (YYYY-MM). */
export function byMonth<T extends { date: DayKey }>(items: T[], amount: (item: T) => number): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    const k = monthKey(it.date);
    out.set(k, (out.get(k) ?? 0) + amount(it));
  }
  return out;
}

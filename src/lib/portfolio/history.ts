import { addDays, weekdayOnOrBefore, weekdaysBetween, type DayKey } from "../dates";
import type { PriceSeries } from "../market/types";
import { adjustTrade, autoDividendTransactions, dividendNetBase, sortTransactions, trackedAccounts, txFx } from "./engine";
import type { MarketTables } from "./market-tables";
import type { Transaction } from "./types";

export interface DailyPoint {
  day: DayKey;
  /** Securities + cash of cash-tracked accounts (base currency). */
  value: number;
  securities: number;
  cash: number;
  /** Cumulative net contributions (deposits − withdrawals, or buys − sells). */
  netInvested: number;
  /** Money entering the portfolio this day (counted at the start of the day). */
  inflow: number;
  /** Money leaving the portfolio this day (counted at the end of the day), income included. */
  outflow: number;
  /** Income distributed out of the portfolio this day (dividends/interest of untracked accounts, net of fees). */
  income: number;
  /** Dividends received this day, all accounts (net, base currency). */
  dividends: number;
  /** Time-weighted return index (1 at inception). */
  twr: number;
  /** Daily time-weighted return. */
  ret: number;
}

export interface HistoryOptions {
  transactions: readonly Transaction[];
  tables: MarketTables;
  today: DayKey;
  autoDividends: boolean;
  /** Value the last day with live quotes rather than the last close. */
  live?: boolean;
}

const EPS = 1e-9;

export function computeDailyHistory(opts: HistoryOptions): DailyPoint[] {
  const { tables, today } = opts;
  const manual = opts.transactions.filter((t) => t.date <= today);
  if (!manual.some((t) => t.type === "BUY" || t.type === "DEPOSIT")) return [];
  const auto = opts.autoDividends ? autoDividendTransactions(manual, tables, today) : [];
  const all = sortTransactions([...manual, ...auto]);
  const tracked = trackedAccounts(manual);

  const lastDay = weekdayOnOrBefore(today);
  const firstDay = weekdayOnOrBefore(all[0].date);
  const days = weekdaysBetween(firstDay, lastDay);

  // Weekend transactions are booked on the next weekday.
  const byDay = new Map<DayKey, Transaction[]>();
  for (const tx of all) {
    let d = tx.date;
    while (d <= lastDay && (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7 >= 5) d = addDays(d, 1);
    if (d > lastDay) d = lastDay;
    const list = byDay.get(d) ?? [];
    list.push(tx);
    byDay.set(d, list);
  }

  const holdings = new Map<string, number>(); // `${account}|${symbol}` → adjusted quantity
  const currencyOf = new Map<string, string>();
  const lastTradePrice = new Map<string, number>(); // split-adjusted, instrument currency
  const cash = new Map<string, number>();
  let netInvested = 0;
  let prevValue = 0;
  let twr = 1;
  const out: DailyPoint[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    let inflow = 0;
    let outflow = 0;
    let income = 0;
    let dividends = 0;

    for (const tx of byDay.get(day) ?? []) {
      const fx = txFx(tx, tables);
      const isTracked = tracked.has(tx.accountId);
      const acc = tx.accountId;
      switch (tx.type) {
        case "BUY":
        case "SELL": {
          if (!tx.symbol) break;
          const key = `${acc}|${tx.symbol}`;
          const { quantity, price } = adjustTrade(tx, tables);
          currencyOf.set(tx.symbol, tables.currencyOf(tx.symbol) ?? tx.currency);
          lastTradePrice.set(tx.symbol, price);
          const held = holdings.get(key) ?? 0;
          if (tx.type === "BUY") {
            const cost = (quantity * price + (tx.fees ?? 0)) * fx;
            holdings.set(key, held + quantity);
            cash.set(acc, (cash.get(acc) ?? 0) - cost);
            if (!isTracked) {
              inflow += cost;
              netInvested += cost;
            }
          } else {
            const q = Math.min(quantity, held);
            if (q <= EPS) break;
            const proceeds = (q * price - (tx.fees ?? 0)) * fx;
            holdings.set(key, held - q);
            cash.set(acc, (cash.get(acc) ?? 0) + proceeds);
            if (!isTracked) {
              outflow += proceeds;
              netInvested -= proceeds;
            }
          }
          break;
        }
        case "DIVIDEND":
        case "INTEREST": {
          const v = tx.type === "DIVIDEND" ? dividendNetBase(tx, tables) : (tx.amount ?? 0) * fx;
          if (tx.type === "DIVIDEND") dividends += v;
          cash.set(acc, (cash.get(acc) ?? 0) + v);
          if (!isTracked) {
            outflow += v;
            income += v;
          }
          break;
        }
        case "FEE":
        case "TAX": {
          const v = Math.abs(tx.amount ?? 0) * fx;
          cash.set(acc, (cash.get(acc) ?? 0) - v);
          if (!isTracked) {
            outflow -= v;
            income -= v;
          }
          break;
        }
        case "DEPOSIT": {
          const v = (tx.amount ?? 0) * fx;
          cash.set(acc, (cash.get(acc) ?? 0) + v);
          inflow += v;
          netInvested += v;
          break;
        }
        case "WITHDRAWAL": {
          const v = Math.abs(tx.amount ?? 0) * fx;
          cash.set(acc, (cash.get(acc) ?? 0) - v);
          outflow += v;
          netInvested -= v;
          break;
        }
      }
    }

    const isLast = i === days.length - 1;
    const useLive = isLast && opts.live;
    let securities = 0;
    for (const [key, qty] of holdings) {
      if (qty <= EPS) continue;
      const symbol = key.slice(key.indexOf("|") + 1);
      const ccy = currencyOf.get(symbol) ?? "EUR";
      const price = (useLive ? tables.quote(symbol)?.price : undefined) ?? tables.closeOn(symbol, day) ?? lastTradePrice.get(symbol) ?? 0;
      const fx = useLive ? tables.fxNow(ccy) : tables.fxOn(ccy, day);
      securities += qty * price * fx;
    }
    let trackedCash = 0;
    for (const id of tracked) trackedCash += cash.get(id) ?? 0;
    const value = securities + trackedCash;

    const denom = prevValue + inflow;
    let ret = 0;
    if (denom > EPS && Math.abs(denom) > 1e-6 * Math.max(1, Math.abs(value))) {
      ret = (value + outflow) / denom - 1;
      if (!Number.isFinite(ret)) ret = 0;
    }
    twr *= 1 + ret;
    out.push({ day, value, securities, cash: trackedCash, netInvested, inflow, outflow, income, dividends, twr, ret });
    prevValue = value;
  }
  return out;
}

export interface IntradayHolding {
  symbol: string;
  quantity: number;
  currency: string;
}

export interface IntradaySeries {
  t: number[];
  value: number[];
  /** Value at the previous close (for 1D) or at the first point. */
  reference: number;
}

/**
 * Intraday value of the current holdings. Each instrument's last price is
 * carried forward; instruments that have not traded in the window keep their
 * last close. Only the most recent `windowMs` of data is used.
 */
export function computeIntradaySeries(
  holdings: IntradayHolding[],
  seriesBySymbol: Record<string, PriceSeries | undefined>,
  tables: MarketTables,
  opts: { windowMs: number; cash?: number; useFirstAsReference?: boolean; bucketMs?: number },
): IntradaySeries | null {
  const active = holdings.filter((h) => h.quantity > EPS);
  if (!active.length) return null;
  let tMax = 0;
  for (const h of active) {
    const s = seriesBySymbol[h.symbol];
    const last = s?.t[s.t.length - 1];
    if (last && last > tMax) tMax = last;
  }
  if (!tMax) return null;
  const tMin = tMax - opts.windowMs;
  const bucket = opts.bucketMs ?? 5 * 60_000;
  const stamps = new Set<number>();
  for (const h of active) {
    const s = seriesBySymbol[h.symbol];
    if (!s) continue;
    for (const t of s.t) if (t >= tMin) stamps.add(Math.floor(t / bucket) * bucket);
  }
  const timeline = [...stamps].sort((a, b) => a - b);
  if (timeline.length < 2) return null;

  const cash = opts.cash ?? 0;
  const values = new Array<number>(timeline.length).fill(cash);
  let reference = cash;
  for (const h of active) {
    const s = seriesBySymbol[h.symbol];
    const fxNow = tables.fxNow(h.currency);
    const prevClose = tables.previousClose(h.symbol) ?? s?.previousClose ?? tables.lastPrice(h.symbol) ?? 0;
    reference += h.quantity * prevClose * tables.fxPrev(h.currency);
    if (!s || !s.t.length) {
      const p = tables.lastPrice(h.symbol) ?? prevClose;
      for (let i = 0; i < timeline.length; i++) values[i] += h.quantity * p * fxNow;
      continue;
    }
    // Price in effect before the window starts.
    let j = 0;
    let current = s.previousClose ?? s.c[0];
    while (j < s.t.length && s.t[j] < tMin) current = s.c[j++];
    for (let i = 0; i < timeline.length; i++) {
      const edge = timeline[i] + bucket;
      while (j < s.t.length && s.t[j] < edge) current = s.c[j++];
      values[i] += h.quantity * current * fxNow;
    }
  }
  return { t: timeline, value: values, reference: opts.useFirstAsReference ? values[0] : reference };
}

/** Benchmark closes aligned to `days`, converted to base currency. */
export function alignBenchmark(series: PriceSeries | undefined, tables: MarketTables, days: DayKey[]): (number | null)[] {
  if (!series?.c.length) return days.map(() => null);
  const ccy = series.currency;
  const sd = series.d ?? series.t.map((t) => new Date(t).toISOString().slice(0, 10));
  let j = 0;
  let last: number | null = null;
  return days.map((day) => {
    while (j < sd.length && sd[j] <= day) last = series.c[j++];
    return last == null ? null : last * tables.fxOn(ccy, day);
  });
}

/**
 * Value of a hypothetical portfolio that would have invested the same net
 * contributions, on the same days, in the benchmark.
 */
export function simulateSameFlows(points: DailyPoint[], bench: (number | null)[]): (number | null)[] {
  let units = 0;
  let pending = 0;
  return points.map((p, i) => {
    const price = bench[i];
    const contribution = p.inflow - (p.outflow - p.income);
    if (price == null || price <= 0) {
      pending += contribution;
      return null;
    }
    units += (contribution + pending) / price;
    pending = 0;
    if (units < 0) units = 0;
    return units * price;
  });
}

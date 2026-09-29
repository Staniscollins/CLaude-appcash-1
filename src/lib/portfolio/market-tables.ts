import type { DayKey } from "../dates";
import { parentCurrency, SUBUNIT_CURRENCIES } from "../format";
import type { DividendEvent, PriceSeries, Quote } from "../market/types";
import { bisectRight } from "../utils";

/** Yahoo symbol quoting `ccy` in `base` (null when no conversion is needed). */
export function fxPairSymbol(ccy: string, base: string): string | null {
  const parent = parentCurrency(ccy);
  if (parent === base) return null;
  return `${parent}${base}=X`;
}

export function fxSymbolsFor(currencies: Iterable<string>, base: string): string[] {
  const out = new Set<string>();
  for (const c of currencies) {
    const pair = fxPairSymbol(c, base);
    if (pair) out.add(pair);
  }
  return [...out].sort();
}

class SeriesLookup {
  readonly days: DayKey[];
  readonly closes: number[];
  constructor(series: PriceSeries) {
    const days = series.d ?? series.t.map((t) => new Date(t).toISOString().slice(0, 10));
    this.days = days;
    this.closes = series.c;
  }
  /** Close on `day`, or the last close before it. */
  closeOn(day: DayKey): number | undefined {
    const i = bisectRight(this.days, day);
    return i >= 0 ? this.closes[i] : undefined;
  }
  get first(): DayKey | undefined {
    return this.days[0];
  }
  get lastClose(): number | undefined {
    return this.closes[this.closes.length - 1];
  }
}

export interface MarketTables {
  base: string;
  /** Units of base currency per unit of `ccy` on `day`. */
  fxOn(ccy: string, day: DayKey): number;
  fxNow(ccy: string): number;
  fxPrev(ccy: string): number;
  closeOn(symbol: string, day: DayKey): number | undefined;
  firstDay(symbol: string): DayKey | undefined;
  hasHistory(symbol: string): boolean;
  /** Product of split ratios strictly after `day` (1 when none). */
  splitFactorAfter(symbol: string, day: DayKey): number;
  dividends(symbol: string): DividendEvent[];
  quote(symbol: string): Quote | undefined;
  currencyOf(symbol: string): string | undefined;
  /** Latest known price (live quote, else last close). */
  lastPrice(symbol: string): number | undefined;
  previousClose(symbol: string): number | undefined;
}

export function buildMarketTables(opts: {
  base: string;
  quotes: Record<string, Quote>;
  history: Record<string, PriceSeries>;
}): MarketTables {
  const { base, quotes, history } = opts;
  const lookups = new Map<string, SeriesLookup>();
  const lookup = (symbol: string) => {
    let l = lookups.get(symbol);
    if (!l && history[symbol]?.c.length) {
      l = new SeriesLookup(history[symbol]);
      lookups.set(symbol, l);
    }
    return l;
  };

  const subFactor = (ccy: string) => (SUBUNIT_CURRENCIES[ccy] ? 1 / SUBUNIT_CURRENCIES[ccy].factor : 1);

  function pairRate(pair: string, day: DayKey | null): number | undefined {
    if (day) {
      const v = lookup(pair)?.closeOn(day);
      if (v != null) return v;
      const l = lookup(pair);
      if (l && l.first && day < l.first) return l.closes[0];
    }
    const q = quotes[pair];
    if (q?.price) return q.price;
    return lookup(pair)?.lastClose;
  }

  function rate(ccy: string, day: DayKey | null, previous = false): number {
    if (!ccy || ccy === base) return 1;
    const factor = subFactor(ccy);
    const parent = parentCurrency(ccy);
    if (parent === base) return factor;
    const pair = `${parent}${base}=X`;
    if (previous) {
      const q = quotes[pair];
      if (q?.previousClose) return q.previousClose * factor;
    }
    const direct = pairRate(pair, day);
    if (direct != null) return direct * factor;
    const inverse = pairRate(`${base}${parent}=X`, day);
    if (inverse) return factor / inverse;
    return factor;
  }

  const splitCache = new Map<string, { date: DayKey; ratio: number }[]>();
  const splitsOf = (symbol: string) => {
    let s = splitCache.get(symbol);
    if (!s) {
      s = [...(history[symbol]?.splits ?? [])].sort((a, b) => a.date.localeCompare(b.date));
      splitCache.set(symbol, s);
    }
    return s;
  };

  return {
    base,
    fxOn: (ccy, day) => rate(ccy, day),
    fxNow: (ccy) => rate(ccy, null),
    fxPrev: (ccy) => rate(ccy, null, true),
    closeOn: (symbol, day) => lookup(symbol)?.closeOn(day),
    firstDay: (symbol) => lookup(symbol)?.first,
    hasHistory: (symbol) => !!lookup(symbol),
    splitFactorAfter: (symbol, day) => {
      let f = 1;
      for (const s of splitsOf(symbol)) if (s.date > day) f *= s.ratio;
      return f;
    },
    dividends: (symbol) => history[symbol]?.dividends ?? [],
    quote: (symbol) => quotes[symbol],
    currencyOf: (symbol) => quotes[symbol]?.currency ?? history[symbol]?.currency,
    lastPrice: (symbol) => quotes[symbol]?.price ?? lookup(symbol)?.lastClose,
    previousClose: (symbol) => {
      const q = quotes[symbol];
      if (q?.previousClose != null) return q.previousClose;
      const l = lookup(symbol);
      return l ? (l.closes[l.closes.length - 2] ?? l.lastClose) : undefined;
    },
  };
}

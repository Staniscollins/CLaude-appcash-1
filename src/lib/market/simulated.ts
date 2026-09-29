import { addDays, addYears, dayKeyFromUTCDate, type DayKey } from "../dates";
import { hashString } from "../utils";
import {
  CATALOG,
  CATALOG_BY_SYMBOL,
  EUR_PER_UNIT,
  SESSIONS,
  regionFromName,
  searchCatalog,
  type CatalogEntry,
  type SessionId,
} from "./catalog";
import { RANGE_CONFIG, rangeStartMs } from "./ranges";
import { isTradingDay, previousTradingDay, sessionState, zonedParts, zonedTimeToEpoch } from "./sessions";
import type {
  AssetSummary,
  AssetType,
  ChartInterval,
  ChartRange,
  DividendEvent,
  FinancialStatements,
  MarketMovers,
  PriceSeries,
  Quote,
  SearchHit,
  StatementPeriod,
} from "./types";

/**
 * Deterministic market simulator used when Yahoo Finance is unreachable (or when
 * MARKET_DATA_SOURCE=simulated). Every value is a pure function of the symbol and
 * the date, so charts, quotes and history stay consistent across requests.
 * Nothing here is real market data.
 */

const START_DAY: DayKey = "1998-01-02";
const ANCHOR_DAY: DayKey = "2026-01-02";
const TRADING_DAYS = 252;

interface SimParams {
  symbol: string;
  name: string;
  type: AssetType;
  currency: string;
  exchange: string;
  session: SessionId;
  price: number;
  vol: number;
  drift: number;
  beta: number;
  divYield: number;
  divMonths: number[];
  entry?: CatalogEntry;
}

// ——— random primitives ———

/** Avalanche finalizer (lowbias32): nearby inputs give unrelated outputs. */
function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Uniform in (0, 1), independent for each (key, stream) pair. */
export function uniform(key: string, stream = 0): number {
  return (mix32(mix32(hashString(key)) ^ Math.imul(stream + 1, 0x9e3779b9)) + 0.5) / 4294967296;
}

/** Standard normal variate (Box–Muller on two independent streams). */
export function normal(key: string): number {
  const u1 = uniform(key, 1);
  const u2 = uniform(key, 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Fat-tailed shock with unit variance: mostly normal, occasionally amplified. */
function shock(key: string): number {
  const z = normal(key);
  return (uniform(key, 3) < 0.04 ? z * 2.2 : z) / 1.0725;
}

// ——— instrument parameters ———

const FX_RE = /^([A-Z]{3})([A-Z]{3})=X$/;

function suffixDefaults(symbol: string): Pick<SimParams, "currency" | "session" | "exchange"> {
  const s = symbol.toUpperCase();
  if (s.endsWith(".PA")) return { currency: "EUR", session: "EU", exchange: "Euronext Paris" };
  if (s.endsWith(".AS")) return { currency: "EUR", session: "EU", exchange: "Euronext Amsterdam" };
  if (s.endsWith(".BR")) return { currency: "EUR", session: "EU", exchange: "Euronext Bruxelles" };
  if (/\.(DE|F|MU|SG|BE|DU|HM)$/.test(s)) return { currency: "EUR", session: "EU", exchange: "Xetra" };
  if (s.endsWith(".MI")) return { currency: "EUR", session: "EU", exchange: "Borsa Italiana" };
  if (s.endsWith(".MC")) return { currency: "EUR", session: "EU", exchange: "Bolsa de Madrid" };
  if (s.endsWith(".L")) return { currency: "GBp", session: "UK", exchange: "London Stock Exchange" };
  if (s.endsWith(".SW")) return { currency: "CHF", session: "CH", exchange: "SIX Swiss" };
  if (s.endsWith(".CO")) return { currency: "DKK", session: "DK", exchange: "Nasdaq Copenhagen" };
  if (s.endsWith(".T")) return { currency: "JPY", session: "JP", exchange: "Tokyo" };
  if (s.endsWith(".HK")) return { currency: "HKD", session: "HK", exchange: "Hong Kong" };
  const crypto = s.match(/-(EUR|USD|GBP|CHF)$/);
  if (crypto) return { currency: crypto[1], session: "CRYPTO", exchange: "Crypto" };
  return { currency: "USD", session: "US", exchange: "NASDAQ" };
}

function defaultBeta(type: AssetType, entry?: CatalogEntry): number {
  switch (type) {
    case "ETF":
    case "INDEX":
    case "MUTUALFUND":
      if (entry?.sector === "Or") return 0.1;
      if (entry?.symbol === "^VIX") return -0.7;
      if (entry?.symbol === "^TNX") return 0.2;
      return 0.9;
    case "EQUITY":
      return 0.62;
    case "CRYPTOCURRENCY":
      return 0.35;
    case "FUTURE":
      return entry?.symbol === "GC=F" || entry?.symbol === "SI=F" ? 0.1 : 0.3;
    default:
      return 0;
  }
}

const paramsCache = new Map<string, SimParams>();

export function simParams(symbol: string): SimParams {
  const cached = paramsCache.get(symbol);
  if (cached) return cached;
  const entry = CATALOG_BY_SYMBOL[symbol];
  let params: SimParams;
  if (entry) {
    params = {
      symbol,
      name: entry.name,
      type: entry.type,
      currency: entry.currency,
      exchange: entry.exchange,
      session: entry.session,
      price: entry.price,
      vol: entry.vol,
      drift: entry.drift,
      beta: defaultBeta(entry.type, entry),
      divYield: entry.divYield ?? 0,
      divMonths: entry.divMonths ?? [],
      entry,
    };
  } else {
    const fx = symbol.match(FX_RE);
    const h = hashString(symbol);
    const defaults = suffixDefaults(symbol);
    const type: AssetType = fx
      ? "CURRENCY"
      : symbol.startsWith("^")
        ? "INDEX"
        : defaults.session === "CRYPTO"
          ? "CRYPTOCURRENCY"
          : "EQUITY";
    const hasDividend = type === "EQUITY" && h % 3 !== 0;
    params = {
      symbol,
      name: fx ? `${fx[1]}/${fx[2]}` : symbol,
      type,
      currency: fx ? fx[2] : defaults.currency,
      exchange: fx ? "Devises" : defaults.exchange,
      session: fx ? "FX" : defaults.session,
      price: fx ? fxAnchor(fx[1], fx[2]) : 8 + (h % 49_000) / 100,
      vol: fx ? 0.07 : 0.18 + ((h >>> 8) % 30) / 100,
      drift: fx ? 0 : 0.03 + ((h >>> 16) % 10) / 100,
      beta: fx ? 0 : 0.6,
      divYield: hasDividend ? 0.01 + ((h >>> 4) % 40) / 1000 : 0,
      divMonths: hasDividend ? [((h >>> 12) % 12) + 1] : [],
    };
  }
  paramsCache.set(symbol, params);
  return params;
}

function fxAnchor(from: string, to: string): number {
  const a = EUR_PER_UNIT[from] ?? 1;
  const b = EUR_PER_UNIT[to] ?? 1;
  return a / b;
}

// ——— daily paths ———

interface DailyPath {
  days: DayKey[];
  closes: number[];
  opens: number[];
  index: Map<DayKey, number>;
  dividends: DividendEvent[];
}

const pathCache = new Map<string, DailyPath>();

function tradingDaysBetween(session: SessionId, from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  let d = from;
  while (d <= to) {
    if (isTradingDay(session, d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** Deterministic ex-date for a dividend paid in `month` of `year`. */
function dividendDay(symbol: string, year: number, month: number): DayKey {
  const day = 8 + (hashString(`${symbol}|div|${year}|${month}`) % 14);
  return dayKeyFromUTCDate(new Date(Date.UTC(year, month - 1, day)));
}

function buildPath(p: SimParams, lastDay: DayKey): DailyPath {
  const fx = p.symbol.match(FX_RE);
  if (fx) return buildFxPath(p, fx[1], fx[2], lastDay);

  const days = tradingDaysBetween(p.session, START_DAY, lastDay > ANCHOR_DAY ? lastDay : ANCHOR_DAY);
  const n = days.length;
  const perYear = SESSIONS[p.session].everyDay ? 365 : TRADING_DAYS;
  const sigma = p.vol / Math.sqrt(perYear);
  const mu = (p.drift - (p.vol * p.vol) / 2) / perYear;
  const idio = Math.sqrt(Math.max(0, 1 - p.beta * p.beta));

  // Dividend ex-dates snapped to trading days.
  const divDays = new Set<DayKey>();
  if (p.divYield > 0 && p.divMonths.length) {
    const firstYear = Number(START_DAY.slice(0, 4));
    const lastYear = Number(days[n - 1].slice(0, 4));
    for (let y = firstYear; y <= lastYear; y++) {
      for (const m of p.divMonths) {
        let d = dividendDay(p.symbol, y, m);
        while (!isTradingDay(p.session, d)) d = addDays(d, 1);
        divDays.add(d);
      }
    }
  }
  const perPayment = p.divMonths.length ? p.divYield / p.divMonths.length : 0;

  const logRet = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const d = days[i];
    const z = p.beta * shock(`MKT|${d}`) + idio * shock(`${p.symbol}|${d}`);
    let r = mu + sigma * z;
    if (divDays.has(d)) r += Math.log(1 - perPayment);
    logRet[i] = r;
  }

  let anchorIdx = days.indexOf(ANCHOR_DAY);
  if (anchorIdx < 0)
    anchorIdx = Math.min(
      n - 1,
      Math.max(
        0,
        days.findIndex((d) => d > ANCHOR_DAY),
      ),
    );
  const logs = new Float64Array(n);
  logs[anchorIdx] = Math.log(p.price);
  for (let i = anchorIdx + 1; i < n; i++) logs[i] = logs[i - 1] + logRet[i];
  for (let i = anchorIdx - 1; i >= 0; i--) logs[i] = logs[i + 1] - logRet[i + 1];

  const closes: number[] = new Array(n);
  const opens: number[] = new Array(n);
  const dividends: DividendEvent[] = [];
  for (let i = 0; i < n; i++) {
    closes[i] = Math.exp(logs[i]);
    const prev = i > 0 ? closes[i - 1] : closes[i];
    opens[i] = prev * Math.exp(0.25 * sigma * normal(`${p.symbol}|gap|${days[i]}`));
    if (i > 0 && divDays.has(days[i])) {
      dividends.push({ date: days[i], amount: roundTo(prev * perPayment, prev > 20 ? 2 : 4) });
    }
  }

  const keep = days.findIndex((d) => d > lastDay);
  const end = keep < 0 ? n : keep;
  const sliceDays = days.slice(0, end);
  return {
    days: sliceDays,
    closes: closes.slice(0, end),
    opens: opens.slice(0, end),
    index: new Map(sliceDays.map((d, i) => [d, i])),
    dividends: dividends.filter((d) => d.date <= lastDay),
  };
}

const currencyCache = new Map<string, Map<DayKey, number>>();

/** Value of one unit of `ccy` in euros, day by day (weekday calendar). */
function currencyPath(ccy: string, lastDay: DayKey): Map<DayKey, number> {
  const key = `${ccy}|${lastDay}`;
  const cached = currencyCache.get(key);
  if (cached) return cached;
  const days = tradingDaysBetween("FX", START_DAY, lastDay > ANCHOR_DAY ? lastDay : ANCHOR_DAY);
  const base = EUR_PER_UNIT[ccy] ?? 1;
  const map = new Map<DayKey, number>();
  if (ccy === "EUR") {
    for (const d of days) map.set(d, 1);
  } else {
    const vol = ccy === "DKK" ? 0.004 : ccy === "CHF" ? 0.06 : ccy === "JPY" ? 0.09 : 0.075;
    const sigma = vol / Math.sqrt(TRADING_DAYS);
    const anchorIdx = Math.max(0, days.indexOf(ANCHOR_DAY));
    const logs = new Float64Array(days.length);
    logs[anchorIdx] = Math.log(base);
    for (let i = anchorIdx + 1; i < days.length; i++) logs[i] = logs[i - 1] + sigma * normal(`CCY|${ccy}|${days[i]}`);
    for (let i = anchorIdx - 1; i >= 0; i--) logs[i] = logs[i + 1] - sigma * normal(`CCY|${ccy}|${days[i + 1]}`);
    days.forEach((d, i) => map.set(d, Math.exp(logs[i])));
  }
  if (currencyCache.size > 200) currencyCache.clear();
  currencyCache.set(key, map);
  return map;
}

function buildFxPath(p: SimParams, from: string, to: string, lastDay: DayKey): DailyPath {
  const a = currencyPath(from, lastDay);
  const b = currencyPath(to, lastDay);
  const days = tradingDaysBetween("FX", START_DAY, lastDay);
  const closes = days.map((d) => (a.get(d) ?? 1) / (b.get(d) ?? 1));
  const opens = closes.map((c, i) => (i > 0 ? closes[i - 1] : c));
  return { days, closes, opens, index: new Map(days.map((d, i) => [d, i])), dividends: [] };
}

function dailyPath(p: SimParams, lastDay: DayKey): DailyPath {
  const key = `${p.symbol}|${lastDay}`;
  let path = pathCache.get(key);
  if (!path) {
    if (pathCache.size > 600) pathCache.clear();
    path = buildPath(p, lastDay);
    pathCache.set(key, path);
  }
  return path;
}

// ——— intraday ———

const minuteCache = new Map<string, Float64Array>();

/** Minute-level log-price bridge from the session open to the session close. */
function minutePath(p: SimParams, day: DayKey, open: number, close: number): Float64Array {
  const key = `${p.symbol}|${day}|${open.toFixed(6)}|${close.toFixed(6)}`;
  const cached = minuteCache.get(key);
  if (cached) return cached;
  const session = SESSIONS[p.session];
  const len = Math.max(1, Math.round(session.close - session.open));
  // FX crosses share one noise source so that USDEUR is exactly 1 / EURUSD.
  const fx = p.symbol.match(FX_RE);
  const canonical = fx && fx[1] > fx[2] ? `${fx[2]}${fx[1]}=X` : p.symbol;
  const sign = canonical === p.symbol ? 1 : -1;
  const w = new Float64Array(len + 1);
  for (let k = 1; k <= len; k++) w[k] = w[k - 1] + (sign * normal(`${canonical}|${day}|m${k}`)) / Math.sqrt(len);
  const perYear = session.everyDay ? 365 : TRADING_DAYS;
  const sigmaDay = p.vol / Math.sqrt(perYear);
  const lo = Math.log(open);
  const lc = Math.log(close);
  const out = new Float64Array(len + 1);
  for (let k = 0; k <= len; k++) {
    const f = k / len;
    const bridge = w[k] - f * w[len];
    out[k] = lo + f * (lc - lo) + 0.6 * sigmaDay * bridge;
  }
  if (minuteCache.size > 3000) minuteCache.clear();
  minuteCache.set(key, out);
  return out;
}

function priceAtMinute(path: Float64Array, minute: number): number {
  const m = Math.max(0, Math.min(path.length - 1, minute));
  const i = Math.floor(m);
  const j = Math.min(path.length - 1, i + 1);
  const f = m - i;
  return Math.exp(path[i] * (1 - f) + path[j] * f);
}

interface LiveState {
  path: DailyPath;
  lastIdx: number;
  price: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  state: "PRE" | "REGULAR" | "POST" | "CLOSED";
  time: number;
}

function liveState(p: SimParams, now: number): LiveState {
  const ss = sessionState(p.session, now);
  const path = dailyPath(p, ss.lastSessionDay);
  const lastIdx = path.days.length - 1;
  const day = path.days[lastIdx];
  const close = path.closes[lastIdx];
  const open = path.opens[lastIdx];
  const previousClose = lastIdx > 0 ? path.closes[lastIdx - 1] : close;
  const session = SESSIONS[p.session];
  const len = Math.max(1, session.close - session.open);
  const minutes = ss.progress * len;
  const mp = minutePath(p, day, open, close);
  const price = priceAtMinute(mp, minutes);
  let hi = -Infinity;
  let lo = Infinity;
  for (let k = 0; k <= Math.min(mp.length - 1, Math.floor(minutes)); k++) {
    const v = Math.exp(mp[k]);
    if (v > hi) hi = v;
    if (v < lo) lo = v;
  }
  hi = Math.max(hi, price);
  lo = Math.min(lo, price);
  const time = ss.progress < 1 ? now : zonedTimeToEpoch(day, session.close, session.tz);
  return { path, lastIdx, price, previousClose, open, dayHigh: hi, dayLow: lo, state: ss.state, time };
}

// ——— public API ———

function roundTo(value: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function tzOf(p: SimParams) {
  return SESSIONS[p.session].tz;
}

export function simQuote(symbol: string, now = Date.now()): Quote {
  const p = simParams(symbol);
  const live = liveState(p, now);
  const { path, lastIdx } = live;
  const start = Math.max(0, lastIdx - 251);
  let hi52 = -Infinity;
  let lo52 = Infinity;
  for (let i = start; i <= lastIdx; i++) {
    const c = i === lastIdx ? live.price : path.closes[i];
    if (c > hi52) hi52 = c;
    if (c < lo52) lo52 = c;
  }
  const avg = (n: number) => {
    const from = Math.max(0, lastIdx - n + 1);
    let s = 0;
    for (let i = from; i <= lastIdx; i++) s += path.closes[i];
    return s / (lastIdx - from + 1);
  };
  const entry = p.entry;
  const perShareDiv = p.divYield * live.price;
  const pe = entry?.pe;
  const turnover = 0.004 * (0.6 + uniform(`${symbol}|vol|${path.days[lastIdx]}`));
  const marketCap = entry?.marketCap ? (entry.marketCap * live.price) / p.price : p.type === "EQUITY" ? live.price * 2e8 : null;
  const volume = marketCap ? Math.round((marketCap * turnover) / live.price) : null;
  const nextDiv = nextDividendDate(p, path.days[lastIdx]);
  const change = live.price - live.previousClose;

  return {
    symbol,
    name: p.name,
    shortName: p.name,
    type: p.type,
    currency: p.currency,
    exchange: p.exchange,
    timezone: tzOf(p),
    marketState: live.state,
    price: live.price,
    previousClose: live.previousClose,
    change,
    changePercent: live.previousClose ? change / live.previousClose : 0,
    open: live.open,
    dayHigh: live.dayHigh,
    dayLow: live.dayLow,
    volume: volume ? Math.round(volume * (live.state === "REGULAR" ? 0.6 : 1)) : null,
    avgVolume: volume,
    marketCap,
    pe: pe ?? null,
    forwardPe: pe ? pe * 0.88 : null,
    eps: pe ? live.price / pe : null,
    dividendRate: perShareDiv > 0 ? roundTo(perShareDiv, 2) : null,
    dividendYield: p.divYield > 0 ? p.divYield : null,
    exDividendDate: nextDiv,
    earningsDate: p.type === "EQUITY" ? nextEarningsDate(p, now) : null,
    fiftyTwoWeekLow: lo52,
    fiftyTwoWeekHigh: hi52,
    fiftyDayAverage: avg(50),
    twoHundredDayAverage: avg(200),
    beta: p.type === "EQUITY" ? roundTo(p.beta * (p.vol / 0.16), 2) : null,
    priceToBook: pe ? roundTo(pe / 5, 2) : null,
    expenseRatio: p.type === "ETF" ? 0.0012 + (hashString(symbol) % 30) / 10_000 : null,
    extended: null,
    time: live.time,
    logoUrl: null,
    analystRating: null,
  };
}

function nextDividendDate(p: SimParams, fromDay: DayKey): number | null {
  if (!p.divYield || !p.divMonths.length) return null;
  const year = Number(fromDay.slice(0, 4));
  for (const y of [year, year + 1]) {
    for (const m of [...p.divMonths].sort((a, b) => a - b)) {
      const d = dividendDay(p.symbol, y, m);
      if (d > fromDay) return Date.parse(`${d}T12:00:00Z`);
    }
  }
  return null;
}

function nextEarningsDate(p: SimParams, now: number): number {
  const d = new Date(now);
  const q = Math.floor(d.getUTCMonth() / 3);
  const offset = 20 + (hashString(`${p.symbol}|earn`) % 18);
  let t = Date.UTC(d.getUTCFullYear(), q * 3 + 1, 1) + offset * 86_400_000;
  if (t < now) t += 91 * 86_400_000;
  return t;
}

export function simQuotes(symbols: string[], now = Date.now()): Record<string, Quote> {
  const out: Record<string, Quote> = {};
  for (const s of symbols) out[s] = simQuote(s, now);
  return out;
}

function aggregate(days: DayKey[], values: number[], opens: number[], interval: ChartInterval) {
  const keyOf = (d: DayKey) => {
    if (interval === "1mo") return d.slice(0, 7);
    const date = new Date(`${d}T00:00:00Z`);
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000);
    return monday.toISOString().slice(0, 10);
  };
  const out: { day: DayKey; open: number; high: number; low: number; close: number }[] = [];
  let current: (typeof out)[number] | null = null;
  let currentKey = "";
  days.forEach((d, i) => {
    const k = keyOf(d);
    if (k !== currentKey) {
      if (current) out.push(current);
      currentKey = k;
      current = { day: d, open: opens[i], high: Math.max(opens[i], values[i]), low: Math.min(opens[i], values[i]), close: values[i] };
    } else if (current) {
      current.high = Math.max(current.high, values[i]);
      current.low = Math.min(current.low, values[i]);
      current.close = values[i];
    }
  });
  if (current) out.push(current);
  return out;
}

interface SeriesRequest {
  range?: ChartRange;
  from?: DayKey;
  interval?: ChartInterval;
}

export function simSeries(symbol: string, req: SeriesRequest, now = Date.now()): PriceSeries {
  const p = simParams(symbol);
  const live = liveState(p, now);
  const { path } = live;
  const tz = tzOf(p);
  const session = SESSIONS[p.session];
  const perYear = session.everyDay ? 365 : TRADING_DAYS;
  const sigma = p.vol / Math.sqrt(perYear);
  const baseVolume = ((p.entry?.marketCap ?? p.price * 2e8) / p.price) * 0.004;

  const closes = path.closes.slice();
  closes[live.lastIdx] = live.price;

  const cfg = req.range ? RANGE_CONFIG[req.range] : null;
  const interval: ChartInterval = req.interval ?? cfg?.interval ?? "1d";
  const intraday = ["5m", "15m", "30m", "1h"].includes(interval);

  const series: PriceSeries = {
    symbol,
    currency: p.currency,
    interval,
    intraday,
    timezone: tz,
    t: [],
    c: [],
    o: [],
    h: [],
    l: [],
    v: [],
    dividends: [],
    splits: [],
  };

  if (intraday) {
    const step = interval === "5m" ? 5 : interval === "15m" ? 15 : interval === "30m" ? 30 : 60;
    const startMs = req.range ? rangeStartMs(req.range, now) : Date.parse(`${req.from ?? addDays(path.days[live.lastIdx], -5)}T00:00:00Z`);
    const startDay = zonedParts(startMs, tz).day;
    let dayIdxs = path.days.map((d, i) => [d, i] as const).filter(([d]) => d >= startDay);
    if (cfg?.sessions) dayIdxs = dayIdxs.slice(-cfg.sessions);
    const len = session.close - session.open;
    for (const [day, i] of dayIdxs) {
      const isLast = i === live.lastIdx;
      const mp = minutePath(p, day, path.opens[i], path.closes[i]);
      const upTo = isLast ? Math.floor((now - zonedTimeToEpoch(day, session.open, tz)) / 60_000) : len;
      const maxMinute = Math.min(len, upTo);
      for (let m = 0; m <= maxMinute; m += step) {
        const segEnd = Math.min(m + step, maxMinute);
        let hi = -Infinity;
        let lo = Infinity;
        for (let k = m; k <= segEnd; k++) {
          const v = Math.exp(mp[k]);
          hi = Math.max(hi, v);
          lo = Math.min(lo, v);
        }
        series.t.push(zonedTimeToEpoch(day, session.open + m, tz));
        series.o!.push(Math.exp(mp[m]));
        series.c.push(isLast && segEnd === maxMinute ? live.price : Math.exp(mp[segEnd]));
        series.h!.push(hi);
        series.l!.push(lo);
        series.v!.push(Math.round((baseVolume / (len / step)) * (0.5 + uniform(`${symbol}|${day}|v${m}`))));
      }
    }
    const firstDay = dayIdxs[0]?.[1];
    series.previousClose = firstDay != null && firstDay > 0 ? path.closes[firstDay - 1] : null;
    return series;
  }

  const fromDay: DayKey = req.from ?? zonedParts(rangeStartMs(req.range ?? "1y", now), tz).day;
  const idx0 = Math.max(
    0,
    path.days.findIndex((d) => d >= fromDay),
  );
  const days = path.days.slice(idx0);
  const values = closes.slice(idx0);
  const opens = path.opens.slice(idx0);
  const hl = (i: number, o: number, c: number) => {
    const k = `${symbol}|hl|${days[i]}`;
    return {
      h: Math.max(o, c) * Math.exp(Math.abs(normal(`${k}h`)) * sigma * 0.35),
      l: Math.min(o, c) * Math.exp(-Math.abs(normal(`${k}l`)) * sigma * 0.35),
    };
  };

  if (interval === "1d") {
    series.d = days;
    days.forEach((d, i) => {
      const { h, l } = hl(i, opens[i], values[i]);
      series.t.push(zonedTimeToEpoch(d, session.open, tz));
      series.o!.push(opens[i]);
      series.c.push(values[i]);
      series.h!.push(h);
      series.l!.push(l);
      series.v!.push(Math.round(baseVolume * (0.55 + uniform(`${symbol}|${d}|v`))));
    });
  } else {
    const agg = aggregate(days, values, opens, interval);
    series.d = agg.map((a) => a.day);
    for (const a of agg) {
      series.t.push(zonedTimeToEpoch(a.day, session.open, tz));
      series.o!.push(a.open);
      series.h!.push(a.high);
      series.l!.push(a.low);
      series.c.push(a.close);
      series.v!.push(Math.round(baseVolume * (interval === "1wk" ? 5 : 21) * (0.55 + uniform(`${symbol}|${a.day}|v`))));
    }
  }
  series.previousClose = idx0 > 0 ? path.closes[idx0 - 1] : null;
  series.dividends = path.dividends.filter((d) => d.date >= fromDay);
  return series;
}

// ——— fundamentals ———

const SECTOR_PROFILE: Record<string, { ps: number; gross: number; op: number; net: number }> = {
  Technology: { ps: 8, gross: 0.62, op: 0.3, net: 0.24 },
  "Communication Services": { ps: 5, gross: 0.58, op: 0.28, net: 0.22 },
  "Consumer Cyclical": { ps: 2.5, gross: 0.45, op: 0.15, net: 0.1 },
  "Consumer Defensive": { ps: 2.2, gross: 0.48, op: 0.17, net: 0.11 },
  Healthcare: { ps: 4.5, gross: 0.7, op: 0.24, net: 0.17 },
  "Financial Services": { ps: 3.2, gross: 0.9, op: 0.35, net: 0.24 },
  Industrials: { ps: 2.3, gross: 0.3, op: 0.13, net: 0.09 },
  Energy: { ps: 1.1, gross: 0.3, op: 0.13, net: 0.09 },
  Utilities: { ps: 1.4, gross: 0.35, op: 0.14, net: 0.08 },
  "Real Estate": { ps: 9, gross: 0.9, op: 0.45, net: 0.22 },
  "Basic Materials": { ps: 2.8, gross: 0.4, op: 0.18, net: 0.12 },
};

function sectorProfile(p: SimParams) {
  return SECTOR_PROFILE[p.entry?.sector ?? ""] ?? { ps: 3, gross: 0.4, op: 0.16, net: 0.1 };
}

const WORLD_SECTORS: { sector: string; weight: number }[] = [
  { sector: "technology", weight: 0.27 },
  { sector: "financial_services", weight: 0.16 },
  { sector: "healthcare", weight: 0.1 },
  { sector: "consumer_cyclical", weight: 0.1 },
  { sector: "industrials", weight: 0.11 },
  { sector: "communication_services", weight: 0.08 },
  { sector: "consumer_defensive", weight: 0.06 },
  { sector: "energy", weight: 0.04 },
  { sector: "basic_materials", weight: 0.03 },
  { sector: "utilities", weight: 0.03 },
  { sector: "realestate", weight: 0.02 },
];

const US_SECTORS: { sector: string; weight: number }[] = [
  { sector: "technology", weight: 0.33 },
  { sector: "financial_services", weight: 0.13 },
  { sector: "communication_services", weight: 0.1 },
  { sector: "consumer_cyclical", weight: 0.1 },
  { sector: "healthcare", weight: 0.09 },
  { sector: "industrials", weight: 0.08 },
  { sector: "consumer_defensive", weight: 0.05 },
  { sector: "energy", weight: 0.03 },
  { sector: "utilities", weight: 0.03 },
  { sector: "realestate", weight: 0.02 },
  { sector: "basic_materials", weight: 0.02 },
];

const WORLD_HOLDINGS = [
  ["NVDA", "NVIDIA Corp", 0.052],
  ["MSFT", "Microsoft Corp", 0.045],
  ["AAPL", "Apple Inc", 0.043],
  ["AMZN", "Amazon.com Inc", 0.027],
  ["META", "Meta Platforms Inc", 0.019],
  ["AVGO", "Broadcom Inc", 0.017],
  ["GOOGL", "Alphabet Inc Class A", 0.015],
  ["TSLA", "Tesla Inc", 0.012],
  ["JPM", "JPMorgan Chase & Co", 0.01],
  ["LLY", "Eli Lilly and Co", 0.008],
] as const;

export function simSummary(symbol: string, now = Date.now()): AssetSummary {
  const p = simParams(symbol);
  const q = simQuote(symbol, now);
  const e = p.entry;
  const prof = sectorProfile(p);
  const h = hashString(symbol);
  const isStock = p.type === "EQUITY";
  const marketCap = q.marketCap ?? undefined;
  const revenue = marketCap ? marketCap / prof.ps : undefined;
  const summary: AssetSummary = {
    symbol,
    name: p.name,
    type: p.type,
    currency: p.currency,
    exchange: p.exchange,
    profile: {
      sector: e?.sector,
      industry: e?.industry,
      country: e?.country,
      website: e?.website,
      employees: e?.employees,
      description:
        e?.description ??
        (p.type === "CURRENCY"
          ? `Taux de change ${p.name}.`
          : p.type === "INDEX"
            ? `Indice boursier ${p.name}.`
            : `${p.name} — fiche générée en mode démonstration.`),
      officers: isStock
        ? [
            { name: "Direction générale", title: "Directeur général" },
            { name: "Direction financière", title: "Directeur financier" },
          ]
        : undefined,
    },
    stats: {
      marketCap,
      enterpriseValue: marketCap ? marketCap * 1.05 : undefined,
      pe: q.pe ?? undefined,
      forwardPe: q.forwardPe ?? undefined,
      peg: q.pe ? roundTo(q.pe / (8 + (h % 12)), 2) : undefined,
      priceToBook: q.priceToBook ?? undefined,
      priceToSales: isStock ? prof.ps : undefined,
      evToEbitda: q.pe ? roundTo(q.pe * 0.62, 1) : undefined,
      evToRevenue: isStock ? roundTo(prof.ps * 1.05, 2) : undefined,
      eps: q.eps ?? undefined,
      forwardEps: q.eps ? q.eps * 1.1 : undefined,
      beta: q.beta ?? undefined,
      sharesOutstanding: marketCap ? marketCap / q.price : undefined,
      floatShares: marketCap ? (marketCap / q.price) * 0.92 : undefined,
      shortPercentOfFloat: isStock ? 0.005 + (h % 30) / 1000 : undefined,
      heldByInsiders: isStock ? 0.002 + (h % 80) / 1000 : undefined,
      heldByInstitutions: isStock ? 0.4 + (h % 40) / 100 : undefined,
      dividendRate: q.dividendRate ?? undefined,
      dividendYield: q.dividendYield ?? undefined,
      payoutRatio: q.dividendYield && q.pe ? Math.min(1.2, q.dividendYield * q.pe) : undefined,
      fiveYearAvgDividendYield: q.dividendYield ? q.dividendYield * 0.95 : undefined,
      exDividendDate: q.exDividendDate ?? undefined,
      profitMargin: isStock ? prof.net : undefined,
      operatingMargin: isStock ? prof.op : undefined,
      grossMargin: isStock ? prof.gross : undefined,
      ebitdaMargin: isStock ? prof.op * 1.25 : undefined,
      returnOnEquity: isStock ? 0.08 + (h % 25) / 100 : undefined,
      returnOnAssets: isStock ? 0.03 + (h % 10) / 100 : undefined,
      revenueGrowth: isStock ? p.drift - 0.02 + ((h >>> 3) % 8) / 100 : undefined,
      earningsGrowth: isStock ? p.drift - 0.03 + ((h >>> 5) % 12) / 100 : undefined,
      totalCash: revenue ? revenue * 0.18 : undefined,
      totalDebt: revenue ? revenue * 0.3 : undefined,
      debtToEquity: isStock ? 30 + (h % 120) : undefined,
      currentRatio: isStock ? 0.9 + (h % 20) / 10 : undefined,
      quickRatio: isStock ? 0.6 + (h % 15) / 10 : undefined,
      freeCashflow: revenue ? revenue * prof.net * 0.95 : undefined,
      operatingCashflow: revenue ? revenue * prof.net * 1.3 : undefined,
      revenue,
      ebitda: revenue ? revenue * prof.op * 1.25 : undefined,
      averageVolume: q.avgVolume ?? undefined,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? undefined,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? undefined,
      financialCurrency: p.currency === "GBp" ? "GBP" : p.currency,
    },
    calendar: {
      exDividendDate: q.exDividendDate ?? undefined,
      earningsDate: q.earningsDate ?? undefined,
    },
  };

  if (isStock) {
    const base = 8 + (h % 20);
    const trend = [0, 1, 2, 3].map((k) => {
      const hh = hashString(`${symbol}|rec|${k}`);
      const strongBuy = Math.max(0, Math.round(base * 0.25 + (hh % 5) - 2));
      const buy = Math.round(base * 0.4 + ((hh >>> 4) % 4));
      const hold = Math.round(base * 0.28 + ((hh >>> 8) % 4));
      const sell = (hh >>> 12) % 3;
      return { period: k === 0 ? "0m" : `-${k}m`, strongBuy, buy, hold, sell, strongSell: (hh >>> 14) % 2 };
    });
    const t0 = trend[0];
    const count = t0.strongBuy + t0.buy + t0.hold + t0.sell + t0.strongSell;
    const mean = (t0.strongBuy * 1 + t0.buy * 2 + t0.hold * 3 + t0.sell * 4 + t0.strongSell * 5) / Math.max(1, count);
    const upside = 0.04 + ((h >>> 6) % 18) / 100;
    summary.analysts = {
      recommendationMean: roundTo(mean, 2),
      recommendationKey: mean < 1.8 ? "strong_buy" : mean < 2.5 ? "buy" : mean < 3.3 ? "hold" : "sell",
      analystCount: count,
      targetLow: q.price * (1 + upside - 0.28),
      targetMean: q.price * (1 + upside),
      targetMedian: q.price * (1 + upside - 0.01),
      targetHigh: q.price * (1 + upside + 0.3),
      trend,
      changes: [0, 1, 2, 3, 4].map((k) => {
        const hh = hashString(`${symbol}|chg|${k}`);
        const firms = ["Morgan Stanley", "Goldman Sachs", "BNP Paribas Exane", "UBS", "Jefferies", "Barclays", "Oddo BHF", "Deutsche Bank"];
        const up = hh % 3 !== 0;
        return {
          date: now - (k * 17 + (hh % 12)) * 86_400_000,
          firm: firms[hh % firms.length],
          action: k % 2 === 0 ? "main" : up ? "up" : "down",
          fromGrade: up ? "Neutral" : "Buy",
          toGrade: k % 2 === 0 ? "Buy" : up ? "Buy" : "Neutral",
          priceTarget: roundTo(q.price * (1 + upside + ((hh % 20) - 10) / 100), 2),
        };
      }),
    };
    summary.earnings = {
      nextDate: q.earningsDate ?? undefined,
      nextEpsEstimate: q.eps ? roundTo((q.eps / 4) * 1.05, 2) : undefined,
      nextRevenueEstimate: revenue ? (revenue / 4) * 1.03 : undefined,
      history: [7, 6, 5, 4, 3, 2, 1, 0].map((k) => {
        const d = new Date(now);
        const quarterEnd = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 - 3 * k, 0));
        const estimate = q.eps ? (q.eps / 4) * Math.pow(1 + p.drift / 4, -k) : 1;
        const surprise = normal(`${symbol}|eps|${k}`) * 0.06 + 0.02;
        const qn = Math.floor(quarterEnd.getUTCMonth() / 3) + 1;
        return {
          label: `T${qn} ${quarterEnd.getUTCFullYear()}`,
          date: quarterEnd.getTime() + 25 * 86_400_000,
          estimate: roundTo(estimate, 2),
          actual: roundTo(estimate * (1 + surprise), 2),
          surprise: roundTo(surprise, 4),
        };
      }),
    };
  }

  if (p.type === "ETF" || p.type === "MUTUALFUND") {
    const region = e?.region ?? regionFromName(p.name) ?? "Monde";
    const isGold = e?.sector === "Or";
    summary.fund = {
      family: p.name.split(" ")[0],
      category: e?.sector ?? "ETF",
      expenseRatio: q.expenseRatio ?? undefined,
      totalAssets: 1e9 * (1 + (h % 80)),
      inceptionDate: Date.UTC(2005 + (h % 15), h % 12, 1),
      ytdReturn: undefined,
      holdings: isGold ? [] : WORLD_HOLDINGS.map(([s, n, w]) => ({ symbol: s, name: n, weight: region === "États-Unis" ? w * 1.4 : w })),
      sectors: isGold ? [] : region === "États-Unis" ? US_SECTORS : WORLD_SECTORS,
      stockPosition: isGold ? 0 : 0.995,
      bondPosition: 0,
      cashPosition: isGold ? 0 : 0.005,
    };
  }
  return summary;
}

export function simFinancials(symbol: string, period: StatementPeriod, now = Date.now()): FinancialStatements {
  const p = simParams(symbol);
  const q = simQuote(symbol, now);
  const prof = sectorProfile(p);
  const currency = p.currency === "GBp" ? "GBP" : p.currency;
  const out: FinancialStatements = { symbol, currency, period, income: [], balance: [], cashflow: [] };
  if (p.type !== "EQUITY" || !q.marketCap) return out;
  const annualRevenue = q.marketCap / prof.ps;
  const count = period === "annual" ? 5 : 8;
  const today = new Date(now);
  const growth = Math.max(-0.05, p.drift - 0.02);
  for (let k = count - 1; k >= 0; k--) {
    let date: string;
    let scale: number;
    if (period === "annual") {
      date = `${today.getUTCFullYear() - 1 - k}-12-31`;
      scale = Math.pow(1 + growth, -k);
    } else {
      const end = new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3 - 3 * k, 0));
      date = end.toISOString().slice(0, 10);
      scale = Math.pow(1 + growth, -k / 4) / 4;
    }
    const noise = 1 + normal(`${symbol}|fin|${period}|${k}`) * 0.04;
    const rev = annualRevenue * scale * noise;
    const netMargin = prof.net * (1 + normal(`${symbol}|nm|${period}|${k}`) * 0.08);
    const net = rev * netMargin;
    const shares = q.marketCap / q.price;
    out.income.push({
      date,
      totalRevenue: rev,
      costOfRevenue: rev * (1 - prof.gross),
      grossProfit: rev * prof.gross,
      researchAndDevelopment: p.entry?.sector === "Technology" || p.entry?.sector === "Healthcare" ? rev * 0.14 : undefined,
      sellingGeneralAndAdministration: rev * 0.12,
      operatingExpense: rev * (prof.gross - prof.op),
      operatingIncome: rev * prof.op,
      EBITDA: rev * prof.op * 1.25,
      pretaxIncome: net / 0.77,
      taxProvision: (net / 0.77) * 0.23,
      netIncome: net,
      dilutedEPS: net / shares,
      dilutedAverageShares: shares,
    });
    const assets = annualRevenue * Math.pow(1 + growth, -k / (period === "annual" ? 1 : 4)) * 1.6;
    out.balance.push({
      date,
      totalAssets: assets,
      currentAssets: assets * 0.35,
      cashAndCashEquivalents: assets * 0.11,
      totalLiabilitiesNetMinorityInterest: assets * 0.58,
      currentLiabilities: assets * 0.24,
      totalDebt: assets * 0.22,
      longTermDebt: assets * 0.17,
      netDebt: assets * 0.11,
      stockholdersEquity: assets * 0.42,
    });
    const ocf = net * 1.3;
    const capex = -rev * 0.06;
    out.cashflow.push({
      date,
      operatingCashFlow: ocf,
      investingCashFlow: capex * 1.4,
      financingCashFlow: -net * 0.8,
      capitalExpenditure: capex,
      freeCashFlow: ocf + capex,
      cashDividendsPaid: p.divYield ? -q.marketCap * p.divYield * scale : undefined,
      repurchaseOfCapitalStock: -net * 0.3,
    });
  }
  return out;
}

export function simSearch(query: string): SearchHit[] {
  return searchCatalog(query, 12).map((e) => ({
    symbol: e.symbol,
    name: e.name,
    type: e.type,
    exchange: e.exchange,
    sector: e.sector,
    industry: e.industry,
  }));
}

export function simMovers(now = Date.now()): MarketMovers {
  const equities = CATALOG.filter((e) => e.type === "EQUITY").map((e) => simQuote(e.symbol, now));
  const sorted = [...equities].sort((a, b) => b.changePercent - a.changePercent);
  return {
    gainers: sorted.slice(0, 8),
    losers: sorted.slice(-8).reverse(),
    active: [...equities].sort((a, b) => (b.volume ?? 0) * b.price - (a.volume ?? 0) * a.price).slice(0, 8),
    trending: ["NVDA", "MC.PA", "TSLA", "ASML.AS", "AIR.PA", "BTC-EUR"].map((s) => simQuote(s, now)),
  };
}

/** Dividends of a symbol since a date (used by history requests). */
export function simDividends(symbol: string, from: DayKey, now = Date.now()): DividendEvent[] {
  const p = simParams(symbol);
  const live = liveState(p, now);
  return live.path.dividends.filter((d) => d.date >= from);
}

export function simFirstDay(): DayKey {
  return addYears(START_DAY, 0);
}

export { previousTradingDay };

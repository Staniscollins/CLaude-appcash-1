import { diffDays, type DayKey } from "../dates";
import type { DailyPoint } from "./history";

export const TRADING_DAYS_PER_YEAR = 252;

export interface PeriodSlice {
  /** Point just before the period (reference), if any. */
  base?: DailyPoint;
  points: DailyPoint[];
}

/** Points of the period starting at `start`, plus the reference point before it. */
export function slicePeriod(points: DailyPoint[], start: DayKey | null): PeriodSlice {
  if (!points.length) return { points: [] };
  if (!start || start <= points[0].day) return { points };
  const idx = points.findIndex((p) => p.day >= start);
  if (idx < 0) return { base: points[points.length - 1], points: [] };
  return { base: idx > 0 ? points[idx - 1] : undefined, points: points.slice(idx) };
}

export interface PeriodSummary {
  startDay: DayKey;
  endDay: DayKey;
  startValue: number;
  endValue: number;
  netContributions: number;
  income: number;
  dividends: number;
  /** Gain over the period, contributions excluded, income included. */
  pnl: number;
  /** Time-weighted return over the period. */
  twr: number;
  /** Annualized TWR (only meaningful for periods ≥ 1 year). */
  annualizedTwr: number | null;
  /** Money-weighted return (annualized IRR). */
  mwr: number | null;
  years: number;
}

export function summarizePeriod(slice: PeriodSlice): PeriodSummary | null {
  const { base, points } = slice;
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const startValue = base?.value ?? 0;
  const startNet = base?.netInvested ?? 0;
  const twrStart = base?.twr ?? first.twr / (1 + first.ret);
  const twr = last.twr / twrStart - 1;
  const startDay = base?.day ?? first.day;
  const years = Math.max(diffDays(startDay, last.day), 1) / 365.25;
  let income = 0;
  let dividends = 0;
  for (const p of points) {
    income += p.income;
    dividends += p.dividends;
  }
  const netContributions = last.netInvested - startNet;
  const pnl = last.value - startValue - netContributions + income;
  return {
    startDay,
    endDay: last.day,
    startValue,
    endValue: last.value,
    netContributions,
    income,
    dividends,
    pnl,
    twr,
    annualizedTwr: years >= 0.999 ? Math.pow(1 + twr, 1 / years) - 1 : null,
    mwr: periodMwr(slice),
    years,
  };
}

export interface CashFlow {
  day: DayKey;
  /** Investor perspective: negative = money put in, positive = money received. */
  amount: number;
}

/** Annualized internal rate of return of dated cash flows (XIRR). */
export function xirr(flows: CashFlow[]): number | null {
  const cfs = flows.filter((f) => Math.abs(f.amount) > 1e-9);
  if (cfs.length < 2) return null;
  const hasNeg = cfs.some((f) => f.amount < 0);
  const hasPos = cfs.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const t0 = cfs[0].day;
  const times = cfs.map((f) => diffDays(t0, f.day) / 365);
  if (times[times.length - 1] <= 0) return null;
  const npv = (r: number) => cfs.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, times[i]), 0);
  const dnpv = (r: number) => cfs.reduce((s, f, i) => s - (times[i] * f.amount) / Math.pow(1 + r, times[i] + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    const v = npv(r);
    const d = dnpv(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  // Bisection fallback.
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** Money-weighted return over a period: starting value as an investment, then every flow, then the end value. */
export function periodMwr(slice: PeriodSlice): number | null {
  const { base, points } = slice;
  if (!points.length) return null;
  const flows: CashFlow[] = [];
  if (base && base.value > 0) flows.push({ day: base.day, amount: -base.value });
  for (const p of points) {
    const contributionIn = p.inflow;
    const contributionOut = p.outflow;
    const net = contributionOut - contributionIn;
    if (Math.abs(net) > 1e-9) flows.push({ day: p.day, amount: net });
  }
  const last = points[points.length - 1];
  flows.push({ day: last.day, amount: last.value });
  // Merge same-day flows to keep the solver well conditioned.
  const merged: CashFlow[] = [];
  for (const f of flows) {
    const prev = merged[merged.length - 1];
    if (prev && prev.day === f.day) prev.amount += f.amount;
    else merged.push({ ...f });
  }
  const years = diffDays(merged[0].day, last.day) / 365.25;
  const r = xirr(merged);
  if (r == null) return null;
  // Short periods: report the de-annualized return to avoid absurd figures.
  return years < 1 ? Math.pow(1 + r, years) - 1 : r;
}

export interface RiskMetrics {
  volatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number;
  maxDrawdownPeak?: DayKey;
  maxDrawdownTrough?: DayKey;
  maxDrawdownRecovery?: DayKey | null;
  currentDrawdown: number;
  beta: number | null;
  alpha: number | null;
  correlation: number | null;
  trackingError: number | null;
  informationRatio: number | null;
  bestDay: { day: DayKey; ret: number } | null;
  worstDay: { day: DayKey; ret: number } | null;
  positiveDays: number | null;
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Risk statistics of the daily TWR returns of a period. `benchmark` holds the
 * benchmark closes aligned with `points` (base currency).
 */
export function riskMetrics(
  points: DailyPoint[],
  opts: { riskFree: number; benchmark?: (number | null)[]; annualizedReturn?: number | null; benchmarkAnnualized?: number | null },
): RiskMetrics {
  const rets = points.slice(1).map((p) => p.ret);
  const n = rets.length;
  const ann = Math.sqrt(TRADING_DAYS_PER_YEAR);
  const vol = n >= 10 ? stdev(rets) * ann : null;
  const rfDaily = Math.pow(1 + opts.riskFree, 1 / TRADING_DAYS_PER_YEAR) - 1;
  const annualized = opts.annualizedReturn ?? (n >= 10 ? Math.pow(points[n].twr / points[0].twr, TRADING_DAYS_PER_YEAR / n) - 1 : null);
  const downside = rets.map((r) => Math.min(0, r - rfDaily));
  const downDev = n >= 10 ? Math.sqrt(downside.reduce((s, x) => s + x * x, 0) / n) * ann : null;

  // Drawdowns on the TWR index.
  let peak = points[0]?.twr ?? 1;
  let peakDay = points[0]?.day;
  let maxDd = 0;
  let ddPeak: DayKey | undefined;
  let ddTrough: DayKey | undefined;
  for (const p of points) {
    if (p.twr > peak) {
      peak = p.twr;
      peakDay = p.day;
    }
    const dd = p.twr / peak - 1;
    if (dd < maxDd) {
      maxDd = dd;
      ddPeak = peakDay;
      ddTrough = p.day;
    }
  }
  let recovery: DayKey | null = null;
  if (ddTrough) {
    const peakValue = points.find((p) => p.day === ddPeak)?.twr ?? peak;
    recovery = points.find((p) => p.day > (ddTrough as string) && p.twr >= peakValue)?.day ?? null;
  }
  const last = points[points.length - 1];
  const currentDd = last ? last.twr / Math.max(...points.map((p) => p.twr)) - 1 : 0;

  let beta: number | null = null;
  let alpha: number | null = null;
  let correlation: number | null = null;
  let trackingError: number | null = null;
  let informationRatio: number | null = null;
  if (opts.benchmark && n >= 20) {
    const pairs: [number, number][] = [];
    for (let i = 1; i < points.length; i++) {
      const b0 = opts.benchmark[i - 1];
      const b1 = opts.benchmark[i];
      if (b0 && b1) pairs.push([points[i].ret, b1 / b0 - 1]);
    }
    if (pairs.length >= 20) {
      const xs = pairs.map((p) => p[1]);
      const ys = pairs.map((p) => p[0]);
      const mx = mean(xs);
      const my = mean(ys);
      let cov = 0;
      let vx = 0;
      let vy = 0;
      for (let i = 0; i < pairs.length; i++) {
        cov += (xs[i] - mx) * (ys[i] - my);
        vx += (xs[i] - mx) ** 2;
        vy += (ys[i] - my) ** 2;
      }
      beta = vx > 0 ? cov / vx : null;
      correlation = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null;
      const diffs = pairs.map((p) => p[0] - p[1]);
      trackingError = stdev(diffs) * ann;
      const benchAnn =
        opts.benchmarkAnnualized ??
        Math.pow(
          xs.reduce((s, x) => s * (1 + x), 1),
          TRADING_DAYS_PER_YEAR / xs.length,
        ) - 1;
      if (annualized != null && beta != null) alpha = annualized - (opts.riskFree + beta * (benchAnn - opts.riskFree));
      if (annualized != null && trackingError > 0) informationRatio = (annualized - benchAnn) / trackingError;
    }
  }

  let best: RiskMetrics["bestDay"] = null;
  let worst: RiskMetrics["worstDay"] = null;
  let positive = 0;
  for (let i = 1; i < points.length; i++) {
    const r = points[i].ret;
    if (!best || r > best.ret) best = { day: points[i].day, ret: r };
    if (!worst || r < worst.ret) worst = { day: points[i].day, ret: r };
    if (r > 0) positive++;
  }

  return {
    volatility: vol,
    sharpe: vol && annualized != null ? (annualized - opts.riskFree) / vol : null,
    sortino: downDev && annualized != null ? (annualized - opts.riskFree) / downDev : null,
    maxDrawdown: maxDd,
    maxDrawdownPeak: ddPeak,
    maxDrawdownTrough: ddTrough,
    maxDrawdownRecovery: recovery,
    currentDrawdown: currentDd,
    beta,
    alpha,
    correlation,
    trackingError,
    informationRatio,
    bestDay: best,
    worstDay: worst,
    positiveDays: n ? positive / n : null,
  };
}

export interface YearReturns {
  year: number;
  months: (number | null)[];
  total: number | null;
}

/** Calendar monthly TWR returns (compounded daily returns). */
export function monthlyReturns(points: DailyPoint[]): YearReturns[] {
  const byYear = new Map<number, (number | null)[]>();
  const growth = new Map<string, number>();
  for (let i = 1; i < points.length; i++) {
    const key = points[i].day.slice(0, 7);
    growth.set(key, (growth.get(key) ?? 1) * (1 + points[i].ret));
  }
  for (const [key, g] of growth) {
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7)) - 1;
    const months = byYear.get(y) ?? new Array<number | null>(12).fill(null);
    months[m] = g - 1;
    byYear.set(y, months);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => {
      const present = months.filter((m): m is number => m != null);
      return { year, months, total: present.length ? present.reduce((s, m) => s * (1 + m), 1) - 1 : null };
    });
}

/** Monthly returns of a price series aligned with `days` (benchmarks). */
export function monthlyReturnsFromPrices(days: DayKey[], prices: (number | null)[]): Map<string, number> {
  const lastOfMonth = new Map<string, number>();
  for (let i = 0; i < days.length; i++) {
    const p = prices[i];
    if (p != null) lastOfMonth.set(days[i].slice(0, 7), p);
  }
  const keys = [...lastOfMonth.keys()].sort();
  const out = new Map<string, number>();
  for (let i = 1; i < keys.length; i++) {
    out.set(keys[i], (lastOfMonth.get(keys[i]) as number) / (lastOfMonth.get(keys[i - 1]) as number) - 1);
  }
  return out;
}

export function drawdownSeries(points: DailyPoint[]): number[] {
  let peak = -Infinity;
  return points.map((p) => {
    peak = Math.max(peak, p.twr);
    return p.twr / peak - 1;
  });
}

export function annualReturns(points: DailyPoint[]): { year: number; ret: number }[] {
  return monthlyReturns(points)
    .filter((y) => y.total != null)
    .map((y) => ({ year: y.year, ret: y.total as number }))
    .sort((a, b) => a.year - b.year);
}

import type { ChartInterval, ChartRange } from "./types";

export interface RangeConfig {
  interval: ChartInterval;
  intraday: boolean;
  /** Number of trading sessions to keep for intraday ranges. */
  sessions?: number;
  /** Calendar lookback used to query the provider. */
  lookbackDays: number;
  label: string;
}

export const RANGE_CONFIG: Record<ChartRange, RangeConfig> = {
  "1d": { interval: "5m", intraday: true, sessions: 1, lookbackDays: 6, label: "1J" },
  "5d": { interval: "15m", intraday: true, sessions: 5, lookbackDays: 10, label: "5J" },
  "1mo": { interval: "1h", intraday: true, lookbackDays: 31, label: "1M" },
  "3mo": { interval: "1d", intraday: false, lookbackDays: 92, label: "3M" },
  "6mo": { interval: "1d", intraday: false, lookbackDays: 183, label: "6M" },
  ytd: { interval: "1d", intraday: false, lookbackDays: 366, label: "YTD" },
  "1y": { interval: "1d", intraday: false, lookbackDays: 366, label: "1A" },
  "2y": { interval: "1d", intraday: false, lookbackDays: 731, label: "2A" },
  "5y": { interval: "1wk", intraday: false, lookbackDays: 1827, label: "5A" },
  "10y": { interval: "1wk", intraday: false, lookbackDays: 3653, label: "10A" },
  max: { interval: "1mo", intraday: false, lookbackDays: 365 * 40, label: "Max" },
};

export const CHART_RANGES = Object.keys(RANGE_CONFIG) as ChartRange[];

export function isChartRange(value: string | null | undefined): value is ChartRange {
  return !!value && value in RANGE_CONFIG;
}

const INTERVALS: ChartInterval[] = ["5m", "15m", "30m", "1h", "1d", "1wk", "1mo"];

export function isChartInterval(value: string | null | undefined): value is ChartInterval {
  return !!value && (INTERVALS as string[]).includes(value);
}

/** Start instant (epoch ms) used to query a range. */
export function rangeStartMs(range: ChartRange, now: number): number {
  if (range === "ytd") {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), 0, 1) - 3 * 86_400_000;
  }
  return now - RANGE_CONFIG[range].lookbackDays * 86_400_000;
}

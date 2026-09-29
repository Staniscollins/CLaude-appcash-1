"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { spanOfRange, type ChartSpan } from "@/lib/chart-format";
import { dayKeyToUTC } from "@/lib/dates";
import { computeIntradaySeries } from "@/lib/portfolio/history";
import { slicePeriod, summarizePeriod, type PeriodSummary } from "@/lib/portfolio/metrics";
import { periodStart } from "@/lib/portfolio/ranges";
import { useCharts } from "./use-market";

export interface PortfolioChartData {
  x: number[];
  value: number[];
  invested: (number | null)[];
  /** TWR index (daily ranges) — relative performance between two points. */
  twr: number[] | null;
  /** Cumulative distributed income since the first point (daily ranges). */
  incomeCum: number[] | null;
  /** Value the change is measured against. */
  reference: number;
  /** Net contributions at the reference point. */
  referenceInvested: number;
  /** Gain over the range (contributions excluded). */
  pnl: number;
  /** Return over the range (TWR for daily ranges). */
  pct: number;
  span: ChartSpan;
  summary: PeriodSummary | null;
  ready: boolean;
  intraday: boolean;
}

export function usePortfolioChart(range: string): PortfolioChartData {
  const { snapshot, daily, tables, today, historyReady, quotesReady } = usePortfolio();
  const intraday = range === "1d" || range === "5d";
  const symbols = useMemo(() => snapshot.positions.map((p) => p.symbol), [snapshot.positions]);
  const charts = useCharts(intraday ? symbols : [], range === "5d" ? "5d" : "1d", { enabled: intraday });
  const span = spanOfRange(range);

  return useMemo<PortfolioChartData>(() => {
    const empty = {
      x: [],
      value: [],
      invested: [],
      twr: null,
      incomeCum: null,
      reference: 0,
      referenceInvested: 0,
      pnl: 0,
      pct: 0,
      span,
      summary: null,
      intraday,
    };
    if (intraday) {
      const series = computeIntradaySeries(
        snapshot.positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity, currency: p.currency })),
        charts.data,
        tables,
        {
          windowMs: range === "1d" ? 16 * 3_600_000 : 8 * 86_400_000,
          cash: snapshot.totals.cash,
          useFirstAsReference: range === "5d",
          bucketMs: range === "1d" ? 5 * 60_000 : 15 * 60_000,
        },
      );
      if (!series) return { ...empty, ready: !charts.loading && quotesReady };
      const last = series.value[series.value.length - 1];
      const pnl = last - series.reference;
      return {
        ...empty,
        x: series.t,
        value: series.value,
        invested: series.value.map(() => null),
        reference: series.reference,
        pnl,
        pct: series.reference > 0 ? pnl / series.reference : 0,
        ready: true,
      };
    }
    const slice = slicePeriod(daily, periodStart(range, today));
    const pts = slice.base ? [slice.base, ...slice.points] : slice.points;
    const summary = summarizePeriod(slice);
    let income = 0;
    const incomeCum = pts.map((p, i) => (i === 0 && slice.base ? 0 : (income += p.income)));
    return {
      ...empty,
      x: pts.map((p) => dayKeyToUTC(p.day)),
      value: pts.map((p) => p.value),
      invested: pts.map((p) => p.netInvested),
      twr: pts.map((p) => p.twr),
      incomeCum,
      reference: slice.base?.value ?? 0,
      referenceInvested: slice.base?.netInvested ?? 0,
      pnl: summary?.pnl ?? 0,
      pct: summary?.twr ?? 0,
      summary,
      ready: historyReady && pts.length > 1,
    };
  }, [intraday, range, span, snapshot, charts.data, charts.loading, tables, daily, today, historyReady, quotesReady]);
}

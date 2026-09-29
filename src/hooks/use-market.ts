"use client";

import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { DayKey } from "@/lib/dates";
import type { AssetSummary, ChartRange, PriceSeries, Quote, StatementPeriod } from "@/lib/market/types";
import { useAppStore } from "@/lib/store";

const MIN = 60_000;

function useRefreshMs() {
  return useAppStore((s) => s.settings.refreshSeconds) * 1000;
}

/** Live quotes for a list of symbols (one request, refreshed periodically). */
export function useQuotes(symbols: string[], opts: { enabled?: boolean; refresh?: boolean } = {}) {
  const refreshMs = useRefreshMs();
  const key = useMemo(() => [...new Set(symbols)].sort(), [symbols]);
  return useQuery({
    queryKey: ["quotes", key.join(",")],
    queryFn: ({ signal }) => api.quotes(key, signal).then((r) => r.data),
    enabled: key.length > 0 && opts.enabled !== false,
    staleTime: 10_000,
    refetchInterval: opts.refresh === false ? false : refreshMs,
    placeholderData: (prev) => prev,
  });
}

export function useQuote(symbol: string | undefined) {
  const q = useQuotes(symbol ? [symbol] : []);
  return { ...q, data: symbol ? (q.data?.[symbol] as Quote | undefined) : undefined };
}

export function useChart(symbol: string | undefined, range: ChartRange, opts: { enabled?: boolean } = {}) {
  const intraday = range === "1d" || range === "5d";
  const refreshMs = useRefreshMs();
  return useQuery({
    queryKey: ["chart", symbol, range],
    queryFn: ({ signal }) => api.chart(symbol as string, range, signal).then((r) => r.data),
    enabled: !!symbol && opts.enabled !== false,
    staleTime: intraday ? 30_000 : 10 * MIN,
    refetchInterval: intraday ? Math.max(refreshMs, 60_000) : false,
    placeholderData: (prev) => prev,
  });
}

function combineSeries(results: UseQueryResult<PriceSeries | null>[]) {
  const data: Record<string, PriceSeries> = {};
  for (const r of results) if (r.data) data[r.data.symbol] = r.data;
  return {
    data,
    loading: results.some((r) => r.isLoading),
    settled: results.every((r) => !r.isLoading),
    errors: results.map((r) => r.isError),
  };
}

/** Charts of several symbols for the same range (sparklines, intraday portfolio). */
export function useCharts(symbols: string[], range: ChartRange, opts: { enabled?: boolean } = {}) {
  const intraday = range === "1d" || range === "5d";
  const { data, loading } = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["chart", symbol, range],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.chart(symbol, range, signal).then((r) => r.data),
      enabled: opts.enabled !== false,
      staleTime: intraday ? 30_000 : 10 * MIN,
      refetchInterval: intraday ? 2 * MIN : (false as const),
    })),
    combine: combineSeries,
  });
  return { data: data as Record<string, PriceSeries | undefined>, loading };
}

/** Daily history of several symbols since `from` (one cached query per symbol). */
export function useHistorySeries(symbols: string[], from: DayKey | null) {
  const result = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["history", symbol, from],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.history([symbol], from as string, signal).then((r) => r.data[symbol] ?? null),
      enabled: !!from,
      staleTime: 30 * MIN,
      gcTime: 2 * 60 * MIN,
      retry: 1,
    })),
    combine: combineSeries,
  });
  const failed = symbols.filter((_, i) => result.errors[i]);
  return { data: result.data, settled: result.settled, failed, loading: result.loading };
}

export function useSummary(symbol: string | undefined) {
  return useQuery({
    queryKey: ["summary", symbol],
    queryFn: ({ signal }) => api.summary(symbol as string, signal).then((r) => r.data),
    enabled: !!symbol,
    staleTime: 60 * MIN,
    gcTime: 24 * 60 * MIN,
    retry: 1,
  });
}

function combineSummaries(results: UseQueryResult<AssetSummary>[]) {
  const out: Record<string, AssetSummary> = {};
  for (const r of results) if (r.data) out[r.data.symbol] = r.data;
  return out;
}

export function useSummaries(symbols: string[]) {
  return useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["summary", symbol],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.summary(symbol, signal).then((r) => r.data),
      staleTime: 60 * MIN,
      gcTime: 24 * 60 * MIN,
      retry: 1,
    })),
    combine: combineSummaries,
  });
}

export function useFinancials(symbol: string | undefined, period: StatementPeriod) {
  return useQuery({
    queryKey: ["financials", symbol, period],
    queryFn: ({ signal }) => api.financials(symbol as string, period, signal).then((r) => r.data),
    enabled: !!symbol,
    staleTime: 6 * 60 * MIN,
    placeholderData: (prev) => prev,
  });
}

export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["search", q.toLowerCase()],
    queryFn: ({ signal }) => api.search(q, signal).then((r) => r.data),
    enabled: q.length >= 1,
    staleTime: 10 * MIN,
    placeholderData: (prev) => prev,
  });
}

export function useNews(symbols: string[]) {
  const key = useMemo(() => [...new Set(symbols)].sort().slice(0, 12), [symbols]);
  return useQuery({
    queryKey: ["news", key.join(",")],
    queryFn: ({ signal }) => api.news(key, signal).then((r) => r.data),
    enabled: key.length > 0,
    staleTime: 10 * MIN,
  });
}

export function useMovers() {
  return useQuery({
    queryKey: ["movers"],
    queryFn: ({ signal }) => api.movers(signal).then((r) => r.data),
    staleTime: 2 * MIN,
    refetchInterval: 5 * MIN,
  });
}

export function useDataStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: ({ signal }) => api.status(signal),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
}

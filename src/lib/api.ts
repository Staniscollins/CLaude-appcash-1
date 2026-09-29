"use client";

import { create } from "zustand";
import type { DayKey } from "./dates";
import type {
  ApiEnvelope,
  AssetSummary,
  ChartRange,
  DataSource,
  DataStatus,
  FinancialStatements,
  MarketMovers,
  NewsItem,
  PriceSeries,
  Quote,
  SearchHit,
  StatementPeriod,
} from "./market/types";

interface SourceState {
  lastSimulatedAt: number;
  lastLiveAt: number;
  record: (source: DataSource) => void;
}

/** Remembers which data source answered most recently (drives the demo-data banner). */
export const useSourceStore = create<SourceState>((set) => ({
  lastSimulatedAt: 0,
  lastLiveAt: 0,
  record: (source) => set(source === "simulated" ? { lastSimulatedAt: Date.now() } : { lastLiveAt: Date.now() }),
}));

export function useIsSimulated() {
  return useSourceStore((s) => s.lastSimulatedAt > 0 && s.lastSimulatedAt >= s.lastLiveAt);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<ApiEnvelope<T>> {
  const res = await fetch(path, { signal, headers: { accept: "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((body as { error?: string })?.error ?? `Erreur ${res.status}`, res.status);
  const env = body as ApiEnvelope<T>;
  if (env?.source) useSourceStore.getState().record(env.source);
  return env;
}

const enc = encodeURIComponent;

export const api = {
  quotes: (symbols: string[], signal?: AbortSignal) =>
    getJson<Record<string, Quote>>(`/api/quotes?symbols=${enc(symbols.join(","))}`, signal),
  chart: (symbol: string, range: ChartRange, signal?: AbortSignal) =>
    getJson<PriceSeries>(`/api/chart?symbol=${enc(symbol)}&range=${range}`, signal),
  history: (symbols: string[], from: DayKey, signal?: AbortSignal) =>
    getJson<Record<string, PriceSeries>>(`/api/history?symbols=${enc(symbols.join(","))}&from=${from}`, signal),
  summary: (symbol: string, signal?: AbortSignal) => getJson<AssetSummary>(`/api/summary?symbol=${enc(symbol)}`, signal),
  financials: (symbol: string, period: StatementPeriod, signal?: AbortSignal) =>
    getJson<FinancialStatements>(`/api/financials?symbol=${enc(symbol)}&period=${period}`, signal),
  search: (q: string, signal?: AbortSignal) => getJson<{ hits: SearchHit[]; news: NewsItem[] }>(`/api/search?q=${enc(q)}`, signal),
  news: (symbols: string[], signal?: AbortSignal) => getJson<NewsItem[]>(`/api/news?symbols=${enc(symbols.join(","))}`, signal),
  movers: (signal?: AbortSignal) => getJson<MarketMovers>(`/api/movers`, signal),
  status: async (signal?: AbortSignal): Promise<DataStatus> => {
    const res = await fetch("/api/status", { signal });
    return res.json();
  },
};

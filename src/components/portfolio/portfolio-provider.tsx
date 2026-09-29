"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useHistorySeries, useQuotes, useSummaries } from "@/hooks/use-market";
import { addDays, localDayKey, type DayKey } from "@/lib/dates";
import { catalogEntry, regionFromName } from "@/lib/market/catalog";
import type { AssetSummary, PriceSeries, Quote } from "@/lib/market/types";
import { computeSnapshot, type PortfolioSnapshot } from "@/lib/portfolio/engine";
import { computeDailyHistory, type DailyPoint } from "@/lib/portfolio/history";
import { buildMarketTables, fxSymbolsFor, type MarketTables } from "@/lib/portfolio/market-tables";
import type { Account, InstrumentMeta, Transaction } from "@/lib/portfolio/types";
import { useAppStore, type Settings } from "@/lib/store";

export interface PortfolioData {
  hydrated: boolean;
  settings: Settings;
  accounts: Account[];
  accountFilter: string;
  /** Transactions of the selected account(s). */
  transactions: Transaction[];
  symbols: string[];
  quotes: Record<string, Quote>;
  summaries: Record<string, AssetSummary>;
  history: Record<string, PriceSeries>;
  tables: MarketTables;
  snapshot: PortfolioSnapshot;
  daily: DailyPoint[];
  meta: (symbol: string) => InstrumentMeta;
  today: DayKey;
  isEmpty: boolean;
  quotesReady: boolean;
  historyReady: boolean;
  failedHistory: string[];
}

const PortfolioContext = createContext<PortfolioData | null>(null);

/** Start of the history window: a few days before the first transaction. */
function historyStart(txs: Transaction[]): DayKey | null {
  if (!txs.length) return null;
  const first = txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0].date);
  return addDays(`${first.slice(0, 7)}-01`, -10);
}

export function buildMeta(symbol: string, quote?: Quote, summary?: AssetSummary, fallbackCurrency = "EUR"): InstrumentMeta {
  const c = catalogEntry(symbol);
  const type = quote?.type ?? summary?.type ?? c?.type ?? "EQUITY";
  const name = quote?.name ?? summary?.name ?? c?.name ?? symbol;
  return {
    symbol,
    name,
    type,
    currency: quote?.currency ?? summary?.currency ?? c?.currency ?? fallbackCurrency,
    exchange: quote?.exchange ?? summary?.exchange ?? c?.exchange,
    sector: summary?.profile.sector ?? c?.sector,
    industry: summary?.profile.industry ?? c?.industry,
    country: summary?.profile.country ?? c?.country,
    region: c?.region ?? (type === "ETF" || type === "MUTUALFUND" ? regionFromName(name) : undefined),
    logoUrl: quote?.logoUrl ?? null,
    sectorWeights: summary?.fund?.sectors?.length ? summary.fund.sectors : undefined,
  };
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const allTransactions = useAppStore((s) => s.transactions);
  const accounts = useAppStore((s) => s.accounts);
  const accountFilter = useAppStore((s) => s.accountFilter);
  const settings = useAppStore((s) => s.settings);
  const base = settings.baseCurrency;
  const today = localDayKey();

  const transactions = useMemo(
    () => (accountFilter === "all" ? allTransactions : allTransactions.filter((t) => t.accountId === accountFilter)),
    [allTransactions, accountFilter],
  );

  // Symbols of every account, so switching the filter never refetches.
  const symbols = useMemo(
    () => [...new Set(allTransactions.map((t) => t.symbol).filter((s): s is string => !!s))].sort(),
    [allTransactions],
  );
  const quotesQ = useQuotes(symbols, { enabled: hydrated });
  const quoteData = quotesQ.data;

  const currencies = useMemo(() => {
    const set = new Set<string>(allTransactions.map((t) => t.currency));
    for (const q of Object.values(quoteData ?? {})) set.add(q.currency);
    return set;
  }, [allTransactions, quoteData]);
  const fxSymbols = useMemo(() => fxSymbolsFor(currencies, base), [currencies, base]);
  const fxQ = useQuotes(fxSymbols, { enabled: hydrated });

  const from = useMemo(() => historyStart(allTransactions), [allTransactions]);
  const historySymbols = useMemo(() => [...symbols, ...fxSymbols], [symbols, fxSymbols]);
  const historyQ = useHistorySeries(hydrated ? historySymbols : [], from);
  const summaries = useSummaries(hydrated ? symbols : []);

  const quotes = useMemo(() => ({ ...(quoteData ?? {}), ...(fxQ.data ?? {}) }), [quoteData, fxQ.data]);
  const tables = useMemo(() => buildMarketTables({ base, quotes, history: historyQ.data }), [base, quotes, historyQ.data]);

  const meta = useMemo(() => {
    const txCurrency = new Map<string, string>();
    for (const t of allTransactions) if (t.symbol && !txCurrency.has(t.symbol)) txCurrency.set(t.symbol, t.currency);
    const known = new Map(symbols.map((symbol) => [symbol, buildMeta(symbol, quotes[symbol], summaries[symbol], txCurrency.get(symbol))]));
    return (symbol: string) => known.get(symbol) ?? buildMeta(symbol, quotes[symbol], summaries[symbol]);
  }, [symbols, quotes, summaries, allTransactions]);

  const snapshot = useMemo(
    () => computeSnapshot({ transactions, tables, today, autoDividends: settings.autoDividends, meta }),
    [transactions, tables, today, settings.autoDividends, meta],
  );

  const historyReady = historyQ.settled && !!from;
  const daily = useMemo(
    () => (historyReady ? computeDailyHistory({ transactions, tables, today, autoDividends: settings.autoDividends, live: true }) : []),
    [historyReady, transactions, tables, today, settings.autoDividends],
  );

  const value: PortfolioData = {
    hydrated,
    settings,
    accounts,
    accountFilter,
    transactions,
    symbols,
    quotes,
    summaries,
    history: historyQ.data,
    tables,
    snapshot,
    daily,
    meta,
    today,
    isEmpty: hydrated && allTransactions.length === 0,
    quotesReady: symbols.length === 0 || (!!quoteData && (fxSymbols.length === 0 || !!fxQ.data)),
    historyReady,
    failedHistory: historyQ.failed,
  };

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioData {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}

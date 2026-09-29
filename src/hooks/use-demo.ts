"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { addDays, localDayKey } from "@/lib/dates";
import type { PriceSeries } from "@/lib/market/types";
import { buildDemoTransactions, DEMO_ACCOUNTS, DEMO_SYMBOLS, DEMO_WATCHLIST, demoStartDay } from "@/lib/portfolio/demo";
import { buildMarketTables } from "@/lib/portfolio/market-tables";
import { useAppStore } from "@/lib/store";

/** Loads the demo portfolio, pricing each trade with the active data source. */
export function useLoadDemo() {
  const client = useQueryClient();
  const replaceAll = useAppStore((s) => s.replaceAll);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const today = localDayKey();
      const start = demoStartDay(today);
      // Same window as the portfolio provider so the history cache is reused.
      const from = addDays(`${start.slice(0, 7)}-01`, -10);
      const entries = await Promise.all(
        DEMO_SYMBOLS.map(async (symbol) => {
          const series = await client.fetchQuery({
            queryKey: ["history", symbol, from],
            queryFn: ({ signal }) => api.history([symbol], from, signal).then((r) => r.data[symbol] ?? null),
            staleTime: 30 * 60_000,
          });
          return [symbol, series] as const;
        }),
      );
      const history: Record<string, PriceSeries> = {};
      for (const [s, series] of entries) if (series) history[s] = series;
      const tables = buildMarketTables({ base: "EUR", quotes: {}, history });
      const transactions = buildDemoTransactions(tables, today);
      replaceAll({ accounts: DEMO_ACCOUNTS, transactions, watchlist: DEMO_WATCHLIST, settings: { baseCurrency: "EUR" } });
      toast.success("Portefeuille de démonstration chargé", {
        description: `${transactions.length} transactions sur 3 comptes depuis ${start.slice(0, 7)}.`,
      });
    } catch (err) {
      toast.error("Impossible de charger la démo", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return { load, loading };
}

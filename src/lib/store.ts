"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_BENCHMARK } from "./market/catalog";
import type { Account, Transaction, WatchItem } from "./portfolio/types";
import { STORAGE_KEY } from "./store-key";
import { uid } from "./utils";

export type ThemePreference = "dark" | "light" | "system";
export type BaseCurrency = "EUR" | "USD" | "GBP" | "CHF";
export type DashboardRange = "1d" | "5d" | "1mo" | "3mo" | "ytd" | "1y" | "5y" | "max";

export interface Settings {
  baseCurrency: BaseCurrency;
  theme: ThemePreference;
  privacy: boolean;
  /** Detect dividends from market data when none were entered for a line. */
  autoDividends: boolean;
  /** Annual risk-free rate used by Sharpe / Sortino. */
  riskFreeRate: number;
  benchmark: string;
  /** Blue/orange instead of green/red. */
  colorblind: boolean;
  refreshSeconds: number;
  dashboardRange: DashboardRange;
  showInvestedLine: boolean;
  compactNumbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: "EUR",
  theme: "dark",
  privacy: false,
  autoDividends: true,
  riskFreeRate: 0.02,
  benchmark: DEFAULT_BENCHMARK,
  colorblind: false,
  refreshSeconds: 30,
  dashboardRange: "1y",
  showInvestedLine: true,
  compactNumbers: false,
};

export const ACCOUNT_COLORS = ["#8b7dff", "#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#e66767", "#9aa1ad"];

export interface PersistedData {
  version: 1;
  accounts: Account[];
  transactions: Transaction[];
  watchlist: WatchItem[];
  settings: Settings;
}

interface AppState extends PersistedData {
  /** "all" or an account id. */
  accountFilter: string;
  hydrated: boolean;

  setAccountFilter: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  addAccount: (input: Omit<Account, "id" | "createdAt" | "color"> & { color?: string }) => Account;
  updateAccount: (id: string, patch: Partial<Omit<Account, "id">>) => void;
  deleteAccount: (id: string) => void;

  addTransactions: (input: Omit<Transaction, "id" | "createdAt">[]) => Transaction[];
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id" | "createdAt">>) => void;
  deleteTransactions: (ids: string[]) => Transaction[];
  restoreTransactions: (txs: Transaction[]) => void;

  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  updateWatchItem: (symbol: string, patch: Partial<WatchItem>) => void;

  replaceAll: (data: Omit<PersistedData, "version" | "settings"> & { settings?: Partial<Settings> }) => void;
  resetAll: () => void;
}

export { STORAGE_KEY };

const initialData: PersistedData = {
  version: 1,
  accounts: [],
  transactions: [],
  watchlist: [],
  settings: DEFAULT_SETTINGS,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData,
      accountFilter: "all",
      hydrated: false,

      setAccountFilter: (id) => set({ accountFilter: id }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      addAccount: (input) => {
        const used = new Set(get().accounts.map((a) => a.color));
        const color =
          input.color ?? ACCOUNT_COLORS.find((c) => !used.has(c)) ?? ACCOUNT_COLORS[get().accounts.length % ACCOUNT_COLORS.length];
        const account: Account = { ...input, color, id: uid("acc_"), createdAt: Date.now() };
        set((s) => ({ accounts: [...s.accounts, account] }));
        return account;
      },
      updateAccount: (id, patch) => set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      deleteAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          transactions: s.transactions.filter((t) => t.accountId !== id),
          accountFilter: s.accountFilter === id ? "all" : s.accountFilter,
        })),

      addTransactions: (input) => {
        const now = Date.now();
        const created = input.map((t, i) => ({ ...t, id: uid("tx_"), createdAt: now + i }));
        set((s) => ({ transactions: [...s.transactions, ...created] }));
        return created;
      },
      updateTransaction: (id, patch) => set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      deleteTransactions: (ids) => {
        const removed = get().transactions.filter((t) => ids.includes(t.id));
        set((s) => ({ transactions: s.transactions.filter((t) => !ids.includes(t.id)) }));
        return removed;
      },
      restoreTransactions: (txs) =>
        set((s) => {
          const existing = new Set(s.transactions.map((t) => t.id));
          return { transactions: [...s.transactions, ...txs.filter((t) => !existing.has(t.id))] };
        }),

      addToWatchlist: (symbol) =>
        set((s) => (s.watchlist.some((w) => w.symbol === symbol) ? s : { watchlist: [...s.watchlist, { symbol, addedAt: Date.now() }] })),
      removeFromWatchlist: (symbol) => set((s) => ({ watchlist: s.watchlist.filter((w) => w.symbol !== symbol) })),
      updateWatchItem: (symbol, patch) =>
        set((s) => ({ watchlist: s.watchlist.map((w) => (w.symbol === symbol ? { ...w, ...patch } : w)) })),

      replaceAll: (data) =>
        set((s) => ({
          accounts: data.accounts,
          transactions: data.transactions,
          watchlist: data.watchlist,
          settings: { ...s.settings, ...(data.settings ?? {}) },
          accountFilter: "all",
        })),
      resetAll: () => set({ ...initialData, settings: { ...DEFAULT_SETTINGS, theme: get().settings.theme }, accountFilter: "all" }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        version: s.version,
        accounts: s.accounts,
        transactions: s.transactions,
        watchlist: s.watchlist,
        settings: s.settings,
        accountFilter: s.accountFilter,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          accounts: Array.isArray(p.accounts) ? p.accounts : [],
          transactions: Array.isArray(p.transactions) ? p.transactions : [],
          watchlist: Array.isArray(p.watchlist) ? p.watchlist : [],
        };
      },
      onRehydrateStorage: () => () => {
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Validates an imported backup file. */
export function parseBackup(json: unknown): PersistedData | null {
  const o = json as Partial<PersistedData> & { state?: Partial<PersistedData> };
  const data = o?.state ?? o;
  if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) return null;
  const txOk = data.transactions.every(
    (t) => t && typeof t.id === "string" && typeof t.date === "string" && typeof t.type === "string" && typeof t.accountId === "string",
  );
  if (!txOk) return null;
  return {
    version: 1,
    accounts: data.accounts,
    transactions: data.transactions,
    watchlist: Array.isArray(data.watchlist) ? data.watchlist : [],
    settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
  };
}

export function exportBackup(): PersistedData {
  const s = useAppStore.getState();
  return { version: 1, accounts: s.accounts, transactions: s.transactions, watchlist: s.watchlist, settings: s.settings };
}

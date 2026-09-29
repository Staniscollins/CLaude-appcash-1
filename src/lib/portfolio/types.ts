import type { DayKey } from "../dates";
import type { AssetType } from "../market/types";

export type TransactionType = "BUY" | "SELL" | "DIVIDEND" | "DEPOSIT" | "WITHDRAWAL" | "FEE" | "INTEREST" | "TAX";

export const TRADE_TYPES: TransactionType[] = ["BUY", "SELL"];
export const CASH_TYPES: TransactionType[] = ["DEPOSIT", "WITHDRAWAL", "FEE", "INTEREST", "TAX"];

export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  /** Trade / payment date. */
  date: DayKey;
  symbol?: string;
  quantity?: number;
  /** Unit price in `currency`. */
  price?: number;
  /** Cash amount (dividends, deposits, fees…) in `currency`. Gross amount for dividends. */
  amount?: number;
  /** Broker fees in `currency`; withholding tax for dividends. */
  fees?: number;
  currency: string;
  /** Optional FX override: units of base currency for one unit of `currency`. */
  fxRate?: number;
  note?: string;
  createdAt: number;
  /** Generated (e.g. automatic dividend), never persisted. */
  auto?: boolean;
}

export type AccountType = "PEA" | "PEA-PME" | "CTO" | "AV" | "PER" | "CRYPTO" | "OTHER";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  broker?: string;
  createdAt: number;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  PEA: "PEA",
  "PEA-PME": "PEA-PME",
  CTO: "Compte-titres",
  AV: "Assurance-vie",
  PER: "PER",
  CRYPTO: "Crypto",
  OTHER: "Autre",
};

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  BUY: "Achat",
  SELL: "Vente",
  DIVIDEND: "Dividende",
  DEPOSIT: "Dépôt",
  WITHDRAWAL: "Retrait",
  FEE: "Frais",
  INTEREST: "Intérêts",
  TAX: "Impôts",
};

export interface InstrumentMeta {
  symbol: string;
  name: string;
  type: AssetType;
  currency: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  country?: string;
  region?: string;
  logoUrl?: string | null;
  /** ETF look-through sector weights (ratios). */
  sectorWeights?: { sector: string; weight: number }[];
}

export interface WatchItem {
  symbol: string;
  addedAt: number;
  alertAbove?: number;
  alertBelow?: number;
  /** Epoch ms when the current alert fired (reset when edited). */
  alertTriggeredAt?: number;
  note?: string;
}

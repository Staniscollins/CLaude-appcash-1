import type { DayKey } from "../dates";
import type { AssetType } from "../market/types";
import type { MarketTables } from "./market-tables";
import type { InstrumentMeta, Transaction, TransactionType } from "./types";

/**
 * Portfolio accounting: average-cost (PRU) positions per account, realized and
 * unrealized gains in the base currency, dividends (manual or detected from
 * market data), fees and optional cash tracking.
 *
 * Quantities are split-adjusted with the split events of the price history so
 * that they can be valued with split-adjusted closes.
 */

const TYPE_ORDER: Record<TransactionType, number> = {
  DEPOSIT: 0,
  BUY: 1,
  SELL: 2,
  DIVIDEND: 3,
  INTEREST: 4,
  FEE: 5,
  TAX: 6,
  WITHDRAWAL: 7,
};

export function sortTransactions<T extends Transaction>(txs: readonly T[]): T[] {
  return [...txs].sort((a, b) => a.date.localeCompare(b.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.createdAt - b.createdAt);
}

const EPS = 1e-9;

/** Cash-tracked accounts are those with at least one deposit. */
export function trackedAccounts(txs: readonly Transaction[]): Set<string> {
  const out = new Set<string>();
  for (const t of txs) if (t.type === "DEPOSIT") out.add(t.accountId);
  return out;
}

/** Split-adjusted quantity and price of a trade. */
export function adjustTrade(tx: Transaction, tables: MarketTables) {
  const f = tx.symbol ? tables.splitFactorAfter(tx.symbol, tx.date) : 1;
  return { quantity: (tx.quantity ?? 0) * f, price: (tx.price ?? 0) / f };
}

export function txFx(tx: Transaction, tables: MarketTables): number {
  return tx.fxRate && tx.fxRate > 0 ? tx.fxRate : tables.fxOn(tx.currency, tx.date);
}

/**
 * Dividends detected from market data for (account, symbol) pairs that have no
 * manually entered dividend. Amount = shares held the day before the ex-date ×
 * dividend per share (gross).
 */
export function autoDividendTransactions(txs: readonly Transaction[], tables: MarketTables, today: DayKey): Transaction[] {
  const manual = new Set<string>();
  const trades = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (!t.symbol) continue;
    const key = `${t.accountId}|${t.symbol}`;
    if (t.type === "DIVIDEND") manual.add(key);
    if (t.type === "BUY" || t.type === "SELL") {
      const list = trades.get(key) ?? [];
      list.push(t);
      trades.set(key, list);
    }
  }
  const out: Transaction[] = [];
  for (const [key, list] of trades) {
    if (manual.has(key)) continue;
    const [accountId, symbol] = key.split("|");
    const events = tables.dividends(symbol);
    if (!events.length) continue;
    const sorted = sortTransactions(list);
    const currency = tables.currencyOf(symbol) ?? sorted[0].currency;
    for (const ev of events) {
      if (ev.date > today || ev.date <= sorted[0].date) continue;
      let qty = 0;
      for (const t of sorted) {
        if (t.date >= ev.date) break;
        const { quantity } = adjustTrade(t, tables);
        qty = t.type === "BUY" ? qty + quantity : Math.max(0, qty - quantity);
      }
      if (qty <= EPS) continue;
      out.push({
        id: `auto:${accountId}:${symbol}:${ev.date}`,
        accountId,
        type: "DIVIDEND",
        date: ev.date,
        symbol,
        amount: qty * ev.amount,
        currency,
        createdAt: 0,
        auto: true,
      });
    }
  }
  return out;
}

export interface Lot {
  accountId: string;
  symbol: string;
  currency: string;
  quantity: number;
  /** Remaining cost basis in base currency (fees included). */
  costBase: number;
  /** Remaining cost basis in instrument currency (fees included). */
  costLocal: number;
  realized: number;
  dividends: number;
  tradeFees: number;
  /** Sum of every purchase (base currency, fees included). */
  invested: number;
  firstDate: DayKey;
  lastDate: DayKey;
  boughtTodayQty: number;
  boughtTodayCostLocal: number;
}

export interface Position {
  symbol: string;
  name: string;
  type: AssetType;
  currency: string;
  accountIds: string[];
  quantity: number;
  /** PRU: average unit cost in instrument currency, fees included. */
  avgCost: number;
  costBasis: number;
  price: number;
  previousClose: number | null;
  changePercent: number;
  value: number;
  weight: number;
  dayChange: number;
  unrealized: number;
  unrealizedPct: number;
  realized: number;
  dividends: number;
  tradeFees: number;
  invested: number;
  totalReturn: number;
  totalReturnPct: number;
  firstDate: DayKey;
  lastDate: DayKey;
  hasLiveQuote: boolean;
  meta: InstrumentMeta;
}

export interface PortfolioTotals {
  value: number;
  securities: number;
  cash: number;
  costBasis: number;
  unrealized: number;
  unrealizedPct: number;
  realized: number;
  dividends: number;
  interest: number;
  accountFees: number;
  tradeFees: number;
  dayChange: number;
  dayChangePct: number;
  netContributions: number;
  totalReturn: number;
  positionsCount: number;
}

export interface PortfolioSnapshot {
  positions: Position[];
  closed: Position[];
  lots: Lot[];
  totals: PortfolioTotals;
  cashByAccount: Record<string, number>;
  trackedAccounts: string[];
  dividendTransactions: Transaction[];
  warnings: string[];
}

export interface SnapshotOptions {
  transactions: readonly Transaction[];
  tables: MarketTables;
  today: DayKey;
  autoDividends: boolean;
  meta: (symbol: string) => InstrumentMeta;
}

/** Converts a dividend transaction to its net amount in base currency. */
export function dividendNetBase(tx: Transaction, tables: MarketTables): number {
  return ((tx.amount ?? 0) - (tx.fees ?? 0)) * txFx(tx, tables);
}

export function computeSnapshot(opts: SnapshotOptions): PortfolioSnapshot {
  const { tables, today } = opts;
  const warnings: string[] = [];
  const auto = opts.autoDividends ? autoDividendTransactions(opts.transactions, tables, today) : [];
  const all = sortTransactions([...opts.transactions, ...auto]);
  const tracked = trackedAccounts(opts.transactions);

  const lots = new Map<string, Lot>();
  const cash: Record<string, number> = {};
  let interest = 0;
  let accountFees = 0;
  let netContributions = 0;
  let orphanDividends = 0;
  const dividendTransactions: Transaction[] = [];

  const lotFor = (tx: Transaction): Lot => {
    const key = `${tx.accountId}|${tx.symbol}`;
    let lot = lots.get(key);
    if (!lot) {
      lot = {
        accountId: tx.accountId,
        symbol: tx.symbol as string,
        currency: tables.currencyOf(tx.symbol as string) ?? tx.currency,
        quantity: 0,
        costBase: 0,
        costLocal: 0,
        realized: 0,
        dividends: 0,
        tradeFees: 0,
        invested: 0,
        firstDate: tx.date,
        lastDate: tx.date,
        boughtTodayQty: 0,
        boughtTodayCostLocal: 0,
      };
      lots.set(key, lot);
    }
    return lot;
  };

  for (const tx of all) {
    const fx = txFx(tx, tables);
    const isTracked = tracked.has(tx.accountId);
    cash[tx.accountId] ??= 0;
    switch (tx.type) {
      case "BUY": {
        if (!tx.symbol) break;
        const lot = lotFor(tx);
        const { quantity, price } = adjustTrade(tx, tables);
        const fees = tx.fees ?? 0;
        const grossLocal = quantity * price;
        const costBase = (grossLocal + fees) * fx;
        lot.quantity += quantity;
        lot.costBase += costBase;
        lot.costLocal += grossLocal + fees;
        lot.invested += costBase;
        lot.tradeFees += fees * fx;
        lot.lastDate = tx.date;
        if (tx.date === today) {
          lot.boughtTodayQty += quantity;
          lot.boughtTodayCostLocal += grossLocal;
        }
        cash[tx.accountId] -= costBase;
        if (!isTracked) netContributions += costBase;
        break;
      }
      case "SELL": {
        if (!tx.symbol) break;
        const lot = lotFor(tx);
        const adj = adjustTrade(tx, tables);
        let quantity = adj.quantity;
        if (quantity > lot.quantity + EPS) {
          warnings.push(
            `Vente de ${tx.quantity} ${tx.symbol} le ${tx.date} supérieure à la quantité détenue : quantité ramenée à ${lot.quantity.toFixed(4)}.`,
          );
          quantity = lot.quantity;
        }
        if (quantity <= EPS) break;
        const fees = tx.fees ?? 0;
        const proceedsBase = (quantity * adj.price - fees) * fx;
        const share = quantity / lot.quantity;
        const costOut = lot.costBase * share;
        lot.realized += proceedsBase - costOut;
        lot.costBase -= costOut;
        lot.costLocal -= lot.costLocal * share;
        lot.quantity -= quantity;
        lot.tradeFees += fees * fx;
        lot.lastDate = tx.date;
        if (lot.quantity <= EPS) {
          lot.quantity = 0;
          lot.costBase = 0;
          lot.costLocal = 0;
        }
        cash[tx.accountId] += proceedsBase;
        if (!isTracked) netContributions -= proceedsBase;
        break;
      }
      case "DIVIDEND": {
        const net = dividendNetBase(tx, tables);
        const lot = tx.symbol ? lots.get(`${tx.accountId}|${tx.symbol}`) : undefined;
        if (lot) lot.dividends += net;
        else orphanDividends += net;
        dividendTransactions.push(tx);
        cash[tx.accountId] += net;
        break;
      }
      case "INTEREST": {
        const v = (tx.amount ?? 0) * fx;
        interest += v;
        cash[tx.accountId] += v;
        break;
      }
      case "FEE":
      case "TAX": {
        const v = Math.abs(tx.amount ?? 0) * fx;
        accountFees += v;
        cash[tx.accountId] -= v;
        break;
      }
      case "DEPOSIT": {
        const v = (tx.amount ?? 0) * fx;
        cash[tx.accountId] += v;
        netContributions += v;
        break;
      }
      case "WITHDRAWAL": {
        const v = Math.abs(tx.amount ?? 0) * fx;
        cash[tx.accountId] -= v;
        netContributions -= v;
        break;
      }
    }
  }

  // ——— valuation, aggregated per symbol ———
  const bySymbol = new Map<string, Lot[]>();
  for (const lot of lots.values()) {
    const list = bySymbol.get(lot.symbol) ?? [];
    list.push(lot);
    bySymbol.set(lot.symbol, list);
  }

  const positions: Position[] = [];
  const closed: Position[] = [];
  for (const [symbol, list] of bySymbol) {
    const quote = tables.quote(symbol);
    const meta = opts.meta(symbol);
    const currency = quote?.currency ?? list[0].currency;
    const quantity = list.reduce((s, l) => s + l.quantity, 0);
    const costBasis = list.reduce((s, l) => s + l.costBase, 0);
    const costLocal = list.reduce((s, l) => s + l.costLocal, 0);
    const lastTrade = [...opts.transactions]
      .filter((t) => t.symbol === symbol && (t.type === "BUY" || t.type === "SELL"))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const price = tables.lastPrice(symbol) ?? (lastTrade ? adjustTrade(lastTrade, tables).price : 0);
    const prev = tables.previousClose(symbol) ?? null;
    const fxNow = tables.fxNow(currency);
    const fxPrev = tables.fxPrev(currency);
    const value = quantity * price * fxNow;
    let dayChange = 0;
    if (prev != null && quantity > 0) {
      const boughtToday = list.reduce((s, l) => s + l.boughtTodayQty, 0);
      const boughtTodayCost = list.reduce((s, l) => s + l.boughtTodayCostLocal, 0);
      const heldBefore = Math.max(0, quantity - boughtToday);
      dayChange = heldBefore * (price * fxNow - prev * fxPrev) + (boughtToday > 0 ? (boughtToday * price - boughtTodayCost) * fxNow : 0);
    }
    const realized = list.reduce((s, l) => s + l.realized, 0);
    const dividends = list.reduce((s, l) => s + l.dividends, 0);
    const invested = list.reduce((s, l) => s + l.invested, 0);
    const unrealized = value - costBasis;
    const totalReturn = unrealized + realized + dividends;
    const position: Position = {
      symbol,
      name: meta.name,
      type: meta.type,
      currency,
      accountIds: [...new Set(list.map((l) => l.accountId))],
      quantity,
      avgCost: quantity > EPS ? costLocal / quantity : 0,
      costBasis,
      price,
      previousClose: prev,
      changePercent: quote?.changePercent ?? (prev ? price / prev - 1 : 0),
      value,
      weight: 0,
      dayChange,
      unrealized,
      unrealizedPct: costBasis > 0 ? unrealized / costBasis : 0,
      realized,
      dividends,
      tradeFees: list.reduce((s, l) => s + l.tradeFees, 0),
      invested,
      totalReturn,
      totalReturnPct: invested > 0 ? totalReturn / invested : 0,
      firstDate: list.reduce((m, l) => (l.firstDate < m ? l.firstDate : m), list[0].firstDate),
      lastDate: list.reduce((m, l) => (l.lastDate > m ? l.lastDate : m), list[0].lastDate),
      hasLiveQuote: !!quote,
      meta,
    };
    if (quantity > EPS) positions.push(position);
    else closed.push(position);
  }

  const securities = positions.reduce((s, p) => s + p.value, 0);
  for (const p of positions) p.weight = securities > 0 ? p.value / securities : 0;
  positions.sort((a, b) => b.value - a.value);
  closed.sort((a, b) => b.lastDate.localeCompare(a.lastDate));

  const trackedCash = [...tracked].reduce((s, id) => s + (cash[id] ?? 0), 0);
  const costBasis = positions.reduce((s, p) => s + p.costBasis, 0);
  const unrealized = securities - costBasis;
  const realized = [...positions, ...closed].reduce((s, p) => s + p.realized, 0);
  const dividends = [...positions, ...closed].reduce((s, p) => s + p.dividends, 0) + orphanDividends;
  const dayChange = positions.reduce((s, p) => s + p.dayChange, 0);
  const tradeFees = [...positions, ...closed].reduce((s, p) => s + p.tradeFees, 0);
  const value = securities + trackedCash;

  return {
    positions,
    closed,
    lots: [...lots.values()],
    totals: {
      value,
      securities,
      cash: trackedCash,
      costBasis,
      unrealized,
      unrealizedPct: costBasis > 0 ? unrealized / costBasis : 0,
      realized,
      dividends,
      interest,
      accountFees,
      tradeFees,
      dayChange,
      dayChangePct: value - dayChange > 0 ? dayChange / (value - dayChange) : 0,
      netContributions,
      totalReturn: unrealized + realized + dividends + interest - accountFees,
      positionsCount: positions.length,
    },
    cashByAccount: cash,
    trackedAccounts: [...tracked],
    dividendTransactions,
    warnings,
  };
}

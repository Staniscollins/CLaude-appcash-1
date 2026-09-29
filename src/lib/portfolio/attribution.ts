import type { DayKey } from "../dates";
import { adjustTrade, autoDividendTransactions, dividendNetBase, sortTransactions, txFx } from "./engine";
import type { MarketTables } from "./market-tables";
import type { Transaction } from "./types";

export interface Contribution {
  symbol: string;
  /** Gain of the line over the period (base currency), dividends included. */
  gain: number;
  startValue: number;
  endValue: number;
  netFlows: number;
  dividends: number;
}

/**
 * Gain of each line over [start, today]: end value − start value − net purchases
 * + dividends. The sum over lines equals the securities P&L of the period.
 */
export function contributions(opts: {
  transactions: readonly Transaction[];
  tables: MarketTables;
  start: DayKey | null;
  today: DayKey;
  autoDividends: boolean;
}): Contribution[] {
  const { tables, today, start } = opts;
  const manual = opts.transactions.filter((t) => t.date <= today);
  const auto = opts.autoDividends ? autoDividendTransactions(manual, tables, today) : [];
  const all = sortTransactions([...manual, ...auto]);
  const qtyAtStart = new Map<string, number>();
  const qtyNow = new Map<string, number>();
  const flows = new Map<string, number>();
  const divs = new Map<string, number>();
  const lastPrice = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const tx of all) {
    if (!tx.symbol) continue;
    const s = tx.symbol;
    const inPeriod = !start || tx.date >= start;
    if (tx.type === "BUY" || tx.type === "SELL") {
      const { quantity, price } = adjustTrade(tx, tables);
      lastPrice.set(s, price);
      const held = qtyNow.get(s) ?? 0;
      const q = tx.type === "BUY" ? quantity : Math.min(quantity, held);
      const signed = tx.type === "BUY" ? q : -q;
      qtyNow.set(s, held + signed);
      if (!inPeriod) add(qtyAtStart, s, signed);
      else {
        const fx = txFx(tx, tables);
        const cash = tx.type === "BUY" ? (q * price + (tx.fees ?? 0)) * fx : (q * price - (tx.fees ?? 0)) * fx;
        add(flows, s, tx.type === "BUY" ? cash : -cash);
      }
    } else if (tx.type === "DIVIDEND" && inPeriod) {
      add(divs, s, dividendNetBase(tx, tables));
    }
  }

  const symbols = new Set([...qtyAtStart.keys(), ...qtyNow.keys()]);
  const out: Contribution[] = [];
  for (const s of symbols) {
    const ccy = tables.currencyOf(s) ?? "EUR";
    const q0 = qtyAtStart.get(s) ?? 0;
    const q1 = qtyNow.get(s) ?? 0;
    // Start value: close of the last session before the period.
    const startValue =
      start && q0 > 1e-9 ? q0 * (tables.closeOn(s, prevDay(start)) ?? lastPrice.get(s) ?? 0) * tables.fxOn(ccy, prevDay(start)) : 0;
    const endValue = q1 > 1e-9 ? q1 * (tables.lastPrice(s) ?? lastPrice.get(s) ?? 0) * tables.fxNow(ccy) : 0;
    const netFlows = flows.get(s) ?? 0;
    const dividends = divs.get(s) ?? 0;
    const gain = endValue - startValue - netFlows + dividends;
    if (Math.abs(gain) < 1e-9 && !startValue && !endValue) continue;
    out.push({ symbol: s, gain, startValue, endValue, netFlows, dividends });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

function prevDay(day: DayKey): DayKey {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

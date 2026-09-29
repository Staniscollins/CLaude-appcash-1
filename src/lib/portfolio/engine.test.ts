import { describe, expect, it } from "vitest";
import type { PriceSeries, Quote } from "../market/types";
import { parseDateLoose, parseNumberLoose, parseTransactionType, readCsv, rowsToTransactions, transactionsToCsv } from "./csv";
import { computeSnapshot, type SnapshotOptions } from "./engine";
import { alignBenchmark, computeDailyHistory, computeIntradaySeries, simulateSameFlows } from "./history";
import { buildMarketTables } from "./market-tables";
import { drawdownSeries, monthlyReturns, riskMetrics, slicePeriod, summarizePeriod, xirr } from "./metrics";
import type { Account, InstrumentMeta, Transaction } from "./types";

function series(symbol: string, currency: string, closes: Record<string, number>, extra: Partial<PriceSeries> = {}): PriceSeries {
  const days = Object.keys(closes).sort();
  return {
    symbol,
    currency,
    interval: "1d",
    intraday: false,
    timezone: "UTC",
    t: days.map((d) => Date.parse(`${d}T12:00:00Z`)),
    d: days,
    c: days.map((d) => closes[d]),
    dividends: [],
    splits: [],
    ...extra,
  };
}

function quote(symbol: string, price: number, previousClose: number, currency = "EUR"): Quote {
  return {
    symbol,
    name: symbol,
    type: "EQUITY",
    currency,
    price,
    previousClose,
    change: price - previousClose,
    changePercent: price / previousClose - 1,
    time: 0,
  };
}

let seq = 0;
function tx(t: Partial<Transaction> & Pick<Transaction, "type" | "date">): Transaction {
  seq += 1;
  return { id: `t${seq}`, accountId: "a1", currency: "EUR", createdAt: seq, ...t };
}

const meta = (symbol: string): InstrumentMeta => ({ symbol, name: symbol, type: "EQUITY", currency: "EUR" });

function snapshot(transactions: Transaction[], tablesOpts: Parameters<typeof buildMarketTables>[0], extra: Partial<SnapshotOptions> = {}) {
  return computeSnapshot({
    transactions,
    tables: buildMarketTables(tablesOpts),
    today: "2024-12-31",
    autoDividends: true,
    meta,
    ...extra,
  });
}

describe("positions (PRU, realized, fees)", () => {
  it("uses the weighted average cost including fees", () => {
    const txs = [
      tx({ type: "BUY", date: "2024-01-02", symbol: "ABC", quantity: 10, price: 100, fees: 1 }),
      tx({ type: "BUY", date: "2024-02-01", symbol: "ABC", quantity: 10, price: 120, fees: 1 }),
      tx({ type: "SELL", date: "2024-03-01", symbol: "ABC", quantity: 5, price: 130, fees: 1 }),
    ];
    const s = snapshot(txs, { base: "EUR", quotes: { ABC: quote("ABC", 140, 135) }, history: {} });
    const p = s.positions[0];
    expect(p.quantity).toBe(15);
    expect(p.avgCost).toBeCloseTo(110.1, 8);
    expect(p.costBasis).toBeCloseTo(1651.5, 8);
    expect(p.realized).toBeCloseTo(98.5, 8);
    expect(p.value).toBeCloseTo(2100, 8);
    expect(p.unrealized).toBeCloseTo(448.5, 8);
    expect(p.dayChange).toBeCloseTo(15 * 5, 8);
    expect(s.totals.totalReturn).toBeCloseTo(448.5 + 98.5, 8);
    expect(s.totals.netContributions).toBeCloseTo(2202 - 649, 8);
  });

  it("clamps sells larger than the position and warns", () => {
    const txs = [
      tx({ type: "BUY", date: "2024-01-02", symbol: "ABC", quantity: 2, price: 10 }),
      tx({ type: "SELL", date: "2024-01-03", symbol: "ABC", quantity: 5, price: 12 }),
    ];
    const s = snapshot(txs, { base: "EUR", quotes: { ABC: quote("ABC", 12, 12) }, history: {} });
    expect(s.positions).toHaveLength(0);
    expect(s.closed[0].realized).toBeCloseTo(4, 8);
    expect(s.warnings).toHaveLength(1);
  });

  it("converts foreign currencies at the trade date and today", () => {
    const txs = [tx({ type: "BUY", date: "2024-01-02", symbol: "US1", quantity: 10, price: 100, currency: "USD" })];
    const s = snapshot(txs, {
      base: "EUR",
      quotes: { US1: quote("US1", 110, 100, "USD"), "USDEUR=X": quote("USDEUR=X", 0.8, 0.82, "EUR") },
      history: { "USDEUR=X": series("USDEUR=X", "EUR", { "2024-01-02": 0.9, "2024-06-03": 0.85 }) },
    });
    const p = s.positions[0];
    expect(p.costBasis).toBeCloseTo(900, 8);
    expect(p.value).toBeCloseTo(880, 8);
    expect(p.unrealized).toBeCloseTo(-20, 8);
    expect(p.dayChange).toBeCloseTo(10 * (110 * 0.8 - 100 * 0.82), 8);
  });

  it("handles London pence quotes", () => {
    const txs = [tx({ type: "BUY", date: "2024-01-02", symbol: "SHEL.L", quantity: 100, price: 2500, currency: "GBp" })];
    const s = snapshot(txs, {
      base: "EUR",
      quotes: { "SHEL.L": quote("SHEL.L", 2600, 2600, "GBp"), "GBPEUR=X": quote("GBPEUR=X", 1.2, 1.2, "EUR") },
      history: {},
    });
    expect(s.positions[0].value).toBeCloseTo(100 * 26 * 1.2, 8);
  });

  it("adjusts quantities for splits after the trade", () => {
    const txs = [tx({ type: "BUY", date: "2024-01-02", symbol: "SPL", quantity: 10, price: 400 })];
    const hist = series("SPL", "EUR", { "2024-01-02": 100, "2024-06-10": 105 }, { splits: [{ date: "2024-06-10", ratio: 4 }] });
    const s = snapshot(txs, { base: "EUR", quotes: { SPL: quote("SPL", 110, 105) }, history: { SPL: hist } });
    expect(s.positions[0].quantity).toBe(40);
    expect(s.positions[0].avgCost).toBeCloseTo(100, 8);
    expect(s.positions[0].value).toBeCloseTo(4400, 8);
  });

  it("detects dividends from market data unless entered manually", () => {
    const buy = tx({ type: "BUY", date: "2024-01-02", symbol: "DIV", quantity: 10, price: 50 });
    const hist = series(
      "DIV",
      "EUR",
      { "2024-01-02": 50, "2024-12-30": 55 },
      {
        dividends: [
          { date: "2024-05-02", amount: 1 },
          { date: "2023-05-02", amount: 1 },
        ],
      },
    );
    const opts = { base: "EUR", quotes: { DIV: quote("DIV", 55, 55) }, history: { DIV: hist } };
    const auto = snapshot([buy], opts);
    expect(auto.totals.dividends).toBeCloseTo(10, 8);
    expect(auto.dividendTransactions).toHaveLength(1);
    const manual = snapshot([buy, tx({ type: "DIVIDEND", date: "2024-05-10", symbol: "DIV", amount: 10, fees: 3 })], opts);
    expect(manual.totals.dividends).toBeCloseTo(7, 8);
    const off = snapshot([buy], opts, { autoDividends: false });
    expect(off.totals.dividends).toBe(0);
  });

  it("tracks cash for accounts with deposits", () => {
    const txs = [
      tx({ type: "DEPOSIT", date: "2024-01-02", amount: 1000 }),
      tx({ type: "BUY", date: "2024-01-02", symbol: "ABC", quantity: 10, price: 50 }),
      tx({ type: "FEE", date: "2024-02-01", amount: 5 }),
    ];
    const s = snapshot(txs, { base: "EUR", quotes: { ABC: quote("ABC", 60, 60) }, history: {} });
    expect(s.totals.cash).toBeCloseTo(495, 8);
    expect(s.totals.value).toBeCloseTo(1095, 8);
    expect(s.totals.netContributions).toBeCloseTo(1000, 8);
    expect(s.totals.totalReturn).toBeCloseTo(95, 8);
  });
});

describe("daily history and returns", () => {
  const closes = { "2024-01-01": 100, "2024-01-02": 110, "2024-01-03": 110, "2024-01-04": 121 };
  const tables = buildMarketTables({ base: "EUR", quotes: {}, history: { ABC: series("ABC", "EUR", closes) } });

  it("computes time-weighted returns independent of cash flows", () => {
    const txs = [
      tx({ type: "BUY", date: "2024-01-01", symbol: "ABC", quantity: 10, price: 100 }),
      tx({ type: "BUY", date: "2024-01-03", symbol: "ABC", quantity: 10, price: 110 }),
    ];
    const h = computeDailyHistory({ transactions: txs, tables, today: "2024-01-04", autoDividends: false });
    expect(h.map((p) => p.value)).toEqual([1000, 1100, 2200, 2420]);
    expect(h[3].twr - 1).toBeCloseTo(0.21, 10);
    expect(h[3].netInvested).toBeCloseTo(2100, 10);
    const summary = summarizePeriod(slicePeriod(h, null));
    expect(summary?.twr).toBeCloseTo(0.21, 10);
    expect(summary?.pnl).toBeCloseTo(320, 10);
    const lastTwo = summarizePeriod(slicePeriod(h, "2024-01-04"));
    expect(lastTwo?.twr).toBeCloseTo(0.1, 10);
    expect(lastTwo?.pnl).toBeCloseTo(220, 10);
  });

  it("measures a full exit at the sale price", () => {
    const txs = [
      tx({ type: "BUY", date: "2024-01-01", symbol: "ABC", quantity: 10, price: 100 }),
      tx({ type: "SELL", date: "2024-01-03", symbol: "ABC", quantity: 10, price: 115 }),
    ];
    const h = computeDailyHistory({ transactions: txs, tables, today: "2024-01-04", autoDividends: false });
    expect(h[2].value).toBe(0);
    expect(h[2].twr - 1).toBeCloseTo(0.15, 10);
    expect(h[3].twr - 1).toBeCloseTo(0.15, 10);
  });

  it("keeps tracked cash inside the portfolio", () => {
    const txs = [
      tx({ type: "DEPOSIT", date: "2024-01-01", amount: 2000 }),
      tx({ type: "BUY", date: "2024-01-01", symbol: "ABC", quantity: 10, price: 100 }),
    ];
    const h = computeDailyHistory({ transactions: txs, tables, today: "2024-01-04", autoDividends: false });
    expect(h[0].value).toBe(2000);
    expect(h[3].value).toBeCloseTo(2210, 10);
    expect(h[3].twr - 1).toBeCloseTo(0.105, 10);
  });

  it("simulates the same flows in a benchmark", () => {
    const txs = [tx({ type: "BUY", date: "2024-01-01", symbol: "ABC", quantity: 10, price: 100 })];
    const h = computeDailyHistory({ transactions: txs, tables, today: "2024-01-04", autoDividends: false });
    const bench = alignBenchmark(
      series("B", "EUR", { "2024-01-01": 50, "2024-01-04": 60 }),
      tables,
      h.map((p) => p.day),
    );
    expect(bench).toEqual([50, 50, 50, 60]);
    expect(simulateSameFlows(h, bench).at(-1)).toBeCloseTo(1200, 10);
  });
});

describe("metrics", () => {
  it("solves XIRR", () => {
    const r = xirr([
      { day: "2023-01-01", amount: -1000 },
      { day: "2024-01-01", amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 6);
    expect(xirr([{ day: "2023-01-01", amount: -1000 }])).toBeNull();
  });

  it("finds drawdowns and monthly returns", () => {
    const tables = buildMarketTables({
      base: "EUR",
      quotes: {},
      history: { ABC: series("ABC", "EUR", { "2024-01-31": 100, "2024-02-01": 120, "2024-02-02": 90, "2024-03-01": 108 }) },
    });
    const h = computeDailyHistory({
      transactions: [tx({ type: "BUY", date: "2024-01-31", symbol: "ABC", quantity: 1, price: 100 })],
      tables,
      today: "2024-03-01",
      autoDividends: false,
    });
    const dd = drawdownSeries(h);
    expect(Math.min(...dd)).toBeCloseTo(-0.25, 10);
    const risk = riskMetrics(h, { riskFree: 0 });
    expect(risk.maxDrawdown).toBeCloseTo(-0.25, 10);
    expect(risk.maxDrawdownPeak).toBe("2024-02-01");
    const monthly = monthlyReturns(h);
    expect(monthly[0].year).toBe(2024);
    expect(monthly[0].months[1]).toBeCloseTo(-0.1, 10);
    expect(monthly[0].months[2]).toBeCloseTo(0.2, 10);
    expect(monthly[0].total).toBeCloseTo(0.08, 10);
  });
});

describe("intraday series", () => {
  it("values current holdings and carries prices forward", () => {
    const tables = buildMarketTables({ base: "EUR", quotes: { A: quote("A", 12, 10), B: quote("B", 21, 20) }, history: {} });
    const t0 = Date.UTC(2024, 0, 2, 9);
    const intraday = {
      A: { ...series("A", "EUR", {}), intraday: true, t: [t0, t0 + 300_000, t0 + 600_000], c: [10.5, 11, 12], previousClose: 10 },
      B: { ...series("B", "EUR", {}), intraday: true, t: [t0 + 600_000], c: [21], previousClose: 20 },
    };
    const s = computeIntradaySeries(
      [
        { symbol: "A", quantity: 1, currency: "EUR" },
        { symbol: "B", quantity: 2, currency: "EUR" },
      ],
      intraday,
      tables,
      { windowMs: 3_600_000 },
    );
    expect(s?.reference).toBe(50);
    expect(s?.value).toEqual([50.5, 51, 54]);
  });
});

describe("csv", () => {
  it("parses loose numbers, dates and types", () => {
    expect(parseNumberLoose("1 234,56 €")).toBeCloseTo(1234.56, 8);
    expect(parseNumberLoose("1,234.56")).toBeCloseTo(1234.56, 8);
    expect(parseNumberLoose("-3,5")).toBeCloseTo(-3.5, 8);
    expect(parseDateLoose("15/03/2024")).toBe("2024-03-15");
    expect(parseDateLoose("2024-03-15T10:00:00Z")).toBe("2024-03-15");
    expect(parseTransactionType("Achat")).toBe("BUY");
    expect(parseTransactionType("Dividende")).toBe("DIVIDEND");
  });

  it("round-trips an export", () => {
    const accounts: Account[] = [{ id: "a1", name: "PEA", type: "PEA", color: "#fff", createdAt: 0 }];
    const txs = [
      tx({ type: "BUY", date: "2024-01-02", symbol: "MC.PA", quantity: 2, price: 700.5, fees: 1.2 }),
      tx({ type: "DIVIDEND", date: "2024-05-02", symbol: "MC.PA", amount: 13, currency: "EUR" }),
    ];
    const csv = transactionsToCsv(txs, accounts);
    const parsed = readCsv(csv);
    const { transactions, issues } = rowsToTransactions(parsed, parsed.mapping, {
      accounts,
      defaultAccountId: "a1",
      defaultCurrency: "EUR",
    });
    expect(issues).toEqual([]);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({ type: "BUY", symbol: "MC.PA", quantity: 2, price: 700.5, fees: 1.2, accountId: "a1" });
    expect(transactions[1]).toMatchObject({ type: "DIVIDEND", amount: 13 });
  });
});

describe("attribution", () => {
  it("splits the period gain by line", async () => {
    const { contributions } = await import("./attribution");
    const tables = buildMarketTables({
      base: "EUR",
      quotes: { A: quote("A", 130, 125), B: quote("B", 45, 50) },
      history: {
        A: series("A", "EUR", { "2024-01-01": 100, "2024-01-31": 110, "2024-02-15": 120 }),
        B: series("B", "EUR", { "2024-01-01": 50, "2024-01-31": 50, "2024-02-15": 48 }),
      },
    });
    const txs = [
      tx({ type: "BUY", date: "2024-01-01", symbol: "A", quantity: 10, price: 100 }),
      tx({ type: "BUY", date: "2024-02-15", symbol: "B", quantity: 10, price: 48 }),
    ];
    const c = contributions({ transactions: txs, tables, start: "2024-02-01", today: "2024-03-01", autoDividends: false });
    const a = c.find((x) => x.symbol === "A");
    const b = c.find((x) => x.symbol === "B");
    expect(a?.startValue).toBeCloseTo(1100, 8);
    expect(a?.gain).toBeCloseTo(200, 8);
    expect(b?.gain).toBeCloseTo(-30, 8);
  });
});

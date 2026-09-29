import { describe, expect, it } from "vitest";
import { simFinancials, simQuote, simSeries, simSummary, simSearch, simMovers } from "./simulated";

// Tuesday 2026-09-29, 15:00 UTC — Paris open, New York open.
const NOW = Date.UTC(2026, 8, 29, 15, 0);

describe("simulated market data", () => {
  it("is deterministic", () => {
    expect(simQuote("AAPL", NOW)).toEqual(simQuote("AAPL", NOW));
    expect(simSeries("MC.PA", { range: "1y" }, NOW)).toEqual(simSeries("MC.PA", { range: "1y" }, NOW));
  });

  it("keeps the last bar of a series aligned with the live quote", () => {
    for (const symbol of ["AAPL", "MC.PA", "BTC-EUR", "EURUSD=X", "UNKNOWN.PA"]) {
      const q = simQuote(symbol, NOW);
      const daily = simSeries(symbol, { range: "3mo" }, NOW);
      const intraday = simSeries(symbol, { range: "1d" }, NOW);
      expect(daily.c.at(-1)).toBeCloseTo(q.price, 8);
      expect(intraday.c.at(-1)).toBeCloseTo(q.price, 8);
      expect(intraday.previousClose).toBeCloseTo(q.previousClose ?? NaN, 8);
      expect(q.price).toBeGreaterThan(0);
    }
  });

  it("produces sane magnitudes and ordered timestamps", () => {
    const s = simSeries("AAPL", { range: "5y" }, NOW);
    expect(s.interval).toBe("1wk");
    expect(s.t.length).toBeGreaterThan(250);
    for (let i = 1; i < s.t.length; i++) expect(s.t[i]).toBeGreaterThan(s.t[i - 1]);
    const q = simQuote("AAPL", NOW);
    expect(q.price).toBeGreaterThan(20);
    expect(q.price).toBeLessThan(5000);
    expect(Math.abs(q.changePercent)).toBeLessThan(0.2);
  });

  it("generates dividends for dividend payers only", () => {
    const tte = simSeries("TTE.PA", { from: "2024-01-01", interval: "1d" }, NOW);
    expect(tte.dividends.length).toBeGreaterThanOrEqual(8);
    const cw8 = simSeries("CW8.PA", { from: "2024-01-01", interval: "1d" }, NOW);
    expect(cw8.dividends).toHaveLength(0);
  });

  it("keeps FX crosses consistent", () => {
    const eurusd = simQuote("EURUSD=X", NOW).price;
    const usdeur = simQuote("USDEUR=X", NOW).price;
    expect(eurusd * usdeur).toBeCloseTo(1, 6);
  });

  it("fills summaries, statements, search and movers", () => {
    const summary = simSummary("MSFT", NOW);
    expect(summary.analysts?.trend).toHaveLength(4);
    expect(summary.earnings?.history.length).toBe(8);
    expect(simSummary("CW8.PA", NOW).fund?.sectors.length).toBeGreaterThan(5);
    const fin = simFinancials("MSFT", "annual", NOW);
    expect(fin.income).toHaveLength(5);
    expect(fin.income[4].totalRevenue).toBeGreaterThan(0);
    expect(simSearch("lvmh")[0]?.symbol).toBe("MC.PA");
    expect(simSearch("air liq")[0]?.symbol).toBe("AI.PA");
    const movers = simMovers(NOW);
    expect(movers.gainers[0].changePercent).toBeGreaterThanOrEqual(movers.losers[0].changePercent);
  });
});

describe("random primitives", () => {
  it("produce unbiased standard normals and uniforms", async () => {
    const { normal, uniform } = await import("./simulated");
    let sum = 0;
    let sq = 0;
    let usum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const day = new Date(Date.UTC(2000, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      const z = normal(`MKT|${day}`);
      sum += z;
      sq += z * z;
      usum += uniform(`AAPL|${day}`, 5);
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.03);
    expect(Math.abs(sq / n - 1)).toBeLessThan(0.05);
    expect(Math.abs(usum / n - 0.5)).toBeLessThan(0.01);
  });

  it("keeps simulated prices within plausible ranges", () => {
    for (const symbol of ["AAPL", "BTC-EUR", "MC.PA", "CW8.PA", "NVDA"]) {
      const s = simSeries(symbol, { from: "2024-03-01", interval: "1d" }, NOW);
      const ratio = (s.c.at(-1) as number) / s.c[0];
      expect(ratio).toBeGreaterThan(0.2);
      expect(ratio).toBeLessThan(6);
    }
  });
});

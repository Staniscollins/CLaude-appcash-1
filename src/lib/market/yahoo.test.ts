import { beforeAll, describe, expect, it } from "vitest";

/**
 * Normalization of raw (unvalidated) yahoo-finance2 responses. A fake client is
 * installed on globalThis before importing the module, so no network is used.
 */

const DAY = 86_400;
// Paris session bars: 2024-05-02 .. 2024-05-06 at 09:00 CEST (07:00Z).
const t0 = Date.UTC(2024, 4, 2, 7, 0) / 1000;

const fake = {
  quote: async () => [
    {
      symbol: "MC.PA",
      longName: "LVMH Moët Hennessy Louis Vuitton",
      shortName: "LVMH",
      quoteType: "EQUITY",
      currency: "EUR",
      fullExchangeName: "Paris",
      exchangeTimezoneName: "Europe/Paris",
      marketState: "REGULAR",
      regularMarketPrice: 700,
      regularMarketChange: 7,
      regularMarketChangePercent: 1.01,
      regularMarketPreviousClose: 693,
      regularMarketTime: Date.UTC(2024, 4, 6, 12) / 1000,
      dividendRate: 13,
      trailingPE: 22.5,
      earningsTimestamp: Math.floor(Date.now() / 1000) + 10 * DAY,
      logoUrl: "https://s.yimg.com/logo.png",
    },
    { symbol: "BAD", quoteType: "EQUITY" },
  ],
  chart: async (_symbol: string, opts: { interval: string }) => {
    if (opts.interval === "5m") {
      // Two sessions of 3 bars; only the last one must be kept for 1d.
      const day1 = Date.UTC(2024, 4, 3, 7, 0) / 1000;
      const day2 = Date.UTC(2024, 4, 6, 7, 0) / 1000;
      const ts = [day1, day1 + 300, day1 + 600, day2, day2 + 300, day2 + 600];
      return {
        meta: { currency: "EUR", exchangeTimezoneName: "Europe/Paris", regularMarketPrice: 702, regularMarketTime: day2 + 600 },
        quotes: ts.map((t, i) => ({ date: new Date(t * 1000), open: 690 + i, high: 695 + i, low: 685 + i, close: 690 + i, volume: 1000 })),
      };
    }
    const ts = [t0, t0 + DAY, t0 + 4 * DAY, t0 + 4 * DAY + 3600];
    return {
      meta: {
        currency: "EUR",
        exchangeTimezoneName: "Europe/Paris",
        chartPreviousClose: 680,
        regularMarketPrice: 705,
        regularMarketTime: t0 + 4 * DAY + 3600,
      },
      quotes: ts.map((t, i) => ({ date: new Date(t * 1000), open: 690, high: 700, low: 680, close: i === 1 ? null : 690 + i, volume: 10 })),
      events: {
        dividends: [{ amount: 7.5, date: t0 + DAY }],
        splits: [{ date: t0 + 4 * DAY, numerator: 2, denominator: 1, splitRatio: "2:1" }],
      },
    };
  },
  quoteSummary: async () => ({
    price: { quoteType: "EQUITY", longName: "LVMH", currency: "EUR", exchangeName: "Paris", regularMarketPrice: 700, marketCap: 3.5e11 },
    summaryDetail: { dividendYield: 0.0186, trailingPE: 22.5, fiveYearAvgDividendYield: 1.9, exDividendDate: t0 },
    financialData: {
      targetMeanPrice: 800,
      targetLowPrice: 600,
      targetHighPrice: 950,
      recommendationMean: 2.1,
      recommendationKey: "buy",
      numberOfAnalystOpinions: 20,
      profitMargins: 0.18,
      financialCurrency: "EUR",
    },
    defaultKeyStatistics: { beta: 1.1, "52WeekChange": -0.12 },
    assetProfile: {
      sector: "Consumer Cyclical",
      country: "France",
      fullTimeEmployees: 200000,
      longBusinessSummary: "Luxe.",
      companyOfficers: [{ name: "B. Arnault", title: "CEO" }],
    },
    recommendationTrend: { trend: [{ period: "0m", strongBuy: 5, buy: 10, hold: 4, sell: 1, strongSell: 0 }] },
    earningsHistory: { history: [{ quarter: Date.UTC(2024, 2, 31) / 1000, epsActual: 5, epsEstimate: 4.8, surprisePercent: 0.04 }] },
    calendarEvents: { earnings: { earningsDate: [Math.floor(Date.now() / 1000) + 30 * DAY], earningsAverage: 5.2 } },
    topHoldings: { sectorWeightings: [{ technology: 0.3 }, { healthcare: 0.1 }] },
  }),
  search: async () => ({
    quotes: [
      { symbol: "MC.PA", longname: "LVMH", quoteType: "EQUITY", exchDisp: "Paris", isYahooFinance: true },
      { name: "Crunchbase thing", isYahooFinance: false },
    ],
    news: [
      {
        uuid: "n1",
        title: "LVMH publie",
        publisher: "Reuters",
        link: "https://x",
        providerPublishTime: Date.UTC(2024, 4, 6) / 1000,
        relatedTickers: ["MC.PA"],
      },
    ],
  }),
  fundamentalsTimeSeries: async () => [
    { date: Date.UTC(2023, 11, 31) / 1000, totalRevenue: 86e9, netIncome: 15e9, EBITDA: 30e9 },
    { date: Date.UTC(2022, 11, 31) / 1000, totalRevenue: 79e9, netIncome: 14e9, totalAssets: 1 },
  ],
};

let y: typeof import("./yahoo");

beforeAll(async () => {
  (globalThis as unknown as { __lumenYahoo: unknown }).__lumenYahoo = fake;
  y = await import("./yahoo");
});

describe("yahoo normalization", () => {
  it("maps quotes and drops incomplete ones", async () => {
    const q = await y.yahooQuotes(["MC.PA", "BAD"]);
    expect(Object.keys(q)).toEqual(["MC.PA"]);
    const mc = q["MC.PA"];
    expect(mc.changePercent).toBeCloseTo(0.0101, 8);
    expect(mc.dividendYield).toBeCloseTo(13 / 700, 8);
    expect(mc.time).toBe(Date.UTC(2024, 4, 6, 12));
    expect(mc.earningsDate).toBeGreaterThan(Date.now());
    expect(mc.logoUrl).toContain("yimg");
    expect(mc.type).toBe("EQUITY");
  });

  it("builds daily series with session day keys, live close and events", async () => {
    const s = await y.yahooSeries("MC.PA", { from: "2024-05-01", interval: "1d" });
    // The null close is skipped, the repeated live bar collapses into one day.
    expect(s.d).toEqual(["2024-05-02", "2024-05-06"]);
    expect(s.c.at(-1)).toBe(705);
    expect(s.dividends).toEqual([{ date: "2024-05-03", amount: 7.5 }]);
    expect(s.splits).toEqual([{ date: "2024-05-06", ratio: 2 }]);
  });

  it("keeps only the last session for 1d intraday charts", async () => {
    const s = await y.yahooSeries("MC.PA", { range: "1d" });
    expect(s.intraday).toBe(true);
    expect(s.c).toEqual([693, 694, 695]);
    expect(s.previousClose).toBe(692);
  });

  it("maps the quote summary", async () => {
    const s = await y.yahooSummary("MC.PA");
    expect(s.profile.sector).toBe("Consumer Cyclical");
    expect(s.stats.fiveYearAvgDividendYield).toBeCloseTo(0.019, 8);
    expect(s.stats.exDividendDate).toBe(t0 * 1000);
    expect(s.analysts?.targetMean).toBe(800);
    expect(s.analysts?.trend[0].buy).toBe(10);
    expect(s.earnings?.history[0].label).toBe("T1 2024");
    expect(s.fund?.sectors.map((x) => x.sector)).toEqual(["technology", "healthcare"]);
  });

  it("maps search results and news", async () => {
    const r = await y.yahooSearch("lvmh");
    expect(r.hits).toEqual([{ symbol: "MC.PA", name: "LVMH", type: "EQUITY", exchange: "Paris", sector: undefined, industry: undefined }]);
    expect(r.news[0].time).toBe(Date.UTC(2024, 4, 6));
  });

  it("splits financial statements and sorts periods", async () => {
    const f = await y.yahooFinancials("MC.PA", "annual");
    expect(f.income.map((r) => r.date)).toEqual(["2022-12-31", "2023-12-31"]);
    expect(f.income[1].EBITDA).toBe(30e9);
    expect(f.balance).toEqual([{ date: "2022-12-31", totalAssets: 1 }]);
    expect(f.currency).toBe("EUR");
  });
});

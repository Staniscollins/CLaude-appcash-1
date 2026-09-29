import "server-only";
import YahooFinance from "yahoo-finance2";
import { dayKeyInTimeZone, type DayKey } from "../dates";
import { RANGE_CONFIG, rangeStartMs } from "./ranges";
import type {
  AssetSummary,
  AssetType,
  ChartInterval,
  ChartRange,
  FinancialStatements,
  MarketMovers,
  MarketState,
  NewsItem,
  PriceSeries,
  Quote,
  SearchHit,
  StatementPeriod,
} from "./types";
import { BALANCE_FIELDS, CASHFLOW_FIELDS, INCOME_FIELDS } from "./types";

/** Yahoo Finance access through yahoo-finance2, normalized to the app DTOs. */

const fetchWithTimeout: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(12_000) });

const globalForYahoo = globalThis as unknown as { __lumenYahoo?: InstanceType<typeof YahooFinance> };

const yf = (globalForYahoo.__lumenYahoo ??= new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
  versionCheck: false,
  queue: { concurrency: 6 },
  validation: { logErrors: false },
  fetch: fetchWithTimeout,
}));

// ——— defensive accessors ———

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === "object" ? (v as Obj) : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as Obj)) return num((v as Obj).raw);
  return undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length ? v.trim() : undefined;
}
function ms(v: unknown): number | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.getTime();
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}
const pct = (v: unknown) => {
  const n = num(v);
  return n == null ? undefined : n / 100;
};

/** Accept results that failed schema validation: Yahoo often adds or drops fields. */
async function tolerant<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const e = err as { name?: string; result?: unknown };
    if (e?.name === "FailedYahooValidationError" && e.result) return e.result as T;
    throw err;
  }
}

// ——— quotes ———

const QUOTE_FIELDS = [
  "symbol",
  "shortName",
  "longName",
  "displayName",
  "quoteType",
  "currency",
  "financialCurrency",
  "exchange",
  "fullExchangeName",
  "exchangeTimezoneName",
  "marketState",
  "regularMarketPrice",
  "regularMarketChange",
  "regularMarketChangePercent",
  "regularMarketPreviousClose",
  "regularMarketOpen",
  "regularMarketDayHigh",
  "regularMarketDayLow",
  "regularMarketVolume",
  "regularMarketTime",
  "averageDailyVolume3Month",
  "marketCap",
  "trailingPE",
  "forwardPE",
  "epsTrailingTwelveMonths",
  "dividendRate",
  "dividendYield",
  "trailingAnnualDividendRate",
  "trailingAnnualDividendYield",
  "dividendDate",
  "earningsTimestamp",
  "earningsTimestampStart",
  "fiftyTwoWeekLow",
  "fiftyTwoWeekHigh",
  "fiftyDayAverage",
  "twoHundredDayAverage",
  "priceToBook",
  "beta",
  "netExpenseRatio",
  "preMarketPrice",
  "preMarketChange",
  "preMarketChangePercent",
  "postMarketPrice",
  "postMarketChange",
  "postMarketChangePercent",
  "averageAnalystRating",
  "logoUrl",
  "companyLogoUrl",
  "coinImageUrl",
];

function mapType(t: unknown): AssetType {
  switch (str(t)?.toUpperCase()) {
    case "EQUITY":
    case "ECNQUOTE":
      return "EQUITY";
    case "ETF":
      return "ETF";
    case "CRYPTOCURRENCY":
      return "CRYPTOCURRENCY";
    case "INDEX":
      return "INDEX";
    case "CURRENCY":
      return "CURRENCY";
    case "MUTUALFUND":
    case "MONEYMARKET":
      return "MUTUALFUND";
    case "FUTURE":
      return "FUTURE";
    default:
      return "OTHER";
  }
}

function mapState(s: unknown): MarketState | undefined {
  const v = str(s);
  if (!v) return undefined;
  if (v.startsWith("PRE")) return "PRE";
  if (v.startsWith("POST")) return "POST";
  if (v === "REGULAR") return "REGULAR";
  return "CLOSED";
}

export function mapQuote(raw: unknown): Quote | null {
  const q = obj(raw);
  const symbol = str(q.symbol);
  const price = num(q.regularMarketPrice);
  if (!symbol || price == null) return null;
  const previousClose = num(q.regularMarketPreviousClose) ?? null;
  const change = num(q.regularMarketChange) ?? (previousClose != null ? price - previousClose : 0);
  const changePercent =
    num(q.regularMarketChangePercent) != null
      ? (num(q.regularMarketChangePercent) as number) / 100
      : previousClose
        ? change / previousClose
        : 0;
  const state = mapState(q.marketState);
  const dividendRate = num(q.dividendRate) ?? num(q.trailingAnnualDividendRate) ?? null;
  const dividendYield =
    dividendRate != null && price > 0
      ? dividendRate / price
      : (num(q.trailingAnnualDividendYield) ?? (num(q.dividendYield) != null ? (num(q.dividendYield) as number) / 100 : null));
  const now = Date.now();
  const earnings = [ms(q.earningsTimestampStart), ms(q.earningsTimestamp)].find((t) => t != null && t > now - 86_400_000) ?? null;

  let extended: Quote["extended"] = null;
  if (state === "PRE" && num(q.preMarketPrice) != null) {
    extended = {
      price: num(q.preMarketPrice) as number,
      change: num(q.preMarketChange) ?? 0,
      changePercent: (num(q.preMarketChangePercent) ?? 0) / 100,
      session: "pre",
    };
  } else if ((state === "POST" || state === "CLOSED") && num(q.postMarketPrice) != null) {
    extended = {
      price: num(q.postMarketPrice) as number,
      change: num(q.postMarketChange) ?? 0,
      changePercent: (num(q.postMarketChangePercent) ?? 0) / 100,
      session: "post",
    };
  }

  return {
    symbol,
    name: str(q.longName) ?? str(q.shortName) ?? str(q.displayName) ?? symbol,
    shortName: str(q.shortName) ?? str(q.displayName),
    type: mapType(q.quoteType),
    currency: str(q.currency) ?? "USD",
    exchange: str(q.fullExchangeName) ?? str(q.exchange),
    timezone: str(q.exchangeTimezoneName),
    marketState: state,
    price,
    previousClose,
    change,
    changePercent,
    open: num(q.regularMarketOpen) ?? null,
    dayHigh: num(q.regularMarketDayHigh) ?? null,
    dayLow: num(q.regularMarketDayLow) ?? null,
    volume: num(q.regularMarketVolume) ?? null,
    avgVolume: num(q.averageDailyVolume3Month) ?? null,
    marketCap: num(q.marketCap) ?? null,
    pe: num(q.trailingPE) ?? null,
    forwardPe: num(q.forwardPE) ?? null,
    eps: num(q.epsTrailingTwelveMonths) ?? null,
    dividendRate,
    dividendYield,
    exDividendDate: null,
    dividendDate: ms(q.dividendDate) ?? null,
    earningsDate: earnings,
    fiftyTwoWeekLow: num(q.fiftyTwoWeekLow) ?? null,
    fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh) ?? null,
    fiftyDayAverage: num(q.fiftyDayAverage) ?? null,
    twoHundredDayAverage: num(q.twoHundredDayAverage) ?? null,
    beta: num(q.beta) ?? null,
    priceToBook: num(q.priceToBook) ?? null,
    expenseRatio: pct(q.netExpenseRatio) ?? null,
    extended,
    time: ms(q.regularMarketTime) ?? now,
    logoUrl: str(q.logoUrl) ?? str(q.companyLogoUrl) ?? str(q.coinImageUrl) ?? null,
    analystRating: str(q.averageAnalystRating) ?? null,
  };
}

export async function yahooQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50);
    const result = await tolerant(() => yf.quote(batch, { fields: QUOTE_FIELDS as never, return: "array" }, { validateResult: false }));
    for (const raw of arr(result)) {
      const q = mapQuote(raw);
      if (q) out[q.symbol] = q;
    }
  }
  return out;
}

// ——— charts ———

interface SeriesRequest {
  range?: ChartRange;
  from?: DayKey;
  interval?: ChartInterval;
}

export async function yahooSeries(symbol: string, req: SeriesRequest): Promise<PriceSeries> {
  const now = Date.now();
  const cfg = req.range ? RANGE_CONFIG[req.range] : undefined;
  const interval: ChartInterval = req.interval ?? cfg?.interval ?? "1d";
  const intraday = ["5m", "15m", "30m", "1h"].includes(interval);
  const period1 = req.from ? new Date(`${req.from}T00:00:00Z`) : new Date(rangeStartMs(req.range ?? "1y", now));

  const raw = obj(
    await tolerant(() =>
      yf.chart(
        symbol,
        { period1, period2: new Date(now + 86_400_000), interval, events: "div|split", includePrePost: false, return: "array" },
        { validateResult: false },
      ),
    ),
  );
  const meta = obj(raw.meta);
  const tz = str(meta.exchangeTimezoneName) ?? "UTC";
  const currency = str(meta.currency) ?? "USD";

  type Bar = { t: number; d: DayKey; o?: number; h?: number; l?: number; c: number; v?: number };
  let bars: Bar[] = [];
  for (const rq of arr(raw.quotes)) {
    const r = obj(rq);
    const t = ms(r.date);
    const c = num(r.close);
    if (t == null || c == null) continue;
    bars.push({ t, d: dayKeyInTimeZone(t, tz), o: num(r.open), h: num(r.high), l: num(r.low), c, v: num(r.volume) });
  }
  bars.sort((a, b) => a.t - b.t);

  if (!intraday) {
    // Yahoo sometimes repeats the live bar: keep one bar per period (the last one).
    const byKey = new Map<string, Bar>();
    for (const b of bars) byKey.set(interval === "1d" ? b.d : `${b.t}`, b);
    bars = Array.from(byKey.values()).sort((a, b) => a.t - b.t);
    if (interval === "1d") {
      const livePrice = num(meta.regularMarketPrice);
      const liveTime = ms(meta.regularMarketTime);
      const last = bars.at(-1);
      if (last && livePrice != null && liveTime != null && dayKeyInTimeZone(liveTime, tz) === last.d) last.c = livePrice;
    }
  }

  let previousClose: number | null = num(meta.chartPreviousClose) ?? num(meta.previousClose) ?? null;
  if (intraday && cfg?.sessions) {
    const days = Array.from(new Set(bars.map((b) => b.d)));
    const keep = new Set(days.slice(-cfg.sessions));
    const firstKept = bars.findIndex((b) => keep.has(b.d));
    if (firstKept > 0) previousClose = bars[firstKept - 1].c;
    else if (cfg.sessions === 1) previousClose = num(meta.previousClose) ?? num(meta.chartPreviousClose) ?? previousClose;
    bars = bars.filter((b) => keep.has(b.d));
  }

  const events = obj(raw.events);
  const dividends = arr(events.dividends)
    .map((e) => {
      const ev = obj(e);
      const t = ms(ev.date);
      const amount = num(ev.amount);
      return t != null && amount != null ? { date: dayKeyInTimeZone(t, tz), amount } : null;
    })
    .filter((e): e is { date: string; amount: number } => !!e)
    .sort((a, b) => a.date.localeCompare(b.date));
  const splits = arr(events.splits)
    .map((e) => {
      const ev = obj(e);
      const t = ms(ev.date);
      const n = num(ev.numerator);
      const d = num(ev.denominator);
      return t != null && n && d ? { date: dayKeyInTimeZone(t, tz), ratio: n / d } : null;
    })
    .filter((e): e is { date: string; ratio: number } => !!e && e.ratio > 0 && e.ratio !== 1)
    .sort((a, b) => a.date.localeCompare(b.date));

  const fill = (pick: (b: Bar) => number | undefined) => bars.map((b) => pick(b) ?? b.c);
  return {
    symbol,
    currency,
    interval,
    intraday,
    timezone: tz,
    t: bars.map((b) => b.t),
    d: intraday ? undefined : bars.map((b) => b.d),
    o: fill((b) => b.o),
    h: fill((b) => b.h),
    l: fill((b) => b.l),
    c: bars.map((b) => b.c),
    v: bars.map((b) => b.v ?? 0),
    previousClose,
    dividends,
    splits,
  };
}

// ——— summary ———

const SUMMARY_MODULES = [
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "assetProfile",
  "calendarEvents",
  "recommendationTrend",
  "upgradeDowngradeHistory",
  "earningsHistory",
  "earningsTrend",
  "topHoldings",
  "fundProfile",
];

export async function yahooSummary(symbol: string): Promise<AssetSummary> {
  const r = obj(await tolerant(() => yf.quoteSummary(symbol, { modules: SUMMARY_MODULES as never }, { validateResult: false })));
  const price = obj(r.price);
  const sd = obj(r.summaryDetail);
  const ks = obj(r.defaultKeyStatistics);
  const fd = obj(r.financialData);
  const ap = obj(r.assetProfile);
  const ce = obj(r.calendarEvents);
  const earnCal = obj(ce.earnings);
  const type = mapType(price.quoteType);
  const lastPrice = num(price.regularMarketPrice) ?? num(fd.currentPrice);

  const summary: AssetSummary = {
    symbol,
    name: str(price.longName) ?? str(price.shortName) ?? symbol,
    type,
    currency: str(price.currency) ?? str(sd.currency) ?? "USD",
    exchange: str(price.exchangeName),
    profile: {
      sector: str(ap.sector),
      industry: str(ap.industry),
      country: str(ap.country),
      city: str(ap.city),
      website: str(ap.website),
      employees: num(ap.fullTimeEmployees),
      description: str(ap.longBusinessSummary) ?? str(ap.description),
      officers: arr(ap.companyOfficers)
        .slice(0, 5)
        .map((o) => ({ name: str(obj(o).name) ?? "", title: str(obj(o).title) ?? "" }))
        .filter((o) => o.name),
    },
    stats: {
      marketCap: num(price.marketCap) ?? num(sd.marketCap),
      enterpriseValue: num(ks.enterpriseValue),
      pe: num(sd.trailingPE),
      forwardPe: num(sd.forwardPE) ?? num(ks.forwardPE),
      peg: num(ks.pegRatio),
      priceToBook: num(ks.priceToBook),
      priceToSales: num(sd.priceToSalesTrailing12Months),
      evToEbitda: num(ks.enterpriseToEbitda),
      evToRevenue: num(ks.enterpriseToRevenue),
      eps: num(ks.trailingEps),
      forwardEps: num(ks.forwardEps),
      beta: num(sd.beta) ?? num(ks.beta),
      sharesOutstanding: num(ks.sharesOutstanding),
      floatShares: num(ks.floatShares),
      shortPercentOfFloat: num(ks.shortPercentOfFloat),
      heldByInsiders: num(ks.heldPercentInsiders),
      heldByInstitutions: num(ks.heldPercentInstitutions),
      bookValue: num(ks.bookValue),
      dividendRate: num(sd.dividendRate) ?? num(sd.trailingAnnualDividendRate),
      dividendYield: num(sd.dividendYield) ?? num(sd.trailingAnnualDividendYield) ?? num(sd.yield),
      payoutRatio: num(sd.payoutRatio),
      fiveYearAvgDividendYield: pct(sd.fiveYearAvgDividendYield),
      exDividendDate: ms(sd.exDividendDate) ?? ms(ce.exDividendDate),
      profitMargin: num(fd.profitMargins) ?? num(ks.profitMargins),
      operatingMargin: num(fd.operatingMargins),
      grossMargin: num(fd.grossMargins),
      ebitdaMargin: num(fd.ebitdaMargins),
      returnOnEquity: num(fd.returnOnEquity),
      returnOnAssets: num(fd.returnOnAssets),
      revenueGrowth: num(fd.revenueGrowth),
      earningsGrowth: num(fd.earningsGrowth),
      totalCash: num(fd.totalCash),
      totalDebt: num(fd.totalDebt),
      debtToEquity: num(fd.debtToEquity),
      currentRatio: num(fd.currentRatio),
      quickRatio: num(fd.quickRatio),
      freeCashflow: num(fd.freeCashflow),
      operatingCashflow: num(fd.operatingCashflow),
      revenue: num(fd.totalRevenue),
      ebitda: num(fd.ebitda),
      fiftyTwoWeekChange: num(ks["52WeekChange"]),
      averageVolume: num(sd.averageVolume),
      fiftyTwoWeekLow: num(sd.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: num(sd.fiftyTwoWeekHigh),
      financialCurrency: str(fd.financialCurrency),
    },
    calendar: {
      exDividendDate: ms(ce.exDividendDate),
      dividendDate: ms(ce.dividendDate),
      earningsDate: arr(earnCal.earningsDate)
        .map(ms)
        .find((t) => t != null),
    },
  };

  const trend = arr(obj(r.recommendationTrend).trend).map((t) => {
    const o = obj(t);
    return {
      period: str(o.period) ?? "",
      strongBuy: num(o.strongBuy) ?? 0,
      buy: num(o.buy) ?? 0,
      hold: num(o.hold) ?? 0,
      sell: num(o.sell) ?? 0,
      strongSell: num(o.strongSell) ?? 0,
    };
  });
  const changes = arr(obj(r.upgradeDowngradeHistory).history)
    .slice(0, 12)
    .map((h) => {
      const o = obj(h);
      return {
        date: ms(o.epochGradeDate) ?? 0,
        firm: str(o.firm) ?? "",
        action: str(o.action) ?? "",
        fromGrade: str(o.fromGrade),
        toGrade: str(o.toGrade),
        priceTarget: num(o.currentPriceTarget) || undefined,
      };
    });
  if (trend.length || num(fd.targetMeanPrice) != null) {
    summary.analysts = {
      recommendationMean: num(fd.recommendationMean),
      recommendationKey: str(fd.recommendationKey),
      analystCount: num(fd.numberOfAnalystOpinions),
      targetLow: num(fd.targetLowPrice),
      targetMean: num(fd.targetMeanPrice),
      targetMedian: num(fd.targetMedianPrice),
      targetHigh: num(fd.targetHighPrice),
      trend,
      changes,
    };
  }

  const history = arr(obj(r.earningsHistory).history).map((h) => {
    const o = obj(h);
    const quarter = ms(o.quarter);
    const d = quarter ? new Date(quarter) : null;
    return {
      label: d ? `T${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}` : (str(o.period) ?? ""),
      date: quarter,
      actual: num(o.epsActual) ?? null,
      estimate: num(o.epsEstimate) ?? null,
      surprise: num(o.surprisePercent) ?? null,
    };
  });
  const nextDate = summary.calendar.earningsDate;
  if (history.length || nextDate) {
    summary.earnings = {
      nextDate,
      nextEpsEstimate: num(earnCal.earningsAverage),
      nextRevenueEstimate: num(earnCal.revenueAverage),
      history,
    };
  }

  const th = obj(r.topHoldings);
  const fp = obj(r.fundProfile);
  if (type === "ETF" || type === "MUTUALFUND" || Object.keys(th).length) {
    const fees = obj(fp.feesExpensesInvestment);
    summary.fund = {
      family: str(fp.family) ?? undefined,
      category: str(fp.categoryName) ?? undefined,
      expenseRatio: num(fees.annualReportExpenseRatio) ?? num(ks.annualReportExpenseRatio),
      totalAssets: num(sd.totalAssets) ?? num(ks.totalAssets),
      inceptionDate: ms(ks.fundInceptionDate),
      ytdReturn: num(ks.ytdReturn),
      threeYearReturn: num(ks.threeYearAverageReturn),
      fiveYearReturn: num(ks.fiveYearAverageReturn),
      holdings: arr(th.holdings).map((h) => {
        const o = obj(h);
        return { symbol: str(o.symbol) ?? "", name: str(o.holdingName) ?? str(o.symbol) ?? "", weight: num(o.holdingPercent) ?? 0 };
      }),
      sectors: arr(th.sectorWeightings)
        .flatMap((s) => Object.entries(obj(s)).map(([sector, w]) => ({ sector, weight: num(w) ?? 0 })))
        .filter((s) => s.weight > 0)
        .sort((a, b) => b.weight - a.weight),
      stockPosition: num(th.stockPosition),
      bondPosition: num(th.bondPosition),
      cashPosition: num(th.cashPosition),
    };
  }
  if (lastPrice && summary.stats.dividendRate && !summary.stats.dividendYield) {
    summary.stats.dividendYield = summary.stats.dividendRate / lastPrice;
  }
  return summary;
}

// ——— financial statements ———

export async function yahooFinancials(symbol: string, period: StatementPeriod): Promise<FinancialStatements> {
  const years = period === "annual" ? 6 : 3;
  const period1 = new Date(Date.now() - years * 366 * 86_400_000);
  const [rows, quote] = await Promise.all([
    tolerant(() => yf.fundamentalsTimeSeries(symbol, { period1, type: period, module: "all" }, { validateResult: false })),
    yahooQuotes([symbol]).catch(() => ({}) as Record<string, Quote>),
  ]);
  const list = arr(rows)
    .map(obj)
    .map((r) => ({ ...r, date: ms(r.date) }))
    .filter((r) => r.date != null)
    .sort((a, b) => (a.date as number) - (b.date as number));

  const pick = <F extends string>(fields: readonly F[]) =>
    list
      .map((r) => {
        const row = { date: new Date(r.date as number).toISOString().slice(0, 10) } as { date: string } & Partial<Record<F, number>>;
        let has = false;
        for (const f of fields) {
          const v = num((r as Obj)[f]);
          if (v != null) {
            row[f] = v as never;
            has = true;
          }
        }
        return has ? row : null;
      })
      .filter((r): r is NonNullable<typeof r> => !!r);

  const q = quote[symbol];
  return {
    symbol,
    currency: q?.currency === "GBp" ? "GBP" : (q?.currency ?? "USD"),
    period,
    income: pick(INCOME_FIELDS),
    balance: pick(BALANCE_FIELDS),
    cashflow: pick(CASHFLOW_FIELDS),
  };
}

// ——— search & news ———

function mapNews(raw: unknown): NewsItem | null {
  const n = obj(raw);
  const title = str(n.title);
  const link = str(n.link);
  if (!title || !link) return null;
  const thumbs = arr(obj(n.thumbnail).resolutions).map(obj);
  const thumb = thumbs.find((t) => (num(t.width) ?? 0) >= 140) ?? thumbs[0];
  return {
    id: str(n.uuid) ?? link,
    title,
    publisher: str(n.publisher) ?? "",
    link,
    time: ms(n.providerPublishTime) ?? Date.now(),
    thumbnail: thumb ? str(thumb.url) : undefined,
    symbols: arr(n.relatedTickers).map((s) => String(s)),
  };
}

export async function yahooSearch(query: string): Promise<{ hits: SearchHit[]; news: NewsItem[] }> {
  const r = obj(
    await tolerant(() =>
      yf.search(query, { quotesCount: 12, newsCount: 6, lang: "fr-FR", region: "FR", enableFuzzyQuery: true }, { validateResult: false }),
    ),
  );
  const hits = arr(r.quotes)
    .map(obj)
    .filter((q) => q.isYahooFinance !== false && str(q.symbol))
    .map((q) => ({
      symbol: str(q.symbol) as string,
      name: str(q.longname) ?? str(q.shortname) ?? (str(q.symbol) as string),
      type: mapType(q.quoteType),
      exchange: str(q.exchDisp) ?? str(q.exchange),
      sector: str(q.sectorDisp) ?? str(q.sector),
      industry: str(q.industryDisp) ?? str(q.industry),
    }));
  const news = arr(r.news)
    .map(mapNews)
    .filter((n): n is NewsItem => !!n);
  return { hits, news };
}

export async function yahooNews(symbols: string[]): Promise<NewsItem[]> {
  const lists = await Promise.all(
    symbols.slice(0, 10).map((s) =>
      tolerant(() => yf.search(s, { quotesCount: 0, newsCount: 8 }, { validateResult: false }))
        .then((r) =>
          arr(obj(r).news)
            .map(mapNews)
            .filter((n): n is NewsItem => !!n),
        )
        .catch(() => [] as NewsItem[]),
    ),
  );
  const seen = new Map<string, NewsItem>();
  for (const list of lists) for (const n of list) if (!seen.has(n.id)) seen.set(n.id, n);
  return Array.from(seen.values())
    .sort((a, b) => b.time - a.time)
    .slice(0, 40);
}

// ——— movers ———

async function screen(scrId: string): Promise<Quote[]> {
  const r = obj(await tolerant(() => yf.screener({ scrIds: scrId as never, count: 8 }, undefined, { validateResult: false })));
  return arr(r.quotes)
    .map(mapQuote)
    .filter((q): q is Quote => !!q);
}

export async function yahooMovers(): Promise<MarketMovers> {
  const [gainers, losers, active, trendingRaw] = await Promise.all([
    screen("day_gainers").catch(() => []),
    screen("day_losers").catch(() => []),
    screen("most_actives").catch(() => []),
    tolerant(() => yf.trendingSymbols("FR", { count: 12 }, { validateResult: false })).catch(() => null),
  ]);
  const trendingSymbols = arr(obj(trendingRaw).quotes)
    .map((q) => str(obj(q).symbol))
    .filter((s): s is string => !!s)
    .slice(0, 10);
  const trendingQuotes = trendingSymbols.length ? await yahooQuotes(trendingSymbols).catch(() => ({})) : {};
  if (!gainers.length && !losers.length && !active.length && !trendingSymbols.length) {
    throw new Error("Yahoo movers unavailable");
  }
  return {
    gainers,
    losers,
    active,
    trending: trendingSymbols.map((s) => (trendingQuotes as Record<string, Quote>)[s]).filter((q): q is Quote => !!q),
  };
}

/** Market data DTOs shared by the API routes (server) and the UI (client). */

export type DataSource = "yahoo" | "simulated";

export type AssetType = "EQUITY" | "ETF" | "CRYPTOCURRENCY" | "INDEX" | "CURRENCY" | "MUTUALFUND" | "FUTURE" | "OTHER";

export type MarketState = "PRE" | "REGULAR" | "POST" | "CLOSED";

export interface Quote {
  symbol: string;
  name: string;
  shortName?: string;
  type: AssetType;
  currency: string;
  exchange?: string;
  timezone?: string;
  marketState?: MarketState;
  price: number;
  previousClose: number | null;
  change: number;
  /** Ratio, e.g. 0.0123 for +1.23 %. */
  changePercent: number;
  open?: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  marketCap?: number | null;
  pe?: number | null;
  forwardPe?: number | null;
  eps?: number | null;
  dividendRate?: number | null;
  /** Ratio. */
  dividendYield?: number | null;
  exDividendDate?: number | null;
  /** Next dividend payment date. */
  dividendDate?: number | null;
  earningsDate?: number | null;
  fiftyTwoWeekLow?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyDayAverage?: number | null;
  twoHundredDayAverage?: number | null;
  beta?: number | null;
  priceToBook?: number | null;
  /** Ratio. */
  expenseRatio?: number | null;
  extended?: { price: number; change: number; changePercent: number; session: "pre" | "post" } | null;
  /** Epoch ms of the last trade. */
  time: number;
  logoUrl?: string | null;
  analystRating?: string | null;
}

export type ChartRange = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "ytd" | "1y" | "2y" | "5y" | "10y" | "max";
export type ChartInterval = "5m" | "15m" | "30m" | "1h" | "1d" | "1wk" | "1mo";

export interface DividendEvent {
  date: string;
  /** Amount per share, in the series currency (split-adjusted). */
  amount: number;
}

export interface SplitEvent {
  date: string;
  /** New shares per old share (e.g. 4 for a 4:1 split). */
  ratio: number;
}

export interface PriceSeries {
  symbol: string;
  currency: string;
  interval: ChartInterval;
  intraday: boolean;
  timezone: string;
  /** Epoch ms of each bar. */
  t: number[];
  /** Session dates (daily and longer intervals). */
  d?: string[];
  o?: number[];
  h?: number[];
  l?: number[];
  c: number[];
  v?: number[];
  /** Close preceding the first bar (reference for intraday change). */
  previousClose?: number | null;
  dividends: DividendEvent[];
  splits: SplitEvent[];
}

export interface CompanyOfficer {
  name: string;
  title: string;
}

export interface AssetProfile {
  sector?: string;
  industry?: string;
  country?: string;
  city?: string;
  website?: string;
  employees?: number;
  description?: string;
  officers?: CompanyOfficer[];
}

export interface KeyStats {
  marketCap?: number;
  enterpriseValue?: number;
  pe?: number;
  forwardPe?: number;
  peg?: number;
  priceToBook?: number;
  priceToSales?: number;
  evToEbitda?: number;
  evToRevenue?: number;
  eps?: number;
  forwardEps?: number;
  beta?: number;
  sharesOutstanding?: number;
  floatShares?: number;
  shortPercentOfFloat?: number;
  heldByInsiders?: number;
  heldByInstitutions?: number;
  bookValue?: number;
  dividendRate?: number;
  dividendYield?: number;
  payoutRatio?: number;
  fiveYearAvgDividendYield?: number;
  exDividendDate?: number;
  profitMargin?: number;
  operatingMargin?: number;
  grossMargin?: number;
  ebitdaMargin?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  totalCash?: number;
  totalDebt?: number;
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;
  freeCashflow?: number;
  operatingCashflow?: number;
  revenue?: number;
  ebitda?: number;
  fiftyTwoWeekChange?: number;
  averageVolume?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  financialCurrency?: string;
}

export interface RecommendationPeriod {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface RatingChange {
  date: number;
  firm: string;
  action: string;
  fromGrade?: string;
  toGrade?: string;
  priceTarget?: number;
}

export interface AnalystData {
  recommendationMean?: number;
  recommendationKey?: string;
  analystCount?: number;
  targetLow?: number;
  targetMean?: number;
  targetMedian?: number;
  targetHigh?: number;
  trend: RecommendationPeriod[];
  changes: RatingChange[];
}

export interface EarningsQuarter {
  label: string;
  date?: number;
  actual?: number | null;
  estimate?: number | null;
  surprise?: number | null;
}

export interface EarningsData {
  nextDate?: number;
  nextEpsEstimate?: number;
  nextRevenueEstimate?: number;
  history: EarningsQuarter[];
}

export interface FundData {
  family?: string;
  category?: string;
  expenseRatio?: number;
  totalAssets?: number;
  inceptionDate?: number;
  ytdReturn?: number;
  threeYearReturn?: number;
  fiveYearReturn?: number;
  holdings: { symbol: string; name: string; weight: number }[];
  sectors: { sector: string; weight: number }[];
  stockPosition?: number;
  bondPosition?: number;
  cashPosition?: number;
}

export interface AssetSummary {
  symbol: string;
  name: string;
  type: AssetType;
  currency: string;
  exchange?: string;
  profile: AssetProfile;
  stats: KeyStats;
  analysts?: AnalystData;
  earnings?: EarningsData;
  fund?: FundData;
  calendar: { exDividendDate?: number; dividendDate?: number; earningsDate?: number };
}

export type StatementPeriod = "annual" | "quarterly";

export const INCOME_FIELDS = [
  "totalRevenue",
  "costOfRevenue",
  "grossProfit",
  "researchAndDevelopment",
  "sellingGeneralAndAdministration",
  "operatingExpense",
  "operatingIncome",
  "EBITDA",
  "pretaxIncome",
  "taxProvision",
  "netIncome",
  "dilutedEPS",
  "dilutedAverageShares",
] as const;

export const BALANCE_FIELDS = [
  "totalAssets",
  "currentAssets",
  "cashAndCashEquivalents",
  "totalLiabilitiesNetMinorityInterest",
  "currentLiabilities",
  "totalDebt",
  "longTermDebt",
  "netDebt",
  "stockholdersEquity",
] as const;

export const CASHFLOW_FIELDS = [
  "operatingCashFlow",
  "investingCashFlow",
  "financingCashFlow",
  "capitalExpenditure",
  "freeCashFlow",
  "cashDividendsPaid",
  "repurchaseOfCapitalStock",
] as const;

export type IncomeField = (typeof INCOME_FIELDS)[number];
export type BalanceField = (typeof BALANCE_FIELDS)[number];
export type CashflowField = (typeof CASHFLOW_FIELDS)[number];

export type StatementRow<F extends string> = { date: string } & Partial<Record<F, number>>;

export interface FinancialStatements {
  symbol: string;
  currency: string;
  period: StatementPeriod;
  income: StatementRow<IncomeField>[];
  balance: StatementRow<BalanceField>[];
  cashflow: StatementRow<CashflowField>[];
}

export interface SearchHit {
  symbol: string;
  name: string;
  type: AssetType;
  exchange?: string;
  sector?: string;
  industry?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  link: string;
  time: number;
  thumbnail?: string;
  symbols: string[];
}

export interface MarketMovers {
  gainers: Quote[];
  losers: Quote[];
  active: Quote[];
  trending: Quote[];
}

export interface ApiEnvelope<T> {
  source: DataSource;
  asOf: number;
  data: T;
  /** Human readable issues for partially failed requests (e.g. unknown symbols). */
  errors?: string[];
}

export interface DataStatus {
  mode: "auto" | "yahoo" | "simulated";
  source: DataSource;
  yahooReachable: boolean | null;
  lastError?: string;
  checkedAt: number;
}

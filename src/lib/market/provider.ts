import "server-only";
import type { DayKey } from "../dates";
import { cache, TTL } from "./cache";
import * as sim from "./simulated";
import * as yahoo from "./yahoo";
import type {
  ApiEnvelope,
  AssetSummary,
  ChartInterval,
  ChartRange,
  DataSource,
  DataStatus,
  FinancialStatements,
  MarketMovers,
  NewsItem,
  PriceSeries,
  Quote,
  SearchHit,
  StatementPeriod,
} from "./types";

/**
 * Chooses between Yahoo Finance and the simulator.
 *
 * MARKET_DATA_SOURCE:
 *  - "auto" (default): Yahoo first; if Yahoo is unreachable the simulator answers
 *    and every response is flagged `source: "simulated"` so the UI can say so.
 *  - "yahoo": Yahoo only, errors are surfaced.
 *  - "simulated": never calls Yahoo (offline demo).
 */

type Mode = DataStatus["mode"];

function mode(): Mode {
  const m = (process.env.MARKET_DATA_SOURCE ?? "auto").toLowerCase();
  return m === "yahoo" || m === "simulated" ? m : "auto";
}

const RETRY_AFTER_MS = 60_000;

const globalForState = globalThis as unknown as {
  __lumenProvider?: { downUntil: number; reachable: boolean | null; lastError?: string; checkedAt: number };
};
const state = (globalForState.__lumenProvider ??= { downUntil: 0, reachable: null, checkedAt: 0 });

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** Distinguishes "Yahoo is unreachable" from "this symbol does not exist". */
function isUnavailable(err: unknown): boolean {
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string; message?: string } };
  const text = `${e?.name ?? ""} ${e?.message ?? ""} ${e?.code ?? ""} ${e?.cause?.code ?? ""} ${e?.cause?.message ?? ""}`;
  return /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|UND_ERR|socket|network|tunnel|certificate|TimeoutError|aborted|Too Many Requests|\b429\b|Invalid Crumb|Unauthorized|Forbidden|crumb|cookie|unavailable|HTTP\w*\W+5\d\d|status (code )?5\d\d|Service Unavailable|Bad Gateway|Gateway Timeout/i.test(
    text,
  );
}

function markUp() {
  state.reachable = true;
  state.lastError = undefined;
  state.checkedAt = Date.now();
}

function markDown(err: unknown) {
  state.reachable = false;
  state.downUntil = Date.now() + RETRY_AFTER_MS;
  state.lastError = (err as Error)?.message?.slice(0, 200) ?? String(err);
  state.checkedAt = Date.now();
}

async function withSource<T>(
  key: string,
  ttl: number,
  fromYahoo: () => Promise<T>,
  fromSim: () => T,
): Promise<{ source: DataSource; data: T }> {
  const m = mode();
  if (m === "simulated" || (m === "auto" && Date.now() < state.downUntil)) {
    return { source: "simulated", data: fromSim() };
  }
  try {
    const data = await cache.wrap(`y:${key}`, ttl, fromYahoo);
    markUp();
    return { source: "yahoo", data };
  } catch (err) {
    if (isUnavailable(err)) {
      markDown(err);
      if (m === "yahoo") throw new UpstreamError("Yahoo Finance est injoignable.", 503);
      return { source: "simulated", data: fromSim() };
    }
    throw new UpstreamError((err as Error)?.message ?? "Erreur du fournisseur de données", 404);
  }
}

function envelope<T>(source: DataSource, data: T, errors?: string[]): ApiEnvelope<T> {
  return { source, asOf: Date.now(), data, ...(errors?.length ? { errors } : {}) };
}

export function dataStatus(): DataStatus {
  const m = mode();
  const simulated = m === "simulated" || (m === "auto" && (state.reachable === false || Date.now() < state.downUntil));
  return {
    mode: m,
    source: simulated ? "simulated" : "yahoo",
    yahooReachable: m === "simulated" ? null : state.reachable,
    lastError: state.lastError,
    checkedAt: state.checkedAt,
  };
}

// ——— endpoints ———

export async function getQuotes(symbols: string[]): Promise<ApiEnvelope<Record<string, Quote>>> {
  const sorted = [...new Set(symbols)].sort();
  const { source, data } = await withSource(
    `quotes:${sorted.join(",")}`,
    TTL.quote,
    () => yahoo.yahooQuotes(sorted),
    () => sim.simQuotes(sorted),
  );
  const missing = sorted.filter((s) => !data[s]);
  return envelope(source, data, missing.length ? missing.map((s) => `Cours introuvable pour ${s}`) : undefined);
}

export interface SeriesQuery {
  range?: ChartRange;
  from?: DayKey;
  interval?: ChartInterval;
}

export async function getSeries(symbol: string, q: SeriesQuery): Promise<ApiEnvelope<PriceSeries>> {
  const key = `series:${symbol}:${q.range ?? ""}:${q.from ?? ""}:${q.interval ?? ""}`;
  const intraday = q.range === "1d" || q.range === "5d" || q.range === "1mo";
  const { source, data } = await withSource(
    key,
    intraday ? TTL.intraday : TTL.daily,
    () => yahoo.yahooSeries(symbol, q),
    () => sim.simSeries(symbol, q),
  );
  return envelope(source, data);
}

/** Daily closes of many symbols since a date (portfolio valuation). */
export async function getHistory(symbols: string[], from: DayKey): Promise<ApiEnvelope<Record<string, PriceSeries>>> {
  const out: Record<string, PriceSeries> = {};
  const errors: string[] = [];
  let source: DataSource = "yahoo";
  await Promise.all(
    [...new Set(symbols)].map(async (symbol) => {
      try {
        const res = await withSource(
          `history:${symbol}:${from}`,
          TTL.history,
          () => yahoo.yahooSeries(symbol, { from, interval: "1d" }),
          () => sim.simSeries(symbol, { from, interval: "1d" }),
        );
        if (res.source === "simulated") source = "simulated";
        out[symbol] = res.data;
      } catch (err) {
        errors.push(`${symbol} : ${(err as Error).message}`);
      }
    }),
  );
  return envelope(source, out, errors);
}

export async function getSummary(symbol: string): Promise<ApiEnvelope<AssetSummary>> {
  const { source, data } = await withSource(
    `summary:${symbol}`,
    TTL.summary,
    () => yahoo.yahooSummary(symbol),
    () => sim.simSummary(symbol),
  );
  return envelope(source, data);
}

export async function getFinancials(symbol: string, period: StatementPeriod): Promise<ApiEnvelope<FinancialStatements>> {
  const { source, data } = await withSource(
    `financials:${symbol}:${period}`,
    TTL.financials,
    () => yahoo.yahooFinancials(symbol, period),
    () => sim.simFinancials(symbol, period),
  );
  return envelope(source, data);
}

export async function searchInstruments(query: string): Promise<ApiEnvelope<{ hits: SearchHit[]; news: NewsItem[] }>> {
  const { source, data } = await withSource(
    `search:${query.toLowerCase()}`,
    TTL.search,
    () => yahoo.yahooSearch(query),
    () => ({ hits: sim.simSearch(query), news: [] }),
  );
  return envelope(source, data);
}

export async function getNews(symbols: string[]): Promise<ApiEnvelope<NewsItem[]>> {
  const sorted = [...new Set(symbols)].sort();
  const { source, data } = await withSource(
    `news:${sorted.join(",")}`,
    TTL.news,
    () => yahoo.yahooNews(sorted),
    () => [],
  );
  return envelope(source, data);
}

export async function getMovers(): Promise<ApiEnvelope<MarketMovers>> {
  const { source, data } = await withSource(
    "movers",
    TTL.movers,
    () => yahoo.yahooMovers(),
    () => sim.simMovers(),
  );
  return envelope(source, data);
}

"use client";

import { ChartCandlestick, ChartLine, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { CandleChart } from "@/components/charts/candle-chart";
import { TimeSeriesChart, type ChartMarker, type ChartSeries } from "@/components/charts/time-series-chart";
import { Card } from "@/components/ui/card";
import { DeltaPill } from "@/components/ui/delta";
import { AnimatedPrice } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { useChart, useCharts } from "@/hooks/use-market";
import { formatPointTime, formatTick, RANGE_SUFFIX, spanOfRange } from "@/lib/chart-format";
import { formatCompact, formatPercent, formatPrice, formatQuantity } from "@/lib/format";
import { BENCHMARKS } from "@/lib/market/catalog";
import type { ChartRange, PriceSeries, Quote } from "@/lib/market/types";
import type { Transaction } from "@/lib/portfolio/types";
import { cn } from "@/lib/utils";

const RANGES: { value: ChartRange; label: string }[] = [
  { value: "1d", label: "1J" },
  { value: "5d", label: "5J" },
  { value: "1mo", label: "1M" },
  { value: "6mo", label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1A" },
  { value: "5y", label: "5A" },
  { value: "max", label: "Max" },
];

const COMPARE_COLORS = ["var(--chart-2)", "var(--chart-3)", "var(--chart-7)"];

/** Values of `other` carried onto the timestamps of the primary series. */
function alignTo(primary: PriceSeries, other: PriceSeries | undefined): (number | null)[] {
  if (!other?.c.length) return primary.t.map(() => null);
  const byDay = !primary.intraday && primary.d && other.d;
  let j = 0;
  let last: number | null = null;
  return primary.t.map((t, i) => {
    if (byDay) {
      const day = (primary.d as string[])[i];
      while (j < (other.d as string[]).length && (other.d as string[])[j] <= day) last = other.c[j++];
    } else {
      while (j < other.t.length && other.t[j] <= t) last = other.c[j++];
    }
    return last;
  });
}

export function PriceChart({
  symbol,
  name,
  quote,
  transactions,
  avgCost,
}: {
  symbol: string;
  name: string;
  quote?: Quote;
  transactions: Transaction[];
  /** Average cost of the open position, in the instrument currency. */
  avgCost?: number;
}) {
  const [range, setRange] = useState<ChartRange>("1y");
  const [kind, setKind] = useState<"line" | "candle">("line");
  const [compare, setCompare] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const chart = useChart(symbol, range);
  const others = useCharts(compare, range);
  const data = chart.data;
  const span = spanOfRange(range);
  const currency = quote?.currency ?? data?.currency;
  const comparing = compare.length > 0;
  const candles = kind === "candle" && !comparing && !!data?.o && !!data?.h && !!data?.l;

  const ref = useMemo(() => {
    if (!data?.c.length) return null;
    if (range === "1d") return data.previousClose ?? data.c[0];
    return data.previousClose && span !== "long" && range !== "5d" ? data.previousClose : data.c[0];
  }, [data, range, span]);

  const series = useMemo<ChartSeries[]>(() => {
    if (!data?.c.length || ref == null) return [];
    const last = data.c[data.c.length - 1];
    const up = last >= ref;
    if (!comparing) return [{ id: symbol, label: symbol, values: data.c, color: up ? "var(--gain)" : "var(--loss)", area: true }];
    const base = data.c[0];
    const out: ChartSeries[] = [
      { id: symbol, label: symbol, values: data.c.map((v) => v / base - 1), color: "var(--accent)", strokeWidth: 2.25 },
    ];
    compare.forEach((s, k) => {
      const aligned = alignTo(data, others.data[s]);
      const first = aligned.find((v) => v != null);
      out.push({
        id: s,
        label: BENCHMARKS.find((b) => b.symbol === s)?.label ?? s,
        values: aligned.map((v) => (v != null && first ? v / first - 1 : null)),
        color: COMPARE_COLORS[k % COMPARE_COLORS.length],
      });
    });
    return out;
  }, [data, ref, comparing, compare, others.data, symbol]);

  const markers = useMemo<ChartMarker[]>(() => {
    if (!data?.c.length || comparing) return [];
    const out: ChartMarker[] = [];
    for (const tx of transactions) {
      if (tx.type !== "BUY" && tx.type !== "SELL" && tx.type !== "DIVIDEND") continue;
      let idx = -1;
      if (data.d) idx = data.d.findIndex((d) => d >= tx.date);
      else idx = data.t.findIndex((t) => new Date(t).toISOString().slice(0, 10) >= tx.date);
      if (idx < 0 || (idx === 0 && (data.d?.[0] ?? "") > tx.date)) continue;
      const label =
        tx.type === "DIVIDEND"
          ? `Dividende ${formatPrice((tx.amount ?? 0) - (tx.fees ?? 0), tx.currency)}`
          : `${tx.type === "BUY" ? "Achat" : "Vente"} ${formatQuantity(tx.quantity)} × ${formatPrice(tx.price, tx.currency)}`;
      out.push({ index: idx, kind: tx.type === "BUY" ? "buy" : tx.type === "SELL" ? "sell" : "dividend", label });
    }
    return out;
  }, [data, transactions, comparing]);

  // The average cost line, when it falls near the visible prices (never squash the chart for it).
  const costLine = useMemo(() => {
    if (!avgCost || comparing || range === "1d" || !data?.c.length) return null;
    const finite = data.c.filter(Number.isFinite);
    const lo = Math.min(...finite);
    const hi = Math.max(...finite);
    const pad = (hi - lo) * 0.25;
    return avgCost >= lo - pad && avgCost <= hi + pad ? { value: avgCost, label: `Votre PRU · ${formatPrice(avgCost, currency)}` } : null;
  }, [avgCost, comparing, range, data, currency]);

  const h = hover != null && data && hover < data.c.length ? hover : null;
  const shown = h != null && data ? data.c[h] : (quote?.price ?? data?.c.at(-1) ?? 0);
  const refForDelta = range === "1d" ? (quote?.previousClose ?? ref) : ref;
  const change = refForDelta != null ? shown - refForDelta : 0;
  const pct = refForDelta ? change / refForDelta : 0;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-2 sm:p-6 sm:pb-2">
        <div>
          <div className="text-[34px] leading-none font-semibold tracking-tight sm:text-[42px]">
            {data || quote ? <AnimatedPrice value={shown} currency={currency} /> : <Skeleton className="h-10 w-48" />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {refForDelta != null && (
              <DeltaPill
                amount={null}
                percent={pct}
                animated={h == null}
                suffix={`${change >= 0 ? "+" : ""}${formatPrice(change, currency)} · ${h != null && data ? formatPointTime(data.t[h], span) : RANGE_SUFFIX[range]}`}
              />
            )}
            {quote?.extended && range === "1d" && (
              <span className="text-xs text-muted">
                {quote.extended.session === "pre" ? "Pré-marché" : "Après-bourse"} {formatPrice(quote.extended.price, currency)}{" "}
                <span className={quote.extended.changePercent >= 0 ? "text-gain" : "text-loss"}>
                  {formatPercent(quote.extended.changePercent, { sign: true })}
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Période"
            value={range}
            onChange={setRange}
            options={RANGES}
            className="max-w-full overflow-x-auto scrollbar-none"
          />
          <Segmented
            ariaLabel="Type de graphique"
            value={candles || kind === "candle" ? "candle" : "line"}
            onChange={(k) => {
              setKind(k);
              if (k === "candle") setCompare([]);
            }}
            options={[
              { value: "line", label: <ChartLine className="size-3.5" />, title: "Ligne" },
              { value: "candle", label: <ChartCandlestick className="size-3.5" />, title: "Chandeliers" },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 pb-1 sm:px-6">
        <AnimatePresence>
          {compare.map((s, k) => (
            <motion.span
              key={s}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 pr-1 pl-2.5 text-xs font-medium ring-1 ring-border"
            >
              <span className="h-0.5 w-3 rounded-full" style={{ background: COMPARE_COLORS[k % COMPARE_COLORS.length] }} />
              {BENCHMARKS.find((b) => b.symbol === s)?.label ?? s}
              <button
                type="button"
                onClick={() => setCompare((c) => c.filter((x) => x !== s))}
                className="grid size-5 place-items-center rounded-full hover:bg-surface-3"
                aria-label={`Retirer ${s}`}
              >
                <X className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        {compare.length < 3 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPicking((p) => !p)}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs text-muted ring-1 ring-border ring-dashed transition hover:bg-surface-2 hover:text-fg"
            >
              <Plus className="size-3" /> Comparer
            </button>
            <AnimatePresence>
              {picking && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute top-full left-0 z-20 mt-1.5 w-60 rounded-2xl bg-surface-3 p-1.5 shadow-[var(--shadow-pop)]"
                >
                  {BENCHMARKS.filter((b) => b.symbol !== symbol && !compare.includes(b.symbol)).map((b) => (
                    <button
                      key={b.symbol}
                      type="button"
                      onClick={() => {
                        setCompare((c) => [...c, b.symbol]);
                        setKind("line");
                        setPicking(false);
                      }}
                      className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-surface-2"
                    >
                      <span className="text-sm font-medium">{b.label}</span>
                      <span className="text-[11px] text-subtle">{b.description}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {markers.length > 0 && (
          <span className="ml-auto hidden items-center gap-3 text-[11px] text-subtle sm:flex">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-gain" /> Achat
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-loss" /> Vente
            </span>
          </span>
        )}
      </div>

      <div className={cn("px-2 pt-2 pb-3 sm:px-3", chart.isFetching && !chart.isLoading && "opacity-70 transition-opacity")}>
        {!data ? (
          <Skeleton className="mx-3 h-[320px] rounded-2xl" />
        ) : !data.c.length ? (
          <div className="grid h-[320px] place-items-center text-sm text-muted">Pas de données pour cette période.</div>
        ) : candles ? (
          <CandleChart
            t={data.t}
            o={data.o as number[]}
            h={data.h as number[]}
            l={data.l as number[]}
            c={data.c}
            v={data.v}
            height={340}
            animationKey={`${symbol}|${range}`}
            formatValue={(v) => formatPrice(v)}
            formatX={(t) => formatPointTime(t, span)}
            formatXTick={(t) => formatTick(t, span)}
            formatVolume={(v) => formatCompact(v)}
            onHover={setHover}
            ariaLabel={`Chandeliers ${name}`}
          />
        ) : (
          <TimeSeriesChart
            x={data.t}
            series={series}
            height={340}
            animationKey={`${symbol}|${range}|${compare.join(",")}`}
            formatValue={(v) => (comparing ? formatPercent(v, { sign: true }) : formatPrice(v, currency))}
            formatAxis={(v) => (comparing ? formatPercent(v, { decimals: 0 }) : formatPrice(v))}
            formatX={(t) => formatPointTime(t, span)}
            formatXTick={(t) => formatTick(t, span)}
            baseline={!comparing && range === "1d" && refForDelta != null ? { value: refForDelta, label: "Clôture préc." } : costLine}
            zeroLine={comparing}
            markers={markers}
            onHover={setHover}
            tooltip={comparing || markers.length > 0}
            liveDot={range === "1d" && !comparing}
            ariaLabel={`Cours de ${name} ${RANGE_SUFFIX[range]}`}
          />
        )}
      </div>
    </Card>
  );
}

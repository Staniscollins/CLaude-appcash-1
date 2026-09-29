"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { TimeSeriesChart, type ChartSeries } from "@/components/charts/time-series-chart";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { Card } from "@/components/ui/card";
import { DeltaPill } from "@/components/ui/delta";
import { AnimatedMoney } from "@/components/ui/money";
import { Badge, Hint, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { useHistorySeries } from "@/hooks/use-market";
import { usePortfolioChart } from "@/hooks/use-portfolio-chart";
import { formatPointTime, formatTick, moneyAxis, RANGE_SUFFIX } from "@/lib/chart-format";
import { addDays } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/format";
import { BENCHMARKS } from "@/lib/market/catalog";
import { alignBenchmark } from "@/lib/portfolio/history";
import { useAppStore, type DashboardRange } from "@/lib/store";
import { cn } from "@/lib/utils";

const RANGES: { value: DashboardRange; label: string }[] = [
  { value: "1d", label: "1J" },
  { value: "5d", label: "1S" },
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1A" },
  { value: "5y", label: "5A" },
  { value: "max", label: "Max" },
];

export function HeroCard({ className }: { className?: string }) {
  const { snapshot, settings, daily, tables, hydrated, quotesReady, accounts, accountFilter } = usePortfolio();
  const update = useAppStore((s) => s.updateSettings);
  const range = settings.dashboardRange;
  const chart = usePortfolioChart(range);
  const [hover, setHover] = useState<number | null>(null);
  const base = settings.baseCurrency;
  const showInvested = settings.showInvestedLine && !chart.intraday;

  // Benchmark over the same period (daily ranges only).
  const benchmark = BENCHMARKS.find((b) => b.symbol === settings.benchmark) ?? BENCHMARKS[0];
  const from = daily.length ? addDays(daily[0].day, -10) : null;
  const benchHistory = useHistorySeries(!chart.intraday && daily.length ? [benchmark.symbol] : [], from);
  const benchReturn = useMemo(() => {
    if (chart.intraday || chart.x.length < 2) return null;
    const days = chart.x.map((t) => new Date(t).toISOString().slice(0, 10));
    const aligned = alignBenchmark(benchHistory.data[benchmark.symbol], tables, days);
    const first = aligned.find((v) => v != null);
    const last = aligned[aligned.length - 1];
    return first && last ? last / first - 1 : null;
  }, [chart.intraday, chart.x, benchHistory.data, benchmark.symbol, tables]);

  const up = chart.pnl >= 0;
  const color = up ? "var(--gain)" : "var(--loss)";
  const series = useMemo<ChartSeries[]>(() => {
    const s: ChartSeries[] = [{ id: "value", label: "Valeur", values: chart.value, color, area: true }];
    if (showInvested)
      s.push({ id: "invested", label: "Investi", values: chart.invested, color: "var(--chart-muted)", muted: true, strokeWidth: 1.5 });
    return s;
  }, [chart.value, chart.invested, color, showInvested]);

  const h = hover != null && hover < chart.value.length ? hover : null;
  const shownValue = h != null ? chart.value[h] : snapshot.totals.value;
  let shownPnl = chart.pnl;
  let shownPct = chart.pct;
  if (h != null) {
    if (chart.intraday) {
      shownPnl = chart.value[h] - chart.reference;
      shownPct = chart.reference ? shownPnl / chart.reference : 0;
    } else {
      shownPnl = chart.value[h] - chart.reference - ((chart.invested[h] ?? 0) - chart.referenceInvested) + (chart.incomeCum?.[h] ?? 0);
      shownPct = chart.twr ? chart.twr[h] / chart.twr[0] - 1 : 0;
    }
  } else if (range === "1d") {
    shownPnl = snapshot.totals.dayChange;
    shownPct = snapshot.totals.dayChangePct;
  }
  const account = accounts.find((a) => a.id === accountFilter);
  const loading = !hydrated || !quotesReady;

  return (
    <Card className={cn("overflow-hidden", className)} padded={false}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-60 transition-colors duration-700"
        style={{ background: `radial-gradient(80% 100% at 20% 0%, color-mix(in oklab, ${color} 16%, transparent), transparent 70%)` }}
      />
      <div className="relative flex flex-col gap-4 p-5 pb-2 sm:p-6 sm:pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted">
              Valeur du portefeuille
              {account && <Badge tone="accent">{account.name}</Badge>}
            </div>
            <div className="mt-1.5 text-[40px] leading-none font-semibold tracking-tight sm:text-[52px]">
              {loading ? <Skeleton className="h-12 w-64" /> : <AnimatedMoney value={shownValue} currency={base} animated={h == null} />}
            </div>
            <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2">
              {!loading && (
                <DeltaPill
                  amount={shownPnl}
                  percent={shownPct}
                  currency={base}
                  animated={h == null}
                  suffix={h != null ? formatPointTime(chart.x[h], chart.span) : RANGE_SUFFIX[range]}
                />
              )}
              <AnimatePresence>
                {benchReturn != null && h == null && !loading && (
                  <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                    <Hint content={`${benchmark.description}. Écart de performance (TWR) sur la période.`}>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-muted ring-1 ring-border">
                        vs {benchmark.label}
                        <span className={cn("font-semibold tabular", chart.pct - benchReturn >= 0 ? "text-gain" : "text-loss")}>
                          {formatPercent(chart.pct - benchReturn, { sign: true, decimals: 1 }).replace("%", "pts")}
                        </span>
                      </span>
                    </Hint>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
          <Segmented
            ariaLabel="Période"
            value={range}
            onChange={(v) => update({ dashboardRange: v })}
            options={RANGES}
            className="max-w-full overflow-x-auto scrollbar-none"
          />
        </div>
      </div>

      <div className="relative px-2 sm:px-3">
        {chart.ready && chart.x.length > 1 ? (
          <TimeSeriesChart
            x={chart.x}
            series={series}
            height={300}
            animationKey={`${range}|${accountFilter}`}
            formatValue={(v) => formatMoney(v, base)}
            formatAxis={moneyAxis(base)}
            formatX={(t) => formatPointTime(t, chart.span)}
            formatXTick={(t) => formatTick(t, chart.span)}
            baseline={chart.intraday ? { value: chart.reference, label: range === "1d" ? "Clôture de la veille" : undefined } : null}
            onHover={setHover}
            tooltip={false}
            liveDot={range === "1d"}
            ariaLabel={`Évolution de la valeur du portefeuille ${RANGE_SUFFIX[range]}`}
          />
        ) : (
          <div className="grid h-[300px] place-items-center px-4">
            {chart.ready || (!loading && chart.intraday && !snapshot.positions.length) ? (
              <p className="text-sm text-muted">Pas encore assez d&apos;historique pour cette période.</p>
            ) : (
              <Skeleton className="h-[260px] w-full rounded-2xl" />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-5 py-3 text-xs text-muted sm:px-6">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: color }} /> Valeur
        </span>
        {!chart.intraday && (
          <button
            type="button"
            onClick={() => update({ showInvestedLine: !settings.showInvestedLine })}
            className={cn("flex items-center gap-1.5 transition hover:text-fg", !settings.showInvestedLine && "opacity-50")}
            aria-pressed={settings.showInvestedLine}
          >
            <span className="h-0.5 w-3 rounded-full bg-[var(--chart-muted)]" /> Montant investi
          </button>
        )}
        <span className="ml-auto hidden sm:inline">Survolez la courbe · ← → au clavier</span>
      </div>
    </Card>
  );
}

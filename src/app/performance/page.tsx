"use client";

import { Activity, ChartLine, Sigma, TrendingDown, Trophy, Wand2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { ReturnsHeatmap } from "@/components/charts/returns-heatmap";
import { TimeSeriesChart, type ChartSeries } from "@/components/charts/time-series-chart";
import { Onboarding } from "@/components/dashboard/onboarding";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Card, CardHeader, Stagger } from "@/components/ui/card";
import { DeltaMoney, trendClass } from "@/components/ui/delta";
import { Money } from "@/components/ui/money";
import { EmptyState, InfoTip, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { useHistorySeries, useQuotes } from "@/hooks/use-market";
import { formatTick, RANGE_SUFFIX } from "@/lib/chart-format";
import { addDays, dayKeyToUTC, type DayKey } from "@/lib/dates";
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { BENCHMARKS } from "@/lib/market/catalog";
import { contributions } from "@/lib/portfolio/attribution";
import { alignBenchmark, simulateSameFlows, type DailyPoint } from "@/lib/portfolio/history";
import { buildMarketTables, fxSymbolsFor } from "@/lib/portfolio/market-tables";
import {
  annualReturns,
  drawdownSeries,
  monthlyReturns,
  monthlyReturnsFromPrices,
  riskMetrics,
  slicePeriod,
  summarizePeriod,
  type RiskMetrics,
} from "@/lib/portfolio/metrics";
import { periodStart } from "@/lib/portfolio/ranges";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const RANGES = [
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "6mo", label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1A" },
  { value: "3y", label: "3A" },
  { value: "5y", label: "5A" },
  { value: "max", label: "Max" },
] as const;

type Range = (typeof RANGES)[number]["value"];
const BENCH_COLORS = ["var(--chart-2)", "var(--chart-3)", "var(--chart-7)"];

/** Daily points of a benchmark (base currency), shaped like portfolio points. */
function benchPoints(days: DayKey[], values: (number | null)[]): DailyPoint[] {
  const out: DailyPoint[] = [];
  let prev: number | null = null;
  let twr = 1;
  days.forEach((day, i) => {
    const v = values[i];
    if (v == null) return;
    const ret = prev ? v / prev - 1 : 0;
    twr *= 1 + ret;
    out.push({ day, value: v, securities: v, cash: 0, netInvested: 0, inflow: 0, outflow: 0, income: 0, dividends: 0, twr, ret });
    prev = v;
  });
  return out;
}

export default function PerformancePage() {
  const { daily, snapshot, settings, transactions, tables, quotes, history, today, hydrated, isEmpty, historyReady, meta } = usePortfolio();
  const [range, setRange] = useState<Range>("1y");
  const [benchmarks, setBenchmarks] = useState<string[]>([settings.benchmark]);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const base = settings.baseCurrency;

  // Benchmark closes and any FX series they need.
  const from = daily.length ? addDays(daily[0].day, -10) : null;
  const benchCurrencies = benchmarks.map((b) => BENCHMARKS.find((x) => x.symbol === b)).map((b) => (b?.symbol === "GC=F" ? "USD" : "EUR"));
  const fxExtra = fxSymbolsFor(benchCurrencies, base).filter((s) => !history[s]);
  const benchHistory = useHistorySeries(daily.length ? [...benchmarks, ...fxExtra] : [], from);
  const fxQuotes = useQuotes(fxExtra);
  const localTables = useMemo(
    () =>
      fxExtra.length || benchmarks.some((b) => !history[b])
        ? buildMarketTables({ base, quotes: { ...quotes, ...(fxQuotes.data ?? {}) }, history: { ...history, ...benchHistory.data } })
        : tables,
    [fxExtra.length, benchmarks, history, base, quotes, fxQuotes.data, benchHistory.data, tables],
  );

  const start = periodStart(range, today);
  const slice = useMemo(() => slicePeriod(daily, start), [daily, start]);
  const pts = useMemo(() => (slice.base ? [slice.base, ...slice.points] : slice.points), [slice]);
  const days = useMemo(() => pts.map((p) => p.day), [pts]);
  const summary = useMemo(() => summarizePeriod(slice), [slice]);

  const benchData = useMemo(
    () =>
      benchmarks.map((symbol) => {
        const aligned = alignBenchmark(benchHistory.data[symbol], localTables, days);
        const bp = benchPoints(days, aligned);
        const first = bp[0]?.value;
        const last = bp[bp.length - 1]?.value;
        const ret = first && last ? last / first - 1 : null;
        const years = days.length ? Math.max(1, (dayKeyToUTC(days[days.length - 1]) - dayKeyToUTC(days[0])) / 86_400_000) / 365.25 : 0;
        return {
          symbol,
          label: BENCHMARKS.find((b) => b.symbol === symbol)?.label ?? symbol,
          aligned,
          ret,
          annualized: ret != null && years >= 0.999 ? Math.pow(1 + ret, 1 / years) - 1 : null,
          risk: bp.length > 20 ? riskMetrics(bp, { riskFree: settings.riskFreeRate }) : null,
        };
      }),
    [benchmarks, benchHistory.data, localTables, days, settings.riskFreeRate],
  );

  const primary = benchData[0];
  const risk = useMemo<RiskMetrics | null>(
    () =>
      pts.length > 2
        ? riskMetrics(pts, {
            riskFree: settings.riskFreeRate,
            benchmark: primary?.aligned,
            annualizedReturn: summary?.annualizedTwr ?? null,
            benchmarkAnnualized: primary?.annualized ?? null,
          })
        : null,
    [pts, settings.riskFreeRate, primary, summary],
  );

  const chartSeries = useMemo<ChartSeries[]>(() => {
    if (pts.length < 2) return [];
    const t0 = pts[0].twr;
    const s: ChartSeries[] = [
      { id: "pf", label: "Portefeuille", values: pts.map((p) => p.twr / t0 - 1), color: "var(--accent)", area: true, strokeWidth: 2.25 },
    ];
    benchData.forEach((b, i) => {
      const first = b.aligned.find((v) => v != null);
      s.push({
        id: b.symbol,
        label: b.label,
        values: b.aligned.map((v) => (v != null && first ? v / first - 1 : null)),
        color: BENCH_COLORS[i],
      });
    });
    return s;
  }, [pts, benchData]);

  const whatIf = useMemo(() => {
    if (!primary || pts.length < 2) return null;
    const seeded = pts.map((p, i) => (i === 0 && slice.base ? { ...p, inflow: p.value, outflow: 0, income: 0 } : p));
    const sim = simulateSameFlows(seeded, primary.aligned);
    const simEnd = sim[sim.length - 1];
    const pfEnd = pts[pts.length - 1].value + (summary?.income ?? 0);
    return simEnd != null ? { bench: simEnd, portfolio: pfEnd, diff: pfEnd - simEnd } : null;
  }, [primary, pts, slice.base, summary]);

  const years = useMemo(() => monthlyReturns(daily), [daily]);
  const benchYears = useMemo(() => {
    if (!primary) return undefined;
    const allDays = daily.map((p) => p.day);
    const aligned = alignBenchmark(benchHistory.data[primary.symbol], localTables, allDays);
    const monthly = monthlyReturnsFromPrices(allDays, aligned);
    const map = new Map<number, number | null>();
    for (const [k, r] of monthly) {
      const y = Number(k.slice(0, 4));
      map.set(y, ((map.get(y) ?? 0) + 1) * (1 + r) - 1);
    }
    return map;
  }, [primary, daily, benchHistory.data, localTables]);

  const annual = useMemo(() => annualReturns(daily), [daily]);
  const drawdown = useMemo(() => drawdownSeries(pts), [pts]);
  const contrib = useMemo(
    () => contributions({ transactions, tables, start, today, autoDividends: settings.autoDividends }),
    [transactions, tables, start, today, settings.autoDividends],
  );

  if (hydrated && isEmpty) return <Onboarding />;
  const loading = !hydrated || !historyReady;

  const toggleBenchmark = (symbol: string) =>
    setBenchmarks((list) => {
      if (list.includes(symbol)) return list.length > 1 ? list.filter((s) => s !== symbol) : list;
      const next = [...list, symbol].slice(-3);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Performance"
        description="Rendements pondérés par le temps, risque et comparaison aux indices de référence."
        actions={<Segmented ariaLabel="Période" value={range} onChange={setRange} options={[...RANGES]} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted">Comparer à</span>
        {BENCHMARKS.map((b) => {
          const idx = benchmarks.indexOf(b.symbol);
          const active = idx >= 0;
          return (
            <button
              key={b.symbol}
              type="button"
              title={b.description}
              onClick={() => toggleBenchmark(b.symbol)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition",
                active ? "bg-surface-2 text-fg ring-border-strong" : "text-muted ring-border hover:bg-surface-2 hover:text-fg",
              )}
            >
              {active && <span className="h-0.5 w-3 rounded-full" style={{ background: BENCH_COLORS[idx] }} />}
              {b.label}
            </button>
          );
        })}
        {benchmarks[0] !== settings.benchmark && (
          <button
            type="button"
            onClick={() => updateSettings({ benchmark: benchmarks[0] })}
            className="ml-1 text-xs text-accent hover:underline"
          >
            Définir {primary?.label} comme indice par défaut
          </button>
        )}
      </div>

      <Stagger className="grid gap-4 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-12 xl:grid-cols-6">
          <Kpi
            label="Performance"
            info="Rendement pondéré par le temps : neutralise vos versements et retraits. C'est la mesure utilisée par les fonds, comparable aux indices."
            loading={loading}
            value={<span className={trendClass(summary?.twr)}>{formatPercent(summary?.twr ?? null, { sign: true })}</span>}
            sub={
              summary?.annualizedTwr != null
                ? `TWR · ${formatPercent(summary.annualizedTwr, { sign: true })} / an`
                : `TWR ${RANGE_SUFFIX[range]}`
            }
          />
          <Kpi
            label="TRI (MWR)"
            info="Taux de rendement interne de vos flux : tient compte du moment et du montant de vos versements. C'est votre rendement personnel."
            loading={loading}
            value={<span className={trendClass(summary?.mwr)}>{formatPercent(summary?.mwr ?? null, { sign: true })}</span>}
            sub={summary && summary.years >= 1 ? "annualisé" : "sur la période"}
          />
          <Kpi
            label="Gain de la période"
            info="Variation de valeur hors apports et retraits, dividendes et intérêts inclus."
            loading={loading}
            value={<DeltaMoney value={summary?.pnl ?? 0} currency={base} />}
            sub={
              <>
                apports nets <Money value={summary?.netContributions ?? 0} currency={base} decimals={0} />
              </>
            }
          />
          <Kpi
            label="Volatilité"
            info="Écart-type annualisé des rendements quotidiens. Un ETF monde tourne autour de 12–18 %."
            loading={loading}
            value={formatPercent(risk?.volatility ?? null, { decimals: 1 })}
            sub={
              primary?.risk?.volatility != null
                ? `${primary.label} : ${formatPercent(primary.risk.volatility, { decimals: 1 })}`
                : undefined
            }
          />
          <Kpi
            label="Ratio de Sharpe"
            info={`Rendement annualisé au-delà du taux sans risque (${formatPercent(settings.riskFreeRate, { decimals: 1 })}), divisé par la volatilité. Au-dessus de 1 : très bon.`}
            loading={loading}
            value={formatNumber(risk?.sharpe ?? null, { decimals: 2 })}
            sub={`Sortino ${formatNumber(risk?.sortino ?? null, { decimals: 2 })}`}
          />
          <Kpi
            label="Perte maximale"
            info="Plus forte baisse d'un sommet à un creux sur la période (max drawdown)."
            loading={loading}
            value={<span className="text-loss">{formatPercent(risk?.maxDrawdown ?? null, { decimals: 1 })}</span>}
            sub={risk?.maxDrawdownTrough ? `au ${formatDate(risk.maxDrawdownTrough, "medium")}` : undefined}
          />
        </div>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Portefeuille vs indices"
            subtitle={`Performance cumulée ${RANGE_SUFFIX[range]} (base 0 %)`}
            icon={<ChartLine className="size-4" />}
            action={
              <div className="hidden flex-wrap justify-end gap-x-4 gap-y-1 text-xs sm:flex">
                {chartSeries.map((s) => {
                  const last = [...s.values].reverse().find((v) => v != null);
                  return (
                    <span key={s.id} className="flex items-center gap-1.5 text-muted">
                      <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                      {s.label}
                      <span className={cn("font-semibold tabular", trendClass(last))}>
                        {formatPercent(last ?? null, { sign: true, decimals: 1 })}
                      </span>
                    </span>
                  );
                })}
              </div>
            }
          />
          {loading ? (
            <Skeleton className="h-[320px] w-full rounded-2xl" />
          ) : chartSeries.length ? (
            <TimeSeriesChart
              x={days.map((d) => dayKeyToUTC(d))}
              series={chartSeries}
              height={320}
              animationKey={`${range}|${benchmarks.join(",")}`}
              formatValue={(v) => formatPercent(v, { sign: true })}
              formatAxis={(v) => formatPercent(v, { decimals: 0 })}
              formatX={(t) => formatDate(new Date(t).toISOString().slice(0, 10), "long")}
              formatXTick={(t) =>
                formatTick(
                  t,
                  range === "1mo" || range === "3mo" ? "short" : range === "6mo" || range === "ytd" || range === "1y" ? "medium" : "long",
                )
              }
              zeroLine
              ariaLabel="Performance cumulée du portefeuille comparée aux indices"
            />
          ) : (
            <EmptyState title="Historique insuffisant" description="Il faut au moins deux jours d'historique sur la période." />
          )}
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader
            title="Et si…"
            subtitle={`Mêmes versements, aux mêmes dates, dans ${primary?.label ?? "l'indice"}`}
            icon={<Wand2 className="size-4" />}
          />
          {loading || !whatIf ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <WhatIf portfolio={whatIf.portfolio} bench={whatIf.bench} diff={whatIf.diff} label={primary?.label ?? ""} currency={base} />
          )}
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader
            title="Rendements annuels"
            subtitle={`Portefeuille (TWR) comparé à ${primary?.label ?? "l'indice"}`}
            icon={<Trophy className="size-4" />}
          />
          {annual.length ? (
            <>
              <div className="mb-2 flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] bg-accent" /> Portefeuille
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: BENCH_COLORS[0] }} /> {primary?.label}
                </span>
              </div>
              <BarChart
                categories={annual.map((a) => String(a.year))}
                series={[
                  { id: "pf", label: "Portefeuille", color: "var(--accent)", values: annual.map((a) => a.ret) },
                  {
                    id: "bench",
                    label: primary?.label ?? "Indice",
                    color: BENCH_COLORS[0],
                    values: annual.map((a) => benchYears?.get(a.year) ?? null),
                  },
                ]}
                height={220}
                formatValue={(v) => formatPercent(v, { sign: true, decimals: 1 })}
                formatAxis={(v) => formatPercent(v, { decimals: 0 })}
                ariaLabel="Rendements annuels"
              />
              <p className="mt-2 text-[11px] text-subtle">
                L&apos;année en cours est partielle (depuis le 1er janvier ou depuis votre première opération).
              </p>
            </>
          ) : (
            <Skeleton className="h-56 w-full" />
          )}
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Rendements mensuels"
            subtitle="Performance de chaque mois (TWR). La dernière colonne compare l'année à l'indice."
            icon={<Activity className="size-4" />}
          />
          {years.length ? (
            <ReturnsHeatmap years={years} benchmarkYears={benchYears} benchmarkLabel={primary?.label} />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader title="Drawdown" subtitle="Écart par rapport au dernier plus haut (TWR)" icon={<TrendingDown className="size-4" />} />
          {pts.length > 2 ? (
            <TimeSeriesChart
              x={days.map((d) => dayKeyToUTC(d))}
              series={[
                { id: "dd", label: "Drawdown", values: drawdown, color: "var(--loss)", area: true, areaToZero: true, strokeWidth: 1.5 },
              ]}
              height={220}
              animationKey={`dd|${range}`}
              formatValue={(v) => formatPercent(v, { decimals: 1 })}
              formatAxis={(v) => formatPercent(v, { decimals: 0 })}
              formatX={(t) => formatDate(new Date(t).toISOString().slice(0, 10), "long")}
              formatXTick={(t) => formatTick(t, "medium")}
              ariaLabel="Drawdown du portefeuille"
            />
          ) : (
            <Skeleton className="h-52 w-full" />
          )}
          {risk?.maxDrawdownPeak && (
            <p className="mt-3 text-xs text-muted">
              Pire baisse : {formatPercent(risk.maxDrawdown, { decimals: 1 })} du {formatDate(risk.maxDrawdownPeak, "medium")} au{" "}
              {formatDate(risk.maxDrawdownTrough ?? null, "medium")}
              {risk.maxDrawdownRecovery ? `, effacée le ${formatDate(risk.maxDrawdownRecovery, "medium")}.` : ", pas encore effacée."}
            </p>
          )}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader
            title="Statistiques de risque"
            subtitle={`Portefeuille vs ${primary?.label ?? "indice"}`}
            icon={<Sigma className="size-4" />}
          />
          <RiskTable risk={risk} bench={primary?.risk ?? null} benchLabel={primary?.label ?? "Indice"} />
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Contribution par ligne"
            subtitle={`Gain de chaque position ${RANGE_SUFFIX[range]}, dividendes inclus`}
            action={<DeltaMoney value={contrib.reduce((s, c) => s + c.gain, 0)} currency={base} />}
          />
          <Contributions items={contrib} currency={base} meta={meta} positionsCount={snapshot.positions.length} />
        </Card>
      </Stagger>
    </>
  );
}

function Kpi({ label, info, value, sub, loading }: { label: string; info?: string; value: ReactNode; sub?: ReactNode; loading?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1 text-xs text-muted">
        <span className="truncate">{label}</span>
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <>
          <div className="mt-1.5 text-xl font-semibold tracking-tight tabular">{value}</div>
          {sub && <div className="mt-0.5 truncate text-xs text-subtle">{sub}</div>}
        </>
      )}
    </Card>
  );
}

function WhatIf({
  portfolio,
  bench,
  diff,
  label,
  currency,
}: {
  portfolio: number;
  bench: number;
  diff: number;
  label: string;
  currency: string;
}) {
  const max = Math.max(portfolio, bench, 1);
  const rows = [
    { name: "Votre portefeuille", value: portfolio, color: "var(--accent)" },
    { name: label, value: bench, color: "var(--chart-2)" },
  ];
  return (
    <div>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.name}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-muted">{r.name}</span>
              <span className="font-semibold tabular">
                <Money value={r.value} currency={currency} decimals={0} />
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full"
                style={{ background: r.color }}
                initial={{ width: 0 }}
                animate={{ width: `${(r.value / max) * 100}%` }}
                transition={{ type: "spring", stiffness: 90, damping: 18, delay: i * 0.1 }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className={cn("mt-5 rounded-2xl px-4 py-3 text-sm ring-1", diff >= 0 ? "bg-gain/10 ring-gain/20" : "bg-loss/10 ring-loss/20")}>
        {diff >= 0 ? "Vos choix ont battu " : "Un placement passif dans "}
        <span className="font-semibold">{label}</span>
        {diff >= 0 ? " de " : " aurait rapporté "}
        <span className={cn("font-semibold sensitive", diff >= 0 ? "text-gain" : "text-loss")}>
          {formatMoney(Math.abs(diff), currency, { decimals: 0 })}
        </span>
        {diff >= 0 ? "." : " de plus."}
      </div>
      <p className="mt-2 text-[11px] text-subtle">Votre valeur inclut les dividendes perçus. Simulation hors frais et fiscalité.</p>
    </div>
  );
}

function RiskTable({ risk, bench, benchLabel }: { risk: RiskMetrics | null; bench: RiskMetrics | null; benchLabel: string }) {
  if (!risk) return <Skeleton className="h-56 w-full" />;
  const pct = (v: number | null | undefined, d = 1) => formatPercent(v ?? null, { decimals: d });
  const num = (v: number | null | undefined) => formatNumber(v ?? null, { decimals: 2 });
  const rows: { label: string; info?: string; pf: string; bm?: string }[] = [
    { label: "Volatilité annualisée", pf: pct(risk.volatility), bm: pct(bench?.volatility) },
    { label: "Ratio de Sharpe", pf: num(risk.sharpe), bm: num(bench?.sharpe) },
    {
      label: "Ratio de Sortino",
      info: "Comme Sharpe, mais ne pénalise que la volatilité à la baisse.",
      pf: num(risk.sortino),
      bm: num(bench?.sortino),
    },
    { label: "Perte maximale", pf: pct(risk.maxDrawdown), bm: pct(bench?.maxDrawdown) },
    { label: "Drawdown actuel", pf: pct(risk.currentDrawdown), bm: pct(bench?.currentDrawdown) },
    { label: "Bêta", info: "Sensibilité aux mouvements de l'indice : 1 = même amplitude.", pf: num(risk.beta) },
    { label: "Alpha (annualisé)", info: "Surperformance ajustée du risque (Jensen).", pf: pct(risk.alpha) },
    { label: "Corrélation", pf: num(risk.correlation) },
    { label: "Tracking error", info: "Volatilité de l'écart de performance avec l'indice.", pf: pct(risk.trackingError) },
    { label: "Ratio d'information", pf: num(risk.informationRatio) },
    { label: "Jours positifs", pf: pct(risk.positiveDays, 0), bm: pct(bench?.positiveDays, 0) },
    {
      label: "Meilleur jour",
      pf: risk.bestDay ? `${formatPercent(risk.bestDay.ret, { sign: true })}` : "—",
      bm: bench?.bestDay ? formatPercent(bench.bestDay.ret, { sign: true }) : undefined,
    },
    {
      label: "Pire jour",
      pf: risk.worstDay ? `${formatPercent(risk.worstDay.ret, { sign: true })}` : "—",
      bm: bench?.worstDay ? formatPercent(bench.worstDay.ret, { sign: true }) : undefined,
    },
  ];
  return (
    <table className="w-full text-sm tabular">
      <thead>
        <tr className="text-xs text-subtle">
          <th className="pb-2 text-left font-medium" />
          <th className="pb-2 text-right font-medium">Portefeuille</th>
          <th className="pb-2 text-right font-medium">{benchLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-border">
            <td className="py-2 text-muted">
              <span className="inline-flex items-center gap-1">
                {r.label}
                {r.info && <InfoTip>{r.info}</InfoTip>}
              </span>
            </td>
            <td className="py-2 text-right font-medium">{r.pf}</td>
            <td className="py-2 text-right text-muted">{r.bm ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Contributions({
  items,
  currency,
  meta,
  positionsCount,
}: {
  items: ReturnType<typeof contributions>;
  currency: string;
  meta: ReturnType<typeof usePortfolio>["meta"];
  positionsCount: number;
}) {
  if (!items.length)
    return (
      <EmptyState
        title="Aucune contribution"
        description={positionsCount ? "Pas de variation sur la période." : "Ajoutez des positions."}
      />
    );
  const max = Math.max(...items.map((i) => Math.abs(i.gain)), 1);
  return (
    <ul className="gap-x-8 md:columns-2">
      {items.map((c, i) => {
        const m = meta(c.symbol);
        const w = (Math.abs(c.gain) / max) * 50;
        return (
          <motion.li
            key={c.symbol}
            className="break-inside-avoid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(i * 0.02, 0.4) }}
          >
            <Link
              href={`/stock/${encodeURIComponent(c.symbol)}`}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2"
            >
              <AssetLogo symbol={c.symbol} name={m.name} logoUrl={m.logoUrl} type={m.type} size={24} />
              <span className="w-32 shrink-0 truncate text-sm">{m.name}</span>
              <div className="relative h-2 flex-1">
                <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                <motion.div
                  className={cn("absolute inset-y-0 rounded-full", c.gain >= 0 ? "left-1/2 bg-gain" : "right-1/2 bg-loss")}
                  initial={{ width: 0 }}
                  animate={{ width: `${w}%` }}
                  transition={{ type: "spring", stiffness: 110, damping: 20, delay: Math.min(i * 0.02, 0.4) }}
                />
              </div>
              <span className={cn("w-24 shrink-0 text-right text-sm font-medium tabular sensitive", trendClass(c.gain))}>
                {formatMoney(c.gain, currency, { sign: true, decimals: 0 })}
              </span>
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}

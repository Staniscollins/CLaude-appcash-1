"use client";

import { Coins, Gauge, PiggyBank, Scale, Sparkles, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { Card, CardHeader } from "@/components/ui/card";
import { DeltaPercent, trendClass } from "@/components/ui/delta";
import { AnimatedMoney, Money } from "@/components/ui/money";
import { InfoTip, Skeleton } from "@/components/ui/primitives";
import { addYears } from "@/lib/dates";
import { formatPercent } from "@/lib/format";
import { forecastDividends } from "@/lib/portfolio/dividends";
import { dividendNetBase } from "@/lib/portfolio/engine";
import { slicePeriod, summarizePeriod } from "@/lib/portfolio/metrics";
import { cn } from "@/lib/utils";

function Row({
  icon,
  label,
  info,
  value,
  sub,
  loading,
  index,
}: {
  icon: ReactNode;
  label: string;
  info?: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  loading?: boolean;
  index: number;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * index, type: "spring", stiffness: 300, damping: 30 }}
      className="flex items-center gap-3 border-t border-border py-3.5 first:border-t-0 first:pt-1"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted ring-1 ring-border [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[13px] text-muted">
          <span className="truncate">{label}</span>
          {info && <InfoTip>{info}</InfoTip>}
        </div>
        {sub && <div className="mt-0.5 truncate text-xs text-subtle">{sub}</div>}
      </div>
      <div className="shrink-0 text-right text-[17px] font-semibold tracking-tight">
        {loading ? <Skeleton className="h-5 w-24" /> : value}
      </div>
    </motion.li>
  );
}

export function KpiTiles({ className }: { className?: string }) {
  const { snapshot, daily, settings, tables, today, hydrated, quotesReady, historyReady } = usePortfolio();
  const t = snapshot.totals;
  const base = settings.baseCurrency;
  const loading = !hydrated || !quotesReady;

  const lifetime = useMemo(() => summarizePeriod(slicePeriod(daily, null)), [daily]);
  const dividends12m = useMemo(() => {
    const from = addYears(today, -1);
    return snapshot.dividendTransactions.filter((d) => d.date > from).reduce((s, d) => s + dividendNetBase(d, tables), 0);
  }, [snapshot.dividendTransactions, today, tables]);
  const forecast = useMemo(() => forecastDividends(snapshot.positions, tables, today), [snapshot.positions, tables, today]);
  const annualized = lifetime?.annualizedTwr ?? lifetime?.twr ?? null;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Indicateurs clés"
        subtitle="Depuis votre première opération"
        icon={<Gauge className="size-4" />}
        className="mb-2"
      />
      <ul className="flex flex-1 flex-col justify-between">
        <Row
          index={0}
          icon={<TrendingUp />}
          label="Plus-values latentes"
          loading={loading}
          info="Valeur actuelle des positions moins leur prix de revient (PRU × quantité, frais inclus)."
          sub={<DeltaPercent value={t.unrealizedPct} className="text-xs" />}
          value={
            <span className={trendClass(t.unrealized)}>
              <AnimatedMoney value={t.unrealized} currency={base} sign decimals={0} />
            </span>
          }
        />
        <Row
          index={1}
          icon={<Sparkles />}
          label="Gain total"
          loading={loading}
          info="Plus-values latentes + plus-values réalisées + dividendes et intérêts, moins les frais de tenue de compte."
          sub={
            <>
              réalisé <Money value={t.realized} currency={base} decimals={0} sign /> · dividendes{" "}
              <Money value={t.dividends} currency={base} decimals={0} />
            </>
          }
          value={
            <span className={trendClass(t.totalReturn)}>
              <AnimatedMoney value={t.totalReturn} currency={base} sign decimals={0} />
            </span>
          }
        />
        <Row
          index={2}
          icon={<Scale />}
          label={lifetime?.annualizedTwr != null ? "Rendement annualisé" : "Rendement (TWR)"}
          loading={loading || !historyReady}
          info="Rendement pondéré par le temps (TWR) : il neutralise l'effet de vos versements et retraits, comme pour un fonds. Le TRI (pondéré par les capitaux) mesure votre rendement personnel, timing des versements compris."
          sub={<>TRI {formatPercent(lifetime?.mwr ?? null, { sign: true })}</>}
          value={<span className={trendClass(annualized)}>{formatPercent(annualized, { sign: true })}</span>}
        />
        <Row
          index={3}
          icon={<Coins />}
          label="Dividendes 12 mois"
          loading={loading}
          info="Dividendes nets perçus sur 12 mois glissants (saisis ou détectés automatiquement). La prévision utilise le dividende annoncé, à défaut celui des 12 derniers mois."
          sub={
            <>
              prévision <Money value={forecast.annualTotal} currency={base} decimals={0} /> / an
            </>
          }
          value={<AnimatedMoney value={dividends12m} currency={base} decimals={0} />}
        />
        <Row
          index={4}
          icon={<PiggyBank />}
          label="Capital investi"
          loading={loading}
          info="Apports nets : dépôts moins retraits pour les comptes suivis en espèces, achats moins ventes sinon."
          sub={
            t.cash !== 0 ? (
              <>
                dont liquidités <Money value={t.cash} currency={base} decimals={0} />
              </>
            ) : (
              <>{snapshot.positions.length} positions ouvertes</>
            )
          }
          value={<AnimatedMoney value={t.netContributions} currency={base} decimals={0} />}
        />
      </ul>
    </Card>
  );
}

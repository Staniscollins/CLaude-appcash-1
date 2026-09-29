"use client";

import { ChartPie as PieIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Donut } from "@/components/charts/donut";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { Card, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { formatPercent } from "@/lib/format";
import { computeAllocation, foldSlices, type AllocationDimension } from "@/lib/portfolio/allocation";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];
const OTHER_COLOR = "var(--chart-muted)";

export function useAllocation(dimension: AllocationDimension, max = 6) {
  const { snapshot, tables, accounts } = usePortfolio();
  return useMemo(() => {
    const slices = computeAllocation(dimension, snapshot.positions, {
      cash: snapshot.totals.cash,
      lots: snapshot.lots,
      tables,
      accounts,
      cashByAccount: Object.fromEntries(snapshot.trackedAccounts.map((id) => [id, snapshot.cashByAccount[id] ?? 0])),
    });
    const folded = foldSlices(slices, max);
    return {
      all: slices,
      folded: folded.map((s, i) => ({
        ...s,
        color: s.key === "__other" ? OTHER_COLOR : (s.color ?? CHART_COLORS[i % CHART_COLORS.length]),
      })),
    };
  }, [dimension, snapshot, tables, accounts, max]);
}

export function AllocationCard({ className, dimensions }: { className?: string; dimensions?: AllocationDimension[] }) {
  const { settings, hydrated, quotesReady, snapshot } = usePortfolio();
  const dims = dimensions ?? (["asset", "sector", "region", "type", "account"] as AllocationDimension[]);
  const [dimension, setDimension] = useState<AllocationDimension>(dims[0]);
  const [active, setActive] = useState<string | null>(null);
  const { folded } = useAllocation(dimension);
  const activeSlice = folded.find((s) => s.key === active);
  const total = folded.reduce((s, x) => s + x.value, 0);
  const labels: Record<AllocationDimension, string> = {
    asset: "Actifs",
    sector: "Secteurs",
    region: "Pays",
    type: "Classes",
    currency: "Devises",
    account: "Comptes",
  };

  return (
    <Card className={className}>
      <CardHeader
        title="Répartition"
        subtitle={
          dimension === "sector" ? "ETF décomposés par secteur quand la donnée existe" : "Part de chaque ligne dans la valeur totale"
        }
        icon={<PieIcon className="size-4" />}
      />
      <Segmented
        ariaLabel="Dimension"
        value={dimension}
        onChange={(d) => {
          setDimension(d);
          setActive(null);
        }}
        options={dims.map((d) => ({ value: d, label: labels[d] }))}
        className="mb-5 max-w-full overflow-x-auto scrollbar-none"
      />
      {!hydrated || !quotesReady ? (
        <div className="flex items-center gap-6">
          <Skeleton className="size-44 rounded-full" />
          <div className="flex-1 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ) : !snapshot.positions.length ? (
        <EmptyState title="Aucune position" description="Ajoutez un achat pour voir la répartition." />
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <Donut
            slices={folded.map((s) => ({ key: s.key, label: s.label, value: s.value, color: s.color }))}
            size={176}
            thickness={20}
            activeKey={active}
            onActiveChange={setActive}
            center={
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlice?.key ?? "total"}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.14 }}
                  className="max-w-[112px]"
                >
                  <div className="truncate text-[11px] text-muted">{activeSlice ? activeSlice.label : "Total"}</div>
                  <div className="text-lg font-semibold tracking-tight">
                    {activeSlice ? (
                      formatPercent(activeSlice.weight, { decimals: 1 })
                    ) : (
                      <Money value={total} currency={settings.baseCurrency} compact />
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            }
          />
          <ul className="w-full min-w-0 flex-1 space-y-1">
            {folded.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onPointerEnter={() => setActive(s.key)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(s.key)}
                  onBlur={() => setActive(null)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition",
                    active === s.key ? "bg-surface-2" : "hover:bg-surface-2/60",
                    active && active !== s.key && "opacity-50",
                  )}
                >
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate text-fg">{s.label}</span>
                  <Money value={s.value} currency={settings.baseCurrency} compact className="hidden text-xs text-muted tabular sm:inline" />
                  <span className="w-12 text-right font-medium tabular">{formatPercent(s.weight, { decimals: 1 })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

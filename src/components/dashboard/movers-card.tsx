"use client";

import { Activity } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Card, CardHeader } from "@/components/ui/card";
import { DeltaMoney, DeltaPercent } from "@/components/ui/delta";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import type { Position } from "@/lib/portfolio/engine";

function Row({ p, currency, i }: { p: Position; currency: string; i: number }) {
  return (
    <motion.li initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
      <Link
        href={`/stock/${encodeURIComponent(p.symbol)}`}
        className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2"
      >
        <AssetLogo symbol={p.symbol} name={p.name} logoUrl={p.meta.logoUrl} type={p.type} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{p.name}</div>
          <DeltaMoney value={p.dayChange} currency={currency} className="text-xs" />
        </div>
        <DeltaPercent value={p.changePercent} className="text-sm" />
      </Link>
    </motion.li>
  );
}

/** Best and worst lines of the day, plus the up/down breadth. */
export function MoversCard({ className }: { className?: string }) {
  const { snapshot, settings, hydrated, quotesReady } = usePortfolio();
  const sorted = [...snapshot.positions].sort((a, b) => b.changePercent - a.changePercent);
  const up = sorted.filter((p) => p.changePercent > 0);
  const down = sorted.filter((p) => p.changePercent < 0).reverse();
  const flat = sorted.length - up.length - down.length;
  const loading = !hydrated || !quotesReady;

  return (
    <Card className={className}>
      <CardHeader title="Mouvements du jour" subtitle="Vos lignes qui bougent le plus" icon={<Activity className="size-4" />} />
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !sorted.length ? (
        <EmptyState title="Rien à signaler" description="Vos positions apparaîtront ici." />
      ) : (
        <>
          <div className="mb-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full bg-gain"
                initial={{ width: 0 }}
                animate={{ width: `${(up.length / sorted.length) * 100}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
              <div className="h-full bg-surface-3" style={{ width: `${(flat / sorted.length) * 100}%` }} />
              <motion.div
                className="ml-auto h-full bg-loss"
                initial={{ width: 0 }}
                animate={{ width: `${(down.length / sorted.length) * 100}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>▲ {up.length} en hausse</span>
              <span>{down.length} en baisse ▼</span>
            </div>
          </div>
          <ul className="space-y-0.5">
            {up.slice(0, 3).map((p, i) => (
              <Row key={p.symbol} p={p} currency={settings.baseCurrency} i={i} />
            ))}
          </ul>
          {down.length > 0 && <div className="my-2 h-px bg-border" />}
          <ul className="space-y-0.5">
            {down.slice(0, 3).map((p, i) => (
              <Row key={p.symbol} p={p} currency={settings.baseCurrency} i={i + 3} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
